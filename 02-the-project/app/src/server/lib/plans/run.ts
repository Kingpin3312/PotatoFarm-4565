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
 * A step that would message somebody is handed to the lead's agent, who
 * sends it the way they send anything else — same opt-out, same
 * template requirement, and a person pressing send (see `taskForStep`).
 * A sequence that bypasses those is just spam with a schedule.
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

/**
 * What a due step puts on the agent's list — or `null`, which means the
 * step is complete with nothing to do.
 *
 * ## Why every step becomes a task for a person
 *
 * `plans.advance` logged "plan step due", advanced `currentStep` and
 * scheduled the next one — for **every** action, including the two that
 * are supposed to message somebody — beneath a comment saying the step
 * "goes through the ordinary outbound path". There was no path. A lead
 * on a five-month nurture would have received nothing, while the plan
 * recorded each step as taken and ended `COMPLETED` with
 * `endedReason: "sequence finished"` — which the README reads as *"nobody
 * engaged"*, a verdict on a sequence that never sent a word.
 *
 * `MESSAGE` and `CHECK_MATCHES` are not given a sender here because
 * `intelligence/autonomy.ts` caps every customer-facing action at
 * CONFIRM: a person presses send, at every mode. So the step prepares
 * the message and hands it to the lead's agent, which is what "ours can
 * just do it, in the conversation that is already open" can honestly
 * mean under that rule.
 *
 * `CHECK_MATCHES` with nothing that fits returns `null` — the README's
 * third rule: silence is a valid outcome, and a task saying "nothing to
 * send" is the nurture sequence nobody reads, aimed at the agent.
 */
export function taskForStep(args: {
  step: Step;
  planName: string;
  who: string;
  /** For CHECK_MATCHES: the best current fit, already run through the matcher. */
  match?: { title: string; draft: string } | null;
}): { title: string; body: string } | null {
  const from = `From the "${args.planName}" plan.`;
  const { step, who } = args;

  switch (step.action) {
    case "TASK":
      return { title: step.taskTitle?.trim() || `Plan step for ${who}`, body: from };

    case "REVIEW":
      return {
        title: step.taskTitle?.trim() || `Decide whether ${who}'s plan keeps running`,
        body: `${from} This is the last check-in it has planned.`,
      };

    case "MESSAGE":
      return {
        title: step.template ? `Send ${who} the "${step.template}" message` : `Message ${who}`,
        // The template is named because outside the 24-hour window it is
        // the only thing Meta will deliver — a free-form message sent
        // instead is accepted and never arrives.
        body: step.template
          ? `${from} Outside the 24-hour window this has to be the approved "${step.template}" template.`
          : from,
      };

    case "CHECK_MATCHES":
      if (!args.match) return null;
      return {
        title: `Send ${who} ${args.match.title}`,
        body: `${from} It fits what they asked for. A draft:\n\n${args.match.draft}`,
      };
  }
}
