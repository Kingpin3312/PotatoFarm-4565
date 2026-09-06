/**
 * The links on a viewing card, read off the rendered page.
 *
 * `check:links` proves the URL builders are right. This proves the
 * screen uses them — which is a different claim, and the one that was
 * false: `whatsapp()` was correct from the day it was written and no
 * mounted component had ever called it.
 */
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
import { sessionCookies } from "./lib/session-cookie.mjs";

let failed = 0;
const ok = (what, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${what}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed++;
};

const chrome = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await pw.chromium.launch({ executablePath: chrome });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(sessionCookies("dev-session-token-ask-history"));
const p = await ctx.newPage();
await p.goto("http://localhost:3000/viewings", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);

console.log("Viewing card links\n");

const links = await p.$$eval("article a[href]", (as) =>
  as.map((a) => ({ text: (a.textContent || "").trim(), href: a.getAttribute("href") || "" }))
);
ok("the day has viewings to check", links.length > 0, `${links.length} link(s)`);

const dirs = links.filter((l) => l.text === "Directions");
const was  = links.filter((l) => l.text === "WhatsApp");
const tels = links.filter((l) => l.text === "Call");

ok("every card offers Directions", dirs.length > 0, `${dirs.length}`);
ok("every card offers WhatsApp", was.length > 0, `${was.length}`);
ok("every card offers Call", tels.length > 0, `${tels.length}`);
ok("one of each per card", dirs.length === was.length && was.length === tels.length,
   `${dirs.length}/${was.length}/${tels.length}`);

for (const d of dirs) {
  ok("Directions routes rather than pins",
     d.href.includes("/maps/dir/") && d.href.includes("api=1") && d.href.includes("travelmode="),
     d.href);
}
for (const w of was) {
  ok("WhatsApp is a wa.me link with digits only",
     /^https:\/\/wa\.me\/\d{8,15}(\?text=|$)/.test(w.href), w.href);
  ok("WhatsApp carries no stray zero after the country code",
     !/wa\.me\/9710/.test(w.href), w.href);
  ok("WhatsApp opens the buyer, not the brokerage",
     !w.href.startsWith("https://wa.me/971553168157"), w.href);
}
for (const t of tels) {
  ok("Call is a dialable tel: URI", /^tel:\+?\d{8,}$/.test(t.href), t.href);
}
for (const l of [...dirs, ...was]) {
  let good = true;
  try { new URL(l.href); } catch { good = false; }
  ok("the href parses as an absolute URL", good, l.href);
}

await b.close();
console.log(failed === 0
  ? "\n  every action on a viewing card points somewhere real.\n"
  : `\n  ${failed} link problem(s).\n`);
process.exit(failed === 0 ? 0 : 1);
