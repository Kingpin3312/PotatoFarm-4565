/**
 * Links that resolve and still go nowhere.
 *
 * ## The two `browser:screens` cannot see
 *
 * That check follows every internal link and asserts the destination is
 * not a 404, which is the right first question and misses the two ways
 * a link fails while returning 200:
 *
 * - **A fragment with no target.** `mine.tsx` linked each of an agent's
 *   next four appointments to `/viewings#<id>`. No element carries that
 *   id, and the day view only ever shows today, so a row for Tuesday
 *   had nowhere to land even in principle. The page loaded; nothing
 *   happened.
 * - **A query nothing reads.** Every action on `/today` — the product's
 *   front door — linked to `/leads?open=<id>`, and the leads screen has
 *   no `useSearchParams` at all. You landed on a list of forty-two
 *   leads with no sign of which one you had clicked.
 *
 * Both look correct in review, in the diff, and on a screenshot.
 *
 * The query half is checked against the source rather than the browser:
 * whether a destination consumes a parameter is a fact about its code,
 * and there is no way to ask a rendered page. That is a heuristic and
 * says so — it looks for the parameter name anywhere in the route's
 * own directory, so a screen that reads `open` in any file next to it
 * passes.
 */
import fs from "node:fs";
import path from "node:path";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { countRequests, open } from "./lib/settle.mjs";

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let failed = 0;
const ok = (what, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed++;
};

/** Every screen worth walking. The shell is on all of them. */
const SCREENS = [
  "/today", "/inbox", "/leads", "/pipeline", "/viewings", "/listings",
  "/offers", "/blackbook", "/deals", "/documents", "/commission",
  "/reports", "/team", "/activity", "/search", "/me", "/settings",
];

const b = await pw.chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(sessionCookies("dev-session-token-ask-history"));

console.log("Dead links\n");

/** href -> the screens that offer it. */
const found = new Map();
for (const s of SCREENS) {
  const p = await ctx.newPage();
  await countRequests(p);
  await open(p, s);
  const hrefs = await p.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") || ""));
  for (const h of hrefs) {
    if (!h.startsWith("/")) continue;          // external links are not ours to police
    if (!found.has(h)) found.set(h, []);
    found.get(h).push(s);
  }
  await p.close();
}
ok("the walk found links to check", found.size > 0, `${found.size} distinct`);

// ---- fragments must have something to land on ----------------------
const fragments = [...found.keys()].filter((h) => h.includes("#"));
for (const h of fragments) {
  const [pathname, id] = h.split("#");
  const p = await ctx.newPage();
  await countRequests(p);
  await open(p, pathname);
  const hit = await p.evaluate((i) => !!document.getElementById(i), id);
  ok(`${h} has something to land on`, hit, hit ? "" : `no element with id="${id}"`);
  await p.close();
}
if (fragments.length === 0) console.log("  PASS  no fragment links to verify");

// ---- a query parameter the destination never reads ------------------
//
// Source-level, and deliberately generous: the name has to appear
// nowhere in the destination route's own folder before this complains.
const queries = [...found.keys()].filter((h) => h.includes("?"));
for (const h of queries) {
  const [pathname, qs] = h.split("?");
  const names = [...new URLSearchParams(qs).keys()];
  const dir = path.join(APP, "src/app/(app)", pathname);
  const alt = path.join(APP, "src/app/(public)", pathname);
  const root = fs.existsSync(dir) ? dir : fs.existsSync(alt) ? alt : null;
  if (!root) { ok(`${h} — destination folder found`, false, "no route folder"); continue; }
  const text = fs.readdirSync(root)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  for (const n of names) {
    ok(`${pathname} reads "${n}"`, text.includes(`"${n}"`) || text.includes(`'${n}'`),
       `offered from ${found.get(h).join(", ")}`);
  }
}
if (queries.length === 0) console.log("  PASS  no query links to verify");

await b.close();
console.log(failed === 0
  ? "\n  every internal link lands somewhere that uses it.\n"
  : `\n  ${failed} link(s) that resolve and go nowhere.\n`);
process.exit(failed === 0 ? 0 : 1);
