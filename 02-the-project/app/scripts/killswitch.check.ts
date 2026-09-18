/**
 * The switch that starts and stops the assistant, from nothing.
 *
 * ## The bug this exists because of
 *
 * `AssistantSettings` has no row until something writes one, and the two
 * halves of one switch disagreed about that. `pause()` upserted;
 * `resume()` called `update()`. So on a brokerage that had never touched
 * the setting — **every brokerage on its first day** — pressing "Start
 * answering" returned a 500: *"An operation failed because it depends on
 * one or more records that were required but not found."*
 *
 * The product's one-line promise is that an assistant answers property
 * enquiries within seconds. The only button that switches that on did
 * not work on a fresh install, and the only route to a working
 * assistant was to **pause** it first so the row existed, then resume.
 * Nobody would guess that.
 *
 * It hid behind the asymmetry: reading `pause` proves the row gets
 * created, and reading `resume` looks correct sitting beside it.
 *
 * ## Why the kill switch deserves its own check
 *
 * It is the most safety-critical control in the product — the thing an
 * owner reaches for when the assistant has said something wrong to a
 * customer — and nothing asserted either direction of it. The ways it
 * fails are all silent: a stop that does not stop, or a start that
 * reports success while the assistant stays off.
 *
 *     npm run check:killswitch
 */
import { crossTenant } from "../src/server/db/client";
import { pause, resume, gate } from "../src/server/assistant/controls";
import { fatal } from "./fatal";

const db = crossTenant("sweep");

/**
 * `Gate` is a discriminated union and `reason` lives only on the refused
 * branch — reading it off the allowed one is a type error, correctly.
 * Narrowed here once rather than cast at each call site.
 */
const why = (g: Awaited<ReturnType<typeof gate>>) =>
  g.allowed ? "allowed" : g.reason;
let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`);
  if (!p) bad++;
};

async function main() {
  const org = await db.organisation.findFirst({
    where: { deletedAt: null },
    select: { id: true },
  });
  if (!org) fatal("no organisation — run npm run db:seed");

  const user = await db.user.findFirst({ select: { id: true } });
  if (!user) fatal("no user — run npm run db:seed");

  const before = await db.assistantSettings.findUnique({
    where: { orgId: org.id },
    select: { enabled: true, pausedReason: true },
  });

  console.log("\nThe assistant's on switch\n");
  console.log("=== from a brokerage that has never touched the setting ===");

  // The state every new customer starts in. Deleting the row is exactly
  // what a first day looks like, and it is the state the bug lived in.
  await db.assistantSettings.deleteMany({ where: { orgId: org.id } });
  ok("there is no settings row, which is a real first-day state",
     (await db.assistantSettings.count({ where: { orgId: org.id } })) === 0);

  /**
   * Off by default, and that is the safe direction. `gate()` fails
   * closed — it must not send on behalf of a brokerage that has never
   * switched it on.
   */
  const cold = await gate(org.id);
  ok("the assistant will not send before anybody enables it",
     cold.allowed === false, why(cold));

  /* --------------- the button that was broken ---------------------- */
  let started = true;
  try {
    await resume(org.id);
  } catch (e) {
    started = false;
    ok("pressing Start answering does not throw", false, String(e).slice(0, 140));
  }
  if (started) {
    ok("pressing Start answering does not throw", true);
    const row = await db.assistantSettings.findUnique({
      where: { orgId: org.id },
      select: { enabled: true },
    });
    ok("it wrote the first row itself", row !== null, JSON.stringify(row));
    ok("and the assistant is on", row?.enabled === true, `enabled=${row?.enabled}`);
    const warm = await gate(org.id);
    ok("so it is now allowed to send", warm.allowed === true, why(warm));
  }

  /* --------------- and the half that always worked ------------------ */
  console.log("\n=== stopping it, which is the direction that must never fail ===");
  await pause(org.id, user.id, "check:killswitch");
  const stopped = await db.assistantSettings.findUnique({
    where: { orgId: org.id },
    select: { enabled: true, pausedReason: true },
  });
  ok("stop turns it off", stopped?.enabled === false, `enabled=${stopped?.enabled}`);
  ok("and records why, for the audit trail",
     stopped?.pausedReason === "check:killswitch", stopped?.pausedReason ?? "(none)");
  const gated = await gate(org.id);
  ok("a stopped assistant is refused immediately, not after a cache expires",
     gated.allowed === false, why(gated));

  console.log("\n=== stop, then start, from a row that already exists ===");
  await resume(org.id);
  const again = await db.assistantSettings.findUnique({
    where: { orgId: org.id },
    select: { enabled: true, pausedReason: true },
  });
  ok("start turns it back on", again?.enabled === true, `enabled=${again?.enabled}`);
  ok("and clears the reason it was stopped",
     again?.pausedReason === null, again?.pausedReason ?? "(cleared)");

  /**
   * Left as it was found. A check that changes the demo brokerage's
   * state is a check that makes the next screenshot lie.
   */
  await db.assistantSettings.deleteMany({ where: { orgId: org.id } });
  if (before) {
    await db.assistantSettings.create({
      data: { orgId: org.id, enabled: before.enabled, pausedReason: before.pausedReason },
    });
  }

  console.log(bad === 0
    ? "\n  the assistant can be switched on by somebody who has never switched it off.\n"
    : `\n  ${bad} failure(s)\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
