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
   * Recorded on every fetch, and the record is the point.
   *
   * A portal that silently stops fetching is exactly the shape of
   * failure this product is built to catch — nothing errors, listings
   * simply stop being refreshed, and it reads as a quiet market.
   *
   * This used to be the `log.info` below and nothing else, under a
   * comment asserting that `portals/health.ts` "alarms on silence from
   * a feed; this is the line that gives it something to measure". It
   * did not and could not: health sweeps `Channel`, a feed is not a
   * channel, and a log line is not a measurement. **The alarm named in
   * the comment had no input at all**, so a portal that stopped pulling
   * was detected by nobody — the same fault as the Meta channel that
   * never wrote `lastSyncAt`, in the outbound direction.
   *
   * Not awaited, and that is deliberate: a portal is waiting on this
   * response, and a slow write must not delay the XML or turn a
   * bookkeeping failure into a failed fetch. `checkFeedSilence()` reads
   * it, and `org.listingFeed` shows it on the settings screen beside the URL
   * so a brokerage can see whether their portal is actually pulling.
   */
  void crossTenant("global-key").organisation
    .update({ where: { id: org.id }, data: { feedFetchedAt: new Date() } })
    .catch((err) => log.warn("[feed] could not record the fetch", { orgId: org.id },
                             { err: String(err).slice(0, 120) }));

  log.info("[feed] served", { orgId: org.id }, { listings: listings.length });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Portals poll. A short cache absorbs a portal fetching more
      // often than it needs to without letting a price change sit
      // stale for long enough to matter.
      // `private`, not `public`. The file's own comment two paragraphs
      // up says the URL is a credential, and this is a brokerage's
      // whole inventory with prices. The calendar route next door,
      // built the same way, already says `private`.
      "Cache-Control": "private, max-age=300",
      // The URL is a credential. Keep it out of search engines and out
      // of any referrer a photo host might otherwise receive.
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
