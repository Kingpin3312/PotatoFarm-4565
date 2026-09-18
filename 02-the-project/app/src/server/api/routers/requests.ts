import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { classify } from "@/server/lib/requests/classify";
import { comparables } from "@/server/lib/requests/comparables";
import { execute } from "@/server/lib/requests/execute";
import { audit } from "@/server/lib/audit";

/**
 * Agent requests — say it, get it.
 *
 * The competing product routes every request through a human advisor
 * for quality control, which costs them hours of latency and caps them
 * at headcount. We produce it in seconds and state our own uncertainty
 * on the deliverable.
 *
 * Every procedure here is scoped to the calling agent: this is their
 * work, and a manager reading it changes what they ask for.
 */
export const requestsRouter = router({
  /** What did they mean. Cheap, and always answered — even if the
   *  answer is a question back. */
  interpret: requirePermission("lead:read:own")
    .input(z.object({ transcript: z.string().trim().min(2).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const c = await classify({ orgId: ctx.orgId, transcript: input.transcript });
      const req = await ctx.db.agentRequest.create({
        data: {
          orgId: ctx.orgId, agentId: ctx.userId,
          transcript: input.transcript,
          recipe: c.recipe, confidence: c.confidence,
          state: c.recipe === "UNCLEAR" ? "REFUSED" : "QUEUED",
        },
        select: { id: true },
      });
      // Classify, then do it. Most recipes route to capability that
      // already exists — the spoken request is a second door onto the
      // same rooms, not a second house.
      const outcome = c.recipe === "UNCLEAR"
        ? { kind: "NEEDS" as const, question: c.question ?? "What do you need?",
            recipe: "UNCLEAR" }
        : await execute({ orgId: ctx.orgId, agentId: ctx.userId,
                          c, transcript: input.transcript });

      await ctx.db.agentRequest.update({
        where: { id: req.id },
        data: {
          state: outcome.kind === "DONE" ? "DONE"
               : outcome.kind === "REFUSED" ? "REFUSED" : "QUEUED",
          caveats: outcome.kind === "DONE" ? (outcome.caveats ?? []) : [],
          completedAt: outcome.kind === "DONE" ? new Date() : null,
        },
      });

      return { id: req.id, ...c, outcome };
    }),

  /**
   * The comparables report.
   *
   * Returns a range only when the evidence supports one. A thin answer
   * is returned as a thin answer — the caveats are part of the
   * deliverable, not a footnote we hope somebody reads.
   */
  comparables: requirePermission("listing:read")
    .input(z.object({
      building: z.string().trim().min(2).max(120),
      beds: z.number().int().min(0).max(10),
      sqft: z.number().int().positive().max(50_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const report = await comparables({ orgId: ctx.orgId, ...input });
      // A valuation an agent shows a seller is worth a record of who
      // produced it and when.
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "comparables.produced",
        entity: "Listing", entityId: input.building,
        after: { beds: input.beds, confidence: report.confidence,
                 comparables: report.comparables.length },
      });
      return report;
    }),

  /** Mine, newest first. */
  mine: requirePermission("lead:read:own")
    .query(({ ctx }) =>
      ctx.db.agentRequest.findMany({
        where: { agentId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, transcript: true, recipe: true, state: true,
                  caveats: true, createdAt: true, completedAt: true },
      })),
});
