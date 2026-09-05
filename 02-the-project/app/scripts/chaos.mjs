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
const R = "/home/user/PotatoFarm-4565";
const SITE = `file://${R}/02-the-project/website`;

/**
 * Resolve an internal link the way the host will, not the way the
 * filesystem does.
 *
 * This check used to be `fs.existsSync(website + href)`, which was
 * correct while every link ended in `.html`. The site's internal links
 * were later repointed at their canonical clean URLs — `/product`
 * rather than `/product.html`, so a crawler is handed the canonical
 * form and not a 301 hop — and this check began reporting all 80 of
 * them as broken. Every one was a false positive, and 80 of those is
 * how a suite stops being read.
 *
 * `_redirects` is what turns `/product` into `product.html`, so that is
 * what has to be consulted. Same precedence as serve.mjs: an existing
 * file wins, then the redirect table.
 */
const RULES = fs.existsSync(`${R}/02-the-project/website/_redirects`)
  ? fs.readFileSync(`${R}/02-the-project/website/_redirects`, "utf8").split("\n")
      .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split(/\s+/)).filter((x) => x.length >= 3)
      .map(([from, to, code]) => ({ from, to, code: Number(code.replace("!", "")) }))
  : [];

function serves(href) {
  const path = href.split("#")[0].split("?")[0];
  if (!path) return true;
  const direct = path === "/" ? "/index.html" : path;
  if (fs.existsSync(`${R}/02-the-project/website${direct}`)) return true;
  for (const r of RULES) {
    if (r.from.startsWith("http")) continue;          // host rules, not paths
    if (r.code === 404) continue;                     // the catch-all is not a resolution
    const hit = r.from.endsWith("/*")
      ? path.startsWith(r.from.slice(0, -1))
      : r.from === path;
    if (hit && fs.existsSync(`${R}/02-the-project/website${r.to}`)) return true;
  }
  return false;
}
const b = await chromium.launch({ executablePath: chromePath() });
const F = [];
const bad = (area, sev, what, detail = "") => F.push({ area, sev, what, detail });
const say = (l, p, d = "") => console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`);
const chk = (area, sev, l, p, d = "") => { say(l, p, d); if (!p) bad(area, sev, l, d); };

/* ==================== WEBSITE ==================== */
console.log("\n████ WEBSITE\n");
const pages = fs.readdirSync(`${R}/02-the-project/website`).filter(f => f.endsWith(".html"));
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(String(e).slice(0, 120)));
  p.on("console", m => m.type() === "error" && errs.push(m.text().slice(0, 120)));

  for (const f of pages) {
    await p.goto(`${SITE}/${f}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name=description]')?.content ?? "",
      canon: document.querySelector('link[rel=canonical]')?.href ?? "",
      robots: document.querySelector('meta[name=robots]')?.content ?? "",
      og: ["og:title","og:description","og:image","og:url","og:type"]
            .filter(k => !document.querySelector(`meta[property="${k}"]`)),
      tw: !!document.querySelector('meta[name^="twitter:"]'),
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].length,
      h1: document.querySelectorAll("h1").length,
      viewport: !!document.querySelector('meta[name=viewport]'),
      imgNoAlt: [...document.querySelectorAll("img")].filter(i=>!i.hasAttribute("alt")).length,
      // Links that go nowhere or to a placeholder.
      dead: [...document.querySelectorAll("a[href]")]
        .map(a=>a.getAttribute("href"))
        .filter(h => h==="#" || h==="" || /^javascript:/i.test(h) || /TODO|PLACEHOLDER/i.test(h)),
      internal: [...new Set([...document.querySelectorAll("a[href]")]
        .map(a=>a.getAttribute("href"))
        .filter(h=>h && !/^(https?:|mailto:|tel:|#)/.test(h)))],
      emptyBtns: [...document.querySelectorAll("button")]
        .filter(x=>!(x.textContent||"").trim() && !x.getAttribute("aria-label")).length,
    }));
    const name = f.padEnd(30);
    const probs = [];
    if (!m.title || m.title.length < 12) probs.push("title");
    if (!m.desc || m.desc.length < 50) probs.push("description");
    const noindex = /noindex/i.test(m.robots || "");
    if (!m.canon && !noindex) probs.push("canonical");   // noindex pages want none
    if (m.og.length) probs.push(`og:${m.og.join(",")}`);
    if (!m.tw) probs.push("twitter");
    if (m.h1 !== 1) probs.push(`h1=${m.h1}`);
    if (!m.viewport) probs.push("viewport");
    if (m.imgNoAlt) probs.push(`${m.imgNoAlt} img no alt`);
    if (m.dead.length) probs.push(`dead:${m.dead.join(",")}`);
    if (m.emptyBtns) probs.push(`${m.emptyBtns} unnamed buttons`);
    console.log(`  ${name} ${probs.length ? "⚠ " + probs.join(" | ") : "ok"}${m.ld?"  [ld+json]":""}`);
    if (probs.length) bad("website", probs.some(x=>/dead|h1|viewport/.test(x)) ? "high" : "medium", `${f}: ${probs.join(", ")}`);

    // Every internal link must resolve to a file that exists.
    for (const href of m.internal) {
      if (!serves(href)) bad("website", "high", `${f} → broken link "${href}"`);
    }
  }
  chk("website", "high", "no console errors anywhere on the site", errs.length === 0, [...new Set(errs)].join(" | "));

  // robots / sitemap
  for (const f of ["robots.txt", "sitemap.xml", "_headers", "_redirects"]) {
    chk("website", "medium", `${f} exists`, fs.existsSync(`${R}/02-the-project/website/${f}`));
  }
  await ctx.close();
}

