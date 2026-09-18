import fs from "node:fs";
import path from "node:path";

/**
 * Every rate-limit rule is invoked, and every invocation has a rule.
 *
 * ## Why this exists
 *
 * `ratelimit.ts` defined `auth.magicLink` — five attempts in fifteen
 * minutes — from the day it was written, and **nothing ever called it**.
 * `POST /api/auth/signin/resend` took unlimited requests and sent a real
 * email through Resend for each one, from the verified sending domain.
 * The rule was right there in the table, so every review of that file
 * read as "the front door is throttled".
 *
 * It is the shape CLAUDE.md names directly — a declared thing that
 * changes no behaviour — and no existing check could see it:
 * `architecture.py` looks for modules nothing imports and `ratelimit.ts`
 * is imported six times; `reachability.py` looks for models nothing
 * writes and this one writes `RateLimitHit` constantly. The gap was one
 * *key* inside a table that is otherwise fully used.
 *
 * ## The second direction, which is the quieter one
 *
 *     export async function limit(action, key) {
 *       const rule = RULES[action];
 *       if (!rule) return { ok: true };   // <-- allows everything
 *
 * A typo in an action name does not throw and does not warn. It returns
 * "allowed", for ever. So `limitAll("auth.magiclink", …)` would look
 * exactly like a wired limit at the call site and enforce nothing at
 * all — the same bug with a lowercase L, and harder to see because the
 * call is right there.
 *
 * Both directions are checked below. Static — no database, no server.
 *
 *     npm run check:limits
 */
const APP = path.resolve(import.meta.dirname, "..");
const RULES_FILE = path.join(APP, "src/server/lib/ratelimit.ts");

let bad = 0;
const ok = (label, pass, detail = "") => {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) bad++;
};

const rulesSrc = fs.readFileSync(RULES_FILE, "utf8");

/**
 * The keys of the RULES table.
 *
 * Read from the `const RULES` block only. Scanning the whole file would
 * also pick up the quoted action names inside this file's own comments,
 * which is how a check comes to confirm its own documentation.
 */
const block = rulesSrc.match(/const RULES[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!block) {
  console.log("  ✗ could not find the RULES table in ratelimit.ts");
  process.exit(1);
}
const defined = new Set(
  [...block[1].matchAll(/^\s*"([a-zA-Z][\w.]*)"\s*:/gm)].map((m) => m[1]),
);

/** Every `limitAll("x", …)` / `limit("x", …)` across the application. */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const invoked = new Map();
for (const file of walk(path.join(APP, "src"))) {
  if (file === RULES_FILE) continue;
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\blimit(?:All)?\(\s*"([^"]+)"/g)) {
    if (!invoked.has(m[1])) invoked.set(m[1], path.relative(APP, file));
  }
}

console.log("\nRate limits\n");
console.log(`  ${defined.size} rule(s) defined, ${invoked.size} invoked\n`);

// 1. A rule nobody calls protects nothing.
const unused = [...defined].filter((r) => !invoked.has(r));
ok("every rule is invoked somewhere", unused.length === 0,
   unused.length ? `never called: ${unused.join(", ")}` : [...defined].join(", "));

// 2. A call whose action has no rule is silently allowed for ever.
const unknown = [...invoked].filter(([a]) => !defined.has(a));
ok("every invocation has a rule", unknown.length === 0,
   unknown.length
     ? unknown.map(([a, f]) => `"${a}" in ${f} matches no rule — allows everything`).join("; ")
     : "no typo'd action names");

// 3. The front door specifically, by name. The others are commercial or
//    cost controls; this one is the account-takeover and inbox-bombing
//    surface, and it is the one that was missing.
ok("the sign-in path is throttled",
   invoked.has("auth.magicLink"),
   invoked.get("auth.magicLink") ?? "auth.magicLink is NOT wired to anything");

console.log(bad === 0
  ? "\nevery limit is declared and enforced.\n"
  : `\n${bad} PROBLEM(S)\n`);
process.exit(bad ? 1 : 0);
