import fs from "node:fs";
import path from "node:path";
import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";

/**
 * Every screen, photographed.
 *
 * `browser:screens` already opens all of them and asserts they render,
 * settle and throw nothing. This does the same walk and keeps the
 * picture — because the question it answers is not "does it work" but
 * "would an agent want to work in it", and that one cannot be asserted.
 * It is asked by putting the screens in front of the people who would
 * use them.
 *
 *     npm run start           # a production build, not the dev server
 *     npm run browser:gallery
 *
 * Output goes outside the repository by default. These are large binary
 * files that change every time anything moves, and a screenshot
 * committed next to the code it pictures is stale within a week.
 *
 * Two deliberate choices about *when* the shutter fires, both taken
 * from the lesson in CLAUDE.md that cost this project three
 * disagreeing runs of `browser:roles`:
 *
 *   - Waiting for the `h1` is not enough. On `/leads` the heading *is*
 *     the lead count, and it paints while the list is still in flight —
 *     so a screenshot taken then is a photograph of an empty table.
 *   - Waiting for network quiet alone is not enough either. The shell's
 *     own queries satisfy "a request has been made" and finish early,
 *     leaving a quiet window before the screen's real query is issued.
 *
 * So: count in-flight requests from before the page's own scripts run,
 * and require quiet *and* a minimum dwell.
 */

const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.env.GALLERY_OUT ?? "/tmp/potatofarm-gallery";
const DWELL_MS = Number(process.env.GALLERY_DWELL ?? 2500);
const MAX_WAIT_MS = Number(process.env.GALLERY_MAX_WAIT ?? 25000);

/** Every `page.tsx`, as the URL Next serves it. Read off disk, so a new screen is covered by existing. */
function routes() {
  const out = [];
  const walk = (dir, url) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const seg = e.name.startsWith("(") && e.name.endsWith(")") ? "" : `/${e.name}`;
      const next = path.join(dir, e.name);
      if (fs.existsSync(path.join(next, "page.tsx"))) out.push((url + seg) || "/");
      walk(next, url + seg);
    }
  };
  if (fs.existsSync("src/app/page.tsx")) out.push("/");
  walk("src/app", "");
  return [...new Set(out)].sort();
}

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED } } });
const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } });
if (!org) { console.error("no brokerage in the database — run npm run db:seed"); process.exit(1); }

const [lead, kyc, listing, convo, orgRow, publicListing, vendor] = await Promise.all([
  db.lead.findFirst({ where: { orgId: org.id, deletedAt: null }, select: { id: true } }),
  db.kycRecord.findFirst({ where: { orgId: org.id }, select: { id: true } }),
  /**
   * A property somebody has actually bid on.
   *
   * `[listingId]` fills `/offers/[listingId]`, and the first listing in
   * the table had no offers — so the screen that exists to show a
   * negotiation rendered "0 offers". True, and useless: it proves the
   * route resolves and shows nothing of what the screen is for.
   * `browser:screens` is right not to care; a gallery has to.
   */
  db.offer.findFirst({ where: { orgId: org.id }, select: { listingId: true } }),
  // The fullest thread, not the first one. A conversation screen shot
  // with two messages in it says nothing about what the inbox is like.
  db.conversation.findFirst({
    where: { orgId: org.id }, select: { id: true },
    orderBy: { messages: { _count: "desc" } },
  }),
  db.organisation.findFirst({ where: { id: org.id }, select: { slug: true } }),
  db.listing.findFirst({
    where: { orgId: org.id, deletedAt: null, status: "AVAILABLE", permitNumber: { not: null } },
    select: { reference: true },
  }),
  db.vendor.findFirst({ where: { orgId: org.id }, select: { id: true } }),
]);

const SUBST = {
  "[leadId]": lead?.id,
  "[kycId]": kyc?.id,
  "[listingId]": listing?.listingId,
  "[conversationId]": convo?.id,
  "[slug]": orgRow?.slug,
  "[reference]": publicListing?.reference,
  // The seller side. Left out of the first run, so the one screen an
  // owner's agent lives on was missing from a gallery built to show
  // agents the product.
  "[vendorId]": vendor?.id,
};

