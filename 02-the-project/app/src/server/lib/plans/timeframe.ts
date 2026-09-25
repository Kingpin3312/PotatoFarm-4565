/**
 * How far away somebody said they were, in months — or null.
 *
 * `Lead.timeframe` is free text: what the assistant heard, or what an
 * agent typed ("in about six months", "next year", "3-6 months",
 * "within 3 months", "ASAP"). The nurture-plan suggestion is only worth
 * making for somebody who said *later*, so this reads the phrase and
 * answers conservatively:
 *
 *   - **"Within" is not "in".** "Within three months" is somebody buying
 *     now, with a deadline — the agent's best lead, not a nurture
 *     candidate. It reads as 0.
 *   - **A range reads as its near end.** "3–6 months" may be three.
 *   - **Anything it cannot read is null**, never a guess. A wrong guess
 *     puts an active buyer on a slow sequence, which is how they end up
 *     buying through somebody else; a missed suggestion costs nothing.
 */
const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18,
  couple: 2, "a couple": 2, "a couple of": 2, few: 3, "a few": 3,
};

// "Now" on its own — not the "now" in "six months from now".
const NOW_WORDS = /\b(asap|urgent(ly)?|immediately|right away|(?<!from )now|this (week|month)|straight away|ready)\b/;

export function monthsAway(timeframe: string | null | undefined, now = new Date()): number | null {
  if (!timeframe) return null;
  const t = timeframe.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Buying now, or with a deadline: an active buyer.
  if (/\b(within|in the next|inside|under|less than|before)\b/.test(t)) return 0;
  if (NOW_WORDS.test(t)) return 0;

  // A year by number: "in 2027", "early 2028".
  const year = t.match(/\b(20\d{2})\b/);
  if (year) {
    const months = (Number(year[1]) - now.getUTCFullYear()) * 12 - now.getUTCMonth();
    return months > 0 ? months : 0;
  }
  if (/\bnext year\b/.test(t)) return 12 - now.getUTCMonth();
  if (/\b(end of|later) (this|the) year\b/.test(t)) return Math.max(0, 11 - now.getUTCMonth());

  // "3-6 months", "3 to 6 months": the near end.
  const range = t.match(/\b(\d{1,2}) ?(?:-|to) ?\d{1,2} (week|month|year)s?\b/);
  if (range) return toMonths(Number(range[1]), range[2]!);

  // "6 months", "six months", "a few months", "a year", "18 months".
  const n = t.match(/\b(\d{1,2}|a couple of|a couple|couple|a few|few|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen) (week|month|year)s?\b/);
  if (n) {
    const count = /^\d/.test(n[1]!) ? Number(n[1]) : WORDS[n[1]!];
    if (count !== undefined) return toMonths(count, n[2]!);
  }
  return null;
}

function toMonths(count: number, unit: string): number {
  if (unit === "week") return Math.floor(count / 4.345);
  if (unit === "year") return count * 12;
  return count;
}

/** Far enough off that a plan is the right answer rather than a call. */
export const LONG_HORIZON_MONTHS = 3;
