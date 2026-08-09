import { groq } from "next-sanity";

/**
 * Every query is projected — we ask for the fields we use and nothing
 * else. A `*` query is fine on day one and becomes the reason a page is
 * slow on day two hundred.
 */

const SEO = groq`seo{ title, description, noIndex, "image": image.asset->url }`;
const CTA = groq`{ label, href, variant }`;

export const siteSettingsQuery = groq`
  *[_type == "siteSettings"][0]{
    siteName, footerBlurb, whatsappNumber, salesEmail, officeAddress,
    "logo": logo.asset->url,
    primaryNav[]${CTA},
    footerColumns[]{ heading, links[]${CTA} }
  }`;

export const homePageQuery = groq`
  *[_type == "homePage"][0]{
    eyebrow, heading, subheading, heroFinePrint, heroThreadOutcome,
    heroButtons[]${CTA},
    heroThread[]{ from, text, time },
    problemHeading, problemBody,
    problemStats[]{ value, label, source },
    steps[]{ title, body },
    features[]{ title, body },
    closingHeading, closingBody,
    ${SEO},

    // Only approved testimonials and logos ever reach the page. The filter
    // lives here rather than in the component so no future page can
    // accidentally render an unapproved one.
    "testimonials": featuredTestimonials[]->{
      quote, result, name, role, company,
      "photo": photo.asset->url, "photoAlt": photo.alt
    }[approved == true],

    "faqs": featuredFaqs[]->{ question, answer },

    "logos": *[_type == "customerLogo" && approved == true] | order(order asc){
      name, "logo": logo.asset->url
    }
  }`;

export const plansQuery = groq`
  *[_type == "plan"] | order(order asc){
    name, summary, price, currency, period, features, featured, cta${CTA}
  }`;

export const faqsQuery = groq`
  *[_type == "faq"] | order(order asc){ question, answer, category }`;

export const integrationsQuery = groq`
  *[_type == "integration"] | order(name asc){
    name, description, category, status, "logo": logo.asset->url
  }`;

export const securityPageQuery = groq`
  *[_type == "securityPage"][0]{
    heading, intro, lastReviewed,
    assurances[]{ title, body, evidenceUrl },
    subProcessors[]{ provider, purpose, region },
    ${SEO}
  }`;

export const postsQuery = groq`
  *[_type == "post" && defined(slug.current)] | order(publishedAt desc){
    title, "slug": slug.current, category, excerpt, publishedAt,
    "cover": coverImage.asset->url, "coverAlt": coverImage.alt,
    author->{ name, role }
  }`;

export const postQuery = groq`
  *[_type == "post" && slug.current == $slug][0]{
    title, "slug": slug.current, category, excerpt, publishedAt, body,
    "cover": coverImage.asset->url, "coverAlt": coverImage.alt,
    author->{ name, role, "photo": photo.asset->url },
    ${SEO}
  }`;

/** Slugs only, for generateStaticParams. */
export const postSlugsQuery = groq`*[_type == "post" && defined(slug.current)].slug.current`;
