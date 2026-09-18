/**
 * Playwright, resolved rather than hardcoded.
 *
 * ## The bug this deletes, six times over
 *
 * Every browser-driving script in this folder opened with:
 *
 *     import pw from "/opt/node22/lib/node_modules/playwright/index.js";
 *
 * That path is correct on exactly one machine and silently wrong
 * everywhere else. The application's own check scripts had this fixed
 * and the CI workflow records it — "until this workflow existed, these
 * scripts imported Playwright from `/opt/node22/...`" — but the fix
 * stopped at `02-the-project/app/scripts/` and never reached the six
 * files here.
 *
 * It has not bitten CI yet only by luck: `package-site.sh` probes for a
 * running server before calling `og.mjs` or `shots.mjs`, and in CI
 * neither server is up, so both are skipped. The moment somebody ran
 * the packaging script on their own machine with the app running, it
 * would have failed — and the failure would have read as "the package
 * build is broken" rather than "this import is machine-specific".
 *
 * ## Why a helper and not a bare specifier
 *
 * This directory is static site output and has no `package.json`, so
 * `import pw from "playwright"` cannot resolve from here. The
 * dependency genuinely lives in the application next door, where it is
 * a declared devDependency. So the resolution order is: the
 * application's `node_modules` first, because that is the version the
 * repository actually pins; then `PLAYWRIGHT_PATH` for an explicit
 * override; then the well-known global location, kept last as a
 * fallback rather than a default.
 *
 * It throws with an instruction rather than returning undefined. A
 * script that cannot start a browser must say so — the same argument
 * `chromePath()` makes about finding Chromium, one layer up.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  // The version this repository pins, declared in the application's
  // package.json and installed by `npm ci`.
  path.join(HERE, "..", "app", "node_modules", "playwright", "index.js"),
  process.env.PLAYWRIGHT_PATH ?? "",
  "/opt/node22/lib/node_modules/playwright/index.js",
].filter(Boolean);

const found = CANDIDATES.find((p) => fs.existsSync(p));

if (!found) {
  throw new Error(
    "Playwright could not be found. Looked in:\n" +
      CANDIDATES.map((p) => `  - ${p}`).join("\n") +
      "\n\nInstall it where the repository declares it:\n" +
      "  (cd 02-the-project/app && npm ci)\n" +
      "or point PLAYWRIGHT_PATH at an existing installation.",
  );
}

const pw = (await import(found)).default;
export default pw;
