import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { compare } from "@/server/lib/offers/negotiate";

/**
 * Vendors.
 *
 * The person who instructed us. Missing entirely until a veteran agent
 * asked who the vendor report we had built was supposed to go to.
 */
export const vendorsRouter = router({
  create: requirePermission("listing:write")
    .input(z.object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(30).optional(),
      email: z.string().trim().toLowerCase().email().max(160).optional(),
      prefers: z.enum(["WHATSAPP", "CALL", "EMAIL", "OFFERS_ONLY"]).default("WHATSAPP"),
      /** 1 = Monday. Null means no weekly report. */
      reportDay: z.number().int().min(1).max(7).nullable().default(4),
      actingFor: z.string().trim().max(120).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const v = await ctx.db.vendor.create({
        data: {
          orgId: ctx.orgId, ...input,
          reportsOff: input.prefers === "OFFERS_ONLY" || input.reportDay === null,
        },
      });
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "vendor.created",
        entity: "Vendor", entityId: v.id, after: { name: v.name },
      });
      return { id: v.id };
    }),

  /** Attach an owner to a listing. */
  /**
   * The brokerage's owners, by name, for picking one.
   *
   * Attaching an owner asked the agent to type an "Owner ID" — the
   * database's internal key, which no agent has ever seen. So in
   * practice no owner could be attached from the listings screen.
   */
  list: requirePermission("listing:read").query(({ ctx }) =>
    ctx.db.vendor.findMany({
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, phone: true },
    })),

  attach: requirePermission("listing:write")
    .input(z.object({ listingId: z.string(), vendorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Scoped reads: the owner must be one of ours. The foreign key is
      // checked without row-level security, so it would accept another
      // brokerage's owner.
      const vendor = await ctx.db.vendor.findFirst({ where: { id: input.vendorId }, select: { id: true } });
      if (!vendor) throw new TRPCError({ code: "BAD_REQUEST", message: "That owner isn't one of yours." });
      await ctx.db.listing.update({
        where: { id: input.listingId }, data: { vendorId: input.vendorId },
      });
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "listing.vendor_attached",
        entity: "Listing", entityId: input.listingId,
        after: { vendorId: input.vendorId },
      });
      return { ok: true };
    }),

  /**
   * What to say when you ring them.
   *
   * Not a profile page. An agent about to call an owner needs three
   * things: what has happened since they last spoke, what is on the
   * table, and whether this owner wanted a call at all.
   */
  brief: requirePermission("listing:read")
    .input(z.object({ vendorId: z.string() }))
    .query(async ({ ctx, input }) => {
      const v = await ctx.db.vendor.findUniqueOrThrow({
        where: { id: input.vendorId },
        include: {
          listings: { select: { id: true, reference: true, status: true } },
        },
      });

      const since = v.lastReportedAt ?? new Date(Date.now() - 7 * 86_400_000);
      const listingIds = v.listings.map((l) => l.id);

      const [viewings, offers, ranked] = await Promise.all([
        ctx.db.viewing.count({
          where: { listingId: { in: listingIds }, scheduledAt: { gte: since } },
        }),
        ctx.db.offer.count({
          where: { listingId: { in: listingIds }, status: { in: ["SUBMITTED", "PRESENTED", "COUNTERED"] } },
        }),
        /**
         * Not just how many. What they are.
         *
         * This screen exists to answer "what do I say when I ring this
         * owner", and it said "1 offer" — the first thing the owner
         * asks is how much, and the agent had to go and look it up on
         * another screen mid-call.
         *
         * `compare()` is reused rather than reimplemented, and that is
         * load-bearing: it ranks by **strength, not price**, because
         * cash with no conditions beats a higher mortgage nobody has
         * pre-approved. A second sort here would eventually disagree
         * with the offers screen, and an agent would be told two
         * different things about which offer is best — in front of the
         * owner.
         */
        Promise.all(listingIds.map((id) => compare(ctx.orgId, id))).then((all) =>
          /**
           * Strength only, and the tie is already broken.
           *
           * `compare()` queries `amountFils: "desc"`, and Array.sort is
           * stable, so equal-strength offers keep that price order
           * without this having to re-derive it. It could not anyway:
           * `current` is what `aedWhole()` produced — "AED 2,500,000",
           * a string for a person to read — and the first version of
           * this line tried to subtract two of them. `money.ts` is the
           * only formatter in this codebase precisely so that money
           * arrives already formatted; arithmetic belongs upstream of
           * it, on the fils.
           */
          all.flat().sort((a, b) => b.strength - a.strength)),
      ]);

      return {
        name: v.name,
        phone: v.phone,
        prefers: v.prefers,
        actingFor: v.actingFor,
        listings: v.listings,
        lastReportedAt: v.lastReportedAt,
        sinceThen: { viewings, liveOffers: offers },
        /**
         * The strongest, and why. Capped at three: this is a phone
         * call, not a report, and an agent reading a fourth aloud has
         * lost the thread.
         */
        strongest: ranked.slice(0, 3).map((o) => ({
          current: o.current,
          financing: o.financing,
          preApproved: o.preApproved,
          hasConditions: Boolean(o.conditions),
          moves: o.moves,
        })),
        // Said plainly, because ringing an OFFERS_ONLY vendor for a
        // chat is the fastest way to lose an instruction.
        callAdvice:
          v.prefers === "OFFERS_ONLY"
            ? "This owner asked to be contacted only when there's an offer."
            : v.prefers === "CALL"
              ? "This owner prefers a call."
              : null,
      };
    }),
});
