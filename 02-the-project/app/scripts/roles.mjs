import fs from "node:fs";
import pw from "playwright";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * What each role actually meets on each screen.
 *
 * ## This check reported PASS with the server switched off
 *
 * Worth stating plainly, because it is the reason the file was
 * rewritten. The dev server died partway through a run and every screen
 * came back as Chrome's "This site can't be reached". The check said
 * PASS. Three separate faults, each of which alone was enough:
 *
 * 1. `goto(...).catch(() => {})` — a connection refusal was swallowed
 *    whole, and nothing downstream asked whether the page had loaded.
 * 2. The blank test was `text.length < 60`. Chrome's error page is
 *    longer than that, so it counted as a real page.
 * 3. **It never asserted a permission.** Every assertion was "does not
 *    crash" and "is not blank". `denied` was computed, printed, and
 *    never checked — the same shape CLAUDE.md names directly: a value
 *    that changes no behaviour. A VIEWER shown the full deal book would
 *    have passed.
 *
 * ## And before that, it was testing the signed-out page
 *
 * `dev-session-viewer` and `dev-session-compliance_officer` had no rows
 * behind them. Two of the three roles here were exercising the
 * logged-out path and asserting it did not crash. `prisma/seed.ts` owns
 * those users now, and `signedIn` below fails rather than quietly
 * measuring a redirect.
 *
 *     npm run db:seed && npm run dev
 *     npm run browser:roles
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

let bad = 0;
const failures = [];
const ok = (l, p, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`);
  if (!p) { bad++; failures.push(d ? `${l}  — ${d}` : l); }
};

/**
 * The expected outcome for every role on every screen.
 *
 * A **ratchet**, in the same spirit as `KNOWN_UNWRITTEN` in
 * `reachability.py`: it records what the permission table produces
 * today, so a change that silently opens or closes a screen fails the
 * build and a person has to confirm the new state was intended. It is
 * not an independent derivation of the rules — encoding a second copy
 * of `ROLE_PERMISSIONS` here would just be a copy to drift.
 *
 * `refused` means the screen loads and explains itself. That is the
 * behaviour being protected: a role without access should meet a
 * sentence, not a blank page, not a raw error, and not a Try again
 * button that can never work.
 *
 * **`dev-session-manager` belongs to an AGENT.** The token is named for
 * a role its user does not hold — Lena is an AGENT in this brokerage —
 * and the old file labelled the whole block MANAGER on the strength of
 * the token's name. Labelled for what it actually is, because a
 * permission check that misreports which role it exercised is worse
 * than one that skips it.
 */
const EXPECT = [
  {
    role: "VIEWER", token: "dev-session-viewer",
    refused: ["/today", "/blackbook", "/deals", "/activity"],
    allowed: ["/search", "/listings", "/pipeline"],
  },
  {
    role: "COMPLIANCE_OFFICER", token: "dev-session-compliance_officer",
    refused: ["/today", "/blackbook", "/deals", "/activity"],
    allowed: ["/search", "/listings", "/pipeline"],
  },
  {
    role: "AGENT", token: "dev-session-manager",
    refused: [],
    allowed: ["/today", "/search", "/listings", "/blackbook", "/deals", "/activity", "/pipeline"],
  },
];

/** The exact copy `QueryError` renders for a FORBIDDEN. */
const REFUSAL = /don’t have access to|do not have access to/i;
/** And for an UNAUTHORIZED, which on a signed-in role means something broke. */
const SIGNED_OUT = /been signed out/i;

const b = await pw.chromium.launch({ executablePath: chromePath() });

/**
 * Count requests, from before the page's own scripts run.
 *
 * The same fix `browser:type` needed, for the same reason. A flat
 * `waitForTimeout(2500)` read the page while its query was still in
 * flight, so a screen that was about to render a refusal was measured
 * as its own loading skeleton — "YOURS 0 people" instead of "You don't
 * have access to your blackbook". That produced two failures on one run
 * and none on the next, from identical code against identical data,
 * which is the worst kind of check: one people learn to re-run.
 *
 * `addInitScript` is load-bearing. Wrapping `fetch` after navigation is
 * too late — the queries being waited for were issued by then, using
 * the original `fetch`, so the counter reads zero and every page looks
 * finished the moment it is asked.
 */
async function settle(p) {
  const done = await p.evaluate(async () => {
    const w = /** @type {any} */ (window);
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    const text = () => (document.querySelector("main")?.innerText ?? "").trim();
    let calm = 0, last = null;
    /**
     * **Both signals, because each one alone is wrong.**
     *
     * Network-quiet alone fires in the gap between the shell's queries
     * (`org.mine`, `assistant.isRunning`) finishing and the screen's own
     * query being issued — a gap that is comfortably longer than half a
     * second on a dev server, so `/deals` was read as "Checking where
     * each one stands…" and scored as content where a refusal was due.
     *
     * Text-stability alone is worse: a page waiting on a query sits
     * perfectly still, so "nothing changed" is equally true of a
     * finished page and a stuck one. That is the exact trap
     * `browser:type` fell into.
     *
     * Together they mean: no request is in flight, at least one has
     * been made, and the rendered answer has stopped moving.
     *
     * **And even together they are not sufficient, which is why there
     * is a minimum dwell of 3.5s.** The shell's own queries satisfy
     * `__started > 0` and finish early, so there is a genuinely quiet,
     * genuinely stable window *before* the screen's query is issued —
     * and 750ms of confirmation sits comfortably inside it. Three runs
     * of this file disagreed with each other on which screens were
     * refused, from identical code against identical data, before that
     * was understood.
     *
     * This app has no single "finished" signal to wait on, so the
     * honest description is: a heuristic with an empirical floor under
     * it, chosen because a flat 3s wait was observed to be correct
     * every time and this is that with a safety net rather than
     * instead of one.
     *
     * 60 × 250ms = 15s of budget. Generous on purpose — the dev server
     * compiles each route on first hit, and an impatient check reads
     * the skeleton and calls it the answer.
     */
    for (let i = 0; i < 60; i++) {
      await nap(250);
      const now = text();
      const quiet = w.__inflight === 0 && w.__started > 0 && now === last;
      calm = quiet ? calm + 1 : 0;
      last = now;
      // MIN_DWELL is the part that is empirical rather than clever, and
      // it is doing the real work.
      if (i >= 14 && calm >= 3) return { ok: true, i, started: w.__started, inflight: w.__inflight };
    }
    return { ok: false, i: 60, started: w.__started, inflight: w.__inflight };
  });
  /**
   * Every screen this file visits fetches something, so "no request was
   * ever issued" is not a page that finished — it is a page that never
   * started, and the caller must not read it as content.
   *
   * An earlier version bailed out after 1.6s of silence to save time on
   * static pages. There are none here, and on a freshly restarted dev
   * server that early-out fired *before* hydration had issued the first
   * query — so `/deals` was measured as "Checking where each one
   * stands…" and reported as content where a refusal was expected. Two
   * failures on one run, none on the next.
   */
  await p.waitForTimeout(400);
  return done;
}

/**
 * Compile every route before asserting anything about it.
 *
 * The dev server builds a route on its first request, and the tRPC
 * handler on its first call. That put five to fifteen seconds of
 * compilation in front of the very first screen of the very first role
 * — reliably enough that the flake was always `VIEWER /activity`, the
 * alphabetically-first screen of the first block, and never the same
 * screen twice for any other role.
 *
 * Timeouts were the wrong lever: every increase made the run slower and
 * the flake rarer without removing it. Warming does remove it, because
 * the thing being waited on is gone by the time the assertions start.
 */
{
  const warm = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await warm.addCookies([...sessionCookies(EXPECT[0].token)]);
  const wp = await warm.newPage();
  const screens = [...new Set(EXPECT.flatMap((e) => [...e.allowed, ...e.refused]))];
  process.stdout.write(`warming ${screens.length} routes`);
  for (const s of screens) {
    await wp.goto(`http://localhost:3000${s}`, { waitUntil: "domcontentloaded", timeout: 60_000 })
      .catch(() => {});   // a failure here is re-tested properly below
    await wp.waitForTimeout(1500);
    process.stdout.write(".");
  }
  console.log(" done");
  await warm.close();
}