const targets = [];
const skipped = [];
for (const r of routes()) {
  if (!r.includes("[")) { targets.push(r); continue; }
  let filled = r, missing = null;
  for (const [token, value] of Object.entries(SUBST)) {
    if (filled.includes(token)) {
      if (!value) { missing = token; break; }
      filled = filled.replace(token, value);
    }
  }
  if (missing) { skipped.push(`${r} (no row to fill ${missing})`); continue; }
  if (filled.includes("[")) { skipped.push(`${r} (no substitution known)`); continue; }
  targets.push(filled);
}

/**
 * Screens that belong to somebody else.
 *
 * The compliance desk refuses an owner by design, and a photograph of
 * an access denial tells an agent nothing about the screen behind it.
 * Opened as the person it belongs to instead. `browser:roles` is what
 * asserts everybody else is still refused.
 */
const AS = [[/^\/compliance(\/|$)/, "dev-session-compliance_officer"]];
const OWNER = "dev-session-token-ask-history";

/** Reached with no session at all — it is the page a buyer sees. */
const PUBLIC = [/^\/p\//, /^\/sign-in/, /^\/offline/];

const slug = (r) => (r === "/" ? "home" : r.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-")).slice(0, 80);

const b = await pw.chromium.launch({ executablePath: cp(), args: ["--force-color-profile=srgb"] });

/**
 * What a person sees when they open the screen, not the whole document.
 *
 * Full-page was the first choice and it was wrong for this purpose.
 * `/inbox` is a two-pane layout with its own internal scroll, so a
 * full-page capture stretched the list to six thousand pixels and put
 * the reading pane in a tall empty column — a true picture of the DOM
 * and a false one of the product. The question this gallery is for is
 * "would I want to work in this", and that is answered at the size the
 * screen is actually used at.
 *
 * GALLERY_FULL=1 restores whole-document capture for a list somebody
 * wants to see end to end.
 */
const FULL = process.env.GALLERY_FULL === "1";
const VIEWS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, scale: 2, full: FULL },
  { name: "mobile", viewport: { width: 390, height: 844 }, scale: 2, full: FULL, mobile: true },
];

for (const v of VIEWS) fs.mkdirSync(path.join(OUT, v.name), { recursive: true });

/**
 * Settle, then hold still — and prove something happened first.
 *
 * The first version waited for zero in-flight requests plus a dwell,
 * and photographed `/settings/billing` as a bare skeleton. Nothing was
 * wrong with the screen: `billing.status` answers `{subscribed:false}`
 * in milliseconds. The wait was wrong. **Zero requests ever made is
 * indistinguishable from every request finished** — before the page's
 * own scripts hydrate, the counter reads 0, so the quiet window opened
 * immediately and the shutter fired on the loading state.
 *
 * That is the lesson in CLAUDE.md about `browser:type` arriving in a
 * new costume: a page waiting on a query sits perfectly still. So
 * quiet is necessary and not sufficient. Three conditions now, and the
 * third is the one that would have caught it:
 *
 *   1. nothing in flight, for a minimum dwell;
 *   2. at least one request actually observed;
 *   3. no `[aria-busy]` left in the document, which is what every
 *      skeleton in this codebase marks itself with.
 */
async function settle(p) {
  const started = Date.now();
  let quietSince = null;
  for (;;) {
    const st = await p.evaluate(() => ({
      inflight: window.__inflight ?? 0,
      seen: window.__seen ?? 0,
      busy: !!document.querySelector("[aria-busy]"),
    })).catch(() => ({ inflight: 0, seen: 0, busy: false }));

    if (st.inflight === 0 && !st.busy) quietSince ??= Date.now();
    else quietSince = null;

    /**
     * `seen === 0` is reported, not waited on.
     *
     * Several screens here legitimately fetch nothing — `/sign-in`,
     * `/offline`, the error pages. Blocking on a request that is never
     * coming would spend the full timeout on each of them and then
     * call a perfectly good page suspicious. So the absence is noted
     * beside the picture and the shutter still fires.
     */
    if (quietSince && Date.now() - quietSince >= DWELL_MS) {
      return st.seen === 0 ? "note: fetched nothing — expected on a static page" : "";
    }
    if (Date.now() - started > MAX_WAIT_MS) {
      // Named, never silently shipped. A gallery is shown to people,
      // and a screenshot of a spinner is worse than a missing one.
      return st.busy ? "still showing a skeleton" : "never went quiet";
    }
    await p.waitForTimeout(250);
  }
}

