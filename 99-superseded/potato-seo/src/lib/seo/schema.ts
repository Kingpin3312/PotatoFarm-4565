import { SITE } from "./metadata";

/**
 * JSON-LD builders.
 *
 * A note on FAQPage, because the brief asked for it: Google retired FAQ
 * rich results on 7 May 2026, and the Search Console reporting goes in
 * August. The markup is still valid and still worth shipping — Bing,
 * Perplexity and the various AI crawlers parse it, and that is now where
 * its value is. What changed is the writing: answers built for Google's
 * accordion were 30 words. Answers built to be quoted by a model do
 * better at 80 to 150. Our FAQ copy is written to the second standard.
 */

const ORG_ID = `${SITE.url}/#organization`;
const SITE_ID = `${SITE.url}/#website`;

export function organisationSchema(opts: {
  logo: string;
  sameAs?: string[];
  email?: string;
  address?: { street: string; city: string; country: string };
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.legalName,
    url: SITE.url,
    logo: opts.logo,
    email: opts.email,
    sameAs: opts.sameAs,
    ...(opts.address && {
      address: {
        "@type": "PostalAddress",
        streetAddress: opts.address.street,
        addressLocality: opts.address.city,
        addressCountry: opts.address.country,
      },
    }),
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE.url,
    name: SITE.name,
    publisher: { "@id": ORG_ID },
    inLanguage: "en-GB",
  };
}

/**
 * SoftwareApplication rather than Product. Offers only get included when
 * there is a real price — an offer with a blank price is worse than no
 * offer at all, because it marks the page as incomplete rather than
 * silent.
 */
export function productSchema(plans: { name: string; price?: string; currency?: string }[]) {
  const priced = plans.filter((p) => p.price && /\d/.test(p.price));

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "CRM",
    operatingSystem: "Web, iOS, Android",
    publisher: { "@id": ORG_ID },
    ...(priced.length && {
      offers: priced.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: p.price,
        priceCurrency: p.currency ?? "AED",
        availability: "https://schema.org/InStock",
      })),
    }),
  };
}

export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

/** Must mirror the visible breadcrumb exactly. Inventing a trail the user
 *  can't see is the sort of thing that earns a manual action. */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: new URL(t.path, SITE.url).toString(),
    })),
  };
}

export function articleSchema(a: {
  title: string;
  description: string;
  slug: string;
  image?: string;
  publishedAt: string;
  updatedAt?: string;
  authorName?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title.slice(0, 110), // Google truncates beyond this
    description: a.description,
    image: a.image,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt ?? a.publishedAt,
    author: a.authorName ? { "@type": "Person", name: a.authorName } : { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: `${SITE.url}/blog/${a.slug}`,
    inLanguage: "en-GB",
  };
}
