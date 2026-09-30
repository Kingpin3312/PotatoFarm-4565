import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, Role } from "@prisma/client";
import { router, requirePermission, requireAnyPermission } from "../trpc";
import { can, leadScope, personScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";
import { entryStageId } from "@/server/lib/pipeline/defaults";
import { aedToFils } from "@/lib/money";

/**
 * A person's further pieces of business (the audit's B5).
 *
 * The lead is one person with one status, which is right for their main
 * business and wrong the moment they have two: the buyer who is also
 * letting their villa sat in one column, and the letting had nowhere to
 * be. Rather than split `Lead` — every screen, report and job reads its
 * status — each further piece of business is an `Opportunity` with its own
 * stage on the same board, its own agent and value, and its own close.
 *
 * Who may see one: whoever may see the person, or the agent it is given
 * to. Who may move one: its agent, the person's agent, or a manager.
 */
export function opportunityScope(role: Role, userId: string): Prisma.OpportunityWhereInput {
  return can(role, "lead:read:all") ? {} : { OR: [{ agentId: userId }, { lead: { assignedToId: userId } }] };
}

async function visibleLead(ctx: { db: any; role: Role; userId: string }, leadId: string, read = false) {
  const lead = await ctx.db.lead.findFirst({
    where: { id: leadId, deletedAt: null, ...(read ? personScope : leadScope)(ctx.role, ctx.userId) },
    select: { id: true, assignedToId: true },
  });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "There is nobody here." });
  return lead;
}

async function ownOpportunity(ctx: { db: any; role: Role; userId: string }, id: string) {
  const o = await ctx.db.opportunity.findFirst({
    where: { id, ...opportunityScope(ctx.role, ctx.userId) },
    select: { id: true, leadId: true, stageId: true, status: true, title: true },
  });
  if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "That is no longer here." });
  return o;
}

export const opportunitiesRouter = router({
  forLead: requireAnyPermission("lead:read:own", "lead:read:all")
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await visibleLead(ctx, input.leadId, true);
      const rows = await ctx.db.opportunity.findMany({
        where: { leadId: input.leadId },
        orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
        select: {
          id: true, kind: true, title: true, status: true, stageId: true, agentId: true,
          valueFils: true, closedAt: true, createdAt: true,
          stage: { select: { name: true } },
          listing: { select: { id: true, reference: true } },
        },
      });
      const agentIds = [...new Set(rows.map((r) => r.agentId).filter((x): x is string => !!x))];
      const members = agentIds.length
        ? await ctx.db.membership.findMany({ where: { userId: { in: agentIds } }, select: { user: { select: { id: true, name: true, email: true } } } })
        : [];
      const names = new Map(members.map((m) => [m.user.id, m.user.name ?? m.user.email]));
      const works = can(ctx.role, "lead:update");
      const all = can(ctx.role, "lead:read:all");
      const theirs = lead.assignedToId === ctx.userId;
      return {
        // Adding business to a person is for whoever looks after them.
        canAdd: works && (all || theirs),
        rows: rows.map((r) => ({
          ...r,
          agent: r.agentId ? names.get(r.agentId) ?? null : null,
          // Moving one is for its agent, the person's agent, or a manager —
          // what `move` and `close` enforce.
          canMove: works && (all || theirs || r.agentId === ctx.userId),
        })),
      };
    }),

  create: requirePermission("lead:update")
    .input(z.object({
      leadId: z.string(),
      kind: z.enum(["BUY", "SELL", "RENT", "LET"]),
      title: z.string().trim().min(2).max(120),
      valueAed: z.number().int().min(0).max(1_000_000_000).nullish(),
      listingId: z.string().nullish(),
      agentId: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      await visibleLead(ctx, input.leadId);
      // Given to somebody else only by somebody who hands out work, and
      // only to somebody who can work it.
      const agentId = input.agentId ?? ctx.userId;
      if (agentId !== ctx.userId) {
        if (!can(ctx.role, "lead:assign")) throw new TRPCError({ code: "FORBIDDEN", message: "Only a manager can give this to somebody else." });
        const m = await ctx.db.membership.findFirst({ where: { userId: agentId }, select: { role: true } });
        if (!m || !can(m.role, "lead:update")) throw new TRPCError({ code: "BAD_REQUEST", message: "Give it to somebody who can work it." });
      }
      if (input.listingId) {
        const l = await ctx.db.listing.findFirst({ where: { id: input.listingId, deletedAt: null }, select: { id: true } });
        if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "That property is no longer here." });
      }
      const stageId = await entryStageId(ctx.db, ctx.orgId, "NEW");
      const o = await ctx.db.opportunity.create({
        data: {
          orgId: ctx.orgId, leadId: input.leadId, kind: input.kind, title: input.title,
          status: "NEW", stageId, agentId, listingId: input.listingId ?? null,
          valueFils: input.valueAed == null ? null : aedToFils(input.valueAed),
          createdById: ctx.userId,
        },
        select: { id: true },
      });
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "opportunity.created", entity: "Opportunity", entityId: o.id,
        after: { kind: input.kind, leadId: input.leadId },
      });
      return o;
    }),

  /** To another column. A Won or Lost column closes it; any other reopens it. */
  move: requirePermission("lead:update")
    .input(z.object({ id: z.string(), stageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const o = await ownOpportunity(ctx, input.id);
      const stage = await ctx.db.pipelineStage.findFirst({ where: { id: input.stageId, archived: false }, select: { id: true, maps: true, name: true } });
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "That column no longer exists." });
      if (o.stageId === stage.id) return { ok: true };
      const closing = stage.maps === "WON" || stage.maps === "LOST";
      await ctx.db.opportunity.update({
        where: { id: o.id },
        data: { stageId: stage.id, status: stage.maps, stageEnteredAt: new Date(), closedAt: closing ? new Date() : null },
      });
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "opportunity.moved", entity: "Opportunity", entityId: o.id,
        after: { stage: stage.name, status: stage.maps },
      });
      return { ok: true };
    }),

  /** Won or lost, from the person's page, without finding the column. */
  close: requirePermission("lead:update")
    .input(z.object({ id: z.string(), won: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const o = await ownOpportunity(ctx, input.id);
      const status = input.won ? "WON" : "LOST";
      const stageId = await entryStageId(ctx.db, ctx.orgId, status);
      await ctx.db.opportunity.update({
        where: { id: o.id },
        data: { status, stageId, stageEnteredAt: new Date(), closedAt: new Date() },
      });
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "opportunity.closed", entity: "Opportunity", entityId: o.id, after: { status },
      });
      return { ok: true };
    }),
});
