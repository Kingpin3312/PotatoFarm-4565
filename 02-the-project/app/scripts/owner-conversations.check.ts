import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { respond } from "../src/server/assistant/run";
import { sweep as notifySweep } from "../src/server/lib/notify/sweep";
import { conversationsRouter } from "../src/server/api/routers/conversations";
import { vendorsRouter } from "../src/server/api/routers/vendors";
import { fatal } from "./fatal";

/**
 * A property owner has a WhatsApp thread with the brokerage — and the
 * assistant never speaks in it.
 *
 * `Conversation.leadId` was required, so every message between an agent
 * and an owner happened on the agent's own phone, and an owner who wrote
 * to the brokerage's number was filed as a new *buyer*, rotated to
 * whoever was next and qualified. This drives the real ingest, the real
 * inbox procedures and the real assistant turn against two stand-ins on
 * loopback — WhatsApp and the model — so nothing leaves this machine.
 *
 * The assistant's reply had never run anywhere, not even here. It runs
 * in this check for the first time, which is how its billing was found
 * to be recorded only when it failed.
 *
 *     npm run check:owner-conversations
 */
const root = crossTenant("sweep");
const SLUG = "owner-conversations-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `owner-conversations-check-${k}-${RUN}@example.com`;
const PNID = `pnid-owner-check-${RUN}`;
const REF = `OWNERCHECK${RUN.toUpperCase()}`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
/** `respond` returns a reason on every path but success. */
const why = (r: object) => (r as { reason?: string }).reason ?? "";
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};

/** The two providers, answered locally. What was asked of each is kept. */
const sent: { to: string; body: string }[] = [];
let modelCalls = 0;
let modelFails = false;
const standIn = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/messages") {
      modelCalls++;
      if (modelFails) { res.statusCode = 500; res.end(JSON.stringify({ error: "down" })); return; }
      res.end(JSON.stringify({
        content: [{ type: "text", text: "Thanks for getting in touch. Are you looking to buy or to rent?" }],
        usage: { input_tokens: 120, output_tokens: 20 },
      }));
      return;
    }
    if (req.url?.endsWith("/messages")) {
      sent.push({ to: body.to, body: body.text?.body ?? body.template?.name ?? "" });
      res.end(JSON.stringify({ messages: [{ id: `wamid.check.${sent.length}.${RUN}` }] }));
      return;
    }
    res.statusCode = 404; res.end("{}");
  });
});

