import { crossTenant } from "../src/server/db/client";
import { JOBS } from "../src/server/jobs";
import { viewingsRouter } from "../src/server/api/routers/viewings";
import { todayRouter } from "../src/server/api/routers/today";
import { exportSubject } from "../src/server/lib/privacy/export";
import { eraseSubject } from "../src/server/lib/privacy/erase";
import { fatal } from "./fatal";

/**
 * What a buyer thought reaches the owner — counted, never quoted.
 *
 * `ViewingFeedback.verdict` and `answeredAt` had no writer. The job put
 * the question on the agent's list and there was nowhere to put the
 * answer, so the owner's weekly report — which reads answered rows only —
 * said "nobody has come back yet" to every owner, every week, and could
 * never say the thing it exists to say: "two of them named the price".
 *
 * This drives the whole path through the real jobs and procedures: the
 * job asks, the agent records the answer on the task, the task closes,
 * the owner's report counts it — and the buyer's own words appear
 * nowhere the owner reads. It also proves an agent cannot act on a
 * colleague's viewing, which every viewing mutation allowed.
 *
 *     npm run check:viewing-feedback
 */
const root = crossTenant("sweep");
const SLUG = "viewing-feedback-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `viewing-feedback-check-${k}-${RUN}@example.com`;
// What a buyer might really say. It must never reach an owner.
const BLUNT = "Honestly the kitchen is hideous and they are dreaming on price";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};

