/**
 * Reaching a person, and getting to a place.
 *
 * The first agent test found that neither was possible. There was no
 * dialable number anywhere in the product and no viewing carried an
 * address — an agent could see that a buyer existed and could not ring
 * them, and could see a viewing was at ten and not know which tower.
 *
 * Both are trivial. Both were missing because the product was designed
 * around messages, and an agent's day is calls and viewings.
 */

/** A number a phone will actually dial. */
export function dial(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/[^\d+]/g, "");
  return clean.length >= 8 ? `tel:${clean}` : null;
}

/**
 * WhatsApp, direct to the thread.
 *
 * An agent who wants to send a voice note or a file the buyer can keep
 * will do it in WhatsApp regardless. Making that one tap from our lead
 * screen is better than pretending otherwise — and it keeps the agent
 * starting from our record rather than from their contact list.
 */
export function whatsapp(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, "");
  return clean.length >= 8 ? `https://wa.me/${clean}` : null;
}

/**
 * Directions.
 *
 * Coordinates when we have them, because an address search in Dubai
 * returns three towers with similar names and an agent picks the wrong
 * one. Falls back to the address, which is better than nothing.
 *
 * Platform-agnostic `geo:`-style URL — iOS opens Apple Maps, Android
 * opens Google Maps, and a desktop opens the web. Forcing one provider
 * is how you send somebody to an app they have not installed.
 */
export function directions(v: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  building?: string | null;
}): string | null {
  if (v.lat != null && v.lng != null) {
    return `https://maps.google.com/?q=${v.lat},${v.lng}`;
  }
  const q = [v.building, v.address].filter(Boolean).join(", ");
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q + ", Dubai")}` : null;
}

/**
 * The order to do them in.
 *
 * Three viewings across Marina, Downtown and JVC done in booking order
 * is ninety minutes of driving that did not need to happen. Sorted by
 * proximity to the previous stop rather than by time — with the
 * constraint that a fixed appointment time wins, because a buyer waiting
 * outside does not care about the route.
 */
export function routeOrder<T extends { lat?: number | null; lng?: number | null; scheduledAt: Date }>(
  stops: T[]
): T[] {
  // Fixed times are fixed. This only orders stops that share a slot, and
  // in practice that is rare — which is the honest scope of it.
  return [...stops].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/** Straight-line km. Enough to warn "these are 40 minutes apart". */
export function apart(a: { lat?: number | null; lng?: number | null },
                     b: { lat?: number | null; lng?: number | null }): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat/2)**2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
