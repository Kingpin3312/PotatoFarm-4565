/**
 * Does the product form a defensible opinion?
 *
 * Scoring and next-best-action are rules, so they can be tested properly
 * rather than sampled — which is most of why they are rules. The three
 * things worth proving:
 *
 *   1. The score moves in the direction a person would expect, and the
 *      order-of-magnitude cases do not invert it.
 *   2. The action chosen is the *urgent* one, not the warmest one. A
 *      40-point lead whose offer expires tomorrow beats a 90-point lead
 *      who messaged an hour ago and needs nothing.
 *   3. The sweep writes `Lead.score` — a column that had never been
 *      written to — keeps its history, and does not resurrect a
 *      recommendation an agent has dismissed.
 *
 *     npm run check:intelligence
 */
import { crossTenant, forOrg } from "../src/server/db/client";
import { movement, scoreLead, type ScoreInput } from "../src/server/lib/intelligence/score";
import { nextAction, type Subject } from "../src/server/lib/intelligence/next-action";
import { sweepIntelligence } from "../src/server/lib/intelligence/sweep";

const root = crossTenant("sweep");
const SLUG = "intel-check-";
const fails: string[] = [];

function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

const ago = (d: number) => new Date(Date.now() - d * 86_400_000);

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    createdAt: ago(30),
    lastInboundAt: ago(1),
    lastOutboundAt: ago(1),
    inboundCount: 4,
    outboundCount: 4,
    status: "QUALIFYING",
    intent: "BUY_TO_LIVE",
    timeframe: "within three months",
    budgetMaxFils: 3_000_000n * 100n,
    requirementCount: 1,
    viewingCount: 1,
    attendedCount: 1,
    offerCount: 0,
    medianListingFils: 2_500_000n * 100n,
    ...over,
  };
}

function subject(over: Partial<Subject> = {}): Subject {
  return {
    leadId: "l1", name: "James Whitfield", status: "QUALIFYING",
    score: scoreLead(input()),
    daysSinceInbound: 1, daysSinceOutbound: 1, daysInStage: 3,
    requirementCount: 1, upcomingViewings: 1, viewingsAwaitingOutcome: 0,
    openOffers: 0, offerExpiringInDays: null,
    budgetMaxFils: 3_000_000n * 100n, matchesWaiting: 0,
    optedOut: false, windowHoursLeft: 20,
    ...over,
  };
}

