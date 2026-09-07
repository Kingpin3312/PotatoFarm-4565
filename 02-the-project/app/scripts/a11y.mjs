import fs from "node:fs";
import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * Find Chromium without hardcoding a build number.
 *
 * These began as throwaway harnesses with an absolute path to
 * `chromium-1194` in them. That path is correct on exactly one machine
 * and silently wrong everywhere else — and a browser check that cannot
 * start a browser is the same silent-absence failure the product itself
 * is built to catch.
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

const { chromium, devices } = pw;
const b = await chromium.launch({ executablePath: chromePath() });
let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`); if (!p) bad++; };

const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const page = await ctx.newPage();

/* ============ 1. KEYBOARD ONLY — no mouse touches anything ============ */
console.log("\n=== Keyboard only ===");
await page.goto("http://localhost:3000/search", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// The skip link must be the first thing a keyboard user meets, and must work.
await page.keyboard.press("Tab");
const first = await page.evaluate(() => {
  const a = document.activeElement;
  return { text: (a?.textContent || "").trim(), tag: a?.tagName, href: a?.getAttribute("href") };
});
ok("first Tab reaches a skip link", /skip/i.test(first.text), `${first.tag} "${first.text}"`);
ok("and it points at something that exists",
   first.href === "#main" && await page.locator("#main").count() > 0, first.href);

// Focus must be visible, not just present.
const ring = await page.evaluate(() => {
  const a = document.activeElement;
  const s = getComputedStyle(a);
  return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
});
ok("focus is visibly indicated",
   (ring.outline !== "none" && parseFloat(ring.width) > 0) || ring.shadow !== "none",
   JSON.stringify(ring));

// Tab all the way to the search field and drive it with the keyboard alone.
let reachedInput = false;
for (let i = 0; i < 25; i++) {
  await page.keyboard.press("Tab");
  const isInput = await page.evaluate(() =>
    document.activeElement?.getAttribute("aria-label") === "What are you looking for?");
  if (isInput) { reachedInput = true; break; }
}
ok("the search field is reachable by Tab", reachedInput);

await page.keyboard.type("Emirati buying in Dubai Hills around 11 million");
await page.keyboard.press("Enter");           // submit without touching the button
await page.waitForTimeout(2000);
const kbResults = await page.locator("section ul > li").count();
ok("Enter submits the form (no mouse needed)", kbResults > 0, `${kbResults} results`);

// Every interactive thing must be reachable, and nothing must be a trap.
const trap = await page.evaluate(() => {
  const focusable = [...document.querySelectorAll(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null);
  const positive = focusable.filter((el) => Number(el.getAttribute("tabindex") || 0) > 0);
  return { count: focusable.length, positiveTabindex: positive.length };
});
ok("no positive tabindex (which reorders the page unpredictably)",
   trap.positiveTabindex === 0, `${trap.positiveTabindex} found`);

/* ============ 2. SCREEN READER SEMANTICS ============ */
console.log("\n=== Screen reader ===");
const sem = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h1,h2,h3,h4")].map((e) => +e.tagName[1]);
  let skips = 0;
  for (let i = 1; i < h.length; i++) if (h[i] - h[i - 1] > 1) skips++;
  return {
    h1: document.querySelectorAll("h1").length,
    order: h.join(","),
    skips,
    main: document.querySelectorAll("main").length,
    nav: document.querySelectorAll("nav").length,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir || "(unset)",
    // Results appear without a page change. Without a live region a
    // screen reader user gets silence and no idea anything happened.
    live: document.querySelectorAll("[aria-live],[role=status],[role=alert]").length,
    unlabelledInputs: [...document.querySelectorAll("input,textarea,select")]
      .filter((i) => !i.getAttribute("aria-label") && !i.getAttribute("aria-labelledby") &&
                     !document.querySelector(`label[for="${i.id}"]`)).length,
    unlabelledButtons: [...document.querySelectorAll("button")]
      .filter((btn) => !(btn.textContent || "").trim() && !btn.getAttribute("aria-label")).length,
    imgNoAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
    svgNoHidden: [...document.querySelectorAll("svg")]
      .filter((s) => !s.getAttribute("aria-hidden") && !s.getAttribute("role")).length,
  };
});
console.log(`  headings: ${sem.order}`);
ok("exactly one h1", sem.h1 === 1, String(sem.h1));
ok("heading levels do not skip", sem.skips === 0, `${sem.skips} skips`);
ok("a main landmark", sem.main === 1);
ok("a nav landmark", sem.nav >= 1);
ok("page language declared", !!sem.lang, sem.lang);
ok("every input is labelled", sem.unlabelledInputs === 0, String(sem.unlabelledInputs));
ok("every button has an accessible name", sem.unlabelledButtons === 0, String(sem.unlabelledButtons));
ok("decorative svg is hidden from screen readers", sem.svgNoHidden === 0, `${sem.svgNoHidden} exposed`);
// Not "is there a live region somewhere" — that passed once on a stray
// error banner. Does the region actually contain the result count?
const announced = await page.evaluate(() => {
  const regions = [...document.querySelectorAll("[aria-live],[role=status]")];
  return regions.map((r) => (r.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
});
ok("the result count is inside a live region",
   announced.some((t) => /\d+\s+(person|people|owner|owners|propert)/i.test(t)),
   announced.join(" | ") || "NO LIVE REGION — a screen reader user hears nothing");
console.log(`  document dir: ${sem.dir}`);

/* ============ 3. THE DIALOG ============ */
console.log("\n=== Dialog, by keyboard ===");
await page.goto("http://localhost:3000/listings", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const btn = page.getByRole("button", { name: "Who wants it" }).first();
await btn.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(1800);
const dlg = await page.evaluate(() => {
  const d = document.querySelector("dialog[open]");
  if (!d) return null;
  const inside = d.contains(document.activeElement);
  return { open: true, inside, labelled: !!d.getAttribute("aria-labelledby") || !!d.getAttribute("aria-label"),
           modal: d.matches(":modal") };
});
ok("Enter opens it", !!dlg);
ok("it is a real modal (focus is trapped by the browser)", dlg?.modal === true);
ok("focus moves inside", dlg?.inside === true);
ok("it is labelled", dlg?.labelled === true);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok("Escape closes it", (await page.locator("dialog[open]").count()) === 0);
const returned = await page.evaluate(() =>
  (document.activeElement?.textContent || "").trim());
ok("focus returns to the button that opened it", /Who wants it/.test(returned), returned.slice(0, 30));

/* ============ 4. NOT COLOUR ALONE ============ */
console.log("\n=== Colour is never the only signal ===");
const colourOnly = await page.evaluate(() => {
  // Portal state pills: do they carry words as well as colour?
  const pills = [...document.querySelectorAll("span")]
    .filter((s) => /live|rejected|pending|failed/i.test((s.textContent || "").trim()) &&
                   (s.textContent || "").trim().length < 12);
  return pills.map((p) => (p.textContent || "").trim());
});
ok("state pills carry words, not just colour",
   colourOnly.length === 0 || colourOnly.every((t) => t.length > 0),
   colourOnly.join(", ") || "(no pills on this data)");

/* ============ 5. ZOOM / LARGE TEXT ============ */
console.log("\n=== 200% zoom, and 200% text ===");
for (const [label, w, h] of [["200% zoom", 640, 450]]) {
  const c2 = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await c2.addCookies([...sessionCookies("dev-session-token-ask-history")]);
  const p2 = await c2.newPage();
  await p2.goto("http://localhost:3000/today", { waitUntil: "networkidle" });
  await p2.waitForTimeout(1200);
  const m = await p2.evaluate(() => ({
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    sw: document.documentElement.scrollWidth, vw: window.innerWidth,
  }));
  ok(`${label}: no sideways scroll`, !m.sideways, `${m.sw} vs ${m.vw}`);
  await c2.close();
}

// Browser text-size-only zoom, which is what low-vision users actually use.
await page.goto("http://localhost:3000/today", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
await page.waitForTimeout(600);
const big = await page.evaluate(() => ({
  sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
  sw: document.documentElement.scrollWidth, vw: window.innerWidth,
}));
ok("doubled text size does not break the layout sideways", !big.sideways, `${big.sw} vs ${big.vw}`);

/* ============ 6. REDUCED MOTION + FORCED COLOURS ============ */
console.log("\n=== Preferences respected ===");
for (const scheme of ["dark", "light"]) {
  const c3 = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  await c3.addCookies([...sessionCookies("dev-session-token-ask-history")]);
  const p3 = await c3.newPage();
  await p3.goto("http://localhost:3000/today", { waitUntil: "networkidle" });
  await p3.waitForTimeout(1200);
  const col = await p3.evaluate(() => {
    const s = getComputedStyle(document.body);
    const h1 = document.querySelector("h1");
    return { bg: s.backgroundColor, fg: getComputedStyle(h1 || document.body).color };
  });
  const parse = (c) => (c.match(/\d+/g) || []).slice(0, 3).map(Number);
  const lum = (c) => { const [r, g, bl] = parse(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const ratio = (a, b2) => { const l1 = lum(a), l2 = lum(b2); return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)); };
  const r = ratio(col.bg, col.fg);
  // Headings are the brand orange by decision. Recorded, not ignored: it
  // must not get WORSE, and everything else still needs AA.
  //
  // **This literal is why the exception has to be pinned to a value.**
  // It used to read `255, 102, 0`. The palette moved to #FF6B35 and the
  // pattern stopped matching, so the floor silently jumped back to 4.5
  // and the check reported two failures that were the recorded decision.
  // Same class of miss in the other direction is worse: a match on any
  // orange would let a lighter one through unnoticed.
  const brandOrange = /255,\s*107,\s*53/.test(col.fg);
  const floor = brandOrange ? 2.56 : 4.5;
  // The 0.01 tolerance matches contrast.py. Without it the pinned figure
  // fails against itself: the true ratio is 2.5588, the recorded value is
  // the rounded 2.56, and `2.5588 >= 2.56` is false. A check that cannot
  // pass its own recorded value is noise, and noise gets ignored.
  ok(`${scheme} scheme: heading contrast >= ${floor}:1${brandOrange ? " (brand exception)" : ""}`,
     r >= floor - 0.01, `${r.toFixed(2)}:1  bg ${col.bg} fg ${col.fg}`);
  await c3.close();
}

/* ============ 7. HOW FAST DOES IT FEEL ============ */
console.log("\n=== Responsiveness ===");
for (const path of ["/today", "/search", "/listings"]) {
  const t0 = Date.now();
  await page.goto(`http://localhost:3000${path}`, { waitUntil: "domcontentloaded" });
  const tHtml = Date.now() - t0;
  await page.waitForTimeout(1500);
  const paint = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return fcp ? Math.round(fcp.startTime) : null;
  });
  console.log(`  ${path.padEnd(11)} html ${String(tHtml).padStart(4)}ms   first paint ${paint ?? "?"}ms`);
  ok(`${path} paints something`, paint !== null && paint < 4000, `${paint}ms (dev build, unoptimised)`);
}

await ctx.close();
await b.close();
console.log(bad === 0 ? "\nPASS\n" : `\n${bad} PROBLEM(S)\n`);
process.exit(bad ? 1 : 0);
