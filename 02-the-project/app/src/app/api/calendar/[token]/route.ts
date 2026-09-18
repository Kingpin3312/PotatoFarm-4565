import { NextResponse, type NextRequest } from "next/server";
import { crossTenant } from "@/server/db/client";
import { buildIcs } from "@/server/lib/calendar/ics";
import { log } from "@/lib/log";

/**
 * The agent's viewings, as a subscribable calendar.
 *
 * **Unauthenticated by necessity, not by oversight.** Apple Calendar and
 * Google fetch a URL on a timer with no cookie, no header and no way to
 * sign in. The token in the path is the whole credential, which makes
 * this a capability URL and shapes every decision below.
 *
 *   * The token is 32 random bytes, base64url. Guessing is not a threat
 *     anybody has time for.
 *   * It is stored per membership so it can be **rotated** — the one
 *     mitigation that matters, because addresses leak through history,
 *     screenshots and proxy logs rather than through cryptanalysis.
 *   * It returns one agent's viewings in one brokerage. Not the team's.
 *   * `crossTenant` is unavoidable here: there is no session, so there
 *     is no tenant until the token resolves one. The reason is declared,
 *     and the org is pinned from the membership rather than from
 *     anything in the request.
 *   * Wrong token and missing token return the same 404. A different
 *     answer for "that token existed once" is a probe oracle.
 *   * `noindex` and `private` caching, so a leaked link at least does
 *     not end up in a search index.
 *
 * Read-only, always. Nothing here writes anything the caller controls;
 * the only write is a timestamp so an agent can see the feed is alive.
 */

/** A quiet window either side of today. Nobody subscribes to see 2019. */
const DAYS_BACK = 14;
const DAYS_FORWARD = 120;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Cheap shape check before touching the database, so a scanner
  // hammering /api/calendar/foo costs us nothing.
  if (!token || token.length < 20 || token.length > 100) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = crossTenant("pre-tenant");

  const membership = await db.membership.findUnique({
    where: { calendarToken: token },
    select: {
      id: true,
      orgId: true,
      userId: true,
      user: { select: { name: true } },
      org: { select: { name: true, deletedAt: true } },
    },
  });

  // Same answer for an unknown token and a brokerage that has been
  // deleted. Anything else tells a prober which of the two it found.
  if (!membership || membership.org.deletedAt) {
    return new NextResponse("Not found", { status: 404 });
  }

  const now = new Date();
  const from = new Date(now.getTime() - DAYS_BACK * 86_400_000);
  const to = new Date(now.getTime() + DAYS_FORWARD * 86_400_000);

  const viewings = await db.viewing.findMany({
    // Scoped by orgId *and* agentId. The token identifies one agent in
    // one brokerage and the query says so explicitly rather than relying
    // on the token having been looked up correctly.
    where: {
      orgId: membership.orgId,
      agentId: membership.userId,
      scheduledAt: { gte: from, lte: to },
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true, scheduledAt: true, durationMins: true, address: true,
      building: true, accessNote: true, status: true, updatedAt: true,
      lead: { select: { name: true, phone: true } },
      listing: { select: { reference: true } },
    },
  });

  const body = buildIcs(
    viewings.map((v) => ({
      id: v.id,
      scheduledAt: v.scheduledAt,
      durationMins: v.durationMins,
      address: v.address,
      building: v.building,
      accessNote: v.accessNote,
      status: v.status,
      updatedAt: v.updatedAt,
      leadName: v.lead?.name ?? null,
      leadPhone: v.lead?.phone ?? null,
      listingReference: v.listing?.reference ?? null,
    })),
    { name: `Viewings — ${membership.org.name}`, now },
  );

  /**
   * A heartbeat, so "is my calendar working" is answerable.
   *
   * The silent failure here is a subscription that quietly stops — a
   * rotated token, a client that gave up — and the agent finds out by
   * missing a viewing. The settings screen shows this timestamp, which
   * turns an invisible absence into a visible date.
   *
   * Fire-and-forget: a calendar client waiting on our write is worse
   * than a stale timestamp.
   */
  void db.membership
    .update({ where: { id: membership.id }, data: { calendarLastReadAt: now } })
    .catch((e: unknown) =>
      log.warn("calendar.heartbeat.failed",
        { orgId: membership.orgId, userId: membership.userId },
        { error: String(e) }));

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="viewings.ics"',
      "cache-control": "private, max-age=300",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