for (const { role, token, refused, allowed } of EXPECT) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([...sessionCookies(token)]);
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__inflight = 0; w.__started = 0;
    const f = w.fetch;
    w.fetch = (...a) => { w.__inflight++; w.__started++;
      return f(...a).finally(() => w.__inflight--); };
  });
  console.log(`\n=== ${role} ===`);

  for (const s of [...allowed, ...refused].sort()) {
    const shouldRefuse = refused.includes(s);
    const errs = [];
    p.removeAllListeners("pageerror");
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));

    /**
     * Not swallowed. A navigation that fails is the loudest possible
     * signal that this run measured nothing, and it used to be the
     * quietest.
     */
    let res, navErr = null;
    try {
      res = await p.goto(`http://localhost:3000${s}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
    } catch (e) {
      navErr = String(e.message).split("\n")[0].slice(0, 80);
    }
    if (navErr || !res || res.status() >= 400) {
      ok(`${role} ${s} loads`, false, navErr ?? `HTTP ${res ? res.status() : "no response"}`);
      continue;
    }
    const settled = await settle(p);
    if (!settled.ok) {
      ok(`${role} ${s} finished loading`, false,
         `still moving after 15s (started=${settled.started} inflight=${settled.inflight})`);
      continue;
    }

    const at = p.url().replace("http://localhost:3000", "");
    const main = (await p.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").trim();

    /**
     * Signed in, as somebody. Without this the whole file happily
     * measures the sign-in page, which is what it did for two of the
     * three roles for as long as it existed.
     */
    const signedIn = !at.startsWith("/sign-in") && !SIGNED_OUT.test(main);
    if (!signedIn) {
      ok(`${role} ${s} is signed in`, false,
         at.startsWith("/sign-in") ? `redirected to ${at}` : "rendered the signed-out message");
      continue;
    }

    const isRefusal = REFUSAL.test(main);
    ok(`${role} ${s} ${shouldRefuse ? "is refused, and says why" : "shows content"}`,
       isRefusal === shouldRefuse,
       isRefusal === shouldRefuse ? "" : main.slice(0, 70) || "(empty)");

    // A refusal is a sentence, never a raw error or an empty frame.
    const raw = /TRPCError|Internal Server Error|Application error|Unhandled/i.test(main);
    ok(`${role} ${s} has no raw error`, !raw && errs.length === 0,
       raw ? "raw error text on the page" : errs.join("|"));
    ok(`${role} ${s} is not blank`, main.length >= 60, `${main.length} chars`);
  }
  await ctx.close();
}

await b.close();

if (bad) {
  console.log(`\n${bad} PROBLEM(S):`);
  for (const f of failures) console.log(`  - ${f}`);
  console.log("");
} else {
  console.log("\nevery role meets the screen it should, and is told why when it may not.\n");
}
process.exit(bad ? 1 : 0);
