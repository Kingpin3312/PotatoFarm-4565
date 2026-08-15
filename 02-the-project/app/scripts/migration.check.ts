import { PrismaClient } from "@prisma/client";
import { inspectContacts, summarise } from "@/server/lib/migration/quality";

/**
 * A migration can be started, and cannot be rushed.
 *
 * `migration.status` queries a `Migration` row and nothing anywhere
 * created one, so it returned null for every brokerage that has ever
 * existed. A customer could upload their old CRM export, get a full
 * quality report, and reach the end of the feature.
 *
 * What is asserted here is mostly the **refusals**, because the module's
 * whole argument is that nothing is silently fixed and nothing is
 * carried past a decision somebody has to make. A start button is easy;
 * the value is in the four things it will not let you do.
 *
 *     npm run check:migration
 */
let bad = 0;
const failures: string[] = [];
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) { bad++; failures.push(d ? `${l}  — ${d}` : l); }
};

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});
const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
if (!org) { console.error("no organisation to test against"); process.exit(1); }

await db.migration.deleteMany({ where: { orgId: org.id } });

/**
 * The same rows the screen sends, and the same inspection.
 *
 * The two phone formats are the case `migration/README.md` says earns
 * its place: the same number written four ways is one person, and gets
 * flagged rather than imported four times.
 */
const CONTACTS = [
  { id: "1", name: "Aisha Khan", phone: "+971501234567", email: "aisha@x.com" },
  { id: "2", name: "Aisha Khan", phone: "0501234567", email: null },
  { id: "3", name: "No Contact", phone: null, email: null },
];

console.log("\n=== the inspection finds what it should ===");
const issues = inspectContacts(CONTACTS, { agentEmails: new Set(["omar@marinabay.ae"]) });
const sum = summarise(issues);
{
  ok("the unreachable contact is a blocker", sum.blockers >= 1, `${sum.blockers}`);
  ok("the same number in two formats is one duplicate",
     issues.some((i) => i.kind === "duplicate"),
     "flagged rather than imported twice");
}

console.log("\n=== starting writes the record and every issue ===");
let migrationId = "";
{
  // The router's own transaction, reproduced against the same helper it
  // calls. What is being proved is that a Migration and its issues can
  // exist at all — which they could not.
  const m = await db.migration.create({
    data: {
      orgId: org.id, source: "PropSpace", state: "DRAFT",
      claimedCounts: { contacts: 3, deals: 0 },
      issues: {
        create: issues.map((i) => ({
          orgId: org.id, severity: i.severity, kind: i.kind, entity: i.entity,
          sourceRef: i.sourceRef, detail: i.detail, suggestion: i.suggestion,
        })),
      },
    },
    select: { id: true, state: true, stagedCounts: true },
  });
  migrationId = m.id;

  const stored = await db.migrationIssue.count({ where: { migrationId: m.id } });
  ok("a Migration exists", !!m.id);
  ok("with one issue per finding", stored === issues.length, `${stored} of ${issues.length}`);
  ok("it starts in DRAFT", m.state === "DRAFT");
  // A count written at the moment of starting is a claim about work not
  // yet done.
  ok("and claims nothing has been staged", m.stagedCounts === null);

  const undecided = await db.migrationIssue.count({
    where: { migrationId: m.id, decision: { not: null } },
  });
  ok("no decision is pre-filled from the suggestion", undecided === 0,
     "a pre-filled decision is a silent fix with a name on it");
}

