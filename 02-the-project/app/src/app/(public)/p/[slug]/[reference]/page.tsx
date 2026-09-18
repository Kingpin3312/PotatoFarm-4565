import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicListing, enquiryText } from "@/server/lib/listings/public";
import { aedWhole } from "@/lib/money";

type Params = { params: Promise<{ slug: string; reference: string }> };

/**
 * The property page a stranger opens from a WhatsApp message.
 *
 * ## The metadata is the feature
 *
 * Most of the value of this page is consumed before anybody opens it.
 * An agent pastes the link into a chat and WhatsApp renders a preview
 * card from these tags — so the title, the description and the image
 * below are not SEO housekeeping, they are the thing the buyer actually
 * sees. A page with perfect markup and no `og:image` is a grey box in
 * the conversation.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, reference } = await params;
  const l = await publicListing(slug, decodeURIComponent(reference));

  // A withheld property must not leak its details through the preview
  // card either — the same one answer the page gives.
  if (!l) return { title: "Property not available", robots: { index: false } };

  const price = l.priceFils === null ? null : aedWhole(l.priceFils);
  const bits = [
    l.bedrooms ? `${l.bedrooms} bed` : null,
    l.bathrooms ? `${l.bathrooms} bath` : null,
    l.areaSqft ? `${l.areaSqft.toLocaleString("en-GB")} sqft` : null,
    l.community,
  ].filter(Boolean).join(" · ");

  const title = price ? `${l.title} — ${price}` : l.title;
  const description = bits || l.description?.slice(0, 160) || l.brokerage;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: l.brokerage,
      images: l.photos[0] ? [{ url: l.photos[0] }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
    /**
     * Indexed on purpose. This is an advertisement — the brokerage
     * wants it found, and a Trakheesi permit is what makes publishing
     * it lawful, which `publicListing` has already required.
     */
    robots: { index: true, follow: true },
  };
}

export default async function PropertyPage({ params }: Params) {
  const { slug, reference } = await params;
  const l = await publicListing(slug, decodeURIComponent(reference));
  if (!l) notFound();

  const price = l.priceFils === null ? null : aedWhole(l.priceFils);
  const wa = l.whatsapp
    ? `https://wa.me/${l.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(enquiryText(l))}`
    : null;

  const facts = [
    l.bedrooms !== null ? ["Bedrooms", String(l.bedrooms)] : null,
    l.bathrooms !== null ? ["Bathrooms", String(l.bathrooms)] : null,
    l.areaSqft !== null ? ["Size", `${l.areaSqft.toLocaleString("en-GB")} sqft`] : null,
    l.community ? ["Community", l.community] : null,
    l.building ? ["Building", l.building] : null,
    ["Reference", l.reference],
  ].filter(Boolean) as [string, string][];

  return (
    <main id="main" className="mx-auto max-w-[760px] px-5 py-10">
      <p className="t-label text-ink-3 mb-2">
        {l.purpose === "RENT" ? "For rent" : "For sale"} · {l.brokerage}
      </p>

      <h1 className="font-sans font-semibold text-h1 text-ink text-balance">{l.title}</h1>

      {price && (
        <p className="mt-2 font-sans font-semibold text-title text-ink tabular">
          {price}
          {l.purpose === "RENT" && <span className="text-ink-3 text-ui font-normal"> per year</span>}
        </p>
      )}

      {/* Photos are references rather than uploads until object storage
          is wired, so this renders the count honestly instead of a row
          of broken images. */}
      {l.photos.length > 0 && (
        <p className="mt-4 text-sm text-ink-3">
          {l.photos.length} photo{l.photos.length === 1 ? "" : "s"} — ask and we&rsquo;ll send them.
        </p>
      )}

      {l.description && (
        <p className="mt-6 text-ui text-ink-2 leading-relaxed max-w-[62ch] whitespace-pre-line">
          {l.description}
        </p>
      )}

      <dl className="mt-8 border-t border-rule">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5 border-b border-rule">
            <dt className="text-sm text-ink-3">{k}</dt>
            <dd className="text-sm text-ink tabular">{v}</dd>
          </div>
        ))}
      </dl>

      {wa && (
        <a
          href={wa}
          className="mt-8 inline-flex items-center justify-center min-h-12 px-6 rounded-full
                     bg-accent text-on-accent border border-[color:var(--accent-edge)]
                     font-medium text-ui no-underline"
        >
          Ask about this property
        </a>
      )}

      {/**
       * The permit, shown rather than merely held.
       *
       * Dubai requires the Trakheesi number to appear on the
       * advertisement itself, not just in the brokerage's file — so a
       * page that validates the permit and then hides it has met the
       * database's rule and not the law's. The RERA card sits beside it
       * because a buyer is entitled to know which registered agent is
       * advertising to them.
       */}
      <footer className="mt-12 pt-5 border-t border-rule text-label text-ink-3 font-mono">
        <p>Permit {l.permitNumber}</p>
        {l.reraBrokerCard && <p className="mt-1">RERA {l.reraBrokerCard}</p>}
        <p className="mt-3">{l.brokerage}</p>
      </footer>
    </main>
  );
}
