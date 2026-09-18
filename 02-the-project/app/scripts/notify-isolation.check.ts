import { crossTenant } from "../src/server/db/client";
import { dispatch } from "../src/server/lib/notify/dispatch";
import { fatal } from "./fatal";

/**
 * Can a notification leave the brokerage it belongs to?
 *
 * `check:tenancy` proves one brokerage cannot *read* another's rows.
 * This proves the other direction, which row-level security cannot
 * police: whether this system can **send** one brokerage's data to
 * somebody outside it.
 *
 * ## The chain this exists to keep closed
 *
 * An independent review traced a live path:
 *
 *   1. `viewings.hold` took `agentId` from the client and wrote it
 *      straight to the row. RLS did not object — `orgId` comes from the
 *      session, so the insert is legitimately in-tenant, and `User` is a
 *      global table, so an id from another brokerage resolves fine.
 *   2. `notify/sweep.ts` dispatches the reminder with
 *      `assignedToId: v.agentId`.
 *   3. `audience()` returned that user at rung 0 **without checking
 *      membership** — the only branch in the function that did not scope
 *      by `orgId`.
 *   4. `sendPush` resolves devices by user id with **no org filter**.
 *
 * The result was a push carrying a buyer's name and the property they
 * were viewing, delivered to a phone in a different brokerage. Both ends
 * are fixed; this is what stops them coming apart again.
 *
 * ## Why it asserts on `Notification` rows rather than on pushes
 *
 * `sendPush` posts to Expo, which a check must not do. The row is the
 * honest boundary: `record()` writes exactly one per recipient, and a
 * row for an outsider is the leak — the push is what happens next.
 *
 *     npm run check:notify-isolation
 */
const root = crossTenant("sweep");
const SLUG = "notify-iso-";

const fails: string[] = [];
function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

async function makeOrg(name: string, email: string) {
  const org = await root.organisation.create({
    data: { name, slug: `${SLUG}${name.toLowerCase()}-${Date.now()}`, timezone: "Asia/Dubai" },
    select: { id: true },
  });
  const user = await root.user.create({
    data: { email: `${SLUG}${email}-${Date.now()}@example.com`, name },
    select: { id: true },
  });
  await root.membership.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  return { orgId: org.id, userId: user.id };
}

async function main() {
  console.log("\nCan a notification leave the brokerage it belongs to?\n");

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await root.user.deleteMany({ where: { email: { startsWith: SLUG } } });

  const a = await makeOrg("Alpha", "alpha");
  const b = await makeOrg("Bravo", "bravo");

  console.log("Two brokerages, one member each:");
  ok("Alpha and Bravo exist with separate owners", a.orgId !== b.orgId && a.userId !== b.userId);

  /**
   * A member of Bravo, named as the assignee on a notification that
   * belongs to Alpha. This is exactly the state `viewings.hold` used to
   * be able to create.
   */
  console.log("\nAlpha dispatches, naming Bravo's user as the assignee:");

  await dispatch({
    orgId: a.orgId,
    kind: "VIEWING_SOON",
    subjectId: `${SLUG}foreign`,
    title: "Viewing in an hour",
    // The real payload carries the buyer's name and the property. This
    // is the content that must not reach another brokerage.
    body: "Aisha Khan · 2-bed, Marina Gate",
    deeplink: "/viewings/x",
    assignedToId: b.userId,
    since: new Date(),
  });

  const leaked = await root.notification.count({ where: { userId: b.userId } });
  ok("no notification was written for the outsider", leaked === 0,
     leaked === 0 ? "" : `${leaked} row(s) addressed to a member of another brokerage`);

  const leakedInB = await root.notification.count({ where: { orgId: b.orgId } });
  ok("nothing was written into the other brokerage either", leakedInB === 0,
     leakedInB === 0 ? "" : `${leakedInB} row(s) in Bravo`);

  /**
   * The quieter half of the same bug. At rung 0 `audience()` returned
   * *only* the assigned user, so naming an outsider meant nobody inside
   * the brokerage was told and the viewing fell off every list. The fix
   * falls through to the role query rather than returning nothing.
   */
  const toldInstead = await root.notification.count({
    // Scoped to Alpha's *own* member, not merely to Alpha's orgId.
    // Counting by orgId alone made this assertion pass while the leak
    // was live: the leaked row carries Alpha's orgId with an outsider's
    // userId, so it counted itself as proof the team had been told.
    where: { orgId: a.orgId, userId: a.userId, subjectId: `${SLUG}foreign` },
  });
  ok("Alpha's own team was told instead of nobody", toldInstead > 0,
     toldInstead > 0 ? `${toldInstead} recipient(s)` : "silently dropped — nobody was notified");

  /* ---------------- the check must be able to fail ---------------- */
  console.log("\nThe same dispatch to a genuine member:");

  await dispatch({
    orgId: a.orgId,
    kind: "VIEWING_SOON",
    subjectId: `${SLUG}legit`,
    title: "Viewing in an hour",
    body: "Aisha Khan · 2-bed, Marina Gate",
    deeplink: "/viewings/y",
    assignedToId: a.userId,
    since: new Date(),
  });

  const delivered = await root.notification.count({
    where: { orgId: a.orgId, userId: a.userId, subjectId: `${SLUG}legit` },
  });
  /**
   * Without this the whole file passes by doing nothing: a `dispatch`
   * that silently delivered to no one would satisfy every assertion
   * above. This is the positive control.
   */
  ok("a member of the brokerage still receives it", delivered === 1,
     delivered === 1 ? "" : `${delivered} row(s) — the check above may be passing vacuously`);

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await root.user.deleteMany({ where: { email: { startsWith: SLUG } } });
}

main()
  .then(() => {
    if (fails.length) {
      console.log(`\n${fails.length} FAILURE(S)`);
      for (const f of fails) console.log(`  · ${f}`);
      console.log("");
      process.exit(1);
    }
    console.log("\na notification cannot leave the brokerage it belongs to.\n");
    process.exit(0);
  })
  .catch(fatal);
