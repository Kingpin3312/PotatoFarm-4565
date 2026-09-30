import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { sweep as notifySweep } from "../src/server/lib/notify/sweep";
import { eraseSubject } from "../src/server/lib/privacy/erase";
import { conversationsRouter } from "../src/server/api/routers/conversations";
import { assistantRouter } from "../src/server/api/routers/assistant";
import { fatal } from "./fatal";

/**
 * The assistant writes the reply; a person sends it.
 *
 * The brokerage's owner chose drafts over automatic replies: every new
 * message from a buyer gets a reply written in seconds — through every
 * check the assistant makes — and **nothing reaches the buyer until an
 * agent presses send**. What becomes of each draft is recorded, because
 * that is the evidence for ever letting it send by itself.
 *
 * Run against stand-ins for WhatsApp and the model on loopback, so the
 * one thing this check most needs to prove — nothing was sent — is
 * measured at the only place a message could go.
 *
 *     npm run check:reply-drafts
 */
const root = crossTenant("sweep");
const SLUG = "reply-drafts-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `reply-drafts-check-${k}-${RUN}@example.com`;
const PNID = `pnid-drafts-check-${RUN}`;
const REF = `DRAFTCHECK${RUN.toUpperCase()}`;
const REPLY = "Thanks for getting in touch. Are you looking to buy or to rent?";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};

const sent: { to: string; body: string }[] = [];
let modelCalls = 0;
const standIn = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/messages") {
      // Replies only: the extractor runs afterwards, unawaited, and would
      // otherwise be counted against whatever the check does next.
      if (body.max_tokens === 300) modelCalls++;
      // The extractor asks too; it gets the same text and discards it.
      res.end(JSON.stringify({ content: [{ type: "text", text: REPLY }], usage: { input_tokens: 100, output_tokens: 20 } }));
      return;
    }
    if (req.url?.endsWith("/messages")) {
      sent.push({ to: body.to, body: body.text?.body ?? body.template?.name ?? "" });
      res.end(JSON.stringify({ messages: [{ id: `wamid.out.${RUN}.${sent.length}` }] }));
      return;
    }
    res.statusCode = 404; res.end("{}");
  });
});

