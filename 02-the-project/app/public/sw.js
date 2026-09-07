/**
 * The service worker, and mostly a list of things it refuses to do.
 *
 * What it is for: an agent taps the home-screen icon and the shell is
 * already on the device, so the app opens at once instead of pulling
 * 100KB of JavaScript over a Dubai basement connection. And when the
 * connection is gone entirely, they get a page that says so in words
 * rather than the browser's dinosaur.
 *
 * ---------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT CACHE, AND WHY
 *
 * **No HTML.** Every page in this app is server-rendered per request and
 * every page is behind sign-in. A cached page is somebody's leads,
 * sitting on the device after they sign out — and worse, served to the
 * *next* person who opens the app on a shared phone. There is no cache
 * key that makes that safe, so there is no cache.
 *
 * **No API responses.** Same reason, more sharply: `/api/trpc` is client
 * names, phone numbers and budgets. Caching those to disk is a decision
 * about where a brokerage's client list is allowed to live, and it is
 * not one to make silently inside a performance change.
 *
 * The audit suggested "offline read of today's list" and that is a good
 * feature — it is just a *data* feature with a privacy question attached
 * (a lost phone, a shared handset), and it needs an owner's answer about
 * retention and wiping on sign-out. Left out on purpose rather than
 * bolted on here.
 *
 * So what is cached is exactly the part with no personal data in it:
 * `/_next/static/*`, which is content-hashed and therefore safe to keep
 * forever, plus the icons and the offline page.
 * ---------------------------------------------------------------------
 */

const VERSION = "v1";
const SHELL = `potatofarm-shell-${VERSION}`;

/** Everything here is either content-hashed or has no personal data in it. */
const PRECACHE = ["/offline", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // `addAll` rejects the whole install if any single item 404s, and a
      // service worker that fails to install is invisible — it simply
      // never activates. Each is fetched on its own so one missing icon
      // cannot silently cost the offline page.
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /**
   * Content-hashed build output. The filename changes when the contents
   * change, so this can be cache-first without ever going stale — which
   * is the whole reason a cold open is fast.
   */
  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  /**
   * Everything else goes to the network, always — and that includes
   * every page and every API call. The only thing added is a civil
   * answer when the network is not there.
   *
   * The offline page is served only for a document request. Letting a
   * failed `/api/trpc` call fall back to an HTML page would hand the
   * client a parse error instead of a network error, and the screen
   * would say "that didn't load" for a reason that is not true.
   */
  event.respondWith(
    fetch(req).catch(() => {
      if (req.mode === "navigate") {
        return caches.match("/offline").then((hit) => hit ?? Response.error());
      }
      return Response.error();
    }),
  );
});
