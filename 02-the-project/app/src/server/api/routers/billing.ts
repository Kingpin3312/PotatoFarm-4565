import { usage } from "@/server/lib/billing/conversations";
import { limitAll, keysFor } from "@/server/lib/ratelimit";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission, publicProcedure } from "../trpc";
import { signup, trialHealth, MIN_SEATS, TRIAL_DAYS } from "@/server/lib/billing/signup";
import { beginCardSetup, cardSummary } from "@/server/lib/billing/card";
import { seatDays } from "@/server/lib/billing/seats";
import { explain } from "@/server/lib/billing/invoice";
import { aed, usd, priced } from "@/lib/money";

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
    vatRate: "5%",
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
      // invoice will say and what the VAT is computed on.
      runningTotal: priced(
        BigInt(Math.round((Number(sub.seatPriceFils) / fullPeriodDays) * used))
      ),
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

  /** Ours, not theirs. Which trials are going nowhere, worst first. */
  trials: requirePermission("audit:read").query(() => trialHealth()),
});