const shots = [];
for (const v of VIEWS) {
  const contexts = new Map();
  const ctxFor = async (token) => {
    const key = token ?? "anon";
    if (contexts.has(key)) return contexts.get(key);
    const c = await b.newContext({
      viewport: v.viewport,
      deviceScaleFactor: v.scale,
      isMobile: !!v.mobile,
      hasTouch: !!v.mobile,
      reducedMotion: "reduce",
      locale: "en-GB",
      timezoneId: "Asia/Dubai",
    });
    // Before the page's own scripts run. Wrapping `fetch` afterwards
    // misses the very requests being waited for.
    await c.addInitScript(() => {
      window.__inflight = 0;
      window.__seen = 0;
      const f = window.fetch;
      window.fetch = function (...a) {
        window.__inflight++;
        window.__seen++;
        return f.apply(this, a).finally(() => { window.__inflight--; });
      };
    });
    if (token) await c.addCookies([...sessionCookies(token)]);
    contexts.set(key, c);
    return c;
  };

  for (const route of targets) {
    const anon = PUBLIC.some((re) => re.test(route));
    const as = anon ? null : (AS.find(([re]) => re.test(route))?.[1] ?? OWNER);
    const p = await (await ctxFor(as)).newPage();
    let status = 0, note = "";
    try {
      const res = await p.goto(APP + route, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = res?.status() ?? 0;
    } catch (e) { note = "goto: " + String(e).split("\n")[0].slice(0, 70); }

    const why = await settle(p);
    if (why) note = note || why;

    // Nothing blinking, and no text caret in the picture.
    await p.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}` })
      .catch(() => {});

    const title = await p.evaluate(() => {
      const h = document.querySelector("main h1, h1");
      const main = document.querySelector("main") ?? document.body;
      return { h1: h?.innerText?.trim()?.slice(0, 90) ?? "", chars: main.innerText.replace(/\s+/g, " ").trim().length };
    }).catch(() => ({ h1: "", chars: 0 }));

    const file = path.join(OUT, v.name, `${slug(route)}.png`);
    await p.screenshot({ path: file, fullPage: v.full }).catch((e) => { note = "shot: " + String(e).slice(0, 60); });
    await p.close();

    const kb = fs.existsSync(file) ? Math.round(fs.statSync(file).size / 1024) : 0;
    shots.push({ view: v.name, route, file, status, h1: title.h1, chars: title.chars, note });
    const flag = note ? `  ⚠ ${note}` : title.chars < 120 ? "  ⚠ almost nothing on the page" : "";
    console.log(`  ${v.name.padEnd(7)} ${route.padEnd(46).slice(0, 46)} ${String(kb).padStart(5)}kB  ${title.h1.slice(0, 34)}${flag}`);
  }
  for (const c of contexts.values()) await c.close();
}

await b.close();
await db.$disconnect();

fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ org: org.name, at: new Date().toISOString(), shots, skipped }, null, 2));

const thin = shots.filter((s) => s.chars < 120 || s.note);
console.log(`\n  ${shots.length} screenshots in ${OUT}`);
if (skipped.length) { console.log(`  ${skipped.length} route(s) not photographed:`); for (const s of skipped) console.log(`    - ${s}`); }
if (thin.length) {
  // Reported rather than quietly shipped. A gallery is a sales
  // document, and a blank screen in it is worse than a missing one.
  console.log(`  ${thin.length} worth looking at before showing anybody:`);
  for (const s of thin) console.log(`    - ${s.view} ${s.route} ${s.note || `${s.chars} chars`}`);
}
