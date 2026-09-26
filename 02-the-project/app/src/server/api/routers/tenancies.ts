import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { aedToFils } from "@/lib/money";

/**
 * Leases on the brokerage's rentals.
 *
 * Recorded when a rental is let, so the renewal comes back to the agent
 * before the ninety-day notice line (`lib/tenancy/renewals.ts`). A rental
 * marked LET with no lease on file is a renewal nobody will be reminded
 * of, which is why the Owner panel asks for one.
 */
export const tenanciesRouter = router({
  forListing: orgProcedure
    .input(z.object({ listingId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.tenancy.findMany({
        where: { listingId: input.listingId },
        orderBy: { endsAt: "desc" },
        take: 10,
        select: {
          id: true, tenantName: true, startsAt: true, endsAt: true, rentFils: true, cheques: true,
          depositFils: true, ejariNumber: true, renewalTaskAt: true, endedAt: true,
        },
      })),

  record: requirePermission("listing:write")
    .input(z.object({
      listingId: z.string(),
      tenantName: z.string().trim().max(120).optional(),
      leadId: z.string().optional(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      rentAed: z.number().min(1).max(100_000_000),
      cheques: z.number().int().min(1).max(12).optional(),
      depositAed: z.number().min(0).max(100_000_000).optional(),
      ejariNumber: z.string().trim().max(40).optional(),
    }).refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
      message: "The lease has to end after it starts.", path: ["endsAt"],
    }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const listing = await tx.listing.findFirst({
          where: { id: input.listingId, deletedAt: null }, select: { id: true, purpose: true, agentId: true },
        });
        if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
        if (listing.purpose !== "RENT") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A lease goes on a rental. Change the listing to “To let” first." });
        }
        if (input.leadId) {
          const lead = await tx.lead.findFirst({ where: { id: input.leadId, deletedAt: null }, select: { id: true } });
          if (!lead) throw new TRPCError({ code: "BAD_REQUEST", message: "That tenant isn't one of your leads." });
        }
        // One live lease at a time: recording the new one ends the old.
        await tx.tenancy.updateMany({ where: { listingId: listing.id, endedAt: null }, data: { endedAt: new Date(input.startsAt) } });
        const t = await tx.tenancy.create({
          data: {
            orgId: ctx.orgId, listingId: listing.id, leadId: input.leadId, tenantName: input.tenantName,
            startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt),
            rentFils: aedToFils(input.rentAed), cheques: input.cheques,
            depositFils: input.depositAed === undefined ? null : aedToFils(input.depositAed),
            ejariNumber: input.ejariNumber, agentId: listing.agentId ?? ctx.userId,
          },
          select: { id: true },
        });
        await tx.listing.update({ where: { id: listing.id }, data: { status: "LET" } });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "tenancy.record", entity: "Tenancy", entityId: t.id,
          after: { listingId: listing.id, endsAt: input.endsAt },
        });
        return t;
      })),

  /** Ended early. The listing goes back on the market. */
  end: requirePermission("listing:write")
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const t = await tx.tenancy.findFirst({ where: { id: input.id, endedAt: null }, select: { id: true, listingId: true } });
        if (!t) throw new TRPCError({ code: "NOT_FOUND" });
        await tx.tenancy.update({ where: { id: t.id }, data: { endedAt: new Date() } });
        await tx.listing.update({ where: { id: t.listingId }, data: { status: "AVAILABLE" } });
        await audit(tx, ctx.orgId, { actorId: ctx.userId, action: "tenancy.end", entity: "Tenancy", entityId: t.id });
        return { ok: true };
      })),
});
