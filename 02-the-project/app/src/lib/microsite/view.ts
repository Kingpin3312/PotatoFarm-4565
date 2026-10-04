import type { BioBlock, SocialKey } from "./content";

/**
 * Everything an agent's microsite shows, and nothing else.
 *
 * The public page, the editor's live preview and the preview card are all
 * drawn from this shape, and it is built by one function on the server
 * (`server/lib/microsite/public.ts`) from fields chosen one by one. No
 * database row is passed through, so nothing private can arrive on the
 * page by being in a row that was handed over whole: no ids, no notes,
 * no leads, no other agent.
 */
export type MicrositeCard = {
  reference: string;
  title: string;
  purpose: "SALE" | "RENT";
  priceFils: string | null; // a string: bigint does not cross into a client component
  community: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number | null;
  propertyType: string | null;
  offPlan: boolean;
  excerpt: string | null;
  cover: string | null;
  href: string;
};

export type SoldCard = {
  community: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  outcome: "Sold" | "Let";
};

export type MicrositeViewModel = {
  brokerage: { name: string; home: string };
  agent: {
    slug: string;
    name: string;
    firstName: string;
    title: string;
    headline: string;
    intro: string;
    bio: BioBlock[];
    languages: string[];
    yearsExperience: number | null;
    specialisms: string[];
    brn: string | null;
    credentials: string[];
    areas: string[];
    accent: string;
    photo: string | null;
    cover: string | null;
    social: { key: SocialKey; label: string; url: string }[];
  };
  contact: {
    phone: string | null;
    email: string | null;
    /** E.164 for wa.me, or null when there is no WhatsApp to offer. */
    whatsapp: string | null;
    /** The address written into WhatsApp messages, so the lead reaches this agent. */
    pageUrl: string;
  };
  featured: MicrositeCard[];
  latest: MicrositeCard[];
  sold: SoldCard[];
  /** Completed transactions counted from the CRM, or null when not shown. */
  deals: number | null;
  /** Where the form posts and where the tracker reports. Null in a preview. */
  endpoints: { enquire: string; event: string } | null;
};

export const PROPERTY_TYPE: Record<string, string> = {
  APARTMENT: "Apartment", VILLA: "Villa", TOWNHOUSE: "Townhouse", PENTHOUSE: "Penthouse",
  DUPLEX: "Duplex", PLOT: "Plot", OFFICE: "Office", RETAIL: "Retail", WAREHOUSE: "Warehouse", OTHER: "Property",
};
