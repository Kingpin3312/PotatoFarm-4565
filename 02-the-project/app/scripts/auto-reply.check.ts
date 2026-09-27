import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { humanPause } from "../src/server/assistant/run";
import { assistantRouter } from "../src/server/api/routers/assistant";
import { fatal } from "./fatal";

/**
 * The assistant replies by itself while a buyer is being qualified.
 *
 * The owner's decision (27 September 2026), replacing drafts-only for
 * that one stage: a new buyer gets a reply in seconds that reads like a
 * good agent texting — their language, one question at a time — and a
 * person takes over from there. What this proves is the fence around it,
 * measured where a message would actually go (a loopback WhatsApp):
 *
 * - it sends only at a brokerage that turned it on, only while the lead
 *   is NEW or QUALIFYING, and only until an agent writes in the thread;
 * - everything that stops a draft stops a send — the kill switch, "I've
 *   got this", STOP;
 * - the buyer sees "typing…" first, and the reply is billed and recorded
 *   as the assistant's;
 * - only someone allowed to change channels can switch it, and each
 *   switch is on the audit log.
 *
 *     npm run check:auto-reply
 */
const root = crossTenant("sweep");
const SLUG = "auto-reply-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `auto-reply-check-${k}-${RUN}@example.com`;
const PNID = `pnid-auto-reply-${RUN}`;
const REF = `AUTOREPLY${RUN.toUpperCase()}`;
const REPLY = "Lovely — are you looking to buy or to rent?";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};

/** Everything that reached the loopback WhatsApp, in order. */
const graph: { kind: "typing" | "text"; to?: string; replyTo?: string; body?: string }[] = [];
const asked: string[] = [];
const standIn = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/messages") {
      if (body.max_tokens === 300) asked.push(String(body.system ?? ""));
      res.end(JSON.stringify({ content: [{ type: "text", text: REPLY }], usage: { input_tokens: 100, output_tokens: 20 } }));
      return;
    }
    if (req.url?.endsWith("/messages")) {
      if (body.status === "read") {
        graph.push({ kind: "typing", replyTo: body.message_id });
        res.end(JSON.stringify({ success: true }));
        return;
      }
      graph.push({ kind: "text", to: body.to, body: body.text?.body });
      res.end(JSON.stringify({ messages: [{ id: `wamid.out.${RUN}.${graph.length}` }] }));
      return;
    }
    res.statusCode = 404; res.end("{}");
  });
});
const texts = () => graph.filter((g) => g.kind === "text");

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.notification.deleteMany({ where });
    await root.conversationCharge.deleteMany({ where });
    await root.replyDraft.deleteMany({ where });
    await root.assistantUsage.deleteMany({ where });
    await root.answer.deleteMany({ where }).catch(() => {});
    await root.message.deleteMany({ where });
    await root.conversation.deleteMany({ where });
    await root.leadOwnership.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.pipelineStage.deleteMany({ where });
    await root.qualificationProfile.deleteMany({ where });
    await root.assistantSettings.deleteMany({ where });
    await root.subscription.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "auto-reply-check-" } } }).catch(() => {});
}