let wamid = 0;
const message = (from: string, text: string, id = `wamid.in.${RUN}.${++wamid}`) => ({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: PNID },
    contacts: [{ profile: { name: "Somebody" } }],
    messages: [{ id, from: from.replace("+", ""), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
  } }] }],
});

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
    await root.vendor.deleteMany({ where });
    await root.qualificationProfile.deleteMany({ where });
    await root.assistantSettings.deleteMany({ where });
    await root.subscription.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "reply-drafts-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nThe assistant writes the reply; a person sends it\n");
  await new Promise<void>((r) => standIn.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  process.env.WHATSAPP_GRAPH_BASE = base;
  process.env.ASSISTANT_API_BASE = base;
  process.env.ANTHROPIC_API_KEY ||= "check-only-not-a-key";
  process.env[`SECRET_${REF}`] = "check-only-whatsapp-token";
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Reply Drafts Check", slug: `${SLUG}a` } });
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

  const digits = RUN.replace(/\D/g, "").padEnd(7, "3").slice(-7);
  let n = 0;
  const buyer = async (name: string, o: Record<string, unknown> = {}) => {
    const phone = `+9715${n++}${digits}`;
    await root.lead.create({ data: { orgId: org.id, phone, name, assignedToId: agent.id, ...o } });
    return phone;
  };
  const threadOf = async (phone: string) =>
    (await root.lead.findFirstOrThrow({ where: { orgId: org.id, phone }, include: { conversation: true } })).conversation!;
  const draftsOf = (conversationId: string) => root.replyDraft.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });

  const as = (userId: string, role: "AGENT" | "MANAGER") => {
    const ctx = { session: { user: { id: userId } }, membership: { orgId: org.id, orgName: org.name, role }, ip: "127.0.0.1", userAgent: "reply-drafts-check" } as never;
    return { C: conversationsRouter.createCaller(ctx), A: assistantRouter.createCaller(ctx) };
  };
  const A = as(agent.id, "AGENT"), Col = as(colleague.id, "AGENT"), M = as(manager.id, "MANAGER");

  console.log("=== a buyer writes in ===");
  const priya = await buyer("Priya Nair");
  const first = message(priya, "Hi, is the Marina Gate flat still available?");
  await ingest(first);
  const convo = await threadOf(priya);
  {
    const d = await draftsOf(convo.id);
    ok("a reply is written the moment they write", d.length === 1 && d[0]!.state === "OPEN" && d[0]!.body === REPLY);
    ok("and nothing reaches the buyer", sent.length === 0, `${sent.length} sent`);
    const told = await root.notification.findFirst({ where: { orgId: org.id, kind: "REPLY_READY", subjectId: d[0]!.id } });
    ok("their agent is told at once, not on the next sweep", told?.userId === agent.id, told ? "" : "nobody told");
    const row = (await A.C.list({ filter: "all" })).rows.find((r) => r.id === convo.id);
    ok("the inbox marks the thread \"reply ready\"", row?.replyReady === true);
    const t = await A.C.thread({ conversationId: convo.id });
    ok("and the thread shows the draft", t.draft?.body === REPLY);

    const calls = modelCalls;
    await ingest(first);
    ok("the same message delivered twice drafts nothing more", (await draftsOf(convo.id)).length === 1 && modelCalls === calls);
    await ingest(message(priya, "Also, is there parking?"));
    const two = await draftsOf(convo.id);
    ok("a second message overtakes the first draft", two.length === 2 && two[0]!.state === "STALE" && two[1]!.state === "OPEN");
  }

  console.log("\n=== the agent decides ===");
  {
    const open = (await draftsOf(convo.id)).at(-1)!;
    const e1 = await refused(() => Col.C.discardDraft({ draftId: open.id }));
    ok("a colleague cannot discard it", e1?.code === "NOT_FOUND", e1?.code ?? "allowed");
    const e2 = await refused(() => Col.C.send({ conversationId: convo.id, body: open.body, draftId: open.id }));
    ok("or send it", e2?.code === "NOT_FOUND", e2?.code ?? "allowed");
    ok("and neither attempt reached the buyer", sent.length === 0);

    await A.C.send({ conversationId: convo.id, body: open.body, draftId: open.id });
    const after = await root.replyDraft.findUniqueOrThrow({ where: { id: open.id } });
    ok("pressing send sends it, to the buyer's number", sent.length === 1 && sent[0]!.to === priya.slice(1) && sent[0]!.body === REPLY);
    ok("recorded as sent as written, with the message it became", after.state === "SENT" && !!after.messageId && after.resolvedById === agent.id);
    ok("and the brokerage is billed for an answered conversation",
       (await root.conversationCharge.count({ where: { conversationId: convo.id } })) === 1);

    await ingest(message(priya, "And the service charge?"));
    const d2 = (await draftsOf(convo.id)).at(-1)!;
    await A.C.send({ conversationId: convo.id, body: `${d2.body} I'll check the service charge for you.`, draftId: d2.id });
    ok("changed before sending: recorded as edited", (await root.replyDraft.findUniqueOrThrow({ where: { id: d2.id } })).state === "EDITED");

    await ingest(message(priya, "Can you send photos?"));
    const d3 = (await draftsOf(convo.id)).at(-1)!;
    const before = sent.length;
    await A.C.discardDraft({ draftId: d3.id });
    ok("thrown away: recorded as discarded, and nothing sent",
       (await root.replyDraft.findUniqueOrThrow({ where: { id: d3.id } })).state === "DISCARDED" && sent.length === before);

    await ingest(message(priya, "What floor is it on?"));
    const d4 = (await draftsOf(convo.id)).at(-1)!;
    await A.C.send({ conversationId: convo.id, body: "It's on the 32nd floor, facing the marina." });
    ok("the agent replying in their own words overtakes the draft", (await root.replyDraft.findUniqueOrThrow({ where: { id: d4.id } })).state === "STALE");
  }

  console.log("\n=== when it stays quiet ===");
  // Only what this one message caused: drafts written since, and replies
  // asked of the model since.
  const quiet = async (label: string, phone: string, text: string) => {
    const before = await root.replyDraft.count({ where: { orgId: org.id } });
    const calls = modelCalls;
    await ingest(message(phone, text));
    const made = (await root.replyDraft.count({ where: { orgId: org.id } })) - before;
    ok(label, made === 0 && modelCalls === calls, `${made} drafts, ${modelCalls - calls} replies asked for`);
  };
  {
    const omar = await buyer("Omar Saleh");
    await ingest(message(omar, "Hello, I saw the townhouse listing"));
    await quiet("\"stop\" gets no reply", omar, "STOP");
    const oc0 = await threadOf(omar);
    ok("and the reply drafted before it can no longer be sent to them",
       (await root.replyDraft.count({ where: { conversationId: oc0.id, state: "OPEN" } })) === 0);

    const rania = await buyer("Rania Haddad");
    await ingest(message(rania, "Hi there"));
    const rc = await threadOf(rania);
    await A.C.mute({ conversationId: rc.id, muted: true });
    await root.replyDraft.updateMany({ where: { conversationId: rc.id }, data: { state: "STALE" } });
    const calls = modelCalls;
    await ingest(message(rania, "Is the villa still available?"));
    ok("an agent's \"I've got this\" is honoured — the mute was imported and never read",
       (await root.replyDraft.count({ where: { conversationId: rc.id, state: "OPEN" } })) === 0 && modelCalls === calls);

    const sam = await buyer("Sam Carter");
    await ingest(message(sam, "Can I speak to a real person please?"));
    const sc = await threadOf(sam);
    ok("asking for a person hands over, with no draft",
       (await draftsOf(sc.id)).length === 0 && (await root.conversation.findUniqueOrThrow({ where: { id: sc.id } })).humanHandover);

    const won = await buyer("Grace Bought", { status: "WON" });
    await quiet("somebody whose file is closed is their agent's to answer", won, "Thanks again for everything!");

    // A number no test buyer has: buyers are +9715<n><digits>.
    const owner = await root.vendor.create({ data: { orgId: org.id, name: "Hana Suleiman", phone: `+97158${digits}` } });
    const calls2 = modelCalls;
    await ingest(message(owner.phone!, "Any news on my flat?"));
    const oc = await root.conversation.findUniqueOrThrow({ where: { vendorId: owner.id } });
    ok("an owner gets no draft", (await draftsOf(oc.id)).length === 0 && modelCalls === calls2);

    await root.assistantSettings.update({ where: { orgId: org.id }, data: { enabled: false } });
    const off = await buyer("Leo Martin");
    await quiet("with the assistant switched off, nothing is written or paid for", off, "Hi, is the flat available?");
    await root.assistantSettings.update({ where: { orgId: org.id }, data: { enabled: true } });
    ok("and through all of it, nothing reached anybody unasked", sent.length === 3, `${sent.length} sent — the three an agent pressed`);
  }

  console.log("\n=== nobody acts on it ===");
  {
    const lina = await buyer("Lina Farah");
    await ingest(message(lina, "Hello, is the 2-bed available?"));
    const lc = await threadOf(lina);
    const d = (await draftsOf(lc.id))[0]!;
    await root.replyDraft.update({ where: { id: d.id }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
    await notifySweep();
    ok("a manager hears at fifteen minutes", !!(await root.notification.findFirst({
      where: { orgId: org.id, kind: "REPLY_READY", subjectId: d.id, userId: manager.id },
    })));
  }

  console.log("\n=== the owner's number ===");
  {
    const s = await M.A.draftStats();
    ok("the brokerage can see what became of the drafts",
       s.asWritten === 1 && s.edited === 1 && s.discarded === 1 && s.overtaken >= 2 && s.sentAsWrittenPct === 33,
       JSON.stringify(s));
  }

  console.log("\n=== the buyer's rights ===");
  {
    await eraseSubject({ orgId: org.id, phone: priya, requestedBy: manager.id, reason: "check" });
    const d = await draftsOf(convo.id);
    ok("erasure removes what was drafted to them", d.length > 0 && d.every((x) => x.body === "[erased at the person's request]"));
  }

  await new Promise((r) => setTimeout(r, 500));
  await cleanup();
  standIn.close();
  console.log(bad ? `\n${bad} FAILED\n` : "\nthe assistant writes; a person sends.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
