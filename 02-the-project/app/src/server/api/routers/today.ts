import { z } from "zod";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";

/**
 * What should I do today.
 *
 * The one question the product exists to answer, and until now the
 * answer was a message list. `DAY_BRIEF` counted viewings and unread
 * conversations, which tells an agent what is *there* rather than what
 * matters.
 *
 * Everything here is **read-only and pre-computed.** The scoring and the
 * recommendations were written overnight by `intelligence.sweep`, so
 * this is four indexed reads rather than an evaluation of the
 * brokerage's whole database while somebody waits at a traffic light.
 */
export const todayRouter = router({
  /**
   * The briefing.
   *
   * Ordered by priority, capped at five. Five is not a design
   * preference: it is the number an agent can hold between the car and
   * the front door, and a list of twenty is a list they scroll past.
   */
  brief: requirePermission("lead:read:own").query(async ({ ctx }) => {
    const now = new Date();

    /**
     * Fetched first, and not in the parallel batch, because everything
     * below depends on it.
     *
     * "Today" was `setHours(0, 0, 0, 0)` on the server's clock. On
     * Vercel that is UTC, so a Dubai agent's day began at four in the
     * morning and a viewing booked for 1am was filed under yesterday.
     * One indexed read by primary key is a cheap price for a day that
     * starts when the agent's day starts.
     */
    const org = await ctx.db.organisation.findUnique({
      where: { id: ctx.orgId },
      select: { timezone: true },
    });
    const tz = org?.timezone ?? "Asia/Dubai";
    const { start, end } = dayWindow(now, tz);

    const [actions, viewings, waiting, hot, dueFollowUps] = await Promise.all([
      ctx.db.recommendation.findMany({
        where: { agentId: ctx.userId, state: "OPEN" },
        orderBy: [{ priority: "desc" }, { valueFils: "desc" }],
        take: 5,
        select: {
          id: true, action: true, headline: true, reason: true,
          priority: true, valueFils: true, leadId: true,
        },
      }),

      ctx.db.viewing.findMany({
        where: {
          agentId: ctx.userId,
          scheduledAt: { gte: start, lt: end },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true, scheduledAt: true,
          lead: { select: { name: true } },
          listing: { select: { building: true, community: true } },
        },
      }),

      // Somebody has written to us and nobody has answered. The one
      // number in this product with a clock on it.
      ctx.db.conversation.count({
        where: { unreadCount: { gt: 0 }, lead: { assignedToId: ctx.userId } },
      }),

      /**
       * Hot, and what they are worth.
       *
       * 70 is the threshold, matching the CALL rule in the engine, so
       * the count on the briefing and the actions beneath it are drawn
       * from one line rather than two that drift.
       */
      ctx.db.lead.findMany({
        where: {
          assignedToId: ctx.userId,
          score: { gte: 70 },
          status: { notIn: ["WON", "LOST"] },
          deletedAt: null,
        },
        select: { id: true, name: true, score: true, budgetMaxFils: true },
        orderBy: { score: "desc" },
        take: 25,
      }),

      ctx.db.followUp.count({
        where: { agentId: ctx.userId, completedAt: null, dueAt: { lt: end } },
      }),
    ]);

    /**
     * Pipeline value, from the hot leads only.
     *
     * Summing every lead's budget produces a number nobody believes —
     * a brokerage with 4,000 dead leads has a "pipeline" of two billion
     * dirhams. This is what is actually live, which is a figure an owner
     * can repeat in a meeting.
     */
    const pipelineFils = hot.reduce((sum, l) => sum + (l.budgetMaxFils ?? 0n), 0n);

    return {
      actions,
      viewings,
      counts: {
        hot: hot.length,
        waiting,
        followUpsDue: dueFollowUps,
        viewingsToday: viewings.length,
      },
      pipelineFils,
      /**
       * The greeting, in the brokerage's own timezone.
       *
       * `now.getHours()` reads the *server's* clock, which on Vercel is
       * UTC — so an agent in Dubai opening this at eight in the evening
       * was greeted with "good afternoon". `Organisation.timezone`
       * exists and defaults to Asia/Dubai; this is what it is for.
       */
      partOfDay: partOfDay(now, tz),
    };
  }),

  /**
   * Not now.
   *
   * A dismissal is the most useful thing an agent tells this system: a
   * recommendation dismissed forty times is a rule that is wrong. It is
   * kept rather than deleted, and the sweep honours it for a fortnight
   * instead of raising the same suggestion the next night.
   */
  dismiss: requirePermission("lead:read:own")
    .input(z.object({
      id: z.string(),
      reason: z.string().trim().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Scoped to the caller, not just to the brokerage. One agent
      // dismissing another's recommendation is not a thing that should
      // be possible, and row-level security is about tenants rather
      // than about people inside one.
      const { count } = await ctx.db.recommendation.updateMany({
        where: { id: input.id, agentId: ctx.userId, state: "OPEN" },
        data: {
          state: "DISMISSED",
          resolvedAt: new Date(),
          resolvedById: ctx.userId,
          dismissReason: input.reason,
        },
      });
      return { dismissed: count === 1 };
    }),

  /**
   * Done.
   *
   * Separate from dismissing on purpose. "I did this" and "this was a
   * bad idea" are opposite signals, and collapsing them into one button
   * means the engine can never learn from either.
   */
  act: requirePermission("lead:read:own")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.recommendation.findFirst({
        where: { id: input.id, agentId: ctx.userId },
        select: { id: true, action: true, leadId: true, headline: true },
      });
      if (!rec) return { ok: false as const };

      await ctx.db.recommendation.update({
        where: { id: rec.id },
        data: { state: "ACTED", resolvedAt: new Date(), resolvedById: ctx.userId },
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "recommendation.acted",
        entity: "Recommendation",
        entityId: rec.id,
        after: { action: rec.action, leadId: rec.leadId },
      });

      return { ok: true as const };
    }),
});

/**
 * Morning, afternoon or evening where the agent actually is.
 *
 * `Intl` rather than arithmetic on an offset, because the UAE does not
 * observe daylight saving but a brokerage running a book from London
 * does, and hard-coding +4 gets that wrong twice a year.
 *
 * An unknown timezone falls back rather than throwing. Being greeted
 * with the wrong word is a blemish; a 500 on the front door is not.
 */
function partOfDay(now: Date, timeZone: string): "morning" | "afternoon" | "evening" {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone })
        .format(now)
    );
  } catch {
    hour = now.getUTCHours();
  }
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/**
 * Midnight to midnight, where the agent is.
 *
 * Derived from the formatted local date rather than from an offset,
 * for the same reason as the greeting: the UAE has no daylight saving
 * but a brokerage run from London does, and +4 is wrong twice a year.
 *
 * The arithmetic reads oddly and is the standard trick — format `now`
 * in the target zone, ask what that same wall-clock reading is in UTC,
 * and the difference is the offset in force *on that date*.
 */
export function dayWindow(now: Date, timeZone: string): { start: Date; end: Date } {
  let offsetMs: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"),
                           get("hour") % 24, get("minute"), get("second"));
    offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  } catch {
    offsetMs = 0;
  }

  // Local midnight, expressed as the UTC instant it corresponds to.
  const local = new Date(now.getTime() + offsetMs);
  const localMidnight = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()
  );
  const start = new Date(localMidnight - offsetMs);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
