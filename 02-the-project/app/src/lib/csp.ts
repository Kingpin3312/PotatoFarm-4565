/**
 * The Content-Security-Policy, in one place.
 *
 * It used to live inline in `next.config.ts`. It moved here because two
 * things now need it — the config, for the routes middleware does not
 * touch, and the middleware itself, which is the only place a per-request
 * nonce can be minted. A policy defined twice is a policy that drifts,
 * and the half that drifts is the half nobody is testing.
 *
 * Written per directive rather than as one string because the reasoning
 * differs per line and the next person will need to change exactly one.
 */

const dev = process.env.NODE_ENV !== "production";

/**
 * Build the policy.
 *
 * @param nonce  When given, inline scripts must carry this exact nonce.
 *               When omitted, `'unsafe-inline'` is used instead — see the
 *               note on that branch below.
 */
export function buildCsp(nonce?: string): string {
  /**
   * The directive that actually stops cross-site scripting.
   *
   * **With a nonce** this is the strict form. `'strict-dynamic'` means a
   * script the browser already trusts may load further scripts, which is
   * how Next's bootstrap can pull its chunks without every chunk URL
   * being listed. When `'strict-dynamic'` is present a modern browser
   * *ignores* `'self'` and any host allow-list, so those are left out of
   * this branch rather than written down misleadingly.
   *
   * `'unsafe-eval'` stays in development only. Webpack's hot reload
   * evaluates strings as JavaScript, and without it every page throws
   * `Refused to evaluate a string as JavaScript` and the application does
   * not render locally at all. That is worth naming, because the natural
   * response to a security header that breaks your own machine is to
   * delete the security header.
   */
  const script = nonce
    ? `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`
    : /**
       * The fallback, and it is deliberately not reachable from a page.
       *
       * Only routes the middleware does not match get this — the API and
       * Next's own static assets. Neither serves HTML that executes an
       * inline script, so the weaker directive has nothing to protect and
       * nothing to break. Every route that renders a document goes
       * through middleware and gets a nonce.
       */
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`;

  return [
    // Nothing loads from anywhere unless a directive below says otherwise.
    "default-src 'self'",

    script,

    /**
     * Still `'unsafe-inline'`, and unlike the script directive this one
     * is not a compromise worth removing.
     *
     * Tailwind emits a style element carrying every design token, and
     * React sets inline `style` attributes for layout. A nonce does not
     * cover style *attributes* at all — only `<style>` elements — so
     * removing this would need every inline style rewritten as a class.
     * The exposure is a style injection, not script execution. Recorded
     * so it reads as a decision rather than an oversight.
     */
    "style-src 'self' 'unsafe-inline'",

    /**
     * The service worker, and the manifest.
     *
     * `worker-src` is not covered by `script-src` in every browser and
     * falls back to `child-src` then `default-src` when absent — with
     * `'strict-dynamic'` in play that is exactly the sort of gap where a
     * worker silently fails to register and the only symptom is a cold
     * open that stayed slow. Named explicitly instead.
     */
    "worker-src 'self'",
    "manifest-src 'self'",

    // Avatars and listing photos come from object storage over https.
    "img-src 'self' data: blob: https:",

    // Self-hosted or system. No third-party font CDN.
    "font-src 'self' data:",

    /**
     * Where the browser may talk to. Same origin covers tRPC; everything
     * server-side — Anthropic, Stripe's API, Meta's Graph API, Resend —
     * is called from the server and must not be here.
     *
     * `ws:` in development only: hot reload is a websocket back to the
     * dev server, and without it the page loads once and never updates.
     */
    `connect-src 'self' https://api.stripe.com${dev ? " ws: http://localhost:*" : ""}`,

    // Stripe's card form is an iframe and there is nothing else embedded.
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",

    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
