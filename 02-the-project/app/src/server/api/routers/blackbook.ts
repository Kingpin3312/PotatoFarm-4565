import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { timeline } from "@/server/lib/blackbook/timeline";
import { audit } from "@/server/lib/audit";
import { TRPCError } from "@trpc/server";

/**
 * The blackbook.
 *
 * An agent's own view of the people they deal with, and the one place
 * WhatsApp, email, viewings and offers appear on one line together.
 *
 * Every procedure here is scoped to the calling agent. A blackbook that
 * a manager can read is not a blackbook — it is a report, and nobody
 * writes an honest note in a report.
 */
export const blackbookRouter = router({
  /** My people, most recently touched first. */
  mine: requirePermission("lead:read:own")
    .input(z.object({ q: z.string().trim().max(80).optional(),
                      tag: z.string().trim().max(40).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.blackbookEntry.findMany({
        // Scoped to the caller, always. Not a filter a future edit can
        // drop — see the audit invariant.
        where: {
          agentId: ctx.userId,
          ...(input?.tag ? { tags: { has: input.tag } } : {}),
        },
        orderBy: [{ starred: "desc" }, { lastTouched: "desc" }],
        take: 300,
        select: {
          id: true, nickname: true, tags: true, starred: true, lastTouched: true,
          standaloneName: true, standalonePhone: true, standaloneEmail: true,
          leadId: true, vendorId: true,
          /**
           * The note comes back with the row now.
           *
           * A standalone contact — the mortgage broker, the conveyancer,
           * the people this page exists for — has no lead behind it and
           * so no detail page to open. Without the note here the row was
           * a name, two tags and a dead end, and the one piece of
           * information the agent actually wrote down was unreachable.
           */
          privateNote: true,
        },
      });
      return rows;
    }),

  /** One person, everything said to them, newest first. */
  /**
   * One person's whole history.
   *
   * The party is looked up before the timeline is built. `timeline()`
   * queries by id and returns empty lists for an id that matches
   * nothing, so a stale link rendered a complete, confident person page
   * for somebody who does not exist — reply window, empty history and
   * all. Worse than an error, because it looks like a real record with
   * nothing in it.
   *
   * Also enforces that exactly one of the two is given. Neither would
   * have thrown inside `timeline()` on `vendorId!`.
   */
  person: requirePermission("lead:read:own")
    .input(z.object({ leadId: z.string().optional(), vendorId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (!input.leadId === !input.vendorId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ask for a buyer or an owner, not both and not neither.",
        });
      }

      const exists = input.leadId
        ? await ctx.db.lead.findFirst({
            where: { id: input.leadId, deletedAt: null }, select: { id: true } })
        : await ctx.db.vendor.findFirst({
            where: { id: input.vendorId }, select: { id: true } });

      if (!exists) {
        throw new TRPCError({ code: "NOT_FOUND", message: "There is nobody here." });
      }

      return timeline({ orgId: ctx.orgId, agentId: ctx.userId, ...input });
    }),

  /** Add somebody, or somebody who is in nobody's pipeline. */
  add: requirePermission("lead:read:own")
    .input(z.object({
      leadId: z.string().optional(),
      vendorId: z.string().optional(),
      standaloneName: z.string().trim().max(120).optional(),
      standalonePhone: z.string().trim().max(30).optional(),
      standaloneEmail: z.string().trim().toLowerCase().email().max(160).optional(),
      nickname: z.string().trim().max(60).optional(),
      tags: z.array(z.string().trim().max(40)).max(12).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const e = await ctx.db.blackbookEntry.create({
        data: { orgId: ctx.orgId, agentId: ctx.userId, ...input,
                lastTouched: new Date() },
      });
      return { id: e.id };
    }),

  /**
   * The agent's own note.
   *
   * Deliberately NOT audited. An audit entry is a record a manager can
   * read, and the whole value of a private note is that nobody else
   * sees it. Auditing it would quietly make it a public field.
   */
  note: requirePermission("lead:read:own")
    .input(z.object({ id: z.string(), privateNote: z.string().max(4000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.blackbookEntry.updateMany({
        where: { id: input.id, agentId: ctx.userId },
        data: { privateNote: input.privateNote, lastTouched: new Date() },
      });
      return { ok: true };
    }),

  /**
   * Export — theirs, in full, whenever they ask.
   *
   * Not a retention feature and not something to make hard. An agent
   * who believes the book is theirs uses it; one who suspects it is a
   * trap keeps their real notes on their phone, and then the brokerage
   * has neither.
   *
   * This one IS audited, because a bulk export is a security event even
   * when it is entirely legitimate.
   */
  exportMine: requirePermission("lead:read:own")
    .mutation(async ({ ctx }) => {
      const rows = await ctx.db.blackbookEntry.findMany({
        where: { agentId: ctx.userId },
        select: { nickname: true, tags: true, privateNote: true, starred: true,
                  standaloneName: true, standalonePhone: true, standaloneEmail: true,
                  lastTouched: true },
      });
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "blackbook.exported",
        entity: "BlackbookEntry", entityId: ctx.userId,
        after: { count: rows.length },
      });
      return {
        entries: rows,
        // Said plainly rather than discovered later.
        yours: "Your notes, nicknames and tags.",
        staysWithBrokerage:
          "Client records, transaction history and the compliance file, " +
          "which the brokerage is legally required to retain.",
      };
    }),
});
