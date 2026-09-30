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
import { chromePath } from "./_browser.mjs";

/**
 * The colours the design system actually declares.
 *
 * **Now neon pink on grey.** The window is the pink's hue, ±15°, and
 * greys are judged by their real (HSL) saturation, because the grey
 * family leans blue — #292C32 has more blue than red — and a
 * max-minus-min test called it a colour. The potato's own paths keep
 * their orange, but only inside the logo's SVG (the one drawn with a
 * gradient): an orange anywhere else is a second accent and fails.
 *
 * The hue window below is a good proxy for "is this our accent?" and it
 * was right about every colour in the product except one. `--brand-navy`
 * (#12202E, hue 210) dresses the wordmark and nothing else — a deliberate
 * brand colour, documented in `tokens.css`, sampled off the supplied
 * logo. The window flagged it on all 21 screens, which is a check
 * reporting the brand as a fault.
 *
 * The exemption is read out of `tokens.css` rather than typed here. A hex
 * pinned into a check goes quiet the moment the brand moves, which is the
 * failure this repository has already had. Only exact matches are exempt:
 * a tint or a 50%-opacity composite of a declared colour still has to
 * satisfy the hue window, which is what stops this becoming "anything
 * goes".
 */
const TOKENS = "src/styles/tokens.css";
const DECLARED = new Map();
for (const m of fs.readFileSync(TOKENS, "utf8").matchAll(/--([a-z0-9-]+):\s*#([0-9A-Fa-f]{6})\b/g)) {
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(m[2].slice(i - 1, i + 1), 16));
  DECLARED.set(`rgb(${r}, ${g}, ${bl})`, `--${m[1]}`);
}
if (DECLARED.size === 0) {
  console.error(`No colours parsed out of ${TOKENS} — this run would exempt nothing and prove nothing. Aborting.`);
  process.exit(1);
}

/** The accent's hue, read from the same file, so the window moves with it. */
const ACCENT_HEX = fs.readFileSync(TOKENS, "utf8").match(/--accent:\s*#([0-9A-Fa-f]{6})/)[1];
const ACCENT_H = (() => {
  const [r, g, bl] = [0, 2, 4].map((i) => parseInt(ACCENT_HEX.slice(i, i + 2), 16));
  const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn;
  let h = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4;
  return Math.round(h * 60 + 360) % 360;
})();

/**
 * `PROVE_RED=1` paints one undeclared blue onto every screen before
 * scanning. A check nobody has seen fail is decoration; this is how to
 * see it fail without editing the product.
 */
const PROVE = process.env.PROVE_RED === "1";

const b = await pw.chromium.launch({ executablePath: chromePath() });
const SCREENS = ["/today","/inbox","/pipeline","/leads","/listings","/viewings","/offers",
  "/deals","/commission","/compliance","/blackbook","/vendors/new","/team","/activity",
  "/ask","/search","/reports","/settings","/settings/billing","/setup","/me"];
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const p = await ctx.newPage();
let offenders = 0, blueLinks = 0, scanned = 0, redirected = 0, unreachable = 0;
for (const s of SCREENS) {
  await p.goto("http://localhost:3000"+s, { waitUntil:"networkidle" }).catch(()=>{});
  await p.waitForTimeout(700);
  if (PROVE) await p.evaluate(() => {
    const el = document.createElement("span");
    el.style.color = "rgb(59, 130, 246)";   // a blue no token declares
    el.textContent = "prove-red";
    document.body.appendChild(el);
  });
  const r = await p.evaluate(([allowed, ACCENT_H]) => {
    const off = new Map(); let blue = [];
    for (const el of document.querySelectorAll("*")) {
      const c = getComputedStyle(el);
      if (el.tagName === "A" && c.color === "rgb(0, 0, 238)")
        blue.push((el.textContent||"").trim().slice(0,36));
      for (const v of [c.color, c.backgroundColor, c.borderTopColor, c.borderLeftColor, c.fill]) {
        if (!v || v.includes("rgba(0, 0, 0, 0)")) continue;
        const m = v.match(/(\d+),\s*(\d+),\s*(\d+)/); if (!m) continue;
        const [rr,gg,bb] = m.slice(1).map(Number);
        const mx=Math.max(rr,gg,bb), mn=Math.min(rr,gg,bb);
        const L=(mx+mn)/510, d=mx-mn;
        const sat = d === 0 ? 0 : (d/255) / (1 - Math.abs(2*L - 1));
        if (sat < 0.25 || L < 0.12 || L > 0.9) continue;    // a grey, or near black/white
        let h;
        if (mx===rr) h=((gg-bb)/d)%6; else if (mx===gg) h=(bb-rr)/d+2; else h=(rr-gg)/d+4;
        h=Math.round(h*60+360)%360;
        const fromPink = Math.min(Math.abs(h - ACCENT_H), 360 - Math.abs(h - ACCENT_H));
        const inMark = !!el.closest("svg")?.querySelector("linearGradient") && h >= 8 && h <= 45;
        if (fromPink > 15 && !inMark && !allowed.includes(v))
          off.set(v, (el.tagName+"."+(el.className||"").toString().slice(0,30)));
      }
    }
    return { off:[...off.entries()], blue };
  }, [[...DECLARED.keys()], ACCENT_H]);
  const real = await p.evaluate(() => ({
    url: location.pathname,
    h1: (document.querySelector("h1")?.textContent||"").trim().slice(0,40),
    // Chrome's own error page has no app chrome and a blue Reload button.
    // Without this the scan happily "passes" 21 browser error pages and
    // reports the browser's blue as a palette violation — which is what
    // it did the first time the dev server was not running.
    chromeError: !!document.querySelector("#main-frame-error, .error-code, button.blue-button"),
    text: document.body.innerText.replace(/\s+/g," ").trim().length,
  }));
  if (real.chromeError || real.text < 40) {
    console.log(`${s}  !! DID NOT LOAD — is the dev server running? (not scanned)`);
    unreachable++; continue;
  }
  if (real.url.startsWith("/sign-in")) { console.log(`${s}  !! REDIRECTED TO SIGN-IN — not scanned`); redirected++; continue; }
  scanned++;
  if (r.off.length || r.blue.length) {
    console.log(`${s}`);
    r.off.forEach(([c,w]) => console.log(`    hue  ${c}  on ${w}`));
    r.blue.forEach((t) => console.log(`    blue link "${t}"`));
    offenders += r.off.length; blueLinks += r.blue.length;
  }
}
console.log(`\n${scanned} screens actually scanned (${redirected} redirected, ${unreachable} unreachable) · ${offenders} off-palette colour(s) · ${blueLinks} default-blue link(s)`);
// A run that scanned nothing must not exit 0. That is the whole point.
if (unreachable || redirected || scanned < SCREENS.length) {
  console.log(`\n${SCREENS.length - scanned} of ${SCREENS.length} screens were never scanned — this run proves nothing about them.`);
  process.exitCode = 1;
} else if (offenders || blueLinks) {
  process.exitCode = 1;
}
await b.close();
