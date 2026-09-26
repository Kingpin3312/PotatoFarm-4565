import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission, requireAnyPermission } from "../trpc";
import { leadScope, personScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";
import { aedToFils } from "@/lib/money";
import { canonicalCommunities } from "@/server/lib/requirements/save";
import { defaultExpiry } from "@/server/lib/matching/requirements";

/**
 * What a buyer is looking for, recorded by the agent who knows.
 *
 * `lib/requirements/save.ts` has the account of why this exists: matching,
 * "who wants this property" and search all read `Requirement`, and only
 * voice intake ever wrote one.
 *
 * Money crosses this boundary in whole dirhams, as a person types it,
 * and is fils everywhere behind it.
 */
const aedField = z.number().int().min(0).max(1_000_000_000).nullable();

const input = z.object({
  leadId: z.string(),
  /** Absent for a new one. */
  id: z.string().optional(),
  purpose: z.enum(["SALE", "RENT"]),
  intent: z.enum(["BUY_TO_LIVE", "BUY_TO_INVEST", "RENT"]).nullable(),
  budgetMinAed: aedField,
  budgetMaxAed: aedField,
  bedroomsMin: z.number().int().min(0).max(12).nullable(),
  communities: z.array(z.string().max(60)).max(8),
  preferences: z.array(z.string().max(60)).max(10),
  propertyTypes: z.array(z.enum(["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "DUPLEX", "PLOT", "OFFICE", "RETAIL", "WAREHOUSE", "OTHER"])).max(10).default([]),
  completion: z.enum(["READY", "OFF_PLAN"]).nullable().default(null),
}).refine((v) => v.budgetMinAed == null || v.budgetMaxAed == null || v.budgetMinAed <= v.budgetMaxAed, {
  message: "The lowest budget is above the highest. Swap them round.",
  path: ["budgetMaxAed"],
});

async function ownLead(ctx: { db: any; role: any; userId: string }, leadId: string, read = false) {
  const lead = await ctx.db.lead.findFirst({
    where: { id: leadId, deletedAt: null, ...(read ? personScope : leadScope)(ctx.role, ctx.userId) },
    select: { id: true },
  });
  if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
}

export const requirementsRouter = router({
  forLead: requireAnyPermission("lead:read:own", "lead:read:all")
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ownLead(ctx, input.leadId, true);
      const rows = await ctx.db.requirement.findMany({
        where: { leadId: input.leadId },
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        take: 10,
      });
      return rows.map((r) => ({
        id: r.id,
        active: r.active,
        purpose: r.purpose,
        intent: r.intent,
        budgetMinFils: r.budgetMinFils,
        budgetMaxFils: r.budgetMaxFils,
        bedroomsMin: r.bedroomsMin,
        communities: r.communities,
        preferences: r.preferences,
        propertyTypes: r.propertyTypes,
        completion: r.completion,
        source: r.source,
        // An agent reads "the assistant thinks" differently from a fact.
        unsure: r.source === "ASSISTANT" && r.confidence !== null && r.confidence < 0.7,
        updatedAt: r.updatedAt,
      }));
    }),

  save: requirePermission("lead:update")
    .input(input)
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        await ownLead({ ...ctx, db: tx }, input.leadId);
        const data = {
          purpose: input.purpose,
          intent: input.purpose === "RENT" ? "RENT" as const : input.intent === "RENT" ? null : input.intent,
          budgetMinFils: input.budgetMinAed === null ? null : aedToFils(input.budgetMinAed),
          budgetMaxFils: input.budgetMaxAed === null ? null : aedToFils(input.budgetMaxAed),
          bedroomsMin: input.bedroomsMin,
          communities: canonicalCommunities(input.communities),
          preferences: input.preferences.map((p) => p.trim()).filter(Boolean),
          propertyTypes: input.propertyTypes,
          completion: input.completion,
          // Saved by a person, so it is theirs now, whoever wrote it
          // first. The assistant stops touching it from here on.
          source: "AGENT" as const,
          confidence: null,
          confirmedById: ctx.userId,
          confirmedAt: new Date(),
          active: true,
          // Requirements go stale; saving one again is saying it again.
          expiresAt: defaultExpiry(input.purpose === "RENT" ? "RENT" : input.intent),
        };
        const saved = input.id
          ? await (async () => {
              const found = await tx.requirement.findFirst({
                where: { id: input.id, leadId: input.leadId }, select: { id: true },
              });
              if (!found) throw new TRPCError({ code: "NOT_FOUND" });
              return tx.requirement.update({ where: { id: found.id }, data });
            })()
          : await tx.requirement.create({ data: { ...data, orgId: ctx.orgId, leadId: input.leadId } });
        // The person's own "Looking to" line, when nobody has said yet —
        // otherwise the page reads "Buying to live in" under a blank one.
        if (data.intent) {
          await tx.lead.updateMany({ where: { id: input.leadId, intent: null }, data: { intent: data.intent } });
        }
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: input.id ? "requirement.update" : "requirement.create",
          entity: "Requirement",
          entityId: saved.id,
          // Field names, not values — the same rule as editing a lead.
          after: { leadId: input.leadId, fields: Object.keys(data) },
        });
        return { id: saved.id, communities: saved.communities };
      })
    ),

  /** They bought, or stopped looking. Kept, not deleted: it is history. */
  close: requirePermission("lead:update")
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const r = await tx.requirement.findFirst({ where: { id: input.id }, select: { id: true, leadId: true } });
        if (!r) throw new TRPCError({ code: "NOT_FOUND" });
        await ownLead({ ...ctx, db: tx }, r.leadId);
        await tx.requirement.update({ where: { id: r.id }, data: { active: false } });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "requirement.close", entity: "Requirement", entityId: r.id,
        });
        return { ok: true };
      })
    ),
});
