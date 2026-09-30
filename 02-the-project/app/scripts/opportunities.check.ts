/**
 * One person, several pieces of business (the audit's B5).
 *
 * A buyer who is also letting their villa: the purchase is the lead, the
 * letting is an Opportunity with its own column, agent, value and close.
 * Driven through the real procedures, with the lettings agent a different
 * person from the sales agent — the case this exists for.
 */
import { crossTenant } from "../src/server/db/client";
import { opportunitiesRouter } from "../src/server/api/routers/opportunities";
import { pipelineRouter } from "../src/server/api/routers/pipeline";
import { leadsRouter } from "../src/server/api/routers/leads";
import { blackbookRouter } from "../src/server/api/routers/blackbook";
import { todayRouter } from "../src/server/api/routers/today";
import { searchRouter } from "../src/server/api/routers/search";
import { reportsRouter } from "../src/server/api/routers/reports";
import { seedStages } from "../src/server/lib/pipeline/defaults";
import { eraseSubject } from "../src/server/lib/privacy/erase";
import { exportSubject } from "../src/server/lib/privacy/export";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "opportunities-check-";
const RUN = Date.now().toString(36);

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (orgs.length) await root.organisation.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
  await root.user.deleteMany({ where: { email: { startsWith: "opportunities-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nOne person, several pieces of business\n");
  await cleanup();
  const org = await root.organisation.create({ data: { name: "Two Deals Realty", slug: `${SLUG}a` } });
  const rival = await root.organisation.create({ data: { name: "Rival", slug: `${SLUG}r` } });
  await seedStages(root as never, org.id);
  const mk = (k: string, name: string) => root.user.create({ data: { email: `opportunities-check-${k}-${RUN}@example.com`, name } });
  const [manager, sales, lettings, other, viewer] = await Promise.all([
    mk("m", "Maya Chen"), mk("s", "Tom Reilly"), mk("l", "Layla Hassan"), mk("o", "Nadia Aziz"), mk("v", "Read Only"),
  ]);
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: manager.id, role: "MANAGER" },
    { orgId: org.id, userId: sales.id, role: "AGENT" },
    { orgId: org.id, userId: lettings.id, role: "AGENT" },
    { orgId: org.id, userId: other.id, role: "AGENT" },
    { orgId: org.id, userId: viewer.id, role: "VIEWER" },
    { orgId: rival.id, userId: manager.id, role: "OWNER" },
  ] });
  const ctx = (orgId: string, userId: string, role: string) => ({
    session: { user: { id: userId } }, membership: { orgId, orgName: "x", role }, ip: "127.0.0.1", userAgent: "opps",
  }) as never;
  const as = <T extends { createCaller: (c: never) => unknown }>(r: T, userId: string, role: string, orgId = org.id) =>
    r.createCaller(ctx(orgId, userId, role)) as ReturnType<T["createCaller"]>;
  const stages = await root.pipelineStage.findMany({ where: { orgId: org.id }, orderBy: { position: "asc" } });
  const stage = (maps: string) => stages.find((s) => s.maps === maps)!;

  const buyer = await root.lead.create({ data: {
    orgId: org.id, phone: `+97150${RUN.slice(-7).replace(/\D/g, "7").padStart(7, "1")}`, name: "Priya Nair",
    status: "QUALIFYING", stageId: stage("QUALIFYING").id, assignedToId: sales.id, budgetMaxFils: 300_000_000n,
  } });

  console.log("=== the sales agent adds the letting ===");
  const S = as(opportunitiesRouter, sales.id, "AGENT");
  const handOff = await code(S.create({ leadId: buyer.id, kind: "LET", title: "Letting their villa", agentId: lettings.id }));
  ok("an agent cannot hand it to a colleague", handOff === "FORBIDDEN", handOff);
  const mine = await S.create({ leadId: buyer.id, kind: "SELL", title: "Selling their studio in JVC", valueAed: 650_000 });
  ok("but can add business of their own", !!mine.id);
  const M = as(opportunitiesRouter, manager.id, "MANAGER");
  const letting = await M.create({ leadId: buyer.id, kind: "LET", title: "Letting their villa in Arabian Ranches, Gardenia cluster", valueAed: 180_000, agentId: lettings.id });
  ok("a manager gives the letting to the lettings agent", !!letting.id);
  const toViewer = await code(M.create({ leadId: buyer.id, kind: "LET", title: "x", agentId: viewer.id }));
  ok("and not to somebody who cannot work it", toViewer === "BAD_REQUEST", toViewer);

  console.log("\n=== one person, two columns ===");
  const board = await as(pipelineRouter, manager.id, "MANAGER").board({});
  const col = (maps: string) => board.columns.find((c) => c.stage.maps === maps)!;
  ok("the purchase is where it was", col("QUALIFYING").leads.some((l) => l.id === buyer.id));
  ok("the letting is its own card in New", col("NEW").opportunities.some((o) => o.id === letting.id && o.lead?.name === "Priya Nair"));
  ok("and the column counts and values it", col("NEW").total === 2 && col("NEW").value === 83_000_000n, `${col("NEW").total} · ${col("NEW").value}`);
  const leadRow = await root.lead.findUniqueOrThrow({ where: { id: buyer.id } });
  ok("the lead itself is untouched", leadRow.status === "QUALIFYING" && leadRow.stageId === stage("QUALIFYING").id);

  console.log("\n=== the lettings agent works it ===");
  const L = as(opportunitiesRouter, lettings.id, "AGENT");
  const theirBoard = await as(pipelineRouter, lettings.id, "AGENT").board({});
  const cards = theirBoard.columns.flatMap((c) => c.opportunities.map((o) => o.id));
  ok("it is on their board, and the studio sale is not", cards.includes(letting.id) && !cards.includes(mine.id), cards.join(","));
  const person = await code(as(blackbookRouter, lettings.id, "AGENT").person({ leadId: buyer.id }));
  const detail = await as(leadsRouter, lettings.id, "AGENT").detail({ leadId: buyer.id }).catch(() => null);
  ok("they can open the person their card points at", person === "allowed" && !!detail, person);
  ok("read-only for the lead, which stays the sales agent's", detail?.canEdit === false);
  const leadEdit = await code(as(leadsRouter, lettings.id, "AGENT").update({ leadId: buyer.id, name: "Changed" } as never));
  ok("and changing the lead is refused", leadEdit === "NOT_FOUND" || leadEdit === "FORBIDDEN", leadEdit);
  const list = await L.forLead({ leadId: buyer.id });
  ok("they may move theirs and not add to the person", !list.canAdd && list.rows.find((r) => r.id === letting.id)?.canMove === true && list.rows.find((r) => r.id === mine.id)?.canMove === false);
  await L.move({ id: letting.id, stageId: stage("VIEWING_BOOKED").id });
  const moved = await root.opportunity.findUniqueOrThrow({ where: { id: letting.id } });
  ok("moving it moves its status with it", moved.status === "VIEWING_BOOKED" && moved.stageId === stage("VIEWING_BOOKED").id, moved.status);
  const xMove = await code(L.move({ id: mine.id, stageId: stage("NEGOTIATING").id }));
  ok("but not the studio sale, which is not theirs", xMove === "NOT_FOUND", xMove);

  console.log("\n=== nobody else ===");
  const O = as(opportunitiesRouter, other.id, "AGENT");
  const oList = await code(O.forLead({ leadId: buyer.id }));
  const oMove = await code(O.move({ id: letting.id, stageId: stage("NEW").id }));
  const oBoard = (await as(pipelineRouter, other.id, "AGENT").board({})).columns.flatMap((c) => c.opportunities);
  ok("a colleague with no part in it sees and moves nothing", oList === "NOT_FOUND" && oMove === "NOT_FOUND" && oBoard.length === 0, `${oList}, ${oMove}, ${oBoard.length}`);
  const vList = await as(opportunitiesRouter, viewer.id, "VIEWER").forLead({ leadId: buyer.id });
  const vMove = await code(as(opportunitiesRouter, viewer.id, "VIEWER").move({ id: letting.id, stageId: stage("NEW").id }));
  ok("a viewer reads them and changes nothing", vList.rows.length === 2 && !vList.canAdd && vList.rows.every((r) => !r.canMove) && vMove === "FORBIDDEN", vMove);
  const rivalSees = await as(opportunitiesRouter, manager.id, "OWNER", rival.id).forLead({ leadId: buyer.id }).then(() => "allowed", (e: { code?: string }) => e.code ?? "error");
  ok("another brokerage cannot reach it", rivalSees === "NOT_FOUND", rivalSees);

  console.log("\n=== Today, search and the KPIs see it ===");
  const lToday = await as(todayRouter, lettings.id, "AGENT").brief();
  const onToday = lToday.otherBusiness.find((o) => o.id === letting.id);
  ok("the letting is on the lettings agent's Today, for the person, in its column",
     !!onToday && onToday.person === "Priya Nair" && onToday.stage === stage("VIEWING_BOOKED").name && onToday.leadId === buyer.id,
     onToday ? `${onToday.person} · ${onToday.stage} · ${onToday.days}d` : "not listed");
  const sToday = await as(todayRouter, sales.id, "AGENT").brief();
  ok("the sales agent's Today has their own sale and not the letting",
     sToday.otherBusiness.some((o) => o.id === mine.id) && !sToday.otherBusiness.some((o) => o.id === letting.id),
     sToday.otherBusiness.map((o) => o.title).join(" | "));
  const oToday = await as(todayRouter, other.id, "AGENT").brief();
  ok("a colleague's Today has none of it", oToday.otherBusiness.length === 0, String(oToday.otherBusiness.length));

  const ask = (userId: string, role: string) => as(searchRouter, userId, role).ask({ q: "gardenia" });
  const lFound = (await ask(lettings.id, "AGENT")).hits.find((h) => h.id === buyer.id);
  ok("search finds the person by what the business is called",
     !!lFound && lFound.why.some((w) => w.startsWith("other business: Letting their villa")), JSON.stringify(lFound?.why ?? null));
  ok("and it is the lettings agent's to open", !!lFound && !lFound.restricted && lFound.href === `/blackbook/${buyer.id}`,
     `${lFound?.restricted} ${lFound?.href}`);
  const oFound = (await ask(other.id, "AGENT")).hits.find((h) => h.id === buyer.id);
  ok("a colleague is told somebody matches, not who or what the business is",
     !!oFound && oFound.restricted && oFound.title === "Another agent's client" && !oFound.why.some((w) => w.includes("Gardenia")),
     oFound ? `${oFound.title} · ${oFound.why.join("; ")}` : "not found");

  const now = new Date();
  const kpis = await as(reportsRouter, manager.id, "MANAGER").kpis({ from: new Date(now.getTime() - 86_400_000), to: now });
  // Studio 650,000 at New (5%) and letting 180,000 at Viewing booked (35%).
  ok("the KPIs count other business beside the leads' pipeline",
     kpis.pipeline.otherBusiness.open === 2 && kpis.pipeline.otherBusiness.fils === 83_000_000n
       && kpis.pipeline.otherBusiness.weightedFils === 9_550_000n,
     `${kpis.pipeline.otherBusiness.open} · ${kpis.pipeline.otherBusiness.fils} · ${kpis.pipeline.otherBusiness.weightedFils}`);
  ok("and leave the leads' own figure as it was", kpis.pipeline.unweightedFils === 300_000_000n, String(kpis.pipeline.unweightedFils));

  console.log("\n=== it ends on its own ===");
  await L.close({ id: letting.id, won: true });
  const won = await root.opportunity.findUniqueOrThrow({ where: { id: letting.id } });
  ok("the letting is won, in the Won column", won.status === "WON" && !!won.closedAt && won.stageId === stage("WON").id, won.status);
  const still = await root.lead.findUniqueOrThrow({ where: { id: buyer.id } });
  ok("and the purchase carries on", still.status === "QUALIFYING");
  const audited = await root.auditLog.count({ where: { orgId: org.id, action: { startsWith: "opportunity." } } });
  ok("every change is in the audit log", audited >= 4, String(audited));

  console.log("\n=== the person's rights ===");
  const file = await exportSubject(org.id, buyer.phone);
  ok("a subject access request lists their other business", (file?.otherBusiness ?? []).some((o) => o.what.startsWith("Letting their villa")),
     String(file?.otherBusiness?.length));
  await eraseSubject({ orgId: org.id, phone: buyer.phone, requestedBy: manager.id, reason: "check" });
  const titles = (await root.opportunity.findMany({ where: { leadId: buyer.id }, select: { title: true } })).map((o) => o.title);
  ok("and erasure removes what they said, keeping the count", titles.length === 2 && titles.every((t) => t === "Erased at the person's request"), titles.join(" | "));

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
