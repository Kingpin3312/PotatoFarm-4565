import type { ScreeningResult } from "@prisma/client";

/**
 * Sanctions and PEP screening.
 *
 * Required before onboarding, against the UAE Local Terrorist List, the
 * UN Consolidated List and a PEP dataset. Repeated periodically, because
 * lists change and a client who was clear in March may not be in June.
 *
 * The provider sits behind this interface because brokerages will already
 * have a preference — Dow Jones, Refinitiv and LexisNexis all serve this
 * market, and the UN and EOCN lists are published directly for anyone
 * building their own.
 */
export type ScreeningHit = {
  listName: string;
  matchedName: string;
  /** 0–1. Name matching is fuzzy and always will be. */
  score: number;
  dateOfBirth?: string;
  nationality?: string;
  reference?: string;
};

export type Screener = {
  name: string;
  lists: string[];
  check(args: { fullName: string; dateOfBirth?: string; nationality?: string }):
    Promise<{ result: ScreeningResult; hits: ScreeningHit[] }>;
};

/**
 * How a result is interpreted.
 *
 * The important decision: **a possible match is never auto-cleared.**
 * Name screening is fuzzy — common names generate hits constantly, and a
 * system that quietly dismisses anything under a threshold will one day
 * dismiss the one that mattered. A possible match goes to the compliance
 * officer with the hit detail, and a person decides.
 *
 * A confirmed match is different and urgent: funds frozen without delay,
 * a Confirmed Name Match Report on goAML, and the EOCN notified. That is
 * not something software decides on its own either, but it is something
 * software must make impossible to miss.
 */
export const AUTO_CLEAR_THRESHOLD = null; // deliberately none

export function interpret(hits: ScreeningHit[]): {
  result: ScreeningResult;
  urgency: "none" | "review" | "immediate";
  guidance: string;
} {
  if (!hits.length) {
    return { result: "CLEAR", urgency: "none", guidance: "No matches. Record and proceed." };
  }

  const strong = hits.filter((h) => h.score >= 0.95);
  if (strong.length) {
    return {
      result: "CONFIRMED_MATCH",
      urgency: "immediate",
      guidance:
        "Stop. Freeze any funds without delay, file a Confirmed Name Match Report on goAML " +
        "and notify the EOCN. Do not tell the client — that is tipping off and is a separate offence.",
    };
  }

  return {
    result: "POSSIBLE_MATCH",
    urgency: "review",
    guidance:
      `${hits.length} possible match${hits.length > 1 ? "es" : ""} on name. Compare date of birth ` +
      `and nationality against the client's documents before clearing, and record the reasoning — ` +
      `an inspector will ask why it was dismissed.`,
  };
}

/**
 * What the agent sees while a match is being reviewed.
 *
 * Nothing about the match. Tipping off is an offence regardless of who
 * does the tipping, and an agent who knows will behave differently
 * whether they mean to or not.
 */
export const AGENT_VISIBLE_STATE = {
  status: "with_compliance",
  message: "This file is with compliance. Carry on as normal and don't mention it to the client.",
};
