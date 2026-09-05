import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

/**
 * The form, submitted for real.
 *
 * Point it at the site served by `serve.mjs` and at a running
 * application, because the two halves live in different deployments and
 * the failure everybody ships is the one in the gap between them.
 *
 *     node serve.mjs 8081 &
 *     npm --prefix ../app run dev
 *     node subscribe-flow.mjs
 *
 * SITE defaults to the local serve.mjs; APP to the local application.
 * The page posts to https://app.potatofarm.io, which does not exist
 * yet — that request is intercepted and proxied to APP, with the CORS
 * header the browser insists on. Run it *without* the interception to
 * see the honest-degradation path instead: the form says "That didn't
 * send" and offers the mailto beside it.
 */
const SITE = process.env.SITE ?? "http://localhost:8081";
const APP  = process.env.APP  ?? "http://localhost:3000";


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

const { chromium } = pw;
const browser = await chromium.launch({ executablePath: chromePath() });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route("https://app.potatofarm.io/**", async (route) => {
  const u = new URL(route.request().url());
  const r = await fetch(APP + u.pathname + u.search, {
    method: route.request().method(),
    headers: { "content-type": "application/json", origin: "https://potatofarm.io" },
    body: route.request().postData() ?? undefined,
  });
  const body = await r.text();
  await route.fulfill({ status: r.status, body,
    headers: { "content-type": r.headers.get("content-type") ?? "application/json",
               "access-control-allow-origin": "*" } });
});
const seen = [];
page.on("response", (r) => r.url().includes("/api/") && seen.push(`${r.request().method()} ${r.status()}`));
await page.goto(SITE + "/trakheesi-permits", { waitUntil: "load" });
await page.fill(".nextup-form input[type=email]", "reader@bluewaters.ae");
await page.click(".nextup-form button");
await page.waitForTimeout(6000);
const note = (await page.locator(".nextup-form [data-note]").textContent()).trim();
const fieldGone = (await page.locator(".nextup-form input[type=email]").count()) === 0;
const from = await page.locator(".nextup-form [name=from]").getAttribute("value");
console.log(`  api ......... ${seen.join(", ") || "NONE"}`);
console.log(`  guide tag ... ${JSON.stringify(from)}`);
console.log(`  field gone .. ${fieldGone}`);
console.log(`  note ........ ${JSON.stringify(note)}`);
await browser.close();
process.exit(seen.includes("POST 200") && fieldGone ? 0 : 1);
