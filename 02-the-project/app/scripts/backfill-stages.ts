import { PrismaClient } from "@prisma/client";
import { DEFAULT_STAGES, seedStages } from "@/server/lib/pipeline/defaults";
import { DEFAULT_HOURS, seedHours } from "@/server/lib/hours/defaults";
import { seedRoutingRule } from "@/server/lib/routing/apply";

/**
 * Give every existing brokerage a pipeline and a working week, and put
 * its stranded leads onto the board.
 *
 *     npm run backfill:stages -- --dry
 *     npm run backfill:stages
 *
 * Nothing in this codebase ever created a `PipelineStage`. Signup does
 * now, but every organisation that existed before that change has a
 * board with no columns and a set of leads with `stageId: null` that no
 * screen can show. New code does not fix old rows.
 *
 * It runs unscoped, because it is a migration across every tenant and
 * there is no current organisation to scope it to. That is the one
 * legitimate reason for this connection — and the reason this file is a
 * script you run deliberately rather than anything reachable from a
 * request.
 *
 * ## Where the leads go
 *
 * A stranded lead is mapped by its `status`, not dropped into the first
 * column: a lead already marked WON belongs in Won, and sweeping
 * everything into New would tell an owner they have thirteen fresh
 * enquiries on a Monday morning that they do not have. Anything whose
 * status has no matching stage stays where it is rather than being
 * guessed at, and is reported at the end.
 *
 * `position` is spaced by 1000 to match the board's NUMERIC ordering, so
 * a backfilled column can take a drop between two cards without an
 * immediate rebalance.
 */

const dry = process.argv.includes("--dry");
const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let orgsFixed = 0;
let stagesMade = 0;
let leadsPlaced = 0;
let hoursFixed = 0;
let rulesFixed = 0;
const unmapped: string[] = [];

const orgs = await db.organisation.findMany({
  where: { deletedAt: null },
  select: { id: true, name: true },
  orderBy: { createdAt: "asc" },
});

console.log(`${orgs.length} organisation(s)${dry ? "  [dry run — nothing is written]" : ""}\n`);

for (const org of orgs) {
  const have = await db.pipelineStage.count({ where: { orgId: org.id } });
  const stranded = await db.lead.count({
    where: { orgId: org.id, stageId: null, deletedAt: null },
  });
  /**
   * Working hours, for the same reason and with the same failure shape.
   *
   * `availableSlots()` skips any day of the week it has no row for, so
   * a brokerage with none gets an empty list from every booking query
   * and the screen reports a full diary. Counted separately from stages
   * because an organisation can plausibly have one and not the other.
   */
  const hoursHave = await db.workingHours.count({ where: { orgId: org.id } });
  let hoursMade = 0;
  if (hoursHave === 0) {
    hoursMade = dry ? DEFAULT_HOURS.length : await db.$transaction((tx) => seedHours(tx, org.id));
    hoursFixed += hoursMade ? 1 : 0;
  }

  /**
   * A routing rule, for the same reason again.
   *
   * With no rule `assignmentFor` matches nothing and every inbound lead
   * goes to the shared pool. That is a legitimate way to run a
   * brokerage and it is not one anybody chose — an owner should see a
   * rule on the screen and be able to change it.
   */
  const ruleMade = dry
    ? (await db.assignmentRule.count({ where: { orgId: org.id } })) === 0
    : await db.$transaction((tx) => seedRoutingRule(tx, org.id));
  if (ruleMade) rulesFixed++;

  if (have > 0 && stranded === 0 && hoursMade === 0 && !ruleMade) {
    console.log(`  ·  ${org.name.padEnd(28)} ${have} stages, ${hoursHave} days, nothing stranded`);
    continue;
  }

  let made = 0;
  if (have === 0) {
    made = dry
      ? DEFAULT_STAGES.length
      : await db.$transaction((tx) => seedStages(tx, org.id));
    stagesMade += made;
    orgsFixed++;
  }

  // Re-read: in a dry run there is nothing to read, so the mapping below
  // reports against what *would* exist.
  const stages = dry && have === 0
    ? DEFAULT_STAGES.map((s) => ({ id: `(new) ${s.name}`, maps: s.maps, name: s.name }))
    : await db.pipelineStage.findMany({
        where: { orgId: org.id, archived: false },
        select: { id: true, maps: true, name: true },
      });

  let placed = 0;
  if (stranded > 0) {
    const leads = await db.lead.findMany({
      where: { orgId: org.id, stageId: null, deletedAt: null },
      select: { id: true, status: true },
    });
    for (const lead of leads) {
      const stage = stages.find((s) => s.maps === lead.status);
      if (!stage) {
        unmapped.push(`${org.name}: ${lead.status}`);
        continue;
      }
      if (!dry) {
        /**
         * `stageId` only. **`stageEnteredAt` is deliberately not touched.**
         *
         * The first version stamped it with `new Date()`, on the
         * reasoning that the lead was entering a stage for the first
         * time. That is true and it is the wrong answer: the field
         * drives every staleness clock in the product — the board's
         * "Untouched 12 days", and `daysInStage` in the intelligence
         * sweep, which is what decides a lead needs chasing.
         *
         * Stamping it meant an owner ran an upgrade and arrived at a
         * board where nothing was going cold and the assistant had
         * nothing to suggest, on a pipeline that had been neglected for
         * months. Every clock reset to zero, silently, and the product
         * would have looked calm precisely when it should have been
         * loudest.
         *
         * Caught because `check:autonomy` went red: the sweep executed
         * nothing, because every lead in the test database had suddenly
         * been in its stage for zero days. The existing value already
         * reflects the lead's real history — leaving it alone is both
         * simpler and the only honest option.
         */
        await db.lead.update({
          where: { id: lead.id },
          data: { stageId: stage.id },
        });
      }
      placed++;
    }
    leadsPlaced += placed;
  }

  console.log(
    `  ✓  ${org.name.padEnd(28)} ${made ? `+${made} stages` : `${have} stages`}` +
      (hoursMade ? `, +${hoursMade} days of hours` : "") +
      (ruleMade ? ", +routing rule" : "") +
      (stranded ? `, ${placed}/${stranded} stranded leads placed` : ""),
  );
}

console.log(
  `\n${orgsFixed} organisation(s) given a pipeline · ${stagesMade} stage(s) · ` +
    `${hoursFixed} given a working week · ${rulesFixed} given a routing rule · ` +
    `${leadsPlaced} lead(s) placed`,
);

if (unmapped.length) {
  // Reported rather than guessed. A lead in a status the brokerage has
  // no column for is a real configuration question, and putting it
  // somewhere plausible is how it stops being asked.
  const counts = new Map<string, number>();
  for (const u of unmapped) counts.set(u, (counts.get(u) ?? 0) + 1);
  console.log(`\n${unmapped.length} lead(s) left unplaced — no stage maps to their status:`);
  for (const [k, n] of counts) console.log(`  ${k} × ${n}`);
}

await db.$disconnect();
