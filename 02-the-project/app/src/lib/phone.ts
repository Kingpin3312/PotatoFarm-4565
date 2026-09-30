/**
 * Phone numbers, the one place they are read.
 *
 * There were two normalisers (portals and voice intake, the second
 * narrower than the first) and neither was used by the two places people
 * actually type a number: adding a lead, which demanded strict E.164 and
 * rejected "+971 50 100 0041", and search, which compared the raw text and
 * so found nobody by "050 100 0041" — and read "1000041" as a budget.
 *
 * Shared by server and client, so the form can show the number it will
 * store before it is saved.
 */

/**
 * E.164, UAE-first, or null.
 *
 * Portals, agents and buyers write the same number half a dozen ways:
 * `0501234567`, `971501234567`, `+971 50 123 4567`, `00971501234567`.
 * Null rather than a guess when it cannot be read with confidence: a
 * wrong normalisation silently merges two people into one lead.
 */
export function normalisePhone(input: string | null | undefined, defaultCountry = "971"): string | null {
  if (!input) return null;
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    if (d.startsWith("0")) d = `+${defaultCountry}${d.slice(1)}`;       // 0501234567
    else if (d.startsWith(defaultCountry)) d = `+${d}`;                // 971501234567
    else if (d.length === 9) d = `+${defaultCountry}${d}`;             // 501234567
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

/**
 * Does this search text look like (part of) a phone number rather than a
 * budget or a reference?
 *
 * A phone number: starts with + or 00 or 0, or has nine or more digits,
 * or is a run of 7–8 digits that is not a round figure. "3000000" is a
 * budget; "1000041" is the end of somebody's number. Letters rule it out.
 */
export function looksLikePhone(text: string): boolean {
  const t = text.trim();
  if (!t || /[a-z]/i.test(t)) return false;
  if (!/^[+\d][\d\s\-().]*$/.test(t)) return false;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7) return false;
  if (/^(\+|00|0)/.test(t)) return true;
  if (digits.length >= 9) return true;
  return !/000$/.test(digits);
}

/**
 * The digits to look for inside a stored E.164 number.
 *
 * The country code and the trunk 0 are what people add or leave off, so
 * the key is the national number: "+971501000041", "0501000041" and
 * "050 100 0041" all become "501000041". A fragment ("1000041") is kept
 * as typed, and matches the end of the stored number.
 */
export function phoneSearchKey(text: string, defaultCountry = "971"): string {
  const full = normalisePhone(text, defaultCountry);
  if (full) {
    return full.startsWith(`+${defaultCountry}`) ? full.slice(defaultCountry.length + 1) : full.slice(1);
  }
  return text.replace(/\D/g, "").replace(/^0+/, "");
}
