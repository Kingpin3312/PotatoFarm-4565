import type { PlanAction, SubscriptionState } from "@prisma/client";

/**
 * Task plans.
 *
 * Reapit's best idea, and ours can be better than theirs for one reason:
 * their prompts nudge an agent to do something, and ours can just do it,
 * in the conversation that is already open.
 *
 * That is also the thing most likely to make it obnoxious, so the rules
 * below matter more than the sequencing does.
 */

/**
 * Rule one, and it overrides everything else.
 *
 * **A reply pauses the plan.** Not "advances it" — pauses it. Somebody
 * who has written back is now in a conversation with a person, and a
 * sequence continuing underneath that conversation is how a brokerage
 * sends "just checking in!" to a buyer who is mid-negotiation.
 *
 * Restarting is a deliberate act by an agent, never automatic.
 */
export const REPLY_PAUSES = true;

/**
 * Rule two. A plan can never send more often than the outreach rules
 * allow, and it does not get its own budget.
 *
 * Every message goes through the same path as a match alert — same
 * frequency cap, same quiet hours, same opt-out, same template
 * requirement. A sequence that bypasses those is just spam with a
 * schedule.
 */
export const USES_OUTREACH_RULES = true;

export type Step = {
  order: number;
  afterDays: number;
  action: PlanAction;
  template?: string | null;
  taskTitle?: string | null;
};

export type Subscription = {
  currentStep: number;
  state: SubscriptionState;
  startedAt: Date;
  nextDueAt: Date | null;
};

/** When the next step falls due, from the last one. */
export function scheduleNext(steps: Step[], currentStep: number, from: Date): { step: Step; dueAt: Date } | null {
  const next = steps.find((s) => s.order === currentStep + 1);
  if (!next) return null;
  return { step: next, dueAt: new Date(from.getTime() + next.afterDays * 86_400_000) };
}

export type Advance =
  | { act: true; step: Step; reason: string }
  | { act: false; reason: string; newState?: SubscriptionState };

export function shouldAdvance(args: {
  sub: Subscription;
  steps: Step[];
  leadRepliedSince: Date | null;
  leadOptedOut: boolean;
  leadStatus: string;
  now?: Date;
}): Advance {
  const now = args.now ?? new Date();

  if (args.leadOptedOut) return { act: false, reason: "opted out", newState: "STOPPED" };

  if (["WON", "LOST"].includes(args.leadStatus)) {
    // A plan running against a closed lead is the clearest possible sign
    // that nobody is looking at it.
    return { act: false, reason: `lead is ${args.leadStatus.toLowerCase()}`, newState: "COMPLETED" };
  }

  if (args.sub.state !== "RUNNING") return { act: false, reason: `plan is ${args.sub.state.toLowerCase()}` };

  if (REPLY_PAUSES && args.leadRepliedSince && args.leadRepliedSince > args.sub.startedAt) {
    return {
      act: false,
      reason: "they replied — a person has this now",
      newState: "PAUSED",
    };
  }

  if (!args.sub.nextDueAt || args.sub.nextDueAt > now) {
    return { act: false, reason: "not due yet" };
  }

  const step = args.steps.find((s) => s.order === args.sub.currentStep + 1);
  if (!step) return { act: false, reason: "sequence finished", newState: "COMPLETED" };

  return { act: true, step, reason: `step ${step.order} is due` };
}

/**
 * A worked example, because the shape is the argument.
 *
 * The buyer who said "in about six months". Six touches over five months,
 * none of them "just checking in" — every one carries something the
 * person might actually want.
 */
export const LONG_HORIZON_BUYER: Step[] = [
  { order: 1, afterDays: 14, action: "CHECK_MATCHES", template: "new_match" },
  { order: 2, afterDays: 30, action: "MESSAGE", template: "market_note" },
  { order: 3, afterDays: 45, action: "CHECK_MATCHES", template: "new_match" },
  { order: 4, afterDays: 30, action: "TASK", taskTitle: "Call — they said around now. Worth a proper conversation rather than a message." },
  { order: 5, afterDays: 30, action: "CHECK_MATCHES", template: "new_match" },
  { order: 6, afterDays: 21, action: "REVIEW", taskTitle: "Still looking? Decide whether to keep this running or close it out." },
];

/**
 * `CHECK_MATCHES` is the step that makes this ours rather than a copy.
 *
 * It runs the matcher and **only sends if something genuinely fits**. A
 * scheduled message that arrives whether or not there is anything to say
 * is the definition of a nurture sequence nobody reads. This one either
 * has a property attached or it stays quiet and waits for the next step.
 */
export const CHECK_MATCHES_SENDS_ONLY_ON_A_MATCH = true;
