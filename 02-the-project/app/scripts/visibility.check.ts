import { PrismaClient } from "@prisma/client";
import { leaderboard, managerWindow } from "@/server/lib/reporting/leaderboard";

/**
 * The board shows what the brokerage chose, and the head start holds a
 * number back.
 *
 * Nothing ever wrote a `TeamVisibility` row, so the mode and the head
 * start were whatever the defaults were. And the head start was applied
 * to the `to` field of the response *after* the board had been counted
 * over the full window — a manager saw today's real figures under
 * yesterday's timestamp.
 *
 * That second one is why this check exists in the shape it does. Mode
 * filtering can be asserted by counting rows; a head start can only be
 * asserted by putting a viewing **inside** the withheld window and
 * showing that the manager's board does not count it. Anything less
 * would have passed against the broken version.
 *
 *     npm run check:visibility
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

/**
 * A second agent, created here rather than assumed.
 *
 * `RANKED` hides *other* agents, so one agent cannot demonstrate hiding
 * anything — every assertion about withholding would pass trivially.
 * The dev brokerage has one, and the tempting fix is to lower the bar
 * to what is there. That was tried once on the routing check in this
 * codebase and produced a test that could not fail.
 *
 * Created with an unmistakable address and removed at the end, so no
 * later check finds a stranger on the team.
 */
const FIXTURE = "visibility-check-agent@example.invalid";
await db.membership.deleteMany({ where: { user: { email: FIXTURE } } });
await db.user.deleteMany({ where: { email: FIXTURE } });

const existing = await db.membership.findMany({
  where: { orgId: org.id, role: "AGENT" }, select: { userId: true },
});
if (existing.length < 1) {
  console.error("needs at least one real agent to sit beside the fixture");
  process.exit(1);
}
const fixture = await db.user.create({
  data: { email: FIXTURE, name: "Second Agent" },
  select: { id: true },
});
await db.membership.create({
  data: { orgId: org.id, userId: fixture.id, role: "AGENT" },
});

const agents = [...existing, { userId: fixture.id }];
const me = existing[0]!.userId;
const other = fixture.id;

const NOW = new Date("2026-06-15T12:00:00.000Z");
const FROM = new Date(NOW.getTime() - 30 * 86_400_000);
const HEAD_START = 24;

/**
 * Two viewings for the other agent, on either side of the boundary.
 *
 * One is eight days old and inside every window. One is two hours old
 * and inside the head start, so it must appear on their own board and
 * not on a manager's. Fixed instants, not offsets from the wall clock —
 * a check whose result depends on the hour it runs at is the mixed-clock
 * mistake `crm-audit.py` has a rule about.
 */
const OLD = new Date(NOW.getTime() - 8 * 86_400_000);
const RECENT = new Date(NOW.getTime() - 2 * 3_600_000);

const listing = await db.listing.findFirst({ where: { orgId: org.id }, select: { id: true } });
const lead = await db.lead.findFirst({ where: { orgId: org.id }, select: { id: true } });
if (!listing || !lead) { console.error("needs a listing and a lead"); process.exit(1); }

await db.viewing.deleteMany({ where: { orgId: org.id, accessNote: "visibility-check" } });
await db.teamVisibility.deleteMany({ where: { orgId: org.id } });

for (const at of [OLD, RECENT]) {
  await db.viewing.create({
    data: {
      orgId: org.id, agentId: other, listingId: listing.id, leadId: lead.id,
      scheduledAt: at, status: "SCHEDULED", accessNote: "visibility-check",
    },
  });
}

const board = (opts: { seesEveryone: boolean; userId?: string }) =>
  leaderboard({
    orgId: org.id, userId: opts.userId ?? me,
    from: FROM, to: NOW, seesEveryone: opts.seesEveryone,
  });

console.log("\n=== with nothing configured, the defaults apply ===");
{
  const b = await board({ seesEveryone: false });
  ok("the mode is RANKED", b.mode === "RANKED");
  ok("the head start is 24 hours", b.headStartHours === HEAD_START);
}

