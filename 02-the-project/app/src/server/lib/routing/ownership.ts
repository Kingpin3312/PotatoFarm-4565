/**
 * Who owns a lead.
 *
 * This is the argument that happens weekly in every brokerage of any
 * size, and the honest thing to say about it is that **the system cannot
 * decide who is right.** Two agents both believe they spoke to this
 * person first, and one of them is mistaken rather than lying.
 *
 * So the job here is not adjudication. It is to make the facts
 * undeniable, so the argument is thirty seconds instead of an afternoon,
 * and so a manager is ruling on a record rather than on who is more
 * insistent.
 *
 * Everything below follows from that. The rules are simple, written down,
 * and the same for everybody — which matters more than whether they are
 * the cleverest rules available.
 */

/**
 * The protection period.
 *
 * An agent who worked a lead keeps them for this long after the last
 * contact. Come back after it and the lead is open again.
 *
 * Ninety days is the common figure in this market. It is set per
 * brokerage rather than hardcoded, because the number itself matters far
 * less than everybody having agreed it in advance.
 */
export const DEFAULT_PROTECTION_DAYS = 90;

export type ProtectionCheck =
  | { protected: true; ownerId: string; until: Date; daysLeft: number }
  | { protected: false; reason: string; previousOwnerId?: string };

export function checkProtection(args: {
  previousOwnerId: string | null;
  lastContactAt: Date | null;
  ownerStillHere: boolean;
  protectionDays?: number;
  now?: Date;
}): ProtectionCheck {
  const now = args.now ?? new Date();
  const days = args.protectionDays ?? DEFAULT_PROTECTION_DAYS;

  if (!args.previousOwnerId) return { protected: false, reason: "never owned by anyone" };

  if (!args.ownerStillHere) {
    // An agent who has left cannot hold a lead. The alternative is a
    // pipeline slowly filling with leads belonging to people who do not
    // work here any more.
    return { protected: false, reason: "previous agent has left", previousOwnerId: args.previousOwnerId };
  }

  if (!args.lastContactAt) {
    return { protected: false, reason: "no recorded contact", previousOwnerId: args.previousOwnerId };
  }

  const until = new Date(args.lastContactAt.getTime() + days * 86_400_000);
  if (until > now) {
    return {
      protected: true,
      ownerId: args.previousOwnerId,
      until,
      daysLeft: Math.ceil((until.getTime() - now.getTime()) / 86_400_000),
    };
  }

  return {
    protected: false,
    reason: `last contact was ${Math.floor((now.getTime() - args.lastContactAt.getTime()) / 86_400_000)} days ago`,
    previousOwnerId: args.previousOwnerId,
  };
}

/**
 * What a manager sees when two agents disagree.
 *
 * Dates and evidence, in order, with no interpretation. The temptation is
 * to have the system declare a winner; resisting it is the point. A
 * manager who is handed a ruling argues with the system. A manager who is
 * handed a timeline makes the call and owns it.
 */
export type DisputeFacts = {
  leadId: string;
  events: { at: Date; what: string; who: string | null; evidence: string }[];
  currentOwnerId: string | null;
  protection: ProtectionCheck;
};

export function summariseDispute(f: DisputeFacts) {
  const lines = f.events
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((e) => `${e.at.toISOString().slice(0, 16).replace("T", " ")} — ${e.what}${e.who ? ` (${e.who})` : ""} · ${e.evidence}`);

  return {
    timeline: lines,
    // Stated as a fact about the rule, not as a verdict about the people.
    ruleSays: f.protection.protected
      ? `Under the ${DEFAULT_PROTECTION_DAYS}-day rule this lead is still with its previous agent for another ${f.protection.daysLeft} days.`
      : `The protection period has lapsed — ${(f.protection as { reason: string }).reason}. Under the rule this lead is open.`,
    note: "This is what the record shows. The decision is yours.",
  };
}
