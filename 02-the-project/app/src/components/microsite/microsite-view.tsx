import type { ReactNode } from "react";
import { aedWhole } from "@/lib/money";
import { spacedPhone, whatsappText, type Inline } from "@/lib/microsite/content";
import { MONOGRAM_INK } from "@/lib/microsite/palette";
import { PROPERTY_TYPE, type MicrositeCard, type MicrositeViewModel } from "@/lib/microsite/view";
import { Logo } from "@/components/brand/logo";
import { EnquiryForm } from "@/app/(property)/p/enquiry-form";
import { MailMark, PhoneMark, SocialMark, WhatsAppMark } from "./icons";

/**
 * An agent's microsite.
 *
 * ## One drawing, two places
 *
 * The public page and the editor's live preview draw this same component
 * from the same `MicrositeViewModel`, so what the agent sees while typing
 * is what a client sees. It lays itself out by **its container**, not the
 * window (`@container`, `cqi`): the preview pane is phone-width on a
 * laptop, and a page sized by the window would draw its desktop layout
 * squeezed into it.
 *
 * ## The look
 *
 * The property page's own language — the brokerage's name set small and
 * spaced at the top, light large type, hairline rules, uppercase labels,
 * the pink kept for the one thing to do — so an agent's site reads as the
 * brokerage's, with the agent's chosen accent on the agent's own marks
 * (the rule under their name, their monogram, the dots between their
 * areas) and nowhere else. The brokerage's name, "Powered by" and the
 * legal links are not content: no agent can remove them.
 *
 * Phones first. Most of these are opened from a WhatsApp chat, so on a
 * narrow screen WhatsApp and Call stay pinned to the foot of the page,
 * and every tap target is at least 44px.
 */

type Show = "all" | "sale" | "rent" | "offplan";

