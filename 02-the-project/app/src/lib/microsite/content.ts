import { z } from "zod";
import { normalisePhone } from "@/lib/phone";
import { ACCENT_KEYS, DEFAULT_ACCENT, type AccentKey } from "./palette";

/**
 * What an agent's microsite says, and the rules for saying it.
 *
 * One module for the editor and the server, so the limits an agent sees
 * while typing are the limits the save enforces — and the public page
 * renders only what passed through here. Pure: no database, no React.
 *
 * ## What is *not* in here
 *
 * Properties are listing ids, never copies: the page resolves them
 * through the property page's own gate on every view. The number of
 * transactions is never typed in — it is counted from the CRM's
 * completed deals (`showDeals` only decides whether to show it). The
 * brokerage's name, its legal line and "Powered by" are not fields at
 * all, so no agent can remove them.
 */

export const LIMITS = {
  name: 80, title: 80, headline: 160, intro: 400, bio: 6000,
  languages: 10, areas: 16, specialisms: 8, credentials: 6, credential: 80,
  featured: 24, seoTitle: 70, seoDescription: 170, brn: 20,
} as const;

export const SPECIALISMS = [
  "Off-plan", "Resale", "Luxury homes", "Investment", "Leasing", "Villas",
  "Apartments", "Commercial", "Holiday homes", "First-time buyers", "Relocation", "Portfolio management",
] as const;

export const LANGUAGES = [
  "English", "Arabic", "Hindi", "Urdu", "Russian", "French", "German", "Mandarin",
  "Farsi", "Spanish", "Italian", "Tagalog", "Malayalam", "Turkish", "Portuguese", "Dutch",
] as const;

/**
 * The networks an agent can link, and the hosts each may point at.
 * A link to anywhere else is refused: a microsite carrying the
 * brokerage's name must not become a way to send its clients to an
 * arbitrary site behind an Instagram icon.
 */
export const SOCIAL = {
  instagram: { label: "Instagram", hosts: ["instagram.com"] },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com"] },
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  tiktok: { label: "TikTok", hosts: ["tiktok.com"] },
  x: { label: "X", hosts: ["x.com", "twitter.com"] },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
} as const;
export type SocialKey = keyof typeof SOCIAL;
export const SOCIAL_KEYS = Object.keys(SOCIAL) as SocialKey[];

/** A social link, made whole and checked against its network, or a reason. */
export function readSocial(key: SocialKey, raw: string): { ok: true; url: string } | { ok: false; problem: string } {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, problem: `That isn't a ${SOCIAL[key].label} address.` };
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  const fits = (SOCIAL[key].hosts as readonly string[]).some((h) => host === h || host.endsWith(`.${h}`));
  if (!fits || url.username || url.password || url.pathname.length < 2) {
    return { ok: false, problem: `Paste the address of your ${SOCIAL[key].label} profile — it starts ${SOCIAL[key].hosts[0]}/.` };
  }
  url.protocol = "https:";
  return { ok: true, url: url.toString() };
}

const text = (max: number) => z.string().trim().max(max);
const opt = (max: number) => z.string().trim().max(max).nullable().transform((v) => v || null);

export const contentSchema = z.object({
  name: text(LIMITS.name),
  title: text(LIMITS.title),
  headline: text(LIMITS.headline),
  intro: text(LIMITS.intro),
  bio: text(LIMITS.bio),
  phone: z.string().trim().max(30).nullable(),
  email: z.string().trim().toLowerCase().max(200).nullable()
    .refine((v) => !v || /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(v), "That email address doesn't look right.")
    .transform((v) => v || null),
  /** Where "WhatsApp me" goes: the brokerage's line, the agent's own, or nowhere. */
  whatsapp: z.enum(["COMPANY", "OWN", "NONE"]),
  whatsappNumber: z.string().trim().max(30).nullable(),
  languages: z.array(z.enum(LANGUAGES)).max(LIMITS.languages),
  yearsExperience: z.number().int().min(0).max(60).nullable(),
  areas: z.array(z.string().min(1).max(40)).max(LIMITS.areas),
  specialisms: z.array(z.enum(SPECIALISMS)).max(LIMITS.specialisms),
  brn: opt(LIMITS.brn).refine((v) => !v || /^[0-9A-Za-z-]{2,20}$/.test(v), "A broker card number is letters and digits."),
  credentials: z.array(text(LIMITS.credential).min(1)).max(LIMITS.credentials),
  social: z.object(Object.fromEntries(SOCIAL_KEYS.map((k) => [k, z.string().trim().max(300).nullable()])) as Record<SocialKey, z.ZodNullable<z.ZodString>>),
  accent: z.enum(ACCENT_KEYS as [AccentKey, ...AccentKey[]]),
  featured: z.array(z.string().min(1).max(40)).max(LIMITS.featured),
  /** The agent's other advertisable listings, newest first, beneath the featured ones. */
  showLatest: z.boolean(),
  /** Properties they have sold or let, as a record — no prices, no photos. */
  showSold: z.boolean(),
  /** Completed transactions, counted from the CRM. */
  showDeals: z.boolean(),
  seoTitle: opt(LIMITS.seoTitle),
  seoDescription: opt(LIMITS.seoDescription),
  /** Storage keys, set only by the upload procedures. */
  photo: z.string().max(300).nullable(),
  cover: z.string().max(300).nullable(),
});

