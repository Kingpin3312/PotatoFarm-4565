import type { Metadata } from "next";

export const SITE = {
  name: "Potato",
  url: "https://potato.ai",
  legalName: "Potato.ai",
  locale: "en_AE",
  twitter: "@potatoai",
} as const;

type Args = {
  title: string;
  description: string;
  path: string;
  image?: string;
  noIndex?: boolean;
  type?: "website" | "article";
  publishedAt?: string;
  authorName?: string;
};

/**
 * One builder for every page. Canonical, Open Graph and Twitter tags are
 * derived from the same three fields, so they can't drift apart — which
 * is the usual failure: someone updates the title and forgets the OG tag,
 * and the page shares under last quarter's headline.
 */
export function buildMetadata({
  title,
  description,
  path,
  image,
  noIndex,
  type = "website",
  publishedAt,
  authorName,
}: Args): Metadata {
  const url = new URL(path, SITE.url).toString();
  const og = image ?? `${SITE.url}/opengraph-image.png`;

  return {
    metadataBase: new URL(SITE.url),
    title,
    description,
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: SITE.name,
      locale: SITE.locale,
      images: [{ url: og, width: 1200, height: 630, alt: title }],
      ...(type === "article" && publishedAt
        ? { publishedTime: publishedAt, authors: authorName ? [authorName] : undefined }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: SITE.twitter,
      title,
      description,
      images: [og],
    },
  };
}
