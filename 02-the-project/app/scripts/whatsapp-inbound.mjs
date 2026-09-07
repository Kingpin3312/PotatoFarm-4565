import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * A signed WhatsApp webhook, end to end, against the real application.
 *
 * This is the assertion the whole channel feature rests on. Connecting
 * a number is only worth anything if an inbound message then reaches
 * the brokerage — and the failure mode is silent by construction:
 * `lib/ingest.ts` finds the tenant by matching the webhook's phone
 * number id against `Channel.identifier`, and with no match it logs
 * "a message for an unknown number" and returns 200. Meta sees success.
 * Nobody sees the message.
 *
 * So this posts a properly signed payload and asserts a lead, a
 * conversation and a message exist afterwards — and then posts one for
 * a number nobody has connected and asserts nothing is created, because
 * a route that accepts anything is not routing.
 *
 *     npm run dev
 *     npm run check:whatsapp-inbound
 */
const APP = process.env.APP_URL ?? process.env.APP ?? "http://localhost:3000";
const SECRET = process.env.WHATSAPP_APP_SECRET;
if (!SECRET) {
  console.error("WHATSAPP_APP_SECRET is not set — the webhook would reject everything.");
  process.exit(1);
}

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } });
const NUMBER_ID = `INBOUND-TEST-${Date.now()}`;
/**
 * Two forms of the same number, deliberately.
 *
 * Meta sends `971…` with no plus; `ingest.ts` stores `+${msg.from}`.
 * Asserting against the form we sent finds nothing and reads exactly
 * like the message never arriving — which cost a wrong diagnosis before
 * the query log showed the row being inserted with a plus on the front.
 */
const FROM = `9715${Math.floor(Math.random() * 90000000 + 10000000)}`;
const STORED = `+${FROM}`;

function payload(phoneNumberId, from, text) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "wba-1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: phoneNumberId, display_phone_number: "+971500000000" },
          contacts: [{ profile: { name: "Inbound Test" }, wa_id: from }],
          messages: [{
            from, id: `wamid.${crypto.randomUUID()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text", text: { body: text },
          }],
        },
      }],
    }],
  });
}

async function post(body) {
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  const r = await fetch(`${APP}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  });
  return r.status;
}

const leadsFor = (from) => db.lead.count({ where: { phone: from } });

console.log("\n=== an unsigned payload is refused ===");
{
  const r = await fetch(`${APP}/api/webhooks/whatsapp`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: payload(NUMBER_ID, FROM, "hello"),
  });
  ok("no signature, no entry", r.status === 401, `HTTP ${r.status}`);
}

console.log("\n=== a message for a number nobody connected creates nothing ===");
{
  const before = await leadsFor(STORED);
  const status = await post(payload(NUMBER_ID, FROM, "hello"));
  await new Promise((r) => setTimeout(r, 2500));
  const after = await leadsFor(STORED);
  // 200 is correct here: Meta retries anything else, and a retry storm
  // over an unknown number helps nobody. Silence is the right answer to
  // Meta and the wrong answer to the brokerage — which is the point.
  ok("Meta is told it succeeded", status === 200, `HTTP ${status}`);
  ok("and no lead is invented", after === before, `${before} -> ${after}`);
}

