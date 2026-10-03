import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";
import { targets, skipped, db } from "./lib/screen-targets.mjs";

/**
 * Every screen at 320px, the narrowest phone still sold, and whether the
 * page scrolls sideways.
 *
 * On a phone a page that is wider than the screen is a broken page: it
 * drifts under the thumb, and whatever sits past the edge — usually the
 * button the row exists for — is off screen. Nothing errors, so no other
 * check sees it. `browser:brand` measured one screen at nine widths and
 * `browser:mobile-agent` walks a journey at 390px; neither walked every
 * screen at the narrow end, and three were over:
 *
 *   - the leads list, once a manager's Import and Export arrived with
 *     their permissions — the row fitted until the role loaded;
 *   - search, whose box would not shrink below its natural width
 *     because a flex child's minimum is its content (`min-w-0`);
 *   - import, whose file picker is a fixed 300px wide.
 *
 * Measured after the page settles, as each role, because what a page
 * holds differs by role and the leads list only overflowed for a
 * manager. A failure names the innermost element past the edge, which is
 * the one to fix — the fixed bottom bar stretches with the page and is
 * never the cause.
 *
 *     npm run dev
 *     npm run browser:narrow
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";
const WIDTH = 320;
const ROLES = [
  ["owner", "dev-session-token-ask-history"],
  ["agent", "dev-session-token-agent-view"],
];

let failed = 0;
const b = await pw.chromium.launch({ executablePath: cp() });
for (const [role, token] of ROLES) {
  console.log(`\n=== ${targets.length} screens at ${WIDTH}px, as the ${role} ===`);
  const ctx = await b.newContext({ viewport: { width: WIDTH, height: 800 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([...sessionCookies(token)]);
  const p = await ctx.newPage();
  for (const url of targets) {
    try {
      await p.goto(`${APP}${url}`, { waitUntil: "networkidle", timeout: 45000 });
    } catch (e) {
      // A screen that will not load is `browser:screens`' finding, not
      // this one's; say so rather than reporting it as fitting.
      console.log(`  ✗ ${url} — did not load: ${String(e.message).split("\n")[0]}`);
      failed++;
      continue;
    }
    // Permissions and lists arrive after the shell; the leads list fitted
    // until they did.
    await p.waitForTimeout(2000);
    const r = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const over = document.documentElement.scrollWidth - W;
      if (over <= 1) return { over: 0 };
      const past = [...document.querySelectorAll("body *")].filter((e) => {
        if (e.getBoundingClientRect().right <= W + 1) return false;
        for (let a = e; a; a = a.parentElement) if (getComputedStyle(a).position === "fixed") return false;
        return true;
      });
      const inner = past.filter((e) => !past.some((o) => o !== e && e.contains(o)));
      return {
        over,
        who: inner.slice(0, 3).map((e) =>
          `${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}"`),
      };
    });
    if (r.over > 0) {
      failed++;
      console.log(`  ✗ ${url} — ${r.over}px wider than the screen: ${r.who.join(", ") || "nothing outside a fixed bar"}`);
    } else {
      console.log(`  ✓ ${url}`);
    }
  }
  await ctx.close();
}
await b.close();
await db.$disconnect();

if (skipped.length) console.log(`\nnot opened: ${skipped.join("; ")}`);
console.log(failed ? `\n${failed} FAILED` : "\nevery screen fits a 320px phone");
process.exit(failed ? 1 : 0);
