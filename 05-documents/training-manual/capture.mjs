import fs from "node:fs";
import pw from "playwright";
import { sessionCookies } from "../scripts/lib/session-cookie.mjs";
import { chromePath } from "../scripts/_browser.mjs";
const OUT = process.argv[2];
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const OWNER = "dev-session-token-ask-history", AGENT = "dev-session-manager", MLRO = "dev-session-compliance_officer";
const D = { width: 1440, height: 1000 }, M = { width: 390, height: 844 }, T = { width: 1440, height: 1700 };
const click = (label) => async (p) => { await p.getByRole("button", { name: label }).first().click(); await p.waitForTimeout(1500); };
const extra = [
  ["x-palette", "/today", OWNER, D, async (p) => { await p.keyboard.press("Control+k"); await p.waitForTimeout(800); await p.keyboard.type("marina"); await p.waitForTimeout(2000); }],
  ["x-add-lead", "/leads", OWNER, D, click("Add a lead")],
  ["x-add-property", "/listings", OWNER, D, click("Add a property")],
  ["x-live-type", "/inbox", OWNER, D, click("Type your own")],
  ["x-add-task", "/tasks", OWNER, D, click("Add a task")],
  ["x-connect-channel", "/settings/channels", OWNER, D, click("Connect a channel")],
  ["x-m-more", "/today", AGENT, M, async (p) => { await p.getByRole("button", { name: /More/ }).last().click(); await p.waitForTimeout(1200); }],
  ["x-m-palette", "/inbox", AGENT, M, async (p) => { await p.getByRole("button", { name: /More/ }).last().click(); await p.waitForTimeout(1200); }],
  ["x-filters", "/leads", OWNER, D, null],
];

const shots = [
  // public
  ["pub-signin", "/sign-in", null, D],
  ["pub-check-email", "/sign-in/check-your-email", null, D],
  ["pub-two-step", "/sign-in/two-step", OWNER, D],
  ["pub-signup", "/signup", null, D],
  ["pub-listing", "/p/seed-marina/MG-202", null, D],
  // owner desktop
  ["today", "/today", OWNER, T],
  ["inbox", "/inbox", OWNER, D],
  ["inbox-thread", "/inbox/cmty36uaw001d7dxy2wzo1lhr", OWNER, D],
  ["leads", "/leads", OWNER, D],
  ["leads-import", "/leads/import", OWNER, D],
  ["person", "/blackbook/cmty36ubm002b7dxygzb5ua2w", OWNER, T],
  ["blackbook", "/blackbook", OWNER, D],
  ["listings", "/listings", OWNER, D],
  ["pipeline", "/pipeline", OWNER, D],
  ["viewings", "/viewings", OWNER, D],
  ["viewings-book", "/viewings/book", OWNER, D],
  ["offers", "/offers", OWNER, D],
  ["offers-listing", "/offers/cmty36un100b27dxy4agyr7qj", OWNER, D],
  ["offers-new", "/offers/new", OWNER, D],
  ["deals", "/deals", OWNER, D],
  ["commission", "/commission", OWNER, D],
  ["vendor", "/vendors/cmty36up600cr7dxyz5c2f2q0", OWNER, D],
  ["vendor-new", "/vendors/new", OWNER, D],
  ["tasks", "/tasks", OWNER, D],
  ["activity", "/activity", OWNER, D],
  ["reports", "/reports", OWNER, T],
  ["revenue", "/reports/revenue", OWNER, D],
  ["me", "/me", OWNER, D],
  ["search", "/search", OWNER, D],
  ["ask", "/ask", OWNER, D],
  ["documents", "/documents", OWNER, D],
  ["team", "/team", OWNER, D],
  ["setup", "/setup", OWNER, D],
  ["settings", "/settings", OWNER, D],
  ["set-access", "/settings/access", OWNER, D],
  ["set-assistant", "/settings/assistant", OWNER, D],
  ["set-billing", "/settings/billing", OWNER, D],
  ["set-invoice", "/settings/billing/invoices/PF-000181", OWNER, D],
  ["set-channels", "/settings/channels", OWNER, D],
  ["set-commission", "/settings/commission", OWNER, D],
  ["set-email", "/settings/email", OWNER, D],
  ["set-hours", "/settings/hours", OWNER, D],
  ["set-import", "/settings/import", OWNER, D],
  ["set-plans", "/settings/plans", OWNER, D],
  ["set-privacy", "/settings/privacy", OWNER, D],
  ["set-routing", "/settings/routing", OWNER, D],
  ["set-security", "/settings/security", OWNER, D],
  // compliance officer
  ["compliance", "/compliance", MLRO, D],
  ["compliance-file", "/compliance/cmty36uqm00db7dxy4n6c2cio", MLRO, D],
  // agent on a phone
  ["m-today", "/today", AGENT, M],
  ["m-inbox", "/inbox", AGENT, M],
  ["m-thread", "/inbox/cmty36uaw001d7dxy2wzo1lhr", OWNER, M],
  ["m-person", "/blackbook/cmty36ubm002b7dxygzb5ua2w", AGENT, M],
  ["m-pipeline", "/pipeline", AGENT, M],
  ["m-viewings", "/viewings", AGENT, M],
  ["m-leads", "/leads", AGENT, M],
];
shots.push(...extra);
const b = await pw.chromium.launch({ executablePath: chromePath() });
const texts = fs.existsSync(`${OUT}/texts.json`) ? JSON.parse(fs.readFileSync(`${OUT}/texts.json`, "utf8")) : {};
const errs = [];
for (const [name, url, token, vp, act] of shots) {
  if (only && !only.test(name)) continue;
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1.5, timezoneId: "Asia/Dubai", locale: "en-GB" });
  // The development build's "N" badge: nobody using the real app sees it.
  await ctx.addInitScript(() => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  if (token) await ctx.addCookies([...sessionCookies(token)]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`${name}: ${e.message}`));
  p.on("response", (r) => { if (r.status() >= 500) errs.push(`${name}: ${r.status()} ${r.url()}`); });
  try {
    await p.goto("http://localhost:3000" + url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await p.waitForLoadState("load").catch(() => {});
    await p.waitForTimeout(2500);
    await p.waitForFunction(() => !/Loading/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(1200);
    if (act) await act(p);
    await p.screenshot({ path: `${OUT}/raw/${name}.png` });
    texts[name] = { url: p.url().replace("http://localhost:3000", ""), text: (await p.locator("body").innerText()).slice(0, 6000) };
    console.log("ok", name, texts[name].url);
  } catch (e) { errs.push(`${name}: ${String(e).slice(0, 120)}`); }
  await ctx.close();
}
fs.writeFileSync(`${OUT}/texts.json`, JSON.stringify(texts, null, 1));
console.log("errors", errs);
await b.close();
