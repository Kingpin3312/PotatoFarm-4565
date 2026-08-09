import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "@/styles/globals.css";

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
  themeColor: "#F4F1EA",
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
