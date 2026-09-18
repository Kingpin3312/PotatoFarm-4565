/**
 * Where Chromium is — asked in one place instead of thirty-two.
 *
 * ## Why this file exists
 *
 * Thirty-two scripts in this repository launch a browser, and every one
 * of them carried its own answer to "where is Chromium". Twenty-one
 * hardcoded `/opt/pw-browsers`, a directory that exists on one developer
 * machine and on no CI runner. Four went further and pinned a single
 * build of it — `chromium-1194` — so they would also break on that one
 * machine the day Playwright's revision moved.
 *
 * The copies had drifted, which is the part worth noticing. Nine
 * guarded `readdirSync` with `existsSync` and the rest did not, so the
 * fallback they all appeared to share was unreachable in most of them:
 * on a machine without the directory they threw `ENOENT: scandir` rather
 * than handing the decision to Playwright. Four of the six read
 * `PLAYWRIGHT_BROWSERS_PATH`, the one variable that says where the
 * browsers actually are, and the other twenty-six ignored it.
 *
 * This was found the expensive way: one CI run per script, each about
 * eleven minutes, fixing the same bug in a different file each time —
 * `reveal.mjs`, then `screens.mjs`, then `type.mjs`, with eighteen more
 * waiting behind them. A class of bug fixed one instance at a time is
 * not being fixed.
 *
 * ## The order, and why it ends where it does
 *
 * `CHROME_PATH` first, because an explicit answer should beat a search.
 * Then `PLAYWRIGHT_BROWSERS_PATH`, which is what CI sets and what
 * `playwright install` honours. Then the well-known location, kept last
 * as a fallback rather than assumed as a default.
 *
 * And then `undefined`, deliberately. Returning nothing hands the
 * decision to Playwright, which fails with its own instruction to run
 * `playwright install` — a sentence that tells you what to do — instead
 * of an ENOENT naming a path the reader has never heard of. A resolver
 * that cannot find the thing should say so in the words of whoever can
 * fix it.
 */
import fs from "node:fs";

export function chromePath() {
  const explicit = process.env.CHROME_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (fs.existsSync(`${root}/chromium`)) return `${root}/chromium`;

  // The `existsSync` that most of the copies were missing. Without it
  // `readdirSync` throws on an absent directory and the `undefined`
  // below — the whole point of the function — is never reached.
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root).filter((x) => x.startsWith("chromium")).sort().reverse()) {
      const p = `${root}/${d}/chrome-linux/chrome`;
      if (fs.existsSync(p)) return p;
    }
  }

  return undefined;   // let Playwright use its own default, and its own error
}

export default chromePath;
