import { router, requirePermission } from "../trpc";

/**
 * Channels.
 *
 * The silence check lived in `portals/health.ts` and ran as a job with
 * nothing exposing it to a screen — so a brokerage could only find out a
 * feed had stopped by noticing fewer leads.
 *
 * A channel going quiet produces no error. That is the whole problem,
 * and it is why this is a screen rather than only an alert.
 */
export const channelsRouter = router({
  health: requirePermission("channel:read").query(async ({ ctx }) => {
    const channels = await ctx.db.channel.findMany({
      where: { active: true },
      select: { id: true, label: true, type: true, lastSyncAt: true, lastError: true },
      orderBy: { label: "asc" },
    });

    const now = Date.now();
    return {
      channels: channels.map((c) => {
        const hours = c.lastSyncAt ? (now - c.lastSyncAt.getTime()) / 3_600_000 : null;
        /**
         * Thresholds differ per channel on purpose.
         *
         * Meta lead ads are the tightest: a dead token there means leads
         * are arriving and cannot be collected, and the retention window
         * is finite — they are lost, not delayed. A portal is usually
         * just a quiet day.
         */
        const limit =
          c.type === "META_LEAD_ADS" ? 24 :
          c.type === "WEBSITE_FORM"  ? 72 :
          c.type === "WHATSAPP"      ? 96 : 48;
        return {
          id: c.id,
          label: c.label,
          lastAt: c.lastSyncAt,
          lastAgo: hours == null ? null : ago(hours),
          lastError: c.lastError,
          quiet: hours != null && hours > limit,
        };
      }),
    };
  }),
});

/** Rounded to something a person says out loud. "37 hours" is a number;
 *  "a day and a half" is an answer. */
function ago(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const d = Math.round(hours / 24);
  return d === 1 ? "a day ago" : `${d} days ago`;
}
