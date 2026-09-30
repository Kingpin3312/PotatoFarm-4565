import { crossTenant } from "@/server/db/client";
import { validateForPublish, blocking } from "@/server/lib/feeds/validate";
import { readObject } from "@/server/lib/files/storage";
import { realPhotos, photoLocation } from "./photos";
import { photoList, photoPath, propertyPath } from "@/lib/listing-paths";

/**
 * One property, as a stranger may see it.
 *
 * ## Why this exists
 *
 * A brokerage has listings and, until a portal agreement is signed,
 * nowhere to put them. The feed solves the portal half — a URL a portal
 * fetches on a schedule — and leaves the thing an agent does forty
 * times a day: send somebody a property.
 *
 * Today that is a photo and a paragraph pasted into WhatsApp. A link is
 * better for the brokerage in a way that compounds: it renders as a
 * preview card in the chat, it carries the permit and the agent's RERA
 * card, and it is the only version of the property that updates when
 * the price changes.
 *
 * **It is also the one distribution channel that needs nobody's
 * permission.** Portals need a contract; this needs a URL.
 *
 * ## The gate is the same one, for the third time
 *
 * `queue.ts` pushes to a portal, `feed.ts` publishes a document, and
 * this renders a page — three routes to the same act of advertising a
 * property, so they run one validator. A separate rule here would
 * eventually let a property be advertised on the web that the portals
 * refuse, and the difference would show up as a complaint rather than
 * as an error.
 *
 * **A Trakheesi permit is required and that is not a portal
 * preference.** Advertising a Dubai property without a valid permit is
 * a fineable offence for the brokerage, and a public page is
 * advertising in exactly the sense the law means.
 */
export const PUBLIC_REQUIREMENTS = {
  requiresPermit: true,
  languages: ["en"],
  minPhotos: 1,
} as const;

export type PublicListing = {
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
  reraBrokerCard: string | null;
  /** Addresses of the real photos, cover first, under this page's path. */
  photos: string[];
  /**
   * Photos are on file but none is a stored image yet — the placeholders
   * from before photos could be uploaded. The page offers them on
   * request rather than drawing broken images.
   */
  photosOnRequest: boolean;
  brokerage: string;
  /** E.164, for the WhatsApp link. Null when the brokerage has no channel. */
  whatsapp: string | null;
  /**
   * The agent who looks after it, by name. A buyer at this level wants
   * to know who they will be dealing with before they write, and the
   * RERA card beside it is only half an answer without a name. Null
   * when nobody has been given the listing.
   */
  agent: string | null;
};

/**
 * Resolve a brokerage's property from the two things in the URL.
 *
 * `crossTenant("global-key")` because there is no session — a stranger
 * following a link from WhatsApp is the entire point. The pair
 * (slug, reference) is unique by database constraint, and both halves
 * are filtered explicitly, so the query can reach exactly one row of
 * one brokerage.
 *
 * Returns null for every kind of miss — unknown brokerage, unknown
 * reference, deleted, sold, unpermitted. **One answer for all of them**,
 * so the page cannot be used to discover which references exist or
 * which properties a brokerage has taken off the market.
 */
export async function publicListing(
  slug: string,
  reference: string,
): Promise<PublicListing | null> {
  return (await loadPublic(slug, reference))?.view ?? null;
}

/**
 * One photo of a public property, as a signed URL to redirect to — or
 * null for every kind of miss, exactly as the page answers.
 */
export async function publicPhoto(slug: string, reference: string, attachmentId: string): Promise<string | null> {
  const found = await loadPublic(slug, reference);
  if (!found) return null;
  return photoLocation({ orgId: found.orgId, listingId: found.listingId, descriptions: found.descriptions, attachmentId });
}

/**
 * The property and its cover photo's bytes, for the preview card.
 *
 * The bytes rather than a URL because the card is drawn server-side and
 * a signed URL would have to be fetched straight back anyway. A storage
 * failure is not a missing property: the card is drawn without the
 * photo, as it was before photos existed, rather than refusing.
 */
