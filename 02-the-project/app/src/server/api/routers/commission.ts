import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import {
  calculate, shareForAgent, SplitError, parseTiers, serialiseTiers, type Tier,
} from "@/server/lib/commission/calculate";
import { aed, aedToFils } from "@/lib/money";
import { audit } from "@/server/lib/audit";
import { can } from "@/server/auth/rbac";

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

/** A split with no person on it is named by its role. */
const sentenceRole = (r: string) =>
  r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, " ");


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
        /**
         * Billed to the client and not yet in the brokerage's account.
         *
         * An INVOICED commission appeared in none of the three figures
         * above — not paid, not owed, not forecast — so the moment a fee
         * was invoiced it vanished from the agent's screen until it was
         * received. Nothing could invoice one until now, which is the
         * only reason nobody saw it happen.
         */
        invoiced: aed(sum((s) => s.commission.status === "INVOICED")),
        forecast: aed(sum((s) => s.commission.status === "FORECAST")),
        rows: splits.map((s) => ({
          deal: s.commission.deal.reference,
          amount: aed(s.amountFils),
          state: s.paidAt ? "paid" : s.commission.status.toLowerCase(),
          completedAt: s.commission.deal.completedAt,
        })),
      };
    }),

  /**
   * Commissions still in motion, for the person who runs the books.
   *
   * Forecast and invoiced fees, and received ones with a share still to
   * pay out. A fee fully settled drops off; a written-off one too, since
   * the report above counts those.
   */
  ledger: requirePermission("revenue:read").query(async ({ ctx }) => {
    const rows = await ctx.db.commission.findMany({
      where: {
        OR: [
          { status: { in: ["FORECAST", "INVOICED"] } },
          { status: "RECEIVED", splits: { some: { paidAt: null, role: { not: "BROKERAGE" } } } },
        ],
      },
      orderBy: { id: "desc" },
      take: 100,
      select: {
        id: true, status: true, grossFils: true, invoicedAt: true, receivedAt: true,
        deal: { select: { reference: true } },
        splits: {
          select: { id: true, userId: true, externalName: true, role: true, amountFils: true, paidAt: true, paidRef: true },
          orderBy: { amountFils: "desc" },
        },
      },
    });
    const ids = [...new Set(rows.flatMap((r) => r.splits.map((s) => s.userId)).filter((x): x is string => !!x))];
    const users = ids.length
      ? await ctx.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));
    return {
      canSettle: can(ctx.role, "commission:settle"),
      rows: rows.map((r) => ({
        id: r.id, deal: r.deal.reference, status: r.status, gross: aed(r.grossFils),
        invoicedAt: r.invoicedAt, receivedAt: r.receivedAt,
        splits: r.splits.map((s) => ({
          id: s.id, role: s.role, amount: aed(s.amountFils), paidAt: s.paidAt, paidRef: s.paidRef,
          who: s.userId ? (nameOf.get(s.userId) ?? "Former colleague")
             : s.role === "BROKERAGE" ? "The brokerage" : (s.externalName ?? sentenceRole(s.role)),
          payable: s.role !== "BROKERAGE",
        })),
      })),
    };
  }),

  /**
   * Move a commission along: invoiced, received, written off.
   *
   * ## Why this exists
   *
   * `Commission.status` was declared with four values and **nothing ever
   * set it past FORECAST**. `commission.mine` computes "owed to you" from
   * RECEIVED, and the revenue report dates everything it earned by
   * `receivedAt` — so every agent was owed nothing, and every brokerage
   * had earned nothing, for as long as the product has existed. The
   * report's own comment warns that a screen showing zero "reads as 'we
   * earned nothing', which is the reassuring direction to be wrong in".
   * It was wrong in exactly that direction, for everybody.
   *
   * The allowed moves are the ones a finance person actually makes. A
   * received fee can go back to invoiced — a mis-click on a button that
   * says "received" must be undoable — but not once anybody has been
   * paid out of it, because then the money has moved and the record of
   * it has to stand. The update is conditional on the status it was
   * read with, so two people pressing at once cannot both win.
   */
  setStatus: requirePermission("commission:settle")
    .input(z.object({
      id: z.string(),
      to: z.enum(["INVOICED", "RECEIVED", "WRITTEN_OFF"]),
      /** When it happened. Defaults to now; a date in the future is refused. */
      at: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const at = input.at ?? new Date();
      if (at.getTime() > Date.now() + 86_400_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That date is in the future." });
      }
      return ctx.db.$transaction(async (tx) => {
        const c = await tx.commission.findUnique({
          where: { id: input.id },
          select: { id: true, status: true, invoicedAt: true, receivedAt: true, splits: { select: { paidAt: true } } },
        });
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });

        const allowed: Record<string, string[]> = {
          FORECAST: ["INVOICED", "RECEIVED", "WRITTEN_OFF"],
          INVOICED: ["RECEIVED", "WRITTEN_OFF"],
          RECEIVED: ["INVOICED"],
          WRITTEN_OFF: ["INVOICED", "RECEIVED"],
        };
        if (!allowed[c.status]?.includes(input.to)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: (() => {
              const from = c.status.toLowerCase().replace("_", " ");
              return `${/^[aeiou]/.test(from) ? "An" : "A"} ${from} commission cannot be marked ${input.to.toLowerCase().replace("_", " ")}.`;
            })(),
          });
        }
        if (c.status === "RECEIVED" && c.splits.some((s) => s.paidAt)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Somebody has already been paid from this commission, so it stays received.",
          });
        }

        const data =
          input.to === "INVOICED" ? { status: "INVOICED" as const, invoicedAt: c.invoicedAt ?? at, receivedAt: null }
          : input.to === "RECEIVED" ? { status: "RECEIVED" as const, receivedAt: at }
          : { status: "WRITTEN_OFF" as const };

        const { count } = await tx.commission.updateMany({ where: { id: c.id, status: c.status }, data });
        if (count !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "Somebody else changed this commission just now. Refresh and try again." });
        }
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "commission.status",
          entity: "Commission", entityId: c.id,
          before: { status: c.status }, after: { status: input.to, at: at.toISOString() },
        });
        return { id: c.id, status: input.to };
      });
    }),

  /**
   * An agent's share, paid.
   *
   * `CommissionSplit.paidAt` was read by three screens — "paid", "owed",
   * the unpaid column on the revenue board — and written by nothing.
   * Only once the brokerage has the money: "owed to you" means received
   * and not yet paid, and paying out of a fee still on an invoice is an
   * advance, which is a different conversation. The brokerage's own
   * share is not "paid" to anybody.
   */
  markPaid: requirePermission("commission:settle")
    .input(z.object({
      splitId: z.string(),
      /** The transfer or payslip reference, so the payment can be found again. */
      reference: z.string().trim().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const s = await tx.commissionSplit.findUnique({
          where: { id: input.splitId },
          select: { id: true, role: true, paidAt: true, amountFils: true, userId: true,
                    commission: { select: { id: true, status: true } } },
        });
        if (!s) throw new TRPCError({ code: "NOT_FOUND" });
        if (s.role === "BROKERAGE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The brokerage's own share is not paid out to anybody." });
        }
        if (s.commission.status !== "RECEIVED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Mark the commission received before paying anybody from it." });
        }
        const { count } = await tx.commissionSplit.updateMany({
          where: { id: s.id, paidAt: null },
          data: { paidAt: new Date(), paidRef: input.reference || null },
        });
        if (count !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "That share has already been paid." });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "commission.paid",
          entity: "CommissionSplit", entityId: s.id,
          after: { commissionId: s.commission.id, userId: s.userId, amount: s.amountFils.toString(), reference: input.reference ?? null },
        });
        return { id: s.id, paid: true };
      })
    ),

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
  /**
   * What the brokerage earned, across everybody.
   *
   * ## The gap this closes
   *
   * Every other money read in this product scopes to the caller —
   * `mine` filters on `userId`, `myTier` filters on `userId` — which is
   * right for an agent and left the owner of the business with **no way
   * to see what the business made.** A brokerage could run the whole
   * product for a year and never be told its own revenue by it.
   *
   * ## Gross, not net of splits
   *
   * The headline figures are the **commission the brokerage invoiced**,
   * not the sum of the splits. Those are different numbers and confusing
   * them is the classic double-count: an agent's 40% and the firm's 60%
   * of the same fee add to the fee, and adding them to the fee again
   * reports 200% of a year's earnings. `byAgent` below reports splits;
   * the totals report commissions; they are labelled as what they are.
   *
   * ## The four states are not three
   *
   * `WRITTEN_OFF` is reported separately rather than dropped, because a
   * brokerage that writes off a fifth of its invoices has a problem that
   * a revenue figure alone hides — and a written-off commission
   * disappearing from every total is exactly how it stays hidden.
   */
  brokerage: requirePermission("revenue:read")
    .input(z.object({ from: z.date().optional(), to: z.date().optional() }).optional())
    .query(async ({ ctx, input }) => {
      /**
       * The last twelve months. A default rather than a required range,
       * for the same reason the reports screen has no date picker: the
       * question an owner opens this to ask is "how are we doing", not
       * "what happened between two dates I typed".
       */
      const to = input?.to ?? new Date();
      const from = input?.from ?? new Date(to.getTime() - 365 * 86_400_000);

      /**
       * ## Two groups of figures, and they are dated differently
       *
       * **Earned in the period** is dated by `receivedAt` — when the
       * money actually arrived. **Owed, forecast and written off** are
       * current state and are deliberately *not* windowed: an owner
       * asking what they are owed wants everything outstanding, not what
       * happened to be invoiced inside an arbitrary year.
       *
       * The first version of this dated everything by the deal's
       * completion, which was wrong in the way that matters most — it
       * reported **zero revenue on a brokerage with two paid
       * commissions**, because `Deal.completedAt` is only written when a
       * transfer completes and a fee is routinely invoiced and paid
       * before that. A screen showing nothing does not read as "this
       * filter excluded everything". It reads as "we earned nothing",
       * which is the reassuring direction to be wrong in and therefore
       * the dangerous one.
       */
      const [earned, outstanding] = await Promise.all([
        ctx.db.commission.findMany({
          where: { status: "RECEIVED", receivedAt: { gte: from, lte: to } },
          select: {
            grossFils: true, vatFils: true, receivedAt: true,
            deal: { select: { id: true, valueFils: true } },
            splits: {
              select: { amountFils: true, paidAt: true, userId: true, externalName: true, role: true },
            },
          },
        }),
        ctx.db.commission.findMany({
          where: { status: { in: ["INVOICED", "FORECAST", "WRITTEN_OFF"] } },
          select: { grossFils: true, status: true },
        }),
      ]);

      /**
       * A commission marked received with no date on it.
       *
       * It cannot appear in a windowed total or on a monthly chart, and
       * dropping it silently is how money goes missing from a report
       * that still looks complete. Counted, returned, and said out loud
       * on the screen.
       */
      const undated = await ctx.db.commission.count({
        where: { status: "RECEIVED", receivedAt: null },
      });

      const totalOf = (status: string) =>
        outstanding.filter((c) => c.status === status).reduce((n, c) => n + c.grossFils, 0n);

      const receivedFils = earned.reduce((n, c) => n + c.grossFils, 0n);

      /**
       * By agent, from the splits — the only place a person's share is
       * recorded, and a different number from the totals above.
       *
       * These are **shares of** those fees, not additional fees. An
       * agent's 40% and the firm's 60% of one commission sum to that
       * commission; adding them to it again reports twice a year's
       * earnings, which is the classic way a revenue screen lies.
       *
       * A split can belong to an external referrer with no user account,
       * or to the brokerage itself. Both are kept and named rather than
       * dropped: a firm paying a third of its fees to introducers should
       * see that beside what its own people earned.
       */
      const people = new Map<string, {
        key: string; external: string | null; userId: string | null;
        role: string; earnedFils: bigint; unpaidFils: bigint; deals: number;
      }>();
      for (const c of earned) {
        for (const sp of c.splits) {
          const key = sp.userId ?? `external:${sp.externalName ?? sp.role}`;
          const row = people.get(key) ?? {
            key, external: sp.externalName ?? null, userId: sp.userId ?? null,
            role: sp.role, earnedFils: 0n, unpaidFils: 0n, deals: 0,
          };
          row.earnedFils += sp.amountFils;
          if (!sp.paidAt) row.unpaidFils += sp.amountFils;
          row.deals += 1;
          people.set(key, row);
        }
      }

      // The names, in one query rather than one per split.
      const userIds = [...people.values()].map((p) => p.userId).filter((x): x is string => Boolean(x));
      const users = userIds.length
        ? await ctx.db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
      const nameFor = new Map(users.map((u) => [u.id, u.name ?? u.email]));

      /**
       * By month, oldest first, with **every month in the range present**
       * whether or not it earned anything.
       *
       * A chart built only from the months that have rows draws a smooth
       * line straight through a quarter with no revenue in it, which is
       * the one shape an owner most needs to see.
       */
      const months = new Map<string, bigint>();
      const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      while (cursor <= to) {
        months.set(cursor.toISOString().slice(0, 7), 0n);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      for (const c of earned) {
        if (!c.receivedAt) continue;
        const key = c.receivedAt.toISOString().slice(0, 7);
        if (months.has(key)) months.set(key, (months.get(key) ?? 0n) + c.grossFils);
      }

      return {
        from,
        to,
        /** Earned in the window, dated by when the money arrived. */
        received: aed(receivedFils),
        vat: aed(earned.reduce((n, c) => n + c.vatFils, 0n)),
        deals: earned.length,
        /**
         * The property value those fees were earned on, counted **once
         * per property**.
         *
         * This summed `deal.valueFils` per commission, and there is no
         * unique constraint on `Commission.dealId` — deliberately,
         * because a deal can carry more than one fee: both sides of the
         * same transaction, or a referral alongside the selling
         * commission. The deals screen has a "Record another" button for
         * exactly that.
         *
         * So two fees on one eleven-million-dirham sale reported
         * **twenty-two million of property transacted**. Nothing errors;
         * the headline commission stays right and the context figure
         * beside it silently doubles, which is the worst direction for a
         * number an owner quotes to somebody else.
         */
        transacted: aed(
          [...new Map(earned.map((c) => [c.deal.id, c.deal.valueFils])).values()]
            .reduce((n, v) => n + v, 0n),
        ),
        undated,
        /** Where the brokerage stands today, at any date. */
        invoiced: aed(totalOf("INVOICED")),
        invoicedCount: outstanding.filter((c) => c.status === "INVOICED").length,
        forecast: aed(totalOf("FORECAST")),
        forecastCount: outstanding.filter((c) => c.status === "FORECAST").length,
        writtenOff: aed(totalOf("WRITTEN_OFF")),
        writtenOffCount: outstanding.filter((c) => c.status === "WRITTEN_OFF").length,
        byAgent: [...people.values()]
          .sort((a, b) => (b.earnedFils > a.earnedFils ? 1 : b.earnedFils < a.earnedFils ? -1 : 0))
          .map((p) => ({
            key: p.key,
            name: p.userId
              ? nameFor.get(p.userId) ?? "A former member"
              : p.external ?? sentenceRole(p.role),
            /**
             * Three kinds, not two.
             *
             * This returned a bare `external: !userId`, and the screen
             * rendered that as "not on the team" — which put the tag on
             * the **brokerage's own share**, telling an owner their firm
             * was an outside party to its own fee. A referrer and the
             * house are both "not a user" and they are not the same
             * thing at all.
             */
            kind: p.userId ? ("user" as const)
              : p.role === "BROKERAGE" ? ("brokerage" as const)
              : ("external" as const),
            earned: aed(p.earnedFils),
            unpaid: p.unpaidFils > 0n ? aed(p.unpaidFils) : null,
            deals: p.deals,
          })),
        byMonth: [...months.entries()].map(([month, fils]) => ({
          month, amount: aed(fils), fils,
        })),
      };
    }),
});
