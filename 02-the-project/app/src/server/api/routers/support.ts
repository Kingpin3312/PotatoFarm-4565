import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";

/**
 * The customer's side of support access. Everything here is theirs to
 * control — we can request, we cannot grant.
 */
export const supportRouter = router({
  /** What is active right now, and everything that ever was. */
  grants: orgProcedure.query(async ({ ctx }) => {
    const [active, history] = await Promise.all([
      ctx.db.supportGrant.findMany({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { grantedAt: "desc" },
      }),
      crossTenant("sweep").auditLog.findMany({
        where: { orgId: ctx.orgId, action: { startsWith: "support." } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { action: true, entity: true, entityId: true, after: true, createdAt: true },
      }),
    ]);
    return { active, history };
  }),

  /**
   * Granting. Admin and above, because letting an agent open the
   * brokerage's data to an outsider is not their decision to make.
   *
   * Maximum 72 hours. Not configurable — an indefinite grant is a
   * backdoor with a nicer name, and the point of the whole design is that
   * one does not exist.
   */
  grant: requirePermission("org:update")
    .input(z.object({
      staffEmail: z.string().trim().toLowerCase().email(),
      reason: z.string().trim().min(5).max(200),
      hours: z.number().min(1).max(72).default(24),
      canWrite: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const expiresAt = new Date(Date.now() + input.hours * 3_600_000);

      const grant = await ctx.db.$transaction(async (tx) => {
        const g = await tx.supportGrant.create({
          data: {
            orgId: ctx.orgId,
            staffEmail: input.staffEmail,
            reason: input.reason,
            canWrite: input.canWrite,
            grantedById: ctx.userId,
            expiresAt,
          },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "support.granted",
          entity: "SupportGrant",
          entityId: g.id,
          after: { staffEmail: input.staffEmail, canWrite: input.canWrite, hours: input.hours, reason: input.reason },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        return g;
      });

      return grant;
    }),

  /**
   * Revoking. Any member, not just an admin — if somebody in the
   * brokerage is uncomfortable with an outsider being in their data, they
   * should not have to find a manager first. Re-granting takes ten
   * seconds; the asymmetry is deliberate.
   */
  revoke: orgProcedure
    .input(z.object({ grantId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const g = await tx.supportGrant.findFirst({ where: { id: input.grantId, revokedAt: null } });
        if (!g) throw new TRPCError({ code: "NOT_FOUND", message: "That grant is already closed." });

        await tx.supportGrant.update({
          where: { id: g.id },
          data: { revokedAt: new Date(), revokedById: ctx.userId },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "support.revoked",
          entity: "SupportGrant",
          entityId: g.id,
          before: { staffEmail: g.staffEmail },
        });

        return { revoked: true };
      })
    ),
});
