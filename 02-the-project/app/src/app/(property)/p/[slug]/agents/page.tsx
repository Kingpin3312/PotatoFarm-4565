import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { micrositeTeam } from "@/server/lib/microsite/public";
import { MONOGRAM_INK } from "@/lib/microsite/palette";
import { Logo } from "@/components/brand/logo";

type Props = { params: Promise<{ slug: string }> };

/**
 * A brokerage's agents: everyone with a live microsite, each a way in to
 * their own page. A brokerage with none is a 404, the same answer as one
 * that does not exist — an empty team page is worse than no page.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await micrositeTeam(slug);
  if (!t || !t.agents.length) return { title: "Not available", robots: { index: false } };
  return {
    title: { absolute: `Our agents | ${t.brokerage}` },
    description: `${t.agents.length} agent${t.agents.length === 1 ? "" : "s"} at ${t.brokerage}.`,
    openGraph: { title: `Our agents | ${t.brokerage}`, type: "website", siteName: t.brokerage },
    robots: { index: true, follow: true },
  };
}

const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1]![0] : "")).toUpperCase();
};

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const t = await micrositeTeam(slug);
  if (!t || !t.agents.length) notFound();
  const home = `/p/${encodeURIComponent(slug)}`;
  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto max-w-[1080px] px-6 py-6 flex items-center justify-between gap-4">
          <a href={home} className="text-note font-medium text-ink uppercase tracking-[0.24em] no-underline hover:underline min-w-0 truncate">{t.brokerage}</a>
          <a href={home} className="shrink-0 text-note text-ink-3 uppercase tracking-[0.18em] no-underline hover:text-ink">Properties</a>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1080px] px-6 pt-14 pb-20">
        <h1 className="font-sans font-light text-h1 leading-[1.08] text-ink text-balance">Our agents</h1>
        <ul className="mt-10 grid gap-x-6 gap-y-12 grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-agents>
          {t.agents.map((a) => (
            <li key={a.slug} data-agent={a.slug}>
              <a href={a.href} className="block no-underline group">
                {a.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photo} alt={a.name} loading="lazy" className="w-full aspect-[4/5] object-cover rounded-md bg-sunk" />
                ) : (
                  <div className="w-full aspect-[4/5] rounded-md grid place-items-center" style={{ background: a.accent }} aria-hidden="true">
                    <span className="font-light text-[clamp(2.5rem,7vw,4.5rem)] leading-none" style={{ color: MONOGRAM_INK }}>{initials(a.name)}</span>
                  </div>
                )}
                <p className="mt-4 text-body-lg text-ink group-hover:underline">{a.name}</p>
                <p className="mt-1 text-sm text-ink-2">{a.title}</p>
                {a.areas.length > 0 && <p className="mt-1 text-sm text-ink-3">{a.areas.join(" · ")}</p>}
              </a>
            </li>
          ))}
        </ul>
        <footer className="mt-16 pt-6 border-t border-rule text-label text-ink-3"><p>{t.brokerage}</p></footer>
        <a href="https://potatofarm.io" rel="noopener"
           className="mt-8 inline-flex items-center gap-3 no-underline text-note text-ink-3 hover:text-ink-2 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded-sm">
          Powered by <Logo size={20} word={15} />
        </a>
      </main>
    </>
  );
}
