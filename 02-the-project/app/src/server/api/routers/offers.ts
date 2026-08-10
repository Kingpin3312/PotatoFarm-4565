import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { counter, accept, compare } from "@/server/lib/offers/negotiate";
import { audit } from "@/server/lib/audit";
import { aed, usd } from "@/lib/money";

/**
 * Offers.
 *
 * The transaction. Everything before it is admin, and the product had a
 * listing status where this should have been.
 */
export const offersRouter = router({
  /**
   * Record one.
   *
   * `conversation:read` is not enough and `org:update` is too much — an
   * agent records offers on their own leads all day and should not need
   * a manager. This uses `lead:write`, which is the permission an agent
   * already has for the buyer the offer belongs to.
   */
  create: requirePermission("lead:update")
    .input(z.object({
      listingId: z.string(),
      leadId: z.string().optional(),
      amountAed: z.number().positive().max(500_000_000),
      financing: z.enum(["CASH", "MORTGAGE", "UNKNOWN"]).default("UNKNOWN"),
      preApproved: z.boolean().default(false),
      preApprovalRef: z.string().trim().max(80).optional(),
      conditions: z.string().trim().max(600).optional(),
      /** Asked at the offer, because that is when the agent finds out —
       *  and it decides whether the Form F date is achievable at all. */
      sellerHasMortgage: z.boolean().default(false),
      /** Days. Most offers here are given 48 or 72 hours. */
      expiresInDays: z.number().int().min(1).max(30).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findUnique({
        where: { id: input.listingId },
        select: { id: true, vendorId: true, status: true, reference: true },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "That listing is no longer here." });

      const offer = await ctx.db.offer.create({
        data: {
          orgId: ctx.orgId,
          listingId: listing.id,
          leadId: input.leadId,
          vendorId: listing.vendorId,
          agentId: ctx.userId,
          // Fils, always. lib/money.ts is the only formatter.
          amountFils: BigInt(Math.round(input.amountAed * 100)),
          financing: input.financing,
          preApproved: input.preApproved,
          preApprovalRef: input.preApprovalRef,
          conditions: input.conditions,
          sellerHasMortgage: input.sellerHasMortgage,
          expiresAt: input.expiresInDays
            ? new Date(Date.now() + input.expiresInDays * 86_400_000)
            : null,
        },
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "offer.created",
        entity: "Offer", entityId: offer.id,
        after: { listing: listing.reference, amountFils: offer.amountFils.toString() },
      });

      return {
        id: offer.id,
        amount: aed(offer.amountFils),
        // Flagged here rather than blocked. An offer arrives before the
        // paperwork sometimes, and refusing to record it would send the
        // agent back to a WhatsApp group.
        vendorMissing: !listing.vendorId,
      };
    }),

  /** Mark it shown to the vendor. "Did he see it?" is the first question
   *  a buyer's agent asks, and it deserves a real answer. */
  presented: requirePermission("lead:update")
    .input(z.object({ offerId: z.string(), note: z.string().trim().max(400).optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.offerResponse.create({
        data: {
          orgId: ctx.orgId, offerId: input.offerId, by: "AGENT",
          kind: "QUERY", note: input.note ?? "Presented to the vendor",
          recordedById: ctx.userId,
        },
      });
      await ctx.db.offer.update({
        where: { id: input.offerId }, data: { status: "PRESENTED" },
      });
      return { ok: true };
    }),

  counter: requirePermission("lead:update")
    .input(z.object({
      offerId: z.string(),
      by: z.enum(["BUYER", "VENDOR", "AGENT"]),
      amountAed: z.number().positive().max(500_000_000),
      note: z.string().trim().max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await counter({
        orgId: ctx.orgId, offerId: input.offerId, by: input.by,
        amountFils: BigInt(Math.round(input.amountAed * 100)),
        note: input.note, actorId: ctx.userId,
      });
      if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),

  /**
   * Accepting closes every other live offer on the listing and returns
   * who needs a call. Deliberately returned rather than auto-notified —
   * a buyer whose offer just lost hears it from their agent, not from a
   * push notification.
   */
  accept: requirePermission("lead:update")
    .input(z.object({ offerId: z.string(), note: z.string().trim().max(600).optional() }))
    .mutation(async ({ ctx, input }) => {
      const res = await accept({ orgId: ctx.orgId, ...input, actorId: ctx.userId });
      if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),

  /**
   * Everything on the table, soonest to expire first.
   *
   * Not by value. An offer that lapses while somebody was looking at a
   * bigger one is a deal lost to a calendar, and that is a worse way to
   * lose one than being outbid.
   */
  live: requirePermission("lead:read:own").query(async ({ ctx }) => {
    const rows = await ctx.db.offer.findMany({
      where: { status: { in: ["SUBMITTED", "PRESENTED", "COUNTERED"] } },
      include: {
        responses: { where: { kind: "COUNTER" }, orderBy: { at: "desc" }, take: 1 },
      },
    });
    const listings = await ctx.db.listing.findMany({
      where: { id: { in: rows.map((r) => r.listingId) } },
      select: { id: true, reference: true },
    });
    const ref = new Map(listings.map((l) => [l.id, l.reference]));

    return rows
      .map((o) => ({
        id: o.id,
        listingId: o.listingId,
        reference: ref.get(o.listingId) ?? "—",
        current: aed(o.responses[0]?.amountFils ?? o.amountFils),
        hoursLeft: o.expiresAt
          ? Math.round((o.expiresAt.getTime() - Date.now()) / 3_600_000)
          : null,
      }))
      // Nulls last — an offer with no expiry is not urgent, it is just
      // undated.
      .sort((a, b) => (a.hoursLeft ?? 1e9) - (b.hoursLeft ?? 1e9));
  }),

  /** What the vendor is choosing between, ranked by strength not price. */
  /**
   * Offers on one property.
   *
   * The listing is looked up first, and that is not ceremony. `compare`
   * returns an empty array for a property that does not exist, which the
   * screen rendered as a confident "0 offers" — a stale link or a typo
   * in the URL looked exactly like a property nobody has bid on. An
   * agent could tell an owner there were no offers on a property that
   * was not even ours.
   */
  onListing: requirePermission("lead:read:own")
    .input(z.object({ listingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findFirst({
        where: { id: input.listingId, deletedAt: null },
        select: { id: true },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "No such property." });
      return compare(ctx.orgId, input.listingId);
    }),
});
