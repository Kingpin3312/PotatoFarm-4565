import { execFileSync } from "node:child_process";
import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";

/**
 * Importing a spreadsheet through the screen.
 *
 * `check:import-export` proves the procedures; this proves a person can
 * reach them: choose a file, see the guessed columns, check, import, and
 * find the people on the list. Removes what it added.
 *
 *     npm run dev
 *     npm run browser:import-leads
 */
let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const TOKEN = "dev-session-token-ask-history";
const DB = (process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
const sql = (q) => execFileSync("psql", [DB, "-Atc", q], { encoding: "utf8" }).trim();
const org = sql(`select "activeOrgId" from "Session" where "sessionToken"='${TOKEN}'`);
const n = String(Date.now()).slice(-6);
const TAG = `browser import ${n}`;
const csv = [
  "Client Name,Mobile Number,Email,Source",
  `"Test, Import One",056 1${n},one-${n}@example.com,Bayut`,
  `Test Import Two,+971 56 2${n},,Referral`,
  `Test Import Three,not a number,,`,
].join("\n");

const b = await pw.chromium.launch({ executablePath: cp() });
try {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 } });
  await ctx.addCookies([...sessionCookies(TOKEN)]);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/leads/import", { waitUntil: "domcontentloaded" });
  await p.waitForSelector('input[type=file]', { timeout: 60000 });
  await p.waitForTimeout(800);
  await p.setInputFiles('input[type=file]', { name: "old-crm.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForSelector("[data-rows]", { timeout: 10000 });
  ok("the file is read, quoted comma and all", (await p.getAttribute("[data-rows]", "data-rows")) === "3");
  ok("the phone column is guessed", (await p.inputValue('select[data-field="phone"]')) === "Mobile Number");
  ok("and the name column", (await p.inputValue('select[data-field="name"]')) === "Client Name");
  await p.getByRole("button", { name: "Check the file" }).click();
  await p.waitForSelector("[data-counts]", { timeout: 15000 });
  const counts = JSON.parse(await p.getAttribute("[data-counts]", "data-counts"));
  ok("two new, one that can't come in", counts.new === 2 && counts.error === 1, JSON.stringify(counts));
  ok("and it says which line and why", await p.getByText(/line 4/).isVisible() && await p.getByText(/isn't a phone number/).isVisible());
  ok("nothing written yet", sql(`select count(*) from "Lead" where "orgId"='${org}' and name like 'Test%Import%'`) === "0");
  await p.fill('input[placeholder^="import "]', TAG);
  await p.getByRole("button", { name: /^Import 2 leads$/ }).click();
  await p.waitForSelector('[role="status"]', { timeout: 20000 });
  ok("the screen says what happened", /2 added/.test(await p.textContent('[role="status"]')));
  const stored = sql(`select phone from "Lead" where "orgId"='${org}' and '${TAG}' = any(tags) order by phone`).split("\n");
  ok("both stored, numbers in one format", stored.length === 2 && stored.every((x) => /^\+9715\d{8}$/.test(x)), stored.join(","));
  await p.screenshot({ path: "/tmp/import-leads.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  sql(`delete from "LeadOwnership" where "leadId" in (select id from "Lead" where '${TAG}' = any(tags))`);
  sql(`delete from "Requirement" where "leadId" in (select id from "Lead" where '${TAG}' = any(tags))`);
  sql(`delete from "Lead" where '${TAG}' = any(tags)`);
}
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
