import type { NextAction } from "@prisma/client";
import { assess, type Health } from "./timeline";
import type { DealStage, Financing } from "@prisma/client";

/**
 * Is this deal in trouble, and what should somebody do about it.
 *
 * `assess()` in timeline.ts already answers the hardest part — whether
 * the contractual completion date is still arithmetically achievable —
 * and it is good. What it cannot see is everything that is not a date.
 * A deal with eleven days of slack and a buyer who has not answered the
 * phone in a week is not "on track"; it is on track on paper.
 *
 * So this wraps it rather than replacing it. Three inputs the timeline
 * does not have:
 *
 *   - **Silence.** The single best predictor that a deal is going
 *     wrong, and the one nobody records anywhere.
 *   - **A milestone somebody has marked blocked.** An agent wrote down
 *     that it is stuck. Nothing has ever read that field.
 *   - **Money not yet in.** A deposit that has not landed is a deal
 *     that is not really agreed, whatever the stage says.
 *
 * **The reason is the deliverable, not the colour.** A red light with no
 * sentence is an alarm somebody switches off.
 */

export type RiskLevel = "HEALTHY" | "WATCH" | "AT_RISK";

export type DealRisk = {
  level: RiskLevel;
  /** One line, naming the cause. Shown wherever the level is shown. */
  reason: string;
  /** Everything that contributed, worst first, for the detail view. */
  factors: string[];
  /** What to do, or null when the answer is genuinely "nothing yet". */
  action: { kind: NextAction; headline: string } | null;
  /** The timeline verdict, kept so callers can show the arithmetic. */
  timeline: Health;
};

export type RiskInput = {
  reference: string;
  stage: DealStage;
  financing: Financing;
  sellerHasMortgage: boolean;
  contractualCompletionAt: Date | null;
  completed: DealStage[];
  /** Milestones an agent has explicitly marked stuck, with their reasons. */
  blocked: { stage: DealStage; reason: string }[];
  /** Days since the buyer last said anything, or null if never. */
  daysSinceContact: number | null;
  /** Whose name is on it, for the headline. */
  counterparty: string | null;
};

/**
 * Silence thresholds.
 *
 * A week is when an agent should notice; a fortnight is when it is a
 * problem regardless of what the calendar says. Deliberately not scaled
 * to the completion date — a buyer going quiet is the same signal
 * whether completion is in one week or six.
 */
const QUIET_WATCH = 7;
const QUIET_RISK = 14;

export function assessRisk(i: RiskInput, now = new Date()): DealRisk {
  /**
   * A deal with no contractual date cannot be assessed on time, and
   * saying nothing is better than inventing a deadline. It is still
   * assessable on silence and blockers, which is most of the value.
   */
  const timeline: Health = i.contractualCompletionAt
    ? assess({
        deal: {
          financing: i.financing,
          sellerHasMortgage: i.sellerHasMortgage,
          contractualCompletionAt: i.contractualCompletionAt,
        },
        completed: i.completed,
        now,
      })
    : {
        achievable: true,
        daysOfSlack: 0,
        nextDue: null,
        overdue: [],
        message: "No completion date agreed yet, so there is nothing to be late for.",
      };

  const factors: string[] = [];
  let level: RiskLevel = "HEALTHY";
  const raise = (to: RiskLevel) => {
    const order: RiskLevel[] = ["HEALTHY", "WATCH", "AT_RISK"];
    if (order.indexOf(to) > order.indexOf(level)) level = to;
  };

  /* ---- The arithmetic, from timeline.ts -------------------------- */
  if (i.contractualCompletionAt) {
    if (!timeline.achievable) {
      raise("AT_RISK");
      factors.push(
        `The completion date is no longer achievable — short by ` +
        `${Math.abs(timeline.daysOfSlack)} working days.`
      );
    } else if (timeline.daysOfSlack <= 3) {
      raise("WATCH");
      factors.push(
        `Only ${timeline.daysOfSlack} working day${timeline.daysOfSlack === 1 ? "" : "s"} of slack.`
      );
    }
    if (timeline.overdue.length) {
      raise(timeline.overdue.length > 1 ? "AT_RISK" : "WATCH");
      const first = timeline.overdue[0]!;
      factors.push(
        timeline.overdue.length === 1
          ? `"${first.title}" is past its date and sits with the ${first.owner.toLowerCase()}.`
          : `${timeline.overdue.length} steps are past their dates, starting with "${first.title}".`
      );
    }
  }

  /* ---- Somebody wrote down that it is stuck ---------------------- */
  //
  // `DealMilestone.blockedReason` has existed since the model was
  // written and nothing has ever read it. An agent recording a blocker
  // that no screen and no score ever looks at is worse than no field:
  // they believe they have reported it.
  for (const b of i.blocked) {
    raise("AT_RISK");
    factors.push(`Blocked: ${b.reason}`);
  }

  /* ---- Silence --------------------------------------------------- */
  if (i.daysSinceContact !== null) {
    if (i.daysSinceContact >= QUIET_RISK) {
      raise("AT_RISK");
      factors.push(`No word from ${i.counterparty ?? "the buyer"} in ${i.daysSinceContact} days.`);
    } else if (i.daysSinceContact >= QUIET_WATCH) {
      raise("WATCH");
      factors.push(`${i.counterparty ?? "The buyer"} has been quiet ${i.daysSinceContact} days.`);
    }
  }

  /* ---- Money that should be in and is not ------------------------ */
  //
  // Past the deposit stage without a deposit recorded is the one place
  // where the stage field and reality most often disagree, because
  // moving a card is easier than chasing a transfer.
  const done = new Set(i.completed);
  const pastDeposit = ORDER.indexOf(i.stage) > ORDER.indexOf("DEPOSIT_PAID");
  if (pastDeposit && !done.has("DEPOSIT_PAID")) {
    raise("AT_RISK");
    factors.push("The deposit is not recorded as paid, but the deal has moved past it.");
  }

  return {
    level,
    reason: factors[0] ?? timeline.message,
    factors,
    action: actionFor(level, i, timeline, factors),
    timeline,
  };
}

