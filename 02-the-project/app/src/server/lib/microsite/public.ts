import { createHash } from "node:crypto";
import { crossTenant } from "@/server/db/client";
import { can } from "@/server/auth/rbac";
import { signGet } from "@/server/lib/files/storage";
import { advertisedCards, brokerageWhatsapp, type PublicCard } from "@/server/lib/listings/public";
import {
  emptyContent, firstName, micrositePath, readContent, type MicrositeContent,
} from "@/lib/microsite/content";
import { accentFor } from "@/lib/microsite/palette";
import { assembleView, type ViewParts } from "@/lib/microsite/assemble";
import type { MicrositeCard, MicrositeViewModel, SoldCard } from "@/lib/microsite/view";

/**
 * An agent's microsite, as a stranger may see it.
 *
 * ## One gate, one answer
 *
 * A site is shown only when all of these hold: the brokerage exists and
 * has microsites switched on; the agent published it (or an admin
 * approved it); no admin has taken it down; and the agent still belongs
 * to the brokerage in a role that may have one. **Every miss is the same
 * 404**, so the address cannot be used to find out which agents work
 * where, who has a draft, or who was taken down.
 *
 * ## Nothing is passed through
 *
 * The page is built from `MicrositeViewModel`, field by field. Properties
 * go through the property page's own gate (`advertisedCards`), so a
 * withdrawn or unpermitted listing never appears however the agent
 * chose it; sold and let properties are shown as a record without a
 * price, a photograph or an address. The number of transactions is
 * counted from completed deals, never typed in.
 */

const db = () => crossTenant("global-key");

export const appOrigin = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

/** A short, stable fingerprint of a storage key, so a new photo gets a new address. */
const version = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 10);

type Loaded = {
  org: { id: string; name: string; slug: string; micrositeAccents: string[]; micrositeOwnWhatsapp: boolean };
  site: { id: string; slug: string; userId: string };
  content: MicrositeContent;
};

/** The live site behind an address, or null for every kind of miss. */
export async function loadLive(orgSlug: string, agentSlug: string): Promise<Loaded | null> {
  const org = await db().organisation.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true, deletedAt: true, micrositesEnabled: true, micrositeAccents: true, micrositeOwnWhatsapp: true },
  });
  if (!org || org.deletedAt || !org.micrositesEnabled) return null;
  const site = await db().agentMicrosite.findUnique({
    where: { orgId_slug: { orgId: org.id, slug: agentSlug } },
    select: { id: true, slug: true, userId: true, live: true, publishedAt: true, disabledAt: true },
  });
  if (!site || !site.publishedAt || site.disabledAt || !site.live) return null;
  const member = await db().membership.findFirst({
    where: { orgId: org.id, userId: site.userId },
    select: { role: true, user: { select: { name: true, phone: true, email: true } } },
  });
  if (!member || !can(member.role, "microsite:own")) return null;
  return {
    org: { id: org.id, name: org.name, slug: org.slug, micrositeAccents: org.micrositeAccents, micrositeOwnWhatsapp: org.micrositeOwnWhatsapp },
    site: { id: site.id, slug: site.slug, userId: site.userId },
    content: readContent(site.live, emptyContent(member.user)),
  };
}

const toCard = ({ id: _id, ...c }: PublicCard & { id: string }): MicrositeCard =>
  ({ ...c, priceFils: c.priceFils === null ? null : c.priceFils.toString() });

/** The WhatsApp number the site's buttons open, by the agent's choice and the brokerage's rule. */
async function whatsappFor(org: Loaded["org"], c: MicrositeContent) {
  if (c.whatsapp === "NONE") return null;
  if (c.whatsapp === "OWN" && org.micrositeOwnWhatsapp && c.whatsappNumber) return c.whatsappNumber;
  return brokerageWhatsapp(org.id);
}

/** Completed deals this agent had a share of. */
export async function completedDeals(orgId: string, userId: string) {
  return db().deal.count({
    where: { orgId, stage: "COMPLETED", commissions: { some: { splits: { some: { userId } } } } },
  });
}

