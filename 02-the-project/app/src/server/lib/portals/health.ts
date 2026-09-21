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

/**
 * The outbound half, which had no alarm at all.
 *
 * `checkChannelSilence()` above watches feeds coming *in*. Listings go
 * *out* by a portal fetching `/api/feed/<token>/listings.xml` on a
 * schedule, and that is the only route by which a brokerage's
 * properties reach Property Finder, Bayut or Dubizzle today — no
 * integration exists, and a feed needs no partner agreement, only a URL
 * handed over.
 *
 * A portal that stops fetching it produces exactly the symptom this
 * file opens by describing: nothing errors, listings simply stop being
 * refreshed, prices go stale, withdrawn properties stay advertised, and
 * it reads as a quiet market. The feed route's own comment claimed this
 * function existed. It did not.
 *
 * ## Why a brokerage that has never been fetched is not an alarm
 *
 * `feedFetchedAt` is null until a portal first pulls, and today that is
 * the ordinary state of every brokerage — no contract is signed, so
 * nobody has the URL. Alarming on that would fire for every customer
 * every day, and an alarm that is always on is one somebody switches
 * off, taking the real one with it.
 *
 * So the entry condition is: a token has been issued **and** something
 * has fetched at least once. That is a brokerage with a live portal
 * arrangement, which is the only population where silence means
 * something has broken.
 *
 * Note this is the same `if (!x) continue` that hid the Meta bug two
 * files away, and here it is correct rather than a hole — because
 * something now writes the field. The guard was never the fault; the
 * missing writer was.
 */
/**
 * Exported, because `org.listingFeed` answers the same question for
 * the screen and two copies of one threshold is how the alarm and the
 * screen come to disagree about whether a feed is quiet.
 */
export const FEED_SILENT_HOURS = Number(process.env.FEED_SILENT_HOURS ?? 48);

export async function checkFeedSilence() {
  const orgs = await crossTenant("sweep").organisation.findMany({
    where: { deletedAt: null, feedToken: { not: null }, feedFetchedAt: { not: null } },
    select: { id: true, name: true, feedFetchedAt: true, feedTokenAt: true },
  });

  const alerts: { orgId: string; name: string; quietHours: number; expected: number }[] = [];
  for (const o of orgs) {
    if (!o.feedFetchedAt) continue;
    const quietHours = (Date.now() - o.feedFetchedAt.getTime()) / 3_600_000;
    if (quietHours <= FEED_SILENT_HOURS) continue;
    /**
     * A rotation is the likeliest innocent explanation, and the schema
     * comment on `feedTokenAt` says so: rotating the token is how
     * access is revoked, and a portal still holding the old URL stops
     * fetching immediately. Reported either way — somebody has to hand
     * over the new URL — but the ordering means the person reading the
     * alert checks the right thing first.
     */
    alerts.push({ orgId: o.id, name: o.name, quietHours, expected: FEED_SILENT_HOURS });
  }
  return alerts;
}
