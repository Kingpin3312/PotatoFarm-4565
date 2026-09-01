import fs from "node:fs";
import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * The typography, as a browser resolves it.
 *
 * The same argument as `browser:option1`, and the same history behind
 * it: a palette move once shipped `text-accent-type` to 42 call sites
 * that generated no CSS at all, because nobody had mapped the token to
 * Tailwind, and every source-reading check passed. A type scale is
 * exactly as easy to get wrong that way — `text-ui` is a class name
 * until something proves it resolves to 15px.
 *
 *     npm run dev
 *     npm run browser:type
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}

let bad=0;
const failures=[];
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);
  if(!p){bad++;failures.push(d?`${l}  — ${d}`:l);}};

/**
 * Every screen an agent or a visitor can reach, not a sample.
 *
 * The three public ones are here from the start. `browser:option1`
 * shipped without them and three orange links on the sign-in page went
 * unmeasured for a generation as a result.
 */
const SCREENS = ["/today", "/inbox", "/pipeline", "/listings", "/leads", "/viewings",
                 "/offers", "/deals", "/blackbook", "/commission", "/compliance",
                 "/reports", "/team", "/me", "/settings", "/activity", "/search",
                 "/ask", "/documents", "/sign-in", "/sign-in/check-your-email", "/signup",
                 // The settings sub-pages, added with the raw-enum check.
                 // Four of the thirteen leaks lived on these three, and
                 // a check that does not open a screen cannot fail on it.
                 "/settings/import", "/settings/billing", "/settings/commission"];

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const p=await ctx.newPage();

/**
 * Count requests, from before the page's own scripts run.
 *
 * `addInitScript` is the load-bearing part. Wrapping `fetch` from an
 * `evaluate` after navigation is too late — the queries this needs to
 * wait for were issued by then, using the original `fetch`, so the
 * counter reads zero and every page looks finished the moment it is
 * asked. `__started` exists for the opposite end of the same problem:
 * zero in flight is also true before the first request goes out.
 */
await p.addInitScript(() => {
  const w = /** @type {any} */ (window);
  w.__inflight = 0; w.__started = 0;
  const f = w.fetch;
  w.fetch = (...a) => { w.__inflight++; w.__started++;
    return f(...a).finally(() => w.__inflight--); };
});

/**
 * Content that has escaped the page, ignoring anything that is meant to
 * scroll.
 *
 * The naive version — every element whose right edge is past the
 * viewport — reports 123 offenders on `/pipeline` at 375px, and every
 * one of them is a card inside the kanban board's own horizontal
 * scroller, which is the feature. `option1.mjs` had the same logic and
 * passed only because the one screen in its width list has no scroller.
 *
 * What is actually a bug is content with no way to reach it: the page
 * itself scrolling sideways, or an element past the edge with no
 * scrollable ancestor between it and the body.
 */
async function escaped(p) {
  return p.evaluate(() => {
    const d = document.documentElement;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width <= 2 || b.right <= d.clientWidth + 2) continue;
      let n = el.parentElement, contained = false;
      while (n && n !== document.body) {
        const c = getComputedStyle(n);
        if ((c.overflowX === "auto" || c.overflowX === "scroll")
            && n.scrollWidth > n.clientWidth + 1) { contained = true; break; }
        n = n.parentElement;
      }
      if (!contained) out.push(el.textContent.trim().slice(0, 24) || el.tagName.toLowerCase());
    }
    return { scrolls: d.scrollWidth > d.clientWidth + 1, out };
  });
}

/**
 * `domcontentloaded`, not `networkidle`.
 *
 * The inbox polls for new messages, so its network never goes quiet and
 * `networkidle` times out after 30s against a page that is working
 * perfectly. Waiting for the heading instead means the settle condition
 * is "the screen has rendered", which is what is actually wanted and is
 * true on a polling page too.
 */
