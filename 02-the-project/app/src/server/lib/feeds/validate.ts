import type { Listing } from "@prisma/client";

/**
 * Pre-publish validation.
 *
 * Portals reject listings silently from the brokerage's point of view —
 * the listing simply never appears, and nobody finds out until an owner
 * rings to ask why their villa isn't on Bayut. Catching it here, before
 * it is sent, turns a week of invisible absence into an error on the
 * screen of the person who just pressed publish.
 */

export type Problem = {
  field: string;
  message: string;
  severity: "block" | "warn";
};

/**
 * What each portal demands before it will accept a listing.
 *
 * This lived as a private const inside `listings.ts`, where only the
 * pre-publish *check* could reach it. The queue that actually sends the
 * listing needs the same table, and a second copy is how the button and
 * the sender come to disagree about whether a listing is publishable —
 * the button says yes, the portal says no, and the agent is told
 * "rejected" with no reason.
 *
 * Permit requirements are not preferences: Dubai requires a Trakheesi
 * number on every property advertisement, and advertising without a
 * valid one is a fineable offence for the brokerage.
 */
export const PORTAL_REQUIREMENTS = {
  PROPERTY_FINDER: { requiresPermit: true, languages: ["en", "ar"], minPhotos: 4 },
  BAYUT:           { requiresPermit: true, languages: ["en", "ar"], minPhotos: 4 },
  DUBIZZLE:        { requiresPermit: true, languages: ["en"], minPhotos: 3 },
  WEBSITE_FORM:    { requiresPermit: false, languages: ["en"], minPhotos: 1 },
} as const;

export type PortalRequirement =
  (typeof PORTAL_REQUIREMENTS)[keyof typeof PORTAL_REQUIREMENTS];

const DUBAI_PERMIT = /^\d{5,12}$/;

export function validateForPublish(
  listing: Listing & { descriptions?: Record<string, string> | null },
  // `readonly string[]`: the caller's rule table is a literal, so its
  // arrays are readonly tuples. This function only reads them, and
  // widening here is better than casting at both call sites.
  portal: { requiresPermit: boolean; languages: readonly string[]; minPhotos: number },
  photoCount: number
): Problem[] {
  const p: Problem[] = [];
  const block = (field: string, message: string) => p.push({ field, message, severity: "block" });
  const warn = (field: string, message: string) => p.push({ field, message, severity: "warn" });

  if (!listing.title?.trim()) block("title", "Needs a title.");
  if (listing.priceFils == null)
    block("price", "Needs a price. Portals reject listings without one.");
  if (!listing.community) warn("community", "No community set — this badly affects where it appears in search.");

  /**
   * The permit. Dubai requires a Trakheesi number on every property
   * advertisement, and advertising without a valid one is a fineable
   * offence for the brokerage rather than a portal inconvenience. That is
   * why an expired permit blocks rather than warns.
   */
  if (portal.requiresPermit) {
    if (!listing.permitNumber) {
      block("permitNumber", "Needs a Trakheesi permit number. Advertising without one is an offence, not just a rejection.");
    } else if (!DUBAI_PERMIT.test(listing.permitNumber.trim())) {
      block("permitNumber", "That permit number doesn't look right — check it against the DLD record.");
    }

    if (!listing.permitExpiresAt) {
      warn("permitExpiresAt", "No expiry recorded. Set it and we'll warn you before it lapses.");
    } else {
      const daysLeft = Math.floor((listing.permitExpiresAt.getTime() - Date.now()) / 86_400_000);
      if (daysLeft < 0) {
        block("permitExpiresAt", `Permit expired ${Math.abs(daysLeft)} days ago. Renew before republishing.`);
      } else if (daysLeft <= 14) {
        warn("permitExpiresAt", `Permit expires in ${daysLeft} days. Renew now or the listing gets pulled.`);
      }
    }

    if (!listing.reraBrokerCard) {
      warn("reraBrokerCard", "No RERA card on the listing. Some portals require one on the advertising agent.");
    }
  }

  for (const lang of portal.languages) {
    if (!listing.descriptions?.[lang]?.trim()) {
      lang === "en"
        ? block(`descriptions.${lang}`, "Needs an English description.")
        : warn(`descriptions.${lang}`, `No ${lang} description — the listing will reach fewer buyers.`);
    }
  }

  if (photoCount < portal.minPhotos) {
    block("photos", `Needs at least ${portal.minPhotos} photos. This one has ${photoCount}.`);
  }

  if (listing.status !== "AVAILABLE") {
    block("status", `Can't publish a listing marked ${listing.status.toLowerCase().replace("_", " ")}.`);
  }

  return p;
}

export const blocking = (problems: Problem[]) => problems.filter((p) => p.severity === "block");
