/**
 * Matching decisions for search, kept free of the database so they can
 * be unit-tested.
 */

/**
 * Does `term` appear in `text` as a word, allowing the usual endings?
 *
 * The database fetch is `contains`, which is right for gathering
 * candidates and wrong for deciding a match: "villa" was found in
 * "Jumeirah Village", and a search for villas returned flats. So a
 * candidate only scores when the term starts a word and what follows is
 * an ending ("villas", "relocating" for "relocate") rather than more of
 * a different word.
 */
const ENDINGS = new Set(["", "s", "es", "'s", "d", "ed", "ing", "er", "ers", "ly", "n"]);
export function hasWord(text: string | null | undefined, term: string): boolean {
  if (!text) return false;
  const t = term.toLowerCase();
  const stem = t.length > 4 && t.endsWith("e") ? t.slice(0, -1) : t;
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}'-]+/u)) {
    for (const part of [w, ...w.split("-")]) {
      if (part.startsWith(t) && ENDINGS.has(part.slice(t.length))) return true;
      if (stem !== t && part.startsWith(stem) && ["ing", "ed", "er", "ers", "ion"].includes(part.slice(stem.length))) return true;
    }
  }
  return false;
}

/** A reference with everything but letters and digits taken out. */
export const compactRef = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The ways a compacted reference is written in a record: AR-508, AR508, AR 508. */
export function refVariants(compact: string): string[] {
  const m = compact.match(/^([a-z]+)(\d+)$/);
  if (!m) return [compact];
  return [`${m[1]}-${m[2]}`, `${m[1]}${m[2]}`, `${m[1]} ${m[2]}`];
}

