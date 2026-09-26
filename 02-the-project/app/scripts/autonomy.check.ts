import { crossTenant } from "../src/server/db/client";
import { sweepIntelligence } from "../src/server/lib/intelligence/sweep";
import { levelFor } from "../src/server/lib/intelligence/autonomy";
import { fatal } from "./fatal";

const db = crossTenant("sweep");
let bad = 0;
const ok = (l: string, p: boolean, d = "") => { console.log(`  ${p?"✓":"✗"} ${l}${d?`  — ${d}`:""}`); if(!p) bad++; };

async function main() {
  console.log("\nThe ceiling holds regardless of the mode:");
  ok("COPILOT only ever suggests", levelFor("COPILOT","FOLLOW_UP")==="SUGGEST");
  ok("ASSISTED prepares but does not act", levelFor("ASSISTED","FOLLOW_UP")==="DRAFT");
  ok("AUTOPILOT may create a follow-up", levelFor("AUTOPILOT","FOLLOW_UP")==="EXECUTE");
  ok("but never sends a property unattended", levelFor("AUTOPILOT","SEND_PROPERTY")==="CONFIRM");
  ok("nor reactivates a cold lead unattended", levelFor("AUTOPILOT","REACTIVATE")==="CONFIRM");
  ok("and never negotiates at all", levelFor("AUTOPILOT","NEGOTIATE")==="SUGGEST");
  ok("a call is prepared, never placed", levelFor("AUTOPILOT","CALL")==="DRAFT");

  const org = await db.organisation.findFirstOrThrow({ where: { slug: "seed-marina" } });
  /**
   * A lead that needs a follow-up and nothing else, owned by the check.
   *
   * This used to lean on the demo happening to contain one. When the
   * demo buyers were given requirements, every stalled buyer became a
   * "send them the property" instead, and the Autopilot half had nothing
   * it was allowed to do — a check passing or failing on the state of the
   * fixture rather than the code. Sitting three weeks in a stage with no
   * requirement, no viewing and no offer is the one path to FOLLOW_UP
   * that nothing else outranks.
   */
  const agent = await db.membership.findFirstOrThrow({ where: { orgId: org.id, role: "AGENT" }, select: { userId: true } });
  await db.lead.deleteMany({ where: { orgId: org.id, phone: "+971509990001" } });
  const stalledLead = await db.lead.create({
    data: {
      orgId: org.id, phone: "+971509990001", name: "Autonomy Check Stalled", status: "QUALIFYING",
      assignedToId: agent.userId, stageEnteredAt: new Date(Date.now() - 21 * 86_400_000),
      createdAt: new Date(Date.now() - 25 * 86_400_000),
    },
  });
  const reset = async () => {
    await db.aiAction.deleteMany({ where: { orgId: org.id, origin: "intelligence.sweep" } });
    await db.followUp.deleteMany({ where: { orgId: org.id } });
    await db.recommendation.deleteMany({ where: { orgId: org.id } });
  };

  console.log("\nCopilot: it tells you, and does nothing:");
  await db.assistantSettings.upsert({
    where: { orgId: org.id }, create: { orgId: org.id, enabled: true, autonomy: "COPILOT" },
    update: { enabled: true, autonomy: "COPILOT" },
  });
  await reset();
  const r1 = await sweepIntelligence();
  ok("nothing executed", r1.executed === 0, JSON.stringify(r1));
  ok("no follow-up created", (await db.followUp.count({ where: { orgId: org.id } })) === 0);
  const levels1 = await db.recommendation.findMany({ where: { orgId: org.id }, select: { autonomy: true } });
  ok("every recommendation is SUGGEST", levels1.every(r => r.autonomy === "SUGGEST"),
     [...new Set(levels1.map(r=>r.autonomy))].join(","));

  console.log("\nAutopilot: it does the one reversible internal thing:");
  await db.assistantSettings.update({ where: { orgId: org.id }, data: { autonomy: "AUTOPILOT" } });
  await reset();
  const r2 = await sweepIntelligence();
  ok("something executed", r2.executed > 0, JSON.stringify(r2));
  const fups = await db.followUp.findMany({ where: { orgId: org.id }, select: { id: true, title: true } });
  ok("follow-ups were created", fups.length === r2.executed, `${fups.length}`);
  const acts = await db.aiAction.findMany({ where: { orgId: org.id, origin: "intelligence.sweep" } });
  ok("each one is logged as an AI action", acts.length === r2.executed);
  ok("the log records enough to undo it",
     acts.every(a => a.entity === "FollowUp" && Boolean(a.entityId)));
  ok("and says why", acts.every(a => (a.interpretation ?? "").length > 15), acts[0]?.interpretation ?? "");
  const outbound = await db.recommendation.findMany({
    where: { orgId: org.id, action: { in: ["SEND_PROPERTY","REACTIVATE"] } }, select: { autonomy: true } });
  ok("outbound actions still need a yes",
     outbound.every(r => r.autonomy === "CONFIRM"), outbound.map(r=>r.autonomy).join(",") || "none present");

  console.log("\nRunning it again does not stack reminders:");
  const before = await db.followUp.count({ where: { orgId: org.id } });
  await sweepIntelligence();
  ok("no second reminder on the same lead",
     (await db.followUp.count({ where: { orgId: org.id } })) === before, `${before}`);

  console.log("\nThe kill switch outranks the gearbox:");
  await db.assistantSettings.update({ where: { orgId: org.id }, data: { enabled: false } });
  await reset();
  const r3 = await sweepIntelligence();
  ok("stopped means nothing runs unattended", r3.executed === 0, JSON.stringify(r3));
  ok("but it still tells you what to do", r3.recommended > 0);

  await db.assistantSettings.update({ where: { orgId: org.id }, data: { enabled: true, autonomy: "COPILOT" } });
  await reset();
  await db.leadScoreEvent.deleteMany({ where: { leadId: stalledLead.id } });
  await db.lead.delete({ where: { id: stalledLead.id } });
  console.log(bad === 0 ? "\nPASS\n" : `\nFAIL — ${bad}\n`);
  process.exit(bad ? 1 : 0);
}
main().catch(fatal);
