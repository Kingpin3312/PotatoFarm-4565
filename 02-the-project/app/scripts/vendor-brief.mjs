import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";

/**
 * What an agent sees before ringing an owner.
 *
 * ## Why this suite exists
 *
 * `vendors.brief` has returned `listings` and `lastReportedAt` since it
 * was written, and the component read **neither**. So the screen an
 * agent opens before ringing an owner could not name the property they
 * were ringing about, and did not say when that owner had last been
 * told anything — on a screen whose entire stated purpose is "what to
 * say when you ring them".
 *
 * That is this codebase's own worst habit, running in the opposite
 * direction to the usual case. `reachability.py` catches a field a
 * screen reads that no writer writes. This was a field a procedure
 * returns that no screen reads — the lead-scoring shape, where the gap
 * is on the way out. Two queries ran on every page load to produce
 * data nobody ever saw.
 *
 * The assertions below are all "this reaches the screen", because the
 * data was never the problem.
 *
 *     npm run build && npm run start
 *     npm run browser:vendor-brief
 */
let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const APP = process.env.APP_URL ?? "http://localhost:3000";
const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
if (!org) { console.error("no organisation — run npm run db:seed"); process.exit(1); }

/**
 * An owner with a live offer, chosen rather than taken first.
 *
 * The first vendor in the table had none, so the screen rendered its
 * counts and no offer detail — proving the page loads and nothing about
 * the thing this suite is for. The same mistake the offers screen made
 * when it was handed the first listing in the table.
 */
const withOffer = await db.$queryRawUnsafe(`
  SELECT v.id, v.name, count(o.id) AS offers
  FROM "Vendor" v
  JOIN "Listing" l ON l."vendorId" = v.id
  JOIN "Offer" o ON o."listingId" = l.id
   AND o.status IN ('SUBMITTED','PRESENTED','COUNTERED')
  WHERE v."orgId" = $1
  GROUP BY v.id, v.name
  ORDER BY offers DESC
  LIMIT 1
`, org.id);

if (!withOffer.length) {
  console.error("\nno owner in this brokerage has a live offer, so the offer");
  console.error("assertions below would pass by having nothing to find.\n");
  await db.$disconnect();
  process.exit(1);
}
const vendor = withOffer[0];

const listings = await db.listing.findMany({
  where: { vendorId: vendor.id, deletedAt: null }, select: { reference: true },
});

const b = await pw.chromium.launch({ executablePath: cp() });
const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } });
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

await page.goto(`${APP}/vendors/${vendor.id}`, { waitUntil: "domcontentloaded" });
/**
 * Wait for the data, not the heading — and here the heading *is* the
 * owner's name, which paints from the same query, so waiting on it
 * would be waiting on nothing. A dwell after network quiet, the floor
 * `browser:roles` needed.
 */
await page.waitForTimeout(5000);

const text = (await page.innerText("main").catch(() => "")).replace(/\s+/g, " ");

console.log("\nThe owner's brief\n");
console.log(`  ${vendor.name} — ${vendor.offers} live offer(s), ${listings.length} property(ies)\n`);

console.log("=== it renders at all ===");
ok("nothing threw", errors.length === 0, errors[0] ?? "clean");
ok("the owner is named", text.includes(vendor.name), vendor.name);
// It was a span, so this screen had no heading and no outline.
ok("and the name is the heading, not a styled span",
   (await page.innerText("main h1").catch(() => "")) === vendor.name,
   (await page.innerText("main h1").catch(() => "")) || "no h1 on the screen");

console.log("\n=== the property they are ringing about ===");
{
  const missing = listings.filter((l) => !text.includes(l.reference));
  /**
   * The reference is what an owner says on the phone. Returned by the
   * procedure from the day it was written and rendered by nothing.
   */
  ok("every property of theirs is on the screen", missing.length === 0,
     missing.length ? `missing ${missing.map((l) => l.reference).join(", ")}` : listings.map((l) => l.reference).join(", "));

  const href = await page.getAttribute(`main a[href^="/offers/"]`, "href").catch(() => null);
  ok("and links somewhere an agent can act", !!href, href ?? "the reference is not a link");
}

console.log("\n=== what is actually on the table ===");
{
  // "1 offer" was the whole of it. The first thing an owner asks is how
  // much, and the agent was going to another screen mid-call to find it.
  ok("an amount is shown, not just a count", /AED\s[\d,]{7,}/.test(text),
     (/AED\s[\d,]+/.exec(text) ?? ["no amount anywhere"])[0]);
  // Cash with no conditions beats a higher mortgage nobody has
  // pre-approved, so the agent has to be able to say which it is.
  ok("with the financing beside it, so the ranking can be explained",
     /(cash|mortgage)/i.test(text), /(cash|mortgage)/i.test(text) ? "stated" : "no financing shown");
  ok("and whether it carries conditions", /conditions/i.test(text),
     /conditions/i.test(text) ? "stated" : "not stated");
  /**
   * The label names the ordering, not the contents. An agent repeating
   * the top offer to an owner must know it is the strongest rather than
   * merely the biggest, or the product has invited exactly the mistake
   * `compare()` exists to prevent.
   */
  ok("the ordering is declared as strength, not price",
     /strongest first/i.test(text), /strongest/i.test(text) ? "declared" : "the list is unlabelled");
}

console.log("\n=== when this owner was last told anything ===");
{
  const v = await db.vendor.findUnique({ where: { id: vendor.id }, select: { lastReportedAt: true } });
  /**
   * Returned by the procedure, read by nothing. An agent who does not
   * know what the owner has already heard either repeats last week's
   * update or assumes they know something they do not.
   */
  ok("the screen says so either way",
     v?.lastReportedAt ? /last updated/i.test(text) : /not been sent an update/i.test(text),
     v?.lastReportedAt ? `reported ${v.lastReportedAt.toISOString().slice(0, 10)}` : "never reported");
}

console.log("\n=== and the instruction that is not a preference ===");
{
  const v = await db.vendor.findUnique({ where: { id: vendor.id }, select: { prefers: true } });
  // Ringing an OFFERS_ONLY owner for a chat is the fastest way to lose
  // an instruction, so it has to be on screen above the Call button.
  const expected = { OFFERS_ONLY: /only when there's an offer/i, CALL: /prefers a call/i };
  const re = expected[v?.prefers];
  if (!re) {
    console.log(`  · ${v?.prefers} has no advice line by design`);
  } else {
    ok("their contact preference is stated", re.test(text), v.prefers);
  }
}

await b.close();
await db.$disconnect();

console.log();
if (bad) { console.log(`${bad} PROBLEM(S)\n`); process.exit(1); }
console.log("  an agent can ring this owner without opening another screen.\n");
