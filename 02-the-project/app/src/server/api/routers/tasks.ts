import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { can, leadScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";

/**
 * Tasks: the follow-up list, made something a person can write.
 *
 * `FollowUp` was a reminder the product wrote for you — from a voice
 * note or the overnight sweep — and an agent could not add one by hand,
 * give one to a colleague, or see the list beyond today (the audit's
 * C7). Same table, so Today, the reminder push and every job that
 * already writes one keep working unchanged.
 *
 * Handing a task to somebody else is a manager's (`lead:assign`), as
 * handing them a lead is; an agent writes their own.
 */
const VIEW = z.enum(["mine", "asked", "team"]);

export const tasksRouter = router({
  list: requirePermission("lead:read:own")
    .input(z.object({
      view: VIEW.default("mine"),
      state: z.enum(["open", "done"]).default("open"),
      cursor: z.string().nullish(),
    }))
    .query(async ({ ctx, input }) => {
      if (input.view === "team" && !can(ctx.role, "lead:assign")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a manager sees the whole team's tasks." });
      }
      const who = input.view === "mine" ? { agentId: ctx.userId }
        : input.view === "asked" ? { createdById: ctx.userId, NOT: { agentId: ctx.userId } }
        : {};
      const rows = await ctx.db.followUp.findMany({
        where: { ...who, completedAt: input.state === "open" ? null : { not: null } },
        orderBy: input.state === "open" ? [{ dueAt: "asc" }, { id: "asc" }] : [{ completedAt: "desc" }, { id: "desc" }],
        take: 101,
        // The cursor is the first row of the next page, so no skip.
        ...(input.cursor ? { cursor: { id: input.cursor } } : {}),
        select: {
          id: true, title: true, body: true, dueAt: true, completedAt: true,
          agentId: true, createdById: true, leadId: true, listingId: true,
        },
      });
      const nextCursor = rows.length > 100 ? rows.pop()!.id : null;
      // Names through the viewer's own scope: a task can name a lead
      // that is no longer theirs to open.
      const leadIds = [...new Set(rows.map((r) => r.leadId).filter((x): x is string => !!x))];
      const listingIds = [...new Set(rows.map((r) => r.listingId).filter((x): x is string => !!x))];
      const userIds = [...new Set(rows.flatMap((r) => [r.agentId, r.createdById]).filter((x): x is string => !!x))];
      const [leads, listings, users] = await Promise.all([
        leadIds.length ? ctx.db.lead.findMany({ where: { id: { in: leadIds }, deletedAt: null, ...leadScope(ctx.role, ctx.userId) }, select: { id: true, name: true, phone: true } }) : [],
        listingIds.length ? ctx.db.listing.findMany({ where: { id: { in: listingIds }, deletedAt: null }, select: { id: true, reference: true } }) : [],
        userIds.length ? ctx.db.membership.findMany({ where: { userId: { in: userIds } }, select: { user: { select: { id: true, name: true, email: true } } } }) : [],
      ]);
      const leadBy = new Map(leads.map((l) => [l.id, l.name ?? l.phone]));
      const listingBy = new Map(listings.map((l) => [l.id, l.reference]));
      const userBy = new Map(users.map((m) => [m.user.id, m.user.name ?? m.user.email]));
      return {
        nextCursor,
        rows: rows.map((r) => ({
          id: r.id, title: r.title, body: r.body, dueAt: r.dueAt, completedAt: r.completedAt,
          lead: r.leadId && leadBy.has(r.leadId) ? { id: r.leadId, name: leadBy.get(r.leadId)! } : null,
          listing: r.listingId && listingBy.has(r.listingId) ? { id: r.listingId, reference: listingBy.get(r.listingId)! } : null,
          assignee: userBy.get(r.agentId) ?? null,
          askedBy: r.createdById && r.createdById !== r.agentId ? userBy.get(r.createdById) ?? null : null,
          mine: r.agentId === ctx.userId,
        })),
      };
    }),

  create: requirePermission("lead:read:own")
    .input(z.object({
      title: z.string().trim().min(2).max(160),
      body: z.string().trim().max(1_000).optional(),
      dueAt: z.string().datetime(),
      /** Somebody else. A manager's. */
      agentId: z.string().optional(),
      leadId: z.string().optional(),
      listingId: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const agentId = input.agentId ?? ctx.userId;
        if (agentId !== ctx.userId) {
          if (!can(ctx.role, "lead:assign")) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Only a manager can give a task to somebody else." });
          }
          const member = await tx.membership.findFirst({ where: { userId: agentId }, select: { id: true } });
          if (!member) throw new TRPCError({ code: "BAD_REQUEST", message: "That person isn't on your team." });
        }
        if (input.leadId) {
          const lead = await tx.lead.findFirst({
            where: { id: input.leadId, deletedAt: null, ...leadScope(ctx.role, ctx.userId) }, select: { id: true },
          });
          if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "That person isn't one of yours." });
        }
        if (input.listingId) {
          const l = await tx.listing.findFirst({ where: { id: input.listingId, deletedAt: null }, select: { id: true } });
          if (!l) throw new TRPCError({ code: "NOT_FOUND" });
        }
        const t = await tx.followUp.create({
          data: {
            orgId: ctx.orgId, agentId, createdById: ctx.userId, title: input.title, body: input.body,
            dueAt: new Date(input.dueAt), leadId: input.leadId, listingId: input.listingId,
          },
          select: { id: true },
        });
        if (agentId !== ctx.userId) {
          await audit(tx, ctx.orgId, { actorId: ctx.userId, action: "task.delegate", entity: "FollowUp", entityId: t.id, after: { agentId } });
        }
        return t;
      })),

  /** Done — by whoever it is for, or whoever asked for it. */
  complete: requirePermission("lead:read:own")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.followUp.updateMany({
        where: { id: input.id, completedAt: null, OR: [{ agentId: ctx.userId }, { createdById: ctx.userId }] },
        data: { completedAt: new Date() },
      });
      if (!count) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),

  reopen: requirePermission("lead:read:own")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.followUp.updateMany({
        where: { id: input.id, completedAt: { not: null }, OR: [{ agentId: ctx.userId }, { createdById: ctx.userId }] },
        data: { completedAt: null },
      });
      if (!count) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true };
    }),
});