let wamid = 0;
const payload = (from: string, text: string, at: Date, id = `wamid.in.${RUN}.${++wamid}`) => ({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: PNID },
    contacts: [{ profile: { name: "Somebody" } }],
    messages: [{ id, from: from.replace("+", ""), timestamp: String(Math.floor(at.getTime() / 1000)), type: "text", text: { body: text } }],
  } }] }],
});

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.notification.deleteMany({ where });
    await root.conversationCharge.deleteMany({ where });
    await root.aiAction.deleteMany({ where }).catch(() => {});
    await root.message.deleteMany({ where });
    await root.conversation.deleteMany({ where });
    await root.leadOwnership.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.listing.deleteMany({ where });
    await root.vendor.deleteMany({ where });
    await root.qualificationProfile.deleteMany({ where });
    await root.assistantSettings.deleteMany({ where });
    await root.subscription.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "owner-conversations-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nAn owner has a thread, and the assistant stays out of it\n");
  await new Promise<void>((r) => standIn.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  process.env.WHATSAPP_GRAPH_BASE = base;
  process.env.ASSISTANT_API_BASE = base;
  process.env.ANTHROPIC_API_KEY ||= "check-only-not-a-key";
  process.env[`SECRET_${REF}`] = "check-only-whatsapp-token";
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Owner Conversations Check", slug: `${SLUG}a` } });
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
  await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: PNID, secretRef: REF } });
  await root.assistantSettings.create({ data: { orgId: org.id, enabled: true } });
  await root.qualificationProfile.create({ data: { orgId: org.id, name: "Default", active: true } });
  await root.subscription.create({
    data: { orgId: org.id, plan: "check", seatPriceFils: 9900n, currentFrom: new Date(Date.now() - 86_400_000), currentTo: new Date(Date.now() + 29 * 86_400_000) },
  });

  const digits = RUN.replace(/\D/g, "").padEnd(7, "7").slice(-7);
  // Typed the way an agent types it: local format, with spaces.
  const hana = await root.vendor.create({ data: { orgId: org.id, name: "Hana Suleiman", phone: `050 ${digits.slice(0, 3)} ${digits.slice(3)}` } });
  const hanaWa = `+97150${digits}`;
  await root.listing.create({
    data: { orgId: org.id, reference: `OC-${RUN}`, title: "Marina Gate 2-bed", bedrooms: 2, priceFils: 250_000_000n,
            purpose: "SALE", status: "AVAILABLE", vendorId: hana.id, agentId: agent.id },
  });

  const as = (userId: string, role: "AGENT" | "MANAGER") => {
    const ctx = { session: { user: { id: userId } }, membership: { orgId: org.id, orgName: org.name, role }, ip: "127.0.0.1", userAgent: "owner-conversations-check" } as never;
    return { C: conversationsRouter.createCaller(ctx), V: vendorsRouter.createCaller(ctx) };
  };
  const A = as(agent.id, "AGENT"), Col = as(colleague.id, "AGENT"), M = as(manager.id, "MANAGER");
  const ownerThread = () => root.conversation.findUnique({ where: { vendorId: hana.id }, include: { messages: true } });

  console.log("=== the owner writes in ===");
  const leadsBefore = await root.lead.count({ where: { orgId: org.id } });
  const now = new Date();
  const first = payload(hanaWa, "Any news on the flat? Somebody said there was an offer.", now);
  await ingest(first);
  {
    const t = await ownerThread();
    ok("it lands on the owner's thread, matched although the number was typed as 050 …", t?.messages.length === 1 && t.leadId === null);
    ok("and does not become a buyer", (await root.lead.count({ where: { orgId: org.id } })) === leadsBefore);
    await ingest(first);
    const again = await ownerThread();
    ok("the same message delivered twice counts once", again?.messages.length === 1 && again.unreadCount === 1, `unread ${again?.unreadCount}`);
    await ingest(payload(hanaWa, "(sent earlier, arrived late)", new Date(now.getTime() - 3_600_000)));
    const late = await ownerThread();
    ok("an older message arriving late does not move the reply clock back",
       late?.lastInboundAt?.getTime() === Math.floor(now.getTime() / 1000) * 1000, `${late?.lastInboundAt?.toISOString()}`);
  }
  {
    const stranger = `+97155${digits}`;
    await ingest(payload(stranger, "Hi, is the Marina flat still available?", new Date()));
    const lead = await root.lead.findFirst({ where: { orgId: org.id, phone: stranger }, include: { conversation: true } });
    ok("a number nobody knows is still a new buyer", !!lead?.conversation);
  }

  {
    const channel = await root.channel.findFirstOrThrow({ where: { orgId: org.id } });
    const nobody = await refused(() => root.conversation.create({ data: { orgId: org.id, channelId: channel.id } }));
    const both = await refused(async () => {
      const l = await root.lead.findFirstOrThrow({ where: { orgId: org.id } });
      return root.conversation.create({ data: { orgId: org.id, channelId: channel.id, leadId: l.id, vendorId: hana.id } });
    });
    ok("the database refuses a conversation with nobody, or with both", !!nobody && !!both);
  }

  console.log("\n=== who sees it ===");
  const conv = (await ownerThread())!;
  {
    const mine = await A.C.list({ filter: "all" });
    const row = mine.rows.find((r) => r.id === conv.id);
    ok("the agent who looks after the property sees it, labelled as an owner", row?.party.kind === "OWNER" && row.party.name === "Hana Suleiman");
    ok("and under \"mine\"", (await A.C.list({ filter: "mine" })).rows.some((r) => r.id === conv.id));
    ok("a manager sees it", (await M.C.list({ filter: "all" })).rows.some((r) => r.id === conv.id));
    ok("a colleague does not", !(await Col.C.list({ filter: "all" })).rows.some((r) => r.id === conv.id));
    const e1 = await refused(() => Col.C.thread({ conversationId: conv.id }));
    ok("or open it", e1?.code === "NOT_FOUND", e1?.code ?? "allowed");
    const e2 = await refused(() => Col.C.mute({ conversationId: conv.id, muted: true }));
    ok("or mute it — mute and take-over used to accept any id in the brokerage", e2?.code === "NOT_FOUND", e2?.code ?? "allowed");
    const e3 = await refused(() => Col.C.takeover({ conversationId: conv.id, on: true }));
    ok("or take it over", e3?.code === "NOT_FOUND", e3?.code ?? "allowed");
  }

  console.log("\n=== the agent replies ===");
  {
    await A.C.send({ conversationId: conv.id, body: "Hi Hana, one offer came in this morning. I'll call you at five." });
    const out = sent.at(-1);
    ok("it goes to the owner's number, as WhatsApp needs it", out?.to === hanaWa.slice(1), out?.to ?? "nothing sent");
    const t = await root.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    ok("and says when we last wrote to them — read by scoring, written by nothing until now", t.lastOutboundAt !== null);
  }

  console.log("\n=== starting a thread from the owner's page ===");
  {
    const karim = await root.vendor.create({ data: { orgId: org.id, name: "Karim Nasser", phone: `+97152${digits}` } });
    await root.listing.create({ data: { orgId: org.id, reference: `OC2-${RUN}`, title: "Town Square 3-bed", purpose: "SALE", vendorId: karim.id, agentId: agent.id } });
    const a = await A.V.openConversation({ vendorId: karim.id });
    const b = await A.V.openConversation({ vendorId: karim.id });
    ok("an agent opens a thread with an owner they look after, once", a.conversationId === b.conversationId);
    const e = await refused(() => Col.V.openConversation({ vendorId: karim.id }));
    ok("a colleague cannot", e?.code === "NOT_FOUND", e?.code ?? "allowed");
    const nobody = await root.vendor.create({ data: { orgId: org.id, name: "No Number", phone: "call the lawyer" } });
    const e2 = await refused(() => M.V.openConversation({ vendorId: nobody.id }));
    ok("an owner with no number we can read is refused in words", e2?.code === "PRECONDITION_FAILED" && /country code/.test(e2.message), e2?.message ?? "allowed");
    const made = await M.V.create({ name: "New Owner", phone: "050 111 2233" });
    ok("a new owner's number is stored so a WhatsApp message can find them",
       (await root.vendor.findUniqueOrThrow({ where: { id: made.id } })).phone === "+971501112233");
    const e3 = await refused(() => M.V.create({ name: "Typo Owner", phone: "not a number" }));
    ok("and one that cannot be read is refused rather than saved", e3?.code === "BAD_REQUEST", e3?.code ?? "allowed");
  }

  console.log("\n=== the assistant ===");
  {
    const before = { calls: modelCalls, sent: sent.length };
    const r = await respond(org.id, conv.id);
    ok("never replies to an owner", !r.sent && why(r) === "owner_conversation", why(r));
    ok("and never asked the model", modelCalls === before.calls && sent.length === before.sent);

    const buyer = await root.lead.findFirstOrThrow({ where: { orgId: org.id, phone: `+97155${digits}` }, include: { conversation: true } });
    const reply = await respond(org.id, buyer.conversation!.id);
    ok("a buyer who wrote in is answered — the first time this has run anywhere", reply.sent === true, why(reply));
    ok("and that answer is what is billed",
       (await root.conversationCharge.count({ where: { conversationId: buyer.conversation!.id } })) === 1);

    const other = `+97156${digits}`;
    await ingest(payload(other, "Hello, what's the service charge on the Marina flat?", new Date()));
    const b2 = await root.lead.findFirstOrThrow({ where: { orgId: org.id, phone: other }, include: { conversation: true } });
    modelFails = true;
    const failed = await respond(org.id, b2.conversation!.id);
    modelFails = false;
    ok("when the model fails a person is asked to take it", !failed.sent && why(failed).startsWith("handover"), why(failed));
    ok("and the brokerage is not billed for our failure",
       (await root.conversationCharge.count({ where: { conversationId: b2.conversation!.id } })) === 0);
  }

  console.log("\n=== nobody answers the owner ===");
  {
    await ingest(payload(hanaWa, "Hello? Still waiting to hear about that offer.", new Date(Date.now() - 45 * 60_000)));
    // Their message is the last word, three quarters of an hour ago: the
    // agent's reply an hour back, everything the owner sent at 45 minutes.
    await root.message.updateMany({ where: { conversationId: conv.id, direction: "OUTBOUND" }, data: { sentAt: new Date(Date.now() - 60 * 60_000) } });
    await root.message.updateMany({ where: { conversationId: conv.id, direction: "INBOUND" }, data: { sentAt: new Date(Date.now() - 45 * 60_000) } });
    await notifySweep();
    const n = await root.notification.findFirst({ where: { orgId: org.id, kind: "OWNER_WAITING" } });
    ok("the agent who looks after the property is told", n?.userId === agent.id, n ? `to ${n.userId === manager.id ? "the manager" : n.userId}` : "nobody told");
  }

  console.log("\n=== they ask us to stop ===");
  {
    await ingest(payload(hanaWa, "STOP", new Date()));
    ok("\"stop\" from an owner turns their scheduled report off",
       (await root.vendor.findUniqueOrThrow({ where: { id: hana.id } })).reportsOff === true);
  }

  // The assistant's extraction runs after its reply, unawaited.
  await new Promise((r) => setTimeout(r, 500));
  await cleanup();
  standIn.close();
  console.log(bad ? `\n${bad} FAILED\n` : "\nowners have a thread, and the assistant stays out of it.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