async function areaNames(ids: string[]) {
  if (!ids.length) return {};
  const rows = await db().location.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

async function soldBy(orgId: string, userId: string): Promise<SoldCard[]> {
  const rows = await db().listing.findMany({
    where: { orgId, agentId: userId, deletedAt: null, status: { in: ["SOLD", "LET"] } },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: { community: true, propertyType: true, bedrooms: true, status: true },
  });
  return rows.map((r) => ({ community: r.community, propertyType: r.propertyType, bedrooms: r.bedrooms, outcome: r.status === "LET" ? "Let" : "Sold" }));
}

/**
 * Everything the page needs from the database, for `assembleView`.
 *
 * `preview` addresses photographs by signed URL (only the agent sees a
 * preview, and a draft photo has no public route); the public page
 * addresses them through its own routes, which check the site is live.
 */
export async function resolveParts(
  org: Loaded["org"],
  site: { slug: string; userId: string },
  content: Pick<MicrositeContent, "featured" | "areas" | "photo" | "cover">,
  opts: { preview: boolean },
): Promise<ViewParts> {
  const path = micrositePath(org.slug, site.slug);
  const suffix = `?agent=${encodeURIComponent(site.slug)}`;
  const o = { id: org.id, slug: org.slug };
  const [chosen, own, sold, deals, areas, companyWhatsapp] = await Promise.all([
    advertisedCards(o, { ids: content.featured, hrefSuffix: suffix }),
    advertisedCards(o, { agentId: site.userId, take: 24, hrefSuffix: suffix }),
    soldBy(org.id, site.userId),
    completedDeals(org.id, site.userId),
    areaNames(content.areas),
    brokerageWhatsapp(org.id),
  ]);
  const media = (which: "photo" | "cover") => {
    const key = content[which];
    if (!key) return null;
    return opts.preview ? signGet({ key, expiresInSeconds: 3600 }) : `${path}/${which}?v=${version(key)}`;
  };
  return {
    brokerage: { name: org.name, home: `/p/${encodeURIComponent(org.slug)}` },
    slug: site.slug,
    pageUrl: `${appOrigin()}${path}`,
    endpoints: opts.preview ? null : { enquire: `${path}/enquire`, event: `${path}/event` },
    allowedAccents: org.micrositeAccents,
    ownWhatsappAllowed: org.micrositeOwnWhatsapp,
    companyWhatsapp,
    areaNames: areas,
    cards: Object.fromEntries(chosen.map((c) => [c.id, toCard(c)])),
    own: own.map((c) => ({ id: c.id, card: toCard(c) })),
    sold,
    deals,
    photo: media("photo"),
    cover: media("cover"),
  };
}

export async function buildView(l: Loaded, opts: { preview: boolean }): Promise<MicrositeViewModel> {
  return assembleView(l.content, await resolveParts(l.org, l.site, l.content, opts));
}

/** The public page's content, or null — one answer for every miss. */
export async function publicMicrosite(orgSlug: string, agentSlug: string) {
  const l = await loadLive(orgSlug, agentSlug);
  return l ? buildView(l, { preview: false }) : null;
}

/** A brokerage's microsite rules, as `resolveParts` needs them. */
export async function orgForMicrosites(orgId: string) {
  return db().organisation.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, micrositeAccents: true, micrositeOwnWhatsapp: true },
  });
}

/** One photograph of a live site, as a short-lived signed address, or null. */
export async function micrositeMedia(orgSlug: string, agentSlug: string, which: "photo" | "cover") {
  const l = await loadLive(orgSlug, agentSlug);
  const key = l?.content[which];
  if (!key || !key.startsWith(`org/${l.org.id}/microsites/`)) return null;
  return signGet({ key, expiresInSeconds: 600 });
}

/** The photograph's bytes key, for the preview card. */
export async function micrositePhotoKey(orgSlug: string, agentSlug: string) {
  const l = await loadLive(orgSlug, agentSlug);
  const key = l?.content.photo;
  return l ? { loaded: l, key: key && key.startsWith(`org/${l.org.id}/microsites/`) ? key : null } : null;
}

/**
 * The agents a brokerage shows on its team page: every live site, with
 * just enough to choose who to talk to.
 */
export async function micrositeTeam(orgSlug: string) {
  const org = await db().organisation.findUnique({
    where: { slug: orgSlug }, select: { id: true, name: true, slug: true, deletedAt: true, micrositesEnabled: true, micrositeAccents: true },
  });
  if (!org || org.deletedAt || !org.micrositesEnabled) return null;
  const sites = await db().agentMicrosite.findMany({
    where: { orgId: org.id, publishedAt: { not: null }, disabledAt: null },
    select: { slug: true, userId: true, live: true },
    orderBy: { publishedAt: "asc" },
    take: 200,
  });
  if (!sites.length) return { brokerage: org.name, agents: [] };
  const members = await db().membership.findMany({
    where: { orgId: org.id, userId: { in: sites.map((s) => s.userId) } },
    select: { userId: true, role: true, user: { select: { name: true, phone: true, email: true } } },
  });
  const byUser = new Map(members.filter((m) => can(m.role, "microsite:own")).map((m) => [m.userId, m]));
  const agents = [];
  for (const s of sites) {
    const m = byUser.get(s.userId);
    if (!m || !s.live) continue;
    const c = readContent(s.live, emptyContent(m.user));
    const path = micrositePath(org.slug, s.slug);
    agents.push({
      slug: s.slug, name: c.name, title: c.title, href: path,
      photo: c.photo ? `${path}/photo?v=${version(c.photo)}` : null,
      areas: Object.values(await areaNames(c.areas.slice(0, 3))),
      accent: accentFor(c.accent, org.micrositeAccents),
    });
  }
  return { brokerage: org.name, agents };
}

/**
 * The agent a property page should name when it was opened from their
 * microsite (`?agent=<slug>`): only a live site of the same brokerage.
 */
export async function micrositeContext(orgSlug: string, agentSlug: string | undefined) {
  if (!agentSlug || !/^[a-z0-9-]{3,40}$/.test(agentSlug)) return null;
  const l = await loadLive(orgSlug, agentSlug);
  if (!l) return null;
  const path = micrositePath(l.org.slug, l.site.slug);
  return {
    slug: l.site.slug,
    name: l.content.name,
    firstName: firstName(l.content.name),
    title: l.content.title,
    brn: l.content.brn,
    accent: accentFor(l.content.accent, l.org.micrositeAccents),
    photo: l.content.photo ? `${path}/photo?v=${version(l.content.photo)}` : null,
    whatsapp: await whatsappFor(l.org, l.content),
    phone: l.content.phone,
    path,
    pageUrl: `${appOrigin()}${path}`,
    enquire: `${path}/enquire`,
    event: `${path}/event`,
  };
}

/** Whether a brokerage has any live microsite, for the link to its team page. */
export async function hasTeamPage(orgSlug: string) {
  const t = await micrositeTeam(orgSlug);
  return !!t && t.agents.length > 0;
}
