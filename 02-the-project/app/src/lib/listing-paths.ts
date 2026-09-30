/**
 * Addresses and lists that several domains need, with no imports.
 *
 * The property page's path and its photos' paths are wanted by the
 * listings router, the public page, the photo route and the portal feed.
 * They lived in `server/lib/listings`, and the feed importing them closed
 * a cycle (portals → listings → files → conversations → portals) that
 * `architecture.py` refuses. Pure functions over strings belong where
 * nothing can make them part of a cycle.
 */

/** The public page of one property. */
export function propertyPath(slug: string, reference: string) {
  return `/p/${encodeURIComponent(slug)}/${encodeURIComponent(reference)}`;
}

/** The public address of one photo, under the property's own page. */
export function photoPath(propertyPath: string, attachmentId: string) {
  return `${propertyPath}/photos/${attachmentId}`;
}

/** A listing's photo order as stored, whatever is in it. */
export function photoList(descriptions: unknown): string[] {
  const d = (descriptions ?? {}) as { photos?: unknown };
  return Array.isArray(d.photos) ? d.photos.filter((x): x is string => typeof x === "string") : [];
}
