import { Linking, Platform } from "react-native";

/**
 * Reaching a person, and getting to a place — native side.
 *
 * Mirrors `src/lib/contact.ts` because React Native cannot import from
 * the web bundle. Duplication is deliberate; drift is not, and
 * `_check.py` compares the two.
 *
 * The agent test found neither was possible anywhere in the product.
 * On a phone that omission is worse than on a desktop, because a phone
 * is the thing an agent is holding when they need to ring somebody.
 */

export function dial(phone: string | null | undefined) {
  if (!phone) return null;
  const clean = phone.replace(/[^\d+]/g, "");
  return clean.length >= 8 ? `tel:${clean}` : null;
}

export function whatsapp(phone: string | null | undefined) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, "");
  return clean.length >= 8 ? `whatsapp://send?phone=${clean}` : null;
}

/**
 * Directions, in the app the agent actually has.
 *
 * iOS opens Apple Maps, Android opens Google Maps. Forcing one provider
 * sends somebody to an app they have not installed, and an agent
 * standing in a car park does not want an App Store page.
 *
 * Coordinates first — an address search in Dubai returns three towers
 * with similar names and the agent picks the wrong one.
 */
export function directionsUrl(v: {
  lat?: number | null; lng?: number | null;
  address?: string | null; building?: string | null;
}) {
  if (v.lat != null && v.lng != null) {
    return Platform.select({
      ios: `maps://?daddr=${v.lat},${v.lng}&dirflg=d`,
      android: `google.navigation:q=${v.lat},${v.lng}`,
      default: `https://maps.google.com/?q=${v.lat},${v.lng}`,
    })!;
  }
  const q = [v.building, v.address].filter(Boolean).join(", ");
  if (!q) return null;
  const enc = encodeURIComponent(`${q}, Dubai`);
  return Platform.select({
    ios: `maps://?q=${enc}`,
    android: `geo:0,0?q=${enc}`,
    default: `https://maps.google.com/?q=${enc}`,
  })!;
}

/**
 * Open it, and fall back rather than fail.
 *
 * `canOpenURL` returns false for a scheme the app has not declared, and
 * on iOS that is a silent no-op the agent reads as a broken button. The
 * web URL always works.
 */
export async function open(primary: string | null, fallback?: string) {
  if (!primary) return false;
  try {
    if (await Linking.canOpenURL(primary)) {
      await Linking.openURL(primary);
      return true;
    }
  } catch {
    // fall through
  }
  if (fallback) {
    await Linking.openURL(fallback);
    return true;
  }
  return false;
}

export function apart(a: { lat?: number | null; lng?: number | null },
                     b: { lat?: number | null; lng?: number | null }) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
