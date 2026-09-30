import { z } from "zod";
import { opportunityScope } from "./opportunities";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { leadScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";

export const pipelineRouter = router({
  stages: orgProcedure.query(async ({ ctx }) => {
    const [stages, counts] = await Promise.all([
      ctx.db.pipelineStage.findMany({
        where: { archived: false },
        orderBy: { position: "asc" },
      }),
      ctx.db.lead.groupBy({
        by: ["stageId"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    // Unassigned per stage, separately. A column of 80 where 60 belong to
    // nobody is a different problem from a column of 80 that are all
    // owned, and the screen calls them out differently.
    const unassigned = await ctx.db.lead.groupBy({
      by: ["stageId"],
      where: { deletedAt: null, assignedToId: null },
      _count: { _all: true },
    });

    /**
     * `{ stages }` with a count on each, which is what the screen reads.
     *
     * It flags a stage holding more than 120 leads — the sign of a column
     * nothing leaves, an agent hoarding, or one who has left. That check
     * needs a number, and this returned bare rows with no count on them.
     */
    const countFor = new Map(counts.map((c) => [c.stageId, c._count._all]));
    const idleFor = new Map(unassigned.map((c) => [c.stageId, c._count._all]));
    return {
      stages: stages.map((s) => ({
        ...s,
        count: countFor.get(s.id) ?? 0,
        unassigned: idleFor.get(s.id) ?? 0,
      })),
    };
  }),

  /**
   * The board.
   *
   * Deliberately **not** "fetch every lead and group them in JavaScript".
   * A brokerage with four thousand leads would ship four thousand rows to
   * a browser to render sixty. Each column is capped and paginated
   * separately, and the totals come from a single grouped count rather
   * than from the length of an array.
   */
  board: orgProcedure
    .input(z.object({
      perColumn: z.number().min(5).max(50).default(20),
      assignedTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const scope: Prisma.LeadWhereInput = {
        deletedAt: null,
        ...leadScope(ctx.role, ctx.userId),
        ...(input.assignedTo && { assignedToId: input.assignedTo }),
      };

      const stages = await ctx.db.pipelineStage.findMany({
        where: { archived: false },
        orderBy: { position: "asc" },
      });

      /**
       * A person's further pieces of business ride on the same board,
       * each in its own column (the audit's B5). Counted and valued with
       * the leads, so a column's total is the business in it, not the
       * people.
       */
      const oppScope: Prisma.OpportunityWhereInput = {
        lead: { deletedAt: null },
        ...opportunityScope(ctx.role, ctx.userId),
        ...(input.assignedTo && { agentId: input.assignedTo }),
      };
      const [counts, values, oppCounts] = await Promise.all([
        ctx.db.lead.groupBy({ by: ["stageId"], where: scope, _count: { _all: true } }),
        // Weighted pipeline value per column. The number an owner actually
        // opens the board to see.
        ctx.db.lead.groupBy({ by: ["stageId"], where: scope, _sum: { budgetMaxFils: true } }),
        ctx.db.opportunity.groupBy({ by: ["stageId"], where: oppScope, _count: { _all: true }, _sum: { valueFils: true } }),
      ]);

      const columns = await Promise.all(
        stages.map(async (stage) => {
          const leads = await ctx.db.lead.findMany({
            where: { ...scope, stageId: stage.id },
            take: input.perColumn,
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: {
              id: true, name: true, phone: true, budgetMinFils: true, budgetMaxFils: true,
              intent: true, source: true, position: true, stageEnteredAt: true,
              assignedTo: { select: { id: true, name: true } },
              conversation: { select: { unreadCount: true, lastInboundAt: true } },
            },
          });

          const staleBefore = stage.staleAfterDays
            ? new Date(Date.now() - stage.staleAfterDays * 86_400_000)
            : null;

          const opportunities = await ctx.db.opportunity.findMany({
            where: { ...oppScope, stageId: stage.id },
            take: input.perColumn,
            orderBy: [{ stageEnteredAt: "desc" }, { id: "desc" }],
            select: {
              id: true, kind: true, title: true, valueFils: true, stageEnteredAt: true, leadId: true,
              lead: { select: { name: true, phone: true } },
            },
          });
          const opp = oppCounts.find((c) => c.stageId === stage.id);
          const leadValue = values.find((v) => v.stageId === stage.id)?._sum.budgetMaxFils ?? null;
          const oppValue = opp?._sum.valueFils ?? null;

          return {
            stage,
            total: (counts.find((c) => c.stageId === stage.id)?._count._all ?? 0) + (opp?._count._all ?? 0),
            value: leadValue === null && oppValue === null ? null : (leadValue ?? 0n) + (oppValue ?? 0n),
            leads: leads.map((l) => ({
              ...l,
              // Computed here so every client agrees on what "going cold"
              // means, rather than each one inventing its own threshold.
              stale: staleBefore ? l.stageEnteredAt < staleBefore : false,
            })),
            opportunities: opportunities.map((o) => ({
              ...o,
              stale: staleBefore ? o.stageEnteredAt < staleBefore : false,
            })),
          };
        })
      );

      return { columns };
    }),

  /**
   * Move a lead. One row written, whatever the size of the column.
   *
   * The midpoint is computed inside the statement in Postgres NUMERIC.
   * Doing the arithmetic in JavaScript loses precision after roughly fifty
   * midpoints in the same gap, and the symptom is leads quietly swapping
   * places — which nobody reports as a bug, they just stop trusting the
   * board.
   */
  move: requirePermission("lead:update")
    .input(z.object({
      leadId: z.string(),
      toStageId: z.string(),
      /// The neighbours it is being dropped between, as the client sees
      /// them. Either may be null for the top or bottom of the column.
      afterLeadId: z.string().nullable(),
      beforeLeadId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const [lead, stage] = await Promise.all([
          tx.lead.findFirst({
            where: { id: input.leadId, deletedAt: null, ...leadScope(ctx.role, ctx.userId) },
            select: { id: true, stageId: true, status: true, position: true },
          }),
          tx.pipelineStage.findFirst({ where: { id: input.toStageId, archived: false } }),
        ]);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
        if (!stage) throw new TRPCError({ code: "BAD_REQUEST", message: "That column no longer exists." });

        const neighbours = await tx.lead.findMany({
          where: { id: { in: [input.afterLeadId, input.beforeLeadId].filter(Boolean) as string[] } },
          select: { id: true, position: true, stageId: true },
        });

        const after = neighbours.find((n) => n.id === input.afterLeadId);
        const before = neighbours.find((n) => n.id === input.beforeLeadId);

        // The board the agent was looking at may be stale — someone else
        // may have moved these while the drag was in flight. Rather than
        // guessing, refuse and let the client refetch.
        if ((after && after.stageId !== input.toStageId) ||
            (before && before.stageId !== input.toStageId)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Someone else moved this column while you were dragging. Refreshing.",
          });
        }

        const position: Prisma.Decimal = after && before
          ? after.position.add(before.position).div(2)
          : after
            ? after.position.add(1)
            : before
              ? before.position.sub(1)
              : new Prisma.Decimal(0);

        const changedColumn = lead.stageId !== input.toStageId;

        const updated = await tx.lead.update({
          where: { id: lead.id },
          data: {
            stageId: input.toStageId,
            position,
            // The system status follows the column, so reporting stays
            // meaningful however a brokerage names its own stages.
            status: stage.maps,
            // Only reset when it actually changed column. Reordering
            // within a column is not "entering" it, and resetting here
            // would make the stale indicator useless.
            ...(changedColumn && { stageEnteredAt: new Date() }),
          },
        });

        if (changedColumn) {
          await audit(tx, ctx.orgId, {
            actorId: ctx.userId,
            action: "lead.stage_change",
            entity: "Lead",
            entityId: lead.id,
            before: { stageId: lead.stageId, status: lead.status },
            after: { stageId: stage.id, status: stage.maps },
          });
        }

        return updated;
      })
    ),

  /** Rebalance a column whose keys have grown long. Nightly job. */
  rebalance: requirePermission("lead:update")
    .input(z.object({ stageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const leads = await ctx.db.lead.findMany({
        where: { stageId: input.stageId, deletedAt: null },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      await ctx.db.$transaction(
        leads.map((l, i) =>
          ctx.db.lead.update({ where: { id: l.id }, data: { position: i * 1000 } })
        )
      );
      return { renumbered: leads.length };
    }),
});
