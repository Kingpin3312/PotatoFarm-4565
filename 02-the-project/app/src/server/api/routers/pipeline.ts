import { z } from "zod";
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

      const [counts, values] = await Promise.all([
        ctx.db.lead.groupBy({ by: ["stageId"], where: scope, _count: { _all: true } }),
        // Weighted pipeline value per column. The number an owner actually
        // opens the board to see.
        ctx.db.lead.groupBy({ by: ["stageId"], where: scope, _sum: { budgetMaxFils: true } }),
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

          return {
            stage,
            total: counts.find((c) => c.stageId === stage.id)?._count._all ?? 0,
            value: values.find((v) => v.stageId === stage.id)?._sum.budgetMaxFils ?? null,
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

  /**
   * Bulk assign, for a manager clearing a backlog — and for putting a
   * lead back.
   *
   * `agentId` is nullable, and that is the capability rather than a
   * loosened type. A manager could move a lead from one agent to
   * another and could not take it off somebody: the only procedure
   * accepting null was `leads.assign`, which no screen called. "I am
   * taking this off Lena while she is away, put it back in the pool" had
   * no way to be expressed, so it was done by assigning the lead to
   * whoever was nearest — which is not the same thing and leaves the
   * wrong name on the record.
   *
   * The shared pool is a real state in this product. `assignmentFor`
   * returns null for it deliberately, the leads screen has a "Nobody's"
   * filter for it, and `QUALIFIED_UNCLAIMED` notifies on it. Everything
   * downstream was ready for a lead nothing owned; the only missing
   * piece was a way to say so.
   */
  bulkAssign: requirePermission("lead:assign")
    .input(z.object({
      leadIds: z.array(z.string()).min(1).max(200),
      agentId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        if (input.agentId) {
          const member = await tx.membership.findUnique({
            where: { orgId_userId: { orgId: ctx.orgId, userId: input.agentId } },
          });
          if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "That agent isn't in your team." });
        }

        /**
         * Read the current owners before overwriting them.
         *
         * `updateMany` returns a count and nothing else, so the previous
         * owner of each lead is gone the moment it runs — and the
         * previous owner is exactly what an ownership row has to record.
         * A bulk move that says two hundred leads changed hands without
         * saying whose they were is the version of this feature that
         * causes the argument rather than settling it.
         */
        const beforeRows = await tx.lead.findMany({
          where: { id: { in: input.leadIds }, deletedAt: null },
          select: { id: true, assignedToId: true },
        });

        const { count } = await tx.lead.updateMany({
          where: { id: { in: input.leadIds }, deletedAt: null },
          // `assignedAt` goes back to null with the owner. A lead in the
          // pool that still carries the date somebody was given it reads
          // as owned to every "how long has this been sitting with them"
          // question, including the stale-lead sweep.
          data: {
            assignedToId: input.agentId,
            assignedAt: input.agentId ? new Date() : null,
          },
        });

        /**
         * An ownership row per lead, even though the audit entry is one.
         *
         * The audit log is the manager's record of an action — one line,
         * readable. `LeadOwnership` is the *lead's* history, and it is
         * read per lead when somebody asks why a particular client is
         * not theirs any more. Two hundred audit lines would be
         * unreadable; two hundred ownership rows are one row each on two
         * hundred separate screens.
         */
        const moved = beforeRows.filter((l) => l.assignedToId !== input.agentId);
        if (moved.length) {
          await tx.leadOwnership.updateMany({
            where: { orgId: ctx.orgId, leadId: { in: moved.map((l) => l.id) }, endedAt: null },
            data: { endedAt: new Date() },
          });
          /**
           * Returning to the pool closes the old row and opens none.
           *
           * An ownership row records who holds a lead. Nobody holding it
           * is the absence of one, not a row with a null owner — which
           * would read as "assigned to nobody" in every query that joins
           * on `userId` and would put a phantom owner in the history.
           * The closed `endedAt` is the record that it happened, and the
           * audit entry below says who did it.
           */
          const agentId = input.agentId;
          if (agentId) {
            await tx.leadOwnership.createMany({
              data: moved.map((l) => ({
                orgId: ctx.orgId,
                leadId: l.id,
                userId: agentId,
                fromUserId: l.assignedToId,
                reason: l.assignedToId ? ("REASSIGNED" as const) : ("MANUAL" as const),
                actorId: ctx.userId,
              })),
            });
          }
        }

        // One audit entry for the action, not two hundred. A log nobody
        // can read is a log nobody reads.
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: input.agentId ? "lead.bulk_assign" : "lead.bulk_unassign",
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
