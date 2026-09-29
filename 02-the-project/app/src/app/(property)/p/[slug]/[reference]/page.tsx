import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicListing, enquiryText, viewingText } from "@/server/lib/listings/public";
import { aedWhole } from "@/lib/money";
import { Logo } from "@/components/brand/logo";

type Params = { params: Promise<{ slug: string; reference: string }> };

/**
 * The property page a stranger opens from a WhatsApp message.
 *
 * ## The brokerage's page, not ours
 *
 * Its client, its agent, its property. So the brokerage's name is the
 * masthead, and PotatoFarm.io signs the foot of the page — "Powered by",
 * with the lockup, the owner's decision. The colours are the
 * product's agreed scheme — pink #FF1493 on grey #292C32, the owner's
 * decision — with the pink kept for the one thing a buyer should do.
 *
 * ## The metadata is the feature
 *
 * Most of the value of this page is consumed before anybody opens it.
 * An agent pastes the link into a chat and WhatsApp renders a preview
 * card from these tags. The card's image is drawn by `opengraph-image`
 * beside this file — the cover photograph when the listing has one, under
 * the listing's name, facts and price on the brokerage's masthead; the
 * same card without a photograph when it has none, because a link
 * without an image previews as a grey box.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, reference } = await params;
  const l = await publicListing(slug, decodeURIComponent(reference));

  // A withheld property must not leak its details through the preview
  // card either — the same one answer the page gives.
  if (!l) return { title: "Property not available", robots: { index: false } };

  const price = l.priceFils === null ? null : aedWhole(l.priceFils);
  const title = price ? `${l.title} — ${price}` : l.title;
  const description = facts(l).join(" · ") || l.description?.slice(0, 160) || l.brokerage;

  return {
    title: { absolute: `${title} | ${l.brokerage}` },
    description,
    openGraph: { title, description, type: "website", siteName: l.brokerage },
    twitter: { card: "summary_large_image", title, description },
    // Saved to a buyer's home screen, it carries the brokerage's name.
    appleWebApp: { title: l.brokerage },
    /**
     * Indexed on purpose. This is an advertisement — the brokerage
     * wants it found, and a Trakheesi permit is what makes publishing
     * it lawful, which `publicListing` has already required.
     */
    robots: { index: true, follow: true },
  };
}

/** The four facts a buyer reads first, in the order they read them. */
function facts(l: NonNullable<Awaited<ReturnType<typeof publicListing>>>) {
  return [
    l.bedrooms !== null ? (l.bedrooms === 0 ? "Studio" : `${l.bedrooms} bedroom${l.bedrooms === 1 ? "" : "s"}`) : null,
    l.bathrooms !== null ? `${l.bathrooms} bathroom${l.bathrooms === 1 ? "" : "s"}` : null,
    l.areaSqft !== null ? `${l.areaSqft.toLocaleString("en-GB")} sq ft` : null,
    l.community,
  ].filter(Boolean) as string[];
}

