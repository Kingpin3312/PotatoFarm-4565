import { TRPCError } from "@trpc/server";
import type { Role } from "@prisma/client";
import { can } from "@/server/auth/rbac";

/**
 * Who may move an offer or a deal along.
 *
 * Reading stays brokerage-wide — the offers and deals boards are shared
 * on purpose, so an agent can see where the floor stands. Acting was
 * brokerage-wide too, and that was not a decision: any agent could
 * accept a colleague's offer, counter it, or tick their deal through to
 * completion (the second audit's N2). Row-level security already keeps
 * other brokerages out; this is the line inside one.
 *
 * An agent may act when the work is theirs: they recorded the offer, the
 * buyer is theirs, the property is theirs, or — for a deal — they share
 * its commission. A manager (`lead:read:all`) may act on anything in the
 * brokerage. "Not found" rather than "forbidden" for somebody else's, as
 * the rest of the product does, so an id says nothing about what exists.
 */
type Ctx = { db: any; role: Role; userId: string };

const managesAll = (role: Role) => can(role, "lead:read:all");

async function buyerIsTheirs(ctx: Ctx, leadId: string | null) {
  if (!leadId) return false;
  const lead = await ctx.db.lead.findFirst({ where: { id: leadId, assignedToId: ctx.userId }, select: { id: true } });
  return !!lead;
}

async function propertyIsTheirs(ctx: Ctx, listingId: string | null) {
  if (!listingId) return false;
  const l = await ctx.db.listing.findFirst({ where: { id: listingId, agentId: ctx.userId }, select: { id: true } });
  return !!l;
}

export async function assertCanActOnOffer(ctx: Ctx, offerId: string) {
  const offer = await ctx.db.offer.findFirst({
    where: { id: offerId },
    select: { id: true, agentId: true, leadId: true, listingId: true },
  });
  if (!offer) throw new TRPCError({ code: "NOT_FOUND", message: "That offer is no longer here." });
  if (managesAll(ctx.role) || offer.agentId === ctx.userId) return offer;
  if (await buyerIsTheirs(ctx, offer.leadId)) return offer;
  if (await propertyIsTheirs(ctx, offer.listingId)) return offer;
  throw new TRPCError({ code: "NOT_FOUND", message: "That offer is no longer here." });
}

export async function assertCanActOnDeal(ctx: Ctx, dealId: string) {
  const deal = await ctx.db.deal.findFirst({ where: { id: dealId }, select: { id: true, leadId: true, listingId: true } });
  if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "No such deal." });
  if (managesAll(ctx.role)) return deal;
  if (await buyerIsTheirs(ctx, deal.leadId)) return deal;
  if (await propertyIsTheirs(ctx, deal.listingId)) return deal;
  const split = await ctx.db.commissionSplit.findFirst({
    where: { userId: ctx.userId, commission: { dealId: deal.id } }, select: { id: true },
  });
  if (split) return deal;
  throw new TRPCError({ code: "NOT_FOUND", message: "No such deal." });
}

/**
 * An offer names a buyer the caller can see, in this brokerage, or none.
 * `Offer.leadId` has no foreign key, so without this an id from another
 * brokerage — or a colleague's buyer — was written as given.
 */
export async function assertCanNameBuyer(ctx: Ctx, leadId: string) {
  const lead = await ctx.db.lead.findFirst({
    where: { id: leadId, deletedAt: null, ...(managesAll(ctx.role) ? {} : { assignedToId: ctx.userId }) },
    select: { id: true },
  });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND", message: "That buyer is not one of yours." });
}