console.log("\n=== the head start actually withholds a figure ===");
{
  // The agent's own view runs to now.
  const mine = await board({ seesEveryone: false, userId: other });
  const mineRow = mine.rows.find((r) => r.userId === other);
  ok("the agent's board counts both viewings", (mineRow?.viewingsBooked ?? 0) >= 2,
     `${mineRow?.viewingsBooked} counted to ${mine.countedTo.toISOString().slice(0, 16)}`);

  // The manager's runs to 24 hours earlier, so the recent one is out.
  const theirs = await board({ seesEveryone: true, userId: me });
  const theirRow = theirs.rows.find((r) => r.userId === other);
  ok("the manager's board counts one fewer",
     (theirRow?.viewingsBooked ?? 0) === (mineRow?.viewingsBooked ?? 0) - 1,
     `${theirRow?.viewingsBooked} counted to ${theirs.countedTo.toISOString().slice(0, 16)}`);

  // The assertion that would have failed against the old code, which
  // returned the full-window figures under a shifted timestamp.
  ok("and the window it reports is the window it counted",
     theirs.countedTo.getTime() === managerWindow(NOW, HEAD_START).getTime(),
     "the old version shifted the label and not the query");
}

console.log("\n=== RANKED shows your figures and nobody else's ===");
{
  const b = await board({ seesEveryone: false });
  const mine = b.rows.find((r) => r.isMe);
  const others = b.rows.filter((r) => !r.isMe);
  ok("every agent has a row", b.rows.length === agents.length, `${b.rows.length}`);
  ok("your own row carries real figures", (mine?.viewingsBooked ?? -1) >= 0);
  ok("everyone else's are withheld", others.every((r) => r.viewingsBooked === -1));
  ok("and they are named by position, not by name",
     others.every((r) => /^Agent \d+$/.test(r.name)));
}

console.log("\n=== a manager is not masked, only delayed ===");
{
  /**
   * The second bug this check found.
   *
   * `RANKED` masked every row that was not the viewer's own, and a
   * manager is not any of the agents — so a manager's board was every
   * figure `-1` and every name "Agent 3". The head start was being
   * computed carefully and handed to a board that hid the numbers
   * anyway: two mechanisms aimed at the same protection, producing a
   * screen with nothing on it.
   */
  const theirs = await board({ seesEveryone: true, userId: me });
  ok("a manager sees real figures on RANKED",
     theirs.rows.every((r) => r.viewingsBooked >= 0),
     "not a board of hidden numbers");
  ok("and real names", theirs.rows.every((r) => !/^Agent \d+$/.test(r.name)));
  ok("every agent is on it", theirs.rows.length === agents.length, `${theirs.rows.length}`);
}

console.log("\n=== OPEN shows everything, PRIVATE shows only you ===");
{
  await db.teamVisibility.create({
    data: { orgId: org.id, mode: "OPEN", agentHeadStartHours: HEAD_START },
  });
  const open = await board({ seesEveryone: false });
  ok("OPEN names everyone", open.rows.every((r) => !/^Agent \d+$/.test(r.name)));
  ok("and withholds nothing", open.rows.every((r) => r.viewingsBooked >= 0));

  await db.teamVisibility.update({
    where: { orgId: org.id }, data: { mode: "PRIVATE" },
  });
  const priv = await board({ seesEveryone: false });
  ok("PRIVATE returns one row", priv.rows.length === 1, `${priv.rows.length}`);
  ok("and it is yours", priv.rows[0]?.isMe === true);

  // The mode governs what agents see of each other. A manager still has
  // a team to manage, and the screen says so rather than letting an
  // owner assume PRIVATE hides everyone from everyone.
  const mgr = await board({ seesEveryone: true, userId: me });
  ok("a manager still sees the team on PRIVATE", mgr.rows.length === agents.length,
     `${mgr.rows.length} — the head start is what protects an agent from a manager`);
}

console.log("\n=== a zero head start means no head start ===");
{
  await db.teamVisibility.update({
    where: { orgId: org.id }, data: { mode: "RANKED", agentHeadStartHours: 0 },
  });
  const theirs = await board({ seesEveryone: true, userId: me });
  ok("the manager's window is the full window",
     theirs.countedTo.getTime() === NOW.getTime());
  const theirRow = theirs.rows.find((r) => r.userId === other);
  ok("so the recent viewing is counted", (theirRow?.viewingsBooked ?? 0) >= 2,
     `${theirRow?.viewingsBooked}`);
}

await db.viewing.deleteMany({ where: { orgId: org.id, accessNote: "visibility-check" } });
await db.teamVisibility.deleteMany({ where: { orgId: org.id } });
await db.membership.deleteMany({ where: { user: { email: FIXTURE } } });
await db.user.deleteMany({ where: { email: FIXTURE } });
await db.$disconnect();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n"
                : "\nthe board shows what was chosen, and the head start holds a number back.\n");
process.exit(bad ? 1 : 0);
