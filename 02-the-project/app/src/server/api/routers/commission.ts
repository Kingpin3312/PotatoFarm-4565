import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import {
  calculate, shareForAgent, SplitError, parseTiers, serialiseTiers, type Tier,
} from "@/server/lib/commission/calculate";
import { aed, aedToFils } from "@/lib/money";
import { audit } from "@/server/lib/audit";

/**
 * The whole fee to the brokerage, when no split has been entered.
 *
 * `calculate()` refuses anything that does not total 100% — deliberately,
 * because silently scaling a 99% split set pays somebody the wrong
 * amount. So "no splits" cannot mean an empty array; it has to mean one
 * share of 100%.
 *
 * The brokerage taking the whole fee is a real arrangement and the
 * honest default. The screen does not yet collect splits — it has a rate
 * field and nothing else — and was calling both of these without the
 * argument they require, so neither the preview nor the recording could
 * run at all.
 */
const WHOLE_FEE_TO_BROKERAGE = [{ role: "BROKERAGE" as const, shareBp: 10_000 }];

const splitInput = z.object({
  userId: z.string().optional(),
  externalName: z.string().max(80).optional(),
  role: z.enum(["LISTING_AGENT", "SELLING_AGENT", "REFERRER", "MANAGER", "BROKERAGE"]),
  shareBp: z.number().int().min(0).max(10_000),
});

