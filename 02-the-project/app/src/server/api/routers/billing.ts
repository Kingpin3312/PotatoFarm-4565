import { usage } from "@/server/lib/billing/conversations";
import { limitAll, keysFor } from "@/server/lib/ratelimit";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission, publicProcedure } from "../trpc";
import { signup, trialHealth, MIN_SEATS, TRIAL_DAYS } from "@/server/lib/billing/signup";
import { beginCardSetup, cardSummary } from "@/server/lib/billing/card";
import { seatDays } from "@/server/lib/billing/seats";
import { explain } from "@/server/lib/billing/invoice";
import { supplierTrn, vatRateBp, supplierDetails } from "@/server/lib/billing/number";
import { audit } from "@/server/lib/audit";
import { aed, usd, priced } from "@/lib/money";

/**
 * The VAT the next invoice will carry, as the screen should say it —
 * "5%", or null while PotatoFarm is not registered. It said "5%" as a
 * constant, so every brokerage was quoted a tax that may not be charged.
 * A malformed TRN reads as null here; the boot log and the invoice job
 * both refuse it loudly, and a pricing screen is not the place to fail.
 */
function vatShown(): string | null {
  try {
    const rate = vatRateBp(supplierTrn());
    return rate ? `${rate / 100}%` : null;
  } catch {
    return null;
  }
}

