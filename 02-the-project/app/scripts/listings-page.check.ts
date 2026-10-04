/**
 * A brokerage's own page, and the form on it.
 *
 * Over HTTP against the running application, because the things that
 * matter are what a stranger's browser gets: which properties are shown,
 * that a brokerage with nothing it may advertise looks exactly like one
 * that does not exist, and that a buyer who fills in the form becomes a
 * lead — once per person — while a script that fills in the hidden field
 * becomes nothing and learns nothing.
 *
 *     npm run dev
 *     npm run check:listings-page
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { listingsRouter } from "../src/server/api/routers/listings";
import { PROBLEMS } from "../src/server/lib/listings/enquiry-form";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } } });
const APP = process.env.APP_URL ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
const SLUG = `listings-page-check-${RUN}`;
const EMPTY = `listings-page-empty-${RUN}`;
// The limiter keys on the caller's address; a run of its own, so a
// previous run's enquiries do not count against this one.
// Phones too: the limiter also keys on the phone, so a fixed number would
// be slowed down by the previous run's enquiries.
const D = String(Date.now()).slice(-6);
const ph = (n: number) => `05${n}${D}${n}`;
const e164 = (n: number) => `+9715${n}${D}${n}`;
const IP = `10.${(Date.now() >> 16) % 250}.${(Date.now() >> 8) % 250}.${Date.now() % 250}`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`);
  if (!p) bad++;
};

const get = (path: string) => fetch(`${APP}${path}`, { redirect: "manual" });
const post = (slug: string, fields: Record<string, string>, ip = IP) =>
  fetch(`${APP}/p/${slug}/enquire`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
    body: new URLSearchParams(fields).toString(),
  });
/** What a person sees: the page without its scripts and tags. */
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const cards = (html: string) => [...html.matchAll(/data-card="([^"]+)"/g)].map((m) => m[1]!);

