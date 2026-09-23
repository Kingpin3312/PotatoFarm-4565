import fs from "node:fs";
import { crossTenant } from "../src/server/db/client";
import { JOBS } from "../src/server/jobs";
import { sweep as sweepVisa, draftNudge } from "../src/server/lib/matching/visa-nudge";
import { todayRouter } from "../src/server/api/routers/today";
import { fatal } from "./fatal";

/**
 * Nothing records a contact that did not happen.
 *
 * Four scheduled jobs decided whom to message and then sent nothing,
 * while writing down that they had:
 *
 *   - `matching.new-listings` stamped `Lead.lastOutreachAt` and counted
 *     the buyer as messaged — and the Buyers screen read that stamp to
 *     tell an agent the buyer had been "messaged 3 days ago";
 *   - `feedback.ask` stamped `ViewingFeedback.askedAt` and counted the
 *     viewer as asked;
 *   - the visa sweep stamped `visaNudgedAt`, which then kept the lead
 *     out of the sweep for ninety days;
 *   - `plans.advance` took every nurture step, logged it, and moved on.
 *
 * None of them may send by itself — `intelligence/autonomy.ts` stops
 * every message to a client at a person pressing send — so each now
 * puts a task on the responsible agent's list, and stamps or advances
 * only in the same transaction. This proves that against Postgres, by
 * running the real jobs, and proves the list those tasks land on exists
 * and can be cleared: `FollowUp` had writers, a count on Today, and no
 * list and no way to complete one.
 *
 * Times are pinned where a rule reads the clock. The visa sweep applies
 * Dubai sending hours and the feedback job waits two hours after a
 * viewing and never asks after 8pm, so a check that used "now" would
 * pass at 2pm and prove nothing at 11pm.
 *
 *     npm run check:agent-tasks
 */
const root = crossTenant("sweep");
const SLUG = "agent-tasks-check-";
const EMAIL = (k: string) => `agent-tasks-check-${k}@example.com`;
const M = (aed: number) => BigInt(aed) * 100n;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const daysFromNow = (d: Date | null | undefined) =>
  d ? Math.round((d.getTime() - Date.now()) / 86_400_000) : null;

/**
 * Child first. Deleting the organisation does not cascade to any of
 * these — `FollowUp`, `ViewingFeedback` and the plan models carry an
 * `orgId` and no relation back to it — so a check that relied on it
 * would leave its fixtures on every agent's Today list.
 */
