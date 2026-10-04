/**
 * Agent microsites, end to end.
 *
 * Over HTTP for everything a stranger touches — the page, its form, its
 * beacon, the property pages opened from it — and through the real router
 * for everything an agent or an admin does. What it proves:
 *
 * - **the lifecycle**: a draft is invisible; publishing makes it public;
 *   editing after that changes nothing public until published again;
 *   approval, take-down and the brokerage switch each have the effect
 *   they claim, and an agent cannot undo an admin;
 * - **what a stranger sees**: only properties the property page's own
 *   gate allows, sold ones without a price, a WhatsApp link to the
 *   number buyers message (never Meta's phone number ID), no private
 *   field, no markup from what an agent typed, and one 404 for every
 *   kind of miss;
 * - **who a lead goes to**: the form and a WhatsApp message carrying the
 *   page's address both reach the agent whose page it was, filed as an
 *   agent-microsite lead — and a buyer another agent already has stays
 *   theirs;
 * - **the numbers**: views and taps are counted from the page's beacon,
 *   link-preview bots and other sites' posts are not, and leads come from
 *   the enquiries themselves;
 * - **who may do what**: an agent edits only their own; a viewer edits
 *   nothing; an admin edits, approves and takes down anyone's, on the
 *   record.
 *
 *     npm run dev
 *     npm run check:microsite
 */
import { PrismaClient } from "@prisma/client";
import { micrositeRouter } from "../src/server/api/routers/microsite";
import { ingest } from "../src/server/lib/ingest";
import type { EditableContent } from "../src/lib/microsite/content";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } } });
const APP = process.env.APP_URL ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
const SLUG = `microsite-check-${RUN}`;
const OTHER = `microsite-check-other-${RUN}`;
const PNID = `pnid-microsite-${RUN}`;
const NUMBER = "+971551230987";
const D = String(Date.now()).slice(-6);
const IP = `10.${(Date.now() >> 16) % 250}.${(Date.now() >> 8) % 250}.${(Date.now() % 250) + 1}`;
const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`);
  if (!p) bad++;
};
const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");

const get = (path: string) => fetch(`${APP}${path}`, { redirect: "manual" });
const page = async (path: string) => { const r = await get(path); return { status: r.status, html: await r.text() }; };
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const cards = (html: string) => [...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1]!);
const beacon = (agent: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${APP}/p/${SLUG}/agents/${agent}/event`, {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "text/plain", "user-agent": BROWSER, "x-forwarded-for": IP, origin: APP, ...headers },
  });
const enquire = (agent: string, fields: Record<string, string>) =>
  fetch(`${APP}/p/${SLUG}/agents/${agent}/enquire`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `${IP.slice(0, -1)}9` },
    body: new URLSearchParams(fields).toString(),
  });
let wamid = 0;
const whatsapp = (from: string, text: string) => ingest({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: PNID },
    contacts: [{ profile: { name: "Buyer" } }],
    messages: [{ id: `wamid.microsite.${RUN}.${++wamid}`, from: from.replace("+", ""), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
  } }] }],
});