export type MicrositeContent = z.infer<typeof contentSchema>;
/** What the editor may send: everything but the photographs, which have their own procedures. */
export type EditableContent = Omit<MicrositeContent, "photo" | "cover">;

/** A new microsite, from what the CRM already knows about the agent. */
export function emptyContent(user: { name: string | null; phone: string | null; email: string | null }): MicrositeContent {
  return {
    name: user.name ?? "", title: "Property consultant", headline: "", intro: "", bio: "",
    phone: user.phone ? normalisePhone(user.phone) : null, email: user.email,
    whatsapp: "COMPANY", whatsappNumber: null,
    languages: ["English"], yearsExperience: null, areas: [], specialisms: [],
    brn: null, credentials: [],
    social: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, null])) as MicrositeContent["social"],
    accent: DEFAULT_ACCENT, featured: [], showLatest: true, showSold: false, showDeals: false,
    seoTitle: null, seoDescription: null, photo: null, cover: null,
  };
}

/**
 * Stored content, read defensively: anything missing or malformed falls
 * back to the default for that field, so a site saved before a field
 * existed still renders.
 */
export function readContent(raw: unknown, fallback: MicrositeContent): MicrositeContent {
  const base = { ...fallback, ...(raw && typeof raw === "object" ? raw : {}) };
  const parsed = contentSchema.safeParse(base);
  if (parsed.success) return parsed.data;
  const out: Record<string, unknown> = { ...fallback };
  const shape = contentSchema.shape as Record<string, z.ZodTypeAny>;
  for (const [k, schema] of Object.entries(shape)) {
    const one = schema.safeParse((base as Record<string, unknown>)[k]);
    if (one.success) out[k] = one.data;
  }
  return out as MicrositeContent;
}

export type Checked = { ok: true; content: EditableContent } | { ok: false; field: string; problem: string };

/**
 * The editor's content, normalised and checked. Phone numbers become
 * E.164, social links are made whole and must point at their network,
 * duplicates in lists go. Reasons are sentences an agent can act on.
 */
export function checkContent(input: EditableContent): Checked {
  const parsed = contentSchema.omit({ photo: true, cover: true }).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const message = issue?.message ?? "";
    const tooLong = issue?.code === "too_big";
    return { ok: false, field, problem: tooLong ? `${label(field)} is too long.` : message.startsWith("That") || message.startsWith("A ") ? message : `${label(field)} isn't right.` };
  }
  const c = { ...parsed.data };
  if (!c.name) return { ok: false, field: "name", problem: "Your name is needed — it's the first thing on the page." };

  if (c.phone) {
    const p = normalisePhone(c.phone);
    if (!p) return { ok: false, field: "phone", problem: "That phone number doesn't look right. Include the country code if it isn't a UAE number." };
    c.phone = p;
  } else c.phone = null;

  if (c.whatsapp === "OWN") {
    const p = normalisePhone(c.whatsappNumber ?? "") ?? null;
    if (!p) return { ok: false, field: "whatsappNumber", problem: "Add the WhatsApp number to use, or send WhatsApp messages to the company line." };
    c.whatsappNumber = p;
  } else c.whatsappNumber = null;

  for (const k of SOCIAL_KEYS) {
    const v = c.social[k];
    if (!v) { c.social[k] = null; continue; }
    const r = readSocial(k, v);
    if (!r.ok) return { ok: false, field: `social.${k}`, problem: r.problem };
    c.social[k] = r.url;
  }
  c.languages = [...new Set(c.languages)];
  c.areas = [...new Set(c.areas)];
  c.specialisms = [...new Set(c.specialisms)];
  c.featured = [...new Set(c.featured)];
  c.credentials = [...new Set(c.credentials.map((x) => x.replace(/\s+/g, " ")))];
  // Links in the free text are refused for the same reason as on the
  // enquiry form: the brokerage's page is not a place to send its clients
  // elsewhere. Social links have their own, checked fields.
  for (const f of ["headline", "intro", "bio"] as const) {
    if (/https?:\/\/|www\./i.test(c[f])) return { ok: false, field: f, problem: "Leave links out of the text — social links have their own section." };
  }
  return { ok: true, content: c };
}

function label(field: string) {
  const names: Record<string, string> = {
    name: "Your name", title: "Your title", headline: "The headline", intro: "The introduction", bio: "The biography",
    email: "The email address", seoTitle: "The search title", seoDescription: "The search description",
    credentials: "A credential", brn: "The broker card number", featured: "The list of properties",
  };
  return names[field] ?? "That";
}

/* ----------------------------------------------------------------------
 * The address
 * -------------------------------------------------------------------- */

