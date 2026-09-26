import { execFileSync } from "node:child_process";

/**
 * Known vulnerabilities in what we ship, as a gate (the audit's D5).
 *
 * `npm audit --omit=dev`: production dependencies only, because a flaw
 * in a test runner is not a flaw in the product. Fails on any HIGH or
 * CRITICAL advisory that is not listed below — and a listed one expires,
 * so an accepted risk is looked at again rather than accepted for ever.
 * The same ratchet as `KNOWN_UNWRITTEN`: the list can only be argued
 * down.
 *
 *     npm run audit:deps
 */
const ACCEPTED = {
  // PostCSS inside Next.js. The flaws are in reading source maps and
  // stringifying attacker-supplied CSS at build time; this product builds
  // its own CSS from its own files and never processes a user's. The fix
  // is Next 16, a major upgrade to be done on its own, not as a side
  // effect of a scan.
  "GHSA-6g55-p6wh-862q": { until: "2026-12-31", why: "postcss via next: build-time, own CSS only; needs Next 16" },
  "GHSA-r28c-9q8g-f849": { until: "2026-12-31", why: "postcss via next: build-time source maps; needs Next 16" },
};

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  // npm exits non-zero when it finds anything; the JSON is still on stdout.
  raw = e.stdout;
}
let report;
try { report = JSON.parse(raw); } catch {
  console.log("npm audit returned no report — the registry may be unreachable. This run proved nothing.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const blocking = [];
const accepted = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== "object") continue;
    if (via.severity !== "high" && via.severity !== "critical") continue;
    const id = String(via.url ?? "").split("/").pop();
    const ok = ACCEPTED[id];
    if (ok && ok.until >= today) accepted.push(`${name} ${id} — ${ok.why} (until ${ok.until})`);
    else blocking.push(`${name} ${via.severity} ${id} — ${via.title}${ok ? ` (acceptance expired ${ok.until})` : ""}`);
  }
}

console.log(`\nProduction dependencies: ${Object.keys(report.vulnerabilities ?? {}).length} package(s) with advisories`);
for (const a of accepted) console.log(`  - accepted: ${a}`);
for (const b of blocking) console.log(`  x ${b}`);
console.log(blocking.length ? `\n${blocking.length} high or critical advisory(ies) to fix, or to accept here with a reason and a date.\n`
                            : "\nnothing high or critical that has not been looked at.\n");
process.exit(blocking.length ? 1 : 0);
