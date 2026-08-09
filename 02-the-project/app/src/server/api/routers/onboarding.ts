import { z } from "zod";
import { router, orgProcedure, requirePermission } from "../trpc";
import { STEPS, BY_KEY, available, blocked, progress, type StepKey } from "@/server/lib/onboarding/steps";
import { guessMapping, preview } from "@/server/lib/onboarding/import-listings";
import { audit } from "@/server/lib/audit";

export const onboardingRouter = router({
  checklist: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.onboardingStep.findMany();
    const state = new Map(rows.map((r) => [r.key as StepKey, r]));
    const done = new Set(rows.filter((r) => r.state === "DONE" || r.state === "SKIPPED").map((r) => r.key as StepKey));

    return {
      progress: progress(done),
      /**
       * Waiting is reported separately from blocked. "Meta is verifying
       * your business" and "you haven't done the previous step" are
       * completely different messages, and running them together is how a
       * customer concludes the product is stuck when it is working.
       */
      waiting: rows
        .filter((r) => r.state === "WAITING")
        .map((r) => ({ ...BY_KEY.get(r.key as StepKey)!, blockedOn: r.blockedOn, since: r.startedAt })),
      available: available(done).map((s) => ({ ...s, state: state.get(s.key)?.state ?? "TODO" })),
      blocked: blocked(done),
      done: [...done].map((k) => BY_KEY.get(k)!),
    };
  }),

  setStep: requirePermission("org:update")
    .input(z.object({
      key: z.enum(STEPS.map((s) => s.key) as [StepKey, ...StepKey[]]),
      state: z.enum(["TODO", "IN_PROGRESS", "WAITING", "DONE", "SKIPPED"]),
      blockedOn: z.string().max(120).optional(),
      note: z.string().max(400).optional(),
    }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const row = await tx.onboardingStep.upsert({
          where: { orgId_key: { orgId: ctx.orgId, key: input.key } },
          create: {
            orgId: ctx.orgId, key: input.key, state: input.state,
            blockedOn: input.blockedOn, note: input.note,
            startedAt: new Date(),
            ...(input.state === "DONE" && { doneAt: new Date(), doneById: ctx.userId }),
          },
          update: {
            state: input.state, blockedOn: input.blockedOn, note: input.note,
            ...(input.state === "DONE" && { doneAt: new Date(), doneById: ctx.userId }),
          },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: `onboarding.${input.state.toLowerCase()}`,
          entity: "OnboardingStep", entityId: input.key,
        });
        return row;
      })
    ),

  /** Dry run. Nothing is written — that is the whole point of it. */
  previewImport: orgProcedure
    .input(z.object({
      headers: z.array(z.string()).min(1),
      rows: z.array(z.record(z.string(), z.string())).max(5000),
      mapping: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mapping = input.mapping ?? guessMapping(input.headers);
      const result = preview(input.rows, mapping);

      // Which references already exist, so "will this overwrite my
      // listings?" is answered before they press import rather than after.
      const refs = input.rows
        .map((r) => (mapping.reference ? r[mapping.reference] : null))
        .filter(Boolean) as string[];

      const existing = await ctx.db.listing.findMany({
        where: { reference: { in: refs.slice(0, 5000) } },
        select: { reference: true },
      });

      return {
        mapping,
        ...result,
        alreadyHere: existing.map((e) => e.reference),
        unmapped: input.headers.filter((h) => !Object.values(mapping).includes(h)),
      };
    }),
});
