import { crossTenant } from "../src/server/db/client";
import { JOBS } from "../src/server/jobs";
import { plansRouter } from "../src/server/api/routers/plans";
import { LONG_HORIZON_BUYER } from "../src/server/lib/plans/run";
import { fatal } from "./fatal";

/**
 * A nurture plan can be written, somebody can be put on it, and the
 * nightly job then does what the plan says — and stops when it should.
 *
 * `plans.advance` ran every morning over `PlanSubscription` with careful
 * rules for replies and opt-outs, and nothing could create a plan or put
 * anybody on one; it had only ever run inside a check that inserted its
 * own rows. This one creates them through the procedures an agent and a
 * manager use, because a check that sets up its own preconditions cannot
 * test how they are created.
 *
 *     npm run check:nurture-plans
 */
const root = crossTenant("sweep");
const SLUG = "nurture-plans-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `nurture-plans-check-${k}-${RUN}@example.com`;
const DAY = 86_400_000;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};
const days = (d: Date | null | undefined) => (d ? Math.round((d.getTime() - Date.now()) / DAY) : null);

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.followUp.deleteMany({ where });
    await root.planSubscription.deleteMany({ where });
    await root.planStep.deleteMany({ where });
    await root.taskPlan.deleteMany({ where });
    await root.conversation.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "nurture-plans-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nA nurture plan can be written, used, and stopped\n");
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Nurture Plans Check", slug: `${SLUG}a` } });
  const mk = (k: string, name: string) => root.user.create({ data: { email: EMAIL(k), name } });
  const agent = await mk("agent", "Tom Reilly");
  const colleague = await mk("colleague", "Yasmin Haddad");
  const manager = await mk("manager", "Maya Chen");
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: agent.id, role: "AGENT" },
      { orgId: org.id, userId: colleague.id, role: "AGENT" },
      { orgId: org.id, userId: manager.id, role: "MANAGER" },
    ],
  });
  const channel = await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: `+9714${RUN.slice(-7)}` } });
  let n = 0;
  const lead = (name: string, o: Record<string, unknown> = {}) => root.lead.create({
    data: { orgId: org.id, phone: `+97150${String(Date.now() + n++).slice(-7)}`, name, assignedToId: agent.id, ...o },
  });

  const as = (userId: string, role: "AGENT" | "MANAGER") => plansRouter.createCaller({
    session: { user: { id: userId } },
    membership: { orgId: org.id, orgName: org.name, role },
    ip: "127.0.0.1", userAgent: "nurture-plans-check",
  } as never);
  const A = as(agent.id, "AGENT"), M = as(manager.id, "MANAGER");
  const fromExample = LONG_HORIZON_BUYER.map((s) => ({
    action: s.action, afterDays: s.afterDays, template: s.template ?? undefined, taskTitle: s.taskTitle ?? undefined,
  }));

  console.log("=== writing a plan ===");
  const forbidden = await refused(() => A.create({ name: "Agent's own", audience: "BUYER", steps: fromExample }));
  ok("an agent cannot write the brokerage's plans", forbidden?.code === "FORBIDDEN", forbidden?.code ?? "allowed");
  const empty = await refused(() => M.create({
    name: "Broken", audience: "BUYER", steps: [{ action: "MESSAGE", afterDays: 7 }],
  }));
  ok("a message step with no template is refused, in words", empty?.code === "BAD_REQUEST" && /template/.test(empty.message), empty?.message ?? "allowed");
  const { id: longId } = await M.create({ name: "Long horizon buyer", audience: "BUYER", steps: fromExample });
  const steps = await root.planStep.findMany({ where: { planId: longId }, orderBy: { order: "asc" } });
  ok("a manager can, and every step is kept in order", steps.length === 6 && steps.map((s) => s.order).join() === "1,2,3,4,5,6");
  ok("with only the field each step uses", steps[0]!.template === null && steps[1]!.template === "market_note");
  const dup = await refused(() => M.create({ name: "Long horizon buyer", audience: "BUYER", steps: fromExample }));
  ok("two plans cannot share a name", dup?.code === "CONFLICT", dup?.code ?? "allowed");
  const { id: callId } = await M.create({
    name: "Ring them back", audience: "BUYER",
    steps: [{ action: "TASK", afterDays: 3, taskTitle: "Ring them — they asked for a call in a few days" },
            { action: "REVIEW", afterDays: 10 }],
  });
  const seen = await A.list();
  ok("an agent sees the plans, and is not offered the builder",
     seen.plans.length === 2 && seen.canManage === false && (await M.list()).canManage === true);

  console.log("\n=== putting somebody on one ===");
  const priya = await lead("Priya Nair");
  {
    const r = await A.subscribe({ leadId: priya.id, planId: longId });
    ok("an agent puts their own buyer on a plan, first step fourteen days out", days(r.firstDueAt) === 14, `${days(r.firstDueAt)} days`);
    const view = await A.forLead({ leadId: priya.id });
    ok("their page says what comes next and when",
       view.subscriptions[0]?.state === "RUNNING" && /only if one does/.test(view.subscriptions[0]?.next ?? ""));
    const twice = await refused(() => A.subscribe({ leadId: priya.id, planId: callId }));
    ok("one plan at a time", twice?.code === "CONFLICT", twice?.code ?? "allowed");
  }
  {
    const theirs = await lead("Not Yours", { assignedToId: colleague.id });
    const e1 = await refused(() => A.subscribe({ leadId: theirs.id, planId: longId }));
    ok("not a colleague's buyer", e1?.code === "NOT_FOUND", e1?.code ?? "allowed");
    const quiet = await lead("Asked Us To Stop", { optedOutOfOutreach: true, optedOutAt: new Date() });
    const e2 = await refused(() => A.subscribe({ leadId: quiet.id, planId: longId }));
    ok("not somebody who asked not to be messaged", e2?.code === "PRECONDITION_FAILED", e2?.code ?? "allowed");
    const won = await lead("Already Bought", { status: "WON" });
    const e3 = await refused(() => A.subscribe({ leadId: won.id, planId: longId }));
    ok("not a closed file", e3?.code === "PRECONDITION_FAILED", e3?.code ?? "allowed");
    const nobody = await lead("Nobody's", { assignedToId: null });
    const e4 = await refused(() => M.subscribe({ leadId: nobody.id, planId: longId }));
    ok("not somebody with no agent to give the steps to", e4?.code === "PRECONDITION_FAILED", e4?.code ?? "allowed");
    ok("and none of those put anybody on a plan",
       (await root.planSubscription.count({ where: { orgId: org.id } })) === 1);
  }

  console.log("\n=== the nightly job does what the plan says ===");
  const omar = await lead("Omar Saleh", {
    conversation: { create: { orgId: org.id, channelId: channel.id, lastInboundAt: new Date(Date.now() - 30 * DAY) } },
  });
  await A.subscribe({ leadId: omar.id, planId: callId });
  const omarSub = () => root.planSubscription.findFirstOrThrow({ where: { leadId: omar.id, planId: callId } });
  const tasks = () => root.followUp.findMany({ where: { orgId: org.id, leadId: omar.id }, orderBy: { createdAt: "asc" } });
  const due = (id: string) => root.planSubscription.update({ where: { id }, data: { nextDueAt: new Date(Date.now() - 60_000) } });
  {
    await due((await omarSub()).id);
    await JOBS["plans.advance"]();
    const t = await tasks(), s = await omarSub();
    ok("a due step becomes a task on their agent's list", t.length === 1 && t[0]!.agentId === agent.id && t[0]!.title.startsWith("Ring them"), t[0]?.title ?? "no task");
    ok("the step is taken and the next one timed by its own delay", s.currentStep === 1 && days(s.nextDueAt) === 10, `step ${s.currentStep}, ${days(s.nextDueAt)} days`);
  }

  console.log("\n=== a reply pauses it; the agent decides to carry on ===");
  {
    await root.conversation.updateMany({ where: { leadId: omar.id }, data: { lastInboundAt: new Date() } });
    await due((await omarSub()).id);
    await JOBS["plans.advance"]();
    ok("they wrote back, so the plan pauses and asks nothing of anybody",
       (await omarSub()).state === "PAUSED" && (await tasks()).length === 1);
    const view = await A.forLead({ leadId: omar.id });
    ok("their page says it paused because they replied", view.subscriptions[0]?.state === "PAUSED");

    await A.resume({ subscriptionId: (await omarSub()).id });
    const s = await omarSub();
    ok("carrying on is the agent's decision, and waits a day", s.state === "RUNNING" && days(s.nextDueAt)! >= 1, `${s.state}, ${days(s.nextDueAt)} days`);
    await due(s.id);
    await JOBS["plans.advance"]();
    const after = await omarSub();
    // Before `resumedAt` the same reply paused it again here, so "carry
    // on" did nothing anybody could see.
    ok("and the reply that paused it does not pause it again", (await tasks()).length === 2, `${(await tasks()).length} tasks, ${after.state}`);
    ok("the last step taken, the plan is finished", after.state === "COMPLETED" && after.endedReason === "sequence finished");
    await A.subscribe({ leadId: omar.id, planId: callId });
    const again = await omarSub();
    ok("a finished plan can be run again from the start", again.state === "RUNNING" && again.currentStep === 0 && again.resumedAt === null);
  }

  console.log("\n=== stopping ===");
  {
    const sub = await root.planSubscription.findFirstOrThrow({ where: { leadId: priya.id } });
    await A.stop({ subscriptionId: sub.id });
    await due(sub.id);
    const before = await root.followUp.count({ where: { leadId: priya.id } });
    await JOBS["plans.advance"]();
    const s = await root.planSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    ok("an agent stops it, and nothing more comes up",
       s.state === "STOPPED" && (await root.followUp.count({ where: { leadId: priya.id } })) === before);
    const e = await refused(() => A.stop({ subscriptionId: sub.id }));
    ok("stopping twice says it has finished", e?.code === "CONFLICT", e?.code ?? "allowed");

    const gone = await lead("Removed Later");
    await A.subscribe({ leadId: gone.id, planId: longId });
    const g = await root.planSubscription.findFirstOrThrow({ where: { leadId: gone.id } });
    await root.lead.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await due(g.id);
    await JOBS["plans.advance"]();
    const gs = await root.planSubscription.findUniqueOrThrow({ where: { id: g.id } });
    ok("somebody removed from the book comes off their plan rather than being re-read for ever",
       gs.state === "STOPPED" && gs.endedReason === "removed from the book", `${gs.state}`);
  }

  console.log("\n=== retiring a plan ===");
  {
    const newcomer = await lead("New Buyer");
    await M.setActive({ planId: longId, active: false });
    const e = await refused(() => A.subscribe({ leadId: newcomer.id, planId: longId }));
    ok("a retired plan takes nobody new", e?.code === "NOT_FOUND", e?.code ?? "allowed");
    ok("and is not offered on a person's page",
       !(await A.forLead({ leadId: newcomer.id })).plans.some((p) => p.id === longId));
    const e2 = await refused(() => A.setActive({ planId: callId, active: false }));
    ok("an agent cannot retire one", e2?.code === "FORBIDDEN", e2?.code ?? "allowed");
    ok("every change is in the audit log",
       (await root.auditLog.count({ where: { orgId: org.id, action: { in: ["plan.create", "plan.subscribe", "plan.resume", "plan.stop", "plan.retire"] } } })) === 9);
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\na plan can be written, used and stopped, and the job does what it says.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
