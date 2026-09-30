import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";

/**
 * Journey 5: an agent's day on a phone.
 *
 * There is no native app (`mobile/` cannot build), so the web app at
 * phone width is the mobile product, and this is its journey: Today, the
 * leads list, a person, a task added and ticked off, and somebody found
 * by the number they rang from — at 390 × 844 with touch, on the agent's
 * own session. Every screen is also checked for sideways scrolling,
 * which on a phone is the difference between a page and a broken one.
 *
 *     npm run dev
 *     npm run browser:mobile-agent
 */
let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const TOKEN = "dev-session-manager"; // an AGENT, despite the name — see roles.mjs
const BASE = "http://localhost:3000";

const b = await pw.chromium.launch({ executablePath: cp() });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.addCookies([...sessionCookies(TOKEN)]);
const p = await ctx.newPage();
const open = async (path, ready) => {
  await p.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(ready, { timeout: 60000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await p.waitForTimeout(800);
};
const noSideways = async (where) => {
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(`${where}: nothing scrolls sideways`, sw <= iw + 1, `${sw}px wide in a ${iw}px screen`);
};

try {
  console.log("\n=== Today ===");
  await open("/today", "h1");
  ok("opens with a greeting", /Good (morning|afternoon|evening|day)/.test(await p.textContent("h1")));
  ok("the tab bar is at the thumb", await p.getByRole("link", { name: "Inbox" }).last().isVisible());
  await noSideways("Today");

  console.log("\n=== Leads ===");
  await open("/leads", "[data-rows]");
  ok("the filters wait behind a button, so the list is on the first screen",
     await p.getByRole("button", { name: /^Filters/ }).isVisible() && !(await p.locator("#lead-filters").isVisible()));
  await noSideways("Leads");
  const first = p.locator("[data-lead] a").first();
  const name = (await first.textContent())?.trim();
  await first.tap();
  // Wait for the address to change, not a fixed interval: the row opens
  // the thread, a page the dev server compiles on its first visit.
  await p.waitForURL((u) => !u.pathname.endsWith("/leads"), { timeout: 30000 }).catch(() => {});
  await p.waitForLoadState("domcontentloaded");
  ok("tapping a lead opens them", !p.url().endsWith("/leads"), `${name} → ${p.url().replace(BASE, "")}`);
  await noSideways("the lead");
  // B8: ringing or writing to them is one tap, without scrolling.
  await p.waitForSelector("[data-quick-actions]", { timeout: 15000 }).catch(() => {});
  const quick = await p.evaluate(() => {
    const nav = document.querySelector("[data-quick-actions]");
    const call = nav?.querySelector('a[href^="tel:"]');
    const r = nav?.getBoundingClientRect();
    return { call: call?.getAttribute("href") ?? null, bottom: r ? Math.round(r.bottom) : null, labels: nav ? [...nav.children].map((c) => c.textContent) : [] };
  });
  ok("Call and Message are on the first screen", !!quick.call && quick.bottom !== null && quick.bottom <= 844,
     `${quick.labels.join(" / ")} · ends at ${quick.bottom}px · ${quick.call}`);

  console.log("\n=== A task, added and done ===");
  await open("/tasks", "h1");
  await p.getByRole("button", { name: "Add a task" }).tap();
  const title = `Mobile check ${Date.now().toString(36)}`;
  await p.fill('input[name="title"]', title);
  await p.getByRole("button", { name: "Add it" }).tap();
  await p.waitForSelector(`text=${title}`, { timeout: 15000 }).catch(() => {});
  ok("added from the phone, and on the list", await p.getByText(title).isVisible());
  await noSideways("Tasks");
  const row = p.locator("[data-task]", { hasText: title });
  await row.getByRole("button", { name: "Done" }).tap();
  await p.waitForTimeout(1500);
  ok("ticked off with a thumb", !(await p.getByText(title).isVisible().catch(() => false)));

  console.log("\n=== Somebody by the number they rang from ===");
  await open("/search", "input");
  await p.fill("input", "050 100 0003");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(3000);
  ok("found", /Emma Lindqvist|Another agent/.test(await p.textContent("main")), (await p.textContent("main"))?.slice(0, 100));
  await noSideways("Search");
  await p.screenshot({ path: "/tmp/mobile-agent.png" }).catch(() => {});
} finally {
  await b.close();
}
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
