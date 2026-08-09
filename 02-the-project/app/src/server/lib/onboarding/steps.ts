/**
 * Onboarding.
 *
 * Written as a dependency graph rather than a linear wizard, for one
 * reason that dominates everything else:
 *
 *   **WhatsApp Business verification is not in our hands and takes days.**
 *
 * Meta has to verify the business before a number can send. A wizard that
 * blocks on step 3 leaves a brokerage staring at a spinner for a week,
 * concluding the product does not work, and telling people so. Everything
 * that can be done in parallel is done in parallel, and the one step that
 * waits says plainly who it is waiting on.
 *
 * The second rule: **the assistant is switched on last, and only when its
 * dependencies are genuinely met.** Turning it on before the brokerage has
 * written its own qualifying questions means it goes live asking generic
 * ones — which is the single fastest way to lose their confidence in it.
 */

export type StepKey =
  | "company"
  | "team"
  | "hours"
  | "listings"
  | "portals"
  | "whatsapp"
  | "questions"
  | "baseline"
  | "assistant";

export type Step = {
  key: StepKey;
  title: string;
  /** What the brokerage actually has to do, in their words. */
  detail: string;
  /** Steps that must be DONE before this one can start. */
  requires: StepKey[];
  /** Roughly how long it takes them. Honest, not optimistic. */
  effort: string;
  /** True when we are waiting on somebody outside the brokerage. */
  externalWait?: string;
  optional?: boolean;
};

/**
 * Where each step is actually done.
 *
 * The checklist renders a "Do it" link per step and the Step type had
 * nowhere to put the destination, so the link never rendered — a setup
 * list that tells a brokerage what is outstanding and gives them no way
 * to go and do any of it.
 *
 * Kept as a separate map rather than a field on Step because it is
 * routing, and STEPS is the domain description of what onboarding is.
 * `baseline` is deliberately absent: it is not a thing you go and click,
 * it is a week of leaving the assistant switched off.
 */
export const STEP_ROUTES: Partial<Record<StepKey, string>> = {
  company: "/settings",
  whatsapp: "/settings/channels",
  team: "/team",
  hours: "/settings",
  listings: "/listings",
  portals: "/settings/channels",
  questions: "/settings",
  assistant: "/settings",
};

export const STEPS: Step[] = [
  {
    key: "company",
    title: "Company details",
    detail: "Name, timezone and currency. Two minutes.",
    requires: [],
    effort: "2 min",
  },
  {
    key: "whatsapp",
    title: "Connect your WhatsApp number",
    detail:
      "You'll be handed to Meta to verify the business. This is the long one — " +
      "it usually takes two to three working days and none of it is in our hands. " +
      "Start it now and carry on with everything else while it runs.",
    requires: ["company"],
    effort: "10 min, then 2–3 days waiting",
    externalWait: "Meta business verification",
  },
  {
    key: "team",
    title: "Invite your agents",
    detail: "They can start using the inbox before WhatsApp is live.",
    requires: ["company"],
    effort: "5 min",
  },
  {
    key: "hours",
    title: "Set your working hours",
    detail:
      "Per day, including the weekend — most of your viewings happen then, and " +
      "scheduling gets it wrong if we assume an office week.",
    requires: ["company"],
    effort: "3 min",
  },
  {
    key: "listings",
    title: "Import your listings",
    detail:
      "A CSV export from whatever you use now, or your existing portal feed. " +
      "We'll show you what we found before anything is saved.",
    requires: ["company"],
    effort: "15 min",
  },
  {
    key: "portals",
    title: "Connect your portals",
    detail: "Property Finder, Bayut, Dubizzle. Needs your partner credentials from each.",
    requires: ["company"],
    effort: "20 min",
    externalWait: "Portal partner approval, where it applies",
  },
  {
    key: "questions",
    title: "Write your qualifying questions",
    detail:
      "The questions you'd want asked on a first call. This is the part that makes " +
      "the assistant sound like your brokerage rather than like software.",
    requires: ["company"],
    effort: "20 min",
  },
  {
    /**
     * Deliberately a step rather than a background job. It is the thing
     * that lets the brokerage prove the product worked, and if it is not
     * on the checklist nobody does it — see PILOT.md.
     */
    key: "baseline",
    title: "Record where you are today",
    detail:
      "We measure your current reply times before the assistant does anything. " +
      "Without this there's no way to show you what changed — and no way for you " +
      "to hold us to it.",
    requires: ["portals"],
    effort: "Runs on its own for a week",
  },
  {
    key: "assistant",
    title: "Switch the assistant on",
    detail:
      "Last, on purpose. It stays off until your questions are written and your " +
      "number is live, so it never goes out asking generic questions in your name.",
    requires: ["whatsapp", "questions", "hours"],
    effort: "1 min",
  },
];

export const BY_KEY = new Map(STEPS.map((s) => [s.key, s]));

/** What they can actually do right now. */
export function available(done: Set<StepKey>) {
  return STEPS.filter((s) => !done.has(s.key) && s.requires.every((r) => done.has(r)));
}

/** What is blocked, and by what — so the UI never just greys something out. */
export function blocked(done: Set<StepKey>) {
  return STEPS
    .filter((s) => !done.has(s.key) && !s.requires.every((r) => done.has(r)))
    .map((s) => ({
      step: s,
      waitingFor: s.requires.filter((r) => !done.has(r)).map((r) => BY_KEY.get(r)!.title),
    }));
}

/**
 * Progress, weighted by effort rather than by count.
 *
 * Nine steps where one takes three days and another takes two minutes are
 * not nine equal steps, and a bar that says "78% done" while the only
 * remaining item is a three-day wait is a lie the customer will remember.
 */
export function progress(done: Set<StepKey>) {
  const weight = (s: Step) => (s.externalWait ? 4 : s.effort.includes("20") ? 2 : 1);
  const total = STEPS.reduce((n, s) => n + weight(s), 0);
  const got = STEPS.filter((s) => done.has(s.key)).reduce((n, s) => n + weight(s), 0);
  return Math.round((got / total) * 100);
}