let wamid = 0;
const write = (from: string, text: string) => {
  const id = `wamid.in.${RUN}.${++wamid}`;
  return { id, payload: { entry: [{ changes: [{ value: {
    metadata: { phone_number_id: PNID },
    contacts: [{ profile: { name: "A Buyer" } }],
    messages: [{ id, from: from.replace("+", ""), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
  } }] }] } };
};

async function main() {
  console.log("\nThe assistant replies by itself while a buyer is being qualified\n");
  await new Promise<void>((r) => standIn.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  process.env.WHATSAPP_GRAPH_BASE = base;
  process.env.ASSISTANT_API_BASE = base;
  process.env.ANTHROPIC_API_KEY ||= "check-only-not-a-key";
  process.env[`SECRET_${REF}`] = "check-only-whatsapp-token";

  console.log("=== it waits like a person, briefly ===");
  delete process.env.ASSISTANT_REPLY_PAUSE_MS;
  const short = humanPause("Buy or rent?"), long = humanPause("x".repeat(2_000));
  ok("a couple of seconds for a short reply", short >= 2_000 && short < 3_000, `${short}ms`);
  ok("never more than seven, however long", long === 7_000, `${long}ms`);
  process.env.ASSISTANT_REPLY_PAUSE_MS = "0";
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Auto Reply Check", slug: `${SLUG}a` } });
  const owner = await root.user.create({ data: { email: EMAIL("owner"), name: "Omar Owner" } });
  const agent = await root.user.create({ data: { email: EMAIL("agent"), name: "Tom Agent" } });
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: owner.id, role: "OWNER" },
    { orgId: org.id, userId: agent.id, role: "AGENT" },
  ] });
  await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: PNID, secretRef: REF } });
  await root.pipelineStage.create({ data: { orgId: org.id, name: "New", position: 0, maps: "NEW" } });
  await root.assistantSettings.create({ data: { orgId: org.id, enabled: true } });
  await root.qualificationProfile.create({ data: { orgId: org.id, name: "Default", active: true } });
  await root.subscription.create({
    data: { orgId: org.id, plan: "check", seatPriceFils: 9900n, currentFrom: new Date(Date.now() - 86_400_000), currentTo: new Date(Date.now() + 29 * 86_400_000) },
  });
  const ctx = (userId: string, role: "OWNER" | "AGENT") => ({ session: { user: { id: userId } }, membership: { orgId: org.id, orgName: org.name, role }, ip: "127.0.0.1", userAgent: "auto-reply-check" }) as never;
  const O = assistantRouter.createCaller(ctx(owner.id, "OWNER"));
  const A = assistantRouter.createCaller(ctx(agent.id, "AGENT"));

  const digits = RUN.replace(/\D/g, "").padEnd(6, "5").slice(-6);
  let n = 0;
  const phone = () => `+9715${n++}${digits}`;
  const threadOf = async (p: string) =>
    (await root.lead.findFirstOrThrow({ where: { orgId: org.id, phone: p }, include: { conversation: true } }));

  let early = "";
  console.log("\n=== off, as every brokerage starts ===");
  {
    ok("automatic replies start off", (await O.status()).autoReply === false);
    const p = phone();
    early = p;
    await ingest(write(p, "Hi, is the Marina flat available?").payload);
    const l = await threadOf(p);
    ok("a new buyer's reply is drafted, not sent", texts().length === 0 &&
       (await root.replyDraft.count({ where: { conversationId: l.conversation!.id, state: "OPEN" } })) === 1);
  }

  console.log("\n=== the owner turns it on ===");
  {
    const e = await refused(() => A.setAutoReply({ on: true }));
    ok("an agent cannot switch it", e?.code === "FORBIDDEN", e?.code ?? "allowed");
    await O.setAutoReply({ on: true });
    ok("the owner can", (await O.status()).autoReply === true);
    ok("and it is on the audit log, with who did it",
       (await root.auditLog.count({ where: { orgId: org.id, action: "assistant.auto_reply_on", actorId: owner.id } })) === 1);
  }

  console.log("\n=== a new buyer writes ===");
  let buyer = "";
  let convoId = "";
  {
    buyer = phone();
    const m = write(buyer, "Hi, is the 2 bed in Dubai Marina still available?");
    await ingest(m.payload);
    const l = await threadOf(buyer);
    convoId = l.conversation!.id;
    const sent = texts();
    ok("the reply is sent, to the buyer, by itself", sent.length === 1 && sent[0]!.to === buyer.slice(1) && sent[0]!.body === REPLY,
       `${sent.length} sent`);
    const typing = graph.findIndex((g) => g.kind === "typing" && g.replyTo === m.id);
    ok("after marking their message read and showing typing…", typing !== -1 && typing < graph.findIndex((g) => g.kind === "text"));
    const out = await root.message.findFirst({ where: { conversationId: convoId, direction: "OUTBOUND" } });
    ok("recorded in the thread as the assistant's, sent", out?.author === "ASSISTANT" && out.status === "SENT" && out.body === REPLY);
    ok("no draft left waiting beside it", (await root.replyDraft.count({ where: { conversationId: convoId, state: "OPEN" } })) === 0);
    ok("billed as an answered conversation", (await root.conversationCharge.count({ where: { conversationId: convoId } })) === 1);
    const system = asked.at(-1) ?? "";
    ok("written to sound like a person texting", system.includes("the way a good agent texts") && system.includes("one at a time"));
    ok("without ever claiming to be one", system.includes("You never claim to be a person"));
    ok("in their language", system.includes("Reply in English"));

    // A buyer who wrote while it was off has a draft waiting. Their next
    // message is answered by itself — and yesterday's draft must not be
    // left one tap from being sent on top of it.
    const e0 = (await threadOf(early)).conversation!.id;
    await ingest(write(early, "Also, is parking included?").payload);
    ok("a buyer with an old draft waiting is answered, and the old draft is withdrawn",
       texts().at(-1)?.to === early.slice(1) &&
       (await root.replyDraft.count({ where: { conversationId: e0, state: "OPEN" } })) === 0);

    const ar = phone();
    await ingest(write(ar, "مرحبا، هل الشقة في دبي مارينا متاحة؟").payload);
    ok("an Arabic buyer is answered in Arabic", asked.at(-1)?.includes("Reply in Arabic") === true && texts().length === 3);
  }

  console.log("\n=== it stops where a person takes over ===");
  {
    const before = texts().length;
    await root.message.create({ data: { orgId: org.id, conversationId: convoId, direction: "OUTBOUND", author: "AGENT", authorId: agent.id, body: "Hi, Tom here — I'll take it from here.", status: "SENT" } });
    await ingest(write(buyer, "Great, thanks Tom. Can I see it Saturday?").payload);
    ok("once an agent has written in the thread, it drafts instead", texts().length === before &&
       (await root.replyDraft.count({ where: { conversationId: convoId, state: "OPEN" } })) === 1);

    const q = phone();
    await ingest(write(q, "Hello, looking for a villa").payload);
    const ql = await threadOf(q);
    await root.lead.update({ where: { id: ql.id }, data: { status: "QUALIFIED" } });
    const b2 = texts().length;
    await ingest(write(q, "Any update?").payload);
    ok("once they are qualified, it drafts instead", texts().length === b2 &&
       (await root.replyDraft.count({ where: { conversationId: ql.conversation!.id, state: "OPEN" } })) === 1);
  }

  console.log("\n=== every brake still works ===");
  {
    const m = phone();
    await ingest(write(m, "Hi there").payload);
    const ml = await threadOf(m);
    await root.conversation.update({ where: { id: ml.conversation!.id }, data: { assistantMuted: true } });
    const b = texts().length;
    await ingest(write(m, "Is it still available?").payload);
    ok("\"I've got this\" stops it", texts().length === b);

    const s = phone();
    await ingest(write(s, "Hello").payload);
    const b3 = texts().length;
    await ingest(write(s, "STOP").payload);
    ok("STOP gets no reply", texts().length === b3);

    await root.assistantSettings.update({ where: { orgId: org.id }, data: { enabled: false } });
    const k = phone();
    const b4 = texts().length;
    await ingest(write(k, "Hi, is the villa available?").payload);
    const kl = await threadOf(k);
    ok("\"Stop everything\" stops it — nothing sent, nothing drafted", texts().length === b4 &&
       (await root.replyDraft.count({ where: { conversationId: kl.conversation!.id } })) === 0);
    await root.assistantSettings.update({ where: { orgId: org.id }, data: { enabled: true } });
  }

  console.log("\n=== the owner turns it off ===");
  {
    await O.setAutoReply({ on: false });
    ok("off is on the audit log too",
       (await root.auditLog.count({ where: { orgId: org.id, action: "assistant.auto_reply_off", actorId: owner.id } })) === 1);
    const p = phone();
    const b = texts().length;
    await ingest(write(p, "Hi, 3 bed in Springs?").payload);
    const l = await threadOf(p);
    ok("and a new buyer is drafted for again", texts().length === b &&
       (await root.replyDraft.count({ where: { conversationId: l.conversation!.id, state: "OPEN" } })) === 1);
  }

  await cleanup();
  standIn.close();
  console.log(bad ? `\n${bad} failed\n` : "\nAll auto-reply checks passed\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); standIn.close(); fatal(e); });
