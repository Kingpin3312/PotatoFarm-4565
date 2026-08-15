import type { Prisma } from "@prisma/client";

/**
 * The questions the assistant asks a buyer, and the reason this file
 * exists at all.
 *
 * `assistant/run.ts` opens with:
 *
 *     const profile = await db.qualificationProfile.findFirst({
 *       where: { active: true }, include: { questions: … },
 *     });
 *     if (!profile) return handover(db, orgId, convo.id, "low_confidence");
 *
 * **Nothing in this codebase has ever created a QualificationProfile.**
 * So `profile` was null on every inbound message, for every brokerage,
 * since the assistant was written — and every single enquiry was handed
 * to a human before the model was called.
 *
 * The product's one-line promise is that it answers a property enquiry
 * within seconds, qualifies the buyer and books the viewing. It has
 * never answered one.
 *
 * And nothing reported it, because the failure is a handover: a person
 * picks the conversation up and replies, the lead is served, the
 * brokerage sees a working inbox. `CLAUDE.md` names this exact shape —
 * *"too strict refuses an ordinary enquiry and hands it to a person,
 * which is invisible, because a person answers it"* — and records that
 * it is the one that actually happened. It happened at a larger scale
 * than that note assumed: not some enquiries, all of them.
 *
 * ## What makes a question belong here
 *
 * Every one has to be a question **a buyer will answer over WhatsApp in
 * one line**, and whose answer changes what an agent does next. That
 * rules out most of what a CRM would like to know.
 *
 * - `budget` decides which properties are shown at all, and a buyer who
 *   will not say is a different lead from one who says AED 1.4m.
 * - `timeline` is the single strongest predictor of whether this is a
 *   transaction or a browse, and it is the one an agent most often
 *   forgets to ask.
 * - `financing` changes the transaction, not just the paperwork: cash
 *   and mortgage are different timelines, and `deals/stages.ts` plans
 *   about three weeks' difference between them.
 * - `purpose` separates the end user from the investor, and they want
 *   opposite things said to them about the same flat.
 * - `viewing` exists because booking one is the point. It is asked last
 *   and it is the only question that is not `required` — pushing for a
 *   viewing before the other four are known is how an agent ends up
 *   showing a AED 3m villa to somebody with AED 900k.
 *
 * Deliberately **not** here: nationality, visa status, marital status,
 * employer. Some of it is needed later for AML, by a compliance officer,
 * on a KYC file with retention rules and access controls — none of it
 * belongs in an automated WhatsApp exchange with somebody who has just
 * asked the price of a two-bed.
 *
 * ## Why one profile, not one per language
 *
 * `languages` is a field on the profile and the system prompt takes the
 * lead's language separately, so the same five questions are asked in
 * Arabic or English by the same profile. Two profiles would be two
 * scripts to keep in step, and they would drift.
 */
export const DEFAULT_PROFILE = {
  name: "Buyer enquiry",
  tone: "Warm, brief, and never pushy. Short sentences. No exclamation marks, "
      + "no sales language, no promises about price or availability.",
  languages: ["en", "ar"],
} as const;

export const DEFAULT_QUESTIONS: readonly Omit<
  Prisma.QuestionCreateManyInput,
  "profileId"
>[] = [
  {
    order: 1,
    key: "budget",
    // Phrased as a range on purpose. "What is your budget?" gets a
    // number somebody feels committed to and often gets no answer at
    // all; a range gets an honest one.
    prompt: "What sort of budget range are you working with?",
    type: "MONEY",
    required: true,
  },
  {
    order: 2,
    key: "timeline",
    prompt: "When are you hoping to move, roughly?",
    type: "CHOICE",
    // Bands, not a date. Nobody answers "14 March" to this, and a band
    // is what the pipeline actually sorts on.
    options: ["Within a month", "1–3 months", "3–6 months", "Just looking"],
    required: true,
  },
  {
    order: 3,
    key: "financing",
    prompt: "Will this be a cash purchase or a mortgage?",
    type: "CHOICE",
    options: ["Cash", "Mortgage", "Not sure yet"],
    required: true,
  },
  {
    order: 4,
    key: "purpose",
    prompt: "Is this to live in, or as an investment?",
    type: "CHOICE",
    options: ["To live in", "Investment", "Both"],
    required: true,
  },
  {
    order: 5,
    key: "viewing",
    // Last, and optional. The booking is the goal, and asking for it
    // before the other four are known is how somebody gets shown the
    // wrong property.
    prompt: "Would you like to see it? I can offer a couple of times.",
    type: "BOOLEAN",
    required: false,
  },
];

/**
 * Create the profile and its questions for one brokerage.
 *
 * Takes a transaction client so it can join the signup transaction, the
 * same as `seedStages` and `seedHours`. A brokerage that exists with a
 * pipeline, working hours and no qualification script is a brokerage
 * whose assistant is switched off, and that state should not be
 * reachable by a crash halfway through signup.
 *
 * Idempotent by the profile's own unique key, so the backfill can be run
 * twice. It checks for an **active** profile rather than one by name: a
 * brokerage that has written its own script and activated it must not
 * have ours appear beside it, and `run.ts` takes `findFirst({ active:
 * true })`, so two active profiles is a coin flip over which script the
 * assistant follows.
 */
export async function seedQualification(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<{ created: boolean; questions: number }> {
  const existing = await tx.qualificationProfile.findFirst({
    where: { orgId, active: true },
    select: { id: true },
  });
  if (existing) return { created: false, questions: 0 };

  const profile = await tx.qualificationProfile.create({
    data: {
      orgId,
      name: DEFAULT_PROFILE.name,
      version: 1,
      // Active immediately. A profile seeded inactive is a profile that
      // leaves the assistant exactly as switched off as it was, and
      // nobody would find out for the same reason nobody found out the
      // first time.
      active: true,
      tone: DEFAULT_PROFILE.tone,
      languages: [...DEFAULT_PROFILE.languages],
      questions: {
        // `options` is a scalar-list field, and Prisma types it as
        // `string[] | { set: string[] }` on create — so it is spread
        // explicitly rather than passed through, which does not narrow.
        create: DEFAULT_QUESTIONS.map((q) => ({
          order: q.order,
          key: q.key,
          prompt: q.prompt,
          type: q.type,
          required: q.required,
          options: (q.options as readonly string[] | undefined)?.slice() ?? [],
        })),
      },
    },
    select: { id: true },
  });

  return { created: true, questions: DEFAULT_QUESTIONS.length };
}
