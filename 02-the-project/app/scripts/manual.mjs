import fs from "node:fs";
import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath } from "./_browser.mjs";

/**
 * The training manual, read inside the CRM.
 *
 * What an agent does: presses Training manual on Today, reads the pages,
 * jumps to a section, downloads the PDF — on a desk and on a phone. And
 * what must hold for that to be the real manual rather than a page that
 * looks like one: every page the contents points at exists, the download
 * is the whole PDF, and a phone can reach every section. And none of it
 * — no page, not the PDF — is served to anybody who is not signed in.
 *
 *     npm run browser:manual     (needs the app on :3000)
 */
const BASE = "http://localhost:3000";
const src = fs.readFileSync(new URL("../src/lib/manual.ts", import.meta.url), "utf8");
const PAGE_COUNT = Number(/PAGE_COUNT = (\d+)/.exec(src)[1]);
const PDF_BYTES = Number(/PDF_BYTES = (\d+)/.exec(src)[1]);
const EDITION = /EDITION = "([^"]+)"/.exec(src)[1];
const PDF_URL = /PDF_URL = "([^"]+)"/.exec(src)[1];
const CONTENTS = JSON.parse(/CONTENTS: Entry\[\] = (\[[\s\S]*\]);/.exec(src)[1]);

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`); if (!p) bad++; };

console.log("\nThe training manual, read inside the CRM\n");
const b = await pw.chromium.launch({ executablePath: chromePath() });

console.log("=== behind sign in ===");
{
  // Signed out, nothing comes back: not a page, not the PDF, and not the
  // old public copies, which anyone with the address could once fetch.
  const out = [];
  for (const u of ["/api/manual/page/01", `/api/manual/page/${String(PAGE_COUNT).padStart(2, "0")}`, "/api/manual/pdf", "/api/manual/pdf?download=1"]) {
    const r = await fetch(`${BASE}${u}`, { redirect: "manual" });
    if (r.status !== 401) out.push(`${u} → ${r.status}`);
  }
  ok("signed out, every page and the PDF are refused", out.length === 0, out.join(", "));
  const old = [];
  for (const u of [`/manual/${EDITION}/page-01.webp`, "/manual/PotatoFarm-Training-Manual.pdf"]) {
    const r = await fetch(`${BASE}${u}`, { redirect: "manual" });
    const type = r.headers.get("content-type") ?? "";
    if (r.status === 200 && /image|pdf/.test(type)) old.push(u);
  }
  ok("the old public addresses serve nothing", old.length === 0, old.join(", "));
  const r = await fetch(`${BASE}/manual`, { redirect: "manual" });
  ok("the reader itself sends a signed-out visitor to sign in", r.status >= 300 && r.status < 400 && /sign-in/.test(r.headers.get("location") ?? ""),
     `${r.status} ${r.headers.get("location") ?? ""}`);
}

console.log("\n=== signed in, every page and the PDF are there ===");
{
  const ctx = await b.newContext();
  await ctx.addCookies([...sessionCookies("dev-session-manager")]);
  const missing = [];
  for (let n = 1; n <= PAGE_COUNT; n++) {
    const r = await ctx.request.get(`${BASE}/api/manual/page/${String(n).padStart(2, "0")}`);
    if (r.status() !== 200 || !/image\/webp/.test(r.headers()["content-type"] ?? "")) missing.push(n);
  }
  ok(`all ${PAGE_COUNT} pages are served as images`, missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "");
  const pdf = await ctx.request.get(`${BASE}${PDF_URL}`);
  const bytes = await pdf.body();
  ok("the PDF is served, whole", pdf.status() === 200 && bytes.length === PDF_BYTES && bytes.subarray(0, 5).toString() === "%PDF-",
     `${pdf.status()}, ${bytes.length} of ${PDF_BYTES} bytes`);
  ok("and is not kept by a shared cache", /private/.test(pdf.headers()["cache-control"] ?? ""), pdf.headers()["cache-control"]);
  const past = await ctx.request.get(`${BASE}/api/manual/page/${String(PAGE_COUNT + 1).padStart(2, "0")}`);
  ok("a page past the end is not found", past.status() === 404, `${past.status()}`);
  const out = CONTENTS.filter((c) => !(c.page >= 1 && c.page <= PAGE_COUNT));
  ok("every contents entry points at a real page", out.length === 0, out.map((c) => c.title).join(", "));
  await ctx.close();
}

for (const [who, vp, token] of [["desk", { width: 1440, height: 900 }, "dev-session-token-ask-history"], ["phone", { width: 390, height: 844 }, "dev-session-manager"]]) {
  console.log(`\n=== on a ${who} ===`);
  const ctx = await b.newContext({ viewport: vp, acceptDownloads: true });
  await ctx.addCookies([...sessionCookies(token)]);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  p.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/manual")) errors.push(`${r.status()} ${r.url()}`); });

  await p.goto(`${BASE}/today`, { waitUntil: "domcontentloaded" });
  const link = p.getByRole("link", { name: "Training manual" });
  await link.waitFor({ timeout: 60_000 }).catch(() => {});
  ok("Today has a Training manual button", await link.count() > 0);
  await link.click();
  await p.waitForURL("**/manual", { timeout: 60_000 }).catch(() => {});
  ok("it opens the manual", p.url().endsWith("/manual"), p.url());

  await p.waitForFunction(() => { const i = document.querySelector("#page-1 img"); return i?.complete && i.naturalWidth > 0; }, null, { timeout: 60_000 }).catch(() => {});
  const shown = await p.locator("figure[id^=page-] img").count();
  ok(`all ${PAGE_COUNT} pages are on the screen, in order`, shown === PAGE_COUNT, `${shown}`);
  ok("the first page has drawn", await p.evaluate(() => (document.querySelector("#page-1 img")?.naturalWidth ?? 0) > 0));
  ok("nothing scrolls sideways", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // Jump to a section the way this device does it.
  const target = CONTENTS.find((c) => c.title === "Offers");
  if (who === "desk") await p.locator("nav[aria-label=Contents] a", { hasText: "Offers" }).first().click();
  else await p.selectOption("select", String(target.page));
  await p.waitForFunction((n) => { const r = document.getElementById(`page-${n}`)?.getBoundingClientRect(); return r && Math.abs(r.top) < 140; }, target.page, { timeout: 10_000 }).catch(() => {});
  const top = await p.evaluate((n) => Math.round(document.getElementById(`page-${n}`).getBoundingClientRect().top), target.page);
  ok(`"Offers" in the contents goes to page ${target.page}`, Math.abs(top) < 140, `${top}px from the top`);
  await p.waitForFunction((n) => { const i = document.querySelector(`#page-${n} img`); return i?.complete && i.naturalWidth > 0; }, target.page, { timeout: 30_000 }).catch(() => {});
  ok("and that page draws", await p.evaluate((n) => (document.querySelector(`#page-${n} img`)?.naturalWidth ?? 0) > 0, target.page));

  const [dl] = await Promise.all([
    p.waitForEvent("download", { timeout: 30_000 }).catch(() => null),
    p.getByRole("link", { name: /Download PDF/ }).click(),
  ]);
  const size = dl ? fs.statSync(await dl.path()).size : 0;
  ok("Download PDF saves the whole manual", dl?.suggestedFilename() === "PotatoFarm-Training-Manual.pdf" && size === PDF_BYTES,
     dl ? `${dl.suggestedFilename()}, ${size} bytes` : "no download");
  ok("no errors on the way", errors.length === 0, errors.join(" | ").slice(0, 300));
  await ctx.close();
}

console.log("\n=== found from anywhere ===");
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([...sessionCookies("dev-session-manager")]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/inbox`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  await p.keyboard.press("Control+k");
  await p.keyboard.type("training");
  await p.waitForTimeout(1200);
  ok("search finds the Training manual", await p.getByText("Training manual").count() > 0);
  await ctx.close();
}

await b.close();
console.log(bad ? `\n${bad} failed\n` : "\nAll manual checks passed\n");
process.exit(bad ? 1 : 0);
