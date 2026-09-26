/**
 * The journeys, end to end — the remediation brief's five.
 *
 * Every other suite proves one workflow. None took a person from the
 * first message to the transfer in one run, and the first run of this
 * one found that completing a deal never marked the buyer won — they sat
 * on the board as "Negotiating" after the keys changed hands. So this
 * drives the real procedures, as the roles that use them, in the order a
 * brokerage does, and checks each hand-off lands where the next step
 * reads it.
 *
 *   1. New lead: create → assign → qualify → requirement → match → follow-up
 *   2. Transaction: match → viewing → follow-up → offer → counter →
 *      accept → deal steps → completed, buyer won
 *   3. Agent day: Today, tasks, search by the number they rang from
 *   4. Manager: the team's list, reassign, delegate a task, export, funnel
 *   5. Mobile agent: `browser:mobile-agent` (a browser at phone width)
 *
 *     npm run check:journeys
 */
import { crossTenant } from "../src/server/db/client";
import { leadsRouter } from "../src/server/api/routers/leads";
import { pipelineRouter } from "../src/server/api/routers/pipeline";
import { requirementsRouter } from "../src/server/api/routers/requirements";
import { listingsRouter } from "../src/server/api/routers/listings";
import { tasksRouter } from "../src/server/api/routers/tasks";
import { todayRouter } from "../src/server/api/routers/today";
import { viewingsRouter } from "../src/server/api/routers/viewings";
import { offersRouter } from "../src/server/api/routers/offers";
import { dealsRouter } from "../src/server/api/routers/deals";
import { reportsRouter } from "../src/server/api/routers/reports";
import { searchRouter } from "../src/server/api/routers/search";
import { seedStages } from "../src/server/lib/pipeline/defaults";
import { STEP_STAGES } from "../src/server/lib/deals/risk";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "journeys-check-";
const RUN = Date.now().toString(36);
const n7 = String(Date.now()).slice(-7);
// Money is BigInt fils; JSON.stringify throws on it.
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
let bad = 0;
const ok = (l: string, p: boolean, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return;
  const where = { orgId: { in: ids } };
  // Retained records (KYC, invoices) cannot go with the brokerage by
  // design; a test brokerage's go first, by hand.
  await root.kycDocument.deleteMany({ where }).catch(() => {});
  await root.ultimateBeneficialOwner.deleteMany({ where }).catch(() => {});
  await root.screening.deleteMany({ where }).catch(() => {});
  await root.kycRecord.deleteMany({ where }).catch(() => {});
  await root.complianceReport.deleteMany({ where }).catch(() => {});
  await root.invoice.deleteMany({ where }).catch(() => {});
  await root.organisation.deleteMany({ where: { id: { in: ids } } });
  await root.user.deleteMany({ where: { email: { startsWith: "journeys-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nThe journeys, end to end\n");
  await cleanup();
  const org = await root.organisation.create({ data: { name: "Journeys", slug: `${SLUG}a` } });
  await seedStages(root as never, org.id);
  const mk = (k: string, name: string) => root.user.create({ data: { email: `journeys-check-${k}-${RUN}@example.com`, name } });
  const manager = await mk("m", "Maya Chen");
  const agent = await mk("a", "Tom Reilly");
  const colleague = await mk("x", "Nadia Aziz");
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: manager.id, role: "MANAGER" },
    { orgId: org.id, userId: agent.id, role: "AGENT" },
    { orgId: org.id, userId: colleague.id, role: "AGENT" },
  ] });
  const ctx = (userId: string, role: string) => ({
    session: { user: { id: userId } }, membership: { orgId: org.id, orgName: "Journeys", role }, ip: "127.0.0.1", userAgent: "journeys",
  }) as never;
  const as = <T extends { createCaller: (c: never) => unknown }>(r: T, userId: string, role: string) =>
    r.createCaller(ctx(userId, role)) as ReturnType<T["createCaller"]>;
  const stages = await root.pipelineStage.findMany({ where: { orgId: org.id }, orderBy: { position: "asc" } });
  const stage = (maps: string) => stages.find((s) => s.maps === maps)!;

  // Stock to match against.
  const L = as(listingsRouter, manager.id, "MANAGER");
  const flat = await L.create({ reference: `JN-${RUN}`, title: "2-bed, Marina Gate", community: "Dubai Marina", bedrooms: 2, priceAed: 2_900_000, propertyType: "APARTMENT" });

  console.log("=== 1. A new lead ===");
  const M = as(leadsRouter, manager.id, "MANAGER");
  const created = await M.create({ phone: `050 ${n7.slice(0, 3)} ${n7.slice(3)}`, name: "Priya Nair", source: "WALK_IN" });
  const lead = await root.lead.findUniqueOrThrow({ where: { id: created.id } });
  ok("created from a spaced local number", lead.phone === `+97150${n7}` && !!lead.stageId, lead.phone);
  await M.bulk({ target: { ids: [lead.id] }, action: { type: "assign", agentId: agent.id } });
  ok("assigned to an agent, with the ownership on record",
     (await root.lead.findUnique({ where: { id: lead.id } }))?.assignedToId === agent.id &&
     (await root.leadOwnership.count({ where: { leadId: lead.id, userId: agent.id, endedAt: null } })) === 1);
  const A = as(pipelineRouter, agent.id, "AGENT");
  await A.move({ leadId: lead.id, toStageId: stage("QUALIFYING").id, afterLeadId: null, beforeLeadId: null });
  ok("qualified: moved on the board by the agent", (await root.lead.findUnique({ where: { id: lead.id } }))?.status === "QUALIFYING");
  const R = as(requirementsRouter, agent.id, "AGENT");
  await R.save({ leadId: lead.id, purpose: "SALE", intent: "BUY_TO_LIVE", budgetMinAed: null, budgetMaxAed: 3_000_000, bedroomsMin: 2,
                 communities: ["marina"], preferences: [], propertyTypes: ["APARTMENT"], completion: null });
  const matched = await L.buyers({ listingId: flat.id });
  ok("matched: the flat finds her", json(matched).includes("Priya Nair"), json(matched).slice(0, 120));
  const T = as(tasksRouter, agent.id, "AGENT");
  const due = new Date(Date.now() + 2 * 3_600_000).toISOString();
  await T.create({ title: "Send Priya the Marina Gate floor plan", dueAt: due, leadId: lead.id });
  const onToday = await as(todayRouter, agent.id, "AGENT").followUps();
  ok("follow-up: on the agent's Today, named", onToday.some((f) => f.title.includes("Priya") && f.lead?.name === "Priya Nair"));

  console.log("\n=== 2. The transaction ===");
  const V = as(viewingsRouter, agent.id, "AGENT");
  const v = await V.hold({ leadId: lead.id, listingId: flat.id, start: new Date(Date.now() - 2 * 3_600_000), durationMins: 30 }) as { id: string };
  await V.confirm({ viewingId: v.id });
  await V.outcome({ viewingId: v.id, status: "COMPLETED", note: "Loved the view, worried about the service charge." });
  ok("viewing held, confirmed, attended", (await root.viewing.findUnique({ where: { id: v.id } }))?.status === "COMPLETED");
  const leadAfterViewing = await root.lead.findUnique({ where: { id: lead.id }, include: { stageRef: true } });
  ok("confirming it moved her to 'Viewing booked', on the board too",
     leadAfterViewing?.status === "VIEWING_BOOKED" && leadAfterViewing.stageRef?.maps === "VIEWING_BOOKED", `${leadAfterViewing?.status} / ${leadAfterViewing?.stageRef?.name}`);
  await T.create({ title: "Ask Priya what she thought of the service charge", dueAt: due, leadId: lead.id });
  const O = as(offersRouter, agent.id, "AGENT");
  const offer = await O.create({ listingId: flat.id, leadId: lead.id, amountAed: 2_750_000, financing: "MORTGAGE", preApproved: true, expiresInDays: 7 });
  const negotiating = await root.lead.findUnique({ where: { id: lead.id }, include: { stageRef: true } });
  ok("an offer moves her to 'Negotiating'", negotiating?.status === "NEGOTIATING" && negotiating.stageRef?.maps === "NEGOTIATING", negotiating?.status);
  // The second audit's N2: a colleague could act on somebody else's offer.
  const X = as(offersRouter, colleague.id, "AGENT");
  const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");
  const xs = [
    await code(X.create({ listingId: flat.id, leadId: lead.id, amountAed: 2_000_000 })),
    await code(X.counter({ offerId: offer.id, by: "BUYER", amountAed: 2_000_000 })),
    await code(X.accept({ offerId: offer.id })),
    await code(X.presented({ offerId: offer.id })),
  ];
  ok("a colleague cannot name her, counter, accept or present Tom's offer", xs.every((c) => c === "NOT_FOUND"), xs.join(","));
  await O.counter({ offerId: offer.id, by: "VENDOR", amountAed: 2_850_000, note: "Owner wants closer to asking." });
  const accepted = await O.accept({ offerId: offer.id, note: "Agreed at 2.85" }) as { ok: boolean };
  const deal = await root.deal.findFirst({ where: { orgId: org.id, leadId: lead.id } });
  ok("offer, counter, accepted: a deal at the countered price", accepted.ok && deal?.valueFils === 285_000_000n, String(deal?.valueFils));
  ok("the property is under offer", (await root.listing.findUnique({ where: { id: flat.id } }))?.status === "UNDER_OFFER");
  ok("and a due-diligence file was opened for the buyer", (await root.kycRecord.count({ where: { orgId: org.id, leadId: lead.id } })) === 1);
  const xStep = await code(as(dealsRouter, colleague.id, "AGENT").step({ dealId: deal!.id, stage: STEP_STAGES[0], done: true }));
  ok("nor tick his deal along", xStep === "NOT_FOUND", xStep);
  const D = as(dealsRouter, manager.id, "MANAGER");
  for (const st of STEP_STAGES) await D.step({ dealId: deal!.id, stage: st, done: true });
  const closed = await root.deal.findUnique({ where: { id: deal!.id } });
  ok("every step ticked: the deal is completed", closed?.stage === "COMPLETED" && !!closed.completedAt, closed?.stage);
  const won = await root.lead.findUnique({ where: { id: lead.id }, include: { stageRef: true } });
  ok("and the buyer is won, on the board's Won column", won?.status === "WON" && won.stageRef?.maps === "WON", `${won?.status} / ${won?.stageRef?.name}`);
  const sold = await root.listing.findUnique({ where: { id: flat.id } });
  ok("and the property is sold, not still under offer", sold?.status === "SOLD", sold?.status);

  console.log("\n=== 3. An agent's day ===");
  // The second audit's N5: an agent's own walk-in went to the rotation.
  const walkIn = await as(leadsRouter, agent.id, "AGENT").create({ phone: `+97156${n7}`, name: "Walk-in Visitor", source: "WALK_IN" });
  ok("a walk-in the agent enters is theirs, not the rotation's", walkIn.assignedTo === agent.id, String(walkIn.assignedTo));
  const brief = await as(todayRouter, agent.id, "AGENT").brief();
  ok("Today opens, with the day's counts", typeof brief.counts === "object" && Array.isArray(brief.actions));
  const mine = await T.list({ view: "mine", state: "open" });
  ok("their tasks list both follow-ups", mine.rows.filter((t) => t.lead?.name === "Priya Nair").length === 2, String(mine.rows.length));
  await T.complete({ id: mine.rows[0]!.id });
  ok("and ticking one off takes it off Today", (await as(todayRouter, agent.id, "AGENT").followUps()).length === 1);
  const found = await as(searchRouter, agent.id, "AGENT").ask({ q: `050 ${n7.slice(0, 3)} ${n7.slice(3)}` });
  ok("search finds her by the number she rang from", json(found).includes("Priya Nair"));

  console.log("\n=== 4. A manager ===");
  const second = await M.create({ phone: `+97155${n7}`, name: "Omar Haddad", source: "REFERRAL" });
  const team = await M.list({ filter: "unassigned", view: "active", limit: 50 } as never);
  ok("sees the unassigned lead on the team list", team.rows.some((r) => r.id === second.id));
  await M.bulk({ target: { matching: { filter: "unassigned", view: "active" } }, action: { type: "assign", agentId: agent.id } });
  ok("and gives everything unassigned to the agent in one go", (await root.lead.findUnique({ where: { id: second.id } }))?.assignedToId === agent.id);
  const MT = as(tasksRouter, manager.id, "MANAGER");
  await MT.create({ title: "Call Omar before Thursday", dueAt: due, agentId: agent.id, leadId: second.id });
  const asked = await MT.list({ view: "asked", state: "open" });
  const agentSees = await T.list({ view: "mine", state: "open" });
  ok("delegates a task: on the agent's list, and on the manager's 'I asked'",
     asked.rows.some((t) => t.title.startsWith("Call Omar") && t.assignee === "Tom Reilly") &&
     agentSees.rows.some((t) => t.title.startsWith("Call Omar") && t.askedBy === "Maya Chen"));
  const agentDelegate = await T.create({ title: "Ring the landlord", dueAt: due, agentId: manager.id }).then(() => null, (e: { code?: string }) => e);
  ok("an agent cannot hand work to their manager", agentDelegate?.code === "FORBIDDEN", agentDelegate?.code ?? "allowed");
  const csv = await M.exportCsv({ filter: "all", view: "active", sort: "newest" });
  ok("exports the book", csv.count === 3 && csv.csv.includes("Omar Haddad"), String(csv.count));
  const funnel = await as(reportsRouter, manager.id, "MANAGER").funnel({ from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000) });
  ok("and the funnel report answers", typeof funnel === "object" && funnel !== null);
  const kpis = await as(reportsRouter, manager.id, "MANAGER").kpis({ from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 60_000) });
  ok("the KPIs count the deal journey 2 closed, and its source converting",
     kpis.timeToClose.deals === 1 && kpis.bySource.some((r) => r.won >= 1),
     JSON.stringify({ deals: kpis.timeToClose.deals, bySource: kpis.bySource }));
  const agentKpis = await as(reportsRouter, agent.id, "AGENT").kpis({ from: new Date(), to: new Date() }).then(() => null, (e: { code?: string }) => e);
  ok("and an agent is not shown the floor's figures", agentKpis?.code === "FORBIDDEN", agentKpis?.code ?? "allowed");
  const viewerKpis = await as(reportsRouter, manager.id, "VIEWER").kpis({ from: new Date(), to: new Date() }).then(() => null, (e: { code?: string }) => e);
  ok("nor a read-only viewer, who sees no commission anywhere else", viewerKpis?.code === "FORBIDDEN", viewerKpis?.code ?? "allowed");

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