async function cleanup() {
  const orgs = await root.organisation.findMany({
    where: { slug: { startsWith: SLUG } }, select: { id: true },
  });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return;
  const where = { orgId: { in: ids } };
  await root.followUp.deleteMany({ where });
  await root.viewingFeedback.deleteMany({ where });
  await root.planSubscription.deleteMany({ where });
  await root.planStep.deleteMany({ where });
  await root.taskPlan.deleteMany({ where });
  await root.viewing.deleteMany({ where });
  await root.requirement.deleteMany({ where });
  await root.conversation.deleteMany({ where });
  await root.lead.deleteMany({ where });
  await root.listing.deleteMany({ where });
  await root.channel.deleteMany({ where });
  await root.membership.deleteMany({ where });
  await root.organisation.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  console.log("\nNothing records a contact that did not happen\n");
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Agent Tasks Check", slug: `${SLUG}a` } });
  const agent = await root.user.upsert({
    where: { email: EMAIL("a") },
    create: { email: EMAIL("a"), name: "Yasmin Haddad" },
    update: { name: "Yasmin Haddad" },
  });
  const colleague = await root.user.upsert({
    where: { email: EMAIL("b") },
    create: { email: EMAIL("b"), name: "Tom Reilly" },
    update: {},
  });
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: agent.id, role: "AGENT" },
      { orgId: org.id, userId: colleague.id, role: "AGENT" },
    ],
  });
  const channel = await root.channel.create({
    data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: "+97140000009" },
  });
  const listing = await root.listing.create({
    data: {
      orgId: org.id, reference: "AT-1", title: "3-bed villa, Dubai Hills",
      community: "Dubai Hills", bedrooms: 3, priceFils: M(4_000_000),
      purpose: "SALE", status: "AVAILABLE",
    },
  });

  let phone = 500_000_700;
  const lead = (name: string, o: { agentId?: string | null; visa?: Date; inboundDaysAgo?: number } = {}) =>
    root.lead.create({
      data: {
        orgId: org.id, phone: `+971${++phone}`, name, status: "QUALIFYING",
        assignedToId: o.agentId === undefined ? agent.id : o.agentId,
        visaExpiresAt: o.visa ?? null,
        ...(o.inboundDaysAgo !== undefined && {
          conversation: {
            create: {
              orgId: org.id, channelId: channel.id,
              lastInboundAt: new Date(Date.now() - o.inboundDaysAgo * 86_400_000),
            },
          },
        }),
      },
    });

  /* ------------------------------------------------------------------ */
  console.log("=== the matching job that only pretended is gone ===");
  {
    const jobs = Object.keys(JOBS);
    const crons = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons.map((c: { path: string }) => c.path);
    ok("matching.new-listings is not a job", !jobs.includes("matching.new-listings"));
    ok("and is not scheduled", !crons.some((p: string) => p.endsWith("/matching.new-listings")));
    // The allowed version is the overnight engine's SEND_PROPERTY, which
    // needs the agent's yes. It must still be there, or retiring the job
    // took the feature with it.
    ok("the engine that puts matches on an agent's list still runs", jobs.includes("intelligence.sweep"));
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== nurture plan steps become tasks, and only then are taken ===");
  const plan = await root.taskPlan.create({
    data: {
      orgId: org.id, name: "Long horizon buyer", audience: "BUYER",
      steps: {
        create: [
          { orgId: org.id, order: 1, afterDays: 14, action: "CHECK_MATCHES", template: "new_match" },
          { orgId: org.id, order: 2, afterDays: 30, action: "MESSAGE", template: "market_note" },
          { orgId: org.id, order: 3, afterDays: 45, action: "TASK", taskTitle: "Call — they said around now." },
        ],
      },
    },
  });
  const past = new Date(Date.now() - 3_600_000);
  const started = new Date(Date.now() - 30 * 86_400_000);
  const sub = async (leadId: string, currentStep: number) =>
    root.planSubscription.create({
      data: { orgId: org.id, planId: plan.id, leadId, currentStep, nextDueAt: past, startedAt: started },
    });

  const matched = await lead("Priya Nair");
  await root.requirement.create({
    data: {
      orgId: org.id, leadId: matched.id, purpose: "SALE", intent: "BUY_TO_LIVE",
      budgetMaxFils: M(4_200_000), bedroomsMin: 3, communities: ["Dubai Hills"], source: "AGENT",
    },
  });
  const nothingFits = await lead("Omar Khalid");
  const nobodysLead = await lead("Unassigned Buyer", { agentId: null });
  const onMessage = await lead("Sara Lindqvist");
  const onLast = await lead("James Okafor");

  const sMatched = await sub(matched.id, 0);
  const sQuiet = await sub(nothingFits.id, 0);
  const sNobody = await sub(nobodysLead.id, 0);
  const sMessage = await sub(onMessage.id, 1);
  const sLast = await sub(onLast.id, 2);

  const r1 = (await JOBS["plans.advance"]()) as Record<string, unknown>;
  ok("the job ran and nothing failed", r1.ok === true && r1.failed === 0, JSON.stringify(r1));

  const tasksFor = (leadId: string) =>
    root.followUp.findMany({ where: { orgId: org.id, leadId }, orderBy: { createdAt: "asc" } });
  const subNow = (id: string) => root.planSubscription.findUniqueOrThrow({ where: { id } });

  {
    const t = await tasksFor(matched.id);
    const s = await subNow(sMatched.id);
    ok("a match becomes a task for the lead's agent",
       t.length === 1 && t[0]!.agentId === agent.id && t[0]!.title === `Send Priya ${listing.title}`,
       t.map((x) => x.title).join(" | ") || "no task");
    ok("carrying a draft the agent can send", !!t[0]?.body?.includes("something's just come up"));
    ok("and the step is taken", s.currentStep === 1);
    // The call-site half of the timing fix: the next step's own delay,
    // not the one just taken. 14 here would be the old bug.
    ok("the next step is due after its own 30 days", daysFromNow(s.nextDueAt) === 30,
       `${daysFromNow(s.nextDueAt)} days`);
  }
  {
    const t = await tasksFor(nothingFits.id);
    const s = await subNow(sQuiet.id);
    ok("nothing fits: no task, and the step is still taken — silence is an outcome",
       t.length === 0 && s.currentStep === 1, `${t.length} tasks, step ${s.currentStep}`);
  }
  {
    const t = await tasksFor(nobodysLead.id);
    const s = await subNow(sNobody.id);
    ok("no agent: no task, and the step is NOT taken",
       t.length === 0 && s.currentStep === 0 && s.state === "RUNNING" && !!s.nextDueAt && s.nextDueAt <= new Date(),
       `step ${s.currentStep}, ${s.state}`);
    ok("and the job says why", (r1.unassigned as number) >= 1, `unassigned ${r1.unassigned}`);
  }
  {
    const t = await tasksFor(onMessage.id);
    const s = await subNow(sMessage.id);
    ok("a message step names the template Meta needs",
       t.length === 1 && t[0]!.title === 'Send Sara the "market_note" message', t[0]?.title ?? "no task");
    ok("and waits the third step's 45 days", daysFromNow(s.nextDueAt) === 45, `${daysFromNow(s.nextDueAt)} days`);
  }
  {
    const t = await tasksFor(onLast.id);
    const s = await subNow(sLast.id);
    ok("the last step becomes its task and the plan completes",
       t.length === 1 && t[0]!.title.startsWith("Call") && s.state === "COMPLETED",
       `${t[0]?.title ?? "no task"}, ${s.state}`);
  }
  {
    await JOBS["plans.advance"]();
    const all = await root.followUp.count({ where: { orgId: org.id } });
    ok("run again straight away, nothing is repeated", all === 3, `${all} tasks`);
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== a viewing's feedback is asked by the agent who showed it ===");
  // Yesterday at 10am Dubai: two hours after it ends is 12:30, inside
  // the asking hours, and in the past whenever this check runs.
  const yesterday10 = new Date();
  yesterday10.setUTCDate(yesterday10.getUTCDate() - 1);
  yesterday10.setUTCHours(6, 0, 0, 0);

  const viewer = await lead("Aisha Rahman");
  const unshown = await lead("No Agent Viewer", { agentId: null });
  const shown = await root.viewing.create({
    data: {
      orgId: org.id, leadId: viewer.id, listingId: listing.id, agentId: agent.id,
      scheduledAt: yesterday10, durationMins: 30, status: "COMPLETED",
    },
  });
  const orphan = await root.viewing.create({
    data: {
      orgId: org.id, leadId: unshown.id, listingId: listing.id, agentId: null,
      scheduledAt: yesterday10, durationMins: 30, status: "COMPLETED",
    },
  });

  const f1 = (await JOBS["feedback.ask"]()) as Record<string, unknown>;
  ok("the job ran and nothing failed", f1.ok === true && f1.failed === 0, JSON.stringify(f1));
  {
    const t = await tasksFor(viewer.id);
    const row = await root.viewingFeedback.findUnique({ where: { viewingId: shown.id } });
    ok("the agent is asked to ask",
       t.length === 1 && t[0]!.agentId === agent.id && t[0]!.title === `Ask Aisha what they thought of ${listing.title}`,
       t[0]?.title ?? "no task");
    ok("with the one question, ready to send", !!t[0]?.body?.includes("what did you think of"));
    // The whole bug: this was stamped with nothing sent.
    ok("the buyer is not recorded as asked", row !== null && row.askedAt === null,
       row ? `askedAt ${row.askedAt}` : "no row");
    // The vendor report finds feedback by listing, and this was never
    // written — so an answer could not have reached the owner's report.
    ok("the feedback is filed against the property", row?.listingId === listing.id);
  }
  {
    const t = await tasksFor(unshown.id);
    const row = await root.viewingFeedback.findUnique({ where: { viewingId: orphan.id } });
    ok("nobody to ask: no task and no row, so it is tried again", t.length === 0 && row === null);
  }
  {
    await JOBS["feedback.ask"]();
    ok("run again, the agent is not asked twice", (await tasksFor(viewer.id)).length === 1);
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== a visa renewal goes to the agent, stamped only with the task ===");
  // Noon in Dubai today: inside sending hours, which the outreach rules
  // the sweep applies will otherwise refuse.
  const noon = new Date();
  noon.setUTCHours(8, 0, 0, 0);
  const inForty = new Date(noon.getTime() + 40 * 86_400_000);

  const tenant = await lead("Lena Fischer", { visa: inForty, inboundDaysAgo: 10 });
  const nobodysTenant = await lead("Unassigned Tenant", { agentId: null, visa: inForty, inboundDaysAgo: 10 });

  const v1 = await sweepVisa(noon);
  {
    const t = await tasksFor(tenant.id);
    const l = await root.lead.findUniqueOrThrow({ where: { id: tenant.id } });
    ok("the agent gets a task naming why now",
       t.length === 1 && t[0]!.agentId === agent.id && t[0]!.title.includes("visa renews"),
       t[0]?.title ?? `no task — ${JSON.stringify(v1)}`);
    // The draft is what goes to the tenant, and the module's rule is that
    // it never mentions the visa: "thinking of you", not "we have a file".
    const draft = t[0]?.body?.split("A draft:")[1] ?? "";
    ok("the draft itself never mentions the visa",
       draft.includes(draftNudge()) && !/visa/i.test(draft));
    ok("and only now is the lead marked", l.visaNudgedAt !== null);
  }
  {
    const t = await tasksFor(nobodysTenant.id);
    const l = await root.lead.findUniqueOrThrow({ where: { id: nobodysTenant.id } });
    // Stamped here, this lead would be kept out of the sweep for ninety
    // days having been told nothing — the bug in its purest form.
    ok("no agent: no task and not marked, so tomorrow tries again",
       t.length === 0 && l.visaNudgedAt === null && v1.unassigned >= 1);
  }
  {
    await sweepVisa(noon);
    ok("run again, it is not raised twice", (await tasksFor(tenant.id)).length === 1);
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== and nobody was recorded as contacted ===");
  {
    const stamped = await root.lead.count({ where: { orgId: org.id, lastOutreachAt: { not: null } } });
    // `decide()` reads this for the fortnight rule and the Buyers screen
    // shows it to agents. Nothing above sent a message.
    ok("no lead has a lastOutreachAt", stamped === 0, `${stamped}`);
  }

  /* ------------------------------------------------------------------ */
  console.log("\n=== the list the tasks land on exists, and clears ===");
  {
    const caller = (userId: string) => todayRouter.createCaller({
      session: { user: { id: userId } },
      membership: { orgId: org.id, orgName: org.name, role: "AGENT" },
      ip: "127.0.0.1", userAgent: "agent-tasks-check",
    } as never);

    // One the agent set for the day after tomorrow. Without it every
    // task here is due now, and a list that forgot its "due by the end
    // of today" rule would still agree with the count above it.
    const later = await root.followUp.create({
      data: { orgId: org.id, agentId: agent.id, title: "Chase the valuation",
              dueAt: new Date(Date.now() + 2 * 86_400_000) },
    });

    const mine = await caller(agent.id).followUps();
    // Five: three plan steps (one was silent, one had nobody), one
    // viewing, one visa renewal.
    ok("the agent sees every task due today", mine.length === 5, `${mine.length} listed`);
    ok("and not the one due later in the week", !mine.some((f) => f.id === later.id));
    ok("with the person it is about",
       mine.some((f) => f.lead?.name === "Priya Nair"));

    // The count in the opening sentence and the list must agree — the
    // last time two halves of Today counted different things, it opened
    // "nothing is waiting" above five things to do.
    const brief = await caller(agent.id).brief();
    ok("the count on Today matches the list", brief.counts.followUpsDue === mine.length,
       `${brief.counts.followUpsDue} vs ${mine.length}`);

    const theirs = await caller(colleague.id).completeFollowUp({ id: mine[0]!.id });
    ok("a colleague cannot clear it", theirs.done === false);

    const done = await caller(agent.id).completeFollowUp({ id: mine[0]!.id });
    const after = await caller(agent.id).followUps();
    ok("the agent can", done.done === true && after.length === mine.length - 1,
       `${mine.length} → ${after.length}`);
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\nevery contact recorded is one somebody made.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
