import { createHash, randomBytes } from "node:crypto";
import { crossTenant } from "../src/server/db/client";
import { orgRouter } from "../src/server/api/routers/org";
import { reconcileSeats } from "../src/server/lib/billing/reconcile";
import { seatDays } from "../src/server/lib/billing/seats";
import { fatal } from "./fatal";

/**
 * Somebody joins, somebody leaves, and the bill and the book follow.
 *
 * Two things were wrong and neither announced itself:
 *
 *   - **Seats.** The ledger an invoice is computed from was written at
 *     signup — the owner — and never again. Accepting an invitation and
 *     removing a member both skipped it; `recordSeatChange` had no
 *     caller. Every brokerage was billed for one seat whatever its size,
 *     under a team screen promising "adding someone starts their seat
 *     today".
 *   - **Removal** unassigned leads and nothing else. Upcoming viewings
 *     kept the departed agent, so the buyer arrived to nobody; follow-ups
 *     and recommendations stayed on screens nobody would open; each
 *     lead's ownership history still named them; and it was one tap
 *     with no confirmation.
 *
 * Driven through the real procedures, as the signed-in person would call
 * them, against Postgres.
 *
 *     npm run check:team-changes
 */
const root = crossTenant("sweep");
const SLUG = "team-changes-check-";
/**
 * A fresh address per run. `acceptInvite` is rate-limited by email —
 * correctly — so fixed addresses meant the fourth run in an hour was
 * refused before it reached the removal half, and a crash there prints
 * no ✗ at all: the assertions below it simply never ran.
 */
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `team-changes-check-${k}-${RUN}@example.com`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.followUp.deleteMany({ where });
    await root.recommendation.deleteMany({ where });
    await root.leadOwnership.deleteMany({ where });
    await root.viewing.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.seatEvent.deleteMany({ where });
    await root.subscription.deleteMany({ where });
    await root.invitation.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.session.deleteMany({ where: { user: { email: { startsWith: "team-changes-check-" } } } });
  await root.user.deleteMany({ where: { email: { startsWith: "team-changes-check-" } } }).catch(() => {
    // A user something else still references is left; the addresses are
    // unique per run, so a leftover cannot collide with the next one.
  });
}