console.log("\n=== and it will not let you rush it ===");
{
  // One at a time: `status` takes findFirst, and two open migrations
  // would make the screen somebody decides a cutover on depend on
  // insertion order.
  const open = await db.migration.count({
    where: { orgId: org.id, state: { notIn: ["COMPLETE", "ABANDONED"] } },
  });
  ok("exactly one is open", open === 1, `${open}`);

  const blockers = await db.migrationIssue.count({
    where: { migrationId, severity: "BLOCKER", decision: null },
  });
  ok("staging is blocked while a blocker has no decision", blockers > 0,
     `${blockers} undecided — the router refuses STAGED on this count`);

  // Decide it, and the count that gates staging goes to zero.
  const b = await db.migrationIssue.findFirst({
    where: { migrationId, severity: "BLOCKER" }, select: { id: true },
  });
  await db.migrationIssue.update({
    where: { id: b!.id }, data: { decision: "Skip — no way to reach them." },
  });
  const after = await db.migrationIssue.count({
    where: { migrationId, severity: "BLOCKER", decision: null },
  });
  ok("once decided, the gate opens", after === 0);

  // A DECISION-severity issue does not gate staging. Only blockers do,
  // because a blocker is a record that cannot be imported as it stands.
  const decisions = await db.migrationIssue.count({
    where: { migrationId, severity: "DECISION", decision: null },
  });
  ok("an undecided non-blocker does not gate it", decisions > 0 && after === 0,
     `${decisions} still open, and staging is allowed`);
}

console.log("\n=== the router itself refuses, not just the count ===");
{
  /**
   * Over HTTP, against the running application.
   *
   * Everything above proves the data model and the gating counts. It
   * does not prove `advance` reads them — a router that ignored the
   * blocker count would pass every assertion so far. Same reasoning as
   * `check:blocking` going at the API rather than trusting a disabled
   * button.
   *
   * Skipped, loudly, when nothing is running. A check that quietly
   * passes because it could not reach the thing it tests is the exact
   * failure this suite exists to prevent.
   */
  const APP = process.env.APP_URL ?? "http://localhost:3000";
  const call = async (proc: string, json: unknown) => {
    const r = await fetch(`${APP}/api/trpc/${proc}?batch=1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "authjs.session-token=dev-session-token-ask-history",
      },
      body: JSON.stringify({ 0: { json } }),
    });
    return { status: r.status, body: (await r.text()).slice(0, 500) };
  };

  const reachable = await fetch(`${APP}/api/health`).then(() => true).catch(() => false);
  if (!reachable) {
    console.log(`  · SKIPPED — nothing answering at ${APP}. Run \`npm run dev\`.`);
  } else {
    // Put a fresh undecided blocker back so the gate is closed again.
    await db.migrationIssue.updateMany({
      where: { migrationId, severity: "BLOCKER" }, data: { decision: null, decidedById: null },
    });
    const refused = await call("migration.advance", {
      to: "STAGED", acknowledged: ["mapping agreed"],
    });
    ok("advance to STAGED is refused while a blocker is undecided",
       /blocker/i.test(refused.body), `status ${refused.status}`);

    const skipping = await call("migration.advance", {
      to: "PARALLEL", acknowledged: ["skipping ahead"],
    });
    ok("and a stage cannot be skipped", /DRAFT|goes/i.test(skipping.body),
       `status ${skipping.status}`);

    const second = await call("migration.start", { source: "Goyzer", contacts: [], deals: [] });
    ok("a second migration is refused while one is open",
       /already under way/i.test(second.body), `status ${second.status}`);
  }
}

console.log("\n=== abandoning keeps the reason ===");
{
  await db.migration.update({
    where: { id: migrationId },
    data: { state: "ABANDONED", abandonedAt: new Date(), abandonReason: "Export was incomplete." },
  });
  const m = await db.migration.findUnique({
    where: { id: migrationId }, select: { state: true, abandonReason: true },
  });
  ok("it is abandoned with a reason on the record", m?.abandonReason !== null,
     m?.abandonReason ?? "—");

  // And the slot is free again, which is what makes "one at a time"
  // liveable rather than a dead end.
  const open = await db.migration.count({
    where: { orgId: org.id, state: { notIn: ["COMPLETE", "ABANDONED"] } },
  });
  ok("a new one can be started", open === 0);
}

await db.migration.deleteMany({ where: { orgId: org.id } });
await db.$disconnect();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n"
                : "\na migration starts, and stops where somebody has to decide.\n");
process.exit(bad ? 1 : 0);
