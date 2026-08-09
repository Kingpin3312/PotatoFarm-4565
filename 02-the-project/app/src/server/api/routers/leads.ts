import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { leadScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Include the country code.");

export const leadsRouter = router({
  /**
   * Cursor pagination, not offset. Offset drifts as new leads arrive —
   * which in this product is constantly — so page two silently repeats
   * rows from page one.
   */
  list: orgProcedure
    .input(
      z.object({
        status: z
          .enum(["NEW", "QUALIFYING", "QUALIFIED", "VIEWING_BOOKED",
                 "NEGOTIATING", "WON", "LOST", "UNRESPONSIVE"])
          .optional(),
        cursor: z.string().nullish(),
        limit: z.number().min(1).max(100).default(25),
        search: z.string().trim().max(80).optional(),
        /**
         * The four tabs the leads screen actually offers, which are not
         * statuses and could not be expressed as one.
         *
         *   unassigned — nobody owns it. The list a manager opens first.
         *   hot        — the buyer has replied and nobody has answered.
         *   cold       — no inbound for a fortnight and still open.
         *
         * The screen has had these buttons all along and passed
         * `{ filter }` to a procedure that only understood `status`.
         */
        filter: z.enum(["all", "unassigned", "hot", "cold"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.lead.findMany({
        where: {
          deletedAt: null,
          ...leadScope(ctx.role, ctx.userId),
          ...(input.search && {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { phone: { contains: input.search } },
            ],
          }),
          ...(input.status ? { status: input.status } : {}),

          // Nobody owns it.
          ...(input.filter === "unassigned" ? { assignedToId: null } : {}),

          /**
           * Hot: they have replied and we have not answered.
           *
           * Unread is the signal, not recency — a lead who messaged an
           * hour ago and got a reply is not hot, and one who messaged
           * yesterday and is still waiting is.
           */
          ...(input.filter === "hot"
            ? {
                status: { notIn: ["WON", "LOST", "UNRESPONSIVE"] },
                conversation: { is: { unreadCount: { gt: 0 } } },
              }
            : {}),

          /**
           * Cold: still open, nothing inbound for a fortnight.
           *
           * A lead with no conversation at all counts — an enquiry that
           * never got a reply out of anybody is the coldest thing here.
           */
          ...(input.filter === "cold"
            ? {
                status: { notIn: ["WON", "LOST"] },
                OR: [
                  { conversation: { is: { lastInboundAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } } },
                  { conversation: { is: null } },
                ],
              }
            : {}),
        },
        // One extra row tells us whether there is a next page without a
        // second count query.
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          // `stageRef` is the relation; `stage` is nothing. The board
          // needs the name, not just the id.
          id: true, name: true, phone: true, status: true,
          stageRef: { select: { id: true, name: true } },
          budgetMinFils: true, budgetMaxFils: true, intent: true, source: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true } },
          // `id` included: the list links each row straight into the
          // inbox thread, and without it the link fell back to the lead
          // id and opened nothing.
          conversation: { select: { id: true, unreadCount: true, lastInboundAt: true, humanHandover: true } },
        },
      });

      const nextCursor = rows.length > input.limit ? rows.pop()!.id : null;
      return { rows, nextCursor };
    }),

  assign: requirePermission("lead:assign")
    .input(z.object({ leadId: z.string(), agentId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const before = await tx.lead.findUnique({ where: { id: input.leadId } });
        if (!before) throw new TRPCError({ code: "NOT_FOUND" });

        // The agent must be in this brokerage. Without this check an id
        // from another org would assign a lead to a stranger — RLS does
        // not police Membership lookups by id alone.
        if (input.agentId) {
          const member = await tx.membership.findUnique({
            where: { orgId_userId: { orgId: ctx.orgId, userId: input.agentId } },
          });
          if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "That agent isn't in your team." });
        }

        const after = await tx.lead.update({
          where: { id: input.leadId },
          data: { assignedToId: input.agentId, assignedAt: input.agentId ? new Date() : null },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "lead.assign",
          entity: "Lead",
          entityId: after.id,
          before: { assignedToId: before.assignedToId },
          after: { assignedToId: after.assignedToId },
        });

        return after;
      });
    }),

  /**
   * Soft delete. "Delete my data" is answerable with a retention date;
   * a hard delete on request is answerable with an apology when the
   * brokerage asks for it back on Monday.
   */
  remove: requirePermission("lead:delete")
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const row = await tx.lead.update({
          where: { id: input.leadId },
          data: { deletedAt: new Date() },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "lead.delete",
          entity: "Lead",
          entityId: row.id,
        });
        return { ok: true };
      })
    ),
});
