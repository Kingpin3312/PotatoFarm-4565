import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests, and what they are and are not for.
 *
 * `package.json` has declared `"test": "vitest run"` since the beginning
 * with no test files and no config behind it, so the command exited 1
 * and told you "No test files found". A command that claims to run tests
 * and cannot is the same shape as a button that does not do what it
 * says — and this project treats that as a bug everywhere else.
 *
 * **These do not replace the eleven check suites.** Those need a real
 * Postgres because what they prove — tenant isolation above all — cannot
 * be proved against a mock. What lives here is the opposite: pure
 * functions, no database, no network, milliseconds, runnable on a laptop
 * with nothing installed.
 *
 * The selection is not "whatever was easy to test". Every case below is
 * a bug that actually happened in this codebase, or a rule whose failure
 * would be silent and expensive. If a test here ever looks arbitrary,
 * check whether the behaviour it pins is still deliberate before
 * changing it.
 */
export default defineConfig({
  resolve: {
    // The app imports by `@/…` and the tests import the same modules the
    // application does, rather than a copy with different paths.
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A run that finds nothing is a failure, not a pass. This is the
    // exact hole that let the command sit broken: `vitest run` with no
    // files is not success, and CI must not read it as such.
    passWithNoTests: false,
  },
});
