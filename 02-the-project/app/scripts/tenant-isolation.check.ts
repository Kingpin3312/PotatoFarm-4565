/**
 * Can one brokerage see another's data?
 *
 * This is the product's whole security promise and the only claim in it
 * that cannot be walked back. Everything else about tenancy is an
 * argument in a comment; this is the thing that runs.
 *
 * It exists because two changes made the argument insufficient:
 *
 *   1. `forOrg()` scopes queries by setting `app.current_org` in a
 *      transaction. When `set_config` and the query landed on different
 *      pooled connections, RLS matched no policy — which happened to
 *      fail *closed* (every screen empty), but the same class of mistake
 *      in the other direction fails open and looks like nothing at all.
 *
 *   2. The extended client is now **cached per brokerage**. The cache
 *      key is the orgId and the closure captures nothing from the
 *      request, so it is safe — by argument. This turns the argument
 *      into a test.
 *
 * Run it against a database whose `DATABASE_URL` role does NOT own the
 * tables and does NOT have BYPASSRLS, or it proves nothing:
 *
 *     npm run check:tenancy
 *
 * A superuser connection passes this trivially and means nothing. The
 * script says so if it detects one.
 */
import { PrismaClient } from "@prisma/client";
import { crossTenant, forOrg } from "../src/server/db/client";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const fails: string[] = [];

/** Marks every row this script creates so cleanup can never over-reach. */
const TAG = "+9715099";
const SLUG = "tenancy-check-";

