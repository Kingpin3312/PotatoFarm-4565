import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { configured } from "@/server/lib/email/providers";
import { forgetSecret } from "@/server/lib/secrets/vault";
import { audit } from "@/server/lib/audit";

/**
 * An agent's own mailboxes: which providers this installation can
 * connect, what is connected, and whether it is still syncing. Each
 * agent sees and disconnects only their own — a mailbox is personal
 * even when the mail in it is about the brokerage's clients.
 */
export const emailRouter = router({
  status: requirePermission("lead:read:own").query(async ({ ctx }) => {
    const accounts = await ctx.db.emailAccount.findMany({
      where: { agentId: ctx.userId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, provider: true, address: true, lastSyncedAt: true, lastError: true },
    });
    const counts = accounts.length
      ? await ctx.db.emailMessage.groupBy({ by: ["accountId"], where: { accountId: { in: accounts.map((a) => a.id) } }, _count: { _all: true } })
      : [];
    return {
      google: configured("GOOGLE"),
      microsoft: configured("MICROSOFT"),
      accounts: accounts.map((a) => ({ ...a, messages: counts.find((c) => c.accountId === a.id)?._count._all ?? 0 })),
    };
  }),

  disconnect: requirePermission("lead:read:own")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.db.emailAccount.findFirst({ where: { id: input.id, agentId: ctx.userId }, select: { id: true, secretRef: true } });
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "That mailbox is not connected." });
      // The key goes; the mail already logged stays on the timeline.
      await forgetSecret(a.secretRef);
      await ctx.db.emailAccount.update({ where: { id: a.id }, data: { active: false } });
      await audit(ctx.db, ctx.orgId, { actorId: ctx.userId, action: "email.disconnected", entity: "EmailAccount", entityId: a.id, after: { active: false } });
      return { ok: true };
    }),
});