async function open(url){
  await p.goto(`http://localhost:3000${url}`,{waitUntil:"domcontentloaded"});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await p.waitForSelector("h1, h2, main", {timeout: 8_000}).catch(() => {});
  /**
   * Wait for the data to arrive, not for a heading to appear.
   *
   * This was `waitForTimeout(700)` after the `h1`, and on `/leads` the
   * `h1` is the lead *count* — it paints on the first render while the
   * list itself is still in flight over tRPC. Every assertion in this
   * file had therefore been measuring an empty page. It was found by
   * doing what CLAUDE.md asks of a new test: `REFERRAL` was put back
   * on the leads list on purpose to watch the raw-enum check go red,
   * and it stayed green.
   *
   * **Sampling the rendered text was the first fix and was also
   * wrong.** A page waiting on a query sits perfectly still, so "the
   * text stopped changing" is true of a finished page and of an empty
   * one alike — it went green again while `/pipeline` at 375px was
   * still reporting 24 elements past the edge that a fresh load could
   * not reproduce.
   *
   * So the signal is the requests themselves. `networkidle` cannot be
   * used — `/inbox` polls, so it never reaches idle and the run hangs
   * — but in-flight *count* drops to zero between polls, which is the
   * same information without the hang.
   */
  await p.evaluate(async () => {
    const w = /** @type {any} */ (window);
    // Two consecutive quiet samples, because one is satisfied in the
    // gap between a request finishing and its successor being issued —
    // which is precisely the state a page waiting on a second query is
    // in. `__started` guards the other end: a page whose first request
    // has not been issued yet is also quiet, and looks finished.
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    let calm = 0;
    for (let i = 0; i < 30; i++) {
      await nap(200);
      // `/sign-in` and `/signup` fetch nothing at all, so waiting for a
      // first request would spend six seconds on each of them proving
      // that a static page is static.
      if (i >= 8 && w.__started === 0) return;
      calm = w.__inflight === 0 && w.__started > 0 ? calm + 1 : 0;
      if (calm >= 2) return;
    }
  });
  // One settle for layout after the data has landed.
  await p.waitForTimeout(400);
}