function check(label: string, got: string[], want: string[]) {
  const g = [...got].sort().join(",");
  const w = [...want].sort().join(",");
  const ok = g === w;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(44)} [${g || "—"}]`);
  if (!ok) fails.push(`${label}: saw [${g}], should see [${w}]`);
}

async function scopedIsReallyScoped() {
  /**
   * If the application's own connection bypasses RLS, every assertion
   * below passes for the wrong reason. Detect it and say so rather than
   * printing a row of ticks that mean nothing.
   */
  const probe = new PrismaClient();
  try {
    const rows = await probe.$queryRaw<{ bypass: boolean; super: boolean }[]>`
      SELECT rolbypassrls AS bypass, rolsuper AS super
      FROM pg_roles WHERE rolname = current_user`;
    const r = rows[0];
    if (r?.bypass || r?.super) {
      console.log(
        "\n  ! DATABASE_URL connects as a superuser or a BYPASSRLS role.\n" +
        "    Row-level security is not applied to it, so this check cannot\n" +
        "    prove anything. Point DATABASE_URL at the restricted role."
      );
      fails.push("DATABASE_URL bypasses RLS — the check could not run meaningfully");
    }
  } finally {
    await probe.$disconnect();
  }
}

async function main() {
  await scopedIsReallyScoped();

  await root.lead.deleteMany({ where: { phone: { startsWith: TAG } } });
  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });

  const a = await root.organisation.create({
    data: { name: "Marina Bay Properties", slug: `${SLUG}a` },
  });
  const b = await root.organisation.create({
    data: { name: "Downtown Prime", slug: `${SLUG}b` },
  });

  await root.lead.createMany({
    data: [
      { orgId: a.id, phone: `${TAG}00001`, name: "A-one" },
      { orgId: a.id, phone: `${TAG}00002`, name: "A-two" },
      { orgId: b.id, phone: `${TAG}00003`, name: "B-one" },
    ],
  });

  const seen = async (orgId: string) =>
    (await forOrg(orgId).lead.findMany({ where: { phone: { startsWith: TAG } }, select: { name: true } }))
      .map((l) => l.name ?? "");

  console.log("\nInterleaved, three rounds — a stale scope would show here:");
  for (let i = 1; i <= 3; i++) {
    check(`round ${i}: A sees only A`, await seen(a.id), ["A-one", "A-two"]);
    check(`round ${i}: B sees only B`, await seen(b.id), ["B-one"]);
  }

  console.log("\nThe cache returns one client per brokerage, never one for two:");
  const a1 = forOrg(a.id), a2 = forOrg(a.id), b1 = forOrg(b.id);
  console.log(`  ${a1 === a2 ? "✓" : "✗"} forOrg(A) is cached`);
  if (a1 !== a2) fails.push("forOrg is not caching — a fresh proxy per call");
  console.log(`  ${a1 !== b1 ? "✓" : "✗"} forOrg(A) is not forOrg(B)`);
  if (a1 === b1) fails.push("forOrg returned ONE client for TWO brokerages — tenant leak");

  console.log("\nConcurrent, which is where a shared connection would show:");
  const out = await Promise.all(
    Array.from({ length: 12 }, (_, i) => seen(i % 2 === 0 ? a.id : b.id))
  );
  out.forEach((names, i) =>
    check(`concurrent ${String(i).padStart(2)} (${i % 2 === 0 ? "A" : "B"})`, names,
          i % 2 === 0 ? ["A-one", "A-two"] : ["B-one"])
  );

  /**
   * The intelligence tables, specifically.
   *
   * They were added in a later migration, and the RLS block that covers
   * everything else ran at init — before they existed. A table added
   * after that block is outside the tenant boundary and **nothing
   * errors**: one brokerage reads another's client facts and
   * recommendations, and the product looks like it is working.
   *
   * The catalogue says the policy is attached. This asks the database.
   */
  console.log("\nThe intelligence tables are inside the boundary too:");
  {
    await root.clientFact.createMany({
      data: [
        { orgId: a.id, leadId: (await root.lead.findFirstOrThrow({ where: { orgId: a.id } })).id,
          kind: "MOTIVATION", body: "A-fact", source: "AGENT" },
        { orgId: b.id, leadId: (await root.lead.findFirstOrThrow({ where: { orgId: b.id } })).id,
          kind: "MOTIVATION", body: "B-fact", source: "AGENT" },
      ],
    });

    const factsFor = async (orgId: string) =>
      (await forOrg(orgId).clientFact.findMany({ select: { body: true } })).map((f) => f.body);

    check("A sees only its own facts", await factsFor(a.id), ["A-fact"]);
    check("B sees only its own facts", await factsFor(b.id), ["B-fact"]);

    await root.recommendation.create({
      data: {
        orgId: b.id, agentId: "someone",
        leadId: (await root.lead.findFirstOrThrow({ where: { orgId: b.id } })).id,
        action: "CALL", headline: "B-rec", reason: "test", priority: 0.5,
      },
    });
    const recs = await forOrg(a.id).recommendation.findMany({ select: { headline: true } });
    check("A sees none of B's recommendations", recs.map((r) => r.headline), []);
  }

  /**
   * Every tenant table, not the ones this file happens to name.
   *
   * Everything above proves isolation for tables somebody thought to
   * write an assertion for — Lead, ClientFact, BlackbookEntry,
   * Recommendation. That is a list, and a list goes quiet exactly when
   * something is added to the schema.
   *
   * The init migration got this right: it loops over every table with an
   * `orgId` column and applies the policy. But that loop ran **once**, at
   * init. A table added by a later migration is not covered by it, and
   * nothing here would have noticed — the new table would pass this
   * check by not being in it, and one brokerage would read another's
   * rows out of the newest and least-examined table in the product.
   *
   * So this asks the database rather than a list: for every base table
   * carrying an `orgId`, is row-level security enabled, is it FORCED,
   * and is there a `tenant_isolation` policy on it? The rule names no
   * tables, so it cannot go stale, and adding a tenant model without a
   * policy is now a failed build rather than a silent leak.
   *
   * FORCE matters as much as ENABLE: without it the policy does not
   * apply to the table's owner, and the migration role is the owner.
   */
  console.log("\nEvery table with an orgId is actually covered:");
  {
    const rows = await root.$queryRaw<{
      table_name: string; enabled: boolean; forced: boolean; policies: bigint;
    }[]>`
      SELECT c.relname                       AS table_name,
             c.relrowsecurity                AS enabled,
             c.relforcerowsecurity           AS forced,
             count(p.polname) FILTER (WHERE p.polname = 'tenant_isolation') AS policies
        FROM information_schema.columns col
        JOIN pg_class c  ON c.relname = col.table_name
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        LEFT JOIN pg_policy p ON p.polrelid = c.oid
       WHERE col.table_schema = 'public'
         AND col.column_name  = 'orgId'
         AND c.relkind        = 'r'
       GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
       ORDER BY c.relname;
    `;

    // A query that matches nothing must not read as "all covered". That
    // is the shape of failure this whole file exists to catch.
    if (rows.length === 0) {
      fails.push("no tables with an orgId were found — this run proved nothing");
      console.log("  ✗ no tables with an orgId were found — this run proved nothing");
    }

    const bad = rows.filter((r) => !r.enabled || !r.forced || Number(r.policies) === 0);
    const ok = bad.length === 0;
    console.log(`  ${ok ? "✓" : "✗"} ${rows.length} tenant table(s) checked` +
                (ok ? ", every one enabled, forced and policied" : ""));
    for (const b of bad) {
      const why = [
        !b.enabled ? "RLS not enabled" : null,
        !b.forced ? "not FORCED, so the owner bypasses it" : null,
        Number(b.policies) === 0 ? "no tenant_isolation policy" : null,
      ].filter(Boolean).join("; ");
      console.log(`      x ${b.table_name} — ${why}`);
      fails.push(`${b.table_name}: ${why}`);
    }
  }

  /**
   * And every one of them points at its brokerage.
   *
   * Fifty tenant tables had an `orgId` and no foreign key to
   * "Organisation" (the audit's C5), so a deleted brokerage left rows
   * behind naming nobody — found in this very database: invoices,
   * subscriptions and assignment rules from check runs whose clean-up
   * deleted the brokerage and not what it owned. Asked of the database,
   * like the policy above, so a new tenant table without the key fails
   * here rather than being noticed by an auditor.
   */
  console.log("\nEvery table with an orgId points at its brokerage:");
  {
    const missing = await root.$queryRaw<{ table_name: string }[]>`
      SELECT col.table_name
        FROM information_schema.columns col
        JOIN pg_class c ON c.relname = col.table_name AND c.relkind = 'r'
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       WHERE col.table_schema = 'public' AND col.column_name = 'orgId'
         AND NOT EXISTS (
           SELECT 1 FROM pg_constraint k
            WHERE k.conrelid = c.oid AND k.contype = 'f'
              AND k.confrelid = '"Organisation"'::regclass
              AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.oid AND attname = 'orgId')]::smallint[]
         )
       ORDER BY 1`;
    const ok = missing.length === 0;
    console.log(`  ${ok ? "✓" : "✗"} every tenant table has a foreign key to Organisation` +
                (ok ? "" : ` — ${missing.length} without`));
    for (const m of missing) {
      console.log(`      x ${m.table_name} — no foreign key on orgId`);
      fails.push(`${m.table_name}: no foreign key to Organisation`);
    }
  }

  console.log("\nA write cannot cross either:");
  const stolen = await forOrg(a.id).lead.updateMany({
    where: { phone: `${TAG}00003` },          // B's lead, from A's client
    data: { name: "STOLEN" },
  });
  const ok = stolen.count === 0;
  console.log(`  ${ok ? "✓" : "✗"} A updating B's lead affected ${stolen.count} rows`);
  if (!ok) fails.push(`A wrote to ${stolen.count} of B's rows`);

  /**
   * Inside `$transaction(async (tx) => …)`, which is where thirty-one of
   * the product's writes happen — ingest, erasure, offers, handover,
   * every mutation that writes a row and its audit entry together.
   *
   * The scope held there all along. What did not hold was the
   * transaction: each statement committed on its own connection, so an
   * update followed by a throw stayed written. `forOrg` now opens a real
   * transaction and scopes it from the inside, and these are the four
   * things that has to keep true.
   */
  console.log("\nInside a transaction:");
  const inside = await forOrg(a.id).$transaction(async (tx) =>
    (await tx.lead.findMany({ where: { phone: { startsWith: TAG } }, select: { name: true } }))
      .map((l) => l.name ?? ""));
  check("A's transaction sees only A", inside, ["A-one", "A-two"]);

  const crossed = await forOrg(a.id).$transaction(async (tx) =>
    tx.lead.updateMany({ where: { phone: `${TAG}00003` }, data: { name: "STOLEN" } }));
  console.log(`  ${crossed.count === 0 ? "✓" : "✗"} A's transaction writing B's lead affected ${crossed.count} rows`);
  if (crossed.count !== 0) fails.push(`A's transaction wrote to ${crossed.count} of B's rows`);

  let thrown = false;
  try {
    await forOrg(a.id).$transaction(async (tx) => {
      await tx.lead.updateMany({ where: { phone: `${TAG}00001` }, data: { name: "HALF-DONE" } });
      throw new Error("the second half failed");
    });
  } catch { thrown = true; }
  const afterThrow = await seen(a.id);
  const rolledBack = thrown && !afterThrow.includes("HALF-DONE");
  console.log(`  ${rolledBack ? "✓" : "✗"} a failure half way leaves nothing behind`);
  if (!rolledBack) fails.push("a transaction that threw kept its first write — it is not a transaction");

  /**
   * And the scope ends with it. `set_config(…, true)` is
   * transaction-local; the moment that became session-level, the next
   * request on the pooled connection would run as brokerage A. A raw
   * query is not a model operation, so the hook does not scope it — it
   * reads whatever the connection it lands on is carrying. Ten of them,
   * because the pool has more than one connection to land on.
   */
  for (let i = 0; i < 5; i++) {
    await forOrg(a.id).$transaction(async (tx) => tx.lead.count());
  }
  const leftovers = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const [row] = await forOrg(b.id).$queryRaw<{ org: string | null }[]>`
      SELECT current_setting('app.current_org', true) AS org`;
    if (row?.org) leftovers.add(row.org);
  }
  const clean = !leftovers.has(a.id);
  console.log(`  ${clean ? "✓" : "✗"} the scope ends with the transaction, not the connection`);
  if (!clean) fails.push("a transaction's scope was still set on a pooled connection afterwards");

  // Facts and recommendations cascade with the organisation, so the two
  // deletes below take everything this script made.
  await root.lead.deleteMany({ where: { phone: { startsWith: TAG } } });
  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });

  console.log(`\n${"─".repeat(58)}`);
  if (fails.length === 0) {
    console.log("PASS — one brokerage cannot see or touch another's data.\n");
    process.exit(0);
  }
  console.log(`FAIL — ${fails.length}:`);
  fails.forEach((f) => console.log(`  x ${f}`));
  console.log();
  process.exit(1);
}

main().catch(fatal);