async function cleanup() {
  const orgs = await db.organisation.findMany({ where: { slug: { startsWith: "microsite-check-" } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    for (const t of ["notification", "followUp", "aiAction", "micrositeEvent", "enquiry", "message", "conversation", "leadOwnership",
      "commissionSplit", "commission", "deal", "lead", "agentMicrosite", "listing", "channel", "pipelineStage", "assignmentRule",
      "auditLog", "membership"] as const) {
      await (db as any)[t].deleteMany({ where }).catch(() => {});
    }
    await db.organisation.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
  await db.user.deleteMany({ where: { email: { startsWith: "microsite-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nAgent microsites\n");
  const up = await fetch(`${APP}/api/health`).then((r) => r.ok, () => false);
  if (!up) { console.log(`  ✗ no application at ${APP} — start it with npm run dev`); process.exit(1); }
  await cleanup();

  const org = await db.organisation.create({ data: { name: "Creekside Realty", slug: SLUG } });
  const other = await db.organisation.create({ data: { name: "Elsewhere Homes", slug: OTHER } });
  const person = (name: string, role: "AGENT" | "ADMIN" | "VIEWER", orgId = org.id) =>
    db.user.create({ data: { email: `microsite-check-${name.toLowerCase().replace(/\s+/g, ".")}-${RUN}@example.invalid`, name, phone: `+97150${D}1` } })
      .then(async (u) => { await db.membership.create({ data: { orgId, userId: u.id, role } }); return u; });
  const amira = await person("Amira Haddad", "AGENT");
  const ben = await person("Ben Carter", "AGENT");
  const admin = await person("Rania Admin", "ADMIN");
  const viewer = await person("Victor Viewer", "VIEWER");
  const outsider = await person("Olga Outsider", "AGENT", other.id);
  await db.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: PNID, displayNumber: NUMBER } });
  await db.assignmentRule.create({ data: { orgId: org.id, name: "Ben gets the rest", priority: 1, strategy: "SPECIFIC", userIds: [ben.id] } });

  const base = {
    orgId: org.id, community: "Dubai Creek Harbour", bedrooms: 2, bathrooms: 2, priceFils: 310_000_000n, status: "AVAILABLE" as const,
    permitNumber: "7654321", permitExpiresAt: new Date(Date.now() + 90 * 86_400_000), reraBrokerCard: "12345",
    descriptions: { en: "Creek views from every room.", photos: ["01.jpg"] }, propertyType: "APARTMENT" as const,
  };
  await db.listing.createMany({ data: [
    { ...base, reference: "CR-101", title: "Two bed on the creek", purpose: "SALE", agentId: amira.id },
    { ...base, reference: "CR-102", title: "Studio to let", purpose: "RENT", bedrooms: 0, agentId: ben.id },
    { ...base, reference: "CR-103", title: "Unpermitted three bed", purpose: "SALE", permitNumber: null, agentId: amira.id },
    { ...base, reference: "CR-104", title: "Sold penthouse", purpose: "SALE", status: "SOLD", agentId: amira.id, priceFils: 987_650_000n },
    { ...base, reference: "CR-105", title: "Off-plan one bed", purpose: "SALE", completion: "OFF_PLAN", agentId: amira.id },
    // A permit on file but expired: only the publishing rules catch it,
    // not the query's own filters, so it proves the gate itself runs.
    { ...base, reference: "CR-106", title: "Expired permit two bed", purpose: "SALE", agentId: amira.id, permitExpiresAt: new Date(Date.now() - 86_400_000) },
  ] });
  const listing = Object.fromEntries((await db.listing.findMany({ where: { orgId: org.id } })).map((l) => [l.reference, l]));
  const foreign = await db.listing.create({ data: { ...base, orgId: other.id, reference: "EL-1", title: "Not ours", purpose: "SALE" } });
  const area = await db.location.findFirst({ where: { level: "COMMUNITY" }, select: { id: true, name: true } });

  const caller = (userId: string, role: "AGENT" | "ADMIN" | "VIEWER", orgId = org.id) => micrositeRouter.createCaller({
    session: { user: { id: userId } }, membership: { orgId, orgName: "x", role }, ip: "127.0.0.1", userAgent: "microsite-check",
  } as never);
  const A = caller(amira.id, "AGENT");
  const B = caller(ben.id, "AGENT");
  const ADM = caller(admin.id, "ADMIN");
  const asContent = (c: Awaited<ReturnType<typeof A.mine>>["content"]): EditableContent => { const { photo: _p, cover: _c, ...rest } = c; return rest; };

  console.log("=== a new site, from what the CRM knows ===");
  const first = await A.mine();
  ok("made on first visit, as a draft, with the agent's name and contact details",
     first.site.status === "DRAFT" && first.content.name === "Amira Haddad" && first.content.email === amira.email && first.site.slug === "amira-haddad",
     JSON.stringify({ s: first.site.status, slug: first.site.slug }));
  ok("a viewer cannot have one", (await code(caller(viewer.id, "VIEWER").mine())) === "FORBIDDEN");
  ok("a draft is not on the web", (await get(`/p/${SLUG}/agents/amira-haddad`)).status === 404);

  console.log("\n=== what an agent may save ===");
  const c0 = asContent(first.content);
  const good: EditableContent = {
    ...c0, title: "Senior consultant", headline: "Dubai Creek Harbour, bought and sold with care.",
    intro: "I help families find homes on the creek.", bio: "## About me\nTen years here.\n\n- Resale\n- **Off-plan**\n\n<script>alert('x')</script>",
    featured: [listing["CR-101"]!.id, listing["CR-103"]!.id, listing["CR-106"]!.id, listing["CR-102"]!.id], areas: area ? [area.id] : [],
    social: { ...c0.social, instagram: "instagram.com/amira.creek" }, showSold: true, showDeals: true, brn: "45678",
  };
  const badSocial = await A.save({ slug: "amira-haddad", content: { ...good, social: { ...good.social, tiktok: "https://bit.ly/x" } } });
  ok("a social link to anywhere but its network is refused, with the field named", !badSocial.ok && badSocial.field === "social.tiktok");
  const theirs = await A.save({ slug: "amira-haddad", content: { ...good, featured: [foreign.id] } });
  ok("another brokerage's property cannot be featured", !theirs.ok && theirs.field === "featured");
  const own = await A.save({ slug: "amira-haddad", content: { ...good, whatsapp: "OWN", whatsappNumber: "0559876543" } });
  ok("WhatsApp to the agent's own number is refused while the brokerage keeps it on its line", !own.ok && own.field === "whatsapp");
  const reserved = await A.save({ slug: "agents", content: good });
  ok("an address the site itself uses is refused", !reserved.ok && reserved.field === "slug");
  const saved = await A.save({ slug: "amira-haddad", content: good });
  ok("a good draft saves", saved.ok, JSON.stringify(saved));
  ok("and is still not on the web", (await get(`/p/${SLUG}/agents/amira-haddad`)).status === 404);
  await B.mine();
  const taken = await B.save({ slug: "amira-haddad", content: asContent((await B.mine()).content) });
  ok("another agent cannot take the same address", !taken.ok && taken.field === "slug");
  ok("an agent cannot open another agent's site", (await code(B.mine({ userId: amira.id }))) === "FORBIDDEN"
     && (await code(B.save({ userId: amira.id, slug: "amira-haddad", content: good }))) === "FORBIDDEN");

  console.log("\n=== published ===");
  ok("publishing makes it live", (await A.publish()).status === "LIVE");
  const live = await page(`/p/${SLUG}/agents/amira-haddad`);
  ok("the page answers under the brokerage's name, with the agent's own words",
     live.status === 200 && live.html.includes("Creekside Realty") && visible(live.html).includes("Dubai Creek Harbour, bought and sold with care."));
  ok("its title and preview card are '<name> | <brokerage>'",
     live.html.includes("<title>Amira Haddad | Creekside Realty</title>") && /property="og:image" content="[^"]*opengraph-image/.test(live.html));
  ok("only properties the property page itself would show, featured first",
     JSON.stringify(cards(live.html)) === JSON.stringify(["CR-101", "CR-102", "CR-105"]), cards(live.html).join(", "));
  ok("each card leads to the property page as this agent's", live.html.includes(`href="/p/${SLUG}/CR-101?agent=amira-haddad"`));
  ok("an off-plan property says so", /data-card="CR-105"[\s\S]{0,600}Off-plan/.test(live.html));
  const soldText = visible(live.html);
  ok("a sold property is a record, without its price", soldText.includes("Recently sold and let") && soldText.includes("Sold") && !soldText.includes("9,876,500"));
  // Outside Next's own script payloads, the agent's text appears only escaped.
  const markup = live.html.replace(/<script[\s\S]*?<\/script>/gi, "");
  ok("what an agent types is shown as words, never as markup", !markup.includes("<script>alert") && markup.includes("&lt;script&gt;alert("),
     markup.match(/.{0,40}script.{0,10}alert.{0,20}/)?.[0] ?? "");
  ok("WhatsApp opens the number buyers message, never Meta's phone number ID, with the page's address in the message",
     live.html.includes(`wa.me/${NUMBER.slice(1)}?text=`) && !live.html.includes(`wa.me/${PNID}`)
     && decodeURIComponent((live.html.match(/wa\.me\/\d+\?text=([^"]+)/) ?? [])[1] ?? "").includes(`/p/${SLUG}/agents/amira-haddad`),
     [...new Set(live.html.match(/wa\.me\/[^"&]{0,60}/g) ?? [])].slice(0, 2).join(" | "));
  ok("nothing private is on the page — no ids, no other agent, no buyer",
     !live.html.includes(amira.id) && !live.html.includes(ben.email!) && !live.html.includes(listing["CR-101"]!.id) && !live.html.includes(PNID));
  ok("only the networks filled in are shown", live.html.includes("instagram.com/amira.creek") && !/on LinkedIn/.test(live.html));
  ok("an agent with no live site, and an address that never existed, are the same 404",
     (await get(`/p/${SLUG}/agents/ben-carter`)).status === 404 && (await get(`/p/${SLUG}/agents/nobody-${RUN}`)).status === 404);
  ok("no photograph on file is a 404, not somebody else's", (await get(`/p/${SLUG}/agents/amira-haddad/photo`)).status === 404);
  const team = await page(`/p/${SLUG}/agents`);
  ok("the brokerage's team page lists the live site, and only it", team.status === 200 && team.html.includes('data-agent="amira-haddad"') && !team.html.includes('data-agent="ben-carter"'));

  console.log("\n=== edits wait for publishing ===");
  await A.save({ slug: "amira-haddad", content: { ...good, headline: "A brand new headline nobody should see yet." } });
  ok("a saved edit changes nothing public", !visible((await page(`/p/${SLUG}/agents/amira-haddad`)).html).includes("A brand new headline"));
  ok("and the agent is told there are unpublished changes", (await A.mine()).site.unpublishedChanges);
  await A.publish();
  ok("publishing shows it", visible((await page(`/p/${SLUG}/agents/amira-haddad`)).html).includes("A brand new headline"));

  console.log("\n=== a buyer from the page ===");
  const sent = await enquire("amira-haddad", { name: "Sara Buyer", phone: `050${D}11`, message: "Is it still available?", reference: "CR-102", back: `/p/${SLUG}/CR-102` });
  ok("the form sends them back to the property page they were on, still as this agent's",
     sent.status === 303 && (sent.headers.get("location") ?? "").includes(`/p/${SLUG}/CR-102?agent=amira-haddad&sent=1`), sent.headers.get("location") ?? "");
  const sara = await db.lead.findFirst({ where: { orgId: org.id, name: "Sara Buyer" }, include: { enquiries: { include: { channel: true, listing: true } } } });
  ok("they are a lead of the agent whose page it was, not the routing rule's",
     sara?.assignedToId === amira.id && sara.source === "AGENT_MICROSITE", JSON.stringify(sara && { to: sara.assignedToId === amira.id, source: sara.source }));
  const e = sara?.enquiries[0];
  ok("the enquiry carries the microsite, the property and where it came from",
     !!e?.micrositeId && e.listing?.reference === "CR-102" && e.channel.label === "Agent microsites" && e.campaign === "Agent microsite · Amira Haddad",
     JSON.stringify(e && [e.listing?.reference, e.channel.label, e.campaign, !!e.micrositeId]));
  const bensBuyer = await db.lead.create({ data: { orgId: org.id, phone: `+97150${D}22`, name: "Known Buyer", assignedToId: ben.id, status: "NEW" } });
  await enquire("amira-haddad", { name: "Known Buyer", phone: `050${D}22`, back: `/p/${SLUG}/agents/amira-haddad` });
  const known = await db.lead.findUnique({ where: { id: bensBuyer.id }, include: { enquiries: true } });
  ok("a buyer another agent already has stays theirs, with the enquiry on their record",
     known?.assignedToId === ben.id && known.enquiries.length === 1 && !!known.enquiries[0]!.micrositeId);
  ok("an enquiry to a site that is not live goes nowhere", (await enquire("ben-carter", { name: "X", phone: `050${D}33` })).status === 404);

  console.log("\n=== a buyer by WhatsApp ===");
  await whatsapp(`+97155${D}44`, `Hi Amira, I found your page and I'm interested in Two bed on the creek (CR-101).\n${APP}/p/${SLUG}/agents/amira-haddad`);
  const wa = await db.lead.findFirst({ where: { orgId: org.id, phone: `+97155${D}44` }, include: { enquiries: { include: { listing: true } } } });
  ok("a first message carrying the page's address goes to that agent, as a microsite lead",
     wa?.assignedToId === amira.id && wa.source === "AGENT_MICROSITE", JSON.stringify(wa && { to: wa.assignedToId === amira.id, source: wa.source }));
  ok("with the property it names and the microsite on the enquiry",
     wa?.enquiries[0]?.listing?.reference === "CR-101" && !!wa.enquiries[0]?.micrositeId && wa.enquiries[0]?.campaign === "Agent microsite · Amira Haddad, via WhatsApp",
     JSON.stringify(wa?.enquiries.map((x) => [x.listing?.reference, x.campaign, !!x.micrositeId])));
  // A live site at another brokerage, so the only thing standing between
  // its address and this brokerage's routing is the brokerage check.
  const O = caller(outsider.id, "AGENT", other.id);
  await O.mine();
  await O.publish();
  ok("(another brokerage's agent is live)", (await get(`/p/${OTHER}/agents/olga-outsider`)).status === 200);
  await whatsapp(`+97155${D}55`, `Saw this: ${APP}/p/${OTHER}/agents/olga-outsider`);
  const stray = await db.lead.findFirst({ where: { orgId: org.id, phone: `+97155${D}55` } });
  ok("another brokerage's agent's address does not route anything", stray?.assignedToId === ben.id && stray.source !== "AGENT_MICROSITE");

  console.log("\n=== the numbers ===");
  await beacon("amira-haddad", { k: "view" });
  await beacon("amira-haddad", { k: "view" });
  await beacon("amira-haddad", { k: "property", ref: "CR-101" });
  await beacon("amira-haddad", { k: "whatsapp" });
  await beacon("amira-haddad", { k: "view" }, { "user-agent": "WhatsApp/2.23.20.0 A" });
  await beacon("amira-haddad", { k: "view" }, { origin: "https://elsewhere.example" });
  await beacon("amira-haddad", { k: "property", ref: "NOT-A-REF" });
  const stats = await A.stats({ days: 30 });
  ok("views and taps from the page count; a link-preview bot and another site's post do not",
     stats.views === 2 && stats.visitors === 1 && stats.propertyViews === 1 && stats.whatsapp === 1, JSON.stringify(stats));
  ok("leads are the enquiries that came through the site", stats.leads === 3, String(stats.leads));
  ok("the most viewed property is named", stats.topProperties[0]?.reference === "CR-101");
  ok("another agent's numbers are not theirs to read", (await code(B.stats({ userId: amira.id, days: 30 }))) === "FORBIDDEN");

  console.log("\n=== the property page, opened from the site ===");
  const viaPage = await page(`/p/${SLUG}/CR-101?agent=amira-haddad`);
  const viaWa = decodeURIComponent((viaPage.html.match(/wa\.me\/\d+\?text=([^"]+)/) ?? [])[1] ?? "");
  ok("names the agent, sends the form to them and WhatsApp with their page",
     visible(viaPage.html).includes("Shared by Amira Haddad") && viaPage.html.includes(`action="/p/${SLUG}/agents/amira-haddad/enquire"`)
     && viaWa.includes(`/p/${SLUG}/agents/amira-haddad`),
     JSON.stringify({ shared: visible(viaPage.html).includes("Shared by Amira Haddad"), action: viaPage.html.includes(`action="/p/${SLUG}/agents/amira-haddad/enquire"`), wa: viaWa.slice(0, 120) }));
  const notVia = await page(`/p/${SLUG}/CR-101?agent=ben-carter`);
  ok("a parameter naming no live site is ignored", notVia.status === 200 && !visible(notVia.html).includes("Shared by"));

  console.log("\n=== verified figures only ===");
  const deal = await db.deal.create({ data: { orgId: org.id, reference: `D-${RUN}`, type: "SALE", valueFils: 310_000_000n, stage: "COMPLETED", completedAt: new Date(), listingId: listing["CR-104"]!.id } });
  const com = await db.commission.create({ data: { orgId: org.id, dealId: deal.id, rateBp: 200, grossFils: 6_200_000n, vatFils: 0n, netFils: 6_200_000n } });
  await db.commissionSplit.create({ data: { orgId: org.id, commissionId: com.id, userId: amira.id, role: "LISTING_AGENT", shareBp: 5000, amountFils: 3_100_000n } });
  ok("completed transactions are counted from the CRM's deals", visible((await page(`/p/${SLUG}/agents/amira-haddad`)).html).includes("1 transaction"));

  console.log("\n=== the brokerage's control ===");
  const siteId = (await db.agentMicrosite.findFirst({ where: { orgId: org.id, userId: amira.id } }))!.id;
  await ADM.save({ userId: amira.id, slug: "amira-haddad", content: { ...good, bio: "Edited by the brokerage." } });
  ok("an admin can edit an agent's site, on the record",
     (await db.auditLog.count({ where: { orgId: org.id, action: "microsite.edited_by_admin", actorId: admin.id } })) === 1);
  await ADM.disable({ siteId, reason: "Out-of-date licence details." });
  ok("taking a site down takes it off the web at once", (await get(`/p/${SLUG}/agents/amira-haddad`)).status === 404);
  ok("and off the team page", !(await page(`/p/${SLUG}/agents`)).html.includes('data-agent="amira-haddad"'));
  ok("the agent cannot put it back", (await code(A.publish())) === "PRECONDITION_FAILED");
  ok("and is told why", (await A.mine()).site.disabledReason === "Out-of-date licence details.");
  await ADM.enable({ siteId });
  ok("turning it back on leaves it for the agent to publish", (await get(`/p/${SLUG}/agents/amira-haddad`)).status === 404 && (await A.mine()).site.status === "DRAFT");
  await A.publish();

  await ADM.updateSettings({ enabled: true, approval: true, ownWhatsapp: true, accents: ["brand", "pearl"] });
  const bContent = { ...asContent((await B.mine()).content), headline: "Studios and one-beds to let.", accent: "silver" as const };
  const notOffered = await B.save({ slug: "ben-carter", content: bContent });
  ok("a colour the brokerage doesn't offer is refused", !notOffered.ok && notOffered.field === "accent");
  await B.save({ slug: "ben-carter", content: { ...bContent, accent: "pearl", whatsapp: "OWN", whatsappNumber: "0558887766" } });
  ok("with approval on, publishing sends it for approval and nothing goes live",
     (await B.publish()).status === "AWAITING_APPROVAL" && (await get(`/p/${SLUG}/agents/ben-carter`)).status === 404);
  ok("the admin sees it waiting", (await ADM.all()).find((r) => r.userId === ben.id)?.status === "AWAITING_APPROVAL");
  await ADM.approve({ siteId: (await db.agentMicrosite.findFirst({ where: { orgId: org.id, userId: ben.id } }))!.id });
  const bens = await page(`/p/${SLUG}/agents/ben-carter`);
  ok("approving puts it live, with the agent's own WhatsApp now that the brokerage allows it",
     bens.status === 200 && bens.html.includes("wa.me/971558887766"));
  await ADM.updateSettings({ enabled: false, approval: true, ownWhatsapp: true, accents: ["brand"] });
  ok("switching microsites off takes every one down", (await get(`/p/${SLUG}/agents/amira-haddad`)).status === 404 && (await get(`/p/${SLUG}/agents/ben-carter`)).status === 404);
  await ADM.updateSettings({ enabled: true, approval: false, ownWhatsapp: false, accents: ["brand"] });
  ok("an agent cannot change the rules", (await code(A.updateSettings({ enabled: true, approval: false, ownWhatsapp: true, accents: ["brand"] }))) === "FORBIDDEN");
  ok("nor take a colleague's site down", (await code(A.disable({ siteId, reason: "Because." }))) === "FORBIDDEN");
  const bensNow = await page(`/p/${SLUG}/agents/ben-carter`);
  ok("own numbers switched off sends WhatsApp back to the brokerage's line", bensNow.html.includes(`wa.me/${NUMBER.slice(1)}`) && !bensNow.html.includes("wa.me/971558887766"));

  console.log("\n=== sharing ===");
  const qr = await A.qr();
  ok("the QR code is a square code for the site's address",
     qr.url.endsWith(`/p/${SLUG}/agents/amira-haddad`) && qr.rows.length >= 21 && qr.rows.every((r) => r.length === qr.rows.length));
  await db.membership.deleteMany({ where: { orgId: org.id, userId: amira.id } });
  ok("an agent who leaves takes their site with them", (await get(`/p/${SLUG}/agents/amira-haddad`)).status === 404);

  await cleanup();
  await db.$disconnect();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
