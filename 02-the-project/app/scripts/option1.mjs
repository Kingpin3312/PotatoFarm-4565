import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

/**
 * Option 1, as a browser draws it, at every width the direction lists.
 *
 * `contrast.py` reads stylesheets and `consistency.py` compares the
 * four places the palette is declared. Neither can see what a page
 * actually paints — the last palette move shipped `text-accent-type`
 * to 42 call sites that generated no CSS at all, because nobody had
 * mapped the token to Tailwind, and every source-reading check passed.
 *
 * So this one opens the pages and reads computed colour.
 *
 *     npm run dev
 *     npm run browser:option1
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}

/**
 * Failures are repeated at the end. `verify.sh` tails 25 lines of a
 * failed step and this prints more than that.
 */
let bad=0;
const failures=[];
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);
  if(!p){bad++;failures.push(d?`${l}  — ${d}`:l);}};

const WHITE  = "rgb(255, 255, 255)";
const PANEL  = "rgb(245, 243, 240)";
const INK    = "rgb(23, 23, 23)";
const ORANGE = "rgb(232, 106, 44)";

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([{name:"authjs.session-token",value:"dev-session-token-ask-history",
  domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}]);
const p=await ctx.newPage();

async function open(url){
  await p.goto(`http://localhost:3000${url}`,{waitUntil:"networkidle"});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await p.waitForTimeout(600);
}

console.log("\n=== the tokens resolve, and to the approved values ===");
{
  await open("/today");
  const t = await p.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const g = (n) => s.getPropertyValue(n).trim().toUpperCase();
    return {
      ground: g("--ground"), panel: g("--panel"), ink: g("--ink"),
      accent: g("--accent"), deep: g("--accent-deep"), soft: g("--accent-soft"),
      onAccent: g("--on-accent"), ruleStrong: g("--rule-strong"),
      // The direction's own names must resolve too, or the alias block
      // is decoration.
      alias: g("--color-primary"),
    };
  });
  ok("--ground is white", t.ground === "#FFFFFF", t.ground);
  ok("--panel is the warm grey", t.panel === "#F5F3F0", t.panel);
  ok("--ink is deep charcoal", t.ink === "#171717", t.ink);
  ok("--accent is the brand orange", t.accent === "#E86A2C", t.accent);
  ok("--accent-soft is the soft orange", t.soft === "#FFF1E8", t.soft);
  ok("--accent-deep carries readable orange type", t.deep === "#A0431B", t.deep);
  ok("--rule-strong clears 3:1 for a control", t.ruleStrong === "#918A82", t.ruleStrong);
  ok("the direction's own token name resolves",
     t.alias.toUpperCase() === "#E86A2C", t.alias || "empty — the alias generated nothing");
}

console.log("\n=== the page is painted white, not cream ===");
{
  const paint = await p.evaluate(() => ({
    body: getComputedStyle(document.body).backgroundColor,
    heading: getComputedStyle(document.querySelector("h1")).color,
  }));
  ok("the body ground is white", paint.body === WHITE || paint.body === "rgba(0, 0, 0, 0)",
     paint.body);
  /**
   * Charcoal, not orange, and this assertion is the reverse of what it
   * said an hour ago.
   *
   * Orange headings were carried forward from the cream palette rather
   * than decided again under this one, and the direction's own 70/20/8/2
   * balance is what settles it: a 68px headline is nowhere near 2% of a
   * page. On a phone the marketing hero was majority orange and the
   * "Book a call" button competed with the sentence above it.
   */
  ok("the page heading is charcoal", paint.heading === INK, paint.heading);
}

console.log("\n=== orange is an accent, not the interface ===");
{
  // The direction asks for roughly 2%. Measured as the share of visible
  // element area whose background is the accent — a crude proxy, and
  // enough to catch the failure it is aimed at, which is a page that
  // has gone orange.
  const share = await p.evaluate((orange) => {
    let acc = 0, all = 0;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const a = r.width * r.height;
      all += a;
      if (getComputedStyle(el).backgroundColor === orange) acc += a;
    }
    return all ? acc / all : 0;
  }, ORANGE);
  ok("orange fills under a tenth of the page", share < 0.10,
     `${(share * 100).toFixed(1)}% of element area`);
}

