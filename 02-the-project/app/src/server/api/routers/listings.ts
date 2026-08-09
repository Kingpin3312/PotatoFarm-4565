import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { validateForPublish, blocking } from "@/server/lib/feeds/validate";

const PORTAL_RULES = {
  PROPERTY_FINDER: { requiresPermit: true, languages: ["en", "ar"], minPhotos: 4 },
  BAYUT:           { requiresPermit: true, languages: ["en", "ar"], minPhotos: 4 },
  DUBIZZLE:        { requiresPermit: true, languages: ["en"], minPhotos: 3 },
  WEBSITE_FORM:    { requiresPermit: false, languages: ["en"], minPhotos: 1 },
} as const;

export const listingsRouter = router({
  list: orgProcedure
    .input(z.object({
      status: z.enum(["DRAFT", "AVAILABLE", "UNDER_OFFER", "SOLD", "LET", "WITHDRAWN"]).optional(),
      search: z.string().trim().max(80).optional(),
      cursor: z.string().nullish(),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.listing.findMany({
        where: {
          deletedAt: null,
          ...(input.status && { status: input.status }),
          ...(input.search && {
            OR: [
              { reference: { contains: input.search, mode: "insensitive" } },
              { title: { contains: input.search, mode: "insensitive" } },
              { community: { contains: input.search, mode: "insensitive" } },
            ],
          }),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        include: {
          publications: { select: { channelId: true, state: true, rejection: true } },
          _count: { select: { enquiries: true } },
        },
      });

      const nextCursor = rows.length > input.limit ? rows.pop()!.id : null;

      return {
        nextCursor,
        rows: rows.map((l) => ({
          ...l,
          // Surfaced on the row rather than buried in a detail page. An
          // expiring permit that nobody sees becomes an expired one.
          permitDaysLeft: l.permitExpiresAt
            ? Math.floor((l.permitExpiresAt.getTime() - Date.now()) / 86_400_000)
            : null,
        })),
      };
    }),

  /**
   * Dry run. Called as the publish dialog opens, so the problems appear
   * before anyone presses the button rather than after.
   */
  checkPublish: orgProcedure
    .input(z.object({ listingId: z.string(), channelIds: z.array(z.string()).min(1) }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findFirst({
        where: { id: input.listingId, deletedAt: null },
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

      const channels = await ctx.db.channel.findMany({
        where: { id: { in: input.channelIds } },
        select: { id: true, label: true, type: true },
      });

      const photoCount = (listing.descriptions as any)?.photos?.length ?? 0;

      return channels.map((c) => {
        const rules = PORTAL_RULES[c.type as keyof typeof PORTAL_RULES] ?? PORTAL_RULES.WEBSITE_FORM;
        const problems = validateForPublish(listing as any, rules, photoCount);
        return {
          channelId: c.id,
          channel: c.label,
          problems,
          canPublish: blocking(problems).length === 0,
        };
      });
    }),

  publish: requirePermission("listing:write")
    .input(z.object({ listingId: z.string(), channelIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const listing = await tx.listing.findFirst({
          where: { id: input.listingId, deletedAt: null },
        });
        if (!listing) throw new TRPCError({ code: "NOT_FOUND" });

        const channels = await tx.channel.findMany({
          where: { id: { in: input.channelIds }, active: true },
          select: { id: true, label: true, type: true },
        });

        const photoCount = (listing.descriptions as any)?.photos?.length ?? 0;
        const results = [];

        for (const c of channels) {
          const rules = PORTAL_RULES[c.type as keyof typeof PORTAL_RULES] ?? PORTAL_RULES.WEBSITE_FORM;
          const problems = validateForPublish(listing as any, rules, photoCount);
          const blockers = blocking(problems);

          if (blockers.length) {
            // Refused here rather than queued and rejected days later by
            // the portal. The person who pressed publish is the one who
            // can fix it, and they are looking at the screen right now.
            results.push({ channel: c.label, queued: false, problems: blockers });
            continue;
          }

          await tx.listingPublication.upsert({
            where: { listingId_channelId: { listingId: listing.id, channelId: c.id } },
            create: { orgId: ctx.orgId, listingId: listing.id, channelId: c.id, state: "PENDING" },
            update: { state: "PENDING", rejection: null, lastTriedAt: new Date() },
          });
          results.push({ channel: c.label, queued: true, problems: [] });
        }

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "listing.publish",
          entity: "Listing",
          entityId: listing.id,
          after: { channels: results.filter((r) => r.queued).map((r) => r.channel) },
        });

        return results;
      })
    ),

  /**
   * Permits about to lapse. Runs daily.
   *
   * An expired Trakheesi permit means the listing is pulled and the
   * brokerage is advertising illegally until somebody notices. Fourteen
   * days is enough to renew without anyone rushing.
   */
  expiringPermits: orgProcedure
    .input(z.object({ withinDays: z.number().min(1).max(90).default(14) }))
    .query(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() + input.withinDays * 86_400_000);
      return ctx.db.listing.findMany({
        where: {
          deletedAt: null,
          status: { in: ["AVAILABLE", "UNDER_OFFER"] },
          permitExpiresAt: { not: null, lte: cutoff },
        },
        orderBy: { permitExpiresAt: "asc" },
        select: {
          id: true, reference: true, title: true,
          permitNumber: true, permitExpiresAt: true,
          publications: { where: { state: "PUBLISHED" }, select: { channelId: true } },
        },
      });
    }),

  /** Listings a portal has refused. The other half of the silence problem. */
  rejections: orgProcedure.query(({ ctx }) =>
    ctx.db.listingPublication.findMany({
      where: { state: "REJECTED" },
      orderBy: { lastTriedAt: "desc" },
      select: {
        channelId: true, rejection: true, lastTriedAt: true, attempts: true,
        listing: { select: { id: true, reference: true, title: true } },
      },
    })
  ),
});
