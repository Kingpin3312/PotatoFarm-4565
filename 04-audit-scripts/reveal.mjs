/**
 * Nothing on the website stays invisible.
 *
 * ## Why this is worth a check of its own
 *
 * Every page hides its content on load — `.reveal-ready [data-reveal]
 * { opacity: 0 }` — and relies on an IntersectionObserver to bring it
 * back. That is a good pattern with one catastrophic failure mode: if
 * the observer never fires for an element, the words are in the HTML,
 * in the DOM, indexed by search engines, and **unreadable by a human**.
 * No error, no layout shift, nothing in a screenshot to notice.
 *
 * The margins make it plausible rather than theoretical. The observer
 * uses `rootMargin: "0px 0px -12% 0px"`, which shrinks the bottom of the
 * viewport — tighten that further, or add content inside the shrunken
 * band at the very end of a document, and it can never intersect.
 *
 * ## The trap this check fell into first
 *
 * Written naively it reports content as stranded when it is simply
 * mid-fade. The reveal is a 600ms transition behind delays of up to
 * 240ms, so a sample taken too soon catches `opacity: 0.4` and calls it
 * hidden — which is how a working animation nearly got "fixed" on seven
 * pages at once. It waits past both now, and asserts on the class the
 * observer sets as well as on the computed opacity, so a genuine
 * failure is distinguishable from a slow one.
 */
import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

const BASE = process.env.SITE_BASE ?? "http://localhost:8099";
const DIR = process.argv[2] ?? "02-the-project/website";

let failed = 0;
const ok = (what, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed++;
};

const pages = fs.readdirSync(DIR).filter((f) => f.endsWith(".html")).sort();
if (pages.length === 0) {
  console.error("  no pages found — this run proved nothing");
  process.exit(1);
}

const chrome = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await pw.chromium.launch({ executablePath: chrome });

console.log("Reveal\n");
let checked = 0;

for (const file of pages) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${file}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(600);

  const total = await p.evaluate(() => document.querySelectorAll("[data-reveal]").length);
  if (total === 0) { await ctx.close(); continue; }
  checked++;

  // Read it the way a person does, then let the last fade finish.
  const H = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= H; y += 300) {
    await p.evaluate((v) => scrollTo(0, v), y);
    await p.waitForTimeout(110);
  }
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
  // The longest delay in the markup plus the 600ms transition, doubled.
  await p.waitForTimeout(2200);

  const stranded = await p.evaluate(() =>
    [...document.querySelectorAll("[data-reveal]")]
      .filter((e) => !e.classList.contains("is-in"))
      .map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 48))
  );
  const faded = await p.evaluate(() =>
    [...document.querySelectorAll("[data-reveal]")]
      .filter((e) => getComputedStyle(e).opacity !== "1")
      .map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 48))
  );

  ok(`${file} — every element the observer should reach, it reached`,
     stranded.length === 0,
     stranded.length ? `${stranded.length} never got is-in: ${stranded[0]}` : `${total} checked`);
  ok(`${file} — and all of it is actually opaque`,
     faded.length === 0,
     faded.length ? `${faded.length} still faded: ${faded[0]}` : "");

  await ctx.close();
}

ok("pages with revealed content were found", checked > 0, `${checked} of ${pages.length}`);
await b.close();

console.log(failed === 0
  ? "\n  nothing on the site is hidden from a reader.\n"
  : `\n  ${failed} problem(s).\n`);
process.exit(failed === 0 ? 0 : 1);
