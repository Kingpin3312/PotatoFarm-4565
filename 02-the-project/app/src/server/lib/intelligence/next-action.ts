import type { NextAction } from "@prisma/client";
import type { Score } from "./score";

/**
 * One thing to do, and why.
 *
 * The difference between a CRM and an assistant. A CRM shows an agent
 * four hundred leads and lets them decide; this names one action per
 * person and stands behind it.
 *
 * **One per person, not a list.** An agent with four hundred leads and
 * four hundred suggestions has the original problem back with extra
 * steps. The engine's job is to choose.
 *
 * **The reason is not decoration.** It is shown beside every
 * recommendation, always, for two reasons: an instruction with no reason
 * is one an agent learns to ignore, and the reason is how they catch it
 * being wrong. A rule that produces "call James, he has gone quiet" on
 * the morning after James called is a rule that has to be visible to be
 * fixed.
 *
 * Rules are ordered by how strongly they apply, and the first match
 * wins. Ordering them by *urgency* rather than by score is deliberate —
 * a 40-point lead whose offer expires tomorrow beats a 90-point lead who
 * messaged an hour ago and needs nothing.
 */

export type Subject = {
  leadId: string;
  name: string | null;
  status: string;
  score: Score;
  daysSinceInbound: number | null;
  daysSinceOutbound: number | null;
  daysInStage: number;
  requirementCount: number;
  /** Booked, in the future. */
  upcomingViewings: number;
  /** Happened, with no outcome recorded. The most common real gap. */
  viewingsAwaitingOutcome: number;
  openOffers: number;
  /** An offer we hold that runs out soon. */
  offerExpiringInDays: number | null;
  budgetMaxFils: bigint | null;
  /** Properties on the book that match a live requirement, right now. */
  matchesWaiting: number;
  /** True once they have said stop. Nothing outbound may be suggested. */
  optedOut: boolean;
  /** Hours left in the WhatsApp window, or null if it has closed. */
  windowHoursLeft: number | null;
};

export type Suggestion = {
  action: NextAction;
  headline: string;
  reason: string;
  /** 0–1. Drives ordering across a whole book. */
  priority: number;
  valueFils: bigint | null;
};

const who = (s: Subject) => s.name?.split(" ")[0] ?? "them";

/**
 * Priority is urgency first, value second, warmth third.
 *
 * Not a weighted average of the three. A weighted average lets a large
 * number drown a time limit, and the whole point of a priority is that
 * the thing which expires goes first.
 */
function priority(base: number, s: Subject): number {
  const warmth = s.score.total / 100;
  return Math.min(1, base * 0.7 + warmth * 0.3);
}

