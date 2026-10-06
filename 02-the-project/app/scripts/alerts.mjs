import pw from "playwright";
import { createECDH, randomBytes } from "node:crypto";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";
import { PrismaClient } from "@prisma/client";

/**
 * Phone alerts, in a browser, against the production build.
 *
 * `check:web-push` proves the server half against a stand-in push
 * service. This proves the half only a browser can show:
 *
 *   - the service worker turns a push into a notification, and a tap on
 *     it opens the page it names — and never another site, whatever the
 *     payload says;
 *   - a payload that will not parse still shows an alert (Safari
 *     withdraws push permission from a site whose pushes show nothing);
 *   - the Phone alerts section says the right thing in each state: an
 *     iPhone not yet installed, notifications blocked, ready, on;
 *   - turning alerts on registers this phone, and off removes it.
 *
 * Headless Chromium cannot reach a real push service, so the browser's
 * `pushManager.subscribe` is replaced with one returning a subscription
 * in the exact shape a browser returns (a Google endpoint, a real P-256
 * key and auth secret). Everything after that — the page, the API, the
 * server's checks — is the real thing. The push itself is delivered to
 * the worker through the DevTools protocol, the way Chrome's own tests
 * deliver one.
 */

const APP = process.env.APP_URL ?? "http://localhost:3000";
const TOKEN = "dev-session-manager"; // Lena Popescu, an agent

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`); if (!p) bad++; };

/** A subscription as a browser would hand it over. */
function fakeSubscription() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/alerts-check-${randomBytes(8).toString("hex")}`,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

/** Replaces the browser's push subscription with an in-memory one. */
const STUB = (sub) => {
  let current = null;
  const make = (key) => ({
    endpoint: sub.endpoint,
    options: { applicationServerKey: key },
    toJSON: () => ({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }),
    unsubscribe: async () => { current = null; return true; },
  });
  PushManager.prototype.subscribe = async function (opts) { current = make(opts.applicationServerKey.buffer ?? opts.applicationServerKey); return current; };
  PushManager.prototype.getSubscription = async function () { return current; };
};

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } } });
/** This check's made-up subscriptions, from this run or an interrupted one. */
const tidy = () => db.pushDevice.deleteMany({ where: { token: { startsWith: "https://fcm.googleapis.com/fcm/send/alerts-check-" } } });
await tidy();