console.log("\n=== a primary button's label is readable on it ===");
{
  /**
   * Every primary button on four screens, not one on one screen.
   *
   * This was pointed at `/viewings/book` and reported "none found to
   * measure" — correctly, because that page's only primary button
   * appears after a slot is picked. A check that can be satisfied by an
   * empty page is not measuring anything, so it now sweeps screens whose
   * primary action is always rendered and fails if the sweep finds none.
   */
  const btns = [];
  for (const url of ["/me", "/team", "/listings", "/settings/hours"]) {
    await open(url);
    const found = await p.evaluate((orange) => [...document.querySelectorAll("button")]
      .filter((b) => getComputedStyle(b).backgroundColor === orange)
      .map((b) => {
        const s = getComputedStyle(b);
        return { label: b.textContent.trim().slice(0, 18), fg: s.color,
                 size: s.fontSize, weight: s.fontWeight };
      }), ORANGE);
    for (const f of found) btns.push({ url, ...f });
  }
  ok("primary buttons exist to measure", btns.length > 0,
     `${btns.length} across 4 screens`);
  // Charcoal at 5.57:1. White would be 3.22:1 and fail for a label this
  // size, which is the one deviation from the written spec.
  const pale = btns.filter((b) => b.fg !== INK);
  ok("every primary label is charcoal, not white", pale.length === 0,
     pale.map((b) => `${b.url} "${b.label}" ${b.fg}`).join(" | ") || "all charcoal");
}

console.log("\n=== the soft orange reaches a screen ===");
{
  /**
   * `--accent-soft` was declared in `tokens.css` and read by nothing.
   *
   * It now marks machine-written text (`components/ui/machine.tsx`),
   * and the failure to guard against is the one that already happened
   * once here: a token with no Tailwind mapping, so `bg-accent-soft`
   * generates no rule and every panel using it renders transparent
   * while every source-reading check passes.
   *
   * The panels themselves appear only after a model call, which this
   * cannot drive, so what is asserted is the half that silently breaks:
   * the utility exists, resolves to the approved value, and the label
   * colour on it is readable.
   */
  await open("/today");
  const r = await p.evaluate(() => {
    const el = document.createElement("div");
    el.className = "bg-accent-soft text-ink-3";
    document.body.appendChild(el);
    const s = getComputedStyle(el);
    const out = { bg: s.backgroundColor, fg: s.color };
    el.remove();
    return out;
  });
  ok("`bg-accent-soft` generates a rule", r.bg === "rgb(255, 241, 232)", r.bg);
  // #6B6B6B on #FFF1E8 is 4.82:1 — the label that carries the meaning
  // when the tint is invisible has to be readable on the tint too.
  ok("the label on it is readable", r.fg === "rgb(107, 107, 107)", r.fg);
}

