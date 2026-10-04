import type { ReactNode } from "react";
import { aedWhole } from "@/lib/money";
import { spacedPhone, whatsappText, type Inline } from "@/lib/microsite/content";
import { PROPERTY_TYPE, type MicrositeCard, type MicrositeViewModel } from "@/lib/microsite/view";
import type { Picture } from "@/lib/microsite/imagery";
import { Logo } from "@/components/brand/logo";
import { EnquiryForm } from "@/app/(property)/p/enquiry-form";
import { Art, Pic } from "./art";
import {
  ArrowMark, BathMark, BedMark, BuildingMark, ChartMark, KeyMark, MailMark, PhoneMark, PlaneMark, SizeMark, SocialMark, TagMark, WhatsAppMark,
} from "./icons";

/**
 * An agent's microsite.
 *
 * ## The story it tells, in order
 *
 * 1. **Who** — a full-bleed picture with the agent's name, title and one
 *    line on top of it, their portrait beside it, and the two ways forward.
 * 2. **What** — the figures that are true (their own and the CRM's).
 * 3. **Meet them** — portrait and a supporting picture, a short
 *    introduction, the rest of the biography behind "Read more".
 * 4. **What they represent** — one property large, the rest as a
 *    portfolio where the photograph is most of every card.
 * 5. **Where** — the communities they cover, as picture tiles.
 * 6. **Why** — what they do for clients, in a few words each.
 * 7. **Let's talk** — a full-bleed call to action, then WhatsApp, call,
 *    email and the form, which reaches the agent through the CRM.
 *
 * ## One drawing, two places
 *
 * The public page and the editor's live preview draw this from the same
 * `MicrositeViewModel`. It lays itself out by **its container** (`@container`,
 * `cqi`), not the window, so it draws its phone layout in the editor's
 * phone-width pane on a laptop.
 *
 * ## The brand
 *
 * The product's own tokens and type, unchanged: the grey ground, ink, the
 * pink for the one thing to do. The agent's accent marks only their own
 * details. Pictures come from `imagery.ts`, which decides where a stand-in
 * is honest; nothing here knows whether a picture is a photograph or a
 * drawing, so real photographs replace stand-ins without the layout moving.
 */

type Show = "all" | "sale" | "rent" | "offplan";

const wa = (n: string, text: string) => `https://wa.me/${n.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;
const tel = (n: string) => `tel:${n.replace(/[^0-9+]/g, "")}`;

const eyebrow = "text-note uppercase tracking-[0.2em]";
const pill = "inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-full font-medium text-ui no-underline transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring)]";
const primary = `${pill} bg-accent text-on-accent border border-[color:var(--accent-edge)] hover:bg-accent-hover`;
const secondary = `${pill} border border-rule-strong text-ink hover:border-ink`;
const onImage = `${pill} border border-white/40 text-white hover:border-white bg-black/10 backdrop-blur-sm`;
const wrap = "mx-auto w-full max-w-[1360px] px-5 @3xl:px-10";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "·";
}

function Rich({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => (p.bold ? <strong key={i} className="font-medium text-ink">{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}

/**
 * The portrait, or — never somebody else's face — the agent's monogram:
 * their initials, light, over a darkened drawing of the city, with their
 * accent as a single rule. Quiet enough to sit beside a photograph.
 */
function Portrait({ picture, name, accent, className, priority, seed }: { picture: Picture | null; name: string; accent: string; className?: string; priority?: boolean; seed?: string }) {
  if (picture) return <Pic picture={picture} priority={priority} sizes="(min-width: 1024px) 360px, 60vw" className={className} />;
  return (
    <div className={`relative overflow-hidden grid place-items-center @container/mono bg-[#16171A] ${className ?? ""}`} role="img" aria-label={name}>
      <Art scene="spire" seed={seed ?? name} className="absolute inset-0 size-full opacity-45" />
      <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgb(22_23_26/0.2),rgb(22_23_26/0.85))]" />
      <span className="relative grid justify-items-center gap-[6cqi]">
        <span className="font-sans font-light tracking-[-0.03em] leading-none text-[34cqi] text-white">{initials(name)}</span>
        <span aria-hidden="true" className="block h-[max(2px,1.2cqi)] w-[22cqi] rounded-full" style={{ background: accent }} />
      </span>
    </div>
  );
}

