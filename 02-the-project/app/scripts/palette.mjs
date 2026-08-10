import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

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

const b = await pw.chromium.launch({ executablePath: chromePath() });
const SCREENS = ["/today","/inbox","/pipeline","/leads","/listings","/viewings","/offers",
  "/deals","/commission","/compliance","/blackbook","/vendors/new","/team","/activity",
  "/ask","/search","/reports","/settings","/settings/billing","/setup","/me"];
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addCookies([{ name:"authjs.session-token", value:"dev-session-token-ask-history", domain:"localhost", path:"/", httpOnly:true, sameSite:"Lax" }]);
const p = await ctx.newPage();
let offenders = 0, blueLinks = 0, scanned = 0, redirected = 0, unreachable = 0;
for (const s of SCREENS) {
  await p.goto("http://localhost:3000"+s, { waitUntil:"networkidle" }).catch(()=>{});
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
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
        if (mx===0 || (mx-mn)/mx < 0.12) continue;
        const d=mx-mn; let h;
        if (mx===rr) h=((gg-bb)/d)%6; else if (mx===gg) h=(bb-rr)/d+2; else h=(rr-gg)/d+4;
        h=Math.round(h*60+360)%360;
        if (h < 8 || h > 45) off.set(v, (el.tagName+"."+(el.className||"").toString().slice(0,30)));
      }
    }
    return { off:[...off.entries()], blue };
  });
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