console.log("\n=== once the number is connected, the message lands ===");
await db.channel.create({
  data: { orgId: org.id, type: "WHATSAPP", label: "Inbound test", identifier: NUMBER_ID, active: true },
});
{
  const status = await post(payload(NUMBER_ID, FROM, "Is the Marina Gate 2-bed still available?"));
  ok("accepted", status === 200, `HTTP ${status}`);

  // The route answers before it works, deliberately — Meta retries on
  // anything slow. So poll rather than assert immediately.
  let lead = null;
  for (let i = 0; i < 20 && !lead; i++) {
    await new Promise((r) => setTimeout(r, 500));
    lead = await db.lead.findFirst({
      where: { orgId: org.id, phone: STORED },
      select: { id: true, name: true, stageId: true, status: true },
    });
  }
  ok("a lead exists for the sender", !!lead, lead ? `${lead.name} (${lead.status})` : "none");

  if (lead) {
    ok("and it is on the pipeline board, not stranded", !!lead.stageId,
       lead.stageId ? "has a stage" : "stageId is null — invisible on the board");

    const convo = await db.conversation.findFirst({
      where: { orgId: org.id, leadId: lead.id },
      select: { id: true, unreadCount: true, lastInboundAt: true },
    });
    ok("a conversation was opened", !!convo, convo ? `unread ${convo.unreadCount}` : "none");
    ok("the 24-hour window has something to measure from", !!convo?.lastInboundAt,
       convo?.lastInboundAt?.toISOString() ?? "null");

    const msg = convo && await db.message.findFirst({
      where: { conversationId: convo.id },
      select: { body: true, direction: true },
    });
    ok("the message body was stored", !!msg?.body?.includes("Marina Gate"),
       JSON.stringify(msg?.body?.slice(0, 50) ?? null));
  }
}

console.log("\n=== a returning enquirer is the same person, not a new lead ===");
/**
 * The branch the bug was actually in.
 *
 * `upsert`'s update clause was `{ name: { set: undefined } }`, meaning
 * "do not overwrite a name an agent has corrected". Prisma rejects that
 * shape, and it rejects the whole call rather than the branch — so this
 * second message is the case the original author was thinking about,
 * and the one that proves an empty update expresses it.
 */
{
  const l0 = await db.lead.findFirst({ where: { orgId: org.id, phone: STORED }, select: { id: true } });
  if (l0) await db.lead.update({ where: { id: l0.id }, data: { name: "Corrected By Agent" } });
  const before = await db.lead.count({ where: { orgId: org.id, phone: STORED } });

  const status = await post(payload(NUMBER_ID, FROM, "Still interested — can I see it Saturday?"));
  ok("accepted", status === 200, `HTTP ${status}`);

  let msgs = 0;
  for (let i = 0; i < 20 && msgs < 2; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const l = await db.lead.findFirst({ where: { orgId: org.id, phone: STORED }, select: { id: true } });
    const c = l && await db.conversation.findFirst({ where: { leadId: l.id }, select: { id: true } });
    msgs = c ? await db.message.count({ where: { conversationId: c.id } }) : 0;
  }
  ok("the second message was stored", msgs === 2, `${msgs} message(s)`);

  const after = await db.lead.count({ where: { orgId: org.id, phone: STORED } });
  ok("no duplicate lead was created", after === before, `${before} -> ${after}`);

  const named = await db.lead.findFirst({ where: { orgId: org.id, phone: STORED }, select: { name: true } });
  ok("the agent's correction to the name survived", named?.name === "Corrected By Agent",
     JSON.stringify(named?.name ?? null));

  const convo = await db.conversation.findFirst({
    where: { orgId: org.id, lead: { phone: STORED } }, select: { unreadCount: true },
  });
  ok("and the unread count moved", (convo?.unreadCount ?? 0) >= 2, `unread ${convo?.unreadCount}`);
}

/**
 * Leave nothing behind, in dependency order.
 *
 * Conversations reference the channel, so the channel cannot go first —
 * the first version deleted by lead and then tried the channel, and
 * Postgres refused with `Conversation_channelId_fkey`. Cleaning up by
 * channel rather than by lead covers anything the ingest created that
 * this script does not know the shape of.
 */
const chans = await db.channel.findMany({ where: { identifier: NUMBER_ID }, select: { id: true } });
for (const ch of chans) {
  const convos = await db.conversation.findMany({ where: { channelId: ch.id }, select: { id: true, leadId: true } });
  for (const c of convos) {
    await db.message.deleteMany({ where: { conversationId: c.id } });
  }
  await db.conversation.deleteMany({ where: { channelId: ch.id } });
  await db.enquiry.deleteMany({ where: { channelId: ch.id } });
  await db.channel.delete({ where: { id: ch.id } });
}
await db.lead.deleteMany({ where: { phone: STORED } });

await db.$disconnect();
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
