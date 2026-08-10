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
 *     node demo-flow.mjs
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

const { chromium, devices } = pw;

const SHOT = process.env.SHOT_DIR ?? "/tmp";   // screenshots, not a deliverable
const browser = await chromium.launch({
  executablePath: chromePath(),
});

async function run(label, deviceOpts) {
  const ctx = await browser.newContext(deviceOpts);
  const page = await ctx.newPage();
  // Playwright will not rewrite https -> http, so fulfil the request by
  // proxying to the local app instead. The CORS header has to come back
  // too, or the browser rejects a response that the server sent happily.
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

  const errors = [];
  const seen = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => errors.push(`FAILED ${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
  page.on("response", (r) => r.url().includes("/api/") && seen.push(`${r.request().method()} ${r.status()}`));

  await page.goto(SITE + "/demo", { waitUntil: "load" });

  // A person cannot fill five fields in under three seconds; the timing
  // check drops anything that fast. Wait it out honestly.
  await page.waitForTimeout(3500);

  await page.fill("#d-name", "Layla Mansour");
  await page.fill("#d-company", "Downtown Prime Real Estate");
  await page.fill("#d-email", "layla@downtownprime.ae");
  await page.fill("#d-phone", "+971 50 448 2211");
  await page.selectOption("select[name=teamSize]", "11-50");
  await page.fill("textarea[name=message]", "Portal leads go cold overnight. We want the 2am ones answered.");
  await page.check("input[name=consent]");

  await page.click("form.dform button[type=submit]");
  await page.waitForTimeout(2500);

  const done = await page.locator(".dform-done").textContent().catch(() => null);
  const formGone = (await page.locator("form.dform").count()) === 0;
  const focused = await page.evaluate(() => document.activeElement?.className ?? "");
  const note = await page.locator("[data-note]").first().textContent().catch(() => null);

  console.log(`\n=== ${label} ===`);
  console.log(`  api calls ........... ${seen.join(", ") || "NONE"}`);
  console.log(`  form replaced ....... ${formGone}`);
  console.log(`  confirmation ........ ${done ? JSON.stringify(done.trim()) : `MISSING (note: ${JSON.stringify(note)})`}`);
  console.log(`  focus moved to ...... ${focused || "(body — a screen reader loses its place)"}`);
  console.log(`  errors .............. ${errors.length ? errors.join(" | ") : "none"}`);

  await page.screenshot({ path: `${SHOT}/demo-${label}.png` });
  await ctx.close();
  return formGone && !!done && errors.length === 0 && seen.includes("POST 200");
}

const a = await run("desktop", { viewport: { width: 1280, height: 900 } });
const b = await run("iphone", devices["iPhone 13"]);

await browser.close();
console.log(`\nBOTH PASS: ${a && b}`);
process.exit(a && b ? 0 : 1);
