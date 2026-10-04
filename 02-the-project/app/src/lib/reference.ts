/**
 * How a listing reference is compared: AR-508, AR508, ar 508 and AR_508
 * are one reference.
 *
 * Lives here, importing nothing, because two unrelated layers need it —
 * search, and reading a portal buyer's WhatsApp message
 * (`portals/mention.ts`) — and taking it from `lib/search` closed a cycle
 * through `requests` and `conversations` back to `portals`. Search
 * re-exports both, so its callers did not change.
 */

/** A reference with everything but letters and digits taken out. */
export const compactRef = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The ways a compacted reference is written in a record: AR-508, AR508, AR 508. */
export function refVariants(compact: string): string[] {
  const m = compact.match(/^([a-z]+)(\d+)$/);
  if (!m) return [compact];
  return [`${m[1]}-${m[2]}`, `${m[1]}${m[2]}`, `${m[1]} ${m[2]}`];
}
