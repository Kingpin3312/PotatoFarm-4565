import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { assessRisk, STEP_STAGES, type RiskInput, type StepStage } from "@/server/lib/deals/risk";
import { plan } from "@/server/lib/deals/timeline";
import { transactionBlockers, refusalMessage } from "@/server/lib/documents/blockers";
import { assessRear, REAR_CASH_THRESHOLD_FILS } from "@/server/lib/aml/rules";

/**
 * Deals, which until now nobody could look at.
 *
 * The module is complete: twelve stages through to DLD transfer, a
 * timeline that plans backwards from the completion date, an assessment
 * of whether that date is still achievable, and a nightly job that
 * raises `DEAL_AT_RISK`. Accepting an offer creates one — `negotiate.ts`
 * does it inside the same transaction.
 *
 * **And there was no router and no screen.** An agent could agree a
 * sale, have the system build a full transfer plan, and then have
 * nowhere to see it. The notification told them a deal was at risk and
 * there was nothing to open.
 *
 * That is the fourth time this shape has appeared in this codebase, and
 * `CLAUDE.md` names the other three. It is why `reachability.py` exists.
 */
export const dealsRouter = router({
  /**
   * The board. Worst first.
   *
   * Not by value and not by date. A deal in trouble is the only thing on
   * this screen anybody needs to act on, and sorting by size buries a
   * collapsing small one under three healthy large ones.
   */
  live: requirePermission("lead:read:own").query(async ({ ctx }) => {
    const rows = await ctx.db.deal.findMany({
      where: { stage: { notIn: ["COMPLETED", "COLLAPSED"] } },
      orderBy: { expectedAt: "asc" },
      take: 200,
      select: {
        id: true, reference: true, stage: true, valueFils: true, type: true, side: true,
        financing: true, sellerHasMortgage: true, contractualCompletionAt: true,
        leadId: true, listing: { select: { building: true, community: true } },
        milestones: {
          select: { stage: true, completedAt: true, blockedReason: true },
        },
      },
    });

    // One query for the people, rather than one per deal. `Deal.leadId`
    // is a bare column with no relation declared, the same omission the
    // schema documents for Offer.
    const leadIds = rows.map((d) => d.leadId).filter((x): x is string => Boolean(x));
    const leads = leadIds.length
      ? await ctx.db.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, name: true, conversation: { select: { lastInboundAt: true } } },
        })
      : [];
    const byId = new Map(leads.map((l) => [l.id, l]));

    const now = new Date();
    const assessed = rows.map((d) => {
      const lead = d.leadId ? byId.get(d.leadId) : undefined;
      const last = lead?.conversation?.lastInboundAt ?? null;

      const risk = assessRisk(toRiskInput(d, lead?.name ?? null, last, now), now);
      return {
        id: d.id,
        reference: d.reference,
        stage: d.stage,
        valueFils: d.valueFils,
        where: d.listing?.building ?? d.listing?.community ?? null,
        counterparty: lead?.name ?? null,
        completionAt: d.contractualCompletionAt,
        level: risk.level,
        reason: risk.reason,
        action: risk.action,
        daysOfSlack: risk.timeline.daysOfSlack,
      };
    });

    const weight = { AT_RISK: 0, WATCH: 1, HEALTHY: 2 } as const;
    assessed.sort((a, b) =>
      weight[a.level] - weight[b.level] ||
      // Then by what is closest to its date, which is what is most
      // urgent within a band.
      (a.completionAt?.getTime() ?? Infinity) - (b.completionAt?.getTime() ?? Infinity)
    );

    return {
      deals: assessed,
      counts: {
        atRisk: assessed.filter((d) => d.level === "AT_RISK").length,
        watch: assessed.filter((d) => d.level === "WATCH").length,
        total: assessed.length,
      },
      /** What is genuinely in play, for the header. */
      valueFils: assessed.reduce((s, d) => s + d.valueFils, 0n),
    };
  }),

  /** One deal, with the whole plan and where it has got to. */
  one: requirePermission("lead:read:own")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const d = await ctx.db.deal.findFirst({
        where: { id: input.id },
        select: {
          id: true, reference: true, stage: true, valueFils: true, type: true, side: true,
          financing: true, sellerHasMortgage: true, contractualCompletionAt: true,
          agreedAt: true, leadId: true,
          listing: { select: { building: true, community: true } },
          milestones: {
            select: {
              stage: true, completedAt: true, blockedReason: true, note: true, dueAt: true,
            },
          },
        },
      });
      if (!d) throw new TRPCError({ code: "NOT_FOUND", message: "No such deal." });

      const lead = d.leadId
        ? await ctx.db.lead.findFirst({
            where: { id: d.leadId },
            select: {
              name: true, assignedToId: true,
              conversation: { select: { lastInboundAt: true } },
            },
          })
        : null;

      const now = new Date();

      /**
       * Shown on the screen, not only enforced at the click.
       *
       * `step` refuses when a blocking document has lapsed. Finding that
       * out by pressing a button and being told no is the worst way to
       * learn it — the agent has already opened the deal believing they
       * can work it. The same query answers it up front.
       */
      const blockers = await transactionBlockers(ctx.db, {
        orgId: ctx.orgId,
        orgName: ctx.orgName,
        people: [ctx.userId, lead?.assignedToId ?? ""],
        now,
      });
      const risk = assessRisk(
        toRiskInput(d, lead?.name ?? null, lead?.conversation?.lastInboundAt ?? null, now),
        now
      );

      /**
       * The plan, merged with what has happened.
       *
       * `plan()` needs a completion date to work backwards from. Without
       * one there is no schedule — the steps are still listed, with no
       * dates against them, rather than dates invented from today.
       */
      const planned = d.contractualCompletionAt
        ? plan({
            financing: d.financing,
            sellerHasMortgage: d.sellerHasMortgage,
            contractualCompletionAt: d.contractualCompletionAt,
          })
        : [];

      const done = new Map(d.milestones.map((m) => [m.stage, m]));
      const steps = planned.map((p) => {
        const m = done.get(p.stage);
        return {
          // plan() walks the transfer stages and never emits COLLAPSED.
          // Narrowed here so the screen gets a stage it can pass straight
          // back to `step` without casting.
          stage: p.stage as StepStage,
          title: p.title,
          owner: p.owner,
          dueAt: p.dueAt,
          completedAt: m?.completedAt ?? null,
          blockedReason: m?.blockedReason ?? null,
          overdue: !m?.completedAt && p.dueAt < now,
        };
      });

      return {
        id: d.id,
        reference: d.reference,
        stage: d.stage,
        valueFils: d.valueFils,
        type: d.type,
        side: d.side,
        financing: d.financing,
        where: d.listing?.building ?? d.listing?.community ?? null,
        counterparty: lead?.name ?? null,
        completionAt: d.contractualCompletionAt,
        agreedAt: d.agreedAt,
        risk,
        steps,
        blockers: blockers.map((b) => ({
          what: b.what, whose: b.whose, daysExpired: b.daysExpired, consequence: b.consequence,
        })),
      };
    }),

  /**
   * Mark a step done, or say why it is stuck.
   *
   * Both in one procedure, because they are the same moment — an agent
   * opening a deal to update it either has good news or knows what is
   * holding it up, and making the second a separate screen is how
   * `blockedReason` stayed empty.
   */
  /**
   * What the client has paid, and whether that makes it reportable.
   *
   * ## The report this exists for
   *
   * A UAE brokerage owes the FIU a **Real Estate Activity Report** when a
   * transaction settles with AED 55,000 or more in cash — a single
   * payment or several linked across ninety days — or with any virtual
   * asset at any amount. `assessRear()` has implemented that rule
   * correctly since it was written, is covered by unit tests, and
   * **nothing called it**: the payments it takes had nowhere to be
   * recorded, so the product held the code that knows a transaction is
   * reportable and never once said so.
   *
   * Linked payments are the half that gets missed. Three payments of
   * twenty thousand across a week are linked and they trigger it, and
   * nobody adding them up in their head reliably notices.
   */
  payments: requirePermission("lead:read:own")
    .input(z.object({ dealId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.dealPayment.findMany({
        where: { dealId: input.dealId },
        orderBy: { receivedAt: "desc" },
        select: {
          id: true, amountFils: true, method: true, receivedAt: true,
          reference: true, note: true,
        },
      });

      return {
        payments: rows,
        totalFils: rows.reduce((n, r) => n + r.amountFils, 0n),
        /**
         * Assessed on every read rather than stored.
         *
         * The answer depends on today's date — the linked window is the
         * last ninety days — so a stored verdict is right on the day it
         * is written and drifts every day after. It is also cheap: a
         * handful of rows and some arithmetic.
         */
        rear: assessRear(rows.map((r) => ({
          amountFils: r.amountFils,
          method: r.method,
          at: r.receivedAt,
        }))),
        thresholdFils: REAR_CASH_THRESHOLD_FILS,
      };
    }),

  /**
   * Record a payment the client has made.
   *
   * `lead:update` rather than a compliance permission, because the
   * person who knows a cheque arrived is the agent running the deal.
   * Deciding what to *do* about a report is the compliance officer's;
   * writing down what was paid is not, and putting this behind a
   * compliance permission would mean the data never gets entered and the
   * assessment never runs.
   */
  recordPayment: requirePermission("lead:update")
    .input(z.object({
      dealId: z.string(),
      amountFils: z.union([z.bigint(), z.number().int().positive()])
        .transform((v) => (typeof v === "number" ? BigInt(v) : v)),
      method: z.enum(["CASH", "TRANSFER", "CHEQUE", "VIRTUAL_ASSET"]),
      receivedAt: z.string().datetime().or(z.date()),
      reference: z.string().trim().max(120).optional(),
      note: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deal = await ctx.db.deal.findFirst({
        where: { id: input.dealId },
        select: { id: true, reference: true },
      });
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "No such deal." });

      const received = new Date(input.receivedAt);
      if (Number.isNaN(received.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That is not a date." });
      }
      /**
       * A payment cannot have arrived in the future.
       *
       * The linked window is measured backwards from now, so a payment
       * dated next month sits outside it and is silently excluded from
       * the assessment — a typo in a date field would quietly suppress a
       * mandatory report.
       */
      if (received.getTime() > Date.now() + 86_400_000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That date is in the future. Record the date the client paid.",
        });
      }

      const row = await ctx.db.dealPayment.create({
        data: {
          orgId: ctx.orgId,
          dealId: input.dealId,
          amountFils: input.amountFils,
          method: input.method,
          receivedAt: received,
          reference: input.reference,
          note: input.note,
          recordedById: ctx.userId,
        },
        select: { id: true },
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "deal.payment_recorded",
        entity: "Deal",
        entityId: deal.reference,
        // The amount and method, because whether a report was owed turns
        // on exactly these two and an audit trail that omits them cannot
        // answer the only question anybody will ask of it.
        after: { amountFils: String(input.amountFils), method: input.method },
      });

      return row;
    }),

  step: requirePermission("lead:update")
    .input(z.object({
      dealId: z.string(),
      stage: z.enum(STEP_STAGES),
      done: z.boolean(),
      blockedReason: z.string().trim().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deal = await ctx.db.deal.findFirst({
        where: { id: input.dealId },
        select: { id: true, reference: true, stage: true, leadId: true },
      });
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "No such deal." });

      /**
       * A lapsed broker card or brokerage licence stops this.
       *
       * `expiry.ts` has carried `blocking: true` on three document types
       * since it was written and nothing acted on it. A warning sixty
       * days out that is then ignored has achieved nothing; this is the
       * point where it cannot be.
       *
       * Checked on the way in and only on `done`. Recording that a step
       * is **stuck** is never blocked — that is somebody telling the
       * truth about a transaction they cannot move, which is exactly
       * what should still be possible while a card is being renewed.
       *
       * The people checked are the one clicking and the one the deal
       * belongs to. Both are acting on it at this moment, one by doing
       * it and one by carrying it, and the exposure is the same either
       * way.
       */
      if (input.done) {
        const agent = deal.leadId
          ? await ctx.db.lead.findFirst({ where: { id: deal.leadId }, select: { assignedToId: true } })
          : null;

        const blockers = await transactionBlockers(ctx.db, {
          orgId: ctx.orgId,
          orgName: ctx.orgName,
          people: [ctx.userId, agent?.assignedToId ?? ""],
        });

        if (blockers.length > 0) {
          // Audited whether or not it is overridden, because "we stopped
          // them and they stopped" is the evidence that the control
          // worked, and nothing else records it.
          await audit(ctx.db, ctx.orgId, {
            actorId: ctx.userId,
            action: "deal.step.refused",
            entity: "Deal",
            entityId: deal.id,
            after: {
              stage: input.stage,
              blockedBy: blockers.map((b) => `${b.type}:${b.whose}`),
            },
          });
          throw new TRPCError({ code: "FORBIDDEN", message: refusalMessage(blockers) });
        }
      }

      await ctx.db.dealMilestone.upsert({
        where: { dealId_stage: { dealId: deal.id, stage: input.stage } },
        create: {
          orgId: ctx.orgId, dealId: deal.id, stage: input.stage,
          completedAt: input.done ? new Date() : null,
          completedById: input.done ? ctx.userId : null,
          // Clearing the block is the same action as recording one.
          blockedReason: input.done ? null : (input.blockedReason ?? null),
        },
        update: {
          completedAt: input.done ? new Date() : null,
          completedById: input.done ? ctx.userId : null,
          blockedReason: input.done ? null : (input.blockedReason ?? null),
        },
      });

      /**
       * The deal's own stage follows the furthest completed step.
       *
       * Derived rather than set by hand. Two places recording how far
       * along a deal is will disagree, and the milestones are the ones
       * with evidence behind them.
       */
      if (input.done) {
        const completed = await ctx.db.dealMilestone.findMany({
          where: { dealId: deal.id, completedAt: { not: null } },
          select: { stage: true },
        });
        // `indexOf` on a narrower tuple than DealStage: COLLAPSED is a
        // real stage and is deliberately absent from ORDER, so it is
        // filtered rather than cast. A collapsed deal has no "furthest
        // step" and must not be dragged forward by this.
        const furthest = completed
          .map((m) => (STEP_STAGES as readonly string[]).indexOf(m.stage))
          .reduce((a, b) => Math.max(a, b), -1);
        const next = STEP_STAGES[furthest];
        if (next && next !== deal.stage) {
          await ctx.db.deal.update({
            where: { id: deal.id },
            data: { stage: next, ...(next === "COMPLETED" ? { completedAt: new Date() } : {}) },
          });
        }
      }

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: input.done ? "deal.step.completed" : "deal.step.blocked",
        entity: "Deal",
        entityId: deal.id,
        after: { stage: input.stage, blockedReason: input.blockedReason ?? null },
      });

      return { ok: true as const };
    }),
});

/** One shape, so the list and the detail cannot judge a deal differently. */
function toRiskInput(
  d: {
    reference: string; stage: RiskInput["stage"]; financing: RiskInput["financing"];
    sellerHasMortgage: boolean; contractualCompletionAt: Date | null;
    milestones: { stage: RiskInput["stage"]; completedAt: Date | null; blockedReason: string | null }[];
  },
  counterparty: string | null,
  lastInboundAt: Date | null,
  now: Date
): RiskInput {
  return {
    reference: d.reference,
    stage: d.stage,
    financing: d.financing,
    sellerHasMortgage: d.sellerHasMortgage,
    contractualCompletionAt: d.contractualCompletionAt,
    completed: d.milestones.filter((m) => m.completedAt).map((m) => m.stage),
    blocked: d.milestones
      .filter((m) => !m.completedAt && m.blockedReason)
      .map((m) => ({ stage: m.stage, reason: m.blockedReason! })),
    daysSinceContact: lastInboundAt
      ? Math.floor((now.getTime() - lastInboundAt.getTime()) / 86_400_000)
      : null,
    counterparty,
  };
}