function Facts({ c }: { c: MicrositeCard }) {
  const item = "inline-flex items-center gap-1.5 text-ink-2";
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular">
      {c.bedrooms !== null && <span className={item}><BedMark className="size-4" />{c.bedrooms === 0 ? "Studio" : `${c.bedrooms} bed`}</span>}
      {c.bathrooms !== null && <span className={item}><BathMark className="size-4" />{c.bathrooms} bath</span>}
      {c.areaSqft !== null && <span className={item}><SizeMark className="size-4" />{c.areaSqft.toLocaleString("en-GB")} sq ft</span>}
    </span>
  );
}

const statusOf = (c: MicrositeCard) => (c.offPlan ? "Off-plan" : c.purpose === "RENT" ? "To let" : "For sale");
const priceOf = (c: MicrositeCard) => (c.priceFils === null ? null : `${aedWhole(BigInt(c.priceFils))}${c.purpose === "RENT" ? " a year" : ""}`);
const typeOf = (c: MicrositeCard) => (c.propertyType ? PROPERTY_TYPE[c.propertyType] ?? null : null);
const fallback = (c: MicrositeCard): Picture => c.picture ?? { kind: "art", scene: "towers", seed: c.reference, alt: "" };

/** The property shown large: the photograph at two-thirds of the width, its facts beside it. */
function LeadProperty({ c, view }: { c: MicrositeCard; view: MicrositeViewModel }) {
  const ask = view.contact.whatsapp ? wa(view.contact.whatsapp, whatsappText({ firstName: view.agent.firstName, pageUrl: view.contact.pageUrl, property: c })) : null;
  return (
    <article data-card={c.reference} data-status={statusOf(c)} className="grid gap-6 @4xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] @4xl:gap-10 items-center" data-reveal>
      <a href={c.href} data-track="property" data-ref={c.reference} className="group block relative rounded-md overflow-hidden" aria-label={c.title}>
        <Pic picture={fallback(c)} zoom showLabel sizes="(min-width: 1024px) 66vw, 100vw" className="aspect-[4/3] @4xl:aspect-[16/10]" />
        <span className="absolute top-4 start-4 rounded-full bg-ground/85 px-3 py-1 text-label text-ink backdrop-blur-sm">{statusOf(c)}</span>
      </a>
      <div className="min-w-0">
        {c.community && <p className={`${eyebrow} text-ink-3`}>{c.community}</p>}
        <h3 className="mt-3 font-light text-ink text-balance leading-[1.1] text-[clamp(1.6rem,3.6cqi,2.5rem)]">{c.title}</h3>
        {priceOf(c) && <p className="mt-4 text-[clamp(1.25rem,2.4cqi,1.6rem)] text-ink tabular">{priceOf(c)}</p>}
        <div className="mt-4"><Facts c={c} /></div>
        {typeOf(c) && <p className="mt-2 text-sm text-ink-3">{typeOf(c)}</p>}
        {c.excerpt && <p className="mt-5 text-sm text-ink-2 leading-relaxed max-w-[48ch]">{c.excerpt}</p>}
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={c.href} data-track="property" data-ref={c.reference} className={primary}>View property <ArrowMark className="size-4" /></a>
          {ask && <a href={ask} data-track="whatsapp" data-ref={c.reference} className={secondary}><WhatsAppMark className="size-4" /> Ask on WhatsApp</a>}
        </div>
      </div>
    </article>
  );
}