console.log("\n=== orange type is only ever large enough for it ===");
{
  /**
   * The rule the palette turns on, checked rather than trusted.
   *
   * #E86A2C is 3.22:1 on white. That clears AA Large — 24px, or 18.66px
   * bold — and fails everything smaller, where `--accent-deep` at
   * 6.34:1 is the step to use. There are 89 uses of `text-accent-type`
   * and reading them is not the way to find the wrong ones.
   *
   * This found `.btn-inline`, a 15px label that read as orange and
   * measured as unreadable, two lines below the comment in tokens.css
   * warning about exactly it.
   */
  const offenders = [];
  let swept = 0;
  /**
   * The public pages are in this list, and they were not.
   *
   * Ten app screens were swept and the four screens an unauthenticated
   * person sees were not — so three inline links on `/sign-in` and
   * `/sign-in/check-your-email` sat at 15px in #E86A2C, 3.22:1, and
   * passed every run. The first page anybody sees is a bad place to
   * keep the one thing nothing measures.
   */
  for (const url of ["/today", "/pipeline", "/listings", "/leads", "/inbox",
                     "/offers", "/deals", "/settings", "/me", "/team",
                     "/sign-in", "/sign-in/check-your-email", "/signup"]) {
    await open(url);
    const bad = await p.evaluate((orange) => {
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        const s = getComputedStyle(el);
        if (s.color !== orange) continue;
        // Only elements that render their own text.
        const own = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        const px = parseFloat(s.fontSize);
        const bold = parseInt(s.fontWeight, 10) >= 700;
        if (px >= 24 || (px >= 18.66 && bold)) continue;
        /**
         * The `.io` is the one documented exception, and it is excused
         * here on exactly the grounds `contrast.py` excuses it: a brand
         * mark is exempt from contrast rules, and this is the half of
         * the wordmark that is type. Named rather than skipped by size,
         * so the two checks cannot come to disagree about what is
         * excused.
         */
        if (el.textContent.trim() === ".io") continue;
        out.push(`${el.tagName.toLowerCase()} ${px}px/${s.fontWeight} "${
          el.textContent.trim().slice(0, 20)}"`);
      }
      return out;
    }, ORANGE);
    for (const x of bad) offenders.push(`${url}: ${x}`);
    swept += 1;
  }
  // Counted, not written down. The previous version said "checked 10
  // screens" as a literal and three more were added above it.
  ok("no orange text below AA Large anywhere", offenders.length === 0,
     offenders.slice(0, 4).join(" | ") || `checked ${swept} screens`);
}

console.log("\n=== every width the direction lists ===");
for (const w of [375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  await p.setViewportSize({ width: w, height: 900 });
  await open("/today");
  const r = await p.evaluate(() => {
    const d = document.documentElement;
    const over = [...document.querySelectorAll("body *")].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.width > 2 && b.right > d.clientWidth + 2;
    });
    // Touch targets. 44px is the floor the design system claims.
    const small = [...document.querySelectorAll("button, a[href], input, select")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.height < 40;
      });
    return {
      scrolls: d.scrollWidth > d.clientWidth + 1,
      overflowing: over.length,
      firstOver: over[0]?.tagName?.toLowerCase() ?? null,
      tooSmall: small.length,
      smallest: small[0]?.textContent?.trim().slice(0, 24) ?? null,
    };
  });
  ok(`${w}px`, !r.scrolls && r.overflowing === 0,
     r.scrolls ? "PAGE SCROLLS SIDEWAYS"
       : r.overflowing ? `${r.overflowing} element(s) past the edge, first <${r.firstOver}>`
       : r.tooSmall ? `clean; ${r.tooSmall} target(s) under 40px, e.g. "${r.smallest}"` : "clean");
}
await p.setViewportSize({ width: 1280, height: 900 });

console.log("\n=== nothing is left on the old palette ===");
{
  // The failure this is aimed at: a surface that kept a hard-coded hex
  // and now sits a generation behind everything around it.
  const stale = await p.evaluate(() => {
    const OLD = ["rgb(255, 107, 53)", "rgb(244, 243, 240)", "rgb(235, 234, 230)",
                 "rgb(26, 26, 26)", "rgb(168, 64, 21)"];
    const hits = [];
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      for (const prop of ["color", "backgroundColor", "borderTopColor"]) {
        if (OLD.includes(s[prop])) {
          hits.push(`${el.tagName.toLowerCase()}.${prop}=${s[prop]}`);
          break;
        }
      }
      if (hits.length > 4) break;
    }
    return hits;
  });
  ok("no element still paints a v4 colour", stale.length === 0, stale.join(", ") || "clean");
}

await b.close();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n"
                : "\nwhite, charcoal, and a controlled orange — on every width.\n");
process.exit(bad ? 1 : 0);
