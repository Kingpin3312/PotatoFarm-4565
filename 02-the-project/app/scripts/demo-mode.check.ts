import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { conversationsRouter } from "../src/server/api/routers/conversations";
import { demoRouter } from "../src/server/api/routers/demo";
import { orgRouter } from "../src/server/api/routers/org";
import { fatal } from "./fatal";

/**
 * A demonstration brokerage: shown to prospects, never talks to anyone.
 *
 * Found preparing the first client demo: the most important button in
 * the product — "Send as written" on a drafted reply — ended in "No
 * stored credential for this channel", because a demo has no WhatsApp
 * number. And an inbox with nothing arriving is a screenshot.
 *
 * So a brokerage with `demo` set records its sends and delivers none of
 * them, and can put a realistic buyer's message through the real intake.
 * What this proves is the boundary: that nothing from a demo reaches
 * Meta, and that nothing about it leaks into a real brokerage — which
 * still sends for real, and cannot invent a buyer.
 *
 * Run against stand-ins for WhatsApp and the model on loopback, so
 * "nothing was sent" is measured where a message would have gone.
 *
 *     npm run check:demo-mode
 */
const root = crossTenant("sweep");
const SLUG = "demo-mode-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `demo-mode-check-${k}-${RUN}@example.com`;
const REPLY = "Thanks for getting in touch. Are you looking to buy or to rent?";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};

