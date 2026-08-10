import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "@/styles/globals.css";

/**
 * Every document is rendered per request, and the reason is the nonce.
 *
 * `script-src` carries `'nonce-…' 'strict-dynamic'` instead of
 * `'unsafe-inline'`, so each of Next's injected scripts has to be stamped
 * with the same one-time value the response header names. A prerendered
 * page cannot be: its HTML is written once at build time and the nonce
 * changes on every request.
 *
 * That is not a theory. With the pages still prerendered, the header
 * carried a nonce, **zero of the sixteen script tags did**, and Chromium
 * refused all sixteen — the sign-in page rendered fifteen characters and
 * never hydrated. It looked fine to any check that only asserts the CSP
 * header exists, which is exactly why the browser check now compares the
 * header's nonce against the nonces in the document.
 *
 * **What it costs.** 30 pages that were prerendered are now
 * server-rendered per request. For this product the bill is small: every
 * one of them is behind sign-in and fetches its data through tRPC on the
 * client anyway, so what was being prerendered was an empty shell. Vercel
 * bills the invocations; the data queries are unchanged.
 *
 * To go back, delete this line — and put `'unsafe-inline'` back in
 * `src/lib/csp.ts` in the same commit, or the app serves a blank page.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PotatoFarm.io",
  description: "The WhatsApp assistant that answers your enquiries before your competitors do.",
  robots: { index: false, follow: false }, // the app is not for search engines
  /**
   * There was no `public/` directory at all, so every page requested
   * `/favicon.ico` and got a 404 — a blank tab in a browser where an
   * agent has six of them open. The icons are the same mark the site
   * and the mobile app use.
   */
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  // Installable to a home screen, which is how a phone-first product
   // should behave before there is an app in a store.
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Without this, env(safe-area-inset-*) resolves to zero and the
  // composer sits under the home indicator on a notched phone.
  viewportFit: "cover",
  // Must equal `--ground` in tokens.css. This said #F4F1EA — the ground
  // from a palette ago — so on a phone the browser chrome was a very
  // slightly different cream from the page it framed, which reads as a
  // seam nobody can name.
  themeColor: "#F4F3F0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
