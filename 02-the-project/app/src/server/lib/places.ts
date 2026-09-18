/**
 * Dubai, as people actually say it.
 *
 * Three parts of this product need to recognise a place name and until
 * now each carried its own list: the transcription vocabulary hint, the
 * extraction prompt, and now search. Three lists is three chances to
 * know about Tilal Al Ghaf in one place and not the other, and the
 * failure is silent — a search simply finds nothing and the agent
 * concludes the software is stupid.
 *
 * **Aliases are the whole point.** Nobody says "Jumeirah Beach
 * Residence". They say JBR. A requirement entered by one agent says
 * "Arabian Ranches" and the agent searching says "Ranches", and a system
 * that treats those as different words is a system that hides the buyer
 * who was right there.
 *
 * Not exhaustive, and not trying to be — this is the set an agent says
 * out loud in a car. A community not listed here still matches on its
 * own name through the free-text half of search; being here only buys
 * the aliases and the confidence to say "I read that as Dubai Hills".
 */

export type Place = {
  /** How it is written on a listing. */
  canonical: string;
  /** What people say instead. Lower case, matched whole-word. */
  aliases: string[];
};

export const PLACES: Place[] = [
  { canonical: "Dubai Hills", aliases: ["dubai hills estate", "hills estate", "dhe"] },
  { canonical: "Emirates Hills", aliases: [] },
  { canonical: "Palm Jumeirah", aliases: ["the palm", "palm"] },
  { canonical: "Dubai Marina", aliases: ["marina"] },
  { canonical: "JBR", aliases: ["jumeirah beach residence", "beach residence"] },
  { canonical: "Downtown", aliases: ["downtown dubai", "burj khalifa area"] },
  { canonical: "Business Bay", aliases: ["bay"] },
  { canonical: "DIFC", aliases: ["financial centre", "financial center"] },
  { canonical: "Arabian Ranches", aliases: ["ranches"] },
  { canonical: "Damac Hills", aliases: ["akoya"] },
  { canonical: "JVC", aliases: ["jumeirah village circle", "village circle"] },
  { canonical: "JLT", aliases: ["jumeirah lakes towers", "lakes towers"] },
  { canonical: "Jumeirah", aliases: ["jumeira"] },
  { canonical: "Al Barari", aliases: ["barari"] },
  { canonical: "Tilal Al Ghaf", aliases: ["tilal"] },
  { canonical: "Dubai Creek Harbour", aliases: ["creek harbour", "creek harbor", "creek"] },
  { canonical: "Emaar Beachfront", aliases: ["beachfront"] },
  { canonical: "Bluewaters", aliases: ["blue waters"] },
  { canonical: "City Walk", aliases: [] },
  { canonical: "Meydan", aliases: ["mbr city", "mohammed bin rashid city"] },
  { canonical: "Al Furjan", aliases: ["furjan"] },
  { canonical: "Dubai South", aliases: ["expo city"] },
  { canonical: "Motor City", aliases: [] },
  { canonical: "Sports City", aliases: [] },
  { canonical: "Silicon Oasis", aliases: ["dso"] },
  { canonical: "The Springs", aliases: ["springs"] },
  { canonical: "The Meadows", aliases: ["meadows"] },
  { canonical: "The Lakes", aliases: ["lakes"] },
  { canonical: "Jumeirah Islands", aliases: [] },
  { canonical: "Jumeirah Park", aliases: [] },
  { canonical: "Jumeirah Golf Estates", aliases: ["golf estates", "jge"] },
  { canonical: "Discovery Gardens", aliases: [] },
  { canonical: "Mirdif", aliases: [] },
  { canonical: "Al Barsha", aliases: ["barsha"] },
  { canonical: "Al Quoz", aliases: ["quoz"] },
  { canonical: "Nad Al Sheba", aliases: [] },
  { canonical: "Town Square", aliases: [] },
  { canonical: "Dubai Islands", aliases: ["deira islands"] },
  { canonical: "Abu Dhabi", aliases: ["saadiyat", "yas island", "al reem"] },
  { canonical: "Sharjah", aliases: [] },
];

/**
 * Every string that means this place, longest first.
 *
 * Longest first matters when matching: "dubai marina" has to be tried
 * before "marina", or half the phrase is consumed and the rest becomes
 * a stray search term.
 */
export function variantsOf(p: Place): string[] {
  return [p.canonical, ...p.aliases]
    .map((s) => s.toLowerCase())
    .sort((a, b) => b.length - a.length);
}

/** Canonical names mentioned anywhere in a piece of text. */
export function placesIn(text: string): { places: string[]; matched: string[] } {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  const places: string[] = [];
  const matched: string[] = [];

  // Longest phrase first across the whole list, so "Dubai Hills" is not
  // beaten to it by "Hills" from another entry.
  const all = PLACES.flatMap((p) => variantsOf(p).map((v) => ({ v, canonical: p.canonical })))
    .sort((a, b) => b.v.length - a.v.length);

  let remaining = hay;
  for (const { v, canonical } of all) {
    if (places.includes(canonical)) continue;
    if (remaining.includes(` ${v} `)) {
      places.push(canonical);
      matched.push(v);
      // Consumed, so "dubai marina" does not also register as "marina"
      // and, more importantly, so the words do not survive into the
      // free-text half and match every note containing "marina".
      remaining = remaining.replace(new RegExp(`\\s${escape_(v)}\\s`, "g"), " ");
    }
  }
  return { places, matched };
}

function escape_(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Everything a stored value might say for this place.
 *
 * Used to match against `Requirement.communities` and
 * `Listing.community`, which were typed by an agent or came off a portal
 * feed and are not canonicalised.
 */
export function storedVariants(canonical: string): string[] {
  const p = PLACES.find((x) => x.canonical === canonical);
  return p ? [p.canonical, ...p.aliases] : [canonical];
}

export const TRADE_WORDS = [
  "Trakheesi", "Ejari", "DLD", "NOC", "off-plan", "AED", "villa", "townhouse",
  "penthouse", "freehold", "handover", "service charge", "viewing", "vendor",
];

/**
 * The transcription vocabulary hint — and deliberately **not** the whole
 * list above.
 *
 * `transcribe.ts` carried its own copy of this and explained why it was
 * short: a long prompt stops biasing spelling and starts biasing
 * content, and a model told to expect property words will hear property
 * words in noise. Feeding it forty communities would break a decision
 * that was made on purpose.
 *
 * So the hint takes the places an agent says most — the head of the list,
 * which is ordered that way — and search uses all of them. Same source,
 * two appetites, and neither can now learn about a new community without
 * the other.
 */
export const HINT_PLACES = 12;

export const VOCABULARY_TERMS = [
  ...PLACES.slice(0, HINT_PLACES).map((p) => p.canonical),
  ...TRADE_WORDS,
];
