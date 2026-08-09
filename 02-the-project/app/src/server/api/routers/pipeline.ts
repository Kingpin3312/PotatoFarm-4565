import { z } from "zod";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { leadScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";

export const pipelineRouter = router({
  stages: orgProcedure.query(({ ctx }) =>
    ctx.db.pipelineStage.findMany({
      where: { archived: false },
      orderBy: { position: "asc" },
    })
  ),

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

      const [counts, values] = await Promise.all([
        ctx.db.lead.groupBy({ by: ["stageId"], where: scope, _count: { _all: true } }),
        // Weighted pipeline value per column. The number an owner actually
        // opens the board to see.
        ctx.db.lead.groupBy({ by: ["stageId"], where: scope, _sum: { budgetMax: true } }),
      ]);

      const columns = await Promise.all(
        stages.map(async (stage) => {
          const leads = await ctx.db.lead.findMany({
            where: { ...scope, stageId: stage.id },
            take: input.perColumn,
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: {
              id: true, name: true, phone: true, budgetMin: true, budgetMax: true,
              intent: true, source: true, position: true, stageEnteredAt: true,
              assignedTo: { select: { id: true, name: true } },
              conversation: { select: { unreadCount: true, lastInboundAt: true } },
            },
          });

          const staleBefore = stage.staleAfterDays
            ? new Date(Date.now() - stage.staleAfterDays * 86_400_000)
            : null;

          return {
            stage,
            total: counts.find((c) => c.stageId === stage.id)?._count._all ?? 0,
            value: values.find((v) => v.stageId === stage.id)?._sum.budgetMax ?? null,
            leads: leads.map((l) => ({
              ...l,
              // Computed here so every client agrees on what "going cold"
              // means, rather than each one inventing its own threshold.
              stale: staleBefore ? l.stageEnteredAt < staleBefore : false,
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

  /** Bulk assign, for a manager clearing a backlog. */
  bulkAssign: requirePermission("lead:assign")
    .input(z.object({ leadIds: z.array(z.string()).min(1).max(200), agentId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const member = await tx.membership.findUnique({
          where: { orgId_userId: { orgId: ctx.orgId, userId: input.agentId } },
        });
        if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "That agent isn't in your team." });

        const { count } = await tx.lead.updateMany({
          where: { id: { in: input.leadIds }, deletedAt: null },
          data: { assignedToId: input.agentId, assignedAt: new Date() },
        });

        // One audit entry for the action, not two hundred. A log nobody
        // can read is a log nobody reads.
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "lead.bulk_assign",
          entity: "Lead",
          entityId: `${count} leads`,
          after: { agentId: input.agentId, count },
        });

        return { count };
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