const b = await pw.chromium.launch({ executablePath: cp() });
try {
  console.log("\n=== the service worker: a push becomes an alert ===");
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.grantPermissions(["notifications"], { origin: APP });
    await ctx.addCookies([...sessionCookies(TOKEN)]);
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("ServiceWorker.enable");
    const regs = new Map();
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
      for (const r of e.registrations) if (!r.isDeleted) regs.set(r.scopeURL, r.registrationId);
    });
    await p.goto(`${APP}/me`, { waitUntil: "load" });
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.waitForTimeout(500);
    const registrationId = regs.get(`${APP}/`);
    ok("the app's service worker is registered", !!registrationId);

    const deliver = async (data) => {
      await p.evaluate(() => navigator.serviceWorker.ready.then((r) => r.getNotifications()).then((ns) => ns.forEach((n) => n.close())));
      await cdp.send("ServiceWorker.deliverPushMessage", { origin: APP, registrationId, data });
      await p.waitForTimeout(800);
      return p.evaluate(() => navigator.serviceWorker.ready
        .then((r) => r.getNotifications())
        .then((ns) => ns.map((n) => ({ title: n.title, body: n.body, url: n.data && n.data.url, tag: n.tag }))));
    };

    const shown = await deliver(JSON.stringify({ title: "Viewing in an hour", body: "Marina Gate 1, 2-bed.", url: "/viewings", tag: "/viewings", urgent: true }));
    ok("an alert is shown, with its words", shown.length === 1 && shown[0].title === "Viewing in an hour" && shown[0].body === "Marina Gate 1, 2-bed.", JSON.stringify(shown));
    ok("and it opens the page it names", shown[0]?.url === "/viewings");

    for (const [what, url] of [["another site", "https://attacker.example.com/"], ["a protocol-relative address", "//attacker.example.com/x"], ["a backslash trick", "/\\attacker.example.com"], ["a script address", "javascript:alert(1)"]]) {
      const n = await deliver(JSON.stringify({ title: "x", body: "y", url }));
      ok(`a tap never leaves the app: ${what}`, n[0]?.url === "/today", n[0]?.url);
    }

    const garbled = await deliver("not json at all");
    ok("an unreadable push still shows an alert, rather than nothing", garbled.length === 1 && garbled[0].title === "PotatoFarm.io", JSON.stringify(garbled));
    await ctx.close();
  }

  console.log("\n=== the Phone alerts section ===");
  {
    // An iPhone in Safari, not yet on the Home Screen: no PushManager.
    const ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    });
    await ctx.addCookies([...sessionCookies(TOKEN)]);
    await ctx.addInitScript(() => { delete window.PushManager; });
    const p = await ctx.newPage();
    await p.goto(`${APP}/me`, { waitUntil: "load" });
    const sec = p.locator("section[aria-labelledby=alerts-h]");
    await sec.waitFor({ timeout: 20000 });
    const t = await sec.innerText();
    ok("an iPhone in Safari is told to add it to the Home Screen first", /Add to Home Screen/.test(t) && !/Turn on alerts/.test(t), t.slice(0, 90));
    await ctx.close();
  }
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([...sessionCookies(TOKEN)]);
    await ctx.addInitScript(() => { Object.defineProperty(Notification, "permission", { get: () => "denied" }); });
    const p = await ctx.newPage();
    await p.goto(`${APP}/me`, { waitUntil: "load" });
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.reload({ waitUntil: "load" });
    const sec = p.locator("section[aria-labelledby=alerts-h]");
    await sec.waitFor({ timeout: 20000 });
    await p.waitForTimeout(800);
    const t = await sec.innerText();
    ok("blocked notifications are named, with where to allow them", /blocked/.test(t) && /settings/.test(t) && !/Turn on alerts/.test(t), t.slice(0, 90));
    await ctx.close();
  }
  {
    const sub = fakeSubscription();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.grantPermissions(["notifications"], { origin: APP });
    await ctx.addCookies([...sessionCookies(TOKEN)]);
    await ctx.addInitScript(STUB, sub);
    const p = await ctx.newPage();
    // A first visit, with no reload: the service worker is still
    // registering when the section first asks for it.
    await p.goto(`${APP}/me`, { waitUntil: "load" });
    const sec = p.locator("section[aria-labelledby=alerts-h]");
    const on = sec.getByRole("button", { name: "Turn on alerts on this phone" });
    await on.waitFor({ timeout: 20000 }).catch(() => {});
    ok("ready, on a first visit: one button to turn them on", await on.isVisible().catch(() => false),
       (await sec.innerText().catch(() => "")).replace(/\s+/g, " ").slice(80, 200));

    await on.click();
    await p.locator("section[data-phone-alerts=on]").waitFor({ timeout: 15000 }).catch(() => {});
    const t = await sec.innerText();
    ok("turned on: it says so, for this phone", /Alerts are on for this/.test(t), t.replace(/\s+/g, " ").slice(0, 120));
    const mine = sec.locator("[data-device=this]");
    await mine.first().waitFor({ timeout: 10000 }).catch(() => {});
    ok("and lists it once, as this phone, receiving",
       (await mine.count()) === 1 && (await mine.first().innerText()).includes("Receiving"));

    await sec.getByRole("button", { name: "Turn off on this phone" }).click();
    await p.locator("section[data-phone-alerts=off]").waitFor({ timeout: 15000 }).catch(() => {});
    ok("turned off: the button to turn them on is back", await sec.getByRole("button", { name: "Turn on alerts on this phone" }).isVisible().catch(() => false));
    ok("and the phone is no longer registered", (await db.pushDevice.count({ where: { token: sub.endpoint } })) === 0);

    // On again, then a test the push service will not accept: this
    // subscription is made up, and Google answers 410 for it (or is not
    // reachable at all from a sandbox). Either way the page has to say
    // so, and show the phone as it now is.
    await sec.getByRole("button", { name: "Turn on alerts on this phone" }).click();
    await p.locator("section[data-phone-alerts=on]").waitFor({ timeout: 15000 }).catch(() => {});
    await sec.getByRole("button", { name: "Send a test" }).click();
    const said = sec.locator("[role=status], [role=alert]").filter({ hasText: /Sent to|alert service|No phone has|Give it a minute/ }).first();
    await said.waitFor({ timeout: 15000 });
    ok("a test that does not get through says so, and what to do", /didn't accept it/.test(await said.innerText()), (await said.innerText()).slice(0, 90));
    await p.waitForTimeout(1500);
    const row = await db.pushDevice.findFirst({ where: { token: sub.endpoint }, select: { failedAt: true, failReason: true } });
    // Dead only because the push service said so — never because this
    // server failed to sign or encrypt (which also reads as "dead", and
    // is exactly what a broken import of the push library looked like).
    ok("the server signed, encrypted and sent it; the push service answered",
       !/could not encrypt|not set up|refused/.test(row?.failReason ?? ""), row?.failReason ?? "accepted, or not reachable");
    const state = await p.locator("section[data-phone-alerts]").getAttribute("data-phone-alerts");
    const shown = await mine.first().innerText().catch(() => "");
    ok("and the page shows the phone as it now is",
       row?.failedAt ? state === "off" && /stopped/.test(shown) : state === "on" && /Receiving/.test(shown),
       `${row?.failedAt ? "dead" : "alive"} · page ${state} · ${shown.replace(/\s+/g, " ")}`);
    await ctx.close();
  }
} finally {
  await b.close();
  await tidy();
  await db.$disconnect();
}

console.log(bad ? `\n${bad} FAILED\n` : "\nphone alerts: the worker, the page and the switch all do what they say.\n");
process.exit(bad ? 1 : 0);
