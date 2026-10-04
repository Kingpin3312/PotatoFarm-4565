import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicMicrosite } from "@/server/lib/microsite/public";
import { isKnownProblem } from "@/server/lib/listings/enquiry-form";
import { MicrositeView } from "@/components/microsite/microsite-view";
import { MicrositeTracker } from "@/components/microsite/tracker";
import { Reveal } from "@/components/microsite/reveal";

type Props = {
  params: Promise<{ slug: string; agent: string }>;
  searchParams: Promise<{ show?: string; area?: string; sent?: string; problem?: string }>;
};

/**
 * An agent's own website: `/p/<brokerage>/agents/<agent>`.
 *
 * Drawn by `MicrositeView` from `publicMicrosite`, which returns nothing
 * — a 404 — for every kind of miss: no such brokerage or agent, a draft,
 * a site awaiting approval or taken down, an agent who has left. See
 * `server/lib/microsite/public.ts` for what is shown and why.
 *
 * The metadata is what WhatsApp, LinkedIn and Facebook draw the preview
 * card from: the agent's search title and description (or "<name> |
 * <brokerage>" and their headline), and the card image beside this file.
 * Nothing private goes into either.
 *
 * `cache` makes the metadata and the page share one build of the site per
 * request rather than querying for it twice.
 */
const SHOWS = ["all", "sale", "rent", "offplan"] as const;
type Show = (typeof SHOWS)[number];

const site = cache((slug: string, agent: string) => publicMicrosite(slug, agent));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, agent } = await params;
  const v = await site(slug, agent);
  if (!v) return { title: "Not available", robots: { index: false } };
  const { title, description } = v.seo;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "profile", siteName: v.brokerage.name },
    twitter: { card: "summary_large_image", title, description },
    appleWebApp: { title: v.agent.name },
    robots: { index: true, follow: true },
  };
}

export default async function AgentMicrositePage({ params, searchParams }: Props) {
  const { slug, agent } = await params;
  const sp = await searchParams;
  const view = await site(slug, agent);
  if (!view) notFound();
  const show: Show = (SHOWS as readonly string[]).includes(sp.show ?? "") ? (sp.show as Show) : "all";
  const area = sp.area && view.agent.areas.includes(sp.area) ? sp.area : null;
  const here = `/p/${encodeURIComponent(slug)}/agents/${encodeURIComponent(agent)}`;
  return (
    <>
      <MicrositeView
        view={view}
        show={show}
        area={area}
        tabHref={(s) => (s === "all" ? `${here}#properties` : `${here}?show=${s}#properties`)}
        areaHref={(a) => `${here}?area=${encodeURIComponent(a)}#properties`}
        sent={sp.sent === "1"}
        problem={sp.problem && isKnownProblem(sp.problem) ? sp.problem : null}
      />
      <Reveal />
      {view.endpoints && <MicrositeTracker endpoint={view.endpoints.event} onLoad={{ k: "view" }} />}
    </>
  );
}
