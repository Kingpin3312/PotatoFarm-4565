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

  console.log("\nA write cannot cross either:");
  const stolen = await forOrg(a.id).lead.updateMany({
    where: { phone: `${TAG}00003` },          // B's lead, from A's client
    data: { name: "STOLEN" },
  });
  const ok = stolen.count === 0;
  console.log(`  ${ok ? "✓" : "✗"} A updating B's lead affected ${stolen.count} rows`);
  if (!ok) fails.push(`A wrote to ${stolen.count} of B's rows`);

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
