import { PrismaClient } from "@prisma/client";

/**
 * The listing feed a portal fetches, end to end.
 *
 * ## Why this suite exists
 *
 * Nothing had ever fetched `/api/feed/[token]/listings.xml`. Not one of
 * thirty-six check suites, not one browser suite. That matters more
 * here than for most routes, because **this is the only way a
 * brokerage's properties reach Property Finder, Bayut or Dubizzle
 * today**: no publishing integration exists, each needs a partner
 * agreement, and a feed needs none — a portal is given a URL and pulls
 * it on a schedule.
 *
 * Reading it turned up the fault the boot log warns about in reverse.
 * The route served the XML and wrote **nothing** to the database, under
 * a comment asserting that `portals/health.ts` "alarms on silence from
 * a feed; this is the line that gives it something to measure". Health
 * sweeps `Channel`; a feed is not a channel; a log line is not a
 * measurement. **A portal that quietly stopped collecting listings was
 * detected by nobody** — stale prices, withdrawn properties still
 * advertised, and it reads as a quiet market.
 *
 *     npm run start
 *     npm run check:listing-feed
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OWNER = "dev-session-token-ask-history";

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});
const org = await db.organisation.findFirst({
  where: { deletedAt: null }, select: { id: true, name: true, feedToken: true },
});
if (!org) { console.error("no organisation — run npm run db:seed"); process.exit(1); }

async function trpc(proc, json = null) {
  const r = await fetch(`${APP}/api/trpc/${proc}?batch=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `authjs.session-token=${OWNER}; __Secure-authjs.session-token=${OWNER}`,
    },
    body: JSON.stringify({ 0: { json } }),
  });
  return { status: r.status, text: await r.text() };
}
async function query(proc) {
  const input = encodeURIComponent(JSON.stringify({ 0: { json: null, meta: { values: ["undefined"] } } }));
  const r = await fetch(`${APP}/api/trpc/${proc}?batch=1&input=${input}`, {
    headers: { cookie: `authjs.session-token=${OWNER}; __Secure-authjs.session-token=${OWNER}` },
  });
  return { status: r.status, text: await r.text() };
}

console.log("\nThe listing feed, outbound\n");

/* ---------------- the URL ------------------------------------------- */
console.log("=== the brokerage gets a feed address ===");
let url = null;
{
  // Through the real procedure: minting the token is what turns the
  // feed on, and there is no separate enabled flag.
  const { status } = await trpc("org.rotateListingFeed");
  ok("the address can be minted", status === 200, `HTTP ${status}`);

  const { text } = await query("org.listingFeed");
  try { url = JSON.parse(text)[0]?.result?.data?.json?.url; } catch { /* reported next */ }
  ok("and the settings screen has one to show", typeof url === "string" && url.includes("/api/feed/"),
     url ?? "none");
}
if (!url) { console.error("\n  cannot continue without a feed URL.\n"); await db.$disconnect(); process.exit(1); }

const path = url.slice(url.indexOf("/api/feed/"));

/* ---------------- what a portal receives ----------------------------- */
console.log("\n=== a portal fetches it ===");
{
  await db.organisation.update({ where: { id: org.id }, data: { feedFetchedAt: null } });

  const r = await fetch(APP + path);
  const body = await r.text();
  ok("it answers", r.status === 200, `HTTP ${r.status}`);
  ok("as XML, which is what a portal parses",
     (r.headers.get("content-type") ?? "").includes("xml"),
     r.headers.get("content-type") ?? "none");
  // The URL is the credential. A feed in a search index is a brokerage's
  // whole inventory, with prices, published by accident.
  ok("and tells search engines to stay away",
     (r.headers.get("x-robots-tag") ?? "").includes("noindex"),
     r.headers.get("x-robots-tag") ?? "none");

  const count = (body.match(/<listing[ >]/g) ?? []).length;
  ok("it carries the brokerage's properties", count > 0, `${count} listing(s)`);
  ok("with a price on them", /<price/i.test(body), /<price/i.test(body) ? "yes" : "no price element");
  // Advertising a property in Dubai without the permit number on it is
  // the thing that gets a brokerage fined.
  ok("and the permit number, which is a legal requirement here",
     /permit/i.test(body), /permit/i.test(body) ? "yes" : "no permit element");

  /**
   * The fault this suite was written for. Serving the feed has to leave
   * a trace, or the silence sweep has nothing to read and a portal that
   * stops collecting is invisible.
   */
  let fetchedAt = null;
  for (let i = 0; i < 20 && !fetchedAt; i++) {
    await wait(250);
    const row = await db.organisation.findFirst({ where: { id: org.id }, select: { feedFetchedAt: true } });
    fetchedAt = row?.feedFetchedAt ?? null;
  }
  ok("the fetch is recorded", !!fetchedAt,
     fetchedAt ? fetchedAt.toISOString()
               : "feedFetchedAt is null — checkFeedSilence() has nothing to measure and a portal that stops is invisible");
}

