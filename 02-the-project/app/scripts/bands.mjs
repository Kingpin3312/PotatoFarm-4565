import fs from "node:fs";
import path from "node:path";

/**
 * The potato vocabulary stays inside the building.
 *
 * `Golden`, `Hot`, `Warm` and `Cold` are how this product talks to an
 * agent about a lead. They are good words for that and bad words for
 * anywhere else: a buyer who finds out a brokerage has them filed as a
 * cold potato has had a bad day, and so has the brokerage.
 *
 * Nothing in the type system prevents it. `band()` returns a plain
 * object with a `label` on it, and a template string is one autocomplete
 * away from putting that label in a WhatsApp message, a vendor report or
 * a push notification. RLS does not police copy and neither does tsc.
 *
 * So the rule is enforced where it can be: **the module that owns the
 * words may not be reached from any surface that writes to a customer.**
 * Checked by following imports rather than by grepping for the words,
 * because "Hot" appears in ordinary English and the thing that matters
 * is whether the band module is in scope at all.
 *
 *     npm run check:bands
 */

const APP = path.resolve(import.meta.dirname, "..");
const SRC = path.join(APP, "src");

/** The module that owns the vocabulary. */
const OWNER = "src/server/lib/intelligence/score.ts";

/**
 * Surfaces that put words in front of somebody who is not an agent.
 *
 * Named individually rather than inferred. A list that grows by hand is
 * a list somebody reads; a clever heuristic is one that quietly stops
 * covering a new directory.
 */
const OUTWARD = [
  ["src/server/lib/whatsapp.ts", "a WhatsApp message to a buyer or an owner"],
  ["src/server/lib/whatsapp", "a WhatsApp message to a buyer or an owner"],
  ["src/server/lib/vendors", "the report an owner reads"],
  ["src/server/lib/notify", "a push notification"],
  ["src/server/lib/mail.ts", "an email"],
  ["src/server/lib/copy", "listing copy that goes to a portal"],
  ["src/server/lib/portals", "a portal feed"],
  ["src/server/lib/assistant", "the assistant, which talks to customers"],
];

let bad = 0;
const failures = [];
const ok = (l, p, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) { bad++; failures.push(d ? `${l}  — ${d}` : l); }
};

/** Every .ts/.tsx under src, relative to the app root. */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(path.relative(APP, full));
  }
  return out;
}

const files = walk(SRC);

/**
 * What each file imports, as app-relative paths.
 *
 * Only `@/` aliases and relative specifiers are resolved — a bare
 * package name cannot reach the owner module.
 */
function importsOf(rel) {
  const src = fs.readFileSync(path.join(APP, rel), "utf8");
  const out = [];
  for (const m of src.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
    const spec = m[1];
    let target;
    if (spec.startsWith("@/")) target = path.join("src", spec.slice(2));
    else if (spec.startsWith(".")) target = path.relative(APP, path.resolve(APP, path.dirname(rel), spec));
    else continue;
    // Resolve the extension the same way the bundler would.
    for (const cand of [target, `${target}.ts`, `${target}.tsx`,
                        path.join(target, "index.ts"), path.join(target, "index.tsx")]) {
      if (fs.existsSync(path.join(APP, cand)) && fs.statSync(path.join(APP, cand)).isFile()) {
        out.push(cand);
        break;
      }
    }
  }
  return out;
}

const graph = new Map(files.map((f) => [f, importsOf(f)]));

/** Everything that can reach the owner module, transitively. */
const reaches = new Set([OWNER]);
for (let changed = true; changed;) {
  changed = false;
  for (const [file, deps] of graph) {
    if (reaches.has(file)) continue;
    if (deps.some((d) => reaches.has(d))) { reaches.add(file); changed = true; }
  }
}

console.log("\n=== the module that owns the words exists ===");
ok("intelligence/score.ts is where the bands live",
   fs.existsSync(path.join(APP, OWNER))
   && /export const BANDS/.test(fs.readFileSync(path.join(APP, OWNER), "utf8")),
   OWNER);

console.log("\n=== no outward-facing surface can reach it ===");
for (const [prefix, what] of OUTWARD) {
  const hits = [...reaches].filter(
    (f) => f !== OWNER && (f === prefix || f.startsWith(prefix + "/")));
  ok(`${prefix} — ${what}`, hits.length === 0,
     hits.slice(0, 3).join(", ") || "cannot reach the bands");
}

console.log("\n=== and an agent's own screen can ===");
{
  /**
   * The other half, and the one worth having.
   *
   * A check that only forbids is satisfied by deleting the feature —
   * the vocabulary would pass this file perfectly while appearing
   * nowhere at all, which is the state it was in before today.
   */
  const screen = "src/app/(app)/leads/page.tsx";
  const router = "src/server/api/routers/leads.ts";
  ok("the leads router resolves the band", reaches.has(router),
     reaches.has(router) ? "" : "nothing computes it");
  const page = fs.existsSync(path.join(APP, screen))
    ? fs.readFileSync(path.join(APP, screen), "utf8") : "";
  ok("the leads screen renders it", /data-band=/.test(page),
     /data-band=/.test(page) ? "" : "the score is computed and shown to nobody");
}

console.log(bad
  ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n"
  : "\nthe potato talk stays between an agent and their own list.\n");
process.exit(bad ? 1 : 0);
