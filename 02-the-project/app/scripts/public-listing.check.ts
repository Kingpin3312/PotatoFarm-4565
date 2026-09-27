/**
 * The public property page shows one property and nothing else.
 *
 * This route is reached with **no session at all** — a stranger
 * following a link out of a WhatsApp message is the entire point — and
 * it resolves through `crossTenant`, so row-level security is not the
 * backstop it is everywhere else in the product. Everything that keeps
 * one brokerage's inventory out of another's URL is the `where` clause
 * in `publicListing`, which makes it worth asserting rather than
 * arguing about.
 *
 * The withholding cases matter as much as the showing case, and for a
 * legal reason rather than a tidiness one: a Dubai property advertised
 * without a valid Trakheesi permit is a fineable offence for the
 * brokerage, and a public page is advertising in exactly the sense the
 * law means.
 *
 * Every miss must look identical from outside. A page that 404s for an
 * unknown reference but renders differently for one that is sold lets
 * anybody enumerate what a brokerage has taken off the market.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { publicListing, enquiryText, propertyPath } from "../src/server/lib/listings/public";
import { listingsRouter } from "../src/server/api/routers/listings";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

const tag = randomUUID().slice(0, 8);

async function org(name: string) {
  return db.organisation.create({
    data: { name, slug: `pubcheck-${randomUUID().slice(0, 8)}` },
    select: { id: true, slug: true, name: true },
  });
}

async function listing(orgId: string, ref: string, over: Record<string, unknown> = {}) {
  return db.listing.create({
    data: {
      orgId,
      reference: ref,
      title: `${ref} — two bed in Marina Gate`,
      community: "Dubai Marina",
      bedrooms: 2, bathrooms: 2, areaSqft: 1200,
      priceFils: 2_500_000_00n,
      purpose: "SALE",
      status: "AVAILABLE",
      permitNumber: "7654321",
      permitExpiresAt: new Date(Date.now() + 90 * 86_400_000),
      reraBrokerCard: "12345",
      descriptions: { en: "A description long enough to pass.", photos: ["a.jpg"] },
      ...over,
    },
    select: { id: true, reference: true },
  });
}

async function main() {
  console.log("\nPublic property page\n");

  const alpha = await org(`Alpha Public ${tag}`);
  const beta = await org(`Beta Public ${tag}`);

  const live = await listing(alpha.id, `PA-${tag}`);
  const sold = await listing(alpha.id, `PS-${tag}`, { status: "SOLD" });
  const noPermit = await listing(alpha.id, `PN-${tag}`, { permitNumber: null, permitExpiresAt: null });
  const expired = await listing(alpha.id, `PX-${tag}`, {
    permitExpiresAt: new Date(Date.now() - 3 * 86_400_000),
  });
  const removed = await listing(alpha.id, `PD-${tag}`, { deletedAt: new Date() });
  const betaLive = await listing(beta.id, `PB-${tag}`);

  const shown = await publicListing(alpha.slug, live.reference);
  ok("a live, permitted property is shown", shown !== null);
  ok("it carries the brokerage's name", shown?.brokerage === alpha.name);
  ok("it carries the permit, which the advert must display", shown?.permitNumber === "7654321");
  ok("it carries the agent's RERA card", shown?.reraBrokerCard === "12345");
  ok(
    "the enquiry names the reference, so the assistant knows the property",
    enquiryText({ reference: live.reference, title: "x" }).includes(live.reference),
  );

  // ---- everything that must be withheld, all identically ----
  ok("a sold property is withheld", (await publicListing(alpha.slug, sold.reference)) === null);
  ok("a property with no permit is withheld",
     (await publicListing(alpha.slug, noPermit.reference)) === null);
  ok("a property whose permit has expired is withheld",
     (await publicListing(alpha.slug, expired.reference)) === null);
  ok("a deleted property is withheld",
     (await publicListing(alpha.slug, removed.reference)) === null);
  ok("an unknown reference is withheld",
     (await publicListing(alpha.slug, `NOPE-${tag}`)) === null);
  ok("an unknown brokerage is withheld",
     (await publicListing(`no-such-brokerage-${tag}`, live.reference)) === null);

  // ---- the one that would be a breach ----
  ok(
    "another brokerage's property is NOT reachable through this slug",
    (await publicListing(alpha.slug, betaLive.reference)) === null,
    betaLive.reference,
  );
  ok(
    "and this brokerage's property is not reachable through theirs",
    (await publicListing(beta.slug, live.reference)) === null,
  );

  /* ---------------- who looks after it ------------------------------- */
  const agentUser = await db.user.create({ data: { email: `pubcheck-agent-${tag}@example.com`, name: "Layla Agent" } });
  const leaver = await db.user.create({ data: { email: `pubcheck-left-${tag}@example.com`, name: "Gone Agent" } });
  await db.membership.create({ data: { orgId: alpha.id, userId: agentUser.id, role: "AGENT" } });
  await db.listing.update({ where: { id: live.id }, data: { agentId: agentUser.id } });
  ok("the page names the agent who looks after it",
     (await publicListing(alpha.slug, live.reference))?.agent === "Layla Agent");
  const orphan = await listing(alpha.id, `PL-${tag}`, { agentId: leaver.id });
  ok("an agent who has left the brokerage is not advertised",
     (await publicListing(alpha.slug, orphan.reference))?.agent === null);

  /* ---------------- an agent sends it --------------------------------- */
  const caller = listingsRouter.createCaller({
    session: { user: { id: agentUser.id } },
    membership: { orgId: alpha.id, orgName: alpha.name, role: "AGENT" },
    ip: "127.0.0.1", userAgent: "public-listing-check",
  } as never);
  const shared = await caller.share({ id: live.id });
  ok("an agent gets the page's address to send",
     shared.ok && shared.path === propertyPath(alpha.slug, live.reference), shared.ok ? shared.path : shared.reason);
  const refused = await caller.share({ id: noPermit.id });
  ok("a property the page would withhold is refused, with the reason",
     !refused.ok && /permit/i.test(refused.reason), refused.ok ? "offered a link" : refused.reason);
  const soldShare = await caller.share({ id: sold.id });
  ok("a sold property has no page to send", !soldShare.ok);
  let foreign = "";
  try { await caller.share({ id: betaLive.id }); foreign = "shared"; } catch (e) { foreign = (e as { code?: string }).code ?? "error"; }
  ok("another brokerage's property cannot be shared, or even found", foreign === "NOT_FOUND", foreign);

  /* ---------------- what the buyer and WhatsApp see -------------------- */
  const BASE = process.env.APP_BASE ?? "http://localhost:3000";
  const up = await fetch(`${BASE}/sign-in`).then((r) => r.ok).catch(() => false);
  if (!up) {
    ok(`the page itself, over HTTP — needs the app on ${BASE}`, false, "not running");
  } else {
    const res = await fetch(`${BASE}${propertyPath(alpha.slug, live.reference)}`);
    const html = await res.text();
    const masthead = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? "";
    ok("the page opens", res.status === 200, String(res.status));
    ok("under the brokerage's name", masthead.includes(alpha.name));
    ok("and not ours", !masthead.includes("PotatoFarm") && !/<main[\s\S]*PotatoFarm[\s\S]*<\/main>/.test(html));
    ok("its first action is a private viewing, by WhatsApp or not at all",
       html.includes("Arrange a private viewing") || !html.includes("wa.me"));
    const og = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
    const card = og ? await fetch(og.replace(/^https?:\/\/[^/]+/, BASE)) : null;
    ok("WhatsApp gets a preview card image", card?.status === 200 && card.headers.get("content-type") === "image/png",
       og ? `${card?.status} ${card?.headers.get("content-type")}` : "no og:image");
    // A withheld property's card must be the same picture as a property
    // that never existed: nothing about it, not even that it did.
    const route = og ? new URL(og).pathname.split("/").pop()! : "opengraph-image";
    const bytes = async (ref: string) =>
      Buffer.from(await (await fetch(`${BASE}${propertyPath(alpha.slug, ref)}/${route}`)).arrayBuffer()).toString("base64");
    ok("a sold property's card gives nothing away",
       (await bytes(sold.reference)) === (await bytes(`NOPE-${tag}`)));
    ok("and its page is not found", (await fetch(`${BASE}${propertyPath(alpha.slug, sold.reference)}`)).status === 404);
  }

  await db.listing.deleteMany({ where: { orgId: { in: [alpha.id, beta.id] } } });
  await db.auditLog.deleteMany({ where: { orgId: { in: [alpha.id, beta.id] } } }).catch(() => {});
  await db.membership.deleteMany({ where: { orgId: { in: [alpha.id, beta.id] } } });
  await db.user.deleteMany({ where: { id: { in: [agentUser.id, leaver.id] } } });
  await db.organisation.deleteMany({ where: { id: { in: [alpha.id, beta.id] } } });
  await db.$disconnect();

  console.log(
    failures === 0
      ? "\n  one property, the right one, and nothing that must not be advertised.\n"
      : `\n  ${failures} failure(s)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
