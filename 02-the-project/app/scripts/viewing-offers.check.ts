/**
 * A qualified buyer is offered real times; the agent confirms.
 *
 * The assistant's script ended "suggest a viewing and say an agent will
 * confirm the time" — with no time — and nothing moved a lead to
 * Qualified when its answers were in. This drives the real WhatsApp
 * ingest, the real assistant (model and WhatsApp on loopback stand-ins)
 * and the real viewings procedures, and asserts:
 *
 * - the assistant's answers move the lead to Qualified;
 * - at a brokerage with automatic replies on, the buyer is then offered
 *   up to three real free times — inside working hours, never on the
 *   agent's own busy calendar;
 * - "2" holds that slot as a request on the agent's list, nothing is
 *   confirmed to the buyer, and nobody else is offered it;
 * - only the agent (or a manager) can answer it; Confirm books it, moves
 *   the lead to Viewing booked and tells the buyer; "Can't make it" frees
 *   the slot and tells them new times will follow;
 * - "any of them" is not a pick; a request nobody answers lands on the
 *   agent's list rather than vanishing; an agent's own short hold still
 *   simply lapses;
 * - the agent's own "Offer viewing times" refuses outside WhatsApp's
 *   24 hours rather than sending into the void.
 *
 *     npm run check:viewing-offers
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { viewingsRouter } from "../src/server/api/routers/viewings";
import { expireHolds } from "../src/server/lib/reminders";
import { makeOffer } from "../src/server/lib/viewings/offer";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "viewing-offers-check-";
const RUN = Date.now().toString(36);
const PNID = `pnid-viewing-offers-${RUN}`;
const REF = `VIEWOFFERS${RUN.toUpperCase()}`;
const EMAIL = (k: string) => `${SLUG}${k}-${RUN}@example.com`;
const TZ_OFFSET_H = 4;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`);
  if (!p) bad++;
};
const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");

/** What reached the loopback WhatsApp, and what the model was asked. */
const sent: { to?: string; body?: string }[] = [];
const standIn = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/messages") {
      // 300 is the reply, 400 the extractor (`assistant/run.ts`).
      const text = body.max_tokens === 400
        ? JSON.stringify({ budgetMin: null, budgetMax: 2_500_000, intent: "BUY_TO_LIVE", timeframe: null, financing: null, communities: [], bedrooms: 2,
                           confidence: { budgetMax: 0.9, intent: 0.9 } })
        : "Lovely — a 2 bed to live in, around 2.5m. Let me find you a time to see it.";
      res.end(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 20 } }));
      return;
    }
    if (req.url?.endsWith("/messages")) {
      if (body.status === "read") { res.end(JSON.stringify({ success: true })); return; }
      sent.push({ to: body.to, body: body.text?.body });
      res.end(JSON.stringify({ messages: [{ id: `wamid.out.${RUN}.${sent.length}` }] }));
      return;
    }
    res.statusCode = 404; res.end("{}");
  });
});
const to = (phone: string) => sent.filter((s) => s.to === phone.replace("+", "")).map((s) => s.body ?? "");

