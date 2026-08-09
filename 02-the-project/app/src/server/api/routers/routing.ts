import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { route, available, type Candidate } from "@/server/lib/routing/assign";
import { checkProtection, summariseDispute, DEFAULT_PROTECTION_DAYS } from "@/server/lib/routing/ownership";
import { audit } from "@/server/lib/audit";

export const routingRouter = router({
  rules: requirePermission("lead:assign").query(({ ctx }) =>
    ctx.db.assignmentRule.findMany({ where: { active: true }, orderBy: { priority: "asc" } })
  ),

  /** Who would get the next lead, and why. Shown because agents ask. */
  preview: requirePermission("lead:assign")
    .input(z.object({
      strategy: z.enum(["ROUND_ROBIN", "LEAST_LOADED", "FASTEST", "SPECIFIC", "UNASSIGNED"]),
      language: z.string().optional(),
      community: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const candidates = await candidatesFor(ctx);
      const pool = available(candidates, input);
      const result = route(input.strategy, candidates, input);

      return {
        result,
        // The whole pool with its state, so "why not me" is answerable
        // without a manager having to guess.
        pool: candidates.map((c) => ({
          name: c.name,
          eligible: pool.some((p) => p.userId === c.userId),
          openLeads: c.openLeads,
          capacity: c.capacity,
          away: Boolean(c.awayUntil && c.awayUntil > new Date()),
          lastAssignedAt: c.lastAssignedAt,
        })),
      };
    }),

  /** Ownership history. The record a dispute gets settled against. */
  history: orgProcedure
    .input(z.object({ leadId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.leadOwnership.findMany({
        where: { leadId: input.leadId }, orderBy: { startedAt: "asc" },
      })
    ),

  /**
   * The dispute view. Facts and what the rule says, and no verdict — see
   * ownership.ts for why that restraint matters.
   */
  dispute: requirePermission("lead:assign")
    .input(z.object({ leadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [lead, history, org] = await Promise.all([
        ctx.db.lead.findUnique({
          where: { id: input.leadId },
          select: { assignedToId: true, createdAt: true,
                    conversation: { select: { lastInboundAt: true } } },
        }),
        ctx.db.leadOwnership.findMany({ where: { leadId: input.leadId }, orderBy: { startedAt: "asc" } }),
        ctx.db.organisation.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
      ]);
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      const previous = history.at(-1);
      const stillHere = previous?.userId
        ? Boolean(await ctx.db.membership.findUnique({
            where: { orgId_userId: { orgId: ctx.orgId, userId: previous.userId } },
          }))
        : false;

      const protection = checkProtection({
        previousOwnerId: previous?.userId ?? null,
        lastContactAt: lead.conversation?.lastInboundAt ?? null,
        ownerStillHere: stillHere,
      });

      return summariseDispute({
        leadId: input.leadId,
        currentOwnerId: lead.assignedToId,
        protection,
        events: history.map((h) => ({
          at: h.startedAt,
          what: h.reason.toLowerCase().replace(/_/g, " "),
          who: h.userId,
          evidence: h.note ?? "ownership record",
        })),
      });
    }),

  claim: orgProcedure
    .input(z.object({ leadId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const lead = await tx.lead.findUnique({
          where: { id: input.leadId },
          select: { assignedToId: true },
        });
        if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
        if (lead.assignedToId) {
          throw new TRPCError({ code: "CONFLICT", message: "Somebody already has this one." });
        }

        await tx.lead.update({
          where: { id: input.leadId },
          data: { assignedToId: ctx.userId, assignedAt: new Date() },
        });
        await tx.leadOwnership.create({
          data: {
            orgId: ctx.orgId, leadId: input.leadId, userId: ctx.userId,
            reason: "CLAIMED", actorId: ctx.userId,
          },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "lead.claim",
          entity: "Lead", entityId: input.leadId,
        });
        return { ok: true, protectionDays: DEFAULT_PROTECTION_DAYS };
      })
    ),
});

async function candidatesFor(ctx: { db: any; orgId: string }): Promise<Candidate[]> {
  const members = await ctx.db.membership.findMany({
    where: { role: "AGENT" },
    select: { userId: true, user: { select: { name: true } } },
  });

  return Promise.all(members.map(async (m: any) => {
    const [openLeads, availability, last] = await Promise.all([
      ctx.db.lead.count({ where: { assignedToId: m.userId, deletedAt: null,
        status: { notIn: ["WON", "LOST"] } } }),
      ctx.db.agentAvailability.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: m.userId } } }),
      ctx.db.leadOwnership.findFirst({
        where: { userId: m.userId }, orderBy: { startedAt: "desc" }, select: { startedAt: true },
      }),
    ]);

    return {
      userId: m.userId, name: m.user.name, openLeads,
      capacity: availability?.capacity ?? 40,
      acceptingLeads: availability?.acceptingLeads ?? true,
      awayUntil: availability?.awayTo ?? null,
      languages: availability?.languages ?? [],
      communities: availability?.communities ?? [],
      lastAssignedAt: last?.startedAt ?? null,
      medianFirstResponseSeconds: null,
    };
  }));
}