/** A portfolio card: the photograph is most of it. */
function Card({ c, view, large, delay }: { c: MicrositeCard; view: MicrositeViewModel; large?: boolean; delay: number }) {
  const ask = view.contact.whatsapp ? wa(view.contact.whatsapp, whatsappText({ firstName: view.agent.firstName, pageUrl: view.contact.pageUrl, property: c })) : null;
  return (
    <li data-card={c.reference} data-status={statusOf(c)} className="flex flex-col min-w-0" data-reveal style={{ ["--d" as string]: `${delay}ms` }}>
      <a href={c.href} data-track="property" data-ref={c.reference} className="group block no-underline">
        <div className="relative rounded-md overflow-hidden">
          <Pic picture={fallback(c)} zoom showLabel
               sizes={large ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 576px) 50vw, 100vw"}
               className={large ? "aspect-[4/3]" : "aspect-[5/4]"} />
          <span className="absolute top-3 start-3 rounded-full bg-ground/85 px-3 py-1 text-label text-ink backdrop-blur-sm">{statusOf(c)}</span>
          {priceOf(c) && (
            <span className="absolute bottom-3 start-3 rounded-full bg-ground/85 px-3 py-1 text-sm text-ink tabular backdrop-blur-sm">{priceOf(c)}</span>
          )}
        </div>
        {c.community && <p className={`mt-4 ${eyebrow} text-ink-3`}>{c.community}</p>}
        <p className={`mt-1.5 text-ink text-balance group-hover:underline underline-offset-4 decoration-rule-strong ${large ? "text-[clamp(1.2rem,2.2cqi,1.45rem)] font-light" : "text-body-lg"}`}>{c.title}</p>
        <div className="mt-2"><Facts c={c} /></div>
      </a>
      {ask && (
        <a href={ask} data-track="whatsapp" data-ref={c.reference}
           className="mt-2 min-h-11 inline-flex items-center gap-1.5 self-start text-sm text-ink-2 no-underline hover:text-ink">
          <WhatsAppMark className="size-4" /> Ask about it
        </a>
      )}
    </li>
  );
}