const wa = (number: string, text: string) =>
  `https://wa.me/${number.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;

export default async function PropertyPage({ params }: Params) {
  const { slug, reference } = await params;
  const l = await publicListing(slug, decodeURIComponent(reference));
  if (!l) notFound();

  const price = l.priceFils === null ? null : aedWhole(l.priceFils);
  const details = [
    l.community ? ["Community", l.community] : null,
    l.building ? ["Building", l.building] : null,
    l.areaSqft !== null ? ["Built-up area", `${l.areaSqft.toLocaleString("en-GB")} sq ft`] : null,
    ["Reference", l.reference],
  ].filter(Boolean) as [string, string][];

  return (
    <>
      {/* The brokerage's masthead. Its name, set the way an agency sets
          its name on a brochure: small, spaced, and first. */}
      <header className="border-b border-rule">
        <div className="mx-auto max-w-[880px] px-6 py-6 flex items-center justify-between gap-4">
          <p className="text-note font-medium text-ink uppercase tracking-[0.24em]">{l.brokerage}</p>
          <p className="text-note text-ink-3 uppercase tracking-[0.18em]">
            {l.purpose === "RENT" ? "To let" : "For sale"}
          </p>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[880px] px-6 pt-14 pb-20">
        {l.community && (
          <p className="text-note text-ink-3 uppercase tracking-[0.18em]">{l.community}</p>
        )}
        <h1 className="mt-4 font-sans font-light text-h1 leading-[1.08] text-ink text-balance max-w-[20ch]">
          {l.title}
        </h1>

        {price && (
          <p className="mt-6 font-sans text-title text-ink tabular">
            {price}
            {l.purpose === "RENT" && <span className="text-ink-3 text-ui"> a year</span>}
          </p>
        )}

        {facts(l).length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-y border-rule py-4" aria-label="At a glance">
            {facts(l).slice(0, 3).map((f) => (
              <li key={f} className="text-ui text-ink-2 tabular">{f}</li>
            ))}
          </ul>
        )}

        {/* The photographs: the cover wide, the rest two abreast.
            Plain images from this page's own photo route, which checks
            the property is still public before it hands out a signed
            address — so a gallery never outlives its page. Lazy past the
            cover, because a buyer on a phone in a lift pays for every
            one they never scroll to. */}
        {l.photos.length > 0 && (
          <section className="mt-10" aria-label="Photographs" data-photos>
            {/* Plain images, not next/image: each address redirects to a
                URL signed for minutes, which the optimiser would cache
                past its expiry. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.photos[0]} alt={`${l.title}, main photograph`}
                 className="w-full aspect-[3/2] object-cover rounded-md bg-sunk" />
            {l.photos.length > 1 && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {l.photos.slice(1).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt={`${l.title}, photograph ${i + 2}`} loading="lazy"
                       className="w-full aspect-[3/2] object-cover rounded-md bg-sunk" />
                ))}
              </div>
            )}
          </section>
        )}

        {/* The two things a buyer can do, the first being the one that
            moves them forward. Both open the brokerage's own WhatsApp
            with the reference already in the message, so the assistant
            and the agent know which property at once. */}
        {l.whatsapp && (
          <div className="mt-10 flex flex-wrap gap-3">
            <a href={wa(l.whatsapp, viewingText(l))}
               className="inline-flex items-center justify-center min-h-12 px-7 rounded-full bg-accent text-on-accent border border-[color:var(--accent-edge)] font-medium text-ui no-underline hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
              Arrange a private viewing
            </a>
            <a href={wa(l.whatsapp, enquiryText(l))}
               className="inline-flex items-center justify-center min-h-12 px-7 rounded-full border border-rule-strong text-ink font-medium text-ui no-underline hover:border-ink focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
              Ask a question
            </a>
          </div>
        )}

        {l.description && (
          <section className="mt-16" aria-labelledby="about">
            <h2 id="about" className="text-note text-ink-3 uppercase tracking-[0.18em]">The property</h2>
            <p className="mt-4 text-body-lg text-ink-2 leading-relaxed max-w-[60ch] whitespace-pre-line">
              {l.description}
            </p>
            {/* Placeholders from before photos could be uploaded are
                offered rather than shown — never as broken images. */}
            {l.photosOnRequest && (
              <p className="mt-5 text-sm text-ink-3">Photography and floor plans are sent on request.</p>
            )}
          </section>
        )}

        <section className="mt-14" aria-labelledby="details">
          <h2 id="details" className="text-note text-ink-3 uppercase tracking-[0.18em]">Details</h2>
          <dl className="mt-4 border-t border-rule">
            {details.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 py-3.5 border-b border-rule">
                <dt className="text-sm text-ink-3">{k}</dt>
                <dd className="text-sm text-ink tabular text-end">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {(l.agent || l.reraBrokerCard) && (
          <section className="mt-14" aria-labelledby="agent">
            <h2 id="agent" className="text-note text-ink-3 uppercase tracking-[0.18em]">Your agent</h2>
            <p className="mt-4 text-body-lg text-ink">{l.agent ?? l.brokerage}</p>
            <p className="mt-1 text-sm text-ink-3">
              {l.brokerage}{l.reraBrokerCard ? ` · RERA card ${l.reraBrokerCard}` : ""}
            </p>
          </section>
        )}

        {/**
         * The permit, shown rather than merely held.
         *
         * Dubai requires the Trakheesi number to appear on the
         * advertisement itself, not just in the brokerage's file — so a
         * page that validates the permit and then hides it has met the
         * database's rule and not the law's.
         */}
        <footer className="mt-16 pt-6 border-t border-rule flex flex-wrap justify-between gap-4 text-label text-ink-3">
          <p>Trakheesi permit {l.permitNumber}</p>
          <p>{l.brokerage}</p>
        </footer>
        <a href="https://potatofarm.io" rel="noopener"
           className="mt-8 inline-flex items-center gap-3 no-underline text-note text-ink-3 hover:text-ink-2 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded-sm">
          Powered by <Logo size={20} word={15} />
        </a>
      </main>
    </>
  );
}
