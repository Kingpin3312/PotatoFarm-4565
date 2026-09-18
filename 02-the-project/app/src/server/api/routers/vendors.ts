import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";

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
  attach: requirePermission("listing:write")
    .input(z.object({ listingId: z.string(), vendorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

      const [viewings, offers] = await Promise.all([
        ctx.db.viewing.count({
          where: { listingId: { in: listingIds }, scheduledAt: { gte: since } },
        }),
        ctx.db.offer.count({
          where: { listingId: { in: listingIds }, status: { in: ["SUBMITTED", "PRESENTED", "COUNTERED"] } },
        }),
      ]);

      return {
        name: v.name,
        phone: v.phone,
        prefers: v.prefers,
        actingFor: v.actingFor,
        listings: v.listings,
        lastReportedAt: v.lastReportedAt,
        sinceThen: { viewings, liveOffers: offers },
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
