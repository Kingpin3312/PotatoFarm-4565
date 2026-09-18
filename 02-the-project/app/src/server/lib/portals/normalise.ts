/**
 * Turning what portals send into something the pipeline can rely on.
 */

/**
 * Phone normalisation, UAE-first.
 *
 * Portals send the same number half a dozen ways: `0501234567`,
 * `971501234567`, `+971 50 123 4567`, `00971501234567`. Store them as
 * they arrive and the same person becomes four leads, the deduplication
 * does nothing, and an agent phones somebody who was called an hour ago.
 *
 * Returns null rather than guessing when the input is not a number we can
 * be confident about — a wrong normalisation is worse than none, because
 * it silently merges two different people into one lead.
 */
export function normalisePhone(input: string | undefined, defaultCountry = "971"): string | null {
  if (!input) return null;

  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    // Local UAE format: 0501234567 -> +971501234567
    if (d.startsWith("0")) d = `+${defaultCountry}${d.slice(1)}`;
    else if (d.startsWith(defaultCountry)) d = `+${d}`;
    else if (d.length === 9) d = `+${defaultCountry}${d}`;
    else return null;
  }

  // E.164: plus, country code not starting zero, 8 to 15 digits total.
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

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