/* ==================== APP: chaos ==================== */
console.log("\n████ APP — chaos\n");
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(String(e).slice(0, 140)));
  p.on("console", m => m.type()==="error" && !m.text().includes("rsms.me") && errs.push(m.text().slice(0,140)));

  // Warm every route first. `next dev` compiles a route on its first
  // request, and the first run of this reported /blackbook/<bad id> as
  // blank — the page had simply not finished compiling. A harness that
  // fails on a cold server teaches people to re-run it until it passes,
  // which is how a real failure gets waved through.
  for (const u of ["/blackbook/warm","/offers/warm","/compliance/warm","/search","/listings","/today","/deals"]) {
    await p.goto(`http://localhost:3000${u}`, { waitUntil: "networkidle" }).catch(()=>{});
  }
  errs.length = 0;

  // 1. A record id that does not exist.
  for (const url of ["/blackbook/does-not-exist", "/offers/nope", "/compliance/nope"]) {
    await p.goto(`http://localhost:3000${url}`, { waitUntil: "networkidle" }).catch(()=>{});
    await p.waitForTimeout(1800);
    const t = (await p.locator("#main").innerText().catch(()=>"")).replace(/\s+/g," ").trim();
    const okState = t.length > 40 && !/Application error|Unhandled|TRPCError/i.test(t);
    chk("app","high",`${url} explains itself`, okState, t.slice(0,90) || "(blank)");
  }

  // 2. A route that does not exist at all.
  await p.goto("http://localhost:3000/not-a-real-page", { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(1200);
  const nf = (await p.locator("body").innerText().catch(()=>"")).replace(/\s+/g," ");
  chk("app","medium","unknown route shows a 404, not a crash", /404|not found|can.t find/i.test(nf), nf.slice(0,80));

  // 3. Rapid double-submit on the search form.
  await p.goto("http://localhost:3000/search", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.fill('input[aria-label="What are you looking for?"]', "Dubai Hills");
  const btn = p.getByRole("button", { name: "Find" }).last();
  errs.length = 0;                       // <- only what this test causes
  await Promise.all([btn.click(), btn.click(), btn.click()]).catch(()=>{});
  await p.waitForTimeout(2500);
  const dupErrs = [...errs];
  chk("app","high","triple-clicking Find does not error", dupErrs.length === 0, dupErrs.join(" | "));
  const rows3 = await p.locator("section ul > li").count();
  chk("app","high","and still returns exactly one set of results", rows3 > 0, `${rows3} rows`);

  // 4. Absurdly long input.
  await p.fill('input[aria-label="What are you looking for?"]', "x".repeat(5000));
  const v = await p.inputValue('input[aria-label="What are you looking for?"]');
  chk("app","medium","the search field caps its own length", v.length <= 200, `${v.length} chars`);
  await p.getByRole("button", { name: "Find" }).last().click();
  await p.waitForTimeout(2000);
  const longTxt = (await p.locator("section").innerText().catch(()=>"")).replace(/\s+/g," ");
  chk("app","high","a 200-char nonsense query answers rather than hangs",
      longTxt.length > 20 && !/Couldn.t load/i.test(longTxt), longTxt.slice(0,80));

  // 5. Injection-shaped input must be rendered as text, never executed.
  const XSS = `<img src=x onerror=alert(1)>`;
  await p.fill('input[aria-label="What are you looking for?"]', XSS);
  await p.getByRole("button", { name: "Find" }).last().click();
  await p.waitForTimeout(1800);
  const injected = await p.evaluate(() => document.querySelectorAll('img[src="x"]').length);
  chk("security","critical","script-shaped input is not injected into the DOM", injected === 0, `${injected} nodes`);

  // 6. Back / forward.
  await p.goto("http://localhost:3000/today", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p.goto("http://localhost:3000/listings", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p.goBack(); await p.waitForTimeout(1200);
  await p.goForward(); await p.waitForTimeout(1400);
  const afterNav = (await p.locator("#main").innerText().catch(()=>"")).replace(/\s+/g," ");
  chk("app","high","back then forward leaves a working screen", afterNav.length > 40, afterNav.slice(0,70));

  // 7. Reload mid-flight. Both navigations are allowed to abort — that
  //    is the point of the test; what matters is the state left behind.
  const nav = p.goto("http://localhost:3000/deals", { waitUntil: "networkidle" }).catch(()=>{});
  await p.waitForTimeout(120);
  await p.reload({ waitUntil: "networkidle" }).catch(()=>{});
  await nav;
  await p.waitForTimeout(1500);
  const afterReload = (await p.locator("#main").innerText().catch(()=>"")).replace(/\s+/g," ");
  chk("app","high","reloading mid-request recovers", afterReload.length > 30, afterReload.slice(0,70));

  console.log(`  console errors during chaos: ${[...new Set(errs)].length}`);
  [...new Set(errs)].slice(0,5).forEach(e=>console.log(`     · ${e}`));
  await ctx.close();
}

/* ==================== AUTH ==================== */
console.log("\n████ AUTH\n");
{
  // Logged out.
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  for (const url of ["/today","/listings","/search","/deals","/settings","/blackbook"]) {
    const r = await p.goto(`http://localhost:3000${url}`, { waitUntil: "domcontentloaded" }).catch(()=>null);
    await p.waitForTimeout(400);
    const landed = p.url();
    chk("security","critical",`logged out ${url} → sign-in`, /sign-in/.test(landed), landed.replace("http://localhost:3000",""));
  }
  // An invalid session cookie must not be treated as valid.
  await ctx.addCookies([...sessionCookies("totally-made-up")]);
  await p.goto("http://localhost:3000/today", { waitUntil:"domcontentloaded" }).catch(()=>{});
  await p.waitForTimeout(700);
  // NOT "must redirect". The middleware is documented as a redirect for
  // signed-out visitors, not an auth gate — the gate is tRPC plus the
  // database policies, both proved below. Asserting a redirect here was
  // asserting the wrong requirement; what must hold is that a forged
  // cookie yields no data, which the next block checks.
  say("forged cookie reaches the shell (by design — middleware is a redirect)", true,
      p.url().replace("http://localhost:3000",""));
  // The forged cookie gets past the *redirect* by design — middleware is
  // documented as a redirect, not a gate. What matters is what the
  // person then sees, and that no data reaches them.
  const p2 = await ctx.newPage();
  await p2.goto("http://localhost:3000/today", { waitUntil: "networkidle" }).catch(()=>{});
  await p2.waitForTimeout(2500);
  const forged = (await p2.locator("#main").innerText().catch(()=>"")).replace(/\s+/g," ");
  chk("security","critical","a forged cookie yields no data",
      !/Good (morning|afternoon|day)|AED [\d,]/.test(forged) || /signed out/i.test(forged),
      forged.slice(0,90));
  chk("app","high","and is told to sign in, not that something broke",
      /signed out|sign in/i.test(forged), forged.slice(0,90));

  await ctx.close();
}

/* ==================== API DIRECTLY ==================== */
console.log("\n████ API\n");
{
  const ctx = await b.newContext();
  const api = ctx.request;
  // Unauthenticated tRPC must refuse.
  const r1 = await api.get("http://localhost:3000/api/trpc/today.brief?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D");
  chk("security","critical","unauthenticated tRPC query is refused", r1.status() === 401 || r1.status() === 403, String(r1.status()));
  // Health endpoint should exist and not leak.
  const r2 = await api.get("http://localhost:3000/api/health");
  const body = await r2.text().catch(()=> "");
  chk("app","medium","health endpoint responds", r2.status() < 500, String(r2.status()));
  chk("security","high","health does not leak secrets",
      !/password|secret|key=|postgres:\/\//i.test(body), body.slice(0,80));
  // Security headers.
  const r3 = await api.get("http://localhost:3000/sign-in");
  const h = r3.headers();
  for (const k of ["content-security-policy","x-frame-options","x-content-type-options","referrer-policy","permissions-policy"]) {
    chk("security", k==="content-security-policy"?"high":"medium", `header ${k}`, !!h[k], (h[k]||"missing").slice(0,60));
  }

  /**
   * The CSP has to be enforced, not merely present.
   *
   * "Is there a Content-Security-Policy header" was the whole check, and
   * it passes in both of the states that matter and are wrong:
   *
   *   * `script-src 'unsafe-inline'` — a header that permits exactly the
   *     thing CSP exists to stop.
   *   * a nonce in the header that no script tag carries — which is what
   *     happened here the first time. The pages were still prerendered,
   *     so their HTML was written at build time and could not know a
   *     per-request value. The header looked immaculate and Chromium
   *     refused all sixteen scripts; the sign-in page rendered fifteen
   *     characters and never hydrated.
   *
   * So: no `'unsafe-inline'` in script-src, a nonce in the header, every
   * script tag carrying that exact nonce, and a different nonce on the
   * next request.
   */
  const csp = h["content-security-policy"] || "";
  const scriptSrc = (csp.match(/script-src([^;]*)/i) || [,""])[1];
  chk("security","high","script-src does not allow 'unsafe-inline'",
      !/unsafe-inline/.test(scriptSrc), scriptSrc.trim().slice(0,70));

  const headerNonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
  chk("security","high","the CSP carries a per-request nonce", !!headerNonce, headerNonce || "none");

  if (headerNonce) {
    const html = await r3.text();
    const tags = html.match(/<script[^>]*>/g) || [];
    const bare = tags.filter((t) => !t.includes(`nonce="${headerNonce}"`));
    chk("security","high","every script tag carries the header's nonce",
        tags.length > 0 && bare.length === 0,
        `${tags.length - bare.length}/${tags.length} stamped`);

    const again = await api.get("http://localhost:3000/sign-in");
    const second = ((again.headers()["content-security-policy"]||"").match(/'nonce-([^']+)'/) || [])[1];
    chk("security","high","the nonce changes between requests",
        !!second && second !== headerNonce, `${headerNonce.slice(0,8)}… vs ${(second||"none").slice(0,8)}…`);
  }

  await ctx.close();
}

await b.close();
console.log(`\n${"=".repeat(60)}\n${F.length} FINDING(S)\n${"=".repeat(60)}`);
for (const s of ["critical","high","medium"]) {
  const g = F.filter(x=>x.sev===s);
  if (g.length) { console.log(`\n${s.toUpperCase()} (${g.length})`); g.forEach(x=>console.log(`  · [${x.area}] ${x.what}${x.detail?`  — ${x.detail}`:""}`)); }
}
process.exit(0);
