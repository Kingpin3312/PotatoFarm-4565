import { crossTenant } from "@/server/db/client";
import { signGet } from "@/server/lib/files/storage";
import { photoList } from "@/lib/listing-paths";

/**
 * A listing's photographs.
 *
 * ## Why this exists
 *
 * Publishing a listing anywhere — the buyer's page, the portal feed, the
 * push queue — requires at least one photo, and **nothing in the product
 * could add one.** `descriptions.photos` had exactly one writer, the
 * seed, which filled it with the names `01.jpg`…`04.jpg`. So every real
 * brokerage's listing failed the photo rule for ever, and the demo's feed
 * handed portals file names they could not download: the light switch
 * wired to nothing, on the one wall a portal looks at.
 *
 * ## How they are kept
 *
 * A photo is an `Attachment` of kind PHOTO on the listing — the same row,
 * storage and type-sniffing as a brochure, so there is one way a file
 * gets in. The *order* stays in `descriptions.photos`, which every
 * publishing gate already counts, as the attachments' ids; the first is
 * the cover. Anything else in that list is a placeholder from before
 * this existed: counted as it always was, never shown, and dropped the
 * moment an agent adds a real photo.
 *
 * ## How a stranger sees one
 *
 * Through `/p/<brokerage>/<reference>/photos/<id>`, which answers only
 * while the property's own page would, and then redirects to a URL
 * signed for a few minutes. The bucket stays private; a withheld
 * property's photos go dark with its page.
 */

export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;
/** A phone photo is 3–8MB; a professional one exported for web is under 5. */
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024;
/** Property Finder takes 50; a buyer looks at the first dozen. */
export const PHOTO_LIMIT = 30;
/**
 * How long a signed photo URL lives. Long enough for a slow phone to
 * finish loading a gallery; short enough that a copied URL stops working
 * the same afternoon.
 */
export const PHOTO_URL_SECONDS = 600;

/** Where one listing's photos live in the bucket. */
export function photoPrefix(orgId: string, listingId: string) {
  return `org/${orgId}/listings/${listingId}/photos/`;
}

export { photoList, photoPath } from "@/lib/listing-paths";

/**
 * The real photos, in order.
 *
 * Only ids that name a PHOTO attachment *of this listing* count, so a
 * list edited by hand, or an id copied from another property, shows
 * nothing rather than somebody else's kitchen.
 */
export async function realPhotos(orgId: string, listingId: string, descriptions: unknown) {
  const ids = photoList(descriptions);
  if (!ids.length) return [];
  const rows = await crossTenant("global-key").attachment.findMany({
    where: { orgId, listingId, kind: "PHOTO", id: { in: ids } },
    select: { id: true, storageRef: true, fileName: true, mimeType: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
}

/**
 * Where a request for one photo goes, or null.
 *
 * Callers decide first whether the reader may see the listing at all —
 * `publicPhoto` asks the property page's own gate — so this only has to
 * answer whether the id is one of *this* listing's photos.
 */
export async function photoLocation(args: {
  orgId: string;
  listingId: string;
  descriptions: unknown;
  attachmentId: string;
}): Promise<string | null> {
  const photo = (await realPhotos(args.orgId, args.listingId, args.descriptions))
    .find((p) => p.id === args.attachmentId);
  if (!photo) return null;
  return signGet({ key: photo.storageRef, expiresInSeconds: PHOTO_URL_SECONDS });
}
