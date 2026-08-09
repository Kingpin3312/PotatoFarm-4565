import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { calculate, shareForAgent, SplitError, type Tier } from "@/server/lib/commission/calculate";
import { aed } from "@/lib/money";
import { audit } from "@/server/lib/audit";

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
      splits: z.array(splitInput).min(1),
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
      splits: z.array(splitInput).min(1),
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

    const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const earned = await ctx.db.commissionSplit.aggregate({
      where: { userId: ctx.userId, paidAt: { gte: yearStart } },
      _sum: { amountFils: true },
    });

    const total = earned._sum.amountFils ?? 0n;
    const tiers = plan.tiers as unknown as Tier[];
    return {
      earnedThisYear: aed(total),
      shareBp: shareForAgent(tiers, total),
      tiers,
    };
  }),
});
