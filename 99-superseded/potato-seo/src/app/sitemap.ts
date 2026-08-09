import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo/metadata";
import { sanityFetch } from "@/sanity/lib/fetch";
import { groq } from "next-sanity";

/**
 * Generated, not maintained. A hand-written sitemap is out of date the
 * first time somebody publishes a post, and nobody ever notices.
 *
 * changeFrequency and priority are advisory at best — Google has said for
 * years it largely ignores them. They're here because they cost nothing,
 * not because they do much.
 */
const postsForSitemap = groq`
  *[_type == "post" && defined(slug.current)]{
    "slug": slug.current,
    "updated": coalesce(_updatedAt, publishedAt)
  }`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/product`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/pricing`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE.url}/integrations`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/security`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/customers`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE.url}/about`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE.url}/blog`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE.url}/demo`, changeFrequency: "yearly", priority: 0.8 },
    { url: `${SITE.url}/legal/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/legal/terms`, changeFrequency: "yearly", priority: 0.2 },
  ].map((p) => ({ ...p, lastModified: new Date() }));

  const posts = await sanityFetch<{ slug: string; updated: string }[]>({
    query: postsForSitemap,
    tags: ["post"],
  });

  return [
    ...staticPages,
    ...posts.map((p) => ({
      url: `${SITE.url}/blog/${p.slug}`,
      lastModified: new Date(p.updated),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