async function main() {
  console.log("\nSomebody joins, somebody leaves\n");
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Team Changes Check", slug: `${SLUG}a` } });
  const person = (k: string, name: string) => root.user.upsert({
    where: { email: EMAIL(k) }, create: { email: EMAIL(k), name }, update: { name },
  });
  const owner = await person("owner", "Omar Haddad");
  const leaver = await person("leaver", "Tom Reilly");
  const heir = await person("heir", "Yasmin Haddad");
  const quiet = await person("quiet", "Sam Ortiz");
  const joiner = await person("joiner", "Lena Fischer");

  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: owner.id, role: "OWNER" },
      { orgId: org.id, userId: leaver.id, role: "AGENT" },
      { orgId: org.id, userId: heir.id, role: "AGENT" },
      { orgId: org.id, userId: quiet.id, role: "AGENT" },
    ],
  });
  const periodFrom = new Date(Date.now() - 10 * 86_400_000);
  const sub = await root.subscription.create({
    data: {
      orgId: org.id, plan: "standard", seatPriceFils: 25_700n, status: "ACTIVE",
      currentFrom: periodFrom, currentTo: new Date(Date.now() + 20 * 86_400_000),
    },
  });
  // What signup writes, and — until now — all that anything wrote.
  await root.seatEvent.create({
    data: { orgId: org.id, subId: sub.id, userId: owner.id, change: 1, reason: "signup", at: periodFrom },
  });

  const as = (userId: string, email: string | null, role: "OWNER" | "AGENT" = "OWNER") =>
    orgRouter.createCaller({
      session: { user: { id: userId, email } },
      membership: { orgId: org.id, orgName: org.name, role },
      ip: `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      userAgent: "team-changes-check",
    } as never);
  const ledger = async () =>
    (await root.seatEvent.aggregate({ where: { subId: sub.id }, _sum: { change: true } }))._sum.change ?? 0;

  /* ------------------------------------------------------------------ */
  console.log("=== the nightly check finds a ledger that forgot people ===");
  {
    // Three agents are on the team and the ledger holds only the owner —
    // exactly the state every brokerage was in.
    ok("the ledger starts wrong, as every one did", (await ledger()) === 1, `${await ledger()} seat(s) for 4 people`);
    const r = await reconcileSeats();
    ok("reconciliation corrects it", (await ledger()) === 4 && r.seatLedgersCorrected >= 1, `${await ledger()} seats`);
    const fixes = await root.seatEvent.findMany({ where: { subId: sub.id, reason: { startsWith: "reconcile" } } });
    ok("naming each person it was wrong about",
       fixes.length === 3 && new Set(fixes.map((f) => f.userId)).size === 3 && fixes.every((f) => f.change === 1));
    await reconcileSeats();
    ok("and a second run changes nothing", (await ledger()) === 4);
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== joining starts a seat ===");
  {
    const token = randomBytes(24).toString("base64url");
    await root.invitation.create({
      data: {
        orgId: org.id, email: EMAIL("joiner"), role: "AGENT",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 86_400_000), invitedById: owner.id,
      },
    });
    const before = await ledger();
    await as(joiner.id, EMAIL("joiner")).acceptInvite({ token });
    const theirs = await root.seatEvent.findMany({ where: { subId: sub.id, userId: joiner.id } });
    ok("accepting an invitation records their seat", (await ledger()) === before + 1 && theirs.length === 1 && theirs[0]!.reason === "joined",
       `${before} → ${await ledger()}`);

    // An invitation accepted by somebody already on the team — the
    // owner, here — is not a second seat.
    const again = randomBytes(24).toString("base64url");
    await root.invitation.create({
      data: {
        orgId: org.id, email: EMAIL("owner"), role: "AGENT",
        tokenHash: createHash("sha256").update(again).digest("hex"),
        expiresAt: new Date(Date.now() + 86_400_000), invitedById: owner.id,
      },
    });
    await as(owner.id, EMAIL("owner")).acceptInvite({ token: again });
    ok("somebody already on the team is not a second seat", (await ledger()) === before + 1, `${await ledger()}`);
    await reconcileSeats();
    ok("the nightly check agrees and adds nothing", (await ledger()) === before + 1,
       `${await ledger()} after reconciling`);
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== leaving hands the work on ===");
  const lead = (name: string, agentId: string) => root.lead.create({
    data: { orgId: org.id, phone: `+9715077${Math.floor(Math.random() * 1e5).toString().padStart(5, "0")}`,
            name, assignedToId: agentId, assignedAt: new Date() },
  });
  const l1 = await lead("Priya Nair", leaver.id);
  const l2 = await lead("Omar Khalid", leaver.id);
  await root.leadOwnership.createMany({
    data: [l1, l2].map((l) => ({ orgId: org.id, leadId: l.id, userId: leaver.id, reason: "FIRST_ASSIGNMENT" as const })),
  });
  // Erased once, and must stay out of anybody's book.
  const gone = await lead("Deleted Client", leaver.id);
  await root.lead.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
  const soon = await root.viewing.create({
    data: { orgId: org.id, leadId: l1.id, agentId: leaver.id, status: "CONFIRMED",
            scheduledAt: new Date(Date.now() + 2 * 86_400_000), durationMins: 30 },
  });
  const past = await root.viewing.create({
    data: { orgId: org.id, leadId: l2.id, agentId: leaver.id, status: "COMPLETED",
            scheduledAt: new Date(Date.now() - 5 * 86_400_000), durationMins: 30 },
  });
  const fu = await root.followUp.create({
    data: { orgId: org.id, agentId: leaver.id, leadId: l1.id, title: "Call Priya back", dueAt: new Date() },
  });
  await root.recommendation.create({
    data: { orgId: org.id, agentId: leaver.id, leadId: l2.id, action: "CALL",
            headline: "Call Omar", reason: "quiet", priority: 0.5 },
  });

  {
    const preview = await as(owner.id, EMAIL("owner")).removalPreview({ userId: leaver.id });
    ok("the screen is told what they hold before anything happens",
       preview.leads === 2 && preview.viewings === 1 && preview.followUps === 1, JSON.stringify(preview));

    // A successor who is not on the team: the whole removal must refuse,
    // and refuse before anything is half-done.
    let refused = false;
    try {
      await as(owner.id, EMAIL("owner")).removeMember({ userId: leaver.id, handTo: joiner.id + "-nobody" });
    } catch { refused = true; }
    const still = await root.membership.findUnique({ where: { orgId_userId: { orgId: org.id, userId: leaver.id } } });
    const stillHeld = await root.lead.count({ where: { assignedToId: leaver.id, deletedAt: null } });
    ok("a hand-over to somebody not on the team is refused, and nothing moved",
       refused && !!still && stillHeld === 2, `refused ${refused}, member ${!!still}, leads ${stillHeld}`);

    const seatsBefore = await ledger();
    const r = await as(owner.id, EMAIL("owner")).removeMember({ userId: leaver.id, handTo: heir.id });
    ok("the removal reports what moved", r.leads === 2 && r.viewings === 1 && r.followUps === 1, JSON.stringify(r));

    ok("their leads go to the successor",
       (await root.lead.count({ where: { id: { in: [l1.id, l2.id] }, assignedToId: heir.id } })) === 2);
    ok("but not a deleted one — it does not reappear in the successor's book",
       (await root.lead.findUniqueOrThrow({ where: { id: gone.id } })).assignedToId !== heir.id);
    const hist = await root.leadOwnership.findMany({ where: { leadId: l1.id }, orderBy: { startedAt: "asc" } });
    ok("each lead's history closes theirs and opens the successor's, as AGENT_LEFT",
       hist.length === 2 && hist[0]!.endedAt !== null && hist[1]!.userId === heir.id &&
       hist[1]!.reason === "AGENT_LEFT" && hist[1]!.fromUserId === leaver.id && hist[1]!.endedAt === null,
       hist.map((h) => `${h.reason}${h.endedAt ? "(closed)" : ""}`).join(" → "));
    ok("the viewing still to happen has somebody at it",
       (await root.viewing.findUniqueOrThrow({ where: { id: soon.id } })).agentId === heir.id);
    ok("the one already shown keeps who showed it",
       (await root.viewing.findUniqueOrThrow({ where: { id: past.id } })).agentId === leaver.id);
    ok("their follow-up moves too",
       (await root.followUp.findUniqueOrThrow({ where: { id: fu.id } })).agentId === heir.id);
    ok("their recommendations are retired for the sweep to redraw",
       (await root.recommendation.count({ where: { agentId: leaver.id, state: "OPEN" } })) === 0);
    ok("their seat stops today", (await ledger()) === seatsBefore - 1, `${seatsBefore} → ${await ledger()}`);
  }

  {
    // Nobody named: leads back to the pool, and follow-ups closed rather
    // than left where nobody will see them.
    const l3 = await lead("Aisha Rahman", quiet.id);
    const fu2 = await root.followUp.create({
      data: { orgId: org.id, agentId: quiet.id, leadId: l3.id, title: "Send Aisha the brochure", dueAt: new Date() },
    });
    await as(owner.id, EMAIL("owner")).removeMember({ userId: quiet.id, handTo: null });
    const back = await root.lead.findUniqueOrThrow({ where: { id: l3.id } });
    ok("with nobody named, their leads go back to the pool", back.assignedToId === null && back.assignedAt === null);
    ok("and their follow-ups are closed, not orphaned",
       (await root.followUp.findUniqueOrThrow({ where: { id: fu2.id } })).completedAt !== null);
  }

  {
    const r = await reconcileSeats();
    const members = await root.membership.count({ where: { orgId: org.id } });
    ok("after all of it, the ledger and the team agree without correction",
       (await ledger()) === members && r.seatLedgersCorrected === 0, `${await ledger()} seats, ${members} people`);
    // And the bill reads it. Seat-days over a period in which the ledger
    // held four and then five, rather than one.
    const { seatsAtEnd } = await seatDays(sub.id, periodFrom, new Date(Date.now() + 1000));
    ok("seat-days are computed from the real team", seatsAtEnd === members, `${seatsAtEnd}`);
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\nthe bill and the book follow the team.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
