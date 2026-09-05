import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { LEVEL_LABEL, MODE_BLURB, MODE_LABEL } from "@/server/lib/intelligence/autonomy";

/**
 * What the product did on its own, and how to take it back.
 *
 * `AiAction` was written into the schema with request, interpretation,
 * before, after, who approved and how to undo — and then had exactly one
 * writer and no reader at all. A record nobody can look at is not an
 * audit trail, it is a table.
 *
 * This is the screen that decides whether a brokerage ever moves off
 * Copilot. The argument for autonomy is never "trust it"; it is "here is
 * everything it did, why it did it, and the button that reverses it".
 *
 * Separate from `AuditLog`, which records what a *person* did. Two
 * different questions, and a brokerage owner asking "what has this thing
 * been doing" should not have to read past their own team's actions to
 * find out.
 */
export const activityRouter = router({
  /**
   * Recent first, and scoped to the person asking.
   *
   * An agent sees what was done on their behalf. Widening this to the
   * whole brokerage turns it into a management report, and a manager
   * reading an agent's assistant activity changes what the agent asks
   * it for — the same reasoning that keeps the blackbook private.
   */
  mine: requirePermission("lead:read:own")
    .input(z.object({ limit: z.number().int().min(1).max(100).default(40) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.aiAction.findMany({
        where: { agentId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 40,
        select: {
          id: true, origin: true, action: true, request: true, interpretation: true,
          entity: true, entityId: true, after: true, autonomy: true, outcome: true,
          error: true, createdAt: true, undoneAt: true, approvedAt: true,
        },
      });

      return rows.map((r) => ({
        ...r,
        levelLabel: LEVEL_LABEL[r.autonomy],
        /**
         * Only some things can be taken back, and the screen must not
         * offer a button that will fail. A transcription cannot be
         * un-transcribed; a follow-up the product created can be
         * removed.
         */
        undoable: r.outcome === "DONE" && r.undoneAt === null && r.entity === "FollowUp",
      }));
    }),

  /** The brokerage's setting, and what each option actually means. */
  autonomy: requirePermission("lead:read:own").query(async ({ ctx }) => {
    const s = await ctx.db.assistantSettings.findUnique({
      where: { orgId: ctx.orgId },
      select: { autonomy: true, enabled: true },
    });
    return {
      mode: s?.autonomy ?? ("COPILOT" as const),
      // The kill switch outranks the setting, and the screen has to say
      // so — otherwise Autopilot appears selected and nothing happens.
      assistantEnabled: s?.enabled ?? false,
      options: (["COPILOT", "ASSISTED", "AUTOPILOT"] as const).map((m) => ({
        mode: m,
        label: MODE_LABEL[m],
        blurb: MODE_BLURB[m],
      })),
    };
  }),

  /**
   * Change the setting.
   *
   * `org:update` rather than `lead:update`. Deciding how much a
   * brokerage's software may do unattended is an owner's decision, not
   * something any agent can turn up on a Friday.
   *
   * (Written as `org:settings` first, which does not exist. `crm-audit`
   * fails the build on a permission that is used and never defined,
   * which is why that check is a failure and not a warning.)
   */
  setAutonomy: requirePermission("org:update")
    .input(z.object({ mode: z.enum(["COPILOT", "ASSISTED", "AUTOPILOT"]) }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.assistantSettings.findUnique({
        where: { orgId: ctx.orgId },
        select: { autonomy: true },
      });

      await ctx.db.assistantSettings.upsert({
        where: { orgId: ctx.orgId },
        create: { orgId: ctx.orgId, autonomy: input.mode },
        update: { autonomy: input.mode },
      });

      // In the human audit log, not the AI one. A person changed this.
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "assistant.autonomy.changed",
        entity: "AssistantSettings",
        entityId: ctx.orgId,
        before: { autonomy: before?.autonomy ?? "COPILOT" },
        after: { autonomy: input.mode },
      });

      return { mode: input.mode };
    }),

  /**
   * Take it back.
   *
   * The record is kept and marked undone rather than deleted, for the
   * same reason the audit log has DELETE revoked: a reversal is itself
   * information, and a log that can be emptied is not a log.
   */
  undo: requirePermission("lead:read:own")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.db.aiAction.findFirst({
        where: { id: input.id, agentId: ctx.userId },
        select: { id: true, entity: true, entityId: true, undoneAt: true, outcome: true },
      });
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "No such action." });
      if (a.undoneAt) return { ok: true as const, already: true };

      if (a.entity !== "FollowUp" || !a.entityId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That one can't be undone.",
        });
      }

      /**
       * Completed rather than deleted.
       *
       * The reminder still happened and an agent may have acted on it
       * already; erasing the row would take that history with it.
       * Marking it done clears it from every list, which is what "undo"
       * means to the person pressing it.
       */
      await ctx.db.followUp.updateMany({
        where: { id: a.entityId, completedAt: null },
        data: { completedAt: new Date() },
      });

      await ctx.db.aiAction.update({
        where: { id: a.id },
        data: { undoneAt: new Date(), undoneById: ctx.userId },
      });

      return { ok: true as const, already: false };
    }),
});
