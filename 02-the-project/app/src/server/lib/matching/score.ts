/**
 * Matching a buyer's stated requirements against inventory.
 *
 * We already capture budget, intent and timeframe in conversation and
 * then do nothing with it. This is what turns that into something.
 *
 * The scoring principle: **be generous on price and strict on the things
 * people do not compromise on.** A buyer who said "around 2.5" will
 * happily look at 2.7. A buyer who said three bedrooms will not look at
 * one, and sending them one tells them the system is not listening.
 */

export type Requirement = {
  budgetMinFils: bigint | null;
  budgetMaxFils: bigint | null;
  bedrooms: number | null;
  communities: string[];
  intent: "BUY_TO_LIVE" | "BUY_TO_INVEST" | "RENT" | null;
};

export type Candidate = {
  id: string;
  reference: string;
  title: string;
  priceFils: bigint | null;
  bedrooms: number | null;
  community: string | null;
  purpose: "SALE" | "RENT";
  listedAt: Date;
};

export type Match = {
  listing: Candidate;
  score: number;          // 0–1
  reasons: string[];
  /** Set when something is off but not disqualifying — said out loud in
   *  the message, because a buyer spots it immediately anyway. */
  caveats: string[];
};

/** Hard filters. Failing any of these is not a weak match, it is a wrong one. */
function disqualified(r: Requirement, c: Candidate): string | null {
  const wantsRent = r.intent === "RENT";
  if (wantsRent && c.purpose !== "RENT") return "wrong purpose";
  if (!wantsRent && r.intent && c.purpose !== "SALE") return "wrong purpose";

  // Bedrooms: one fewer is never right, one more sometimes is.
  if (r.bedrooms != null && c.bedrooms != null && c.bedrooms < r.bedrooms) return "too few bedrooms";

  if (c.priceFils == null) return "no price";

  // 20% over the stated ceiling is the outer edge of useful. Beyond that
  // it is not a stretch, it is a different conversation.
  if (r.budgetMaxFils != null && c.priceFils > (r.budgetMaxFils * 120n) / 100n) return "well over budget";

  return null;
}

export function score(r: Requirement, c: Candidate): Match | null {
  if (disqualified(r, c)) return null;

  const reasons: string[] = [];
  const caveats: string[] = [];
  let points = 0;
  let possible = 0;

  // Price. Weighted heaviest because it is what actually decides.
  possible += 3;
  if (r.budgetMaxFils != null && c.priceFils != null) {
    const ratio = Number(c.priceFils) / Number(r.budgetMaxFils);
    if (ratio <= 1) {
      points += 3;
      reasons.push("inside budget");
    } else if (ratio <= 1.1) {
      points += 2;
      caveats.push(`about ${Math.round((ratio - 1) * 100)}% over what you mentioned`);
    } else {
      points += 1;
      caveats.push(`a stretch at ${Math.round((ratio - 1) * 100)}% over`);
    }
  }

  possible += 2;
  if (r.bedrooms != null && c.bedrooms != null) {
    if (c.bedrooms === r.bedrooms) { points += 2; reasons.push(`${c.bedrooms} bedrooms`); }
    else { points += 1; caveats.push(`${c.bedrooms} bedrooms rather than ${r.bedrooms}`); }
  }

  possible += 2;
  if (r.communities.length && c.community) {
    if (r.communities.some((x) => x.toLowerCase() === c.community!.toLowerCase())) {
      points += 2;
      reasons.push(c.community);
    }
    // Not in a named community is not a caveat worth saying out loud —
    // it is obvious from the listing and stating it sounds apologetic.
  }

  return {
    listing: c,
    score: possible ? points / possible : 0,
    reasons,
    caveats,
  };
}

/**
 * The best match, or nothing.
 *
 * Deliberately returns **one**, and only above a real threshold. Five
 * mediocre matches is a mailshot, and a buyer who receives one stops
 * reading everything that follows. One good one is a reason to reply.
 */
export const SEND_THRESHOLD = 0.75;

export function best(r: Requirement, candidates: Candidate[]): Match | null {
  const scored = candidates
    .map((c) => score(r, c))
    .filter((m): m is Match => m !== null && m.score >= SEND_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}