async function cleanup() {
  const orgs = await db.organisation.findMany({ where: { slug: { startsWith: "listings-page-" } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return;
  const where = { orgId: { in: ids } };
  for (const t of ["notification", "followUp", "enquiry", "leadOwnership", "lead", "listing", "channel", "pipelineStage", "assignmentRule", "membership"] as const) {
    await (db as any)[t].deleteMany({ where }).catch(() => {});
  }
  await db.organisation.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await db.user.deleteMany({ where: { email: { startsWith: "listings-page-" } } }).catch(() => {});
}

async function main() {
  console.log("\nA brokerage's own page, and the form on it\n");
  const up = await fetch(`${APP}/api/health`).then((r) => r.ok, () => false);
  if (!up) { console.log(`  ✗ no application at ${APP} — start it with npm run dev`); process.exit(1); }
  await cleanup();

  const org = await db.organisation.create({ data: { name: "Harbour View Homes", slug: SLUG } });
  const empty = await db.organisation.create({ data: { name: "Nothing Yet Realty", slug: EMPTY } });
  const agent = await db.user.create({ data: { email: `listings-page-agent-${RUN}@example.com`, name: "Nadia Agent" } });
  await db.membership.create({ data: { orgId: org.id, userId: agent.id, role: "AGENT" } });
  await db.assignmentRule.create({ data: { orgId: org.id, name: "Nadia", priority: 1, strategy: "SPECIFIC", userIds: [agent.id] } });
  const base = {
    orgId: org.id, community: "Dubai Marina", bedrooms: 2, priceFils: 250_000_000n, status: "AVAILABLE" as const,
    permitNumber: "7654321", permitExpiresAt: new Date(Date.now() + 90 * 86_400_000), reraBrokerCard: "12345",
    descriptions: { en: "Sea views from every room.", photos: ["01.jpg"] },
  };
  await db.listing.createMany({ data: [
    { ...base, reference: "HV-101", title: "Two bed with sea views", purpose: "SALE" },
    { ...base, reference: "HV-102", title: "Studio to let", purpose: "RENT", bedrooms: 0 },
    { ...base, reference: "HV-103", title: "No permit yet", purpose: "SALE", permitNumber: null },
    { ...base, reference: "HV-104", title: "Already sold", purpose: "SALE", status: "SOLD" },
    { ...base, reference: "HV-105", title: "No photo yet", purpose: "SALE", descriptions: { en: "Soon.", photos: [] } },
  ] });
  await db.listing.create({ data: { ...base, orgId: empty.id, reference: "NY-1", title: "Unpermitted", purpose: "SALE", permitNumber: null } });

  console.log("=== what a stranger sees ===");
  const page = await get(`/p/${SLUG}`);
  const html = await page.text();
  ok("the page answers, under the brokerage's name", page.status === 200 && html.includes("Harbour View Homes"), String(page.status));
  ok("listing only what may be advertised", JSON.stringify(cards(html).sort()) === JSON.stringify(["HV-101", "HV-102"]), cards(html).join(", "));
  ok("each card leads to the property's own page", html.includes(`href="/p/${SLUG}/HV-101"`));
  ok("signed 'Powered by' at the foot", html.includes("Powered by"));
  const rent = await (await get(`/p/${SLUG}?for=rent`)).text();
  ok("'To let' shows only what is to let", JSON.stringify(cards(rent)) === JSON.stringify(["HV-102"]), cards(rent).join(", "));
  const none = await get(`/p/${EMPTY}`), missing = await get(`/p/no-such-brokerage-${RUN}`);
  ok("a brokerage with nothing it may advertise is a 404, like one that does not exist",
     none.status === 404 && missing.status === 404, `${none.status} / ${missing.status}`);
  const prop = await (await get(`/p/${SLUG}/HV-101`)).text();
  ok("the property page leads back to the brokerage's page and carries the form",
     prop.includes(`href="/p/${SLUG}"`) && prop.includes(`action="/p/${SLUG}/enquire"`) && prop.includes('name="reference" value="HV-101"'));

  console.log("\n=== a buyer fills in the form ===");
  const r1 = await post(SLUG, { name: "Sara Ahmed", phone: ph(0).replace(/(\d{3})(\d{3})/, "$1 $2 "), message: "Can I see it this week?", reference: "HV-101", back: `/p/${SLUG}/HV-101` });
  ok("they are sent back to the page they were on, thanked", r1.status === 303 && (r1.headers.get("location") ?? "").endsWith(`/p/${SLUG}/HV-101?sent=1#enquire`), `${r1.status} ${r1.headers.get("location")}`);
  const lead = await db.lead.findFirst({ where: { orgId: org.id, phone: e164(0) } });
  ok("they are a lead, from the website, with the brokerage's routing", lead?.source === "WEBSITE" && lead.name === "Sara Ahmed" && lead.assignedToId === agent.id,
     JSON.stringify(lead && { source: lead.source, assigned: lead.assignedToId === agent.id }));
  const e1 = lead ? await db.enquiry.findMany({ where: { leadId: lead.id }, include: { channel: true, listing: true } }) : [];
  ok("on the property they asked about, on 'Your listings page'",
     e1.length === 1 && e1[0]!.listing?.reference === "HV-101" && e1[0]!.channel.label === "Your listings page" && e1[0]!.campaign === "Property page",
     JSON.stringify(e1.map((e) => [e.listing?.reference, e.channel.label, e.campaign])));
  ok("with their words", !!e1[0]?.message?.includes("Can I see it this week?"));
  await post(SLUG, { name: "Sara A.", phone: e164(0), message: "Also anything to rent?", back: `/p/${SLUG}` });
  ok("the same person again is the same lead, with a second enquiry",
     (await db.lead.count({ where: { orgId: org.id, phone: e164(0) } })) === 1 && (await db.enquiry.count({ where: { leadId: lead!.id } })) === 2);
  const unadvertised = await post(SLUG, { name: "Omar", email: "omar@example.com", reference: "HV-103", back: `/p/${SLUG}` });
  const omar = await db.lead.findFirst({ where: { orgId: org.id, email: "omar@example.com" }, include: { enquiries: true } });
  ok("a reference the page does not advertise is not attached", unadvertised.status === 303 && !!omar && omar.enquiries[0]!.listingId === null);

  console.log("\n=== what a script sends ===");
  const leadsBefore = await db.lead.count({ where: { orgId: org.id } });
  const bot = await post(SLUG, { name: "Bot", phone: ph(1), website: "http://spam.example", back: `/p/${SLUG}` });
  ok("a filled hidden field is thanked and recorded as nothing",
     bot.status === 303 && (bot.headers.get("location") ?? "").includes("sent=1") && (await db.lead.count({ where: { orgId: org.id } })) === leadsBefore);
  const nothing = await post(SLUG, { name: "No Contact", back: `/p/${SLUG}` });
  const loc = nothing.headers.get("location") ?? "";
  ok("no way to reply is sent back with what to fix", decodeURIComponent(loc).includes(`problem=${PROBLEMS.CONTACT}`), loc);
  const shown = await (await get(loc.replace(/^https?:\/\/[^/]+/, ""))).text();
  ok("and the page says it", visible(shown).includes(PROBLEMS.CONTACT));
  const forged = await (await get(`/p/${SLUG}?problem=${encodeURIComponent("Send your deposit to 0551234567")}`)).text();
  ok("a crafted message in the address is never shown", !visible(forged).includes("Send your deposit"));
  const away = await post(SLUG, { name: "Away", phone: ph(2), back: "https://evil.example/p/x" });
  const elsewhere = await post(SLUG, { name: "Elsewhere", phone: ph(3), back: `/p/${EMPTY}` });
  ok("the redirect never leaves this brokerage's page",
     new URL(away.headers.get("location")!).pathname === `/p/${SLUG}` && new URL(elsewhere.headers.get("location")!).pathname === `/p/${SLUG}`,
     `${away.headers.get("location")} | ${elsewhere.headers.get("location")}`);
  let last = 0;
  for (let i = 0; i < 3; i++) last = (await post(SLUG, { name: `Flood ${i}`, phone: `054${i}${D}${i}`, back: `/p/${SLUG}` })).status;
  const flood = await post(SLUG, { name: "Flood x", phone: ph(4), back: `/p/${SLUG}` });
  ok("a flood from one address is slowed down, and told so",
     decodeURIComponent(flood.headers.get("location") ?? "").includes(PROBLEMS.BUSY) && !(await db.lead.findFirst({ where: { orgId: org.id, phone: e164(4) } })),
     `${last} ${flood.headers.get("location")}`);
  ok("an enquiry to a brokerage that does not exist goes nowhere", (await post(`no-such-brokerage-${RUN}`, { name: "X", phone: "0551111111" })).status === 404);

  console.log("\n=== the agent's way to it ===");
  const caller = (orgId: string) => listingsRouter.createCaller({
    session: { user: { id: agent.id } }, membership: { orgId, orgName: "x", role: "AGENT" }, ip: "127.0.0.1", userAgent: "listings-page",
  } as never);
  const share = await caller(org.id).sharePage();
  ok("Listings hands the agent their page, with what is on it", share.ok && share.path === `/p/${SLUG}` && share.count === 2, JSON.stringify(share));
  const nope = await caller(empty.id).sharePage();
  ok("and says why there is none, rather than a link that 404s", !nope.ok && /permit and a photo/.test(nope.reason));

  await cleanup();
  await db.$disconnect();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
