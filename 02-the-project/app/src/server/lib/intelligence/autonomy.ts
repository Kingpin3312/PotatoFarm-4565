import type { AutonomyLevel, AutonomyMode, NextAction } from "@prisma/client";

/**
 * What the product may do on its own, and what it must ask about first.
 *
 * `AutonomyLevel` has existed on `Recommendation` and `AiAction` since
 * those models were written and has never been anything but `SUGGEST` —
 * an enum with one value in practice, which is the shape this codebase
 * keeps catching in other people's work and had here in mine.
 *
 * **The brokerage's mode is a ceiling, not a decision.** That is the
 * whole design. `AUTOPILOT` does not mean "do everything"; it means
 * "do as much as each action is individually allowed to be done". Every
 * action has a floor it cannot go below no matter what the setting says,
 * and the floor for anything that reaches a customer is a person.
 *
 * The brief asks for exactly this and then, two sections later, asks
 * that the AI never silently send external communications. Those are
 * only compatible if the ceiling and the floor are separate ideas.
 */

/**
 * The highest level each action may ever reach.
 *
 * Read this column as "the worst that can happen if the rules are
 * wrong about this one".
 */
const CEILING: Record<NextAction, AutonomyLevel> = {
  /**
   * Internal and reversible. A follow-up task that should not have been
   * created costs an agent one glance and a tap to clear, and the
   * failure mode of *not* creating it is a lead nobody rang. This is the
   * only action that may ever happen entirely unattended, and it is the
   * one the brief names.
   */
  FOLLOW_UP: "EXECUTE",

  /**
   * Everything that reaches a customer stops at CONFIRM.
   *
   * Not DRAFT — a draft is prepared and left, and these need a person to
   * press send. Not EXECUTE at any mode: a message to a client is a
   * commitment made in the brokerage's name, in a market where a
   * WhatsApp number that annoys people gets reported and taken away.
   */
  SEND_PROPERTY: "CONFIRM",
  REACTIVATE: "CONFIRM",
  INTRODUCE_FINANCE: "CONFIRM",
  REQUEST_DOCUMENTS: "CONFIRM",

  /**
   * Things only a person can actually do. The product can prepare the
   * ground — pull the number up, draft the message — and that is the
   * end of its usefulness.
   */
  CALL: "DRAFT",
  BOOK_VIEWING: "DRAFT",
  ASK_FOR_LISTING: "DRAFT",
  PREPARE_CMA: "DRAFT",
  RECORD_OUTCOME: "DRAFT",

  /**
   * Never more than a suggestion, at any setting.
   *
   * A negotiation is where the money is decided and where a mistake is
   * not recoverable by clicking undo. The product's job here is to
   * notice and to say so.
   */
  NEGOTIATE: "SUGGEST",
};

/** What each mode is willing to allow, before the ceiling applies. */
const MODE_ALLOWS: Record<AutonomyMode, AutonomyLevel> = {
  COPILOT: "SUGGEST",
  ASSISTED: "DRAFT",
  AUTOPILOT: "EXECUTE",
};

const RANK: AutonomyLevel[] = ["SUGGEST", "DRAFT", "CONFIRM", "EXECUTE"];

/**
 * The lower of what the brokerage permits and what the action allows.
 *
 * Both directions matter. A brokerage on COPILOT gets suggestions even
 * for the action that could be executed; a brokerage on AUTOPILOT still
 * only gets a confirmation prompt for anything outbound.
 */
export function levelFor(mode: AutonomyMode, action: NextAction): AutonomyLevel {
  const allowed = RANK.indexOf(MODE_ALLOWS[mode]);
  const ceiling = RANK.indexOf(CEILING[action]);
  return RANK[Math.min(allowed, ceiling)]!;
}

/** Does this run without anybody being asked? */
export function isAutomatic(level: AutonomyLevel): boolean {
  return level === "EXECUTE";
}

/**
 * Said to a person, in the place the action appears.
 *
 * An agent has to be able to tell at a glance whether the thing in
 * front of them has already happened, is waiting on them, or is only a
 * suggestion — because those three need completely different responses
 * and look identical in a list otherwise.
 */
export const LEVEL_LABEL: Record<AutonomyLevel, string> = {
  SUGGEST: "suggested",
  DRAFT: "ready to go",
  CONFIRM: "needs your yes",
  EXECUTE: "done for you",
};

export const MODE_LABEL: Record<AutonomyMode, string> = {
  COPILOT: "Copilot",
  ASSISTED: "Assisted",
  AUTOPILOT: "Autopilot",
};

export const MODE_BLURB: Record<AutonomyMode, string> = {
  COPILOT: "It tells you what to do. You do all of it.",
  ASSISTED: "It prepares what it can and waits for you.",
  AUTOPILOT:
    "It handles the reversible, internal things on its own — and still asks " +
    "before anything reaches a client.",
};
