import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Four security headers were set and this, the one that actually stops
 * cross-site scripting, was not. The others harden the edges; CSP is the
 * one that decides whether an injected `<script>` runs.
 *
 * It is written out per directive rather than as one string because the
 * reasoning differs per line and the next person will need to change one
 * of them.
 */
const csp = [
  // Nothing loads from anywhere unless a directive below says otherwise.
  "default-src 'self'",

  /**
   * `'unsafe-inline'` is here and it should not be permanent.
   *
   * Next injects inline bootstrap scripts, and removing this needs a
   * nonce threaded through the document — which means giving up static
   * rendering on every page that has one. That is a real trade and it
   * belongs in its own change rather than smuggled in here. Recorded so
   * it is a decision rather than an oversight.
   */
  "script-src 'self' 'unsafe-inline'",

  // Tailwind emits a style element; the design tokens are all in it.
  "style-src 'self' 'unsafe-inline'",

  // Avatars and listing photos come from object storage over https.
  "img-src 'self' data: blob: https:",

  // Self-hosted or system. No third-party font CDN — the marketing site
  // pulls Inter from rsms.me and the application deliberately does not.
  "font-src 'self' data:",

  /**
   * Where the browser may talk to. Same origin covers tRPC; the rest are
   * the services the client genuinely reaches. Everything server-side —
   * Anthropic, Stripe's API, Meta's Graph API, Resend — is called from
   * the server and must not be in this list.
   */
  "connect-src 'self' https://api.stripe.com",

  // Stripe's card form is an iframe and there is nothing else embedded.
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",

  // Nothing may embed us. Belt and braces with X-Frame-Options, which
  // older browsers use instead.
  "frame-ancestors 'none'",

  // A form on this origin cannot be made to post somewhere else.
  "form-action 'self'",

  // No <base> tag rewriting relative URLs out from under us.
  "base-uri 'self'",

  // No Flash, no Java, nothing embedded by plugin.
  "object-src 'none'",

  // Upgrade any stray http subresource rather than blocking it outright.
  "upgrade-insecure-requests",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    formats: ["image/avif", "image/webp"],
    /**
     * Empty, deliberately.
     *
     * This allowed `cdn.sanity.io`, left over from the CMS in
     * `99-superseded` that this application has never used. An allowed
     * remote host on the image optimiser is a request this server will
     * make on behalf of anyone who can put a URL in front of it.
     */
    remotePatterns: [],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          /**
           * HSTS. Two years, subdomains included.
           *
           * Not preloaded: that is irreversible for the domain and is a
           * decision for whoever owns it, not a default to inherit.
           */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default config;
