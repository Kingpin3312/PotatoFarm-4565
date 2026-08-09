/**
 * Does one sentence actually produce a client on file?
 *
 * This is the flagship flow, so it is the one worth proving rather than
 * demonstrating. The model call is not exercised — there is no API key
 * in this environment and a check that needs one is a check nobody runs
 * — so it starts from the extraction and tests everything downstream,
 * which is where all the writing happens and where being wrong is
 * expensive.
 *
 * The pure parts of the extraction — the confidence gate, the
 * order-of-magnitude guard on budgets, phone normalisation — are tested
 * directly, because those are the three places a bad model reply turns
 * into bad data.
 *
 *     npm run check:intake
 */
import { crossTenant, forOrg } from "../src/server/db/client";
import { applyIntake } from "../src/server/lib/requests/apply-intake";
import { normalisePhone, trusted, type Intake } from "../src/server/lib/requests/intake";

const root = crossTenant("sweep");
const SLUG = "intake-check-";
const fails: string[] = [];

function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

/** A complete extraction, as the model would return it for the flagship line. */
function sarah(over: Partial<Intake> = {}): Intake {
  return {
    person: { name: "Sarah Al Mansoori", phone: "+971504482211", email: null },
    role: "BUYER",
    requirement: {
      intent: "BUY_TO_LIVE",
      budgetMinAed: null,
      budgetMaxAed: 12_000_000,
      bedrooms: 4,
      propertyType: "villa",
      communities: ["Dubai Hills"],
      timeframe: "within three months",
      preferences: [],
    },
    facts: [
      { kind: "MOTIVATION", body: "Relocating from Abu Dhabi for a new job" },
      { kind: "KEY_DATE", body: "Lease ends end of March, wants to be in before then" },
      { kind: "COMMUNICATION", body: "Only answers WhatsApp, never picks up the phone" },
    ],
    confidence: { name: 0.95, phone: 0.92, budgetMaxAed: 0.9, bedrooms: 0.95,
                  communities: 0.88, timeframe: 0.85, intent: 0.9 },
    ...over,
  };
}

