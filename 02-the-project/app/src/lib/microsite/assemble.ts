import { firstName, parseBio, SOCIAL, SOCIAL_KEYS, type MicrositeContent } from "./content";
import { accentFor } from "./palette";
import type { MicrositeCard, MicrositeViewModel, SoldCard } from "./view";

/**
 * The page, from what the agent wrote and what the server resolved.
 *
 * One function for the public page (on the server) and the editor's live
 * preview (in the browser, from the unsaved form), so the preview is the
 * page and cannot drift from it. The server resolves everything that
 * needs the database — which chosen properties pass the property page's
 * gate, area names, the brokerage's WhatsApp line, completed deals — and
 * this decides what to show from the agent's choices.
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
  photo: string | null;
  cover: string | null;
};

export function assembleView(c: Omit<MicrositeContent, "photo" | "cover">, p: ViewParts): MicrositeViewModel {
  const featured = c.featured.map((id) => p.cards[id]).filter((x): x is MicrositeCard => !!x);
  const shown = new Set(featured.map((f) => f.reference));
  const whatsapp = c.whatsapp === "NONE"
    ? null
    : c.whatsapp === "OWN" && p.ownWhatsappAllowed && c.whatsappNumber
      ? c.whatsappNumber
      : p.companyWhatsapp;
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
      areas: c.areas.map((id) => p.areaNames[id]).filter((n): n is string => !!n),
      accent: accentFor(c.accent, p.allowedAccents),
      photo: p.photo,
      cover: p.cover,
      social: SOCIAL_KEYS.filter((k) => !!c.social[k]).map((k) => ({ key: k, label: SOCIAL[k].label, url: c.social[k] as string })),
    },
    contact: { phone: c.phone, email: c.email, whatsapp, pageUrl: p.pageUrl },
    featured,
    latest: c.showLatest ? p.own.map((o) => o.card).filter((x) => !shown.has(x.reference)) : [],
    sold: c.showSold ? p.sold : [],
    deals: c.showDeals && p.deals > 0 ? p.deals : null,
    endpoints: p.endpoints,
  };
}
