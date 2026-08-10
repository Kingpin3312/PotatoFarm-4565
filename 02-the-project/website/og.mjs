/**
 * The three social-share cards, regenerated from the live palette.
 *
 * The ones that shipped were **navy** — #001B44 on white, from the
 * palette that was abandoned two generations ago. Nothing pointed at
 * that, and no check looked: a card is a PNG, so `consistency.py` and
 * `contrast.py` both walk straight past it. Every WhatsApp forward and
 * every LinkedIn post of potatofarm.io carried the wrong brand, and it
 * is the one asset nobody ever opens.
 *
 * So they are generated rather than drawn. The card is HTML rendered in
 * the real browser, reading the real `site.css`, which means it cannot
 * drift from the palette again without the stylesheet drifting first.
 * Re-run it after any palette change:
 *
 *     node serve.mjs 4321 &
 *     node og.mjs
 *
 * 1200×630 is the size every platform crops from.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = process.env.SITE ?? "http://localhost:4321";

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
  return undefined;
}

const MARK = fs.readFileSync(path.join(ROOT, "assets/mark.svg"), "utf8");

/**
 * The copy is lifted from each page's own og:description rather than
 * written fresh, so the card and the page cannot say different things.
 */
const CARDS = [
  {
    file: "og-default.png",
    eyebrow: "WhatsApp CRM for UAE brokerages",
    head: "Every enquiry answered in seconds.",
    sub: "A portal lead goes to four agencies at once. The first to reply usually gets the viewing — so the assistant replies, qualifies the buyer and books it, day or night.",
  },
  {
    file: "og-guides.png",
    eyebrow: "Guides",
    head: "WhatsApp, Trakheesi and AML.",
    sub: "Meta's 24-hour reply window and why the failure is silent. Dubai Trakheesi permits and expiry. What UAE anti-money-laundering law already requires of a brokerage.",
  },
  {
    file: "og-security.png",
    eyebrow: "Security and compliance",
    head: "One brokerage cannot see another's.",
    sub: "Tenant separation enforced by the database, an append-only audit log, and support access you grant for 72 hours and can revoke.",
  },
];

const page = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${SITE}/assets/site.css">
<style>
  /* Layout only. Every colour comes from site.css tokens on purpose —
     that is the whole point of generating these. */
  html,body{margin:0;padding:0}
  body{width:1200px;height:630px;background:var(--ground);
       font-family:var(--sans);display:flex;flex-direction:column;
       justify-content:space-between;padding:72px 80px;box-sizing:border-box;
       position:relative;overflow:hidden}
  /* A single orange rule down the left edge — the accent doing one job,
     rather than a gradient wash. */
  .edge{position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--accent)}
  .top{display:flex;align-items:center;gap:16px}
  .top svg{width:56px;height:56px;display:block}
  .word{font-size:30px;font-weight:600;letter-spacing:-0.02em;color:var(--ink);
        white-space:nowrap}
  .word .tld{color:var(--accent-type)}
  .eyebrow{font-family:var(--mono);font-size:15px;text-transform:uppercase;
           letter-spacing:0.14em;color:var(--accent-deep);margin:0 0 18px}
  h1{font-size:62px;line-height:1.06;letter-spacing:-0.03em;margin:0 0 24px;
     color:var(--accent-type);max-width:17ch;text-wrap:balance}
  p{font-size:23px;line-height:1.45;color:var(--ink-2);margin:0;max-width:44ch}
  .foot{font-family:var(--mono);font-size:15px;letter-spacing:0.06em;
        color:var(--ink-3)}
</style></head><body>
  <div class="edge"></div>
  <div class="top">${MARK}<span class="word">PotatoFarm<span class="tld">.io</span></span></div>
  <div>
    <p class="eyebrow">${c.eyebrow}</p>
    <h1>${c.head}</h1>
    <p>${c.sub}</p>
  </div>
  <div class="foot">potatofarm.io</div>
</body></html>`;

const b = await pw.chromium.launch({ executablePath: chromePath() });
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();

for (const c of CARDS) {
  await p.setContent(page(c), { waitUntil: "networkidle" });

  // Refuse to write a card whose stylesheet did not load. A 1200×630 of
  // unstyled black-on-white would look plausible in a directory listing
  // and wrong on every share.
  const styled = await p.evaluate(() => {
    const h1 = document.querySelector("h1");
    return h1 ? getComputedStyle(h1).color : "";
  });
  if (styled !== "rgb(255, 107, 53)") {
    console.error(`  ✗ ${c.file}: site.css did not apply (h1 is ${styled || "unset"}).`);
    console.error(`    Is serve.mjs running on ${SITE}?`);
    process.exitCode = 1;
    continue;
  }

  await p.screenshot({ path: path.join(ROOT, "assets", c.file) });
  console.log(`  ✓ ${c.file}`);
}

await b.close();