export async function publicCover(slug: string, reference: string) {
  const found = await loadPublic(slug, reference);
  if (!found) return null;
  let cover: { bytes: Uint8Array; mimeType: string } | null = null;
  if (found.cover) {
    cover = await readObject(found.cover.storageRef)
      .then((bytes) => ({ bytes, mimeType: found.cover!.mimeType }))
      .catch(() => null);
  }
  return { view: found.view, cover };
}

async function loadPublic(slug: string, reference: string) {
  const org = await crossTenant("global-key").organisation.findUnique({
    where: { slug },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!org || org.deletedAt) return null;

  const row = await crossTenant("global-key").listing.findUnique({
    where: { orgId_reference: { orgId: org.id, reference } },
    select: {
      status: true, reference: true, title: true, purpose: true,
      priceFils: true, community: true, building: true, bedrooms: true,
      bathrooms: true, areaSqft: true, permitNumber: true,
      permitExpiresAt: true, reraBrokerCard: true, descriptions: true,
      deletedAt: true, orgId: true, agentId: true, id: true,
    },
  });
  if (!row || row.deletedAt || row.status !== "AVAILABLE") return null;

  const d = (row.descriptions ?? {}) as { en?: string };
  const listed = photoList(row.descriptions);

  // The same validator the feed and the queue run.
  if (blocking(validateForPublish(row as never, PUBLIC_REQUIREMENTS, listed.length)).length) {
    return null;
  }
  const real = await realPhotos(row.orgId, row.id, row.descriptions);
  const path = propertyPath(slug, row.reference);

  /**
   * The brokerage's own WhatsApp number, so the enquiry lands in the
   * product rather than in somebody's personal chat.
   *
   * Null rather than a fallback: a "message us" button that opens a
   * blank chat, or worse somebody else's number, is worse than no
   * button. The page renders without it.
   */
  const channel = await crossTenant("global-key").channel.findFirst({
    where: { orgId: row.orgId, type: "WHATSAPP", active: true },
    select: { identifier: true },
  });

  // Only someone who still belongs to this brokerage: a listing whose
  // agent has left must not advertise a person the buyer cannot reach.
  const agent = row.agentId
    ? await crossTenant("global-key").membership.findFirst({
        where: { orgId: row.orgId, userId: row.agentId },
        select: { user: { select: { name: true } } },
      })
    : null;

  const view: PublicListing = {
    reference: row.reference,
    title: row.title,
    description: d.en ?? null,
    purpose: row.purpose === "RENT" ? "RENT" : "SALE",
    priceFils: row.priceFils,
    community: row.community,
    building: row.building,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    areaSqft: row.areaSqft,
    permitNumber: row.permitNumber,
    reraBrokerCard: row.reraBrokerCard,
    photos: real.map((p) => photoPath(path, p.id)),
    photosOnRequest: real.length === 0 && listed.length > 0,
    brokerage: org.name,
    whatsapp: channel?.identifier ?? null,
    agent: agent?.user.name ?? null,
  };
  return { view, orgId: row.orgId, listingId: row.id, descriptions: row.descriptions, cover: real[0] ?? null };
}

/**
 * The message the enquiry arrives as.
 *
 * It names the reference, because the assistant's first job is knowing
 * which property is being asked about — and a lead that opens with
 * "is this still available?" and no reference is one a human has to
 * disambiguate before anything else can happen.
 */
export function enquiryText(l: Pick<PublicListing, "reference" | "title">) {
  return `Hi — I'm interested in ${l.reference} (${l.title}). Is it still available?`;
}

/**
 * The message a request to see it arrives as. Same rule: the reference
 * first, so the assistant and the agent know which property at once.
 */
export function viewingText(l: Pick<PublicListing, "reference" | "title">) {
  return `Hello — I'd like to arrange a private viewing of ${l.reference} (${l.title}).`;
}

/** Where a property's page lives. One place builds it: `lib/listing-paths`. */
export { propertyPath };
