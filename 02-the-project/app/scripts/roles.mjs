import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

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

const b = await pw.chromium.launch({ executablePath: chromePath() });
let bad = 0;
const ok = (l, p, d="") => { console.log(`  ${p?"✓":"✗"} ${l}${d?`  — ${d}`:""}`); if(!p) bad++; };

const SCREENS = ["/today", "/search", "/listings", "/blackbook", "/deals", "/activity", "/pipeline"];

for (const [role, token] of [["VIEWER","dev-session-viewer"],["COMPLIANCE","dev-session-compliance_officer"],["MANAGER","dev-session-manager"]]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const p = await ctx.newPage();
  console.log(`\n=== ${role} ===`);
  for (const s of SCREENS) {
    const errs = [];
    p.removeAllListeners("pageerror");
    p.on("pageerror", (e) => errs.push(String(e).slice(0,100)));
    await p.goto(`http://localhost:3000${s}`, { waitUntil: "networkidle" }).catch(()=>{});
    await p.waitForTimeout(1600);
    const t = (await p.locator("body").innerText().catch(()=>"")).replace(/\s+/g," ");
    // A role without permission should meet a sentence, not a blank page
    // or a raw error string.
    const blank = t.trim().length < 60;
    const raw = /TRPCError|Internal Server Error|Application error|Unhandled/i.test(t);
    const denied = /does not allow|not allowed|no access|permission/i.test(t);
    console.log(`  ${s.padEnd(11)} ${blank ? "BLANK" : denied ? "explained" : "content"}  ${t.slice(0,72)}`);
    ok(`${s} does not crash`, !raw && errs.length === 0, raw ? "raw error text" : errs.join("|"));
    ok(`${s} is not a blank page`, !blank);
  }
  await ctx.close();
}
await b.close();
console.log(bad === 0 ? "\nPASS\n" : `\n${bad} PROBLEM(S)\n`);
process.exit(bad?1:0);
