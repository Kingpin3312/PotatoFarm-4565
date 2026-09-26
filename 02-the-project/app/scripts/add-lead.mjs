import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";

/**
 * Adding a lead the way numbers are actually written down.
 *
 * The audit found the form refusing "050 100 0041" and "+971 50 100
 * 0041" — both valid, both how a number is copied off a phone — and
 * answering a bad one with a raw JSON dump of the validator's output.
 * This types each form into the real dialog and reads back what was
 * stored, then types nonsense and reads what the agent is told.
 *
 *     npm run dev
 *     npm run browser:add-lead
 */
let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

// Unique per run, in a range nothing seeds.
const tail = String(Date.now()).slice(-6);
const national = `58${tail}0`.slice(0, 9);
const typed = `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
const e164 = `+971${national}`;
const NAME = `Walk-in ${tail}`;

const b = await pw.chromium.launch({ executablePath: cp() });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const p = await ctx.newPage();
await p.goto("http://localhost:3000/leads", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => document.body.innerText.length > 300, null, { timeout: 25000 });
await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await p.waitForTimeout(600);

const openDialog = async () => {
  await p.getByRole("button", { name: "Add a lead" }).first().click();
  await p.waitForSelector("dialog[open]");
};

console.log("\n=== a local number with spaces is accepted ===");
await openDialog();
await p.fill("dialog[open] input[name=phone]", typed);
await p.fill("dialog[open] input[name=name]", NAME);
await p.click("dialog[open] button[type=submit]");
await p.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 15000 }).catch(() => {});
const alert1 = await p.locator('dialog[open] [role="alert"]').first().innerText().catch(() => "");
ok(`"${typed}" is saved`, !(await p.evaluate(() => !!document.querySelector("dialog[open]"))), alert1.slice(0, 120));

/**
 * Read back from the server, not the screen: the stored number is what
 * the WhatsApp ingest and the duplicate check will compare against.
 */
const stored = await p.evaluate(async (name) => {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { search: name } } }));
  const r = await fetch(`/api/trpc/leads.list?batch=1&input=${input}`);
  const j = await r.json();
  const items = j?.[0]?.result?.data?.json?.rows ?? [];
  return items.map((i) => i.phone);
}, NAME);
ok("and stored in one form, +971 and no spaces", stored.includes(e164), JSON.stringify(stored));

console.log("\n=== the same person typed another way is a duplicate, not a second record ===");
await openDialog();
await p.fill("dialog[open] input[name=phone]", `+971 ${national.slice(0, 2)} ${national.slice(2)}`);
await p.click("dialog[open] button[type=submit]");
await p.waitForTimeout(2500);
const dup = await p.locator('dialog[open] [role="alert"]').first().innerText().catch(() => "");
ok("the clash names who already has it", /already on file/i.test(dup) && dup.includes(NAME), JSON.stringify(dup.slice(0, 120)));
await p.keyboard.press("Escape");

console.log("\n=== nonsense is explained in English ===");
await openDialog();
await p.fill("dialog[open] input[name=phone]", "12345");
await p.click("dialog[open] button[type=submit]");
await p.waitForTimeout(2500);
const msg = await p.locator('dialog[open] [role="alert"]').first().innerText().catch(() => "");
ok("the agent is told what is wrong", /phone number/i.test(msg), JSON.stringify(msg.slice(0, 160)));
ok("in a sentence, not the validator's JSON", !/[\[{]|"code"|invalid_string|custom/.test(msg), JSON.stringify(msg.slice(0, 160)));
ok("and the dialog stays open so the work is not lost", await p.evaluate(() => !!document.querySelector("dialog[open]")));

// Leave nothing behind for the next run's counts.
await p.evaluate(async (name) => {
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { search: name } } }));
  const j = await (await fetch(`/api/trpc/leads.list?batch=1&input=${input}`)).json();
  for (const i of j?.[0]?.result?.data?.json?.rows ?? []) {
    await fetch("/api/trpc/leads.remove?batch=1", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ "0": { json: { leadId: i.id } } }),
    });
  }
}, NAME);

await b.close();
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
