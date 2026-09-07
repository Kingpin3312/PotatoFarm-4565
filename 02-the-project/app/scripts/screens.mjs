import fs from "node:fs";
import path from "node:path";
import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * Every screen, opened in a real browser, and what it actually does.
 *
 * The server has had far more exercise than the screens. Two of the
 * worst faults found in this codebase were invisible to every existing
 * check: the "Mine" screen had never rendered for anybody, and the
 * diary was making 162 requests in nine seconds. Neither errored, so
 * nothing looked wrong anywhere.
 *
 * So this opens all of them and records four things a person would
 * notice and a type-check cannot:
 *
 *   1. **Did it render?** Text on the page, and not still a skeleton.
 *   2. **Did it settle?** A screen still firing requests after five
 *      seconds is in a refetch loop, whether or not it rendered.
 *   3. **Did anything throw?** Console errors and page errors.
 *   4. **Did it fail visibly?** An error state an agent would see.
 *
 * Routes are read off the filesystem rather than listed here, so a new
 * screen is covered by existing.
 *
 *     npm run dev
 *     npm run browser:screens
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}

const APP = process.env.APP_URL ?? "http://localhost:3000";
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 6000);

/** Every `page.tsx`, as the URL Next serves it. */
function routes() {
  const out = [];
  const walk = (dir, url) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      // Route groups `(app)` do not appear in the URL.
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

const db = new PrismaClient({ datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}} });
const org = await db.organisation.findFirst({ where:{deletedAt:null}, select:{id:true} });

/** Real ids, so a dynamic route is exercised rather than skipped. */
const [lead, kyc, listing, convo, orgSlug, publicListing] = await Promise.all([
  db.lead.findFirst({ where: { orgId: org.id, deletedAt: null }, select: { id: true } }),
  db.kycRecord.findFirst({ where: { orgId: org.id }, select: { id: true } }),
  db.listing.findFirst({ where: { orgId: org.id, deletedAt: null }, select: { id: true } }),
  db.conversation.findFirst({ where: { orgId: org.id }, select: { id: true } }),
  db.organisation.findFirst({ where: { id: org.id }, select: { slug: true } }),
  /**
   * The public property page needs a listing `publicListing()` will
   * actually return — available, and carrying a permit. Any listing
   * would render the 404 this sweep is meant to distinguish from a
   * broken screen.
   */
  db.listing.findFirst({
    where: { orgId: org.id, deletedAt: null, status: "AVAILABLE", permitNumber: { not: null } },
    select: { reference: true },
  }),
]);

/**
 * Keyed by the token the folder uses, which is why the folders are
 * named after what they hold.
 *
 * `offers/[id]` took a *listing* id, and this map filled it with an
 * offer id — so the screen 404'd and the sweep reported a broken page
 * that was only being handed the wrong thing. Renaming the segment to
 * `[listingId]` made both the route and this map say the same word.
 *
 * A token with no entry is reported, never quietly skipped: an
 * unfillable dynamic route is exactly the kind of screen that rots.
 */
const SUBST = {
  "[leadId]": lead?.id,
  "[kycId]": kyc?.id,
  "[listingId]": listing?.id,
  "[conversationId]": convo?.id,
  // The public property page, which is outside the app shell and
  // reached with no session at all.
  "[slug]": orgSlug?.slug,
  "[reference]": publicListing?.reference,
};

const all = routes();
const targets = [];
const skipped = [];
for (const r of all) {
  if (!r.includes("[")) { targets.push(r); continue; }
  let filled = r;
  let missing = null;
  for (const [token, value] of Object.entries(SUBST)) {
    if (filled.includes(token)) {
      if (!value) { missing = token; break; }
      filled = filled.replace(token, value);
    }
  }
  // Named, never silently dropped: a dynamic route nobody could build a
  // URL for is exactly the kind of screen that rots unnoticed.
  if (missing) {
    // In the map, but the database has no row for it today.
    skipped.push(`${r} (no row to fill ${missing})`);
    continue;
  }
  /**
   * A token the map has never heard of, which is a different fault and
   * used to be silent. `filled` still held `[slug]` and `[reference]`
   * verbatim, so the sweep requested a literal `/p/[slug]/[reference]`,
   * got a 404, and reported the new public property page as a broken
   * screen. It has to come *after* the `missing` branch: checked first
   * it relabels every legitimately unfillable route as an unknown
   * token, which is how it first mislabelled `/compliance/[kycId]`.
   */
  const unknown = filled.match(/\[[^\]]+\]/);
  if (unknown) {
    skipped.push(`${r} (no substitution for ${unknown[0]} — add it to SUBST)`);
    continue;
  }
  targets.push(filled);
}