/**
 * The stage order, for "is this deal past that point".
 *
 * Written out rather than taken from the enum, because the enum's
 * declaration order is a schema detail and this is a business sequence.
 * If they drift, this is the one that is right.
 */
export const STEP_STAGES = [
  "AGREED", "MOU_SIGNED", "DEPOSIT_PAID", "MORTGAGE_APPLIED", "VALUATION_DONE",
  "FINAL_OFFER", "LIABILITY_LETTER", "NOC_APPLIED", "NOC_RECEIVED",
  "TRANSFER_BOOKED", "COMPLETED",
] as const;

/**
 * A step somebody can actually tick off.
 *
 * `COLLAPSED` is a real `DealStage` and is deliberately not one of
 * these — it is an outcome, not a step, and nothing should offer a
 * button that marks it done. Exported so the router input, the stage
 * derivation and the screen all narrow to the same set rather than each
 * casting their way past it.
 */
export type StepStage = (typeof STEP_STAGES)[number];

const ORDER: DealStage[] = [...STEP_STAGES, "COLLAPSED"];

/**
 * One action, chosen from the worst thing wrong.
 *
 * Same discipline as the lead engine: the point is to choose, not to
 * list. A healthy deal returns null, because a recommendation attached
 * to every deal every day is a list nobody reads by Friday.
 */
function actionFor(
  level: RiskLevel,
  i: RiskInput,
  timeline: Health,
  factors: string[]
): DealRisk["action"] {
  if (level === "HEALTHY") return null;
  const who = i.counterparty ?? "the buyer";

  if (i.blocked.length) {
    return {
      kind: "FOLLOW_UP",
      headline: `Clear the block on ${i.reference}`,
    };
  }
  if (i.daysSinceContact !== null && i.daysSinceContact >= QUIET_WATCH) {
    return { kind: "CALL", headline: `Call ${who} about ${i.reference}` };
  }
  if (!timeline.achievable) {
    // Not "chase harder". The arithmetic says it cannot be done, and the
    // useful move is to renegotiate the date while there is still time
    // to do it calmly.
    return { kind: "NEGOTIATE", headline: `Agree a new completion date on ${i.reference}` };
  }
  if (factors.some((f) => f.startsWith("The deposit"))) {
    return { kind: "REQUEST_DOCUMENTS", headline: `Confirm the deposit on ${i.reference}` };
  }
  const late = timeline.overdue[0];
  if (late) {
    return {
      kind: late.owner === "BUYER" || late.owner === "SELLER" ? "FOLLOW_UP" : "REQUEST_DOCUMENTS",
      headline: `Chase "${late.title}" on ${i.reference}`,
    };
  }
  return { kind: "FOLLOW_UP", headline: `Check in on ${i.reference}` };
}

/** In words, because colour is never the only signal. */
export const RISK_LABEL: Record<RiskLevel, string> = {
  HEALTHY: "on track",
  WATCH: "needs attention",
  AT_RISK: "at risk",
};
