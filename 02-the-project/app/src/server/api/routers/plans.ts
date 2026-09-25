import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, PlanAction, PlanAudience } from "@prisma/client";
import { router, requirePermission } from "../trpc";
import { can, leadScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";
import { describeStep, planProblems, PLAN_LIMITS } from "@/server/lib/plans/run";

/**
 * Nurture plans: writing them, and putting people on them.
 *
 * ## Why this exists
 *
 * `plans.advance` ran every morning over `PlanSubscription`, turned each
 * due step into a task for the lead's agent, and had careful rules for
 * pausing on a reply and stopping on an opt-out. **Nothing created a
 * plan, a step or a subscription**, so it had only ever run inside a
 * check. A buyer who said "in about six months" was still a note in a
 * field — the gap the plans README opens with.
 *
 * Every step still ends with a person: nothing here sends. A plan puts
 * work on an agent's list at the right time, and the agent sends.
 */

const DAY = 86_400_000;

const stepInput = z.object({
  action: z.nativeEnum(PlanAction),
  afterDays: z.number().int(),
  template: z.string().trim().max(80).optional(),
  taskTitle: z.string().trim().max(160).optional(),
});

/** A subscription the caller may act on: their own lead's, or any for a manager. */
async function subscriptionFor(
  db: { planSubscription: { findUnique(a: object): PromiseLike<unknown> }; lead: { findFirst(a: object): PromiseLike<unknown> } },
  ctx: { role: Parameters<typeof leadScope>[0]; userId: string },
  id: string,
) {
  const sub = (await db.planSubscription.findUnique({
    where: { id },
    select: { id: true, leadId: true, state: true, nextDueAt: true, plan: { select: { name: true } } },
  })) as { id: string; leadId: string; state: string; nextDueAt: Date | null; plan: { name: string } } | null;
  if (!sub) throw new TRPCError({ code: "NOT_FOUND" });
  const lead = await db.lead.findFirst({
    where: { id: sub.leadId, deletedAt: null, ...leadScope(ctx.role, ctx.userId) },
    select: { id: true },
  });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
  return sub;
}

export const plansRouter = router({
  /**
   * The brokerage's plans, with how people on each have fared.
   *
   * "They replied" is the good ending and a plan run to completion
   * usually means nobody engaged (README), so the counts are the
   * honest measure of a plan — shown beside it, not in a report.
   */
  list: requirePermission("lead:read:own").query(async ({ ctx }) => {
    const plans = await ctx.db.taskPlan.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { steps: { orderBy: { order: "asc" } } },
    });
    const counts = await ctx.db.planSubscription.groupBy({
      by: ["planId", "state"], _count: { _all: true },
    });
    const tally = (planId: string, state: string) =>
      counts.find((c) => c.planId === planId && c.state === state)?._count._all ?? 0;
    return {
      // Said by the server, so the screen shows the builder to exactly
      // the people `create` will accept it from.
      canManage: can(ctx.role, "plan:manage"),
      plans: plans.map((p) => ({
      id: p.id, name: p.name, description: p.description, audience: p.audience, active: p.active,
      steps: p.steps.map((s) => ({ order: s.order, afterDays: s.afterDays, action: s.action, says: describeStep(s) })),
      totalDays: p.steps.reduce((n, s) => n + s.afterDays, 0),
      running: tally(p.id, "RUNNING"),
      paused: tally(p.id, "PAUSED"),
      completed: tally(p.id, "COMPLETED"),
      stopped: tally(p.id, "STOPPED"),
      })),
    };
  }),

  create: requirePermission("plan:manage")
    .input(z.object({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(300).optional(),
      audience: z.nativeEnum(PlanAudience),
      steps: z.array(stepInput).max(PLAN_LIMITS.maxSteps),
    }))
    .mutation(async ({ ctx, input }) => {
      const steps = input.steps.map((s, i) => ({
        order: i + 1, afterDays: s.afterDays, action: s.action,
        // Only the field the action uses, so a step changed from MESSAGE
        // to TASK in the builder does not carry a stale template.
        template: s.action === "MESSAGE" ? s.template || null : null,
        taskTitle: s.action === "TASK" || s.action === "REVIEW" ? s.taskTitle || null : null,
      }));
      const problems = planProblems(steps);
      if (problems.length) throw new TRPCError({ code: "BAD_REQUEST", message: problems.join(" ") });

      try {
        return await ctx.db.$transaction(async (tx) => {
          // Checked first rather than caught: inside a real transaction a
          // failed statement aborts everything after it.
          const clash = await tx.taskPlan.findFirst({ where: { name: input.name }, select: { id: true } });
          if (clash) throw new TRPCError({ code: "CONFLICT", message: "There is already a plan with that name." });
          const plan = await tx.taskPlan.create({
            data: {
              orgId: ctx.orgId, name: input.name, description: input.description || null, audience: input.audience,
              steps: { create: steps.map((s) => ({ ...s, orgId: ctx.orgId })) },
            },
          });
          await audit(tx, ctx.orgId, {
            actorId: ctx.userId, action: "plan.create", entity: "TaskPlan", entityId: plan.id,
            after: { name: plan.name, steps: steps.length },
          });
          return { id: plan.id };
        });
      } catch (e) {
        // Two managers naming a plan at the same moment.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "There is already a plan with that name." });
        }
        throw e;
      }
    }),

  /**
   * Retire a plan, or bring it back. Retired, it takes nobody new;
   * people already on it carry on until an agent stops them — ending
   * forty people's plans is not a side effect of tidying a list.
   *
   * There is no editing a plan's steps. People part-way through one are
   * at a step number, and renumbering underneath them sends the wrong
   * next step; a changed plan is a new plan.
   */
  setActive: requirePermission("plan:manage")
    .input(z.object({ planId: z.string(), active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const { count } = await tx.taskPlan.updateMany({ where: { id: input.planId }, data: { active: input.active } });
        if (count !== 1) throw new TRPCError({ code: "NOT_FOUND" });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: input.active ? "plan.restore" : "plan.retire",
          entity: "TaskPlan", entityId: input.planId,
        });
        return { ok: true };
      })
    ),

  /** One person's plans, and the ones they could be put on. */
  forLead: requirePermission("lead:read:own")
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const lead = await ctx.db.lead.findFirst({
        where: { id: input.leadId, deletedAt: null, ...leadScope(ctx.role, ctx.userId) },
        select: { id: true },
      });
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
      const [subs, plans] = await Promise.all([
        ctx.db.planSubscription.findMany({
          where: { leadId: input.leadId },
          orderBy: { startedAt: "desc" },
          include: { plan: { include: { steps: { orderBy: { order: "asc" } } } } },
        }),
        ctx.db.taskPlan.findMany({
          where: { active: true, steps: { some: {} } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, audience: true, _count: { select: { steps: true } } },
        }),
      ]);
      return {
        subscriptions: subs.map((s) => {
          const next = s.plan.steps.find((x) => x.order === s.currentStep + 1);
          return {
            id: s.id, plan: s.plan.name, state: s.state,
            done: s.currentStep, of: s.plan.steps.length,
            next: next ? describeStep(next) : null,
            nextDueAt: s.nextDueAt, startedAt: s.startedAt, finishedAt: s.finishedAt, endedReason: s.endedReason,
          };
        }),
        plans: plans.map((p) => ({ id: p.id, name: p.name, audience: p.audience, steps: p._count.steps })),
      };
    }),

  subscribe: requirePermission("lead:update")
    .input(z.object({ leadId: z.string(), planId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, deletedAt: null, ...leadScope(ctx.role, ctx.userId) },
          select: { id: true, status: true, optedOutOfOutreach: true, assignedToId: true },
        });
        if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
        // Each refusal is a step that would otherwise wait for ever or
        // reach somebody it must not.
        if (lead.optedOutOfOutreach) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "They asked not to be messaged, so they can't go on a plan." });
        }
        if (lead.status === "WON" || lead.status === "LOST") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Their file is closed. Reopen it first." });
        }
        if (!lead.assignedToId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Give them to an agent first — every step is a task for their agent." });
        }
        const plan = await tx.taskPlan.findFirst({
          where: { id: input.planId, active: true },
          select: { id: true, name: true, steps: { orderBy: { order: "asc" }, take: 1, select: { afterDays: true } } },
        });
        if (!plan || !plan.steps[0]) throw new TRPCError({ code: "NOT_FOUND", message: "That plan isn't in use." });

        // One at a time. Two plans running on one person is two
        // sequences of contact nobody decided on together.
        const live = await tx.planSubscription.findFirst({
          where: { leadId: lead.id, state: { in: ["RUNNING", "PAUSED"] } },
          select: { plan: { select: { name: true } } },
        });
        if (live) {
          throw new TRPCError({ code: "CONFLICT", message: `They're already on "${live.plan.name}". Stop that first.` });
        }

        const now = new Date();
        const fresh = {
          state: "RUNNING" as const, currentStep: 0,
          nextDueAt: new Date(now.getTime() + plan.steps[0].afterDays * DAY),
          startedAt: now, resumedAt: null, finishedAt: null, endedReason: null,
        };
        // Once finished, a plan can be run again from the start.
        const sub = await tx.planSubscription.upsert({
          where: { leadId_planId: { leadId: lead.id, planId: plan.id } },
          create: { orgId: ctx.orgId, leadId: lead.id, planId: plan.id, ...fresh },
          update: fresh,
        });
        // The suggestion that asked for this is done. Left open, it would
        // sit on Today saying "put them on a plan" about somebody on one.
        await tx.recommendation.updateMany({
          where: { leadId: lead.id, action: "START_PLAN", state: "OPEN" },
          data: { state: "ACTED", resolvedAt: now, resolvedById: ctx.userId },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "plan.subscribe", entity: "Lead", entityId: lead.id,
          after: { plan: plan.name },
        });
        return { id: sub.id, firstDueAt: sub.nextDueAt };
      })
    ),

  /**
   * Carry on after a reply paused it. Deliberate, never automatic
   * (README rule one): the agent has read the reply and decided.
   */
  resume: requirePermission("lead:update")
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const sub = await subscriptionFor(tx, ctx, input.subscriptionId);
        const now = new Date();
        const { count } = await tx.planSubscription.updateMany({
          where: { id: sub.id, state: "PAUSED" },
          data: {
            state: "RUNNING", resumedAt: now,
            // A step that fell due while it was paused waits a day rather
            // than landing the moment it resumes, on top of the reply.
            nextDueAt: sub.nextDueAt && sub.nextDueAt > now ? sub.nextDueAt : new Date(now.getTime() + DAY),
          },
        });
        if (count !== 1) throw new TRPCError({ code: "CONFLICT", message: "It isn't paused." });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "plan.resume", entity: "Lead", entityId: sub.leadId, after: { plan: sub.plan.name },
        });
        return { ok: true };
      })
    ),

  stop: requirePermission("lead:update")
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const sub = await subscriptionFor(tx, ctx, input.subscriptionId);
        const { count } = await tx.planSubscription.updateMany({
          where: { id: sub.id, state: { in: ["RUNNING", "PAUSED"] } },
          data: { state: "STOPPED", finishedAt: new Date(), endedReason: "an agent stopped it" },
        });
        if (count !== 1) throw new TRPCError({ code: "CONFLICT", message: "It has already finished." });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "plan.stop", entity: "Lead", entityId: sub.leadId, after: { plan: sub.plan.name },
        });
        return { ok: true };
      })
    ),
});
