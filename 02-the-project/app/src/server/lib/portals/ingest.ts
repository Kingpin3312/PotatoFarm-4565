import { log } from "@/lib/log";
import { crossTenant, forOrg } from "@/server/db/client";
import { Prisma } from "@prisma/client";
import type { RawEnquiry, PortalKey } from "./types";
import { normalisePhone, normaliseEmail, normaliseLanguage, isProxyNumber } from "./normalise";
import { entryStageId } from "@/server/lib/pipeline/defaults";

const SOURCE: Record<PortalKey, Prisma.LeadCreateInput["source"]> = {
  PROPERTY_FINDER: "PROPERTY_FINDER",
  BAYUT: "BAYUT",
  DUBIZZLE: "DUBIZZLE",
  WEBSITE_FORM: "WEBSITE",
  META_LEAD_ADS: "META_LEAD_ADS",
};

/**
 * One enquiry, from any portal, into the system.
 *
 * The behaviour that matters commercially: **the same person enquiring on
 * three properties across two portals in one afternoon is one lead with
 * three enquiries.** Get that wrong and an agent rings them three times,
 * which is the single fastest way for a brokerage to look disorganised to
 * a buyer holding two and a half million dirhams.
 */
export async function ingestEnquiry(
  orgId: string,
  channelId: string,
  portal: PortalKey,
  raw: RawEnquiry
) {
  const db = forOrg(orgId);

  const phone = normalisePhone(raw.phone);
  const email = normaliseEmail(raw.email);

  // No phone and no email is not a lead, it is noise. Recorded so the
  // portal's delivery quality is measurable, but it creates nothing.
  if (!phone && !email) {
    log.warn(`[portals] ${portal} enquiry ${raw.externalId} had no contact details`);
    return { created: false, reason: "no_contact" as const };
  }

  return db.$transaction(async (tx) => {
    // Idempotency. Portals resend, and a retry must not become a second
    // enquiry on the board.
    const seen = await tx.enquiry.findFirst({
      where: { orgId, externalId: raw.externalId },
      select: { id: true },
    });
    if (seen) return { created: false, reason: "duplicate" as const };

    const listing = raw.listingRef
      ? await tx.listing.findFirst({
          where: { orgId, reference: raw.listingRef },
          select: { id: true },
        })
      : null;

    // Match on phone first — it is the identity in a WhatsApp product.
    // Fall back to email only when there is no phone at all.
    const existing = phone
      ? await tx.lead.findUnique({ where: { orgId_phone: { orgId, phone } } })
      : await tx.lead.findFirst({ where: { orgId, email, deletedAt: null } });

    // Resolved before the branch rather than inside the `data` object:
    // an `await` spread into a Prisma `create` defeats its `Exact` type
    // and the error it produces names thirty unrelated fields.
    const newStageId = existing ? null : await entryStageId(tx, orgId, "NEW");

    const lead = existing
      ? await tx.lead.update({
          where: { id: existing.id },
          data: {
            // Fill gaps, never overwrite. An agent may have corrected the
            // name; the portal's version is not more authoritative.
            name: existing.name ?? raw.name,
            email: existing.email ?? email,
            language: existing.language ?? normaliseLanguage(raw.language),
          },
        })
      : await tx.lead.create({
          data: {
            orgId,
            // See ingest.ts — a lead with no stage is one the pipeline
            // board cannot show, whatever else is right about it.
            ...(newStageId ? { stageId: newStageId } : {}),
            phone: phone ?? `pending:${raw.externalId}`,
            name: raw.name,
            email,
            language: normaliseLanguage(raw.language),
            source: SOURCE[portal],
            status: "NEW",
            notes: phone && isProxyNumber(phone)
              // Flagged rather than silently trusted. A masked number
              // expires, and a lead you cannot reach in a week is worse
              // than one you knew to ask about on day one.
              ? "Portal supplied a masked number — get a direct one before it expires."
              : undefined,
          },
        });

    await tx.enquiry.create({
      data: {
        orgId,
        leadId: lead.id,
        listingId: listing?.id,
        channelId,
        externalId: raw.externalId,
        message: raw.message,
        createdAt: raw.receivedAt,
      },
    });

    return {
      created: !existing,
      leadId: lead.id,
      isReturning: Boolean(existing),
      reason: "ok" as const,
    };
  });
}

/**
 * Records that a channel produced something. The health check below reads
 * this, and it is the difference between noticing a dead feed in an hour
 * and noticing it when a customer asks why their leads stopped.
 */
export async function markChannelHealthy(channelId: string) {
  await crossTenant("global-key").channel.update({
    where: { id: channelId },
    data: { lastSyncAt: new Date(), lastError: null },
  });
}
