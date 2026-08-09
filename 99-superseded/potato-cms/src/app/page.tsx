import type { Metadata } from "next";
import { sanityFetch } from "@/sanity/lib/fetch";
import { homePageQuery } from "@/sanity/lib/queries";

/**
 * Example page. Every other page follows exactly this shape:
 * fetch once, tag it, generate metadata from the same document.
 */
type Home = {
  eyebrow: string;
  heading: string;
  subheading: string;
  heroButtons: { label: string; href: string; variant: string }[];
  heroThread: { from: "lead" | "bot"; text: string; time: string }[];
  testimonials: { quote: string; result: string; name: string; company: string }[];
  seo: { title: string; description: string; image?: string; noIndex?: boolean };
};

async function getHome() {
  return sanityFetch<Home>({ query: homePageQuery, tags: ["homePage"] });
}

export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getHome();
  return {
    title: seo.title,
    description: seo.description,
    robots: seo.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: seo.title,
      description: seo.description,
      images: seo.image ? [{ url: seo.image, width: 1200, height: 630 }] : undefined,
    },
  };
}

export default async function HomePage() {
  const home = await getHome();

  return (
    <main id="main">
      <section id="hero">
        <span className="eye">{home.eyebrow}</span>
        <h1 data-reveal-words>{home.heading}</h1>
        <p className="lede">{home.subheading}</p>
        {/* …sections render from `home`. Nothing on this page is a string
            literal, which is the entire point of the exercise. */}
      </section>
    </main>
  );
}
