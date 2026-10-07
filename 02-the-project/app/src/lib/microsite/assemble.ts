import { firstName, parseBio, SOCIAL, SOCIAL_KEYS, type MicrositeContent } from "./content";
import { accentFor } from "./palette";
import { areaInfo, areaPicture, heroPicture, moodPicture, portraitPicture, propertyPicture, type Picture } from "./imagery";
import type { MicrositeCard, MicrositeViewModel, SoldCard } from "./view";
import { aedShort } from "@/lib/money";

/**
 * The page, from what the agent wrote and what the server resolved.
 *
 * One function for the public page (on the server) and the editor's live
 * preview (in the browser, from the unsaved form), so the preview is the
 * page and cannot drift from it. The server resolves everything that
 * needs the database — which chosen properties pass the property page's
 * gate, area names, the brokerage's WhatsApp line, completed deals — and
 * this decides what to show from the agent's choices, including every
 * picture (`imagery.ts` says where each one may come from).
 */
export type ViewParts = {
  brokerage: { name: string; home: string };
  slug: string;
  pageUrl: string;
  endpoints: MicrositeViewModel["endpoints"];
  allowedAccents: string[];
  ownWhatsappAllowed: boolean;
  companyWhatsapp: string | null;
  areaNames: Record<string, string>;
  /** The chosen properties that pass the gate, keyed by listing id. */
  cards: Record<string, MicrositeCard>;
  /** The agent's own advertisable properties, newest first, with their ids. */
  own: { id: string; card: MicrositeCard }[];
  sold: SoldCard[];
  deals: number;
  /** The value of those completed deals, in fils, as a string. */
  dealValueFils?: string;
  /** A demonstration brokerage: stand-in photography is allowed. */
  demo?: boolean;
  photo: string | null;
  cover: string | null;
};

const SERVICE = {
  buy: { title: "Buy", text: "The right home or investment, found and negotiated for you." },
  sell: { title: "Sell", text: "Priced on evidence, presented well, shown to qualified buyers." },
  rent: { title: "Rent", text: "Homes to let and tenants found, with the paperwork handled." },
  invest: { title: "Invest", text: "Yields, payment plans and resale, weighed against your goals." },
  relocate: { title: "Relocate", text: "A move to Dubai made simple, from first viewing to keys." },
} as const;

/** What the agent does for clients, from their specialisms and what they list. */
function services(c: Pick<MicrositeContent, "specialisms">, rents: boolean) {
  const s = new Set<string>(c.specialisms);
  const keys: (keyof typeof SERVICE)[] = ["buy", "sell"];
  if (rents || s.has("Leasing")) keys.push("rent");
  if (s.has("Investment") || s.has("Off-plan") || s.has("Portfolio management")) keys.push("invest");
  if (s.has("Relocation") || s.has("First-time buyers")) keys.push("relocate");
  if (keys.length < 3) keys.push(rents ? "invest" : "rent");
  return keys.map((k) => ({ key: k, ...SERVICE[k] }));
}

export function assembleView(c: Omit<MicrositeContent, "photo" | "cover">, p: ViewParts): MicrositeViewModel {
  const demo = !!p.demo;
  const seed = `${p.brokerage.name}/${p.slug}`;
  const withPicture = (x: MicrositeCard): MicrositeCard =>
    ({ ...x, picture: propertyPicture({ cover: x.cover, title: x.title, community: x.community, propertyType: x.propertyType, demo, seed: x.reference }) });

  const featured = c.featured.map((id) => p.cards[id]).filter((x): x is MicrositeCard => !!x).map(withPicture);
  const shown = new Set(featured.map((f) => f.reference));
  const latest = c.showLatest ? p.own.map((o) => o.card).filter((x) => !shown.has(x.reference)).map(withPicture) : [];
  const all = [...featured, ...latest];
  const whatsapp = c.whatsapp === "NONE"
    ? null
    : c.whatsapp === "OWN" && p.ownWhatsappAllowed && c.whatsappNumber
      ? c.whatsappNumber
      : p.companyWhatsapp;
  const areas = c.areas.map((id) => p.areaNames[id]).filter((n): n is string => !!n);
  const deals = c.showDeals && p.deals > 0 ? p.deals : null;

  // Only what is true: the agent's own profile and the CRM's records.
  const stats: { value: string; label: string }[] = [];
  if (c.yearsExperience) stats.push({ value: `${c.yearsExperience}`, label: c.yearsExperience === 1 ? "Year in property" : "Years in property" });
  if (deals) stats.push({ value: `${deals}`, label: deals === 1 ? "Transaction completed" : "Transactions completed" });
  if (deals && p.dealValueFils && BigInt(p.dealValueFils) > 0n) stats.push({ value: aedShort(BigInt(p.dealValueFils)), label: "Transacted" });
  if (all.length) stats.push({ value: `${all.length}`, label: all.length === 1 ? "Property listed" : "Properties listed" });
  if (areas.length) stats.push({ value: `${areas.length}`, label: areas.length === 1 ? "Area covered" : "Areas covered" });
  if (c.languages.length > 1) stats.push({ value: `${c.languages.length}`, label: "Languages" });

  const name = c.name || "Your name";
  const summary = c.headline || c.intro || `${c.title} at ${p.brokerage.name}${areas.length ? `, covering ${areas.slice(0, 3).join(", ")}` : ""}.`;
  const ctaArea = areas[Math.min(2, areas.length - 1)];
  const cta: Picture = ctaArea ? areaPicture(ctaArea) : { kind: "art", scene: "marina", seed: `${seed}/cta`, alt: "" };

  return {
    brokerage: p.brokerage,
    agent: {
      slug: p.slug,
      name: c.name,
      firstName: firstName(c.name),
      title: c.title,
      headline: c.headline,
      intro: c.intro,
      bio: parseBio(c.bio),
      languages: c.languages,
      yearsExperience: c.yearsExperience,
      specialisms: c.specialisms,
      brn: c.brn,
      credentials: c.credentials,
      areas,
      accent: accentFor(c.accent, p.allowedAccents),
      photo: p.photo,
      cover: p.cover,
      social: SOCIAL_KEYS.filter((k) => !!c.social[k]).map((k) => ({ key: k, label: SOCIAL[k].label, url: c.social[k] as string })),
      portrait: portraitPicture({ photo: p.photo, demo, seed, name }),
    },
    pictures: {
      hero: heroPicture({ cover: p.cover, areas, demo, seed }),
      mood: moodPicture({ demo, seed: `${seed}/mood`, areas, scene: "interior" }),
      cta,
    },
    stats: stats.slice(0, 4),
    areaTiles: areas.map((a) => ({
      name: a, blurb: areaInfo(a).blurb,
      count: all.filter((x) => (x.community ?? "").toLowerCase() === a.toLowerCase()).length,
      picture: areaPicture(a),
    })),
    services: services(c, all.some((x) => x.purpose === "RENT")),
    seo: {
      title: c.seoTitle || `${name} | ${p.brokerage.name}`,
      description: (c.seoDescription || summary).slice(0, 170),
    },
    contact: { phone: c.phone, email: c.email, whatsapp, pageUrl: p.pageUrl },
    featured,
    latest,
    sold: c.showSold ? p.sold : [],
    deals,
    endpoints: p.endpoints,
  };
}
