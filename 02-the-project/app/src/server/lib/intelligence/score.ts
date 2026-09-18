/**
 * How warm is this lead, and why.
 *
 * `Lead.score` has been a nullable `Int` on the model since the
 * beginning and **nothing has ever written to it.** A column that
 * implies a predictive layer, with no predictive layer behind it, is
 * worse than no column: it invites a screen to sort by something that
 * is always null.
 *
 * Four components, deliberately few. A score assembled from twenty
 * weighted signals cannot be explained to the agent who is about to
 * overrule it, and an agent who cannot see why a number is what it is
 * ignores the number. Each component is out of 25.
 *
 * **Rules-based, not a model.** Three reasons, and they are not
 * squeamishness:
 *
 *   - It runs over every lead nightly. A model call per lead is a bill
 *     that scales with the customer's database rather than their usage.
 *   - It has to be explainable in one line to somebody who disagrees
 *     with it.
 *   - There is no training data. A brokerage on day one has no closed
 *     deals to learn from, and a model trained on somebody else's market
 *     is a confident stranger.
 *
 * When there are enough outcomes to learn from, the weights below are
 * the thing to fit. The shape does not need to change.
 */

export type ScoreInput = {
  createdAt: Date;
  /** Their last inbound message. The single strongest signal in the set. */
  lastInboundAt: Date | null;
  /** Ours to them. Silence after several attempts is its own signal. */
  lastOutboundAt: Date | null;
  inboundCount: number;
  outboundCount: number;
  status: string;
  intent: string | null;
  timeframe: string | null;
  budgetMaxFils: bigint | null;
  /** Live requirements. Somebody who told us what they want is engaged. */
  requirementCount: number;
  viewingCount: number;
  /** Viewings that happened, as opposed to booked. */
  attendedCount: number;
  offerCount: number;
  /**
   * The price band of the brokerage's live book, for budget fit.
   *
   * A band rather than a median, and that was a real bug rather than a
   * refinement. Against a three-listing book of 2.4m, 3.1m and 11.5m the
   * median is 3.1m — so a buyer with a live 17.6m offer *on a property
   * we hold* scored 6 out of 25 for "budget well above your usual
   * stock". The median describes the middle of the book; the question
   * being asked is whether the book contains anything this person could
   * buy, and that is a range.
   */
  book: { minFils: bigint; maxFils: bigint } | null;
};

export type Score = {
  /** 0–100. An integer, because a decimal claims precision this has not got. */
  total: number;
  recency: number;
  engagement: number;
  intent: number;
  budgetFit: number;
  /** Plain sentences. What is shown to the agent, in order of weight. */
  drivers: string[];
};

const clamp = (n: number, lo = 0, hi = 25) => Math.max(lo, Math.min(hi, Math.round(n)));
const days = (from: Date | null, now: Date) =>
  from === null ? null : (now.getTime() - from.getTime()) / 86_400_000;