export const billingRouter = router({
  /**
   * Sign-up. Public by necessity — there is no tenant yet, which is the
   * whole point of it.
   *
   * Rate limiting sits at the edge rather than here; a public mutation
   * that creates a database row is the one endpoint worth protecting
   * before launch.
   */
  signup: publicProcedure
    .input(z.object({
      brokerageName: z.string().trim().min(2).max(120),
      ownerEmail: z.string().trim().toLowerCase().email(),
      ownerName: z.string().trim().min(2).max(80),
      seats: z.number().int().min(1).max(500),
      trn: z.string().trim().max(20).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // The only endpoint a stranger can use to write to the database.
      // Checked on IP and email independently, so a single actor is
      // caught by whichever they did not think to change.
      const verdict = await limitAll("billing.signup", keysFor({
        ip: ctx.ip, email: input.ownerEmail,
      }));
      if (!verdict.ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many attempts. Try again shortly, or email hello@potatofarm.io and a person will set you up.",
        });
      }

      const price = process.env.SEAT_PRICE_FILS;
      if (!price) {
        // Refused rather than defaulted. A default price is how a
        // brokerage ends up on a number nobody chose.
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No seat price is configured. Sign-up is closed until one is set.",
        });
      }
      const result = await signup({ ...input, seatPriceFils: BigInt(price) });
      if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.reason });
      return result;
    }),

  /** What the sign-up form needs to know without a session. */
  terms: publicProcedure.query(() => ({
    minSeats: MIN_SEATS,
    trialDays: TRIAL_DAYS,
    // Both, always. A brokerage owner compares software in dollars and
    // pays his accountant in dirhams, and quoting only one of those
    // means somebody does arithmetic in a meeting.
    seatPrice: process.env.SEAT_PRICE_FILS
      ? priced(BigInt(process.env.SEAT_PRICE_FILS))
      : null,
    /** What eight agents actually costs, because that is the number a
     *  brokerage owner is doing in his head while you talk. */
    exampleMonthly: process.env.SEAT_PRICE_FILS
      ? priced(BigInt(process.env.SEAT_PRICE_FILS) * BigInt(MIN_SEATS))
      : null,
    vatRate: vatShown(),
    cardRequiredUpFront: false,
  })),

  /** Where the brokerage stands. Any member — an agent should be able to
   *  see that the assistant is off for billing rather than broken. */
  status: orgProcedure.query(async ({ ctx }) => {
    const sub = await ctx.db.subscription.findUnique({ where: { orgId: ctx.orgId } });
    if (!sub) return { subscribed: false as const };

    const { seatDays: used, seatsAtEnd, fullPeriodDays } = await seatDays(
      sub.id, sub.currentFrom, new Date()
    );
    const card = await cardSummary(ctx.orgId);
    const u = await usage(sub.id, sub.currentFrom, new Date());

    // In fils throughout, as the invoice is. This went through a double
    // (`Number(price) / days * used`), the one money sum left in the
    // billing path that did after the invoice itself was fixed.
    const seatFils = (sub.seatPriceFils * BigInt(used)) / BigInt(fullPeriodDays);

    return {
      subscribed: true as const,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      daysLeft: sub.trialEndsAt
        ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000))
        : null,
      seats: seatsAtEnd,
      // Shown live rather than at month end. A brokerage that adds four
      // agents on the 3rd should see the bill move that day, not be
      // surprised on the 1st.
      // The running bill in both. Charged in AED — that is what the
      // invoice will say, and what any VAT would be computed on.
      runningTotal: priced(seatFils + u.overageFils),
      vatRate: vatShown(),

      /**
       * The bill, itemised.
       *
       * The screen shows seats and conversations as separate lines and
       * warns at 80% of the allowance — it read `data.breakdown` and
       * `status` never returned one, so the whole panel rendered nothing
       * and a brokerage would first learn it had gone over when the
       * invoice arrived. That is the precise outcome the allowance
       * warning exists to prevent.
       *
       * `runningTotal` now includes the overage too. It was seats only,
       * so a firm past its allowance was shown a running total lower
       * than the bill it was going to get.
       */
      breakdown: {
        answered: u.answered,
        included: u.included,
        over: u.over,
        usedPct: u.usedPct,
        seats: priced(seatFils),
        overage: priced(u.overageFils),
      },
      card,
    };
  }),

  /** Start adding a card. Owner and admin only — this is the money. */
  addCard: requirePermission("org:update").mutation(async ({ ctx }) => {
    const org = await ctx.db.organisation.findUniqueOrThrow({
      where: { id: ctx.orgId }, select: { name: true },
    });
    const me = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.userId }, select: { email: true },
    });
    const res = await beginCardSetup({
      orgId: ctx.orgId, orgName: org.name, email: me.email, actorId: ctx.userId,
    });
    if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: res.reason });
    return { clientSecret: res.clientSecret };
  }),

  /** Every invoice, with the arithmetic. A bill you cannot check is a
   *  bill you argue about. */
  invoices: requirePermission("org:update").query(async ({ ctx }) => {
    const rows = await ctx.db.invoice.findMany({
      orderBy: { issuedAt: "desc" }, take: 24,
    });
    return rows.map((i) => ({
      number: i.number,
      period: `${i.periodFrom.toISOString().slice(0, 10)} to ${i.periodTo.toISOString().slice(0, 10)}`,
      total: aed(i.totalFils),
      status: i.status,
      dueAt: i.dueAt,
      lines: explain(i),
    }));
  }),

  /**
   * Who the invoice is addressed to. The TRN was taken at sign-up, where
   * it is optional, and nothing could set it afterwards — so a brokerage
   * that skipped it could never get an invoice carrying it.
   */
  details: requirePermission("org:update").query(async ({ ctx }) => {
    const [org, sub] = await Promise.all([
      ctx.db.organisation.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true } }),
      ctx.db.subscription.findUnique({ where: { orgId: ctx.orgId }, select: { trn: true, billingAddress: true } }),
    ]);
    return { name: org.name, trn: sub?.trn ?? "", billingAddress: sub?.billingAddress ?? "" };
  }),

  setDetails: requirePermission("org:update")
    .input(z.object({
      billingAddress: z.string().trim().max(400),
      // Fifteen digits, as on the FTA certificate, or nothing. Spaces are
      // how people copy it off the certificate.
      trn: z.string().transform((t) => t.replace(/\s/g, ""))
        .refine((t) => t === "" || /^\d{15}$/.test(t), "A UAE TRN is fifteen digits."),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const sub = await tx.subscription.findUnique({ where: { orgId: ctx.orgId }, select: { id: true } });
        if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "No subscription on this brokerage." });
        await tx.subscription.update({
          where: { id: sub.id },
          data: { billingAddress: input.billingAddress || null, trn: input.trn || null },
        });
        // Which fields, not their values — the same rule as lead edits.
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "billing.details", entity: "Subscription", entityId: sub.id,
          after: { fields: ["billingAddress", "trn"] },
        });
        return { ok: true as const };
      });
    }),

  /**
   * One invoice, as the document a brokerage keeps.
   *
   * Read through the brokerage's own scope, so another firm's number
   * finds nothing. Everything on it comes from the invoice row, which
   * was fixed on the day it was issued; only invoices from before the
   * parties were kept fall back to today's names.
   *
   * "Tax invoice" only when it carries PotatoFarm's TRN. Calling a
   * document a tax invoice without a registration behind it is the one
   * thing worse than leaving VAT off.
   */
  invoice: requirePermission("org:update")
    .input(z.object({ number: z.string().trim().min(1).max(40) }))
    .query(async ({ ctx, input }) => {
      const i = await ctx.db.invoice.findFirst({ where: { number: input.number } });
      if (!i) throw new TRPCError({ code: "NOT_FOUND", message: "No invoice with that number." });
      const now = supplierDetails();
      const org = i.customerName ? null : await ctx.db.organisation.findUnique({
        where: { id: ctx.orgId }, select: { name: true },
      });
      const extra = i.conversationsAnswered - i.conversationsIncluded;
      const day = (d: Date) => d.toISOString().slice(0, 10);
      return {
        title: i.supplierTrn ? "Tax invoice" : "Invoice",
        number: i.number,
        issuedAt: day(i.issuedAt),
        dueAt: day(i.dueAt),
        periodFrom: day(i.periodFrom),
        periodTo: day(i.periodTo),
        status: i.status,
        supplier: { name: i.supplierName ?? now.name, address: i.supplierAddress, trn: i.supplierTrn },
        customer: { name: i.customerName ?? org?.name ?? "", address: i.customerAddress, trn: i.customerTrn },
        lines: [
          {
            description: "Agent seats",
            detail: `${i.seatDays} seat-days over a ${i.seatDaysFull}-day period`,
            amount: aed(i.seatFils),
          },
          i.overageFils > 0n
            ? {
                description: "Conversations beyond the allowance",
                detail: `${extra.toLocaleString("en-GB")} of ${i.conversationsAnswered.toLocaleString("en-GB")} answered, ` +
                  `${i.conversationsIncluded.toLocaleString("en-GB")} included`,
                amount: aed(i.overageFils),
              }
            : {
                description: "Conversations",
                detail: `${i.conversationsAnswered.toLocaleString("en-GB")} answered, within the ` +
                  `${i.conversationsIncluded.toLocaleString("en-GB")} included`,
                amount: aed(0n),
              },
        ],
        subtotal: aed(i.subtotalFils),
        vat: i.vatRateBp > 0 ? { rate: `${(i.vatRateBp / 100).toFixed(2)}%`, amount: aed(i.vatFils) } : null,
        total: aed(i.totalFils),
      };
    }),

  /** Ours, not theirs. Which trials are going nowhere, worst first. */
  trials: requirePermission("audit:read").query(() => trialHealth()),
});
