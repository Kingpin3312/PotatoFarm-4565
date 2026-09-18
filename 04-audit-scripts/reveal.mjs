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
// Resolved, not hardcoded. This file was the third home of the same
// one-machine import — `/opt/node22/lib/node_modules/playwright` — after
// the application's scripts and the six in `website/`. The helper's own
// notes say the fix "stopped at `02-the-project/app/scripts/` and never
// reached the six files here"; it never reached this one either, and
// this is the copy that ran inside `run-all.sh` and so inside the CI
// gate, where neither path exists.
import pw from "../02-the-project/website/_playwright.mjs";

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

/**
 * The same resolution the other ten browser scripts use.
 *
 * What was here named one build of Chromium — `chromium-1194` — inside
 * one directory, so it broke twice over: on any machine without
 * `/opt/pw-browsers`, and on this one the day Playwright's pinned
 * revision moved. Returning `undefined` hands the decision to
 * Playwright, which is the right answer when nothing is installed
 * where we looked: it fails with its own instruction to run
 * `playwright install` rather than with ENOENT on a path nobody
 * recognises.
 */
function chromePath() {
  const explicit = process.env.CHROME_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (fs.existsSync(`${root}/chromium`)) return `${root}/chromium`;
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter((x) => x.startsWith("chromium")).sort().reverse()) {
      const p = `${root}/${d}/chrome-linux/chrome`;
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;   // let Playwright use its own default
}

const b = await pw.chromium.launch({ executablePath: chromePath() });

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
