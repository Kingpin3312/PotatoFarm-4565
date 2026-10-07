/**
 * Phone alerts, the browser's half. Pure helpers: no React, no tRPC, so
 * the settings section and the on-open refresh share one reading of
 * what this browser can do.
 */

export type Support =
  /** Ready to ask. */
  | "ok"
  /** An iPhone or iPad in Safari: alerts need the Home Screen app first. */
  | "ios-not-installed"
  /** This browser cannot do push at all. */
  | "unsupported"
  /** No service worker registered (a development build, or one refused). */
  | "no-worker";

export function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function support(): Promise<Support> {
  const pushable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // Safari on iOS only exposes push to a web app opened from the Home
  // Screen, so a missing PushManager there means "install first", not
  // "impossible" — and the agent needs telling which.
  if (!pushable) return isIos() && !isStandalone() ? "ios-not-installed" : "unsupported";
  // The worker registers just after the page loads, so on a first visit
  // it may not be there yet. Wait a few seconds for it rather than tell
  // the agent something is broken; a development build never registers
  // one, and gets the honest answer once the wait runs out.
  const reg = await navigator.serviceWorker.getRegistration("/")
    ?? await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 5000)),
    ]);
  return reg ? "ok" : "no-worker";
}

/** What the agent will recognise in their list of devices. */
export function deviceLabel(): "iPhone" | "iPad" | "Android" | "Mac" | "Windows" | "Linux" | "This browser" {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "This browser";
}

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(sub: PushSubscription, publicKey: string) {
  const k = sub.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k), b = keyBytes(publicKey);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Subscribe this browser to the server's key. A subscription made with a
 * different key (the server's keys were replaced) cannot receive
 * anything and is swapped for a fresh one.
 */
export async function subscribe(publicKey: string) {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) throw new Error("no service worker");
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, publicKey)) return existing;
  if (existing) await existing.unsubscribe().catch(() => {});
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

/** What the server needs, and nothing else. */
export function describe(sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  return { endpoint: j.endpoint, keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" } };
}

/** Remembered on this phone: which person turned alerts on here. */
const OWNER = "pf-alerts-owner";
export const owner = {
  get: () => { try { return localStorage.getItem(OWNER); } catch { return null; } },
  set: (userId: string) => { try { localStorage.setItem(OWNER, userId); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(OWNER); } catch { /* private mode */ } },
};
