import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection.
 *
 * This only checks for the presence of a session cookie. It is a redirect,
 * not a security control — the real authorisation happens in
 * `orgProcedure` and in the database policies, both of which run on every
 * request. Middleware that pretends to be the gate is how people end up
 * with an API anyone can call directly.
 */
const PROTECTED = ["/app", "/settings", "/inbox", "/pipeline", "/listings", "/reports"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname.startsWith(p))) return NextResponse.next();

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sign-in).*)"],
};