async function main() {
  /* ---------------- scoring ---------------- */

  console.log("\nThe score moves the way a person would expect:");
  const warm = scoreLead(input());
  const cold = scoreLead(input({ lastInboundAt: ago(60), inboundCount: 1, attendedCount: 0,
                                 viewingCount: 0, requirementCount: 0, timeframe: null }));
  ok("a warm lead outscores a cold one", warm.total > cold.total, `${warm.total} vs ${cold.total}`);
  ok("both are inside 0–100", [warm, cold].every((s) => s.total >= 0 && s.total <= 100));

  const fresh = scoreLead(input({ lastInboundAt: null, createdAt: new Date(), inboundCount: 0,
                                  attendedCount: 0, viewingCount: 0, requirementCount: 0 }));
  const ignored = scoreLead(input({ lastInboundAt: null, createdAt: ago(30), inboundCount: 0,
                                    attendedCount: 0, viewingCount: 0, requirementCount: 0 }));
  ok("a brand-new lead is not scored like one that has ignored us for a month",
     fresh.total > ignored.total, `${fresh.total} vs ${ignored.total}`);
  ok("and it says so", fresh.drivers.some((d) => d.includes("brand new")), fresh.drivers.join("; "));

  const negotiating = scoreLead(input({ status: "NEGOTIATING" }));
  ok("negotiating pins intent to the top", negotiating.intent === 25);
  ok("and leads with it", negotiating.drivers[0] === "negotiating");

  const urgent = scoreLead(input({ timeframe: "needs to move ASAP" }));
  ok("stated urgency beats a vague timeframe", urgent.total > warm.total,
     `${urgent.total} vs ${warm.total}`);

  console.log("\nBudget fit is against the brokerage's own book, not an absolute:");
  const fits = scoreLead(input({ budgetMaxFils: 3_000_000n * 100n, medianListingFils: 2_500_000n * 100n }));
  const tooRich = scoreLead(input({ budgetMaxFils: 60_000_000n * 100n, medianListingFils: 2_500_000n * 100n }));
  ok("a buyer matched to the stock outscores one nothing fits",
     fits.budgetFit > tooRich.budgetFit, `${fits.budgetFit} vs ${tooRich.budgetFit}`);
  ok("and the reason is stated", tooRich.drivers.some((d) => d.includes("above your usual stock")));
  const noBudget = scoreLead(input({ budgetMaxFils: null }));
  ok("an unknown budget is not treated as a bad one",
     noBudget.budgetFit > tooRich.budgetFit, `${noBudget.budgetFit} vs ${tooRich.budgetFit}`);
  ok("and it is flagged as the thing to go and ask",
     noBudget.drivers.includes("no budget on file"));

  console.log("\nChased and silent is its own signal:");
  const chased = scoreLead(input({ inboundCount: 1, outboundCount: 5,
                                   lastOutboundAt: ago(1), lastInboundAt: ago(9) }));
  ok("four unanswered messages are named", chased.drivers.some((d) => d.includes("unanswered")),
     chased.drivers.join("; "));

  console.log("\nMovement needs a previous value, and a threshold:");
  ok("no history, nothing claimed", movement(70, null) === null);
  ok("a 3-point wobble is not movement", movement(70, 67) === null);
  ok("a 15-point rise is", (movement(70, 55) ?? "").includes("warming"));
  ok("and a fall says so", (movement(50, 70) ?? "").includes("cooling"));

  /* ---------------- next action ---------------- */

  console.log("\nThe action chosen is the urgent one, not the warmest one:");
  //
  // Both sides must actually produce a suggestion, or the comparison is
  // `0.82 > 0` and proves nothing. The first version of this check had
  // exactly that hole: the "hot" subject needed nothing, correctly
  // returned null, and the assertion passed against undefined.
  const hot = subject({
    score: scoreLead(input({ timeframe: "ASAP" })),
    // Hot, and nobody has been back to them for three days — which is
    // the CALL rule, and about as urgent as warmth alone gets.
    daysSinceInbound: 3, upcomingViewings: 0,
  });
  const expiring = subject({
    score: scoreLead(input({ lastInboundAt: ago(20), inboundCount: 1, requirementCount: 0,
                             attendedCount: 0, viewingCount: 0, timeframe: null })),
    offerExpiringInDays: 1, openOffers: 1, status: "NEGOTIATING",
  });
  const a1 = nextAction(hot);
  const a2 = nextAction(expiring);
  ok("the hot lead does produce a suggestion, so the comparison means something",
     a1 !== null, `${a1?.action} ${a1?.priority.toFixed(2)} — ${a1?.headline}`);
  ok("the colder lead with an expiring offer produces one too", a2 !== null);
  ok("and the expiring offer wins on priority despite being colder",
     (a2?.priority ?? 0) > (a1?.priority ?? 1),
     `${a2?.action} ${a2?.priority.toFixed(2)} (score ${expiring.score.total}) ` +
     `beats ${a1?.action} ${a1?.priority.toFixed(2)} (score ${hot.score.total})`);
  ok("and it names the deadline", (a2?.headline ?? "").includes("expires"), a2?.headline);

  const unlogged = nextAction(subject({ viewingsAwaitingOutcome: 2 }));
  ok("an unrecorded viewing outcome outranks routine follow-up",
     unlogged?.action === "RECORD_OUTCOME", unlogged?.headline);
  ok("and says why it matters beyond tidiness",
     (unlogged?.reason ?? "").includes("owner's report"), unlogged?.reason);

  console.log("\nSomebody who said stop is never suggested an outbound message:");
  const optedOut = nextAction(subject({
    optedOut: true, matchesWaiting: 3,
    score: scoreLead(input({ timeframe: "ASAP" })),
    daysSinceInbound: 5, upcomingViewings: 0,
  }));
  ok("no SEND_PROPERTY", optedOut?.action !== "SEND_PROPERTY", optedOut?.action ?? "nothing");
  ok("no CALL either", optedOut?.action !== "CALL");
  ok("no REACTIVATE either",
     nextAction(subject({ optedOut: true, daysSinceInbound: 60, upcomingViewings: 0,
                          requirementCount: 0 }))?.action !== "REACTIVATE");

  console.log("\nNothing to do is a real answer:");
  const settled = nextAction(subject({
    score: scoreLead(input({ lastInboundAt: new Date() })),
    daysSinceInbound: 0, upcomingViewings: 1, viewingsAwaitingOutcome: 0,
    daysInStage: 2, requirementCount: 1, matchesWaiting: 0,
  }));
  ok("a lead who messaged today with a viewing booked produces silence",
     settled === null, settled?.headline ?? "null");

  console.log("\nThe reason is always there:");
  const sample = [hot, expiring, subject({ viewingsAwaitingOutcome: 1 }),
                  subject({ daysInStage: 30 }), subject({ matchesWaiting: 2 })]
    .map(nextAction).filter((x): x is NonNullable<typeof x> => x !== null);
  ok("every suggestion carries a reason", sample.every((x) => x.reason.length > 20));
  ok("every headline names the person or the thing",
     sample.every((x) => x.headline.length > 8));
  ok("priorities are all in range", sample.every((x) => x.priority >= 0 && x.priority <= 1));

  /* ---------------- the sweep, against a real database ---------------- */

  console.log("\nThe sweep, end to end:");
  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  const org = await root.organisation.create({
    data: { name: "Intelligence Check", slug: `${SLUG}a` },
  });
  const user = await root.user.upsert({
    where: { email: "intel-check@example.com" },
    create: { email: "intel-check@example.com", name: "Test Agent" },
    update: {},
  });
  await root.membership.create({ data: { orgId: org.id, userId: user.id, role: "AGENT" } });
  await root.listing.create({
    data: { orgId: org.id, reference: "IC-1", title: "3-bed, Dubai Hills",
            community: "Dubai Hills", bedrooms: 3, priceFils: 2_500_000n * 100n,
            purpose: "SALE", status: "AVAILABLE" },
  });

  const stalled = await root.lead.create({
    data: {
      orgId: org.id, phone: "+971500000101", name: "Priya Nair",
      status: "QUALIFYING", intent: "BUY_TO_LIVE", timeframe: "within a month",
      budgetMaxFils: 2_600_000n * 100n, assignedToId: user.id,
      stageEnteredAt: ago(40), createdAt: ago(45),
    },
  });
  // Unassigned: there is nobody to recommend anything to.
  await root.lead.create({
    data: { orgId: org.id, phone: "+971500000102", name: "Nobody's Lead",
            status: "NEW", createdAt: ago(2) },
  });

  const before = await forOrg(org.id).lead.findUnique({
    where: { id: stalled.id }, select: { score: true },
  });
  ok("Lead.score starts null, as it always has been", before?.score === null);

  const r1 = await sweepIntelligence();
  ok("the sweep ran over this brokerage", r1.orgs >= 1, JSON.stringify(r1));

  const db = forOrg(org.id);
  const after = await db.lead.findUnique({ where: { id: stalled.id }, select: { score: true } });
  ok("Lead.score is written for the first time", typeof after?.score === "number", String(after?.score));

  const events = await db.leadScoreEvent.findMany({ where: { leadId: stalled.id } });
  ok("a score event is kept, so movement is answerable later", events.length === 1);
  ok("its components add to the total",
     (events[0]!.recency + events[0]!.engagement + events[0]!.intent + events[0]!.budgetFit)
       === events[0]!.score,
     `${events[0]!.recency}+${events[0]!.engagement}+${events[0]!.intent}+${events[0]!.budgetFit}=${events[0]!.score}`);
  ok("and it explains itself", events[0]!.drivers.length > 0, events[0]!.drivers.join("; "));

  const recs = await db.recommendation.findMany({ where: { state: "OPEN" } });
  ok("a recommendation was made for the assigned lead", recs.length === 1, recs[0]?.headline);
  ok("it is addressed to the agent who owns the lead", recs[0]?.agentId === user.id);
  ok("nothing was recommended for the unassigned lead",
     recs.every((r) => r.leadId === stalled.id));
  ok("it carries a reason", (recs[0]?.reason.length ?? 0) > 20, recs[0]?.reason);

  console.log("\nRunning it again does not pile up duplicates:");
  await sweepIntelligence();
  const recs2 = await db.recommendation.findMany({ where: { state: "OPEN" } });
  ok("still one open recommendation", recs2.length === 1);

  console.log("\nA dismissal is respected rather than overridden:");
  await db.recommendation.updateMany({
    where: { id: recs2[0]!.id },
    data: { state: "DISMISSED", resolvedAt: new Date(), resolvedById: user.id },
  });
  await sweepIntelligence();
  const revived = await db.recommendation.findMany({
    where: { leadId: stalled.id, action: recs2[0]!.action, state: "OPEN" },
  });
  ok("the dismissed action is not resurrected the next night", revived.length === 0);

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await root.user.deleteMany({ where: { email: "intel-check@example.com" } });

  console.log(`\n${"─".repeat(60)}`);
  if (fails.length === 0) {
    console.log("PASS — the product has an opinion, and can say why.\n");
    process.exit(0);
  }
  console.log(`FAIL — ${fails.length}:`);
  fails.forEach((f) => console.log(`  x ${f}`));
  console.log();
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