const b = await pw.chromium.launch({ executablePath: cp() });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);

/**
 * Screens that a different person has to open.
 *
 * This sweep signed in as the owner for every route, and `/compliance`
 * is deliberately closed to owners: telling a client a report was filed
 * is an offence, so the compliance officer's desk is separated from
 * administration by design and by law. Opened as the owner it rendered
 * the refusal — 137 characters and a 403 in the console — and this
 * sweep reported that as a screen worth looking at.
 *
 * It is not a fault, and it is not something to suppress either: a
 * refusal is not an exercise of the screen. **The compliance file was
 * the last screen in the product nobody had ever seen**, skipped for
 * want of a row until one was seeded, and it would have gone straight
 * from never rendering to rendering only its own access denial.
 *
 * So the sweep changes identity for those routes and opens them as the
 * person they belong to. `browser:roles` is what asserts the refusal
 * still happens for everybody else.
 */
const AS = [
  [/^\/compliance(\/|$)/, "dev-session-compliance_officer"],
];
async function contextFor(route) {
  const match = AS.find(([re]) => re.test(route));
  if (!match) return ctx;
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies([...sessionCookies(match[1])]);
  return c;
}

const rows = [];
for (const route of targets) {
  const rc = await contextFor(route);
  const p = await rc.newPage();
  let calls = 0;
  let late = 0;
  let settledAt = null;
  const errors = [];
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
  p.on("pageerror", (e) => errors.push("throw: " + String(e).slice(0, 120)));
  p.on("response", (r) => {
    if (!r.url().includes("/api/trpc/")) return;
    calls++;
    if (settledAt) late++;
  });

  let status = 0;
  try {
    const res = await p.goto(APP + route, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = res?.status() ?? 0;
  } catch (e) {
    errors.push("goto: " + String(e).split("\n")[0].slice(0, 90));
  }

  // Let it do its work, then watch a quiet window for stragglers.
  await p.waitForTimeout(SETTLE_MS);
  settledAt = Date.now();
  await p.waitForTimeout(3000);

  /**
   * Every internal link the screen actually rendered.
   *
   * Collected here rather than grepped out of the source, because the
   * ones that matter are built at runtime — `/listings/${o.listingId}`
   * is a template nobody can check by reading, and it was pointing at a
   * route that does not exist on every row of the offers screen.
   */
  const links = await p.evaluate(() =>
    [...document.querySelectorAll('a[href^="/"]')]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && !h.startsWith("//") && !h.startsWith("/api/"))
  ).catch(() => []);

  const seen = await p.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const text = main.innerText.replace(/\s+/g, " ").trim();
    return {
      chars: text.length,
      busy: !!main.querySelector("[aria-busy]"),
      loading: /loading|working out|checking…/i.test(text.slice(0, 400)),
      errorState: /something went wrong|couldn.t load|try again|failed to/i.test(text),
      url: location.pathname,
    };
  }).catch(() => ({ chars: 0, busy: false, loading: false, errorState: false, url: "?" }));

  /**
   * One retry when a screen looks unrendered, and only then.
   *
   * The dev server compiles a route the first time it is asked for, so
   * the first visit can time out on a screen that is perfectly healthy
   * — `/` reported STILL LOADING on a cold run and renders 676
   * characters when warm. A retry distinguishes "slow to compile once"
   * from "never renders", which is the difference this whole sweep
   * exists to measure.
   *
   * Deliberately not a retry on *every* screen: a check that quietly
   * has two goes at everything hides a screen that is merely slow, and
   * slow is a finding too.
   */
  let result = { route, status, calls, late, ...seen, errors, links };
  if (seen.chars < 40 || seen.busy || seen.loading) {
    await p.goto(APP + route, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(SETTLE_MS);
    const again = await p.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      const text = main.innerText.replace(/\s+/g, " ").trim();
      return {
        chars: text.length,
        busy: !!main.querySelector("[aria-busy]"),
        loading: /loading|working out|checking…/i.test(text.slice(0, 400)),
        errorState: /something went wrong|couldn.t load|try again|failed to/i.test(text),
        url: location.pathname,
      };
    }).catch(() => seen);
    result = { ...result, ...again, retried: true };
  }

  rows.push(result);
  await p.close();
}
// ---- every link those screens rendered ------------------------------
//
// Followed rather than pattern-matched. A link is only dead in the way
// that matters when the server says so.
const linked = new Map();
for (const r of rows) {
  for (const href of r.links ?? []) {
    const clean = href.split("#")[0].split("?")[0];
    if (!clean || clean === "/") continue;
    if (!linked.has(clean)) linked.set(clean, r.route);
  }
}

