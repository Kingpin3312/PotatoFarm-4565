import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "PotatoFarm.io",
  description: "The WhatsApp assistant that answers your enquiries before your competitors do.",
  robots: { index: false, follow: false }, // the app is not for search engines
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
