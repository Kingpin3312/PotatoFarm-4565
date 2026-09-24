import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { compare } from "@/server/lib/offers/negotiate";
import { normalisePhone } from "@/server/lib/portals/normalise";
import { can } from "@/server/auth/rbac";

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
      /**
       * Stored as E.164, or refused.
       *
       * Typed as it was said — "050 123 4567" — the number could not be
       * matched when the owner wrote in on WhatsApp, which arrives as
       * +971501234567, and could not be sent to either. A number that
       * cannot be read is refused in words rather than saved to fail
       * later, in front of the owner.
       */
      const phone = input.phone ? normalisePhone(input.phone) : null;
      if (input.phone && !phone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That phone number can't be read. Include the country code, e.g. +971 50 123 4567.",
        });
      }
      const v = await ctx.db.vendor.create({
        data: {
          orgId: ctx.orgId, ...input, phone,
          reportsOff: input.prefers === "OFFERS_ONLY" || input.reportDay === null,
        },
      });
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "vendor.created",
        entity: "Vendor", entityId: v.id, after: { name: v.name },
      });
      return { id: v.id };
    }),

  /**
   * The owner's WhatsApp thread, opened if there is none yet.
   *
   * Until now an agent's whole conversation with an owner happened on
   * their own phone: no thread, no reply window, and nothing for the
   * colleague who takes the listing over. A conversation is created with
   * no messages; the thread screen then says what can be sent — outside
   * the 24-hour window, only an approved template, as for a buyer.
   *
   * The same rule as the inbox: an agent may open an owner's thread if
   * they look after one of the owner's properties; a manager, any.
   */
  openConversation: requirePermission("conversation:send")
    .input(z.object({ vendorId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const vendor = await ctx.db.vendor.findFirst({
        where: {
          id: input.vendorId,
          ...(can(ctx.role, "lead:read:all")
            ? {}
            : { listings: { some: { agentId: ctx.userId, deletedAt: null } } }),
        },
        select: { id: true, name: true, phone: true, conversation: { select: { id: true } } },
      });
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND" });
      if (vendor.conversation) return { conversationId: vendor.conversation.id };
      if (!normalisePhone(vendor.phone ?? undefined)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `There's no WhatsApp number we can read for ${vendor.name}. Add one with the country code.`,
        });
      }
      const channel = await ctx.db.channel.findFirst({
        where: { type: "WHATSAPP", active: true },
        orderBy: { createdAt: "asc" }, select: { id: true },
      });
      if (!channel) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect the brokerage's WhatsApp number first, under Settings → Channels.",
        });
      }
      return ctx.db.$transaction(async (tx) => {
        // Upsert: two agents pressing it at once get one thread.
        const c = await tx.conversation.upsert({
          where: { vendorId: vendor.id },
          create: { orgId: ctx.orgId, vendorId: vendor.id, channelId: channel.id },
          update: {},
          select: { id: true },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "conversation.opened", entity: "Vendor", entityId: vendor.id,
        });
        return { conversationId: c.id };
      });
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
        /** Whether the WhatsApp button can work, said before it is pressed. */
        whatsapp: Boolean(normalisePhone(v.phone ?? undefined)),
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
