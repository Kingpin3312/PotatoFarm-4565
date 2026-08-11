import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { validateForPublish, blocking } from "@/server/lib/feeds/validate";
import { buyersFor, pitch } from "@/server/lib/matching/buyers";
import { can } from "@/server/auth/rbac";
import { aedToFils } from "@/lib/money";

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
   * Add a property.
   *
   * **This did not exist.** Twenty-two places read `Listing`; nothing
   * wrote one. The list screen, the publish check, the buyer matcher,
   * the permit alarm and the viewing diary were all complete, correct
   * and pointed at a table a brokerage had no way to fill — the same
   * shape as the pipeline having no stages, one model over.
   *
   * ## What is required, and what deliberately is not
   *
   * Only `reference` and `title`. Everything else — price, beds, the
   * Trakheesi permit — can arrive later, because in this market they
   * genuinely do: an agent takes an instruction on a phone call and the
   * paperwork follows. A form that refuses the first ninety seconds of
   * real work is a form people keep a spreadsheet beside.
   *
   * That is safe to allow *because publishing is a separate gate*.
   * `checkPublish` and `publish` already refuse a listing with no valid
   * permit, so an incomplete listing can exist without ever reaching a
   * portal. Requiring the permit here instead would move the check to
   * the wrong moment: entry, rather than advertisement.
   */
  create: requirePermission("listing:write")
    .input(z.object({
      reference: z.string().trim().min(1).max(40),
      title: z.string().trim().min(1).max(160),
      community: z.string().trim().max(80).optional(),
      building: z.string().trim().max(80).optional(),
      bedrooms: z.number().int().min(0).max(20).optional(),
      bathrooms: z.number().int().min(0).max(20).optional(),
      areaSqft: z.number().int().min(1).max(1_000_000).optional(),
      /**
       * AED, not fils, and converted on the server.
       *
       * The client sends what the agent typed. `aedToFils` is the only
       * place the unit changes, which is the rule that stopped a buyer
       * being shown a property at a hundred times their budget.
       */
      priceAed: z.number().min(0).max(10_000_000_000).optional(),
      purpose: z.enum(["SALE", "RENT"]).default("SALE"),
      status: z.enum(["DRAFT", "AVAILABLE"]).default("AVAILABLE"),
      permitNumber: z.string().trim().max(60).optional(),
      /** ISO date. Stored as given; the permit alarm reads it daily. */
      permitExpiresAt: z.string().datetime().optional(),
      reraBrokerCard: z.string().trim().max(60).optional(),
      vendorId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { priceAed, permitExpiresAt, ...rest } = input;

      /**
       * The reference is unique per brokerage, and a collision is an
       * ordinary Tuesday rather than an exception.
       *
       * Checked first so the agent gets "DH-101 is already used" instead
       * of a Prisma P2002 surfacing as "Internal server error" — which
       * is what the constraint alone would have given them.
       */
      const clash = await ctx.db.listing.findFirst({
        where: { reference: input.reference, deletedAt: null },
        select: { id: true, title: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Reference ${input.reference} is already used by "${clash.title}".`,
        });
      }

      const listing = await ctx.db.listing.create({
        data: {
          ...rest,
          orgId: ctx.orgId,
          ...(priceAed !== undefined ? { priceFils: aedToFils(priceAed) } : {}),
          ...(permitExpiresAt ? { permitExpiresAt: new Date(permitExpiresAt) } : {}),
        },
        select: { id: true, reference: true, title: true },
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "listing.create",
        entity: "Listing",
        entityId: listing.id,
        after: { reference: listing.reference, title: listing.title },
      });

      return listing;
    }),

  /**
   * Edit one.
   *
   * Every field optional, because the common edit is a single one — a
   * price reduction, or the permit number arriving a week after the
   * instruction. `undefined` means "leave it"; a field is only written
   * when the client sends it.
   */
  update: requirePermission("listing:write")
    .input(z.object({
      id: z.string(),
      reference: z.string().trim().min(1).max(40).optional(),
      title: z.string().trim().min(1).max(160).optional(),
      community: z.string().trim().max(80).nullish(),
      building: z.string().trim().max(80).nullish(),
      bedrooms: z.number().int().min(0).max(20).nullish(),
      bathrooms: z.number().int().min(0).max(20).nullish(),
      areaSqft: z.number().int().min(1).max(1_000_000).nullish(),
      priceAed: z.number().min(0).max(10_000_000_000).nullish(),
      purpose: z.enum(["SALE", "RENT"]).optional(),
      status: z.enum(["DRAFT", "AVAILABLE", "UNDER_OFFER", "SOLD", "LET", "WITHDRAWN"]).optional(),
      permitNumber: z.string().trim().max(60).nullish(),
      permitExpiresAt: z.string().datetime().nullish(),
      reraBrokerCard: z.string().trim().max(60).nullish(),
      vendorId: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, priceAed, permitExpiresAt, ...rest } = input;

      const before = await ctx.db.listing.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, reference: true, priceFils: true, status: true },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.reference && input.reference !== before.reference) {
        const clash = await ctx.db.listing.findFirst({
          where: { reference: input.reference, deletedAt: null, NOT: { id } },
          select: { title: true },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Reference ${input.reference} is already used by "${clash.title}".`,
          });
        }
      }

      const listing = await ctx.db.listing.update({
        where: { id },
        data: {
          ...rest,
          // `null` clears the price, `undefined` leaves it. Collapsing
          // the two would make every edit of the bedroom count wipe the
          // asking price.
          ...(priceAed === undefined
            ? {}
            : { priceFils: priceAed === null ? null : aedToFils(priceAed) }),
          ...(permitExpiresAt === undefined
            ? {}
            : { permitExpiresAt: permitExpiresAt === null ? null : new Date(permitExpiresAt) }),
        },
        select: { id: true, reference: true, title: true },
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "listing.update",
        entity: "Listing",
        entityId: id,
        before: { reference: before.reference, status: before.status },
        after: { reference: listing.reference, changed: Object.keys(rest) },
      });

      return listing;
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

  /**
   * Records that a listing passed its checks and is ready to go up.
   *
   * **It does not transmit anything, and the name is now the only part
   * that still says otherwise.** The `ListingPublication` row written
   * below sits at `PENDING` and is read by nothing — no adapter pushes a
   * listing out, and none of the twenty-four scheduled jobs drains the
   * queue. Portal *lead ingest* exists (`lib/portals/`); portal
   * *distribution* does not, and cannot until there is a partner
   * agreement and a wire format per portal.
   *
   * The screen says so plainly now. It used to close the dialog on
   * success, which reads as "sent" — an agent had every reason to think
   * the villa was on Bayut, nothing errored, and the first person to
   * discover otherwise would have been the owner ringing to ask.
   *
   * **What to build when the agreements exist:** a `portals.publish` job
   * that reads `PENDING`, calls a per-portal adapter, and moves the row
   * to `LIVE` or `REJECTED` with the portal's reason. The rejection
   * column already exists and is already cleared on retry here. Then
   * restore the plain wording in `publish-check.tsx`.
   */
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

  /**
   * Who wants this one.
   *
   * The matching engine has always run buyer → listing, because that is
   * the direction the nightly outbound sweep needs. This is the other
   * direction, and it is the one an agent needs standing in an owner's
   * kitchen: *twelve people on our book are looking for exactly this,
   * four of them can be messaged today.*
   *
   * `listing:read` rather than a lead permission. The question is about
   * the property; the answer redacts the names an agent is not entitled
   * to see, which is why the scope goes in rather than the permission
   * being raised. A VIEWER already has `lead:read:all`, so nothing here
   * widens what anybody can see.
   */
  buyers: requirePermission("listing:read")
    .input(z.object({
      listingId: z.string(),
      limit: z.number().int().min(1).max(50).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const result = await buyersFor({
        orgId: ctx.orgId,
        listingId: input.listingId,
        limit: input.limit,
        scope: { canSeeAll: can(ctx.role, "lead:read:all"), viewerId: ctx.userId },
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "No such property." });

      // Built on the server so the sentence and the numbers under it can
      // never disagree — the screen renders both and does no arithmetic.
      return { ...result, pitch: pitch(result) };
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
