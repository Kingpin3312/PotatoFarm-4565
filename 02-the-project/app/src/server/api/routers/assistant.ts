import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { pause, resume } from "@/server/assistant/controls";

/**
 * Assistant settings.
 *
 * The pause and resume mutations are deliberately separate from the
 * general settings update. Turning the assistant off is not a preference
 * change — it wants its own permission check, its own audit entry, and its
 * own reason field.
 */
export const assistantRouter = router({
  /**
   * Whether the assistant is running, for the header.
   *
   * Deliberately open to any member. The shell renders this on every
   * screen, and gating it meant an agent without `channel:write` got a
   * 403 and the whole header failed — a permission check breaking the
   * frame rather than the feature.
   *
   * It leaks nothing: on or off, and the reason, both of which every
   * agent needs to know so silence does not read as a fault.
   */
  isRunning: orgProcedure.query(async ({ ctx }) => {
    const s = await crossTenant("user-scoped").assistantSettings.findUnique({
      where: { orgId: ctx.orgId },
      select: { enabled: true, pausedReason: true },
    });
    return { enabled: s?.enabled ?? false, pausedReason: s?.pausedReason ?? null };
  }),

  status: orgProcedure.query(async ({ ctx }) => {
    const [settings, usage, pausedBy] = await Promise.all([
      crossTenant("user-scoped").assistantSettings.findUnique({ where: { orgId: ctx.orgId } }),
      monthUsage(ctx.orgId),
      pausedByName(ctx.orgId),
    ]);

    const budget = settings?.monthlyBudgetFils ?? null;

    return {
      enabled: settings?.enabled ?? false,
      pausedReason: settings?.pausedReason ?? null,
      pausedAt: settings?.pausedAt ?? null,
      pausedBy,
      promptVersion: settings?.promptVersion ?? "current",
      handoverAboveBudget: settings?.handoverAboveBudget ?? null,
      warnAtPercent: settings?.warnAtPercent ?? 80,
      usage: {
        ...usage,
        budgetFils: budget,
        // Straight-line projection from the month so far. Crude, but it
        // answers the only question anyone asks of this number: are we
        // going to run out before the month does.
        projectedFils: project(usage.spentFils),
      },
    };
  }),

  /**
   * The kill switch. Manager and above, because an agent having a bad
   * afternoon should not be able to silence the assistant for the whole
   * brokerage — but it should not need an owner either, since the person
   * who spots the problem is usually the one on the inbox.
   */
  pause: requirePermission("channel:write")
    .input(z.object({ reason: z.string().trim().min(3).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await pause(ctx.orgId, ctx.userId, input.reason);
      await crossTenant("user-scoped").$transaction(async (tx) => {
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "assistant.pause",
          entity: "AssistantSettings",
          entityId: ctx.orgId,
          after: { reason: input.reason },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      });
      return { enabled: false };
    }),

  resume: requirePermission("channel:write").mutation(async ({ ctx }) => {
    await resume(ctx.orgId);
    await crossTenant("user-scoped").$transaction(async (tx) => {
      await audit(tx, ctx.orgId, {
        actorId: ctx.userId,
        action: "assistant.resume",
        entity: "AssistantSettings",
        entityId: ctx.orgId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    });
    return { enabled: true };
  }),

  updateSettings: requirePermission("channel:write")
    .input(z.object({
      monthlyBudgetFils: z.bigint().positive().nullable().optional(),
      warnAtPercent: z.number().min(10).max(99).optional(),
      handoverAboveBudget: z.number().positive().nullable().optional(),
      promptVersion: z.string().max(40).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const before = await crossTenant("user-scoped").assistantSettings.findUnique({ where: { orgId: ctx.orgId } });

      // Settings can be edited while paused, but never switched on here.
      // Enabling is its own mutation so it always carries an audit entry.
      const after = await crossTenant("user-scoped").assistantSettings.upsert({
        where: { orgId: ctx.orgId },
        create: { orgId: ctx.orgId, enabled: false, ...input },
        update: input,
      });

      await crossTenant("user-scoped").$transaction(async (tx) => {
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "assistant.settings_change",
          entity: "AssistantSettings",
          entityId: ctx.orgId,
          before: before ?? undefined,
          after,
        });
      });
      return after;
    }),

  /** Recent handovers, so a brokerage can see why it is stepping in. */
  handovers: orgProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 86_400_000);
      const rows = await ctx.db.auditLog.findMany({
        where: { action: "assistant.handover", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { entityId: true, after: true, createdAt: true },
      });

      // Grouped, because the useful question is "what keeps happening",
      // not "what happened at 14:32".
      const byReason = new Map<string, number>();
      for (const r of rows) {
        const reason = (r.after as { reason?: string })?.reason ?? "unknown";
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
      }

      return {
        total: rows.length,
        byReason: [...byReason.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
        recent: rows.slice(0, 20),
      };
    }),
});

async function monthUsage(orgId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const [agg, byOutcome] = await Promise.all([
    crossTenant("user-scoped").assistantUsage.aggregate({
      where: { orgId, createdAt: { gte: start } },
      _sum: { costFils: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
      _avg: { latencyMs: true },
    }),
    crossTenant("user-scoped").assistantUsage.groupBy({
      by: ["outcome"],
      where: { orgId, createdAt: { gte: start } },
      _count: { _all: true },
    }),
  ]);

  return {
    spentFils: agg._sum.costFils ?? 0n,
    calls: agg._count._all,
    avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
    byOutcome: Object.fromEntries(byOutcome.map((o) => [o.outcome, o._count._all])),
  };
}

function project(spent: bigint) {
  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
  if (dayOfMonth < 3) return null; // too early to mean anything
  return BigInt(Math.round((Number(spent) / dayOfMonth) * daysInMonth));
}

async function pausedByName(orgId: string) {
  const s = await crossTenant("user-scoped").assistantSettings.findUnique({
    where: { orgId },
    select: { pausedById: true },
  });
  if (!s?.pausedById) return null;
  const u = await crossTenant("user-scoped").user.findUnique({
    where: { id: s.pausedById },
    select: { name: true },
  });
  return u?.name ?? null;
}