export function nextAction(s: Subject): Suggestion | null {
  /* ---- Nothing outbound for somebody who asked us to stop --------- */
  //
  // Checked first and unconditionally. A recommendation to message
  // somebody who has opted out is a recommendation to break the law and
  // lose the number, and no amount of warmth outranks it. Internal
  // actions are still fine.
  const outboundAllowed = !s.optedOut;

  /* ---- An offer with a clock on it -------------------------------- */
  if (s.offerExpiringInDays !== null && s.offerExpiringInDays <= 2) {
    return {
      action: "NEGOTIATE",
      headline: `${who(s)}'s offer expires ${s.offerExpiringInDays <= 0 ? "today" : `in ${s.offerExpiringInDays} day${s.offerExpiringInDays === 1 ? "" : "s"}`}`,
      reason: "An offer that lapses un-answered is the cheapest deal anybody ever loses.",
      priority: priority(1, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /* ---- A viewing happened and nobody wrote down what came of it --- */
  //
  // Unglamorous, and the most frequently correct answer in a real
  // brokerage. Everything downstream — the vendor report, the pipeline,
  // whether this lead is warm at all — is guessing until it is recorded.
  if (s.viewingsAwaitingOutcome > 0) {
    return {
      action: "RECORD_OUTCOME",
      headline: `Log what happened at ${who(s)}'s viewing`,
      reason: "The owner's report and this lead's temperature are both guessing until you do.",
      priority: priority(0.72, s),
      valueFils: null,
    };
  }

  /* ---- They are mid-negotiation ----------------------------------- */
  if (s.status === "NEGOTIATING" && s.openOffers > 0) {
    return {
      action: "NEGOTIATE",
      headline: `Move ${who(s)}'s offer along`,
      reason: `Negotiating for ${s.daysInStage} day${s.daysInStage === 1 ? "" : "s"}. Deals cool where nobody pushes.`,
      priority: priority(0.85, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /* ---- Warm, and we are holding something they want --------------- */
  if (outboundAllowed && s.matchesWaiting > 0 && s.score.total >= 50) {
    return {
      action: "SEND_PROPERTY",
      headline: `Send ${who(s)} the ${s.matchesWaiting === 1 ? "one" : `${s.matchesWaiting}`} that fit${s.matchesWaiting === 1 ? "s" : ""}`,
      reason: s.windowHoursLeft !== null
        ? `They match what you have, and you have ${s.windowHoursLeft}h left to message normally.`
        : "They match what you have on the book right now.",
      priority: priority(0.8, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /* ---- The window is closing on a live conversation --------------- */
  //
  // Meta's 24-hour rule. Outside it a normal message is accepted and
  // never delivered, so the brokerage keeps working a pipeline that has
  // gone quiet without knowing why.
  if (outboundAllowed && s.windowHoursLeft !== null && s.windowHoursLeft <= 4 && s.score.total >= 40) {
    return {
      action: "FOLLOW_UP",
      headline: `Reply to ${who(s)} before the window shuts`,
      reason: `${s.windowHoursLeft}h left. After that a normal message is accepted by WhatsApp and never delivered.`,
      priority: priority(0.9, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /* ---- Hot and waiting on us -------------------------------------- */
  if (outboundAllowed && s.score.total >= 70 &&
      s.daysSinceInbound !== null && s.daysSinceInbound >= 2) {
    return {
      action: "CALL",
      headline: `Call ${who(s)}`,
      reason: `${s.score.drivers.slice(0, 2).join(", ")} — and nobody has been back to them for ${Math.round(s.daysSinceInbound)} days.`,
      priority: priority(0.78, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /* ---- Qualified, engaged, and never been shown anything ---------- */
  if (s.upcomingViewings === 0 && s.requirementCount > 0 && s.score.total >= 55) {
    return {
      action: "BOOK_VIEWING",
      headline: `Get ${who(s)} in front of something`,
      reason: "They have told you what they want and have not seen a single property yet.",
      priority: priority(0.7, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /* ---- We do not know what they want ------------------------------ */
  if (outboundAllowed && s.requirementCount === 0 && s.score.total >= 45) {
    return {
      action: "FOLLOW_UP",
      headline: `Find out what ${who(s)} is actually looking for`,
      reason: "Engaged, but nothing recorded about what they want — so nothing can be matched to them.",
      priority: priority(0.6, s),
      valueFils: null,
    };
  }

  /* ---- Stalled in a stage ----------------------------------------- */
  if (s.daysInStage >= 14 && s.status !== "WON" && s.status !== "LOST") {
    return {
      action: "FOLLOW_UP",
      headline: `${who(s)} has not moved in ${s.daysInStage} days`,
      reason: "Sitting in the same column for two weeks usually means a decision nobody has asked for.",
      priority: priority(0.5, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /* ---- Gone cold, but worth one more ------------------------------ */
  //
  // Deliberately narrow. Reactivating everybody who has ever gone quiet
  // is a mailshot, and the threshold here means it only fires on people
  // who were warm once.
  if (outboundAllowed && s.daysSinceInbound !== null &&
      s.daysSinceInbound >= 30 && s.daysSinceInbound <= 120 && s.score.total >= 30) {
    return {
      action: "REACTIVATE",
      headline: `${who(s)} has been quiet ${Math.round(s.daysSinceInbound)} days`,
      reason: "They were engaged once. One message now is worth more than another new lead.",
      priority: priority(0.35, s),
      valueFils: s.budgetMaxFils,
    };
  }

  /**
   * Nothing. Which is a real answer.
   *
   * A recommendation for every lead every day is a list an agent stops
   * reading in a week. Somebody who messaged an hour ago, has a viewing
   * on Thursday and needs nothing from anybody should produce silence.
   */
  return null;
}