function SectionHead({ kicker, title, accent, id, children }: { kicker: string; title: string; accent: string; id?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5" data-reveal>
      <div className="min-w-0">
        <p className={`${eyebrow} text-ink-3 flex items-center gap-3`}><span aria-hidden="true" className="h-px w-8" style={{ background: accent }} />{kicker}</p>
        <h2 id={id} className="mt-4 font-light text-ink text-balance leading-[1.05] tracking-[-0.02em] text-[clamp(2rem,5.2cqi,3.6rem)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

const SERVICE_ICON: Record<string, (p: { className?: string }) => ReactNode> = {
  buy: KeyMark, sell: TagMark, rent: BuildingMark, invest: ChartMark, relocate: PlaneMark,
};

export function MicrositeView({ view, show = "all", area = null, tabHref, areaHref, sent = false, problem = null, preview = false }: {
  view: MicrositeViewModel;
  show?: Show;
  /** A community the properties are narrowed to, from an area tile. */
  area?: string | null;
  /** Links for the property tabs; without it (the preview) the tabs are left out. */
  tabHref?: (s: Show) => string;
  /** Where an area tile leads; without it the tiles are not links. */
  areaHref?: (area: string) => string;
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
  const keep = (x: MicrositeCard) =>
    (show === "all" ? true : show === "offplan" ? x.offPlan : show === "rent" ? x.purpose === "RENT" : x.purpose === "SALE" && !x.offPlan)
    && (!area || (x.community ?? "").toLowerCase() === area.toLowerCase());
  const shown = all.filter(keep);
  const [lead, ...rest] = shown;
  const pair = rest.slice(0, 2);
  const more = rest.slice(2);
  const tabs = ([["all", "All"], ["sale", "For sale"], ["rent", "To let"], ["offplan", "Off-plan"]] as [Show, string][])
    .filter(([k]) => k === "all" || counts[k] > 0);
  const name = a.name || "Your name";
  const firstBio = a.bio.find((x) => x.kind === "para");
  const restBio = a.bio.filter((x) => x !== firstBio);

  return (
    <div className="@container bg-ground text-ink min-h-full overflow-x-clip" data-microsite={a.slug}>
      {/* ---- 1. Who ---------------------------------------------------- */}
      <header className="relative isolate z-10 min-h-[clamp(600px,90svh,900px)] flex flex-col">
        <Pic picture={view.pictures.hero} priority sizes="100vw" className="!absolute inset-0 -z-10" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(14_15_18/0.72)_0%,rgb(14_15_18/0.15)_28%,rgb(14_15_18/0.35)_55%,rgb(41_44_50/0.97)_100%)]" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(14_15_18/0.55)_0%,rgb(14_15_18/0)_60%)]" />

        <div className={`${wrap} flex items-center justify-between gap-4 py-5`}>
          <a href={b.home} className="min-w-0 truncate text-note font-medium text-white uppercase tracking-[0.24em] no-underline hover:underline">{b.name}</a>
          <nav aria-label="On this page" className="flex items-center gap-6 shrink-0">
            {all.length > 0 && <a href="#properties" className="hidden @3xl:inline-flex min-h-11 items-center text-note text-white/80 uppercase tracking-[0.18em] no-underline hover:text-white">Properties</a>}
            <a href="#contact" className="hidden @3xl:inline-flex min-h-11 items-center text-note text-white/80 uppercase tracking-[0.18em] no-underline hover:text-white">Contact</a>
            {waHref && (
              <a href={waHref} data-track="whatsapp" className="min-h-11 inline-flex items-center gap-2 text-note text-white uppercase tracking-[0.18em] no-underline hover:text-white/80">
                <WhatsAppMark className="size-4" /> WhatsApp
              </a>
            )}
          </nav>
        </div>

        <div className={`${wrap} mt-auto pb-10 @3xl:pb-16 grid gap-8 @5xl:grid-cols-[minmax(0,1fr)_auto] @5xl:items-end`}>
          <div className="min-w-0 max-w-[880px]">
            <div className="flex items-center gap-4">
              <Portrait picture={a.portrait} name={name} accent={a.accent} priority
                        className="@5xl:hidden size-16 shrink-0 rounded-full ring-2 ring-white/70 shadow-lg" />
              <p className={`${eyebrow} text-white/80`}>{[a.title, b.name].filter(Boolean).join(" · ")}</p>
            </div>
            <h1 className="mt-5 font-sans font-light text-white text-balance leading-[0.98] tracking-[-0.03em] text-[clamp(2.75rem,9.5cqi,6.75rem)] break-words">
              {name}
            </h1>
            <span aria-hidden="true" className="mt-6 block h-[3px] w-16 rounded-full" style={{ background: a.accent }} />
            {a.headline && <p className="mt-6 text-[clamp(1.15rem,2.6cqi,1.65rem)] font-light leading-snug text-white/90 max-w-[36ch] text-balance">{a.headline}</p>}
            {a.areas.length > 0 && <p className={`mt-4 ${eyebrow} text-white/70`}>{a.areas.slice(0, 4).join("  ·  ")}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              {all.length > 0 ? <a href="#properties" className={primary}>View properties</a> : <a href="#contact" className={primary}>Contact me</a>}
              {all.length > 0 && <a href="#contact" className={onImage}>Contact me</a>}
            </div>
          </div>
          <figure className="hidden @5xl:block w-[clamp(260px,24cqi,340px)] translate-y-24 z-10">
            <Portrait picture={a.portrait} name={name} accent={a.accent} priority className="aspect-[4/5] rounded-md shadow-[0_30px_80px_rgb(0_0_0/0.45)] ring-1 ring-white/10" />
            {a.brn && <figcaption className="mt-3 text-label text-ink-3 text-end">RERA broker card {a.brn}</figcaption>}
          </figure>
        </div>
      </header>

      {/* ---- 2. The figures ------------------------------------------- */}
      {view.stats.length >= 2 && (
        <section aria-label="At a glance" className="border-b border-rule">
          <dl className={`${wrap} grid grid-cols-2 @3xl:grid-cols-4 @5xl:pe-[clamp(300px,28cqi,400px)]`}>
            {view.stats.map((s, i) => (
              <div key={s.label} className={`py-7 @3xl:py-10 pe-4 border-rule flex flex-col-reverse ${i % 2 ? "ps-5 border-s" : ""} ${i > 0 ? "@3xl:ps-8 @3xl:border-s" : ""} ${i === 2 ? "border-t @3xl:border-t-0" : ""} ${i === 3 ? "border-t @3xl:border-t-0" : ""}`} data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
                <dt className="mt-3 text-label text-ink-3 uppercase tracking-[0.14em]">{s.label}</dt>
                <dd className="font-light text-ink tabular leading-none tracking-[-0.02em] text-[clamp(2.25rem,5.5cqi,3.75rem)]">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ---- 3. Meet them ----------------------------------------------- */}
      {(a.intro || a.bio.length > 0 || a.specialisms.length > 0) && (
        <section id="about" aria-labelledby="about-h" className="scroll-mt-6 py-20 @3xl:py-28">
          <div className={`${wrap} grid gap-14 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] @4xl:gap-20 items-center`}>
            <div className="relative pb-16 @4xl:pb-20 pe-10 @4xl:pe-16" data-reveal>
              <Pic picture={view.pictures.mood} sizes="(min-width: 1024px) 40vw, 90vw" className="aspect-[4/5] rounded-md" />
              <div className="absolute bottom-0 end-0 w-[46%] border-[6px] border-[color:var(--ground)] rounded-md overflow-hidden shadow-[0_20px_50px_rgb(0_0_0/0.35)]">
                <Portrait picture={a.portrait} name={name} accent={a.accent} className="aspect-[4/5]" />
              </div>
            </div>
            <div className="min-w-0" data-reveal style={{ ["--d" as string]: "100ms" }}>
              <p className={`${eyebrow} text-ink-3 flex items-center gap-3`}><span aria-hidden="true" className="h-px w-8" style={{ background: a.accent }} />Meet {a.firstName}</p>
              <h2 id="about-h" className="mt-5 font-light text-ink text-balance leading-[1.15] text-[clamp(1.6rem,3.6cqi,2.6rem)]">
                {a.intro || a.headline || `${a.title} at ${b.name}.`}
              </h2>
              {firstBio && firstBio.kind === "para" && (
                <p className="mt-6 text-body-lg leading-relaxed text-ink-2 max-w-[60ch]"><Rich parts={firstBio.parts} /></p>
              )}
              {restBio.length > 0 && (
                <details className="mt-4 group/more">
                  <summary className="min-h-11 inline-flex items-center gap-2 cursor-pointer list-none text-ui text-ink underline underline-offset-4 decoration-rule-strong hover:decoration-ink">
                    <span className="group-open/more:hidden">Read more</span><span className="hidden group-open/more:inline">Show less</span>
                  </summary>
                  <div className="mt-4 grid gap-4 text-body-lg leading-relaxed text-ink-2 max-w-[60ch]">
                    {restBio.map((block, i) =>
                      block.kind === "heading" ? <h3 key={i} className="mt-2 text-sub font-medium text-ink">{block.text}</h3>
                      : block.kind === "list" ? (
                        <ul key={i} className="grid gap-2">
                          {block.items.map((item, j) => (
                            <li key={j} className="flex gap-3"><span aria-hidden="true" className="mt-[0.7em] size-1.5 shrink-0 rounded-full" style={{ background: a.accent }} /><span><Rich parts={item} /></span></li>
                          ))}
                        </ul>
                      ) : <p key={i}><Rich parts={block.parts} /></p>,
                    )}
                  </div>
                </details>
              )}
              <dl className="mt-10 grid gap-6 @xl:grid-cols-2 border-t border-rule pt-8">
                {a.specialisms.length > 0 && (
                  <div className="@xl:col-span-2">
                    <dt className="text-label text-ink-3 uppercase tracking-[0.14em]">Specialisms</dt>
                    <dd className="mt-3 flex flex-wrap gap-2">
                      {a.specialisms.map((s) => <span key={s} className="rounded-full border border-rule-strong px-3.5 py-1.5 text-sm text-ink">{s}</span>)}
                    </dd>
                  </div>
                )}
                {a.languages.length > 0 && (
                  <div><dt className="text-label text-ink-3 uppercase tracking-[0.14em]">Languages</dt><dd className="mt-2 text-ui text-ink">{a.languages.join(", ")}</dd></div>
                )}
                {(a.brn || a.credentials.length > 0) && (
                  <div>
                    <dt className="text-label text-ink-3 uppercase tracking-[0.14em]">Credentials</dt>
                    <dd className="mt-2 grid gap-1 text-ui text-ink">
                      {a.brn && <span>RERA broker card {a.brn}</span>}
                      {a.credentials.map((x) => <span key={x}>{x}</span>)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* ---- 4. What they represent ------------------------------------- */}
      {all.length > 0 && (
        <section id="properties" aria-labelledby="properties-h" className="scroll-mt-6 bg-raised py-20 @3xl:py-28">
          <div className={wrap}>
            <SectionHead id="properties-h" kicker="Portfolio" title={view.featured.length ? "Featured properties" : `${a.firstName}'s properties`} accent={a.accent}>
              {tabHref && tabs.length > 2 && (
                <nav aria-label="Show" className="flex flex-wrap gap-2">
                  {tabs.map(([k, t]) => (
                    <a key={k} href={tabHref(k)} aria-current={k === show && !area ? "page" : undefined}
                       className={`min-h-11 inline-flex items-center px-4 rounded-full border text-ui no-underline ${k === show && !area ? "bg-accent text-on-accent border-[color:var(--accent-edge)]" : "border-rule-strong text-ink hover:border-ink"}`}>
                      {t} <span className="ms-2 tabular opacity-80">{counts[k]}</span>
                    </a>
                  ))}
                </nav>
              )}
            </SectionHead>
            {area && (
              <p className="mt-6 text-sm text-ink-2">In {area}. {tabHref && <a href={tabHref("all")} className="text-ink underline underline-offset-4">Show everything</a>}</p>
            )}
            <div className="mt-12 @3xl:mt-16" data-cards={view.featured.length ? "featured" : "latest"}>
              {lead && <LeadProperty c={lead} view={view} />}
              {pair.length > 0 && (
                <ul className="mt-16 grid gap-x-8 gap-y-14 @xl:grid-cols-2">
                  {pair.map((x, i) => <Card key={x.reference} c={x} view={view} large delay={i * 90} />)}
                </ul>
              )}
              {more.length > 0 && (
                <ul className="mt-14 grid gap-x-6 gap-y-12 @xl:grid-cols-2 @5xl:grid-cols-3">
                  {more.map((x, i) => <Card key={x.reference} c={x} view={view} delay={(i % 3) * 90} />)}
                </ul>
              )}
              {shown.length === 0 && <p className="text-sub text-ink-2">Nothing in this group right now.</p>}
            </div>
            {view.sold.length > 0 && (
              <div id="record" className="mt-20 border-t border-rule pt-10" data-reveal>
                <h3 className="text-label text-ink-3 uppercase tracking-[0.14em]">Recently sold and let</h3>
                <ul className="mt-5 grid gap-x-8 @xl:grid-cols-2 @5xl:grid-cols-3">
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
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---- 5. Where --------------------------------------------------- */}
      {view.areaTiles.length > 0 && (
        <section id="areas" aria-labelledby="areas-h" className="scroll-mt-6 py-20 @3xl:py-28">
          <div className={wrap}>
            <SectionHead id="areas-h" kicker="Where I work" title="Areas I specialise in" accent={a.accent} />
          </div>
          <ul className={`mt-12 ${wrap} flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 @3xl:grid @3xl:grid-cols-3 @3xl:auto-rows-[300px] @3xl:overflow-visible @3xl:pb-0`} data-areas>
            {view.areaTiles.map((t, i) => {
              const inner = (
                <>
                  <Pic picture={t.picture} zoom sizes="(min-width: 768px) 40vw, 80vw" className="!absolute inset-0" />
                  <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgb(14_15_18/0)_35%,rgb(14_15_18/0.85)_100%)]" />
                  <span className="relative mt-auto p-6 grid gap-1.5">
                    <span className="font-light text-white leading-tight text-[clamp(1.4rem,3cqi,2.2rem)]">{t.name}</span>
                    {t.blurb && <span className="text-sm text-white/80 max-w-[36ch]">{t.blurb}</span>}
                    {t.count > 0 && <span className="mt-1 inline-flex items-center gap-1.5 text-note text-white uppercase tracking-[0.16em]">{t.count} propert{t.count === 1 ? "y" : "ies"} <ArrowMark className="size-3.5" /></span>}
                  </span>
                </>
              );
              const tile = "group relative isolate flex flex-col min-h-[340px] @3xl:min-h-0 h-full rounded-md overflow-hidden no-underline";
              return (
                <li key={t.name} data-reveal style={{ ["--d" as string]: `${(i % 3) * 80}ms` }}
                    className={`snap-start shrink-0 w-[80%] @xl:w-[46%] @3xl:w-auto ${i === 0 && view.areaTiles.length > 2 ? "@3xl:col-span-2 @3xl:row-span-2" : ""}`}>
                  {areaHref && t.count > 0 ? <a href={areaHref(t.name)} className={tile}>{inner}</a> : <div className={tile}>{inner}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- 6. Why ----------------------------------------------------- */}
      <section aria-labelledby="help-h" className="bg-raised py-20 @3xl:py-28">
        <div className={wrap}>
          <SectionHead id="help-h" kicker="How I can help" title={`Working with ${a.firstName || name}`} accent={a.accent} />
          <ul className="mt-12 grid gap-px bg-rule rounded-md overflow-hidden @xl:grid-cols-2 @5xl:grid-cols-4">
            {view.services.slice(0, 4).map((s, i) => {
              const Icon = SERVICE_ICON[s.key] ?? KeyMark;
              return (
                <li key={s.key} className="bg-raised py-8 @xl:p-7 @3xl:p-9 grid content-start gap-4" data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
                  <span className="grid place-items-center size-12 rounded-full border border-rule-strong" style={{ color: a.accent }}><Icon className="size-6" /></span>
                  <h3 className="font-light text-ink text-[clamp(1.5rem,3cqi,2rem)] leading-none">{s.title}</h3>
                  <p className="text-sm text-ink-2 leading-relaxed">{s.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ---- 7. Let's talk --------------------------------------------- */}
      <section aria-labelledby="cta-h" className="relative isolate overflow-hidden">
        <Pic picture={view.pictures.cta} sizes="100vw" className="!absolute inset-0 -z-10" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(14_15_18/0.55),rgb(14_15_18/0.78))]" />
        <div className={`${wrap} py-28 @3xl:py-40 text-center grid justify-items-center`} data-reveal>
          <p className={`${eyebrow} text-white/80`}>{b.name}</p>
          <h2 id="cta-h" className="mt-5 font-light text-white text-balance leading-[1.02] tracking-[-0.02em] text-[clamp(2.4rem,7.5cqi,5.5rem)] max-w-[16ch]">
            Let&apos;s find your next property
          </h2>
          <p className="mt-6 text-[clamp(1.05rem,2cqi,1.3rem)] text-white/85 max-w-[44ch] text-balance">
            Whether you&apos;re buying, selling or investing, speak directly with {a.firstName || name}.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {waHref && <a href={waHref} data-track="whatsapp" className={`${primary} min-h-14 px-8`}><WhatsAppMark /> WhatsApp me</a>}
            {c.phone && <a href={tel(c.phone)} data-track="phone" className={`${onImage} min-h-14 px-8`}><PhoneMark /> Call me</a>}
            {!waHref && !c.phone && <a href="#contact" className={`${primary} min-h-14 px-8`}>Contact me</a>}
          </div>
        </div>
      </section>

      <section id="contact" aria-labelledby="contact-h" className="scroll-mt-6 py-20 @3xl:py-28">
        <div className={`${wrap} grid gap-14 @4xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] @4xl:gap-20`}>
          <div className="min-w-0" data-reveal>
            <div className="flex items-center gap-5">
              <Portrait picture={a.portrait} name={name} accent={a.accent} className="size-24 @3xl:size-28 shrink-0 rounded-full" />
              <div className="min-w-0">
                <p className="text-body-lg text-ink">{name}</p>
                <p className="text-sm text-ink-3">{[a.title, b.name].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            <h2 id="contact-h" className="mt-10 font-light text-ink leading-[1.02] tracking-[-0.02em] text-[clamp(2.4rem,6.5cqi,4.5rem)]">Let&apos;s talk</h2>
            <p className="mt-5 text-body-lg text-ink-2 max-w-[40ch]">The quickest way to reach {a.firstName || name} is WhatsApp. Calls and emails come straight through too.</p>
            <ul className="mt-10 border-t border-rule">
              {waHref && (
                <li><a href={waHref} data-track="whatsapp" className="group flex items-center gap-4 min-h-[72px] border-b border-rule no-underline">
                  <span className="grid place-items-center size-11 rounded-full bg-accent text-on-accent shrink-0"><WhatsAppMark /></span>
                  <span className="grid min-w-0"><span className="text-ui text-ink">WhatsApp</span><span className="text-sm text-ink-3">Usually the fastest reply</span></span>
                  <ArrowMark className="ms-auto size-5 text-ink-3 group-hover:text-ink transition-transform group-hover:translate-x-1" />
                </a></li>
              )}
              {c.phone && (
                <li><a href={tel(c.phone)} data-track="phone" className="group flex items-center gap-4 min-h-[72px] border-b border-rule no-underline">
                  <span className="grid place-items-center size-11 rounded-full border border-rule-strong text-ink shrink-0"><PhoneMark /></span>
                  <span className="grid min-w-0"><span className="text-ui text-ink">Call</span><span className="text-sm text-ink-3 tabular">{spacedPhone(c.phone)}</span></span>
                  <ArrowMark className="ms-auto size-5 text-ink-3 group-hover:text-ink transition-transform group-hover:translate-x-1" />
                </a></li>
              )}
              {c.email && (
                <li><a href={`mailto:${c.email}`} data-track="email" className="group flex items-center gap-4 min-h-[72px] border-b border-rule no-underline">
                  <span className="grid place-items-center size-11 rounded-full border border-rule-strong text-ink shrink-0"><MailMark /></span>
                  <span className="grid min-w-0"><span className="text-ui text-ink">Email</span><span className="text-sm text-ink-3 break-all">{c.email}</span></span>
                  <ArrowMark className="ms-auto size-5 text-ink-3 group-hover:text-ink transition-transform group-hover:translate-x-1" />
                </a></li>
              )}
            </ul>
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
          </div>
          <div className="min-w-0 rounded-md bg-raised p-6 @3xl:p-10 [&_#enquire]:mt-0" data-reveal style={{ ["--d" as string]: "100ms" }}>
            <EnquiryForm slug="" back="" action={view.endpoints?.enquire} inContainer preview={preview}
                         sent={sent} problem={problem}
                         heading={`Or leave your details and ${a.firstName || name} will reply`}
                         thanks={`Thank you — ${a.firstName || name} has your message and will be in touch shortly.`} />
          </div>
        </div>
      </section>

      <footer className="border-t border-rule">
        <div className={`${wrap} py-10 grid gap-6`}>
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 text-label text-ink-3">
            <p>{name}{a.brn ? ` · RERA broker card ${a.brn}` : ""} · {b.name}</p>
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
        </div>
      </footer>

      {/* Pinned on a narrow screen: what a buyer opening this from WhatsApp
          most often wants. Sticky rather than fixed, so it stays inside the
          editor's preview pane too. */}
      {(waHref || c.phone) && (
        <div className="@3xl:hidden sticky bottom-0 z-20 border-t border-rule bg-ground/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-contact-bar>
          <div className="flex gap-2">
            {waHref && <a href={waHref} data-track="whatsapp" className={`${primary} flex-1 min-w-0`}><WhatsAppMark /> WhatsApp me</a>}
            {c.phone && <a href={tel(c.phone)} data-track="phone" className={`${secondary} flex-1 min-w-0`}><PhoneMark /> Call</a>}
          </div>
        </div>
      )}
    </div>
  );
}
