/**
 * A database enum, as a person would write it.
 *
 *     PROPERTY_FINDER  ->  Property finder
 *     CONFIRMED_MATCH  ->  Confirmed match
 *     REFERRAL         ->  Referral
 *
 * ## Why this exists
 *
 * The interface labels were uppercased by CSS, so a dozen screens wrote
 * `source.replace(/_/g, " ").toLowerCase()` — lowercasing an enum only
 * for `text-transform: uppercase` to shout it back, which normalised
 * `PROPERTY_FINDER` into `PROPERTY FINDER` and read as deliberate.
 *
 * The moment the uppercase came off, every one of those rendered
 * `property finder`, in a chip, on the board an agent looks at all day.
 * The transform had been holding up a workaround for its own presence.
 *
 * One function, in one place, for the same reason `lib/money.ts` is one
 * function: there were five ways to format a figure and two of them
 * were wrong, and nobody could tell which screen used which.
 *
 * Only the first letter is raised. `Property finder`, not
 * `Property Finder` — title case on a data value is a small lie about
 * how important it is, and UK English does not capitalise every word of
 * a noun phrase.
 */
/**
 * Names that are spelled a particular way, and this is not title case.
 *
 * The rule above stands: a data value gets a sentence, not capitals on
 * every word. These are the exception because they are *names*, and the
 * product already writes them this way everywhere else — "WhatsApp"
 * appears in thirty user-facing strings, and the leads list was the one
 * place rendering "Whatsapp ad", in a product whose whole pitch is
 * being WhatsApp-first. Property Finder and Bayut are portals with
 * names on their own letterheads.
 *
 * Matched on the whole value before the sentence rule runs, so adding
 * one is a single line and cannot affect anything else. Keyed on the
 * enum, not on the prose, because the prose is what we are deciding.
 */
const NAMES: Record<string, string> = {
  WHATSAPP_AD: "WhatsApp ad",
  PROPERTY_FINDER: "Property Finder",
  META_LEAD_ADS: "Meta lead ads",
};

export function sentence(value: string | null | undefined): string {
  if (!value) return "";
  const key = value.trim().toUpperCase().replace(/\s+/g, "_");
  const name = NAMES[key];
  if (name) return name;
  const words = value.replace(/_/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