console.log("\n=== one family, and it is the system one ===");
{
  await open("/today");
  const f = await p.evaluate(() => {
    const s = getComputedStyle(document.documentElement).getPropertyValue("--sans");
    return { stack: s.trim(), first: getComputedStyle(document.body).fontFamily.split(",")[0].trim() };
  });
  ok("the body takes the system face", f.first === "-apple-system", f.first);
  ok("no webfont name is in the stack",
     !/Inter|Google|@font-face/i.test(f.stack), f.stack.slice(0, 72) + "…");
  // The whole reason this reads as Apple: SF is an optical-size family
  // and the browser swaps Display for Text on its own.
  ok("SF is named for the environments without the keyword",
     /SF Pro Display/.test(f.stack) && /SF Pro Text/.test(f.stack));
  // The brief's principle, not its literal list: Segoe UI on Windows
  // and Roboto on Android are the *native* rendering there, and
  // dropping them sends the whole product to Arial.
  ok("every platform keeps a native UI face",
     /Segoe UI/.test(f.stack) && /Roboto/.test(f.stack));

  /**
   * No webfont, and the dev server's own does not count.
   *
   * Next injects four `@font-face` rules for Geist to render its error
   * overlay. They are prefixed `__nextjs-`, they are not in the
   * production bundle, and nothing in the app can reference them — so
   * counting them made this fail against a page that downloads no font
   * at all. Matched by name rather than by counting, so an actual
   * webfont added later still fails it.
   */
  const faces = await p.evaluate(() =>
    [...document.styleSheets].flatMap((s) => {
      try { return [...s.cssRules]; } catch { return []; }
    }).filter((r) => r.constructor.name === "CSSFontFaceRule")
      .map((r) => r.style.getPropertyValue("font-family").replace(/["']/g, "").trim())
      .filter((n) => !n.startsWith("__nextjs-")));
  ok("the app downloads no font of its own", faces.length === 0,
     faces.join(", ") || "system faces only");
}

console.log("\n=== the scale resolves, every step ===");
{
  const STEPS = {
    "text-page": null, "text-title": 28, "text-stat": 30, "text-h2": null,
    "text-h3": 24, "text-section": 21, "text-sub": 17, "text-body-lg": 19,
    "text-ui": 15, "text-control": 16, "text-note": 13, "text-label": 12,
  };
  const got = await p.evaluate((names) => {
    const out = {};
    for (const n of names) {
      const el = document.createElement("span");
      el.className = n; el.textContent = "Ag";
      document.body.appendChild(el);
      const c = getComputedStyle(el);
      out[n] = { px: parseFloat(c.fontSize), lh: c.lineHeight, ls: c.letterSpacing };
      el.remove();
    }
    return out;
  }, Object.keys(STEPS));

  for (const [name, want] of Object.entries(STEPS)) {
    const g = got[name];
    // A class Tailwind never generated computes to the inherited 16px
    // with `normal` spacing — which is the failure mode, and it is
    // indistinguishable from a correct 16px step unless the line height
    // and tracking came with it.
    const carried = g.lh !== "normal" && g.ls !== "normal";
    const sized = want === null ? g.px > 16 : Math.abs(g.px - want) < 0.5;
    ok(`${name} resolves`, sized && carried,
       `${g.px}px / lh ${g.lh} / ls ${g.ls}`
       + (carried ? "" : "  ← generated nothing"));
  }
}

/**
 * One visit per screen, three questions.
 *
 * These were three separate loops over the same 22 screens — 66 page
 * loads to ask what one render can answer. In a dev server that
 * compiles a route on first request, that is most of the runtime.
 */
const small = [];
const heavy = [];
const shapes = new Set();
const shouted = [];
const rawEnums = [];
for (const url of SCREENS) {
  // Progress, and it is not decoration: this loop sat silent for ten
  // minutes and there was no way to tell a slow screen from a hung one.
  const t0 = Date.now();
  process.stdout.write(`  … ${url}`);
  await open(url);
  const r = await p.evaluate(() => {
    const small = [], heavy = [], labels = [], shouted = [], raw = [];
    /**
     * Genuine acronyms, which are the only all-caps words this product
     * has any business rendering. Found by sweeping every screen and
     * reading what came back, rather than guessed — an allowlist
     * written from imagination is how a check comes to pass by
     * accident.
     */
    const ACRONYMS = new Set(["AED", "BRN", "CSV", "NOC", "RERA", "KYC",
      "AML", "UAE", "VAT", "DLD", "SPA", "PDF", "API", "URL", "ID", "OK"]);
    for (const el of document.querySelectorAll("body *")) {
      const c = getComputedStyle(el);
      if (c.textTransform === "uppercase") {
        const t = el.textContent.trim().slice(0, 20);
        if (t) shouted.push(`${el.tagName.toLowerCase()} "${t}"`);
      }
      /**
       * A database enum that reached the screen.
       *
       * The rule is deliberately narrow: the element's **entire** text
       * is one all-caps token. That is what a leaked enum looks like —
       * `REFERRAL` in a chip, `BLOCKER` in a severity column — and it
       * is the whole regression class, because `sentence()` is applied
       * per value and a missed call always renders the bare value.
       *
       * It will not catch `{rating} risk` regressing to `HIGH risk`,
       * and it is not meant to: the dev database has users named after
       * their roles (`Test COMPLIANCE_OFFICER`), so a per-token rule
       * fires on fixture data that is not a rendering fault at all.
       * Narrow and always-true beats broad and switched off.
       */
      if (c.visibility !== "hidden" && c.display !== "none") {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
        if (/^[A-Z][A-Z0-9_]{2,}$/.test(own) && !ACRONYMS.has(own)) {
          raw.push(`${el.tagName.toLowerCase()} "${own}"`);
        }
      }
      if (el.classList.contains("t-label")) {
        labels.push(`${c.fontSize}/${c.fontWeight}/${c.letterSpacing}/${
          c.fontFamily.split(",")[0].trim()}`);
      }
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      if (c.visibility === "hidden" || c.display === "none") continue;
      const px = parseFloat(c.fontSize);
      const w = parseInt(c.fontWeight, 10);
      const txt = el.textContent.trim().slice(0, 18);
      if (px < 11.5) small.push(`${el.tagName.toLowerCase()} ${px}px "${txt}"`);
      // 700+ anywhere, and 600 at body size or below — the two shapes
      // that make an interface look shouted.
      if (w >= 700) heavy.push(`${w} "${txt}"`);
      else if (w >= 600 && px <= 17) heavy.push(`${w}@${px}px "${txt}"`);
    }
    return { small, heavy, labels, shouted, raw };
  });
  for (const x of r.small) small.push(`${url}: ${x}`);
  for (const x of r.heavy) heavy.push(`${url}: ${x}`);
  for (const x of r.labels) shapes.add(x);
  for (const x of r.shouted) shouted.push(`${url}: ${x}`);
  for (const x of r.raw) rawEnums.push(`${url}: ${x}`);
  console.log(` ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log("\n=== nothing renders below the readable floor ===");
/**
 * 12px, and the rule is about rendered text rather than declared
 * sizes. There were 144 elements at 10px and 22 at 9px — the second is
 * not a font size, it is a texture.
 */
ok("no text under 12px", small.length === 0,
   small.slice(0, 4).join(" | ") || `checked ${SCREENS.length} screens`);

console.log("\n=== weight is a hierarchy, not a switch ===");
ok("no 700+, and no 600 at body size", heavy.length === 0,
   [...new Set(heavy)].slice(0, 4).join(" | ") || `checked ${SCREENS.length} screens`);

console.log("\n=== the label is one thing again, and it does not shout ===");
/**
 * There were 174 of these across 69 files, in a monospace face, at
 * three sizes and three letter-spacings. The check is that they now
 * agree with each other — one family, one size, one tracking.
 */
ok("every .t-label renders identically", shapes.size === 1,
   [...shapes].join(" | ") || "none rendered — the class generated nothing");
/**
 * And nothing in the interface is uppercased by CSS.
 *
 * 174 labels were `text-transform: uppercase`, which the direction
 * lists under Avoid and which was also propping up a workaround: a
 * dozen screens lowercased a database enum so the transform could
 * shout it back, and the moment the transform came off they rendered
 * `property finder` in a chip. `lib/sentence.ts` owns that now.
 */
ok("nothing is uppercased by CSS", shouted.length === 0,
   [...new Set(shouted)].slice(0, 4).join(" | ") || `checked ${SCREENS.length} screens`);
/**
 * And nothing is uppercase because it is still a database enum.
 *
 * Removing the transform turned a dozen `.toLowerCase()` workarounds
 * into `property finder` in a chip, which `lib/sentence.ts` fixed. The
 * other half of that bug had no workaround to break and so stayed
 * invisible: `{l.source}` on the leads list rendered `REFERRAL` and
 * `UNKNOWN` all along, on the screen an agent reads most, and every
 * source-reading check passed because the source is correct — the enum
 * simply arrives at the screen already shouting.
 *
 * Thirteen call sites across nine screens. Only a browser reading
 * rendered text finds this one.
 */
ok("no database enum reaches the screen raw", rawEnums.length === 0,
   [...new Set(rawEnums)].slice(0, 4).join(" | ") || `checked ${SCREENS.length} screens`);

console.log("\n=== inputs do not make iOS zoom ===");
{
  // Under 16px, Safari zooms the page when a field takes focus. It
  // presents as a layout bug and it is a typography setting.
  const smallFields = [];
  for (const url of ["/listings", "/me", "/settings/hours", "/sign-in", "/blackbook"]) {
    await open(url);
    const found = await p.evaluate(() =>
      [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")]
        .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
        .map((el) => `${el.tagName.toLowerCase()} ${getComputedStyle(el).fontSize}`));
    for (const x of found) smallFields.push(`${url}: ${x}`);
  }
  ok("every field is at least 16px", smallFields.length === 0,
     smallFields.slice(0, 3).join(" | ") || "checked 5 screens");
}

console.log("\n=== the new sizes fit, at every width ===");
for (const w of [375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  await p.setViewportSize({ width: w, height: 900 });
  let worst = null;
  for (const url of ["/today", "/pipeline", "/leads", "/inbox", "/sign-in"]) {
    await open(url);
    /**
     * Twice, 600ms apart, and only what escapes both times counts.
     *
     * The pipeline board fills its columns from a query, so for a beat
     * after the heading appears the cards are laid out and the
     * container that will scroll them has not yet got a `scrollWidth`
     * bigger than its `clientWidth`. Measured in that window, every
     * card looks like it has escaped the page.
     *
     * That produced a very convincing bug report: clean at 375px and
     * failing at 390, 430, 768, 1024 and 1280 — which is backwards,
     * because a genuine overflow gets worse as the viewport narrows,
     * not better. Loading the same screen on its own at each width
     * showed zero. A steady-state assertion is the fix; a longer sleep
     * would only move the race.
     */
    let r = await escaped(p);
    if (r.scrolls || r.out.length) {
      await p.waitForTimeout(600);
      const again = await escaped(p);
      const persists = r.out.filter((x) => again.out.includes(x));
      if (again.scrolls || persists.length) {
        worst = { url, scrolls: again.scrolls, n: persists.length,
                  first: persists[0] ?? null };
        break;
      }
    }
  }
  ok(`${w}px`, worst === null,
     worst ? `${worst.url}: ${worst.scrolls ? "SCROLLS SIDEWAYS" : `${worst.n} past the edge`}`
             + (worst.first ? ` — "${worst.first}"` : "")
           : "5 screens clean");
}
await p.setViewportSize({ width: 1280, height: 900 });

await b.close();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n"
                : "\none family, one scale, three weights — on every screen and every width.\n");
process.exit(bad ? 1 : 0);
