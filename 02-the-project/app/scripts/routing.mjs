import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * A lead arriving, and somebody getting it.
 *
 * `route()` was called only by the settings preview, and neither ingest
 * path set `assignedToId` — so every lead landed unowned while a screen
 * demonstrated the rotation. This drives the real inbound path: a
 * signed WhatsApp webhook, the way Meta sends one.
 *
 * The assertions that matter:
 *
 *   - a new lead is assigned to somebody, with a `LeadOwnership` row, so
 *     "why did that lead not come to me" is answerable;
 *   - round robin actually rotates rather than giving every lead to the
 *     same agent;
 *   - a returning enquirer is NOT reassigned, because taking a lead off
 *     the agent working it is worse than not routing at all.
 *
 *     npm run dev
 *     npm run check:routing
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.WHATSAPP_APP_SECRET;
if (!SECRET) { console.error("WHATSAPP_APP_SECRET is not set."); process.exit(1); }

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});
const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
const NUMBER_ID = `ROUTE-TEST-${Date.now()}`;
const made = [];

function payload(from, text) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "wba-1", changes: [{ field: "messages", value: {
      metadata: { phone_number_id: NUMBER_ID, display_phone_number: "+971500000000" },
      contacts: [{ profile: { name: "Routed Buyer" }, wa_id: from }],
      messages: [{ from, id: `wamid.${crypto.randomUUID()}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text", text: { body: text } }],
    } }] }],
  });
}
async function send(from, text) {
  const body = payload(from, text);
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  const r = await fetch(`${APP}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  });
  return r.status;
}
async function leadFor(stored) {
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const l = await db.lead.findFirst({
      where: { orgId: org.id, phone: stored },
      select: { id: true, assignedToId: true, assignedTo: { select: { name: true } } },
    });
    if (l) return l;
  }
  return null;
}

// A channel to route through, and agents to route to.
await db.channel.create({
  data: { orgId: org.id, type: "WHATSAPP", label: "Routing test", identifier: NUMBER_ID, active: true },
});
/**
 * A second agent, created by the check that needs one.
 *
 * Rotation cannot be demonstrated against a pool of one, and this
 * brokerage has a single AGENT. A check that quietly lowers its bar to
 * whatever the data allows is a check that stops testing the thing —
 * so it builds the condition instead, and removes it afterwards.
 */
const extra = await db.user.create({
  data: { email: `routing-check-${Date.now()}@example.invalid`, name: "Rotation Check" },
  select: { id: true },
});
await db.membership.create({ data: { orgId: org.id, userId: extra.id, role: "AGENT" } });

const agents = await db.membership.findMany({
  where: { orgId: org.id, role: "AGENT" },
  select: { userId: true, user: { select: { name: true } } },
});
console.log(`\n${agents.length} agent(s) in the pool (one created for this run)`);

console.log("\n=== a new lead is given to somebody ===");
const first = `9715${Math.floor(Math.random() * 90000000 + 10000000)}`;
{
  ok("the webhook was accepted", (await send(first, "Is the Marina flat available?")) === 200);
  const lead = await leadFor(`+${first}`);
  made.push(`+${first}`);
  ok("a lead exists", !!lead);
  /**
   * The assertion this whole file is for. It was `null` for every lead
   * from every channel, forever.
   */
  ok("and it has an owner", !!lead?.assignedToId, lead?.assignedTo?.name ?? "nobody");

  const own = lead && await db.leadOwnership.findFirst({
    where: { leadId: lead.id }, select: { reason: true, note: true },
  });
  ok("an ownership record was written", !!own, own?.reason);
  ok("recording why, in words an agent can read", /rule "/.test(own?.note ?? ""),
     JSON.stringify((own?.note ?? "").slice(0, 60)));
}

console.log("\n=== round robin rotates ===");
{
  const owners = [];
  const firstLead = await db.lead.findFirst({ where: { orgId: org.id, phone: `+${first}` },
    select: { assignedToId: true } });
  owners.push(firstLead?.assignedToId);

  for (let i = 0; i < 2; i++) {
    const p = `9715${Math.floor(Math.random() * 90000000 + 10000000)}`;
    await send(p, "Another enquiry");
    const l = await leadFor(`+${p}`);
    made.push(`+${p}`);
    owners.push(l?.assignedToId ?? null);
  }
  ok("three leads did not all go to one agent", new Set(owners).size > 1,
     `${new Set(owners).size} distinct owner(s) across 3 leads`);
  ok("every one of them has an owner", owners.every(Boolean),
     owners.map((o) => (o ? "assigned" : "POOL")).join(", "));
}

console.log("\n=== a returning enquirer keeps their agent ===");
{
  const before = await db.lead.findFirst({ where: { orgId: org.id, phone: `+${first}` },
    select: { id: true, assignedToId: true } });
  // Point their owner at somebody else, then have them message again.
  const other = agents.find((a) => a.userId !== before.assignedToId);
  await db.lead.update({ where: { id: before.id }, data: { assignedToId: other.userId } });

  /**
   * The owner is made ineligible, and that is what makes this
   * assertion mean anything.
   *
   * Without it the check could not tell "was not reassigned" from
   * "was reassigned and round robin happened to pick the same agent" —
   * a coin flip with two agents, and it passed against a deliberately
   * broken build twice before I noticed. With the current owner
   * refusing leads, any routing that runs *must* move the lead to
   * somebody else, so the value changing is proof and the value
   * staying is proof.
   */
  await db.agentAvailability.upsert({
    where: { orgId_userId: { orgId: org.id, userId: other.userId } },
    create: { orgId: org.id, userId: other.userId, acceptingLeads: false },
    update: { acceptingLeads: false },
  });

  await send(first, "Still interested, can I see it Saturday?");
  await new Promise((r) => setTimeout(r, 3500));
  const after = await db.lead.findUnique({ where: { id: before.id }, select: { assignedToId: true } });
  /**
   * Reassigning on a new message would take a lead off the agent who has
   * been working it — worse than not routing at all, and invisible until
   * two agents are arguing about who owns the client.
   */
  ok("a second message does not move the lead", after?.assignedToId === other.userId,
     after?.assignedToId === other.userId ? "kept" : "REASSIGNED");
}

// Clean up.
for (const phone of made) {
  const l = await db.lead.findFirst({ where: { orgId: org.id, phone }, select: { id: true } });
  if (!l) continue;
  const c = await db.conversation.findFirst({ where: { leadId: l.id }, select: { id: true } });
  if (c) { await db.message.deleteMany({ where: { conversationId: c.id } }); }
  await db.conversation.deleteMany({ where: { leadId: l.id } });
  await db.leadOwnership.deleteMany({ where: { leadId: l.id } });
  await db.enquiry.deleteMany({ where: { leadId: l.id } });
  await db.lead.delete({ where: { id: l.id } });
}
await db.channel.deleteMany({ where: { identifier: NUMBER_ID } });
await db.agentAvailability.deleteMany({ where: { orgId: org.id } });
await db.leadOwnership.deleteMany({ where: { userId: extra.id } });
await db.membership.deleteMany({ where: { userId: extra.id } });
await db.user.delete({ where: { id: extra.id } });
await db.$disconnect();
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
