import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

/**
 * The per-request nonce, and the two places it has to be written.
 *
 * This is what removed `'unsafe-inline'` from `script-src`. Next injects
 * inline bootstrap and hydration scripts into every document, so the only
 * way to allow those without allowing *any* inline script is to mark each
 * one with a value the attacker cannot predict.
 *
 * It goes in two places and both are required:
 *
 *   1. the **request** header, which is how Next learns the nonce and
 *      stamps it onto the scripts it injects;
 *   2. the **response** header, which is the policy the browser enforces.
 *
 * Set only the response header and every Next script is blocked and the
 * application renders a blank page. Set only the request header and the
 * scripts carry a nonce no policy asks for, which is not an error — so it
 * looks like it works and protects nothing. That second failure is the
 * dangerous one, which is why the check asserts the header is present and
 * that the document's script tags carry a nonce matching it.
 *
 * `crypto.randomUUID()` rather than `Math.random()`: the whole value of a
 * nonce is that it cannot be guessed, and the edge runtime has real
 * randomness available.
 */
function withCsp(res: NextResponse, nonce: string): NextResponse {
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  return res;
}

/**
 * Route protection.
 *
 * **It lives in `src/`, and that is not cosmetic.** This file sat at the
 * project root. Next.js looks for middleware at the root *or* inside
 * `src` when a `src` directory exists — and this project has one, so the
 * root copy was never compiled. `middleware-manifest.json` came out of
 * every build with `"sortedMiddleware": []`. It has never run, not once,
 * which is the only reason the stale path list below was never noticed.
 *
 * This only checks for the presence of a session cookie. It is a
 * redirect, not a security control — the real authorisation happens in
 * `orgProcedure` and in the database policies, both of which run on
 * every request. Middleware that pretends to be the gate is how people
 * end up with an API anyone can call directly.
 *
 * **It lists what is public, not what is protected.** It used to name
 * the protected prefixes, and the list had gone stale in the way that
 * kind of list always does:
 *
 *   - it began with `/app`, which never matched anything. `(app)` is a
 *     route group and route groups do not appear in the URL, so that
 *     entry protected a path that does not exist.
 *   - it omitted eleven real screens — `/leads`, `/viewings`, `/offers`,
 *     `/compliance`, `/commission`, `/blackbook`, `/vendors`, `/team`,
 *     `/me`, `/ask`, `/setup` — including every AML screen in the
 *     product.
 *
 * The data was never exposed: tRPC refuses an unauthenticated caller
 * whatever the middleware does. What a signed-out visitor got instead was
 * a rendered screen with every panel failing, rather than a sign-in page.
 *
 * Inverted, a new screen is protected by default and forgetting to add it
 * to a list can no longer be the mistake.
 */
const PUBLIC = [
  "/sign-in",
  "/signup",
  "/invite",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const nonce = crypto.randomUUID().replace(/-/g, "");

  /**
   * The request headers Next itself reads.
   *
   * Next looks for the nonce on the incoming `Content-Security-Policy`
   * header, not on a header of our choosing, so this has to be the real
   * policy string rather than the bare value. `x-nonce` is passed as well
   * so a server component can reach it if one ever needs to render an
   * inline script of its own.
   */
  const headers = new Headers(req.headers);
  const policy = buildCsp(nonce);
  headers.set("Content-Security-Policy", policy);
  headers.set("x-nonce", nonce);
  const forward = { request: { headers } };

  // Exact match or a child path — `/sign-in/check-your-email` is public
  // because `/sign-in` is, while a hypothetical `/sign-in-report` is not.
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return withCsp(NextResponse.next(forward), nonce);

  const cookie =
    req.cookies.get("__Secure-authjs.session-token") ??
    req.cookies.get("authjs.session-token");

  if (!cookie) {
    const url = new URL("/sign-in", req.url);
    // Carry the destination so sign-in returns them where they were going.
    url.searchParams.set("next", pathname);
    return withCsp(NextResponse.redirect(url), nonce);
  }
  return withCsp(NextResponse.next(forward), nonce);
}

export const config = {
  /**
   * Everything except the API, Next's own assets and the favicon.
   *
   * `/api` is excluded because tRPC and the webhooks do their own
   * authentication and a cookie redirect in front of a Meta webhook
   * would break it. The public pages are handled above rather than here,
   * so the whole rule is readable in one place.
   */
  matcher: [
    /**
     * Everything except the API, Next's own assets, and any path with a
     * file extension.
     *
     * The extension rule matters: this named `favicon.ico` specifically,
     * so the moment a second static file appeared — `site.webmanifest`,
     * the touch icon, an OG image — it was caught by the auth redirect
     * and served a 307 to the sign-in page. A manifest that redirects is
     * a manifest the browser discards, silently.
     */
    "/((?!api|_next/static|_next/image|.*\\..*).*)",
  ],
};
