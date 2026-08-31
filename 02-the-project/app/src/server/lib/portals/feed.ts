import { crossTenant } from "@/server/db/client";
import { validateForPublish, blocking } from "@/server/lib/feeds/validate";

/**
 * The listing feed — distribution that needs no partner API.
 *
 * ## Why this exists alongside the publish queue
 *
 * `portals/queue.ts` pushes a listing to a portal over that portal's
 * own API. That is the better mechanism and it is blocked on a
 * commercial agreement per portal, which is not an engineering problem
 * and cannot be solved from inside this repository.
 *
 * A feed is the other half of how UAE portals actually ingest: the
 * brokerage publishes an XML document of its live listings at a URL,
 * and the portal fetches it on a schedule. **The engineering side of
 * that is finished the moment the URL exists** — signing the agreement
 * then means handing somebody a link rather than starting a build.
 *
 * So this is what makes the portal step turnkey. On the day a contract
 * is signed the sequence is: copy the URL out of Settings, give it to
 * the portal, done.
 *
 * ## What it does not claim
 *
 * **Being in the feed is not being advertised.** The portal may not
 * have fetched it yet, may reject it, may be paused. Nothing here
 * writes `PUBLISHED`, and nothing here touches `ListingPublication` at
 * all — that record means "we pushed this and the portal accepted it",
 * which is a different fact. Blurring the two is how a brokerage comes
 * to believe a property is live when it is not, which `queue.ts` argues
 * about at length and is the reason `NOT_CONNECTED` exists.
 *
 * The feed reports what it contains and when it was generated. Whether
 * a portal consumed it is the portal's to tell us.
 *
 * ## The gate is shared, not copied
 *
 * A listing appears here under exactly the conditions that let it be
 * pushed — live, permitted, priced. Two gates would drift, and the
 * failure would be a property advertised through one route that the
 * other refuses, with no error anywhere.
 */

/** The law, and the bare minimum for a listing to be advertisable. */
const FEED_REQUIREMENTS = { requiresPermit: true, languages: ["en"], minPhotos: 1 } as const;

export type FeedListing = {
  reference: string;
  title: string;
  description: string | null;
  purpose: "SALE" | "RENT";
  priceFils: bigint | null;
  community: string | null;
  building: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number | null;
  permitNumber: string | null;
  permitExpiresAt: Date | null;
  reraBrokerCard: string | null;
  photos: string[];
  updatedAt: Date;
};

/**
 * Every listing a brokerage is entitled to advertise, right now.
 *
 * `crossTenant("global-key")` because the caller has authenticated with
 * a feed token, which is globally unique and resolves to exactly one
 * brokerage — the same shape as a provider reference. The org is then
 * filtered explicitly below, so the scope is narrower than the reason
 * allows rather than wider.
 */
