/**
 * A buyer who came from a portal, by WhatsApp.
 *
 * Most Bayut, Dubizzle and Property Finder buyers never fill in the
 * portal's form — they press its WhatsApp button and write to the agent.
 * Every one of them was filed as a WhatsApp lead with no property: the
 * report of where leads come from credited WhatsApp with what the portal
 * was paid for, a routing rule for Bayut leads never matched them, and
 * the agent opened the thread not knowing which flat it was about.
 *
 * This drives the real WhatsApp ingest with Meta-shaped payloads and
 * asserts: the portal named in the first message is the lead's source
 * and routes by it; the reference quoted attaches this brokerage's
 * property as an enquiry credited "Bayut, via WhatsApp"; a reference
 * the brokerage does not have attaches nothing; an ordinary message
 * stays a WhatsApp lead with no enquiry; a returning buyer is not
 * re-filed, gets one enquiry per new property and none for asking again;
 * and a redelivered message adds nothing.
 *
 *     npm run check:portal-leads
 */
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "portal-leads-check-";
const RUN = Date.now().toString(36);
const PNID = `pnid-portal-leads-${RUN}`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`);
  if (!p) bad++;
};

let wamid = 0;
const ids: string[] = [];
const send = async (from: string, text: string, again?: string) => {
  const id = again ?? `wamid.portal.${RUN}.${++wamid}`;
  ids.push(id);
  await ingest({
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: PNID },
      contacts: [{ profile: { name: "Buyer" } }],
      messages: [{ id, from: from.replace("+", ""), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  });
  return id;
};

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const orgIds = orgs.map((o) => o.id);
  if (orgIds.length) {
    const where = { orgId: { in: orgIds } };
    await root.notification.deleteMany({ where });
    await root.followUp.deleteMany({ where });
    await root.aiAction.deleteMany({ where }).catch(() => {});
    await root.enquiry.deleteMany({ where });
    await root.message.deleteMany({ where });
    await root.conversation.deleteMany({ where });
    await root.leadOwnership.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.listing.deleteMany({ where });
    await root.assignmentRule.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.pipelineStage.deleteMany({ where }).catch(() => {});
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: orgIds } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: SLUG } } }).catch(() => {});
}

async function main() {
  console.log("\nA buyer who came from a portal, by WhatsApp\n");
  // The assistant's reply runs after each message; nothing here is about
  // it, so it is pointed at a loopback port with nothing listening and
  // its failure is logged and ignored, as in production.
  process.env.ASSISTANT_API_BASE = "http://127.0.0.1:9";
  process.env.ANTHROPIC_API_KEY ||= "check-only-not-a-key";
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Portal Leads Realty", slug: `${SLUG}${RUN}` } });
  const [rentals, sales] = await Promise.all(["rentals", "sales"].map((k) =>
    root.user.create({ data: { email: `${SLUG}${k}-${RUN}@example.com`, name: k } })));
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: rentals!.id, role: "AGENT" },
    { orgId: org.id, userId: sales!.id, role: "AGENT" },
  ] });
  await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: PNID } });
  // Bayut leads to the rentals agent; everything else to sales.
  await root.assignmentRule.createMany({ data: [
    { orgId: org.id, name: "Bayut to rentals", priority: 1, sources: ["BAYUT"], strategy: "SPECIFIC", userIds: [rentals!.id] },
    { orgId: org.id, name: "Everyone else", priority: 100, strategy: "SPECIFIC", userIds: [sales!.id] },
  ] });
  const base = {
    orgId: org.id, title: "Two bed in Marina Gate", community: "Dubai Marina", bedrooms: 2,
    priceFils: 250_000_000n, purpose: "SALE" as const, status: "AVAILABLE" as const,
  };
  const marina = await root.listing.create({ data: { ...base, reference: "MG-202" } });
  const hills = await root.listing.create({ data: { ...base, reference: "DH-509", title: "Villa in Dubai Hills" } });

  const digits = RUN.replace(/\D/g, "").padEnd(6, "7").slice(-6);
  const phone = (n: number) => `+9715${n}${digits}`;
  const leadOf = (p: string) => root.lead.findUniqueOrThrow({ where: { orgId_phone: { orgId: org.id, phone: p } } });
  const enquiriesOf = (leadId: string) => root.enquiry.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });

  console.log("=== the portal's WhatsApp button ===");
  const a = phone(1);
  await send(a, "Hi, I saw your property on Bayut. Ref: MG-202. Is it still available?");
  const la = await leadOf(a);
  ok("a buyer who names Bayut is a Bayut lead", la.source === "BAYUT", String(la.source));
  ok("and goes where the brokerage sends Bayut leads", la.assignedToId === rentals!.id);
  const ea = await enquiriesOf(la.id);
  ok("the property they quoted is attached as an enquiry",
     ea.length === 1 && ea[0]!.listingId === marina.id, JSON.stringify(ea.map((e) => e.listingId)));
  ok("credited to Bayut, saying how it came", ea[0]?.campaign === "Bayut, via WhatsApp", String(ea[0]?.campaign));

  const b = phone(2);
  await send(b, "Hello, found this on dubizzle, reference dh 509");
  const lb = await leadOf(b);
  const eb = await enquiriesOf(lb.id);
  ok("Dubizzle, with the reference written loosely", lb.source === "DUBIZZLE" && eb[0]?.listingId === hills.id,
     `${lb.source} ${eb[0]?.listingId === hills.id ? "hills" : eb[0]?.listingId}`);
  ok("and a Dubizzle lead follows the general rule", lb.assignedToId === sales!.id);

  const c = phone(3);
  await send(c, "Saw it on Property Finder, ref ZZ-999");
  const lc = await leadOf(c);
  const ec = await enquiriesOf(lc.id);
  ok("a reference this brokerage does not have attaches nothing, the portal still counts",
     lc.source === "PROPERTY_FINDER" && ec.length === 1 && ec[0]!.listingId === null && ec[0]!.campaign === "Property Finder, via WhatsApp",
     JSON.stringify(ec.map((e) => [e.listingId, e.campaign])));

  console.log("\n=== everybody else ===");
  const d = phone(4);
  await send(d, "Looking for houses in JVC, budget 180000");
  const ld = await leadOf(d);
  ok("an ordinary message stays a WhatsApp lead, with no enquiry made up",
     ld.source === "WHATSAPP_AD" && (await enquiriesOf(ld.id)).length === 0, String(ld.source));
  const e = phone(5);
  await send(e, "Is MG-202 still available?");
  const le = await leadOf(e);
  const ee = await enquiriesOf(le.id);
  ok("no portal named, but our reference: the property attaches, the source stays WhatsApp",
     le.source === "WHATSAPP_AD" && ee.length === 1 && ee[0]!.listingId === marina.id && ee[0]!.campaign === null);

  console.log("\n=== a buyer we already have ===");
  await send(d, "Actually I saw one on Bayut too");
  ok("is not re-filed under a portal months later", (await leadOf(d)).source === "WHATSAPP_AD");
  await send(a, "Also interested in DH-509");
  await send(a, "And is MG-202 still free?");
  const ea2 = await enquiriesOf(la.id);
  ok("gets one enquiry for a new property and none for asking about the same one again",
     ea2.length === 2 && ea2[1]!.listingId === hills.id, JSON.stringify(ea2.map((x) => x.listingId)));
  const before = await root.enquiry.count({ where: { orgId: org.id } });
  await send(b, "redelivered", ids[1]);
  ok("a redelivered message adds nothing", (await root.enquiry.count({ where: { orgId: org.id } })) === before);

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); fatal(e); });