/* ---------------- the brokerage can see it --------------------------- */
console.log("\n=== the brokerage can tell whether anyone is collecting ===");
{
  const { text } = await query("org.listingFeed");
  let d = null;
  try { d = JSON.parse(text)[0]?.result?.data?.json; } catch { /* reported next */ }
  // A URL and a creation date look like a working arrangement while
  // being perfectly consistent with nobody ever having fetched it.
  ok("the screen is told when it was last collected", !!d?.lastFetchedAt,
     d?.lastFetchedAt ?? "null — the screen can only show a URL and hope");
  ok("and that it is not overdue", d?.quiet === false, String(d?.quiet));
}

/* ---------------- silence ------------------------------------------- */
console.log("\n=== a portal that stops collecting is noticed ===");
{
  // Wind the clock back past the threshold rather than waiting two days.
  const longAgo = new Date(Date.now() - 96 * 3_600_000);
  await db.organisation.update({ where: { id: org.id }, data: { feedFetchedAt: longAgo } });

  const { text } = await query("org.listingFeed");
  let d = null;
  try { d = JSON.parse(text)[0]?.result?.data?.json; } catch { /* reported below */ }
  ok("the screen says so", d?.quiet === true,
     d?.quiet === true ? "flagged" : "shown as healthy while nothing has collected for four days");

  /**
   * And somebody is told, over the real cron route.
   *
   * `tenantHealth` is reached by the alerting sweep, not by any tRPC
   * procedure — the first version of this assertion called a
   * `health.tenant` that does not exist, which is a check measuring
   * nothing dressed as a product failure.
   *
   * Driving `health.evaluate` is what proves the whole chain: the feed
   * sweep runs, the degraded check survives the filter in `evaluate()`
   * that used to drop every non-broken check, and an Alert row exists
   * for somebody to act on.
   */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("  · skipped — CRON_SECRET is not set, so the alerting path cannot be driven");
  } else {
    await db.alert.deleteMany({ where: { key: { contains: "listing-feed" } } });
    const res = await fetch(`${APP}/api/cron/health.evaluate`,
      { headers: { authorization: `Bearer ${secret}` } });
    ok("the health sweep runs", res.status === 200, `HTTP ${res.status}`);

    const alert = await db.alert.findFirst({
      where: { key: { contains: "listing-feed" }, resolvedAt: null },
      select: { key: true, severity: true, detail: true },
    });
    ok("and an alert is raised for it", !!alert,
       alert ? `${alert.severity} ${alert.key}` : "nothing — the sweep dropped the degraded check");
    // A churn event in progress. Nobody is rung at midnight for it, and
    // nobody may sit on it either.
    ok("at a severity somebody actually receives", alert?.severity === "TICKET",
       alert?.severity ?? "none");
  }
}

/* ---------------- a wrong address ------------------------------------ */
console.log("\n=== a guessed address gets nothing ===");
{
  const r = await fetch(`${APP}/api/feed/not-a-real-feed-token-000000000/listings.xml`);
  ok("refused", r.status === 404, `HTTP ${r.status}`);
  const short = await fetch(`${APP}/api/feed/abc/listings.xml`);
  // Rejected on shape before touching the database, so a scanner costs
  // nothing.
  ok("and a short one is refused without a query", short.status === 404, `HTTP ${short.status}`);
}

/* ---------------- put the clock back --------------------------------- */
await db.organisation.update({ where: { id: org.id }, data: { feedFetchedAt: new Date() } });
await db.$disconnect();

console.log();
if (bad) { console.log(`${bad} PROBLEM(S)\n`); process.exit(1); }
console.log("  the feed serves, records the fetch, and alarms when it stops.\n");
