/**
 * The session cookie, under both names NextAuth uses.
 *
 * ## Why both
 *
 * `auth/config.ts` sets `useSecureCookies: process.env.NODE_ENV === "production"`,
 * which is correct — the `__Secure-` prefix is a browser-enforced promise
 * that the cookie only ever travels over HTTPS. The consequence is that
 * the cookie NextAuth reads is named one thing under `next dev` and
 * another under `next start`.
 *
 * Every browser check set the development name. Run against a production
 * build they still *rendered*, because `middleware.ts` deliberately waves
 * through anything session-shaped and leaves the real gate to tRPC — so
 * what came back was the application shell with "You've been signed out"
 * inside it and a 401 behind every panel.
 *
 * **The checks then reported that as a product fault.** `check:blocking`
 * said a deal was missing from the board; `check:availability` timed out
 * waiting for a control that was never going to render. Both were true
 * sentences about a signed-out page, and both read as bugs in the
 * product. That is the failure this file exists to end: a check that is
 * wrong in the direction of alarm costs as much as one wrong in the
 * direction of silence.
 *
 * Sending both names is safe. The server reads the one it is configured
 * for and ignores the other, so a check proves the same thing against
 * either server rather than depending on which one happens to be up.
 */
export function sessionCookies(value) {
  const base = { value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" };
  return [
    { ...base, name: "authjs.session-token" },
    /**
     * `secure: true` is not optional here, and Chromium says so: the
     * `__Secure-` prefix is refused outright without it — "Invalid cookie
     * fields" — because the prefix's entire meaning is that promise.
     *
     * It still reaches `http://localhost`, because browsers treat
     * localhost as a trustworthy origin and send secure cookies to it.
     * That is what lets one check drive a production build over plain
     * HTTP without either weakening the server or standing up TLS.
     */
    { ...base, name: "__Secure-authjs.session-token", secure: true },
  ];
}

/** The same pair as a `cookie:` request header, for checks that use `fetch`. */
export function sessionCookieHeader(value) {
  return `authjs.session-token=${value}; __Secure-authjs.session-token=${value}`;
}
