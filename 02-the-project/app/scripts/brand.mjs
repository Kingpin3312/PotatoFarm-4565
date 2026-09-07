import fs from "node:fs";
import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * The logo, on every surface it appears on, at every width it has to
 * survive.
 *
 * The brand had drifted in the way brands drift in codebases: the mark
 * was propagated from one definition and the **wordmark was not**, so
 * the artwork's navy landed on nine SVG lockups while the app header
 * and the website nav stayed neutral ink. And five screens — sign in,
 * check your email, the sign-in error, sign up, accepting an invite —
 * had no logo at all, because the lockup lived inside the application
 * shell and those five sit outside it.
 *
 * Neither was visible to any existing check. `consistency.py` reads the
 * *source* and fingerprints the potato's body path; it cannot see what
 * a browser draws, which is why the wordmark could be the wrong colour
 * on every screen while the audit passed.
 *
 * So this one opens the pages.
 *
 *     npm run dev
 *     npm run browser:brand
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
/**
 * Failures are repeated at the end, and that is not decoration.
 *
 * `verify.sh` tails 25 lines of a failed step and this prints more than
 * that — so when this check failed inside the gate, the failing
 * assertion had scrolled off the top and every visible line was a tick.
 * Three hypotheses were tested against it (a second organisation, a
 * cold route compile, the preceding end-to-end checks) and none
 * reproduced, which is a bad place to be with a release gate.
 *
 * Whatever fails next time will be in the last five lines.
 */
let bad=0;
const failures=[];
const ok=(l,p,d="")=>{console.log(`  ${p?"\u2713":"\u2717"} ${l}${d?"  \u2014 "+d:""}`);if(!p){bad++;failures.push(d?`${l}  \u2014 ${d}`:l);}};

/**
 * Both read from the stylesheet, not pinned to a literal.
 *
 * `ORANGE` was `rgb(255, 107, 53)` and the Option 1 palette move made a
 * correctly-rendered lockup fail this check — the wordmark was right
 * and the check was a generation behind, which is the second time a
 * pinned hex has done that here (`og.mjs` was the first).
 *
 * The question this file is asking is "does the `.io` take the accent
 * and the word take the navy", not "is the accent this exact orange".
 * `contrast.py` and `browser:option1` own the second question, and
 * neither can be got wrong by a palette move.
 */
let NAVY, ORANGE;

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const p=await ctx.newPage();

/** What the lockup actually looks like once the browser has drawn it. */
async function lockup(url) {
  await p.goto(`http://localhost:3000${url}`,{waitUntil:"networkidle"});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await p.waitForTimeout(700);
  return p.evaluate(() => {
    const word = [...document.querySelectorAll("span")]
      .find((s) => s.firstChild?.nodeValue === "PotatoFarm");
    if (!word) return { found: false };
    const svg = word.closest("a,span,header,div")?.querySelector("svg[viewBox='0 0 64 64']")
      ?? document.querySelector("svg[viewBox='0 0 64 64']");
    const tld = word.querySelector("span");
    const wb = word.getBoundingClientRect();
    const sb = svg?.getBoundingClientRect();
    return {
      found: true,
      wordColour: getComputedStyle(word).color,
      tldColour: tld ? getComputedStyle(tld).color : null,
      // The gap that has to render as "PotatoFarm.io", not "PotatoFarm .io".
      text: word.innerText.replace(/\s+/g, "·"),
      markPresent: !!svg,
      // Aspect ratio, to catch a stretched mark.
      markRatio: sb ? +(sb.width / sb.height).toFixed(3) : null,
      markSize: sb ? Math.round(sb.width) : null,
      // Both on one line: their vertical centres within a few pixels.
      sameLine: sb ? Math.abs((sb.top + sb.height / 2) - (wb.top + wb.height / 2)) < 8 : false,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

console.log("\n=== the five screens that had no logo at all ===");
for (const url of ["/sign-in", "/sign-in/check-your-email", "/sign-in/error", "/signup", "/invite"]) {
  const l = await lockup(url);
  ok(`${url} shows the lockup`, l.found && l.markPresent,
     l.found ? (l.markPresent ? "" : "wordmark but no potato") : "no wordmark");
}

console.log("\n=== the wordmark is the artwork's navy, not neutral ink ===");
{
  // Resolved through the browser so the comparison is rgb-to-rgb and
  // whitespace in the custom property cannot make a match miss.
  const resolve = (name) => p.evaluate((n) => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const el = document.createElement("span");
    el.style.color = hex; document.body.appendChild(el);
    const v = getComputedStyle(el).color; el.remove(); return v;
  }, name);
  NAVY = await resolve("--brand-navy");
  ORANGE = await resolve("--accent-type");
  ok("the brand tokens resolve", !!NAVY && !!ORANGE, `${NAVY} / ${ORANGE}`);
}
for (const url of ["/today", "/sign-in"]) {
  const l = await lockup(url);
  ok(`${url} wordmark is navy`, l.wordColour === NAVY, l.wordColour ?? "—");
  ok(`${url} .io is orange`, l.tldColour === ORANGE, l.tldColour ?? "—");
}

console.log("\n=== one word, not two boxes ===");
{
  const l = await lockup("/today");
  // JSX and flex layout have both inserted a space here before, and it
  // renders as "PotatoFarm .io". Read off the DOM, not off the source.
  ok("renders as PotatoFarm.io", l.text === "PotatoFarm.io",
     l.text ?? "—");
  ok("the mark sits on the wordmark's line", l.sameLine);
}

console.log("\n=== the mark is never stretched, at any width ===");
for (const w of [320, 375, 390, 414, 430, 768, 834, 1024, 1440]) {
  await p.setViewportSize({width:w, height:900});
  const l = await lockup("/today");
  // Square viewBox, square box. Anything else is a distorted potato.
  const square = l.markRatio !== null && Math.abs(l.markRatio - 1) < 0.02;
  ok(`${w}px — square and unclipped`, square && !l.overflow && l.markSize >= 20,
     `ratio ${l.markRatio}, ${l.markSize}px${l.overflow ? ", PAGE SCROLLS SIDEWAYS" : ""}`);
}
await p.setViewportSize({width:1280, height:900});

console.log("\n=== the icons the browser and the phone actually fetch ===");
for (const [path, type] of [
  ["/favicon.svg", "image/svg+xml"],
  ["/favicon.ico", null],
  ["/apple-touch-icon.png", "image/png"],
  ["/icon-192.png", "image/png"],
  ["/icon-512.png", "image/png"],
  ["/icon-maskable-512.png", "image/png"],
  ["/og-image.png", "image/png"],
  ["/site.webmanifest", null],
]) {
  const r = await p.request.get(`http://localhost:3000${path}`);
  const ct = r.headers()["content-type"] ?? "";
  ok(`${path} resolves`, r.status() === 200 && (!type || ct.includes(type)),
     `${r.status()} ${ct.split(";")[0]}`);
}

console.log("\n=== the manifest points at icons that exist ===");
{
  const m = await (await p.request.get("http://localhost:3000/site.webmanifest")).json();
  for (const i of m.icons) {
    const r = await p.request.get(`http://localhost:3000${i.src}`);
    ok(`${i.src} (${i.purpose ?? "any"})`, r.status() === 200, `${r.status()}`);
  }
  ok("a maskable icon is declared", m.icons.some((i) => i.purpose === "maskable"),
     "Android crops a non-maskable icon and takes the potato's head off");
}

await b.close();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n" : "\none lockup, one navy, one potato — on every surface.\n");
process.exit(bad ? 1 : 0);
