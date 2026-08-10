import type { NextConfig } from "next";

import { buildCsp } from "./src/lib/csp";

/**
 * Content-Security-Policy.
 *
 * The policy itself now lives in `src/lib/csp.ts`, because the middleware
 * needs it too — it is the only place a per-request nonce can be minted,
 * and a nonce is what let `'unsafe-inline'` come out of `script-src`.
 *
 * **What is set here is the fallback, and it reaches no page.** Middleware
 * matches every route that renders a document, so every document gets the
 * nonce policy. What is left is the API and Next's own static assets:
 * neither serves HTML that runs an inline script, so the weaker directive
 * has nothing to protect and nothing to break.
 *
 * Middleware sets the header on its own responses, and a header set there
 * replaces this one rather than stacking with it — verified by curling a
 * page and counting a single Content-Security-Policy in the response.
 */
const csp = buildCsp();

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
          /**
           * `microphone=(self)`, and it took building the feature to
           * notice.
           *
           * This read `microphone=()` — an empty allowlist, meaning no
           * origin at all, including this one. It was correct when it
           * was written, because nothing used the microphone. The moment
           * voice notes arrived it became a header that silently blocks
           * the product's most differentiated interaction:
           * `getUserMedia` rejects with `NotAllowedError`, which is the
           * same error a user denying permission produces, so it reads
           * as the agent having said no rather than as a policy the
           * server sent.
           *
           * Camera and geolocation stay closed. Nothing asks for them,
           * and the day something does is the day to open them
           * deliberately rather than in advance.
           */
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
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
