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

  /**
   * The image optimiser is **off**, and that is a security decision.
   *
   * ## What was here
   *
   * `formats: ["image/avif", "image/webp"]` — AVIF encoding enabled on
   * `/_next/image`, a route `middleware.ts` excludes from the auth
   * matcher by name. Measured against the running production build: it
   * returned **200 and `content-type: image/avif` to a request carrying
   * no session cookie**, while `/today` correctly redirected to
   * sign-in. That is precisely the precondition for the advisory
   * "Unauthenticated Remote Code Execution in Image Optimization API
   * when AVIF files are used", and `sharp`'s own libvips and libheif
   * CVEs sit underneath it on the same parsing path.
   *
   * ## Why off rather than upgraded
   *
   * The whole of Next 15 is inside the affected range — the fix lands
   * in 16.3.0, a major upgrade that is not something to do in a hurry.
   * And **nothing in this application renders through `next/image`**:
   * the only file that names it is `middleware.ts`, and only to exclude
   * the route. So the optimiser was pure attack surface with no product
   * benefit, and turning it off costs exactly nothing.
   *
   * Property photographs are served from object storage, not through
   * this route. If `next/image` is ever adopted, the framework upgrade
   * has to come first — and `check:preflight` is the place to assert
   * that, not a comment.
   *
   * `remotePatterns` stays empty for the older reason, which is still
   * true: it once allowed `cdn.sanity.io`, left over from a CMS this
   * application has never used, and an allowed remote host on the
   * optimiser is a request this server will make on behalf of anyone
   * who can put a URL in front of it.
   */
  images: {
    unoptimized: true,
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