const dead = [];
{
  const p = await ctx.newPage();
  for (const [href, from] of linked) {
    const res = await p.goto(APP + href, { waitUntil: "domcontentloaded", timeout: 20000 })
      .catch(() => null);
    const code = res?.status() ?? 0;
    if (code >= 400) dead.push({ href, from, code });
  }
  await p.close();
}

await b.close();
await db.$disconnect();

// ---- report ----------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${targets.length} screens opened, ${SETTLE_MS}ms to settle then a 3s quiet window\n`);
console.log(pad("route", 34) + pad("chars", 7) + pad("trpc", 6) + pad("after", 7) + "state");
console.log("─".repeat(78));

const problems = [];
for (const r of rows) {
  const flags = [];
  if (r.status >= 400) flags.push(`HTTP ${r.status}`);
  // `/` redirecting to `/today` is the front door working, not a fault.
  if (r.url !== r.route && r.route !== "/" && !r.url.startsWith(r.route))
    flags.push(`→ ${r.url}`);
  if (r.chars < 40) flags.push("EMPTY");
  if (r.busy || r.loading) flags.push("STILL LOADING");
  // Anything still firing in the quiet window is a refetch loop. One or
  // two can be a legitimate poll; a screen doing it every render is not.
  if (r.late > 3) flags.push(`LOOPING (${r.late} in 3s)`);
  /**
   * Three screens exist to explain a failure — the offline fallback and
   * the two sign-in outcomes — so matching "couldn't load" on them is
   * matching the copy they were written to show. Named, rather than
   * softening the words the check looks for everywhere else.
   */
  const EXPLAINS_A_FAILURE = ["/offline", "/sign-in/check-your-email", "/sign-in/error"];
  if (r.errorState && !EXPLAINS_A_FAILURE.includes(r.route)) flags.push("error shown");
  /**
   * `/compliance` returns 403 to an owner *by design* — reports are
   * invisible to admins and owners, which is the separation the
   * compliance appointment exists to create. The screen handles it
   * properly ("Nothing is broken — your role doesn't include this"), so
   * the browser logging the refused request is noise rather than a
   * finding. Named with its reason rather than filtered by status code,
   * so a 403 anywhere else still shows up.
   */
  const DENIED_BY_DESIGN = r.route === "/compliance";
  const realErrors = DENIED_BY_DESIGN
    ? r.errors.filter((e) => !/403/.test(e))
    : r.errors;
  if (realErrors.length) flags.push(`${realErrors.length} console error(s)`);

  console.log(pad(r.route, 34) + pad(r.chars, 7) + pad(r.calls, 6) + pad(r.late, 7) +
              (flags.length ? flags.join(", ") : r.retried ? "ok (slow first paint)" : "ok"));
  if (flags.length) problems.push({ ...r, flags });
}

console.log(`\n${linked.size} distinct internal link(s) followed`);
if (dead.length) {
  console.log(`${dead.length} of them dead:`);
  for (const d of dead) console.log(`  ${d.code}  ${d.href}   (linked from ${d.from})`);
} else {
  console.log("all resolve.");
}

if (skipped.length) {
  console.log(`\n${skipped.length} not opened:`);
  for (const s of skipped) console.log(`  - ${s}`);
}

console.log(`\n${"─".repeat(78)}`);
if (!problems.length) {
  console.log("every screen rendered and settled.\n");
} else {
  console.log(`${problems.length} screen(s) worth looking at:\n`);
  for (const p of problems) {
    console.log(`  ${p.route}  —  ${p.flags.join(", ")}`);
    for (const e of p.errors.slice(0, 2)) console.log(`      ${e}`);
  }
  console.log("");
}
process.exitCode = problems.length || dead.length ? 1 : 0;