const wa = (n: string, text: string) => `https://wa.me/${n.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;
const tel = (n: string) => `tel:${n.replace(/[^0-9+]/g, "")}`;
const spaced = spacedPhone;

const label = "text-note text-ink-3 uppercase tracking-[0.18em]";
const pill = "inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-full font-medium text-ui no-underline focus-visible:outline-none focus-visible:shadow-[var(--ring)]";
const primary = `${pill} bg-accent text-on-accent border border-[color:var(--accent-edge)] hover:bg-accent-hover`;
const secondary = `${pill} border border-rule-strong text-ink hover:border-ink`;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "·";
}

function Rich({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => (p.bold ? <strong key={i} className="font-medium text-ink">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}

function facts(c: MicrositeCard) {
  return [
    c.propertyType ? PROPERTY_TYPE[c.propertyType] ?? null : null,
    c.bedrooms !== null ? (c.bedrooms === 0 ? "Studio" : `${c.bedrooms} bed`) : null,
    c.bathrooms !== null ? `${c.bathrooms} bath` : null,
    c.areaSqft !== null ? `${c.areaSqft.toLocaleString("en-GB")} sq ft` : null,
  ].filter(Boolean).join(" · ");
}

function Card({ c, view }: { c: MicrositeCard; view: MicrositeViewModel }) {
  const price = c.priceFils === null ? null : aedWhole(BigInt(c.priceFils));
  const status = c.offPlan ? "Off-plan" : c.purpose === "RENT" ? "To let" : "For sale";
  const ask = view.contact.whatsapp
    ? wa(view.contact.whatsapp, whatsappText({ firstName: view.agent.firstName, pageUrl: view.contact.pageUrl, property: c }))
    : null;
  return (
    <li data-card={c.reference} className="flex flex-col">
      <a href={c.href} className="block no-underline group" data-track="property" data-ref={c.reference}>
        <div className="relative">
          {c.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.cover} alt={c.title} loading="lazy" decoding="async" className="w-full aspect-[4/3] object-cover rounded-md bg-sunk" />
          ) : (
            <div className="w-full aspect-[4/3] rounded-md bg-sunk grid place-items-center text-label text-ink-3" aria-hidden="true">Photographs on request</div>
          )}
          <span className="absolute top-3 start-3 rounded-full bg-ground/85 px-3 py-1 text-label text-ink">{status}</span>
        </div>
        {c.community && <p className={`mt-4 ${label}`}>{c.community}</p>}
        <p className="mt-2 text-body-lg text-ink text-balance group-hover:underline">{c.title}</p>
        {facts(c) && <p className="mt-1 text-sm text-ink-2 tabular">{facts(c)}</p>}
        {price && (
          <p className="mt-2 text-ui text-ink tabular">{price}{c.purpose === "RENT" && <span className="text-ink-3"> a year</span>}</p>
        )}
        {c.excerpt && <p className="mt-2 text-sm text-ink-3 leading-relaxed">{c.excerpt}</p>}
      </a>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <a href={c.href} className="min-h-11 inline-flex items-center text-ui text-ink underline underline-offset-4 decoration-rule-strong hover:decoration-ink">View property</a>
        {ask && (
          <a href={ask} data-track="whatsapp" data-ref={c.reference}
             className="min-h-11 inline-flex items-center gap-1.5 text-ui text-ink-2 no-underline hover:text-ink">
            <WhatsAppMark className="size-4" /> Ask on WhatsApp
          </a>
        )}
      </div>
    </li>
  );
}

function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`scroll-mt-6 ${className ?? "mt-20"}`}>
      <h2 id={`${id}-h`} className={label}>{title}</h2>
      {children}
    </section>
  );
}

export function MicrositeView({ view, show = "all", tabHref, sent = false, problem = null, preview = false }: {
  view: MicrositeViewModel;
  show?: Show;
  /** Links for the property tabs; without it (the preview) the tabs are left out. */
  tabHref?: (s: Show) => string;
  sent?: boolean;
  problem?: string | null;
  preview?: boolean;
}) {
  const { agent: a, contact: c, brokerage: b } = view;
  const waHref = c.whatsapp ? wa(c.whatsapp, whatsappText({ firstName: a.firstName, pageUrl: c.pageUrl })) : null;
  const all = [...view.featured, ...view.latest];
  const counts = {
    all: all.length,
    sale: all.filter((x) => x.purpose === "SALE" && !x.offPlan).length,
    rent: all.filter((x) => x.purpose === "RENT").length,
    offplan: all.filter((x) => x.offPlan).length,
  };
  const keep = (x: MicrositeCard) => show === "all" ? true : show === "offplan" ? x.offPlan : show === "rent" ? x.purpose === "RENT" : x.purpose === "SALE" && !x.offPlan;
  const featured = view.featured.filter(keep);
  const latest = view.latest.filter(keep);
  const tabs = ([["all", "All"], ["sale", "For sale"], ["rent", "To let"], ["offplan", "Off-plan"]] as [Show, string][])
    .filter(([k]) => k === "all" || counts[k] > 0);

  const glance = [
    a.yearsExperience !== null ? ["Experience", `${a.yearsExperience} year${a.yearsExperience === 1 ? "" : "s"}`] : null,
    view.deals !== null ? ["Completed with " + b.name, `${view.deals} transaction${view.deals === 1 ? "" : "s"}`] : null,
    a.languages.length ? ["Languages", a.languages.join(", ")] : null,
    a.brn ? ["RERA broker card", a.brn] : null,
  ].filter(Boolean) as [string, string][];

  return (
    <div className="@container bg-ground text-ink min-h-full" data-microsite={a.slug}>
      <header className="border-b border-rule">
        <div className="mx-auto max-w-[1120px] px-5 @2xl:px-8 py-5 flex items-center justify-between gap-4">
          <a href={b.home} className="text-note font-medium text-ink uppercase tracking-[0.24em] no-underline hover:underline min-w-0 truncate">{b.name}</a>
          {waHref && (
            <a href={waHref} data-track="whatsapp" className="shrink-0 min-h-11 inline-flex items-center gap-2 text-note text-ink-3 uppercase tracking-[0.18em] no-underline hover:text-ink">
              <WhatsAppMark className="size-4" /> WhatsApp
            </a>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1120px] px-5 @2xl:px-8 pt-10 @3xl:pt-16 pb-16">
        {/* The hero: who they are, and the two ways forward. */}
        <section className="grid gap-10 @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:gap-14 items-start" aria-labelledby="who">
          <div className="order-2 @3xl:order-1 min-w-0">
            <p className={label}>{[a.title, b.name].filter(Boolean).join(" · ")}</p>
            <h1 id="who" className="mt-5 font-sans font-light text-ink text-balance leading-[1.02] tracking-[-0.02em] text-[clamp(2.5rem,10cqi,5.25rem)] break-words">
              {a.name || "Your name"}
            </h1>
            <span aria-hidden="true" className="mt-6 block h-[3px] w-16 rounded-full" style={{ background: a.accent }} />
            {a.headline && <p className="mt-6 text-[clamp(1.25rem,3.2cqi,1.6rem)] font-light leading-snug text-ink-2 max-w-[34ch] text-balance">{a.headline}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#contact" className={primary}>Contact me</a>
              {all.length > 0 && <a href="#properties" className={secondary}>View my properties</a>}
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-1" aria-label="Reach me directly">
              {waHref && (
                <li><a href={waHref} data-track="whatsapp" className="min-h-11 inline-flex items-center gap-2 text-ui text-ink-2 no-underline hover:text-ink"><WhatsAppMark /> WhatsApp</a></li>
              )}
              {c.phone && (
                <li><a href={tel(c.phone)} data-track="phone" className="min-h-11 inline-flex items-center gap-2 text-ui text-ink-2 no-underline hover:text-ink tabular"><PhoneMark /> {spaced(c.phone)}</a></li>
              )}
              {c.email && (
                <li className="min-w-0"><a href={`mailto:${c.email}`} data-track="email" className="min-h-11 inline-flex items-center gap-2 text-ui text-ink-2 no-underline hover:text-ink break-all"><MailMark /> {c.email}</a></li>
              )}
            </ul>
          </div>
          {/* Smaller on a phone, so the name and the two buttons are on
              the first screen of a page opened from a WhatsApp chat. */}
          <div className="order-1 @3xl:order-2 w-[58%] max-w-[260px] @xl:w-full @xl:max-w-[360px] @3xl:max-w-none">
            {a.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photo} alt={`${a.name}, ${a.title}`} className="w-full aspect-[4/5] object-cover rounded-md bg-sunk" />
            ) : (
              <div className="w-full aspect-[4/5] rounded-md grid place-items-center" style={{ background: a.accent }} role="img" aria-label={a.name}>
                <span className="font-sans font-light tracking-[-0.03em] text-[clamp(3rem,16cqi,9rem)] leading-none" style={{ color: MONOGRAM_INK }}>{initials(a.name)}</span>
              </div>
            )}
          </div>
        </section>

        {glance.length > 0 && (
          <dl className="mt-14 grid grid-cols-1 @md:grid-cols-2 @4xl:grid-cols-4 border-t border-rule">
            {glance.map(([k, v]) => (
              <div key={k} className="py-4 @md:pe-6 border-b border-rule min-w-0">
                <dt className="text-label text-ink-3">{k}</dt>
                <dd className="mt-1 text-body-lg text-ink tabular break-words">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {a.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.cover} alt="" loading="lazy" decoding="async" className="mt-14 w-full aspect-[16/9] @3xl:aspect-[21/9] object-cover rounded-md bg-sunk" />
        )}

        {(a.intro || a.bio.length > 0 || a.specialisms.length > 0 || a.credentials.length > 0) && (
          <Section id="about" title={`About ${a.firstName}`}>
            <div className="mt-6 grid gap-10 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0 max-w-[65ch]">
                {a.intro && <p className="text-[clamp(1.2rem,2.6cqi,1.45rem)] font-light leading-relaxed text-ink">{a.intro}</p>}
                <div className="mt-6 grid gap-5 text-body-lg leading-relaxed text-ink-2">
                  {a.bio.map((block, i) =>
                    block.kind === "heading" ? <h3 key={i} className="mt-4 text-sub font-medium text-ink">{block.text}</h3>
                    : block.kind === "list" ? (
                      <ul key={i} className="grid gap-2">
                        {block.items.map((item, j) => (
                          <li key={j} className="flex gap-3"><span aria-hidden="true" className="mt-[0.7em] size-1.5 shrink-0 rounded-full" style={{ background: a.accent }} /><span><Rich parts={item} /></span></li>
                        ))}
                      </ul>
                    ) : <p key={i}><Rich parts={block.parts} /></p>,
                  )}
                </div>
              </div>
              {(a.specialisms.length > 0 || a.credentials.length > 0) && (
                <aside className="grid gap-8 content-start">
                  {a.specialisms.length > 0 && (
                    <div>
                      <h3 className="text-label text-ink-3">Specialisms</h3>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {a.specialisms.map((s) => <li key={s} className="rounded-full border border-rule-strong px-3.5 py-1.5 text-sm text-ink">{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {a.credentials.length > 0 && (
                    <div>
                      <h3 className="text-label text-ink-3">Credentials</h3>
                      <ul className="mt-3 grid gap-2 text-sm text-ink-2">
                        {a.credentials.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </aside>
              )}
            </div>
          </Section>
        )}

        {all.length > 0 && (
          <Section id="properties" title="Properties">
            {tabHref && tabs.length > 2 && (
              <nav aria-label="Show" className="mt-6 flex flex-wrap gap-2">
                {tabs.map(([k, t]) => (
                  <a key={k} href={tabHref(k)} aria-current={k === show ? "page" : undefined}
                     className={`min-h-11 inline-flex items-center px-4 rounded-full border text-ui no-underline ${k === show ? "bg-accent text-on-accent border-[color:var(--accent-edge)]" : "border-rule-strong text-ink hover:border-ink"}`}>
                    {t} <span className="ms-2 tabular opacity-80">{counts[k]}</span>
                  </a>
                ))}
              </nav>
            )}
            {featured.length > 0 && (
              <>
                <h3 className="mt-8 text-[clamp(1.5rem,4cqi,2.25rem)] font-light text-ink">Featured</h3>
                <ul className="mt-6 grid gap-x-6 gap-y-12 @xl:grid-cols-2 @4xl:grid-cols-3" data-cards="featured">
                  {featured.map((x) => <Card key={x.reference} c={x} view={view} />)}
                </ul>
              </>
            )}
            {latest.length > 0 && (
              <>
                <h3 className="mt-14 text-[clamp(1.5rem,4cqi,2.25rem)] font-light text-ink">{featured.length ? `More from ${a.firstName}` : `${a.firstName}'s listings`}</h3>
                <ul className="mt-6 grid gap-x-6 gap-y-12 @xl:grid-cols-2 @4xl:grid-cols-3" data-cards="latest">
                  {latest.map((x) => <Card key={x.reference} c={x} view={view} />)}
                </ul>
              </>
            )}
            {featured.length + latest.length === 0 && <p className="mt-8 text-sub text-ink-2">Nothing in this group right now.</p>}
          </Section>
        )}

        {view.sold.length > 0 && (
          <Section id="record" title="Recently sold and let">
            <ul className="mt-6 border-t border-rule">
              {view.sold.map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 py-3.5 border-b border-rule">
                  <span className="text-ui text-ink min-w-0">
                    {[s.bedrooms !== null ? (s.bedrooms === 0 ? "Studio" : `${s.bedrooms}-bed`) : null, s.propertyType ? (PROPERTY_TYPE[s.propertyType] ?? "property").toLowerCase() : "property"].filter(Boolean).join(" ")}
                    {s.community && <span className="text-ink-3"> · {s.community}</span>}
                  </span>
                  <span className="text-label text-ink-3 uppercase tracking-[0.14em] shrink-0">{s.outcome}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {a.areas.length > 0 && (
          <Section id="areas" title="Areas I cover">
            <p className="mt-6 text-[clamp(1.6rem,5.5cqi,3rem)] font-light leading-[1.25] text-ink text-balance">
              {/* Real spaces either side of each dot, so the line can break
                  between areas — never inside one. */}
              {a.areas.map((n, i) => (
                <span key={n}>
                  {i > 0 && <>{" "}<span aria-hidden="true" style={{ color: a.accent }}>·</span>{" "}</>}
                  <span className="whitespace-nowrap">{n}</span>
                </span>
              ))}
            </p>
          </Section>
        )}

        <Section id="contact" title="Contact" className="mt-24 pt-12 border-t border-rule">
          <h3 className="mt-4 font-sans font-light text-ink text-[clamp(2rem,7cqi,3.75rem)] leading-[1.05] text-balance">Talk to {a.firstName}</h3>
          <div className="mt-8 grid gap-3 @xl:flex @xl:flex-wrap">
            {waHref && <a href={waHref} data-track="whatsapp" className={`${primary} min-h-14 px-8`}><WhatsAppMark /> WhatsApp me</a>}
            {c.phone && <a href={tel(c.phone)} data-track="phone" className={`${secondary} min-h-14 px-8 tabular`}><PhoneMark /> Call {spaced(c.phone)}</a>}
            {c.email && <a href={`mailto:${c.email}`} data-track="email" className={`${secondary} min-h-14 px-8 min-w-0`}><MailMark /> <span className="truncate">Email {a.firstName}</span></a>}
          </div>
          {a.social.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Elsewhere">
              {a.social.map((s) => (
                <li key={s.key}>
                  <a href={s.url} rel="noopener me" target="_blank" aria-label={`${a.name} on ${s.label}`}
                     className="min-h-11 inline-flex items-center gap-2 pe-3 text-sm text-ink-2 no-underline hover:text-ink">
                    <SocialMark network={s.key} /> {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <EnquiryForm slug="" back="" action={view.endpoints?.enquire} inContainer preview={preview}
                       sent={sent} problem={problem}
                       heading={`Or leave your details and ${a.firstName} will reply`}
                       thanks={`Thank you — ${a.firstName} has your message and will be in touch shortly.`} />
        </Section>

        <footer className="mt-20 pt-6 border-t border-rule grid gap-4 text-label text-ink-3">
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-2">
            <p>{a.name}{a.brn ? ` · RERA broker card ${a.brn}` : ""} · {b.name}</p>
            <p className="flex flex-wrap gap-x-5 gap-y-2">
              <a href={b.home} className="min-h-11 inline-flex items-center no-underline hover:underline text-ink-3">All properties from {b.name}</a>
              <a href={`${b.home}/agents`} className="min-h-11 inline-flex items-center no-underline hover:underline text-ink-3">Our agents</a>
              <a href="https://potatofarm.io/legal" rel="noopener" className="min-h-11 inline-flex items-center no-underline hover:underline text-ink-3">Privacy and terms</a>
            </p>
          </div>
          <a href="https://potatofarm.io" rel="noopener"
             className="inline-flex items-center gap-3 no-underline text-note text-ink-3 hover:text-ink-2 focus-visible:outline-none focus-visible:shadow-[var(--ring)] rounded-sm w-fit">
            Powered by <Logo size={20} word={15} />
          </a>
        </footer>
      </main>

      {/* Pinned on a narrow screen: the two things a buyer opening this
          from WhatsApp most often wants. Sticky rather than fixed, so it
          stays inside the editor's preview pane too. */}
      {(waHref || c.phone) && (
        <div className="@3xl:hidden sticky bottom-0 z-10 border-t border-rule bg-ground/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-contact-bar>
          <div className="flex gap-2">
            {waHref && <a href={waHref} data-track="whatsapp" className={`${primary} flex-1 min-w-0`}><WhatsAppMark /> WhatsApp</a>}
            {c.phone && <a href={tel(c.phone)} data-track="phone" className={`${secondary} flex-1 min-w-0`}><PhoneMark /> Call</a>}
          </div>
        </div>
      )}
    </div>
  );
}
