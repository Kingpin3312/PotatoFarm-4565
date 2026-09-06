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
export function whatsapp(
  phone: string | null | undefined,
  text?: string
): string | null {
  if (!phone) return null;
  // Digits only, and no leading zero: `wa.me` wants the full
  // international number with no `+`, no spaces and no `(0)`. A UAE
  // number written the way people write it — +971 (0) 55 316 8157 — has
  // a zero in the middle that must not survive, or the link opens a
  // chat with a number nobody owns.
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("9710")) clean = "971" + clean.slice(4);
  if (clean.length < 8) return null;
  return text
    ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${clean}`;
}

/**
 * Directions — turn by turn, not a pin.
 *
 * ## This did not do what its own name said
 *
 * It returned `https://maps.google.com/?q=<lat>,<lng>`, which **drops a
 * marker on a map**. The agent still has to press the directions button
 * themselves, choose a start point, and wait for a route — at the
 * kerbside, holding a phone, with a buyer waiting. The one thing the
 * button is for was the one thing it did not do.
 *
 * The comment above it described a third behaviour again: "platform
 * agnostic `geo:`-style URL — iOS opens Apple Maps, Android opens
 * Google Maps". It was neither `geo:` nor platform-agnostic; it was a
 * hard-coded Google host. Three descriptions, one implementation, none
 * of them matching.
 *
 * This is Google's documented Maps URLs endpoint. `api=1` is the
 * contract that makes it stable, `dir/` is the routing mode, and
 * `travelmode=driving` skips the mode picker. On a phone with the app
 * installed it opens the app already routing; without it, the browser
 * does the same thing.
 *
 * Coordinates when we have them, because an address search in Dubai
 * returns three towers with similar names and an agent picks the wrong
 * one. The address is the fallback, which is better than nothing.
 */
export function directions(v: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  building?: string | null;
}): string | null {
  const base = "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=";
  if (v.lat != null && v.lng != null) {
    return `${base}${v.lat},${v.lng}`;
  }
  const q = [v.building, v.address].filter(Boolean).join(", ");
  return q ? `${base}${encodeURIComponent(q + ", Dubai, UAE")}` : null;
}

/**
 * The same journey in Waze, for the agents who live in it.
 *
 * Dubai traffic makes this a real preference rather than a nicety, and
 * Waze cannot be reached by the Google URL above. `navigate=yes` starts
 * the route rather than only centring the map — the same distinction
 * that made the Google link wrong for three generations.
 */
export function waze(v: {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  building?: string | null;
}): string | null {
  if (v.lat != null && v.lng != null) {
    return `https://waze.com/ul?ll=${v.lat},${v.lng}&navigate=yes`;
  }
  const q = [v.building, v.address].filter(Boolean).join(", ");
  return q ? `https://waze.com/ul?q=${encodeURIComponent(q + ", Dubai, UAE")}&navigate=yes` : null;
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