let wamid = 0;
const write = (from: string, text: string) => ingest({ entry: [{ changes: [{ value: {
  metadata: { phone_number_id: PNID },
  contacts: [{ profile: { name: "A Buyer" } }],
  messages: [{ id: `wamid.in.${RUN}.${++wamid}`, from: from.replace("+", ""), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
} }] }] });

/** Extraction runs after the reply has gone; wait for what it leads to. */
async function until<T>(f: () => Promise<T>, okWhen: (v: T) => boolean, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  let v = await f();
  while (!okWhen(v) && Date.now() < end) { await new Promise((r) => setTimeout(r, 150)); v = await f(); }
  return v;
}

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    for (const t of ["notification", "conversationCharge", "replyDraft", "assistantUsage", "answer", "followUp", "viewingOffer",
                     "viewing", "enquiry", "message", "conversation", "leadOwnership", "requirement", "lead", "listing",
                     "calendarBusy", "emailAccount", "pipelineStage", "question", "qualificationProfile", "assistantSettings",
                     "workingHours", "subscription", "assignmentRule", "channel", "auditLog", "membership"] as const) {
      // The audit log refuses deletes by design; everything else goes.
      await (root as any)[t].deleteMany({ where: t === "question" ? { profile: where } : where }).catch(() => {});
    }
    await root.organisation.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
  await root.user.deleteMany({ where: { email: { startsWith: SLUG } } }).catch(() => {});
}

async function main() {
  console.log("\nA qualified buyer is offered real times, and the agent confirms\n");
  await new Promise<void>((r) => standIn.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    WHATSAPP_GRAPH_BASE: base, ASSISTANT_API_BASE: base, ASSISTANT_REPLY_PAUSE_MS: "0",
    [`SECRET_${REF}`]: "check-only-whatsapp-token",
  });
  process.env.ANTHROPIC_API_KEY ||= "check-only-not-a-key";
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Viewing Offers Realty", slug: `${SLUG}${RUN}` } });
  const [lena, sam, boss] = await Promise.all([
    root.user.create({ data: { email: EMAIL("lena"), name: "Lena Haddad" } }),
    root.user.create({ data: { email: EMAIL("sam"), name: "Sam Other" } }),
    root.user.create({ data: { email: EMAIL("boss"), name: "Omar Owner" } }),
  ]);
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: lena.id, role: "AGENT" }, { orgId: org.id, userId: sam.id, role: "AGENT" },
    { orgId: org.id, userId: boss.id, role: "OWNER" },
  ] });
  await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: PNID, secretRef: REF } });
  await root.assignmentRule.create({ data: { orgId: org.id, name: "Lena", priority: 1, strategy: "SPECIFIC", userIds: [lena.id] } });
  for (const [i, s] of (["NEW", "QUALIFYING", "QUALIFIED", "VIEWING_BOOKED"] as const).entries()) {
    await root.pipelineStage.create({ data: { orgId: org.id, name: s, position: i * 1000, maps: s } });
  }
  await root.assistantSettings.create({ data: { orgId: org.id, enabled: true, autoReply: true } });
  const profile = await root.qualificationProfile.create({ data: { orgId: org.id, name: "Default", active: true } });
  await root.question.createMany({ data: [
    { profileId: profile.id, order: 1, key: "purpose", prompt: "Buying to live in, or to invest?", required: true },
    { profileId: profile.id, order: 2, key: "budget", prompt: "What budget?", required: true },
  ] });
  await root.subscription.create({ data: { orgId: org.id, plan: "check", seatPriceFils: 9900n, currentFrom: new Date(Date.now() - 86_400_000), currentTo: new Date(Date.now() + 29 * 86_400_000) } });
  // Open 09:00–18:00 every day, Dubai time.
  await root.workingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ orgId: org.id, dayOfWeek: d, startMin: 9 * 60, endMin: 18 * 60 })) });
  const listing = await root.listing.create({ data: {
    orgId: org.id, reference: "MG-202", title: "Marina Gate 2 bed", community: "Dubai Marina", building: "Marina Gate 1",
    bedrooms: 2, priceFils: 250_000_000n, purpose: "SALE", status: "AVAILABLE", agentId: lena.id,
  } });

  // Lena's own calendar: busy all of the day after tomorrow, Dubai time.
  const dubaiDay = (plus: number) => {
    const d = new Date(Date.now() + TZ_OFFSET_H * 3_600_000 + plus * 86_400_000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TZ_OFFSET_H * 3_600_000);
  };
  const acct = await root.emailAccount.create({ data: { orgId: org.id, agentId: lena.id, provider: "GOOGLE", address: EMAIL("mail"), secretRef: `vo-${RUN}` } });
  const busyFrom = dubaiDay(2), busyTo = new Date(dubaiDay(2).getTime() + 86_400_000);
  await root.calendarBusy.create({ data: { orgId: org.id, accountId: acct.id, agentId: lena.id, startsAt: busyFrom, endsAt: busyTo } });

  const caller = (userId: string, role: "AGENT" | "OWNER") => viewingsRouter.createCaller({
    session: { user: { id: userId } }, membership: { orgId: org.id, orgName: org.name, role }, ip: "127.0.0.1", userAgent: "viewing-offers",
  } as never);
  const L = caller(lena.id, "AGENT"), S = caller(sam.id, "AGENT");

  const digits = RUN.replace(/\D/g, "").padEnd(6, "4").slice(-6);
  const phone = (n: number) => `+9715${n}${digits}`;
  const leadOf = (p: string) => root.lead.findUniqueOrThrow({ where: { orgId_phone: { orgId: org.id, phone: p } }, include: { conversation: true } });
  const offerOf = (conversationId: string) => root.viewingOffer.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" } });

  console.log("=== the assistant qualifies, then offers real times ===");
  const a = phone(1);
  await write(a, "Hi, I'm after MG-202 to live in, budget up to 2.5m");
  const offerA = await until(async () => { const l = await leadOf(a); return l.conversation ? offerOf(l.conversation.id) : null; }, (o) => !!o);
  const la = await leadOf(a);
  ok("the assistant's answers move the lead to Qualified", la.status === "QUALIFIED", la.status);
  ok("and it says so in the audit log", (await root.auditLog.count({ where: { orgId: org.id, action: "lead.qualified_by_assistant", entityId: la.id } })) >= 1);
  const offerText = to(a).find((t) => t.startsWith("Here are a few times")) ?? "";
  ok("the buyer is sent real times, numbered, for the property", !!offerA && offerA.slots.length === 3 && /1\. .*\n2\. .*\n3\. /.test(offerText) && offerText.includes("Marina Gate 2 bed"),
     offerText.split("\n")[0]);
  const local = (d: Date) => new Date(d.getTime() + TZ_OFFSET_H * 3_600_000);
  ok("every time is inside working hours and at least two hours away",
     !!offerA && offerA.slots.every((s) => local(s).getUTCHours() >= 9 && local(s).getUTCHours() < 18 && s.getTime() > Date.now() + 2 * 3_600_000),
     offerA?.slots.map((s) => s.toISOString()).join(", "));
  ok("and none is on Lena's own busy calendar", !!offerA && offerA.slots.every((s) => s < busyFrom || s >= busyTo));
  ok("offered as Lena, never claiming to be her", offerText.includes("Lena is free") && offerText.includes("Lena will confirm"));

  console.log("\n=== the buyer picks ===");
  const before = to(a).length;
  await write(a, "2");
  const held = await root.viewing.findFirst({ where: { leadId: la.id } });
  ok("their pick is held as a request for Lena", held?.status === "SCHEDULED" && !!held.requestedAt && held.agentId === lena.id
     && held.scheduledAt.getTime() === offerA!.slots[1]!.getTime(), JSON.stringify(held && { status: held.status, requested: !!held.requestedAt }));
  ok("and nothing says 'confirmed' to them yet", to(a).slice(before).every((t) => !/confirmed/i.test(t)));
  ok("the lead is not yet booked", (await leadOf(a)).status === "QUALIFIED");
  const task = await root.followUp.findFirst({ where: { orgId: org.id, viewingId: held?.id } });
  ok("it is on Lena's list to confirm", task?.agentId === lena.id && /^Confirm /.test(task.title), task?.title);
  ok("on her Viewings, and not on a colleague's",
     (await L.requests()).some((r) => r.id === held?.id) && !(await S.requests()).some((r) => r.id === held?.id));

  const b = phone(2);
  await write(b, "Hello, MG-202 please, buying to live, 2.5m");
  const offerB = await until(async () => { const l = await leadOf(b); return l.conversation ? offerOf(l.conversation.id) : null; }, (o) => !!o);
  ok("the held slot is not offered to the next buyer", !!offerB && !offerB.slots.some((s) => s.getTime() === held!.scheduledAt.getTime()));

  console.log("\n=== the agent answers ===");
  ok("a colleague cannot confirm Lena's request", (await code(S.confirmRequest({ viewingId: held!.id }))) === "NOT_FOUND");
  const conf = await L.confirmRequest({ viewingId: held!.id });
  const booked = await root.viewing.findUniqueOrThrow({ where: { id: held!.id } });
  ok("Confirm books it", booked.status === "CONFIRMED" && booked.heldUntil === null);
  ok("moves the lead to Viewing booked", (await leadOf(a)).status === "VIEWING_BOOKED");
  ok("closes the task", !!(await root.followUp.findUniqueOrThrow({ where: { id: task!.id } })).completedAt);
  ok("and tells the buyer, from the agent's tap", conf.told && to(a).some((t) => t.startsWith("Confirmed: ") && t.includes("Lena will meet you")),
     to(a).at(-1));
  ok("answered once: a second tap finds nothing", (await code(L.confirmRequest({ viewingId: held!.id }))) === "NOT_FOUND");

  await write(b, "The first one");
  const heldB = await root.viewing.findFirst({ where: { lead: { phone: b, orgId: org.id } } });
  const dec = await L.declineRequest({ viewingId: heldB!.id });
  ok("Can't make it frees the slot", !(await root.viewing.findUnique({ where: { id: heldB!.id } })));
  ok("and tells them other times are coming", dec.told && to(b).some((t) => t.startsWith("Sorry — Lena can't make")));

  console.log("\n=== what is not a pick, and what is never silent ===");
  const c = phone(3);
  await write(c, "Hi, MG-202, to live in, budget 2.5m");
  await until(async () => { const l = await leadOf(c); return l.conversation ? offerOf(l.conversation.id) : null; }, (o) => !!o);
  await write(c, "Any of them works for me");
  ok("'any of them' books nothing", (await root.viewing.count({ where: { lead: { phone: c, orgId: org.id } } })) === 0);
  await write(c, "3");
  const heldC = await root.viewing.findFirstOrThrow({ where: { lead: { phone: c, orgId: org.id } } });
  await root.viewing.update({ where: { id: heldC.id }, data: { heldUntil: new Date(Date.now() - 60_000) } });
  const own = await root.viewing.create({ data: { orgId: org.id, leadId: la.id, agentId: lena.id, scheduledAt: new Date(Date.now() + 10 * 86_400_000), status: "SCHEDULED", heldUntil: new Date(Date.now() - 60_000) } });
  await expireHolds();
  ok("a request nobody answered is let go", !(await root.viewing.findUnique({ where: { id: heldC.id } })));
  ok("onto Lena's list, not into silence",
     (await root.followUp.count({ where: { orgId: org.id, agentId: lena.id, title: { contains: "viewing request lapsed" } } })) === 1);
  ok("while an agent's own short hold still simply lapses",
     !(await root.viewing.findUnique({ where: { id: own.id } })) && (await root.followUp.count({ where: { orgId: org.id, title: { contains: "lapsed" } } })) === 1);

  console.log("\n=== the agent's own button ===");
  const lc = await leadOf(c);
  await root.conversation.update({ where: { id: lc.conversation!.id }, data: { lastInboundAt: new Date(Date.now() - 25 * 3_600_000) } });
  const sentBefore = sent.length;
  ok("outside WhatsApp's 24 hours it refuses rather than sending into the void",
     (await code(L.offerTimes({ conversationId: lc.conversation!.id }))) === "PRECONDITION_FAILED" && sent.length === sentBefore);
  await root.conversation.update({ where: { id: lc.conversation!.id }, data: { lastInboundAt: new Date() } });
  const r = await L.offerTimes({ conversationId: lc.conversation!.id });
  const agentMsg = await root.message.findFirst({ where: { conversationId: lc.conversation!.id, author: "AGENT" }, orderBy: { sentAt: "desc" } });
  ok("inside them it sends the times as Lena's own message", r.slots.length > 0 && !!agentMsg?.body.startsWith("Here are a few times") && agentMsg.authorId === lena.id);
  ok("a colleague cannot offer times on Lena's buyer", (await code(S.offerTimes({ conversationId: lc.conversation!.id }))) === "NOT_FOUND");
  const nobody = await makeOffer(org.id, "no-such-conversation");
  ok("and there is no offer without a buyer", !nobody.ok);

  await cleanup();
  standIn.close();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); standIn.close(); fatal(e); });
