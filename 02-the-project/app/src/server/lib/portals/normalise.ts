/**
 * Turning what portals send into something the pipeline can rely on.
 */

/** Phone normalisation lives in `@/lib/phone`, shared with search and
 *  the forms; re-exported so existing importers keep working. */
export { normalisePhone } from "@/lib/phone";

/**
 * Portals often hand out a masked proxy number that forwards to the lead
 * and expires after a few days. Storing one as the lead's identity means
 * that in a week you have a contact you cannot reach and a duplicate the
 * next time they enquire.
 *
 * Known proxy ranges go here as they are identified. A proxy is kept for
 * the immediate reply but flagged, so the assistant asks for a direct
 * number before the mask expires.
 */
const PROXY_PREFIXES = ["+97180", "+9718000"];

export function isProxyNumber(e164: string) {
  return PROXY_PREFIXES.some((p) => e164.startsWith(p));
}

export function normaliseEmail(input?: string) {
  const e = input?.trim().toLowerCase();
  return e && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e) ? e : null;
}

/** Portals send language inconsistently: `ar-AE`, `Arabic`, `ar`. */
export function normaliseLanguage(input?: string) {
  if (!input) return "en";
  const s = input.trim().toLowerCase();
  const map: Record<string, string> = {
    arabic: "ar", english: "en", russian: "ru", hindi: "hi", urdu: "ur",
  };
  // `??` and `||` cannot be mixed without parentheses, and the two
  // read differently here: an unmapped language should fall back to
  // its first two letters, and only an empty result should become
  // "en". Parenthesised to say that rather than leave it ambiguous.
  return map[s] ?? (s.split(/[-_]/)[0]?.slice(0, 2) || "en");
}
