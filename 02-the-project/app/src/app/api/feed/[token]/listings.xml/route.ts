import { NextResponse } from "next/server";
import { crossTenant } from "@/server/db/client";
import { feedFor, toXml } from "@/server/lib/portals/feed";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The brokerage's listing feed, for a portal to fetch.
 *
 * Deliberately built the same way as `/api/calendar/[token]` — an
 * unguessable token in the path, no session, and the same answer for an
 * unknown token as for a deleted brokerage. A portal cannot hold a
 * login, so the URL is the credential, which means the URL is a secret
 * and rotating it is how access is revoked.
 *
 * ## Why this endpoint is the point of the whole listings feature today
 *
 * No portal integration exists, because each needs a partner agreement.
 * A feed does not: a portal is given a URL and fetches it on a schedule.
 * So this is the route by which a brokerage's properties can actually
 * reach Property Finder, Bayut or Dubizzle **on the day the contract is
 * signed, with no further engineering** — copy the URL out of Settings
 * and hand it over.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Cheap shape check before touching the database, so a scanner
  // hammering /api/feed/foo/listings.xml costs nothing.
  if (!token || token.length < 20 || token.length > 100) {
    return new NextResponse("Not found", { status: 404 });
  }

  const org = await crossTenant("global-key").organisation.findUnique({
    where: { feedToken: token },
    select: { id: true, name: true, deletedAt: true },
  });

  // One answer for an unknown token and for a brokerage that has been
  // deleted. Anything else tells a prober which of the two it found.
  if (!org || org.deletedAt) {
    return new NextResponse("Not found", { status: 404 });
  }

  const listings = await feedFor(org.id);
  const body = toXml(listings, { brokerage: org.name });

  /**
   * Logged on every fetch, and this is not noise.
   *
   * A portal that silently stops fetching is exactly the shape of
   * failure this product is built to catch — nothing errors, listings
   * simply stop being refreshed, and it reads as a quiet market.
   * `portals/health.ts` alarms on silence from a feed; this is the line
   * that gives it something to measure.
   */
  log.info("[feed] served", { orgId: org.id }, { listings: listings.length });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Portals poll. A short cache absorbs a portal fetching more
      // often than it needs to without letting a price change sit
      // stale for long enough to matter.
      "Cache-Control": "public, max-age=300",
      // The URL is a credential. Keep it out of search engines and out
      // of any referrer a photo host might otherwise receive.
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