/** Child first: none of these cascade from the organisation. */
async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.followUp.deleteMany({ where });
    await root.vendorReport.deleteMany({ where });
    await root.viewingFeedback.deleteMany({ where });
    await root.viewing.deleteMany({ where });
    await root.conversation.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.listing.deleteMany({ where });
    await root.vendor.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "viewing-feedback-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nWhat a buyer thought reaches the owner, counted and never quoted\n");
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Viewing Feedback Check", slug: `${SLUG}a` } });
  const mk = (k: string, name: string) => root.user.create({ data: { email: EMAIL(k), name } });
  const agent = await mk("agent", "Tom Reilly");
  const colleague = await mk("colleague", "Yasmin Haddad");
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: agent.id, role: "AGENT" },
      { orgId: org.id, userId: colleague.id, role: "AGENT" },
    ],
  });
  const dow = new Date().getUTCDay() === 0 ? 7 : new Date().getUTCDay();
  const owner = await root.vendor.create({
    data: { orgId: org.id, name: "Hana Suleiman", phone: `+9715099${RUN.slice(-5)}`, prefers: "WHATSAPP", reportDay: dow },
  });
  const listing = await root.listing.create({
    data: { orgId: org.id, reference: `VF-${RUN}`, title: "Marina Gate 2-bed", community: "Marina", bedrooms: 2,
            priceFils: 250_000_000n, purpose: "SALE", status: "AVAILABLE", vendorId: owner.id, agentId: agent.id },
  });
  let n = 0;
  const lead = (name: string, assignedToId: string) => root.lead.create({
    data: { orgId: org.id, phone: `+97150${String(Date.now() + n++).slice(-7)}`, name, assignedToId },
  });
  // Yesterday, in the morning in Dubai, an hour apart — the diary's
  // exclusion constraint refuses two viewings at once for one agent.
  const at = (h: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); d.setUTCHours(h, 0, 0, 0); return d; };
  const viewing = (leadId: string, agentId: string, h: number, status: "COMPLETED" | "SCHEDULED" = "COMPLETED") =>
    root.viewing.create({ data: { orgId: org.id, leadId, listingId: listing.id, agentId, scheduledAt: at(h), durationMins: 30, status } });

  const priya = await lead("Priya Nair", agent.id);
  const omar = await lead("Omar Saleh", agent.id);
  const theirs = await lead("Not Yours", colleague.id);
  const v1 = await viewing(priya.id, agent.id, 5);
  const vTheirs = await viewing(theirs.id, colleague.id, 5);
  const later = await root.viewing.create({
    data: { orgId: org.id, leadId: priya.id, listingId: listing.id, agentId: agent.id,
            scheduledAt: new Date(Date.now() + 3 * 86_400_000), durationMins: 30, status: "SCHEDULED" },
  });

  const ctx = (userId: string) => ({
    session: { user: { id: userId } },
    membership: { orgId: org.id, orgName: org.name, role: "AGENT" },
    ip: "127.0.0.1", userAgent: "viewing-feedback-check",
  } as never);
  const V = viewingsRouter.createCaller(ctx(agent.id));
  let V2 = "";
  const T = todayRouter.createCaller(ctx(agent.id));

  console.log("=== the question carries its viewing ===");
  await JOBS["feedback.ask"]();
  const task = await root.followUp.findFirst({ where: { orgId: org.id, leadId: priya.id, completedAt: null } });
  ok("the job puts the question on the agent's list, tied to the viewing", task?.viewingId === v1.id, task?.viewingId ?? "no task");
  const listed = (await T.followUps()).find((f) => f.id === task?.id);
  ok("and Today hands the screen that viewing, so the answer can be recorded there", listed?.viewingId === v1.id);

  console.log("\n=== only theirs, and only what fits ===");
  {
    const e1 = await refused(() => V.feedback({ viewingId: vTheirs.id, verdict: "NOT_FOR_ME", reasons: [] }));
    ok("an agent cannot record feedback on a colleague's viewing", e1?.code === "NOT_FOUND", e1?.code ?? "allowed");
    const e2 = await refused(() => V.outcome({ viewingId: vTheirs.id, status: "NO_SHOW" }));
    ok("or mark it a no-show", e2?.code === "NOT_FOUND", e2?.code ?? "allowed");
    ok("and the colleague's buyer was not moved back a stage by the attempt",
       (await root.viewing.findUniqueOrThrow({ where: { id: vTheirs.id } })).status === "COMPLETED");
    const e3 = await refused(() => V.reschedule({ viewingId: vTheirs.id, start: new Date(Date.now() + 5 * 86_400_000) }));
    ok("or move it", e3?.code === "NOT_FOUND", e3?.code ?? "allowed");
    const e4 = await refused(() => V.confirm({ viewingId: vTheirs.id }));
    ok("or confirm it", e4?.code === "NOT_FOUND", e4?.code ?? "allowed");
    const e5 = await refused(() => V.hold({ leadId: theirs.id, start: new Date(Date.now() + 6 * 86_400_000) }));
    ok("or book the colleague's buyer in", e5?.code === "NOT_FOUND", e5?.code ?? "allowed");
    const e6 = await refused(() => V.feedback({ viewingId: v1.id, verdict: "OFFERING", reasons: ["PRICE_TOO_HIGH"] }));
    ok("somebody making an offer is not given a reason", e6?.code === "BAD_REQUEST", e6?.code ?? "allowed");
    const e7 = await refused(() => V.feedback({ viewingId: v1.id, verdict: "NOT_FOR_ME", reasons: ["NOT_AS_ADVERTISED"] }));
    ok("a reason the buyer is never offered for that answer is refused", e7?.code === "BAD_REQUEST", e7?.code ?? "allowed");
    const e8 = await refused(() => V.feedback({ viewingId: later.id, verdict: "INTERESTED", reasons: [] }));
    ok("a viewing that has not happened has no feedback", e8?.code === "PRECONDITION_FAILED", e8?.code ?? "allowed");
    ok("and none of the refusals wrote anything",
       (await root.viewingFeedback.count({ where: { orgId: org.id, answeredAt: { not: null } } })) === 0);
  }

  console.log("\n=== recording the answer ===");
  {
    const r = await V.feedback({ viewingId: v1.id, verdict: "NOT_FOR_ME", reasons: ["PRICE_TOO_HIGH", "LAYOUT"], comment: BLUNT });
    const row = await root.viewingFeedback.findUniqueOrThrow({ where: { viewingId: v1.id } });
    ok("the verdict and reasons are kept", row.verdict === "NOT_FOR_ME" && row.reasons.join() === "PRICE_TOO_HIGH,LAYOUT");
    ok("answered, asked, by the agent", !!row.answeredAt && !!row.askedAt && row.source === "AGENT");
    ok("filed against the property, which is how the owner's report finds it", row.listingId === listing.id);
    const closed = await root.followUp.findUniqueOrThrow({ where: { id: task!.id } });
    ok("the task that asked is closed by the answer", closed.completedAt !== null && r.tasksClosed === 1);
    ok("and has left Today", !(await T.followUps()).some((f) => f.id === task!.id));
    const log = await root.auditLog.findFirst({ where: { orgId: org.id, action: "viewing.feedback", entityId: v1.id } });
    const text = JSON.stringify(log?.after ?? {});
    ok("the audit log records the ticks and not their words", text.includes("NOT_FOR_ME") && !text.includes("hideous"), text);

    // At the door, in the same save as "they came" — a viewing the job
    // has not reached yet, so "not asked again" is the answer's doing.
    const v2 = await viewing(omar.id, agent.id, 6);
    await V.outcome({ viewingId: v2.id, status: "COMPLETED", feedback: { verdict: "INTERESTED", reasons: ["PRICE_TOO_HIGH"] } });
    const row2 = await root.viewingFeedback.findUnique({ where: { viewingId: v2.id } });
    ok("or recorded with the outcome, when the agent already knows", row2?.verdict === "INTERESTED" && !!row2.answeredAt);
    await JOBS["feedback.ask"]();
    ok("and then nobody is asked for it", (await root.followUp.count({ where: { orgId: org.id, leadId: omar.id } })) === 0);
    V2 = v2.id;
  }

  console.log("\n=== the owner's report ===");
  {
    await JOBS["feedback.vendor-report"]();
    const report = await root.vendorReport.findFirst({ where: { orgId: org.id, listingId: listing.id } });
    const body = (report?.summary as { body?: string } | null)?.body ?? "";
    ok("counts who came back", body.includes("2 came back to us"), body.split("\n")[0]);
    ok("and what they named", body.includes("2 mentioned price") && body.includes("1 mentioned layout"),
       body.split("\n").find((l) => l.startsWith("What they said")) ?? "no reasons line");
    const toSend = await root.followUp.findFirst({ where: { orgId: org.id, agentId: agent.id, title: { contains: "Hana Suleiman" } } });
    ok("the report reaches the agent to send", !!toSend?.body?.includes("2 mentioned price"));
    const everything = `${JSON.stringify(report)}\n${toSend?.body ?? ""}`;
    ok("the buyer's own words appear nowhere the owner reads",
       !everything.includes("hideous") && !everything.includes("dreaming"));
  }

  console.log("\n=== corrected to \"didn't happen\" ===");
  const v2 = { id: V2 };
  {
    await V.outcome({ viewingId: v2.id, status: "NO_SHOW" });
    ok("nobody viewed, so there is no opinion to count",
       (await root.viewingFeedback.findUnique({ where: { viewingId: v2.id } })) === null);
    const e = await refused(() => V.outcome({ viewingId: v2.id, status: "CANCELLED", feedback: { verdict: "INTERESTED", reasons: [] } }));
    ok("and an opinion cannot be recorded against one", e?.code === "BAD_REQUEST", e?.code ?? "allowed");
  }

  console.log("\n=== the buyer's rights ===");
  {
    const mine = await exportSubject(org.id, priya.phone);
    const seen = mine?.viewings.find((x) => "whatYouThought" in x && x.whatYouThought);
    ok("a subject access request includes what they said about a viewing",
       !!seen && JSON.stringify(seen).includes("hideous"));
    await eraseSubject({ orgId: org.id, phone: priya.phone, requestedBy: agent.id, reason: "check" });
    const row = await root.viewingFeedback.findUniqueOrThrow({ where: { viewingId: v1.id } });
    ok("erasure removes their words", row.comment === null);
    ok("and keeps the tick the owner's report already counted", row.verdict === "NOT_FOR_ME");
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\nwhat a buyer thought reaches the owner, counted and never quoted.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