const sent: string[] = [];
const standIn = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/messages") {
      res.end(JSON.stringify({ content: [{ type: "text", text: REPLY }], usage: { input_tokens: 100, output_tokens: 20 } }));
      return;
    }
    if (req.url?.endsWith("/messages")) {
      sent.push(`${req.url} ${body.to}`);
      res.end(JSON.stringify({ messages: [{ id: `wamid.out.${RUN}.${sent.length}` }] }));
      return;
    }
    res.statusCode = 404; res.end("{}");
  });
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
    await root.enquiry.deleteMany({ where });
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
  await root.user.deleteMany({ where: { email: { startsWith: "demo-mode-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nA demonstration brokerage: shown to prospects, never talks to anyone\n");
  await new Promise<void>((r) => standIn.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  process.env.WHATSAPP_GRAPH_BASE = base;
  process.env.ASSISTANT_API_BASE = base;
  process.env.ANTHROPIC_API_KEY ||= "check-only-not-a-key";
  await cleanup();

  const digits = RUN.replace(/\D/g, "").padEnd(6, "4").slice(-6);
  const brokerage = async (k: string, demo: boolean) => {
    const org = await root.organisation.create({ data: { name: `Demo Mode Check ${k}`, slug: `${SLUG}${k}`, demo } });
    const owner = await root.user.create({ data: { email: EMAIL(k), name: `Owner ${k}` } });
    await root.membership.create({ data: { orgId: org.id, userId: owner.id, role: "OWNER" } });
    const ref = `DEMOCHECK${k.toUpperCase()}${RUN.toUpperCase()}`;
    // The real brokerage has a token; the demo one has none, as a demo
    // on the day will not.
    if (!demo) process.env[`SECRET_${ref}`] = "check-only-whatsapp-token";
    await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: `pnid-demo-check-${k}-${RUN}`, secretRef: ref } });
    await root.pipelineStage.create({ data: { orgId: org.id, name: "New", position: 0, maps: "NEW" } });
    await root.assistantSettings.create({ data: { orgId: org.id, enabled: true } });
    await root.qualificationProfile.create({ data: { orgId: org.id, name: "Default", active: true } });
    await root.subscription.create({
      data: { orgId: org.id, plan: "check", seatPriceFils: 9900n, currentFrom: new Date(Date.now() - 86_400_000), currentTo: new Date(Date.now() + 29 * 86_400_000) },
    });
    const ctx = { session: { user: { id: owner.id } }, membership: { orgId: org.id, orgName: org.name, role: "OWNER" }, ip: "127.0.0.1", userAgent: "demo-mode-check" } as never;
    return { org, C: conversationsRouter.createCaller(ctx), D: demoRouter.createCaller(ctx), O: orgRouter.createCaller(ctx) };
  };
  const demo = await brokerage("demo", true);
  const real = await brokerage("real", false);

  console.log("=== a live enquiry, in the demo brokerage ===");
  let convoId = "";
  {
    const r = await demo.D.enquiry({});
    convoId = r.conversationId;
    const convo = await root.conversation.findUniqueOrThrow({ where: { id: r.conversationId }, include: { lead: true, messages: true } });
    ok("it arrives as a conversation in the demo brokerage", convo.orgId === demo.org.id && convo.messages.length === 1 && convo.messages[0]!.direction === "INBOUND");
    ok("from a new buyer, who becomes a lead on the board", !!convo.lead && !!convo.lead.stageId && convo.lead.deletedAt === null);
    ok("with a name and a message, not placeholders", !!convo.lead?.name && (convo.messages[0]!.body?.length ?? 0) > 20);
    ok("through the real intake: a reply is drafted", r.drafted === true && r.why === null,
       r.why ?? "");
    const again = await demo.D.enquiry({});
    ok("pressed again, it is another buyer, not a second message", again.conversationId !== r.conversationId);

    const own = await demo.D.enquiry({ name: "Aisha Rahman", body: "مرحبا، هل الشقة في دبي مارينا متاحة؟" });
    const t = await root.conversation.findUniqueOrThrow({ where: { id: own.conversationId }, include: { lead: true, messages: true } });
    ok("a presenter can type their own, in Arabic", t.lead?.name === "Aisha Rahman" && t.messages[0]!.body === "مرحبا، هل الشقة في دبي مارينا متاحة؟");
    const e = await refused(() => demo.D.enquiry({ body: "   " }));
    ok("an empty message is refused", e?.code === "BAD_REQUEST", e?.code ?? "allowed");
  }

  console.log("\n=== the demo brokerage sends nothing ===");
  {
    const t = await demo.C.thread({ conversationId: convoId });
    ok("the drafted reply is waiting in the thread", t.draft?.body === REPLY);
    const e = await refused(() => demo.C.send({ conversationId: convoId, body: t.draft!.body, draftId: t.draft!.id }));
    ok("\"send as written\" works with no WhatsApp token", e === null, e?.message ?? "");
    const out = await root.message.findFirst({ where: { conversationId: convoId, direction: "OUTBOUND" } });
    ok("recorded as sent, in the thread", out?.status === "SENT" && out.body === REPLY);
    ok("with an id that says it was a demonstration", out?.externalId?.startsWith("demo.") === true, out?.externalId ?? "none");
    ok("and nothing reached WhatsApp", sent.length === 0, sent.join(", "));
    ok("the draft is recorded as sent as written", (await root.replyDraft.findUniqueOrThrow({ where: { id: t.draft!.id } })).state === "SENT");
    const mine = (await demo.O.mine()).find((o) => o.active);
    ok("the app is told it is a demonstration (the banner)", mine?.demo === true);
  }

  console.log("\n=== a real brokerage is untouched ===");
  {
    const e = await refused(() => real.D.enquiry({}));
    ok("cannot make a live enquiry", e?.code === "FORBIDDEN", e?.code ?? "allowed");
    ok("and none was recorded", (await root.conversation.count({ where: { orgId: real.org.id } })) === 0);
    const mine = (await real.O.mine()).find((o) => o.active);
    ok("shows no demonstration banner", mine?.demo === false);

    const phone = `+9715${digits}1`;
    await root.lead.create({ data: { orgId: real.org.id, phone, name: "Real Buyer" } });
    await ingest({ entry: [{ changes: [{ value: {
      metadata: { phone_number_id: `pnid-demo-check-real-${RUN}` },
      contacts: [{ profile: { name: "Real Buyer" } }],
      messages: [{ id: `wamid.in.real.${RUN}`, from: phone.slice(1), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hi, is the flat still available?" } }],
    } }] }] });
    const convo = await root.conversation.findFirstOrThrow({ where: { orgId: real.org.id } });
    const t = await real.C.thread({ conversationId: convo.id });
    await real.C.send({ conversationId: convo.id, body: t.draft?.body ?? REPLY, draftId: t.draft?.id });
    ok("still sends for real, to Meta", sent.length === 1 && sent[0]!.includes(phone.slice(1)), sent.join(", ") || "nothing sent");
    const out = await root.message.findFirst({ where: { conversationId: convo.id, direction: "OUTBOUND" } });
    ok("with Meta's id, not a demonstration one", out?.externalId === `wamid.out.${RUN}.1`, out?.externalId ?? "none");
  }

  await cleanup();
  standIn.close();
  console.log(bad ? `\n${bad} failed\n` : "\nAll demo-mode checks passed\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); standIn.close(); fatal(e); });
