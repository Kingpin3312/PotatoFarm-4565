/**
 * Waiting for a screen to have its data, not for it to have painted.
 *
 * This logic was written for `browser:type` after that suite spent its
 * whole life measuring empty pages, and the reasoning is worth keeping
 * in one place rather than pasted into each new check — the third copy
 * is where they start to drift.
 *
 * The short version, all of it learned the hard way:
 *
 * - **`networkidle` cannot be used.** `/inbox` polls, so its network
 *   never goes quiet and the run hangs for thirty seconds against a
 *   page that is working perfectly.
 * - **Waiting for the heading is not enough.** On `/leads` the `h1` is
 *   the lead *count*, which paints on the first render while the list
 *   is still in flight.
 * - **Waiting for the text to stop changing is also wrong.** A page
 *   waiting on a query sits perfectly still, so "settled" is true of a
 *   finished page and an empty one alike.
 * - **`addInitScript`, not `evaluate`.** Wrapping `fetch` after
 *   navigation is too late: the queries to wait for were already issued
 *   with the original `fetch`, the counter reads zero, and every page
 *   looks finished the moment it is asked.
 *
 * So the signal is the in-flight request count, which drops to zero
 * between polls — the same information `networkidle` wanted, without
 * the hang.
 */

/** Install the counter. Must run before the page's own scripts. */
export async function countRequests(page) {
  await page.addInitScript(() => {
    const w = /** @type {any} */ (window);
    w.__inflight = 0; w.__started = 0;
    const f = w.fetch;
    w.fetch = (...a) => {
      w.__inflight++; w.__started++;
      return f(...a).finally(() => w.__inflight--);
    };
  });
}

/** Go there, and come back when the screen actually has its data. */
export async function open(page, url, base = "http://localhost:3000") {
  await page.goto(base + url, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForSelector("h1, h2, main", { timeout: 8_000 }).catch(() => {});
  await page.evaluate(async () => {
    const w = /** @type {any} */ (window);
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    let calm = 0;
    for (let i = 0; i < 30; i++) {
      await nap(200);
      // A page that fetches nothing at all — `/sign-in` — must not cost
      // six seconds proving that a static page is static.
      if (i >= 8 && w.__started === 0) return;
      // Two consecutive quiet samples: one is satisfied in the gap
      // between a request finishing and its successor being issued,
      // which is exactly the state a page waiting on a second query is
      // in.
      calm = w.__inflight === 0 && w.__started > 0 ? calm + 1 : 0;
      if (calm >= 2) return;
    }
  });
  await page.waitForTimeout(400);
}
