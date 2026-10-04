import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicBrokerage } from "@/server/lib/listings/public";
import { aedWhole } from "@/lib/money";
import { Logo } from "@/components/brand/logo";
import { EnquiryForm } from "../enquiry-form";
import { isKnownProblem } from "@/server/lib/listings/enquiry-form";
import { hasTeamPage } from "@/server/lib/microsite/public";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ for?: string; sent?: string; problem?: string }>;
};

/**
 * A brokerage's own page: everything it advertises, under its name, and
 * a way to ask.
 *
 * Kendal builds brokerages a website; most of what a buyer wants from one
 * is this list and that form, and both come from rows the brokerage
 * already keeps — so it is always current, and it needs nobody's
 * permission. Every card has passed the property page's own gate
 * (`publicBrokerage`), and a brokerage with nothing it may advertise is a
 * 404, the same as one that does not exist.
 *
 * The same frame as the property page: the brokerage's masthead, the
 * agreed palette with the pink kept for the one thing to do, and
 * PotatoFarm.io signing the foot as "Powered by".
 */
const purposeOf = (f?: string) => (f === "sale" ? "SALE" : f === "rent" ? "RENT" : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const b = await publicBrokerage(slug);
  if (!b) return { title: "Not available", robots: { index: false } };
  const description = `${b.counts.all} propert${b.counts.all === 1 ? "y" : "ies"} from ${b.brokerage}.`;
  return {
    title: { absolute: `Properties | ${b.brokerage}` },
    description,
    openGraph: { title: `Properties from ${b.brokerage}`, description, type: "website", siteName: b.brokerage },
    robots: { index: true, follow: true },
  };
}

const wa = (number: string, text: string) =>
  `https://wa.me/${number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;

export default async function BrokeragePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const purpose = purposeOf(sp.for);
  const b = await publicBrokerage(slug, purpose);
  if (!b) notFound();
  const home = `/p/${encodeURIComponent(slug)}`;
  const team = await hasTeamPage(slug);

  const tabs: [string, string, number][] = [
    ["All", home, b.counts.all],
    ...(b.counts.sale ? [["For sale", `${home}?for=sale`, b.counts.sale] as [string, string, number]] : []),
    ...(b.counts.rent ? [["To let", `${home}?for=rent`, b.counts.rent] as [string, string, number]] : []),
  ];
  const current = purpose === "SALE" ? "For sale" : purpose === "RENT" ? "To let" : "All";

  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto max-w-[1080px] px-6 py-6 flex items-center justify-between gap-4">
          <a href={home} className="text-note font-medium text-ink uppercase tracking-[0.24em] no-underline">{b.brokerage}</a>
          <div className="flex items-center gap-6">
            {team && <a href={`${home}/agents`} className="text-note text-ink-3 uppercase tracking-[0.18em] no-underline hover:text-ink">Our agents</a>}
            {b.whatsapp && (
              <a href={wa(b.whatsapp, `Hello ${b.brokerage}, I'm looking for a property.`)}
                 className="text-note text-ink-3 uppercase tracking-[0.18em] no-underline hover:text-ink">WhatsApp us</a>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1080px] px-6 pt-14 pb-20">
        <h1 className="font-sans font-light text-h1 leading-[1.08] text-ink text-balance">Properties</h1>
        {tabs.length > 1 && (
          <nav aria-label="Show" className="mt-8 flex flex-wrap gap-2">
            {tabs.map(([label, href, n]) => (
              <a key={label} href={href} aria-current={label === current ? "page" : undefined}
                 className={`min-h-11 inline-flex items-center px-4 rounded-full border text-ui no-underline ${label === current ? "bg-accent text-on-accent border-[color:var(--accent-edge)]" : "border-rule-strong text-ink hover:border-ink"}`}>
                {label} <span className="ms-2 tabular opacity-80">{n}</span>
              </a>
            ))}
          </nav>
        )}

        <ul className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" data-cards>
          {b.cards.map((c) => {
            const price = c.priceFils === null ? null : aedWhole(c.priceFils);
            const facts = [
              c.bedrooms !== null ? (c.bedrooms === 0 ? "Studio" : `${c.bedrooms} bed`) : null,
              c.bathrooms !== null ? `${c.bathrooms} bath` : null,
              c.areaSqft !== null ? `${c.areaSqft.toLocaleString("en-GB")} sq ft` : null,
            ].filter(Boolean).join(" · ");
            return (
              <li key={c.reference} data-card={c.reference}>
                <a href={c.href} className="block no-underline group">
                  {c.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.cover} alt={c.title} loading="lazy" className="w-full aspect-[3/2] object-cover rounded-md bg-sunk" />
                  ) : (
                    <div className="w-full aspect-[3/2] rounded-md bg-sunk" aria-hidden="true" />
                  )}
                  {c.community && <p className="mt-4 text-note text-ink-3 uppercase tracking-[0.18em]">{c.community}</p>}
                  <p className="mt-2 text-body-lg text-ink group-hover:underline">{c.title}</p>
                  {facts && <p className="mt-1 text-sm text-ink-2 tabular">{facts}</p>}
                  {price && (
                    <p className="mt-2 text-ui text-ink tabular">
                      {price}{c.purpose === "RENT" && <span className="text-ink-3"> a year</span>}
                    </p>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
        {b.cards.length === 0 && <p className="mt-10 text-sub text-ink-2">Nothing {purpose === "RENT" ? "to let" : "for sale"} right now.</p>}

        <EnquiryForm slug={slug} back={home} sent={sp.sent === "1"} problem={sp.problem && isKnownProblem(sp.problem) ? sp.problem : null}
                     heading="Can't see the right one? Tell us what you're looking for" />

        <footer className="mt-16 pt-6 border-t border-rule text-label text-ink-3">
          <p>{b.brokerage}</p>
        </footer>
        <a href="https://potatofarm.io" rel="noopener"
           className="mt-8 inline-flex items-center gap-3 no-underline text-note text-ink-3 hover:text-ink-2 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded-sm">
          Powered by <Logo size={20} word={15} />
        </a>
      </main>
    </>
  );
}