export const commissionRouter = router({
  /** What an agent is owed. The question that opens every demo. */
  mine: orgProcedure
    .input(z.object({ from: z.date().optional(), to: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      const splits = await ctx.db.commissionSplit.findMany({
        where: {
          userId: ctx.userId,
          ...(input.from && { commission: { deal: { completedAt: { gte: input.from, lte: input.to } } } }),
        },
        include: {
          commission: {
            select: {
              status: true, receivedAt: true,
              deal: { select: { reference: true, valueFils: true, stage: true, completedAt: true } },
            },
          },
        },
        orderBy: { id: "desc" },
      });

      const sum = (f: (s: (typeof splits)[number]) => boolean) =>
        splits.filter(f).reduce((n, s) => n + s.amountFils, 0n);

      return {
        // Three numbers, in the order an agent cares about them.
        paid: aed(sum((s) => s.paidAt !== null)),
        owed: aed(sum((s) => s.paidAt === null && s.commission.status === "RECEIVED")),
        forecast: aed(sum((s) => s.commission.status === "FORECAST")),
        rows: splits.map((s) => ({
          deal: s.commission.deal.reference,
          amount: aed(s.amountFils),
          state: s.paidAt ? "paid" : s.commission.status.toLowerCase(),
          completedAt: s.commission.deal.completedAt,
        })),
      };
    }),

  /** Dry run, so a split can be argued with before it is saved. */
  preview: orgProcedure
    .input(z.object({
      dealValueFils: z.bigint().positive(),
      rateBp: z.number().int().min(1).max(2_000),
      splits: z.array(splitInput).min(1).default(WHOLE_FEE_TO_BROKERAGE),
    }))
    .query(({ input }) => {
      try {
        const r = calculate(input);
        return {
          ok: true as const,
          gross: aed(r.grossFils), vat: aed(r.vatFils), net: aed(r.netFils),
          splits: r.splits.map((s) => ({ ...s, amount: aed(s.amountFils) })),
        };
      } catch (err) {
        if (err instanceof SplitError) return { ok: false as const, error: err.message };
        throw err;
      }
    }),

  record: requirePermission("lead:update")
    .input(z.object({
      dealId: z.string(),
      rateBp: z.number().int().min(1).max(2_000),
      splits: z.array(splitInput).min(1).default(WHOLE_FEE_TO_BROKERAGE),
    }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const deal = await tx.deal.findUnique({
          where: { id: input.dealId },
          select: { id: true, valueFils: true },
        });
        if (!deal) throw new TRPCError({ code: "NOT_FOUND" });

        let calc;
        try {
          calc = calculate({ dealValueFils: deal.valueFils, rateBp: input.rateBp, splits: input.splits });
        } catch (err) {
          if (err instanceof SplitError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          throw err;
        }

        const commission = await tx.commission.create({
          data: {
            orgId: ctx.orgId, dealId: deal.id, rateBp: input.rateBp,
            grossFils: calc.grossFils, vatFils: calc.vatFils, netFils: calc.netFils,
            splits: {
              create: calc.splits.map((s) => ({
                orgId: ctx.orgId, userId: s.userId, externalName: s.externalName,
                role: s.role, shareBp: s.shareBp, amountFils: s.amountFils,
              })),
            },
          },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "commission.record",
          entity: "Commission", entityId: commission.id,
          after: { rateBp: input.rateBp, gross: commission.grossFils.toString() },
        });
        return commission;
      })
    ),

  /** The agent's band, from what they have earned this year. */
  myTier: orgProcedure.query(async ({ ctx }) => {
    const plan = await ctx.db.commissionPlan.findFirst({
      where: { userId: ctx.userId, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!plan) return null;

    // Parsed, not cast. See `parseTiers` — the cast this replaces would
    // hand a string threshold straight into a bigint comparison.
    const tiers = parseTiers(plan.tiers);
    if (!tiers) return null;

    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const earned = await ctx.db.commissionSplit.aggregate({
      where: { userId: ctx.userId, paidAt: { gte: yearStart } },
      _sum: { amountFils: true },
    });

    const total = earned._sum.amountFils ?? 0n;
    return {
      earnedThisYear: aed(total),
      shareBp: shareForAgent(tiers, total),
      // Serialised back on the way out: tRPC can carry a bigint, but the
      // screen renders these with `aed()` and every other money value on
      // the wire in this codebase is a string.
      tiers: tiers.map((t) => ({ fromFils: t.fromFils.toString(), shareBp: t.shareBp })),
    };
  }),

  /**
   * Every member's plan.
   *
   * **Nothing ever wrote a `CommissionPlan`.** `myTier` read one and
   * returned null when it found none, which is every brokerage — so the
   * line telling an agent what share they are on simply never appeared,
   * and the tiering engine underneath it had never run against real
   * data.
   *
   * Owner-facing, so it lists people with no plan too. A brokerage's
   * commission structure is a thing you check for gaps, and a list that
   * only shows the configured half cannot show you the gap.
   */
  plans: requirePermission("member:update").query(async ({ ctx }) => {
    const members = await ctx.db.membership.findMany({
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });

    const current = await ctx.db.commissionPlan.findMany({
      where: { effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });

    return members.map((m) => {
      const plan = current.find((p) => p.userId === m.userId);
      const tiers = plan ? parseTiers(plan.tiers) : null;
      return {
        userId: m.userId,
        role: m.role,
        name: m.user.name ?? m.user.email,
        effectiveFrom: plan?.effectiveFrom ?? null,
        // A plan that exists but cannot be parsed is not "no plan" — it
        // is a plan nobody can rely on, and saying so is the only way it
        // gets fixed.
        malformed: Boolean(plan) && tiers === null,
        tiers: tiers
          ? tiers.map((t) => ({ fromFils: t.fromFils.toString(), shareBp: t.shareBp }))
          : null,
      };
    });
  }),

  /**
   * Set someone's plan.
   *
   * **A plan is never edited.** Changing the tiers in place would
   * silently restate what an agent was owed for work already done, and
   * the argument that follows is about somebody's pay — the same reason
   * an offer is never edited in this codebase. Setting a plan closes the
   * current one with `effectiveTo` and writes a new row, so what was in
   * force in March is still readable in December.
   *
   * Both writes go in one transaction. Half of this — a closed plan and
   * no replacement — leaves an agent on no plan at all, which reads on
   * their screen as their commission having been removed.
   */
  setPlan: requirePermission("member:update")
    .input(z.object({
      userId: z.string(),
      tiers: z.array(z.object({
        /** AED, converted here. The client sends what was typed. */
        fromAed: z.number().min(0).max(1_000_000_000),
        shareBp: z.number().int().min(0).max(10_000),
      })).min(1).max(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.membership.findFirst({
        where: { userId: input.userId },
        select: { userId: true },
      });
      // Scoped by RLS already, but an explicit check turns "silently did
      // nothing" into an answer.
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member of this brokerage." });

      const tiers: Tier[] = input.tiers
        .map((t) => ({ fromFils: aedToFils(t.fromAed), shareBp: t.shareBp }))
        .sort((a, b) => (a.fromFils < b.fromFils ? -1 : a.fromFils > b.fromFils ? 1 : 0));

      /**
       * The first band has to start at zero.
       *
       * `shareForAgent` falls back to the lowest band for anything below
       * the first threshold, so a plan starting at AED 500,000 quietly
       * pays the 500,000 rate to an agent who has earned nothing. That
       * is generous rather than dangerous, and it is still not what
       * anybody typed.
       */
      if (tiers[0]!.fromFils !== 0n) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The first band must start at 0 — it is the rate before any threshold is met.",
        });
      }

      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i]!.fromFils === tiers[i - 1]!.fromFils) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Two bands start at the same figure. Each band needs its own threshold.",
          });
        }
      }

      const now = new Date();
      const plan = await ctx.db.$transaction(async (tx) => {
        await tx.commissionPlan.updateMany({
          where: { userId: input.userId, effectiveTo: null },
          data: { effectiveTo: now },
        });
        return tx.commissionPlan.create({
          data: {
            orgId: ctx.orgId,
            userId: input.userId,
            tiers: serialiseTiers(tiers),
            effectiveFrom: now,
          },
          select: { id: true, effectiveFrom: true },
        });
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "commission.setPlan",
        entity: "CommissionPlan",
        entityId: plan.id,
        // The bands themselves, because "the plan changed" is not a
        // record anybody can settle a dispute with.
        after: {
          userId: input.userId,
          tiers: tiers.map((t) => `${t.fromFils} -> ${t.shareBp}bp`),
        },
      });

      return plan;
    }),
});
