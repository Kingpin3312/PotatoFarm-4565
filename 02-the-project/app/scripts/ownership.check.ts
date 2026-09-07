/**
 * A lead changing hands leaves a record, whoever moved it.
 *
 * `LeadOwnership` is what answers "why is this client not mine any
 * more". Three code paths wrote to it — first assignment, a routing
 * rule, and claiming from the pool — and all three are the machine
 * explaining itself. **A manager moving a lead by hand wrote nothing**,
 * so the one case people actually argue about was the one case with no
 * record.
 *
 * `routing.dispute` has rendered `REASSIGNED` as "a manager moved it"
 * and `MANUAL` as "a manager assigned it" since it was written: an
 * English translation table for two reasons nothing could produce.
 *
 * The other half is the pool. `bulkAssign` required an agent, so a lead
 * could be moved between people and never taken off anybody — and
 * returning one to the pool must close the old row without opening a
 * new one, because "nobody owns this" is the absence of an owner rather
 * than a row with a null one.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

const tag = randomUUID().slice(0, 8);

async function main() {
  console.log("\nA lead changing hands leaves a record\n");

  const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
  if (!org) { console.error("no organisation"); process.exit(1); }

  // A check that cannot reach what it tests must fail, not skip. This
  // whole file is about a record that was silently never written.
  const up = await fetch(`${APP}/api/health`).then((r) => r.ok).catch(() => false);
  if (!up) {
    console.error(`  Nothing is serving ${APP}. Run \`npm run build && npm run start\` first.`);
    await db.$disconnect();
    process.exit(1);
  }

  const [alice, bob] = await Promise.all([
    db.user.create({ data: { email: `own-a-${tag}@example.invalid`, name: "Alice Own" }, select: { id: true } }),
    db.user.create({ data: { email: `own-b-${tag}@example.invalid`, name: "Bob Own" }, select: { id: true } }),
  ]);
  await db.membership.createMany({
    data: [
      { orgId: org.id, userId: alice.id, role: "AGENT" },
      { orgId: org.id, userId: bob.id, role: "AGENT" },
    ],
  });

  const lead = await db.lead.create({
    data: { orgId: org.id, name: `Owned ${tag}`, phone: `+9715${Date.now() % 100000000}`, assignedToId: null },
    select: { id: true },
  });

  const rows = () => db.leadOwnership.findMany({
    where: { leadId: lead.id }, orderBy: { startedAt: "asc" },
    select: { userId: true, fromUserId: true, reason: true, actorId: true, endedAt: true },
  });

  // ---- out of the pool, by hand ----
  await handAssign(lead.id, alice.id);
  let r = await rows();
  ok("giving out a pooled lead is recorded", r.length === 1, `${r.length} row(s)`);
  ok("and the reason says a person did it", r[0]?.reason === "MANUAL", r[0]?.reason);
  // The signed-in manager, not the agent receiving the lead. Whoever
  // the development session belongs to — the assertion is that somebody
  // is named and it is not the recipient.
  ok("naming who did it, not just who got it",
     !!r[0]?.actorId && r[0]?.actorId !== alice.id, r[0]?.actorId ?? "nobody");
  ok("the row is open, because they still hold it", r[0]?.endedAt === null);

  // ---- taken off one agent and given to another ----
  await handAssign(lead.id, bob.id);
  r = await rows();
  ok("taking it off somebody is a different reason", r[1]?.reason === "REASSIGNED", r[1]?.reason);
  ok("and records who lost it, which is what a dispute turns on",
     r[1]?.fromUserId === alice.id, r[1]?.fromUserId ?? "nobody");
  ok("the previous row was closed", r[0]?.endedAt !== null,
     "two rows both claiming to be current cannot be read in either direction");

  // ---- back to the pool ----
  await handAssign(lead.id, null);
  r = await rows();
  const open = r.filter((x) => x.endedAt === null);
  ok("a lead can be returned to the pool at all", (await db.lead.findUnique({
    where: { id: lead.id }, select: { assignedToId: true },
  }))?.assignedToId === null);
  ok("returning it opens no new row", r.length === 2, `${r.length} row(s)`);
  ok("and leaves nobody holding it", open.length === 0, `${open.length} open`);
  ok("the date it was given out is cleared with the owner",
     (await db.lead.findUnique({ where: { id: lead.id }, select: { assignedAt: true } }))?.assignedAt === null,
     "a pooled lead carrying that date reads as owned to every 'how long has this been sitting' question");

  await db.leadOwnership.deleteMany({ where: { leadId: lead.id } });
  await db.lead.delete({ where: { id: lead.id } });
  await db.membership.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
  await db.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  await db.$disconnect();

  console.log(failures === 0
    ? "\n  every change of hands is on the record, including the ones a person made.\n"
    : `\n  ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * The real router, over HTTP.
 *
 * The first version of this file performed the same writes the router
 * performs, and proved nothing about the router — a replica passing is
 * a statement about the replica. If `bulkAssign` stopped writing
 * ownership rows tomorrow, that check would still have been green.
 *
 * So it posts to the endpoint the screen posts to, with the session
 * cookie under both names because `useSecureCookies` is on in
 * production and off in development. It needs a server running:
 *
 *     npm run build && npm run start
 *     npm run check:ownership
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";
const COOKIE =
  "authjs.session-token=dev-session-token-ask-history; " +
  "__Secure-authjs.session-token=dev-session-token-ask-history";

async function handAssign(leadId: string, agentId: string | null) {
  const r = await fetch(`${APP}/api/trpc/pipeline.bulkAssign?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: COOKIE },
    body: JSON.stringify({ 0: { json: { leadIds: [leadId], agentId } } }),
  });
  const body = await r.text();
  if (r.status !== 200 || body.includes('"error"')) {
    throw new Error(`bulkAssign(${agentId ?? "null"}) failed: HTTP ${r.status} ${body.slice(0, 240)}`);
  }
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