/** Words that are paths of their own under a brokerage's page. */
const RESERVED = new Set(["agents", "enquire", "photos", "photo", "cover", "event", "new", "edit", "preview", "admin", "team", "all"]);

export function slugify(name: string) {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "") || "agent";
}

export function slugProblem(slug: string): string | null {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Use lower-case letters, numbers and single hyphens — like sara-ahmed.";
  if (slug.length < 3 || slug.length > 40) return "Between 3 and 40 characters.";
  if (RESERVED.has(slug)) return "That word is taken by the site itself. Try your name.";
  return null;
}

export const micrositePath = (orgSlug: string, agentSlug: string) =>
  `/p/${encodeURIComponent(orgSlug)}/agents/${encodeURIComponent(agentSlug)}`;

/**
 * The microsite a message points at, if it carries one's address.
 *
 * The "WhatsApp me" button on a microsite that uses the brokerage's line
 * writes the page's address into the message, so the lead can be given
 * to the agent whose page it was. Only the path is read — the host is
 * whatever domain the product is served from — and the caller keeps it
 * only if that brokerage has that live microsite.
 */
export function micrositeInText(text: string | null | undefined): { orgSlug: string; agentSlug: string } | null {
  if (!text) return null;
  const m = /\/p\/([a-z0-9][a-z0-9-]{0,62})\/agents\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=[\s/?#.,!)]|$)/i.exec(text);
  return m?.[1] && m[2] ? { orgSlug: m[1].toLowerCase(), agentSlug: m[2].toLowerCase() } : null;
}

/** The message a "WhatsApp me" button starts. */
export function whatsappText(args: { firstName: string; pageUrl: string | null; property?: { title: string; reference: string } | null }) {
  const about = args.property
    ? `I'm interested in ${args.property.title} (${args.property.reference}).`
    : "I'd like to talk about a property.";
  return `Hi ${args.firstName}, I found your page and ${about}${args.pageUrl ? `\n${args.pageUrl}` : ""}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/* ----------------------------------------------------------------------
 * The biography
 * -------------------------------------------------------------------- */

export type Inline = { text: string; bold: boolean };
export type BioBlock =
  | { kind: "heading"; text: string }
  | { kind: "para"; parts: Inline[] }
  | { kind: "list"; items: Inline[][] };

/**
 * The biography's light formatting, read into blocks the page renders as
 * elements — never as HTML, so nothing an agent types can become markup.
 *
 * A line starting "## " is a heading, lines starting "- " are a list,
 * **double asterisks** make bold, and a blank line starts a paragraph.
 * That is the whole language: enough for "About me / Experience /
 * Areas", the structure most good agent biographies have.
 */
export function parseBio(source: string): BioBlock[] {
  const blocks: BioBlock[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => { if (para.length) blocks.push({ kind: "para", parts: inline(para.join(" ")) }); para = []; };
  const flushList = () => { if (list.length) blocks.push({ kind: "list", items: list.map(inline) }); list = []; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const h = /^#{1,3}\s+(.+)$/.exec(line);
    if (h?.[1]) { flushPara(); flushList(); blocks.push({ kind: "heading", text: h[1].replace(/\*\*/g, "").trim() }); continue; }
    const li = /^[-•*]\s+(.+)$/.exec(line);
    if (li?.[1]) { flushPara(); list.push(li[1]); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return blocks;
}

function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > at) out.push({ text: s.slice(at, m.index), bold: false });
    out.push({ text: m[1] ?? "", bold: true });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ text: s.slice(at), bold: false });
  return out.length ? out : [{ text: s, bold: false }];
}

/* ----------------------------------------------------------------------
 * Completeness
 * -------------------------------------------------------------------- */

export type Step = { key: string; label: string; done: boolean; tab: string };

/** What a complete microsite has, in the order an agent should do it. */
export function completeness(c: MicrositeContent, ctx: { featuredShown: number }) {
  const steps: Step[] = [
    { key: "photo", label: "Profile photo", done: !!c.photo, tab: "branding" },
    { key: "headline", label: "Headline", done: c.headline.length >= 20, tab: "profile" },
    { key: "bio", label: "Biography", done: c.bio.length >= 200, tab: "about" },
    { key: "contact", label: "Contact details", done: !!(c.phone || c.email) && c.whatsapp !== "NONE", tab: "profile" },
    { key: "areas", label: "Areas covered", done: c.areas.length > 0, tab: "areas" },
    { key: "properties", label: "Featured properties", done: ctx.featuredShown > 0, tab: "properties" },
    { key: "social", label: "Social links", done: SOCIAL_KEYS.some((k) => !!c.social[k]), tab: "social" },
  ];
  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  return { percent, steps };
}

/** A UAE number as people read it aloud: +971 50 123 4567. Anything else as stored. */
export const spacedPhone = (n: string) =>
  /^\+971\d{9}$/.test(n) ? `+971 ${n.slice(4, 6)} ${n.slice(6, 9)} ${n.slice(9)}` : n;
