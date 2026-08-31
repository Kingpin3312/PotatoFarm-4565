import { crossTenant } from "@/server/db/client";
import { readSecret } from "@/server/lib/secrets";
import { validateForPublish, blocking, PORTAL_REQUIREMENTS } from "@/server/lib/feeds/validate";
import { log } from "@/lib/log";
import {
  publisherFor, dueForRetry, MAX_ATTEMPTS, OFF_MARKET,
  type ListingPayload, type PublishOutcome,
} from "./publish";
import type { PortalKey } from "./types";

/**
 * The thing that moves a publication off PENDING.
 *
 * `listings.publish` has always written `state: "PENDING"`, and until
 * this file nothing read it. Every listing a brokerage published sat in
 * that state permanently while the screen rendered it as *pending*,
 * which an agent reads as "on its way".
 *
 * ## Why the gate runs again here
 *
 * `listings.publish` calls `checkPublish` before queueing, so a listing
 * with no Trakheesi permit never reaches the queue. It is re-validated
 * anyway, against the same `validateForPublish`, because the two events
 * are not simultaneous: a permit valid when an agent pressed publish can
 * be expired by the time the queue drains, and advertising on an expired
 * permit is the brokerage's problem, not the portal's.
 *
 * One gate, called twice — not two gates. A second copy of these rules
 * is how the button and the sender come to disagree.
 */

