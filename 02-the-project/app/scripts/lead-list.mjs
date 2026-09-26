import { execFileSync } from "node:child_process";
import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";

/**
 * The leads list, in a browser, past the first page.
 *
 * The audit's first P0 was invisible in a demo of forty leads: the
 * screen asked for twenty-five and never for more, so any brokerage
 * bigger than a demo saw a fraction of its book under a heading giving
 * the whole. This tops the demo brokerage up to more than two pages,
 * then scrolls, filters and selects as a person would, and removes what
 * it added.
 *
 *     npm run dev
 *     npm run browser:lead-list
 */
let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const TOKEN = "dev-session-token-ask-history";
const DB = (process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim();
const TAG = `list-check-${Date.now().toString(36)}`;

const org = sql(`select "activeOrgId" from "Session" where "sessionToken"='${TOKEN}'`);
const live = Number(sql(`select count(*) from "Lead" where "orgId"='${org}' and "deletedAt" is null and "archivedAt" is null`));
// Enough for three pages of fifty, whatever the demo holds.
const add = Math.max(0, 130 - live);
sql(`insert into "Lead" (id, "orgId", phone, name, source, tags, "updatedAt", "createdAt")
     select '${TAG}-' || g, '${org}', '+97158' || lpad((9000000 + g)::text, 7, '0'), 'Paging Buyer ' || g,
            (case when g % 4 = 0 then 'BAYUT' else 'WEBSITE' end)::"LeadSource", array['${TAG}'], now(), now() - (g || ' minutes')::interval
     from generate_series(1, ${add}) g`);
const total = live + add;

const b = await pw.chromium.launch({ executablePath: cp() });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([...sessionCookies(TOKEN)]);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/leads", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("[data-rows]", { timeout: 60000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const count = () => p.evaluate(() => document.querySelectorAll("[data-lead]").length);
  const heading = () => p.evaluate(() => Number(document.querySelector("[data-total]")?.getAttribute("data-total")));

  console.log(`\n=== ${total} leads ===`);
  await p.waitForFunction(() => Number(document.querySelector("[data-total]")?.getAttribute("data-total")) > 0);
  ok("the heading is the whole book", (await heading()) === total, `${await heading()} vs ${total}`);
  ok("the first page is fifty", (await count()) === 50, String(await count()));

  // Scroll to the end until nothing more arrives.
  for (let i = 0; i < 12 && (await count()) < total; i++) {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(900);
  }
  const all = await count();
  ok("scrolling brings in every lead", all === total, `${all} of ${total}`);
  const ids = await p.evaluate(() => [...document.querySelectorAll("[data-lead]")].map((e) => e.getAttribute("data-lead")));
  ok("and none twice", new Set(ids).size === ids.length);
  ok("and says so", await p.evaluate((t) => document.querySelector("[data-shown]")?.textContent?.includes(`${t} of ${t}`), total.toLocaleString("en-GB")));

  console.log("\n=== a filter is applied by the server, not to what is loaded ===");
  await p.selectOption('label:has-text("Source") select', "BAYUT");
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForFunction((t) => Number(document.querySelector("[data-total]")?.getAttribute("data-total")) === t,
    Number(sql(`select count(*) from "Lead" where "orgId"='${org}' and "deletedAt" is null and "archivedAt" is null and source='BAYUT'`)), { timeout: 15000 }).catch(() => {});
  const bayut = Number(sql(`select count(*) from "Lead" where "orgId"='${org}' and "deletedAt" is null and "archivedAt" is null and source='BAYUT'`));
  ok("the heading is the filtered count", (await heading()) === bayut, `${await heading()} vs ${bayut}`);
  for (let i = 0; i < 6 && (await count()) < bayut; i++) {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(900);
  }
  ok("and every Bayut lead is listed", (await count()) === bayut, `${await count()} of ${bayut}`);

  console.log("\n=== 'select all' means all that match ===");
  // A fresh page: the unfiltered list is still cached with every lead
  // loaded, and with all of them on screen there is nothing more to offer.
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.goto("http://localhost:3000/leads", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelectorAll("[data-lead]").length === 50, null, { timeout: 30000 });
  await p.getByLabel("Select all shown").check();
  const offer = p.getByRole("button", { name: new RegExp(`Select all ${total.toLocaleString("en-GB")} that match`) });
  await offer.waitFor({ timeout: 5000 }).catch(() => {});
  ok("ticking the page offers the whole match", await offer.isVisible().catch(() => false),
     `${await count()} rows; ${await p.evaluate(() => document.querySelector("[data-selected]")?.textContent ?? "no bar")}`);
  await offer.click();
  ok("and the bar counts all of them",
     (await p.evaluate(() => Number(document.querySelector("[data-selected]")?.getAttribute("data-selected")))) === total);
  await p.screenshot({ path: "/tmp/lead-list.png" }).catch(() => {});
} finally {
  await b.close();
  sql(`delete from "Lead" where id like '${TAG}-%'`);
}

console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