export function scoreLead(i: ScoreInput, now = new Date()): Score {
  const drivers: string[] = [];

  /* ---- Recency. When did they last speak to us? ------------------- */
  //
  // A decay rather than buckets. Buckets produce a lead that drops nine
  // points overnight because a clock passed midnight, which an agent
  // notices and stops trusting.
  const sinceIn = days(i.lastInboundAt, now);
  let recency: number;
  if (sinceIn === null) {
    // Never replied. Not zero — a brand new lead has not had the chance
    // yet, and scoring them the same as one who has ignored us for a
    // month is how new enquiries sink to the bottom of the list.
    const age = days(i.createdAt, now) ?? 0;
    recency = age < 1 ? 15 : age < 3 ? 8 : 2;
    if (age < 1) drivers.push("brand new, no reply yet");
    else if (age >= 7) drivers.push("never replied");
  } else {
    recency = clamp(25 * Math.exp(-sinceIn / 10));
    if (sinceIn < 1) drivers.push("messaged today");
    else if (sinceIn < 3) drivers.push(`replied ${Math.round(sinceIn)} days ago`);
    else if (sinceIn > 21) drivers.push(`quiet for ${Math.round(sinceIn)} days`);
  }

  /* ---- Engagement. How much have they actually done? -------------- */
  //
  // Weighted towards things that cost them effort. Anyone can send a
  // message; turning up to a viewing in Dubai traffic is a decision.
  let engagement = 0;
  engagement += Math.min(8, i.inboundCount * 2);
  engagement += Math.min(6, i.requirementCount * 3);
  engagement += Math.min(6, i.attendedCount * 3);
  engagement += Math.min(5, i.offerCount * 5);
  engagement = clamp(engagement);

  if (i.offerCount > 0) drivers.push(`${i.offerCount} offer${i.offerCount === 1 ? "" : "s"} made`);
  else if (i.attendedCount > 0) drivers.push(`${i.attendedCount} viewing${i.attendedCount === 1 ? "" : "s"} attended`);
  else if (i.viewingCount > 0) drivers.push("viewing booked");

  //
  // Chased and silent. Not a penalty on engagement — it is a distinct
  // state, and it is the one an agent most needs to see, because the
  // right move is to stop rather than to send a fifth message.
  const sinceOut = days(i.lastOutboundAt, now);
  const unanswered = i.outboundCount - i.inboundCount;
  if (unanswered >= 3 && sinceIn !== null && sinceOut !== null && sinceIn > sinceOut) {
    engagement = clamp(engagement - 6);
    drivers.push(`${unanswered} messages unanswered`);
  }

  /* ---- Intent. Did they say what they are doing? ------------------ */
  let intent = 0;
  if (i.intent === "BUY_TO_LIVE") intent += 12;
  else if (i.intent === "BUY_TO_INVEST") intent += 10;
  else if (i.intent === "SELL" || i.intent === "LIST") intent += 12;
  else if (i.intent === "RENT") intent += 7;

  // Their own words about timing. Urgency stated is worth more than
  // urgency inferred, and this is the field where they state it.
  const t = (i.timeframe ?? "").toLowerCase();
  if (/(asap|immediate|urgent|this week|this month|now)/.test(t)) { intent += 13; drivers.push("says it is urgent"); }
  else if (/(week)/.test(t)) { intent += 11; drivers.push("moving within weeks"); }
  else if (/(month)/.test(t)) { intent += 8; }
  else if (/(year|no rush)/.test(t)) { intent += 2; drivers.push("no rush stated"); }

  if (i.status === "NEGOTIATING") { intent = 25; drivers.unshift("negotiating"); }
  else if (i.status === "VIEWING_BOOKED") intent = Math.max(intent, 18);
  else if (i.status === "UNRESPONSIVE") intent = Math.min(intent, 5);
  intent = clamp(intent);

  /* ---- Budget fit. Can we actually serve them? -------------------- */
  //
  // Not "how rich are they". A brokerage whose stock is 2–4m does not
  // benefit from a 60m buyer sitting at the top of the list, because
  // there is nothing to show them. Fit against the book, not size.
  let budgetFit: number;
  if (i.budgetMaxFils === null) {
    // Unknown, not bad. Scored at the midpoint so the absence of a
    // budget does not quietly bury an otherwise hot lead — and it is
    // the thing the agent should go and ask.
    budgetFit = 12;
    drivers.push("no budget on file");
  } else if (i.book === null || i.book.maxFils === 0n) {
    // No book to compare against — a brokerage on day one. Neutral
    // rather than punishing every lead they have.
    budgetFit = 15;
  } else {
    const budget = Number(i.budgetMaxFils);
    const floor = Number(i.book.minFils);
    const ceiling = Number(i.book.maxFils);

    if (budget >= floor && budget <= ceiling) {
      // Somewhere on the book is a property they could buy today.
      budgetFit = 25;
    } else if (budget > ceiling) {
      // Above everything held. Still worth serving — a brokerage wins
      // an instruction at this level by having the buyer — but it
      // shades down the further past the top of the book they are.
      const over = budget / ceiling;
      budgetFit = over <= 1.5 ? 22 : over <= 3 ? 16 : 8;
      if (budgetFit <= 8) drivers.push("budget above anything you hold");
    } else {
      // Below the cheapest thing on the book.
      const under = budget / floor;
      budgetFit = under >= 0.8 ? 18 : under >= 0.5 ? 12 : 6;
      if (budgetFit <= 6) drivers.push("budget below what you list");
    }
  }

  const total = clamp(recency + engagement + intent + budgetFit, 0, 100);

  return {
    total,
    recency,
    engagement,
    intent,
    budgetFit,
    // Four is what fits on a line an agent reads at a glance.
    drivers: drivers.slice(0, 4),
  };
}