async function main() {
  /* ---------------- the pure guards ---------------- */

  console.log("\nPhone normalisation — a half-valid number is worse than none:");
  ok("E.164 passes through", normalisePhone("+971 50 448 2211") === "+971504482211");
  ok("UAE local 05x becomes E.164", normalisePhone("050 448 2211") === "+971504482211");
  ok("00 prefix becomes +", normalisePhone("00971504482211") === "+971504482211");
  ok("971 without + is fixed", normalisePhone("971504482211") === "+971504482211");
  ok("a fragment is rejected", normalisePhone("4482211") === null);
  ok("words are rejected", normalisePhone("call the office") === null);
  ok("null stays null", normalisePhone(null) === null);

  console.log("\nThe budget guard — the failure is an order of magnitude, not a rounding:");
  {
    const low = trusted(sarah({ requirement: { ...sarah().requirement, budgetMaxAed: 12 } }));
    ok("'12' (heard without 'million') is dropped, not stored",
       low.value.requirement.budgetMaxAed === null, low.dropped.join(", "));

    const high = trusted(sarah({ requirement: { ...sarah().requirement, budgetMaxAed: 12_000_000_000 } }));
    ok("12 billion is dropped", high.value.requirement.budgetMaxAed === null);

    const inverted = trusted(sarah({
      requirement: { ...sarah().requirement, budgetMinAed: 15_000_000, budgetMaxAed: 12_000_000 },
    }));
    ok("an inverted range drops BOTH rather than guessing which was misheard",
       inverted.value.requirement.budgetMinAed === null &&
       inverted.value.requirement.budgetMaxAed === null);

    const unsure = trusted(sarah({ confidence: { ...sarah().confidence, budgetMaxAed: 0.4 } }));
    ok("a budget the model was unsure of is dropped",
       unsure.value.requirement.budgetMaxAed === null);
    ok("and the agent is told which field went missing",
       unsure.dropped.includes("budget"), unsure.dropped.join(", "));
    ok("but the rest of the extraction survives",
       unsure.value.requirement.bedrooms === 4 && unsure.value.requirement.communities.length === 1);

    const good = trusted(sarah());
    ok("a confident 12m is kept", good.value.requirement.budgetMaxAed === 12_000_000);
    ok("nothing is dropped from a clean extraction", good.dropped.length === 0);
  }

  /* ---------------- the write path ---------------- */

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  const org = await root.organisation.create({
    data: { name: "Intake Check Brokerage", slug: `${SLUG}a` },
  });
  const user = await root.user.upsert({
    where: { email: "intake-check@example.com" },
    create: { email: "intake-check@example.com", name: "Test Agent" },
    update: {},
  });
  await root.membership.create({ data: { orgId: org.id, userId: user.id, role: "AGENT" } });

  // Two listings: one that should match, one that should not.
  await root.listing.createMany({
    data: [
      { orgId: org.id, reference: "DH-4001", title: "4-bed villa, Dubai Hills Grove",
        community: "Dubai Hills", building: "Grove", bedrooms: 4,
        priceFils: 11_500_000n * 100n, purpose: "SALE", status: "AVAILABLE" },
      { orgId: org.id, reference: "JVC-1002", title: "1-bed apartment, JVC",
        community: "JVC", building: "Bloom", bedrooms: 1,
        priceFils: 850_000n * 100n, purpose: "SALE", status: "AVAILABLE" },
      { orgId: org.id, reference: "PJ-9003", title: "5-bed signature villa, Palm Jumeirah",
        community: "Palm Jumeirah", building: "Frond K", bedrooms: 5,
        priceFils: 42_000_000n * 100n, purpose: "SALE", status: "AVAILABLE" },
    ],
  });

  const db = forOrg(org.id);
  const line = "Met Sarah today. She's after a four-bed villa in Dubai Hills, around twelve " +
               "million, needs to move within three months. Relocating from Abu Dhabi.";

  console.log("\nOne sentence, with a number:");
  const r1 = await applyIntake({
    orgId: org.id, agentId: user.id, transcript: line, intake: trusted(sarah()).value,
  });

  const lead = await db.lead.findFirst({
    where: { phone: "+971504482211" },
    include: { requirements: true },
  });
  ok("the lead exists", Boolean(lead), lead?.name ?? "");
  ok("it is assigned to the agent who spoke", lead?.assignedToId === user.id);
  ok("the timeframe is on the lead", lead?.timeframe === "within three months");

  const req = lead?.requirements[0];
  ok("a requirement was created", Boolean(req));
  ok("budget is fils, not dirhams", req?.budgetMaxFils === 12_000_000n * 100n,
     String(req?.budgetMaxFils));
  ok("bedrooms carried", req?.bedroomsMin === 4);
  ok("community carried", req?.communities[0] === "Dubai Hills");
  ok("villa kept as a preference", req?.preferences.includes("villa") === true);
  ok("source is ASSISTANT, so it cannot message her unconfirmed",
     req?.source === "ASSISTANT");
  ok("it expires, because a requirement goes stale", Boolean(req?.expiresAt));

  const facts = await db.clientFact.findMany({ where: { leadId: lead!.id } });
  ok("three facts kept", facts.length === 3, facts.map((f) => f.kind).join(", "));
  ok("facts are marked EXTRACTED, not as something she said",
     facts.every((f) => f.source === "EXTRACTED"));
  ok("her words are kept verbatim",
     facts.some((f) => f.body.includes("Only answers WhatsApp")));

  const followUp = await db.followUp.findFirst({ where: { leadId: lead!.id } });
  ok("a follow-up exists", Boolean(followUp));
  {
    // "within three months" → a week, not three days. Somebody moving in
    // three months does not want a call tomorrow.
    const days = Math.round(((followUp?.dueAt.getTime() ?? 0) - Date.now()) / 86_400_000);
    ok("its date reflects her timeframe rather than a fixed default",
       days >= 6 && days <= 8, `${days} days`);
  }

  ok("a matching property was found", Boolean(r1.match), r1.match?.reference);
  ok("it is the Dubai Hills 4-bed, not the Palm villa or the JVC flat",
     r1.match?.reference === "DH-4001");
  ok("nothing is asked for, because nothing is missing", r1.ask === undefined);
  ok("the summary reads as one sentence",
     r1.did.length >= 4 && r1.did.join(" ").length < 240, r1.did.join(" · "));

  console.log("\nThe same person again — an agent re-meeting somebody they hold:");
  const before = await db.lead.count();
  await applyIntake({
    orgId: org.id, agentId: user.id, transcript: line, intake: trusted(sarah()).value,
  });
  ok("no duplicate lead", (await db.lead.count()) === before);

  console.log("\nNo number given — the common case at an open house:");
  const r2 = await applyIntake({
    orgId: org.id, agentId: user.id,
    transcript: "Met a David at the open house, looking around 6 million in Arabian Ranches.",
    intake: trusted(sarah({
      person: { name: "David Okonjo", phone: null, email: null },
      requirement: { ...sarah().requirement, budgetMaxAed: 6_000_000, communities: ["Arabian Ranches"] },
      facts: [],
    })).value,
  });
  ok("he is in the blackbook, not invented as a lead", Boolean(r2.blackbookEntryId));
  ok("no lead was created without a number", r2.leadId === undefined);
  ok("and it asks for the one thing that unblocks everything",
     (r2.ask ?? "").toLowerCase().includes("number"), r2.ask);

  console.log("\nA buyer nothing on the book fits:");
  const r3 = await applyIntake({
    orgId: org.id, agentId: user.id,
    transcript: "Met Priya, wants a 3-bed in Business Bay under 2 million.",
    intake: trusted(sarah({
      person: { name: "Priya Nair", phone: "+971507654321", email: null },
      requirement: { ...sarah().requirement, budgetMaxAed: 2_000_000, bedrooms: 3,
                     communities: ["Business Bay"] },
      facts: [],
    })).value,
  });
  ok("no match is offered rather than a bad one", r3.match === undefined);
  ok("she is still on the board with her requirement", Boolean(r3.leadId));

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await root.user.deleteMany({ where: { email: "intake-check@example.com" } });

  console.log(`\n${"─".repeat(60)}`);
  if (fails.length === 0) {
    console.log("PASS — one sentence puts a client, a requirement and a match on file.\n");
    process.exit(0);
  }
  console.log(`FAIL — ${fails.length}:`);
  fails.forEach((f) => console.log(`  x ${f}`));
  console.log();
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
