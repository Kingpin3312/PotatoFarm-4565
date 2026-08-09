import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /api is disallowed for tidiness rather than security — anything
        // that actually needs protecting is protected in the handler.
        disallow: ["/api/", "/studio/", "/preview/"],
      },
      // AI crawlers get their own entry so the decision is explicit and
      // visible, rather than falling out of a wildcard by accident.
      // Allowed on purpose: being quoted by an assistant is now a real
      // channel for a product like this, and blocking it is a choice with
      // a cost. Flip to disallow if you'd rather not be.
      { userAgent: ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended"], allow: "/" },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
