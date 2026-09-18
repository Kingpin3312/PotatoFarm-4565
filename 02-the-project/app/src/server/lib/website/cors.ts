/**
 * The marketing site posts to the application, and they are not the same
 * origin.
 *
 * `potatofarm.io` is ten static files on a CDN with no build step and no
 * environment variables — that is the point of it. The two forms on it
 * need a server, and there was one: a folder called `website-api/` with
 * no `package.json`, no `next.config`, no `tsconfig` and two conflicting
 * app directories. It could never have been deployed, so both forms
 * posted to a URL nothing served. The demo form is the site's only
 * conversion path.
 *
 * Rather than stand up a second Next project for two endpoints, the two
 * routes moved here, into the one that already deploys. The cost is that
 * `potatofarm.io` now calls `app.potatofarm.io`, which is cross-origin,
 * which needs this.
 *
 * **An allowlist, not `*`.** These endpoints send email and write rate
 * limit rows. `Access-Control-Allow-Origin: *` would let any page on the
 * internet drive them from a visitor's browser, with that visitor's IP
 * on the rate limit key.
 */

/**
 * Where the site is served from.
 *
 * `www` is here because a CDN that answers on the apex usually answers
 * on `www` too, and a redirect that happens for a page navigation does
 * not happen for a `fetch` — the preflight just fails and the form dies
 * with "that didn't send".
 */
const ALLOWED = new Set([
  "https://potatofarm.io",
  "https://www.potatofarm.io",
]);

/**
 * Development. The static site is usually opened with `python3 -m
 * http.server` or straight off the filesystem, and neither of those is
 * https on a real host.
 */
function devAllowed(origin: string) {
  return (
    process.env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

/**
 * Headers to attach to a response.
 *
 * Returns nothing for an origin we do not know, which is not a rejection
 * — the request still runs. It is the *browser* that refuses to hand the
 * response back to a page it was not addressed to. A server-side caller
 * with curl was never subject to CORS in the first place, and pretending
 * otherwise is security theatre; the rate limit is the real control.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !(ALLOWED.has(origin) || devAllowed(origin))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    // Tells a cache that the response differs per origin. Without it a
    // CDN can serve the headers for one origin to another.
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** The preflight. Both routes export this directly. */
export function preflight(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/**
 * The caller's address, for rate limiting.
 *
 * `x-forwarded-for` is a list appended to by each proxy, so the client is
 * the first entry. Taking the last gives you the platform's own edge,
 * which would rate-limit every visitor as one.
 *
 * **Null, not the string "unknown", when there is no header.** That was
 * the original and it is a live fault rather than a tidiness point:
 * `keysFor` drops falsy keys but keeps a truthy `"unknown"`, so every
 * visitor behind a proxy that does not set the header would share one
 * bucket, and the third demo request of the day would lock the form for
 * everybody else. Null means the limit falls back to the email address
 * alone — weaker, and the correct direction to fail for the one form
 * that brings in customers.
 */
export function callerIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || null;
}
