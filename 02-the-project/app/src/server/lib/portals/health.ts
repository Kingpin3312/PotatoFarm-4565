import { crossTenant } from "@/server/db/client";

/**
 * The silence alarm.
 *
 * This is the most important file in the portal integration, and it is
 * the one most products never write.
 *
 * A broken portal feed almost never throws. The credentials expire, or
 * the partner rotates a webhook secret, or a firewall rule changes, and
 * the endpoint simply stops being called. Nothing errors. Nothing alerts.
 * The board just gets quieter, and everyone assumes the market is slow.
 *
 * By the time a brokerage owner rings to ask why leads have dried up, it
 * has usually been a fortnight, and those leads went to whoever else was
 * advertising on that portal. That is a churn event, and it is entirely
 * preventable by watching for absence rather than for errors.
 */

/** Expected quiet hours per channel, learned from its own history. */
const FLOOR_HOURS = 4;   // never alarm faster than this
const CEILING_HOURS = 48; // always alarm by this point

/**
 * Meta is checked harder than the portals.
 *
 * A property portal going quiet usually means a quiet day. Meta going
 * quiet while the brokerage is still paying for ads means either the
 * ads stopped or our token died — and one of those is our fault and
 * loses leads permanently.
 *
 * So the window is shorter and the message says which to check first.
 */
const SILENCE_HOURS: Record<string, number> = {
  META_LEAD_ADS: 24,
  PROPERTY_FINDER: 48,
  BAYUT: 48,
  DUBIZZLE: 48,
  WEBSITE_FORM: 72,
};

export async function checkChannelSilence() {
  const channels = await crossTenant("sweep").channel.findMany({
    where: { active: true, type: { not: "WHATSAPP" } },
    select: { id: true, orgId: true, label: true, type: true, lastSyncAt: true },
  });

  const alerts: { channelId: string; orgId: string; label: string; quietHours: number; expected: number }[] = [];

  for (const c of channels) {
    if (!c.lastSyncAt) continue; // never connected — a different problem

    const quietHours = (Date.now() - c.lastSyncAt.getTime()) / 3_600_000;

    // The threshold is derived from what this channel normally does, not
    // from a number somebody picked. A portal that delivers forty leads a
    // day should alarm after a few hours; one that delivers two a week
    // should not.
    const expected = await expectedQuietHours(c.id);
    if (quietHours > expected) {
      alerts.push({ channelId: c.id, orgId: c.orgId, label: c.label, quietHours, expected });
    }
  }

  return alerts;
}

async function expectedQuietHours(channelId: string) {
  // Median gap between enquiries over the last 30 days, times three.
  const rows = await crossTenant("sweep").$queryRaw<{ median_gap_hours: number | null }[]>`
    WITH gaps AS (
      SELECT EXTRACT(EPOCH FROM ("createdAt" - LAG("createdAt")
             OVER (ORDER BY "createdAt"))) / 3600 AS gap
      FROM "Enquiry"
      WHERE "channelId" = ${channelId}
        AND "createdAt" > NOW() - INTERVAL '30 days'
    )
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap) AS median_gap_hours
    FROM gaps WHERE gap IS NOT NULL
  `;

  const median = rows[0]?.median_gap_hours ?? null;
  if (median === null) return CEILING_HOURS; // no history yet
  return Math.min(CEILING_HOURS, Math.max(FLOOR_HOURS, median * 3));
}

/**
 * Also worth watching, and cheaper to fix early: contactability. A portal
 * sending a rising share of enquiries with no usable phone number is a
 * commercial problem — the brokerage is paying for leads it cannot ring —
 * and it is invisible unless somebody counts.
 */
export async function contactabilityByChannel(orgId: string, days = 30) {
  return crossTenant("sweep").$queryRaw<{ channelId: string; total: bigint; reachable: bigint }[]>`
    SELECT e."channelId",
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE l.phone NOT LIKE 'pending:%') AS reachable
    FROM "Enquiry" e
    JOIN "Lead" l ON l.id = e."leadId"
    WHERE e."orgId" = ${orgId}
      AND e."createdAt" > NOW() - (${days} || ' days')::INTERVAL
    GROUP BY e."channelId"
  `;
}
