import type { PortalKey } from "./types";

/**
 * Sending a listing **out** to a portal.
 *
 * Everything in this folder until now pointed inward: `types.ts`,
 * `ingest.ts` and the adapters receive enquiries. Nothing sent a listing
 * anywhere. `listings.publish` set `ListingPublication.state = "PENDING"`
 * and **no code path ever moved it off PENDING** — no job, no adapter
 * method, nothing. The publish button queued into a void, and the
 * listings screen rendered the resulting row as "pending" for ever,
 * which reads as *in progress* rather than *nothing will ever happen*.
 *
 * For a Dubai brokerage that is not a missing feature, it is the
 * product: a listing nobody can see on Property Finder, Bayut or
 * Dubizzle is not a listing.
 *
 * ## What this file is and is not
 *
 * It is the structure: the interface a portal integration implements,
 * the registry that holds them, the retry policy, and the decision about
 * what happens when a portal has no integration.
 *
 * It is **not** a working Bayut or Property Finder integration, and it
 * does not pretend to be. Those need a partner agreement and a wire
 * format that comes with it — `property-finder.ts` says the same thing
 * about the inbound direction. When the contract arrives, one file
 * implements `Publisher` and registers it; nothing else in this system
 * changes.
 *
 * ## The decision that matters: no publisher configured
 *
 * The tempting shape is to leave the row PENDING, which is what happens
 * today. That is the worst option, because PENDING is indistinguishable
 * from "queued and on its way".
 *
 * The second most tempting is to mark it PUBLISHED so the screen looks
 * finished. That is worse still, and it is the same mistake as a
 * sanctions `CLEAR` nobody produced (`aml/screen.ts`): it tells a
 * brokerage their property is advertised when it is not, and they find
 * out from the silence.
 *
 * So an unpublishable listing is marked `FAILED` with a rejection that
 * names the reason. The listings screen already renders that state, and
 * it is retried — because "no integration" stops being true the day one
 * is registered.
 */

/** What a portal is given. Deliberately flat: no Prisma types cross this boundary. */
export type ListingPayload = {
  reference: string;
  title: string;
  description: string | null;
  purpose: "SALE" | "RENT";
  priceFils: bigint | null;
  community: string | null;
  building: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number | null;
  /** Trakheesi. Every UAE portal refuses a listing without a valid one. */
  permitNumber: string | null;
  permitExpiresAt: Date | null;
  reraBrokerCard: string | null;
  photos: string[];
};

/**
 * Three outcomes, and the distinction is the whole retry policy.
 *
 *   - `ok`        the portal accepted it and gave us an id
 *   - `rejected`  the portal looked at it and said no. A person has to
 *                 change something; retrying the same payload is rude to
 *                 the portal and useless to us
 *   - a thrown error is a *transport* failure — timeout, 500, network.
 *     Nobody decided anything, so it is retried with backoff
 *
 * Collapsing rejection and transport failure into one is how a listing
 * with a bad permit gets retried three hundred times, and how a portal
 * outage silently ends up presented to an agent as "your listing was
 * refused".
 */
export type PublishOutcome =
  | { ok: true; externalId: string }
  | { ok: false; rejected: string };

export type Publisher = {
  key: PortalKey;
  label: string;
  publish(listing: ListingPayload, credentials: Record<string, string>): Promise<PublishOutcome>;
  /**
   * Pull a live listing. Optional only because not every portal offers
   * it; where it exists it must be wired, because a sold property still
   * advertised is a complaint from the buyer who calls about it and a
   * RERA problem for the brokerage.
   */
  withdraw?(externalId: string, credentials: Record<string, string>): Promise<void>;
};

/**
 * Registered at startup by whatever holds the partner credentials.
 *
 * Module-level, like the screening provider, and for the same reason:
 * this is static configuration set once during boot, not per-request
 * state, so a cold start re-registering it is correct rather than a
 * missed cache.
 */
const publishers = new Map<PortalKey, Publisher>();

export function registerPublisher(p: Publisher): void {
  publishers.set(p.key, p);
}

export function publisherFor(key: PortalKey): Publisher | null {
  return publishers.get(key) ?? null;
}

/** Read by the preflight check and by the queue. */
export function publishingConfigured(): PortalKey[] {
  return [...publishers.keys()];
}

/**
 * Statuses that mean the advertisement must come down.
 *
 * A sold property still live on Bayut is not an untidy record. It is the
 * buyer who rings about a unit that went last month, the owner asking
 * why their sold villa is still being marketed, and — because a Dubai
 * advertisement carries a Trakheesi permit — a listing the brokerage is
 * still formally advertising after it had the right to.
 */
export const OFF_MARKET = ["SOLD", "LET", "WITHDRAWN"] as const;

/**
 * Should this publication be pulled?
 *
 * **Derived from the listing's own status rather than stored beside it.**
 * A separate "please withdraw" flag is a second source of truth that
 * drifts the moment somebody changes a status without setting it — the
 * same argument the `timespan` generated column makes in the schema. A
 * listing that is sold is off-market whether or not anybody remembered
 * to tick anything.
 */
export function needsWithdrawal(
  publication: { state: string },
  listingStatus: string,
): boolean {
  return publication.state === "PUBLISHED"
    && (OFF_MARKET as readonly string[]).includes(listingStatus);
}

/**
 * How long to wait before trying again, in minutes.
 *
 * Exponential with a ceiling. A portal having a bad hour should not cost
 * a brokerage a day of visibility, and a portal having a bad week should
 * not cost us a request every ten minutes for a week.
 */
export function backoffMinutes(attempts: number): number {
  const table = [0, 10, 30, 120, 360, 720];
  return table[Math.min(attempts, table.length - 1)] ?? 720;
}

/**
 * Stop after this many transport failures and leave it visibly failed.
 *
 * Not because retrying is expensive, but because a row that retries for
 * ever is a row nobody ever looks at. At this point it needs a person,
 * and the rejection message says so.
 */
export const MAX_ATTEMPTS = 6;

/**
 * Is this publication due to be tried now?
 *
 * Pure, and separated from the queue on purpose: it is the part with
 * edge cases — a never-tried row, a row at the attempt ceiling, a clock
 * that has not moved — and the part worth testing without a database.
 */
export function dueForRetry(
  row: { state: string; attempts: number; lastTriedAt: Date | null },
  now: Date,
): boolean {
  if (row.state === "PENDING") return true;
  if (row.state !== "FAILED") return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;
  if (!row.lastTriedAt) return true;
  const waited = (now.getTime() - row.lastTriedAt.getTime()) / 60_000;
  return waited >= backoffMinutes(row.attempts);
}