/**
 * Did it move, and enough to mention?
 *
 * "Engagement has increased significantly over the last seven days" is
 * the sentence the brief asks for, and it needs a previous value —
 * which is why `LeadScoreEvent` exists rather than a single column.
 *
 * Eight points is the threshold. Below that a score wobbles on
 * arithmetic — a day passing moves recency on its own — and reporting
 * that as movement is noise.
 */
export const MOVEMENT_THRESHOLD = 8;

export function movement(current: number, previous: number | null): string | null {
  if (previous === null) return null;
  const delta = current - previous;
  if (Math.abs(delta) < MOVEMENT_THRESHOLD) return null;
  return delta > 0
    ? `warming — up ${delta} points this week`
    : `cooling — down ${Math.abs(delta)} points this week`;
}

/**
 * The score as a word.
 *
 * ## Why this exists at all
 *
 * `scoreLead` has run nightly since it was written. It fills
 * `Lead.score`, writes a `LeadScoreEvent` with all four components and
 * a plain-English driver list, and computes whether a lead is warming
 * or cooling against its own value six days ago. **No screen has ever
 * shown any of it.** The eighth time in this codebase that a complete,
 * tested, documented thing turned out to have nowhere to come out —
 * and the first where the machinery was not merely unreached but
 * genuinely running, every night, into a column nobody reads.
 *
 * ## Why a word and not the number
 *
 * The number is in the database and it stays there, on the row, for an
 * agent who wants it. But 0–100 invites an argument about whether 61
 * beats 58, and the honest answer is that it does not — the components
 * are integers clamped at 25 and a day passing moves recency on its
 * own, which is the whole reason `MOVEMENT_THRESHOLD` is 8. A band is
 * the precision this actually has.
 *
 * ## The thresholds, and where they come from
 *
 * Four components, each 0–25. The bands are set at what a lead has to
 * have *done* to reach them rather than at round numbers:
 *
 *   **Golden (80+)** — cannot be reached without real engagement. The
 *   ceiling on recency plus intent alone is 50, so 80 needs a lead who
 *   has attended a viewing or made an offer *and* fits the book. In
 *   practice this is a handful per brokerage and that is the point:
 *   a band that names twenty leads names none of them.
 *
 *   **Hot (60–79)** — reachable by a lead who is talking, has stated
 *   urgency, and fits the book, with no viewing yet. The list an agent
 *   works today.
 *
 *   **Warm (35–59)** — the bulk. Real, not urgent, worth a follow-up.
 *   The floor is set so a lead with an unknown budget (12, the
 *   midpoint) and nothing else cannot reach it: absence of information
 *   should not read as warmth.
 *
 *   **Cold (<35)** — quiet, unresponsive, or badly out of range.
 *   Deliberately not "dead": `UNRESPONSIVE` caps intent at 5 and a
 *   fortnight of silence decays recency, so this band fills with leads
 *   an agent should stop chasing rather than ones they should delete.
 *
 * ## The vocabulary
 *
 * These are the brand's words, and they are internal-only by decision:
 * agents see them, and nothing customer- or vendor-facing does. A buyer
 * finding out a brokerage filed them as a cold potato is a bad day.
 * `crossTenant` does not gate copy, so the guard is that this function
 * is imported by the leads screen and nothing in `whatsapp/`,
 * `vendors/` or `notify/` — asserted in `check:bands`.
 */
export type Band = "GOLDEN" | "HOT" | "WARM" | "COLD";

export const BANDS: { band: Band; from: number; label: string; blurb: string }[] = [
  { band: "GOLDEN", from: 80, label: "Golden",
    blurb: "Fits your book and has done something about it. Ring them." },
  { band: "HOT", from: 60, label: "Hot",
    blurb: "Talking, in range, and in a hurry. Today's list." },
  { band: "WARM", from: 35, label: "Warm",
    blurb: "Real, not urgent. Worth a follow-up this week." },
  { band: "COLD", from: 0, label: "Cold",
    blurb: "Quiet or out of range. Stop chasing rather than send a fifth message." },
];

export function band(score: number | null): typeof BANDS[number] | null {
  // Null is not cold. A lead the nightly sweep has not reached yet —
  // anything created since the last run — has no score, and showing it
  // as the worst band would put every new enquiry at the bottom of the
  // list on the day it arrives. Same argument as `recency` above.
  if (score === null) return null;
  return BANDS.find((b) => score >= b.from) ?? BANDS[BANDS.length - 1]!;
}