export async function feedFor(orgId: string): Promise<FeedListing[]> {
  const rows = await crossTenant("global-key").listing.findMany({
    where: {
      orgId,
      deletedAt: null,
      status: "AVAILABLE",
    },
    select: {
      // `status` is filtered on above and must also be *selected*:
      // `validateForPublish` reads it, and an unselected field arrives
      // as undefined rather than as an error — so the feed threw on
      // `status.toLowerCase()` for every listing. Filtering by a column
      // does not fetch it.
      status: true,
      reference: true, title: true, purpose: true, priceFils: true,
      community: true, building: true, bedrooms: true, bathrooms: true,
      areaSqft: true, permitNumber: true, permitExpiresAt: true,
      reraBrokerCard: true, descriptions: true, updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  const out: FeedListing[] = [];
  for (const r of rows) {
    const d = (r.descriptions ?? {}) as { photos?: string[]; en?: string };
    const listing: FeedListing = {
      reference: r.reference,
      title: r.title,
      description: d.en ?? null,
      purpose: r.purpose === "RENT" ? "RENT" : "SALE",
      priceFils: r.priceFils,
      community: r.community,
      building: r.building,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      areaSqft: r.areaSqft,
      permitNumber: r.permitNumber,
      permitExpiresAt: r.permitExpiresAt,
      reraBrokerCard: r.reraBrokerCard,
      photos: Array.isArray(d.photos) ? d.photos : [],
      updatedAt: r.updatedAt,
    };
    /**
     * The same validator the push path runs, so the two routes cannot
     * disagree about what may be advertised.
     *
     * The requirements are the feed's own and deliberately minimal:
     * **a Trakheesi permit, because that one is the law** — advertising
     * without a valid permit is a fineable offence for the brokerage,
     * not a portal preference — plus at least one photo, because a
     * listing with none is not advertisable anywhere.
     *
     * Per-portal minimums (Property Finder and Bayut want four photos
     * and Arabic copy) are deliberately not applied here. Withholding a
     * listing the portal has not asked us to withhold means a property
     * silently never appears, which is the failure this whole area
     * exists to avoid. The portal enforces its own rules on ingest and
     * tells us; that rejection is information, and an empty feed is not.
     */
    const problems = validateForPublish(r as never, FEED_REQUIREMENTS, listing.photos.length);
    if (blocking(problems).length === 0) out.push(listing);
  }
  return out;
}

/** XML text nodes. `&` first, or it double-escapes the others. */
function xml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // XML 1.0 forbids these outright, and one stray character from a
    // pasted description makes the whole document unparseable — so a
    // portal rejects every listing because of one.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** AED, whole units. Portals want a number, not a formatted string. */
function aed(fils: bigint | null): string {
  if (fils === null) return "";
  return String(fils / 100n);
}

/**
 * A generic, well-formed listing feed.
 *
 * **Each portal will want its own element names**, and that mapping
 * arrives with the partner agreement. This is deliberately one function
 * over a typed list rather than a template scattered through a route:
 * a second format is a second function beside this one, and the data
 * layer above does not change.
 *
 * Every field a UAE portal is known to require is present — the
 * Trakheesi permit number and the listing agent's RERA card especially,
 * because a feed without them is rejected wholesale and the rejection
 * usually names only the first offending listing.
 */
export function toXml(listings: FeedListing[], meta: { brokerage: string }): string {
  const items = listings.map((l) => `  <listing>
    <reference>${xml(l.reference)}</reference>
    <title>${xml(l.title)}</title>
    <description>${xml(l.description)}</description>
    <purpose>${xml(l.purpose)}</purpose>
    <price currency="AED">${aed(l.priceFils)}</price>
    <community>${xml(l.community)}</community>
    <building>${xml(l.building)}</building>
    <bedrooms>${l.bedrooms ?? ""}</bedrooms>
    <bathrooms>${l.bathrooms ?? ""}</bathrooms>
    <size unit="sqft">${l.areaSqft ?? ""}</size>
    <permit>
      <trakheesi>${xml(l.permitNumber)}</trakheesi>
      <expires>${l.permitExpiresAt ? l.permitExpiresAt.toISOString().slice(0, 10) : ""}</expires>
    </permit>
    <agent><reraBrokerCard>${xml(l.reraBrokerCard)}</reraBrokerCard></agent>
    <photos>
${l.photos.map((p) => `      <photo>${xml(p)}</photo>`).join("\n")}
    </photos>
    <lastUpdated>${l.updatedAt.toISOString()}</lastUpdated>
  </listing>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  PotatoFarm.io listing feed for ${xml(meta.brokerage)}.
  Generated ${new Date().toISOString()}. ${listings.length} listing(s).

  Every listing here is live, has a valid Trakheesi permit and carries
  the RERA card of the agent it is advertised under. Listings failing
  any of those are withheld rather than sent and rejected.
-->
<listings generated="${new Date().toISOString()}" count="${listings.length}">
${items}
</listings>
`;
}
