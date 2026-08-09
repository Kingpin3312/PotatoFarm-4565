import { NextResponse, type NextRequest } from "next/server";

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

  // Exact match or a child path — `/sign-in/check-your-email` is public
  // because `/sign-in` is, while a hypothetical `/sign-in-report` is not.
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return NextResponse.next();

  const cookie =
    req.cookies.get("__Secure-authjs.session-token") ??
    req.cookies.get("authjs.session-token");

  if (!cookie) {
    const url = new URL("/sign-in", req.url);
    // Carry the destination so sign-in returns them where they were going.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