/** Publications that are due, oldest first, across every brokerage. */
async function due(now: Date, limit: number) {
  const rows = await crossTenant("sweep").listingPublication.findMany({
    where: { state: { in: ["PENDING", "FAILED", "NOT_CONNECTED"] } },
    orderBy: { lastTriedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: {
      id: true, orgId: true, listingId: true, channelId: true,
      state: true, attempts: true, lastTriedAt: true,
    },
  });
  // The backoff decision is pure and lives in `publish.ts`, so it can be
  // tested without a database and cannot drift between here and there.
  return rows.filter((r) => dueForRetry(r, now));
}

function payloadFrom(listing: {
  reference: string; title: string; purpose: string; priceFils: bigint | null;
  community: string | null; building: string | null; bedrooms: number | null;
  bathrooms: number | null; areaSqft: number | null; permitNumber: string | null;
  permitExpiresAt: Date | null; reraBrokerCard: string | null; descriptions: unknown;
}): ListingPayload {
  const d = (listing.descriptions ?? {}) as { photos?: string[]; en?: string };
  return {
    reference: listing.reference,
    title: listing.title,
    description: d.en ?? null,
    purpose: listing.purpose === "RENT" ? "RENT" : "SALE",
    priceFils: listing.priceFils,
    community: listing.community,
    building: listing.building,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    areaSqft: listing.areaSqft,
    permitNumber: listing.permitNumber,
    permitExpiresAt: listing.permitExpiresAt,
    reraBrokerCard: listing.reraBrokerCard,
    photos: d.photos ?? [],
  };
}

type Result = { published: number; rejected: number; failed: number; unconfigured: number;
                withdrawn: number; stillLive: number };

/**
 * Drain the queue once.
 *
 * Returns counts rather than throwing on an individual failure: one
 * brokerage's bad listing must not stop every other brokerage's from
 * going live, which is the same rule the job runner learned the hard
 * way. A transport failure is recorded against the row and retried; a
 * rejection is recorded and left for a person.
 */
export async function drainPublishQueue(limit = 200): Promise<Result> {
  const now = new Date();
  const rows = await due(now, limit);
  const out: Result = { published: 0, rejected: 0, failed: 0, unconfigured: 0,
                        withdrawn: 0, stillLive: 0 };

  for (const row of rows) {
    try {
      const listing = await crossTenant("sweep").listing.findFirst({
        where: { id: row.listingId, deletedAt: null },
      });
      const channel = await crossTenant("sweep").channel.findUnique({
        where: { id: row.channelId },
        select: { id: true, type: true, label: true, secretRef: true },
      });

      if (!listing || !channel) {
        // The listing was deleted or the channel disconnected while this
        // sat in the queue. Not a failure to retry — there is nothing to
        // publish and nowhere to publish it.
        await mark(row.id, {
          state: "WITHDRAWN",
          rejection: "The listing or the portal connection no longer exists.",
        });
        continue;
      }

      /* ---- the gate, re-run against the state of the world now ---- */
      const rules = PORTAL_REQUIREMENTS[channel.type as keyof typeof PORTAL_REQUIREMENTS]
        ?? PORTAL_REQUIREMENTS.WEBSITE_FORM;
      const photos = ((listing.descriptions ?? {}) as { photos?: string[] }).photos?.length ?? 0;
      const problems = validateForPublish(listing as never, rules, photos);
      const blockers = blocking(problems);
      if (blockers.length) {
        out.rejected += 1;
        await mark(row.id, {
          state: "REJECTED",
          // The portal never saw this. Saying which rule stopped it is
          // the difference between a fixable message and "rejected".
          rejection: blockers.map((p) => p.message).join("; "),
        });
        continue;
      }

      /* ---- the integration, or the honest absence of one ---- */
      const publisher = publisherFor(channel.type as PortalKey);
      if (!publisher) {
        out.unconfigured += 1;
        /**
         * NOT_CONNECTED, and **`attempts` is deliberately not
         * incremented.**
         *
         * This row has not been tried — there was nothing to try it
         * against. Counting it as an attempt spends the retry budget on
         * the one condition that time cannot fix, and after six sweeps
         * `dueForRetry` would drop the listing for good. The portal
         * agreement is signed weeks later, the adapter is registered,
         * and every listing queued in the meantime sits silently past
         * its ceiling. `lastTriedAt` is left alone for the same reason:
         * it is the backoff clock, and there is no backoff here.
         */
        await mark(row.id, {
          state: "NOT_CONNECTED",
          rejection:
            `${channel.label} is not connected yet, so this listing is NOT ` +
            `advertised there. It stays queued and will be sent automatically ` +
            `once the portal is connected — that is a commercial agreement, ` +
            `not a setting.`,
        });
        continue;
      }

      const credentials: Record<string, string> = channel.secretRef
        ? { token: await readSecret(channel.secretRef) }
        : {};

      const outcome: PublishOutcome = await publisher.publish(payloadFrom(listing), credentials);

      if (outcome.ok) {
        out.published += 1;
        await mark(row.id, {
          state: "PUBLISHED",
          externalId: outcome.externalId,
          publishedAt: now,
          lastTriedAt: now,
          attempts: row.attempts + 1,
          rejection: null,
        });
      } else {
        // The portal decided. Retrying the same payload will get the
        // same answer, so this stops here and waits for a person.
        out.rejected += 1;
        await mark(row.id, {
          state: "REJECTED",
          rejection: outcome.rejected,
          lastTriedAt: now,
          attempts: row.attempts + 1,
        });
      }
    } catch (err) {
      /**
       * Transport failure. Nobody decided anything, so this is retried —
       * and it is caught per row so one portal timing out does not stop
       * every other brokerage's listings going live.
       */
      out.failed += 1;
      const attempts = row.attempts + 1;
      await mark(row.id, {
        state: "FAILED",
        attempts,
        lastTriedAt: now,
        rejection: attempts >= MAX_ATTEMPTS
          ? `Gave up after ${attempts} attempts: ${String(err).slice(0, 200)}. This needs a person.`
          : String(err).slice(0, 300),
      });
      log.warn("publish attempt failed", { orgId: row.orgId },
               { publicationId: row.id, attempts });
    }
  }

  await withdrawOffMarket(out, now, limit);

  return out;
}


/**
 * Pull advertisements for properties that are no longer for sale.
 *
 * The intent is read from `Listing.status`, not from a flag beside the
 * publication — see `needsWithdrawal`. A brokerage marks a unit SOLD on
 * the listing screen and means it everywhere; asking them to also
 * remember a second control is how a sold villa stays on Bayut.
 */
async function withdrawOffMarket(out: Result, now: Date, limit: number) {
  const rows = await crossTenant("sweep").listingPublication.findMany({
    where: {
      state: "PUBLISHED",
      listing: { status: { in: [...OFF_MARKET] } },
    },
    take: limit,
    select: {
      id: true, orgId: true, channelId: true, externalId: true,
      listing: { select: { reference: true, status: true } },
    },
  });

  for (const row of rows) {
    try {
      const channel = await crossTenant("sweep").channel.findUnique({
        where: { id: row.channelId },
        select: { type: true, label: true, secretRef: true },
      });
      const publisher = channel ? publisherFor(channel.type as PortalKey) : null;

      /**
       * No integration, or one that cannot pull a listing.
       *
       * The row stays PUBLISHED, because it is: the advertisement is
       * still live and saying otherwise would be a comfortable lie on
       * the one screen an agent checks. What changes is that it now
       * carries the reason, which the listings screen shows on the
       * publication chip.
       */
      if (!publisher?.withdraw) {
        out.stillLive += 1;
        await mark(row.id, {
          rejection:
            `${row.listing.reference} is ${row.listing.status.toLowerCase()} but is STILL ` +
            `ADVERTISED on ${channel?.label ?? "this portal"}. ` +
            `Remove it there by hand — no integration here can pull it.`,
        });
        log.warn("off-market listing still advertised", { orgId: row.orgId },
                 { publicationId: row.id, reference: row.listing.reference });
        continue;
      }

      const credentials: Record<string, string> = channel?.secretRef
        ? { token: await readSecret(channel.secretRef) }
        : {};

      await publisher.withdraw(row.externalId ?? "", credentials);

      out.withdrawn += 1;
      await mark(row.id, {
        state: "WITHDRAWN",
        lastTriedAt: now,
        // `externalId` is kept deliberately. It is the record of what was
        // advertised where, and an owner disputing when their property
        // came down is a conversation that needs it.
        rejection: null,
      });
    } catch (err) {
      // Still live, and still to be retried on the next drain. Not
      // counted as withdrawn, because it is not.
      out.stillLive += 1;
      await mark(row.id, {
        rejection: `Could not withdraw: ${String(err).slice(0, 200)}. It is still advertised.`,
      });
    }
  }
}

async function mark(id: string, data: Record<string, unknown>) {
  await crossTenant("sweep").listingPublication.update({ where: { id }, data });
}
