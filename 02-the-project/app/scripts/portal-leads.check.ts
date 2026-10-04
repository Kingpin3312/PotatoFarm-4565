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
 * And by email: a portal's new-lead email in a connected mailbox, through
 * the real sync against a Gmail stand-in. Only the portal's own domain
 * counts, a lookalike does not; the buyer already known from WhatsApp is
 * one lead with a second enquiry; a new buyer is filed under the portal
 * with the property they asked about, on a channel per portal that the
 * silence alarm watches; an email with nothing to go on lands on the
 * agent's list; a second sync adds nothing; no body is stored.
 *
 *     npm run check:portal-leads
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { syncAccount } from "../src/server/lib/email/sync";
import { writeSecret } from "../src/server/lib/secrets/vault";
import { fatal } from "./fatal";

/** A Gmail mailbox holding these messages, and nothing else. */
type Mail = { id: string; from: string; subject: string; body: string; html?: boolean; replyTo?: string };
const inbox: Mail[] = [];
const bodiesFetched: string[] = [];
const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64url");
const gmail = http.createServer((req, res) => {
  const url = new URL(req.url!, "http://x");
  const json = (status: number, v: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
  if (req.headers.authorization !== "Bearer g-token") return json(401, {});
  const api = "/gmail/v1/users/me";
  if (url.pathname === `${api}/profile`) return json(200, { historyId: "1" });
  if (url.pathname === `${api}/messages`) return json(200, { messages: inbox.map((m) => ({ id: m.id })) });
  if (url.pathname === "/calendar/v3/freeBusy") return json(200, { calendars: { primary: { busy: [] } } });
  const m = inbox.find((x) => url.pathname === `${api}/messages/${x.id}`);
  if (!m) return json(404, {});
  if (url.searchParams.get("format") === "full") {
    bodiesFetched.push(m.id);
    return json(200, { id: m.id, payload: { mimeType: "multipart/alternative", parts: [
      { mimeType: m.html ? "text/html" : "text/plain", body: { data: b64(m.body) } },
    ] } });
  }
  return json(200, {
    id: m.id, threadId: `t-${m.id}`, snippet: m.body.slice(0, 40), internalDate: String(Date.now()),
    payload: { headers: [
      { name: "From", value: m.from }, { name: "To", value: "agent@realty.test" }, { name: "Subject", value: m.subject },
      ...(m.replyTo ? [{ name: "Reply-To", value: m.replyTo }] : []),
    ] },
  });
});

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
    await root.emailMessage.deleteMany({ where });
    await root.calendarBusy.deleteMany({ where });
    await root.emailAccount.deleteMany({ where });
    await root.secret.deleteMany({ where }).catch(() => {});
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

  console.log("\n=== a portal's new-lead email ===");
  const gBase = await new Promise<string>((ok) => gmail.listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${(gmail.address() as AddressInfo).port}`)));
  process.env.GOOGLE_OAUTH_BASE = gBase;
  const ref = `portal-leads-${RUN}`;
  await writeSecret({ orgId: org.id, ref, value: JSON.stringify({ accessToken: "g-token", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }) });
  const acct = await root.emailAccount.create({ data: { orgId: org.id, agentId: sales!.id, provider: "GOOGLE", address: "agent@realty.test", secretRef: ref } });
  const fresh = phone(6);
  const leadsBefore = await root.lead.count({ where: { orgId: org.id } });
  inbox.push(
    // The Bayut buyer we already have from WhatsApp, written the local way.
    { id: "m-bayut", from: "Bayut <leads@bayut.com>", subject: "New lead on MG-202",
      body: `You have a new lead.\nName: Buyer\nPhone: 0${a.slice(4)}\nMessage: Can I view it on Saturday?` },
    // Somebody new, from Dubizzle, as an HTML table.
    { id: "m-dubizzle", from: "dubizzle <no-reply@dubizzle.com>", subject: "Enquiry for DH-509", html: true, replyTo: "hana@example.com",
      body: `<table><tr><td>Name:</td><td>Hana Ali</td></tr><tr><td>Mobile:</td><td>${fresh}</td></tr></table>` },
    // Property Finder with nothing to go on.
    { id: "m-pf-empty", from: "leads@propertyfinder.ae", subject: "Somebody is interested",
      body: "Log in to Property Finder to see the details of this lead." },
    // Not Bayut, however it is dressed.
    { id: "m-fake", from: "Bayut Leads <bayut.leads@gmail.com>", subject: "New lead on MG-202",
      body: `Name: Spoof\nPhone: ${phone(7)}` },
  );
  const r1 = await syncAccount(acct.id);
  ok("the sync reports two portal leads", (r1 as { portalLeads?: number }).portalLeads === 2, JSON.stringify(r1));

  const ea3 = await enquiriesOf(la.id);
  const byEmail = ea3.find((x) => x.externalId === `email:${acct.id}:m-bayut`);
  ok("the buyer already known from WhatsApp is one lead, with the email as a second enquiry",
     (await root.lead.count({ where: { orgId: org.id, phone: a } })) === 1 && byEmail?.campaign === "Bayut, by email" && byEmail.listingId === marina.id,
     JSON.stringify(byEmail && { campaign: byEmail.campaign, listing: byEmail.listingId === marina.id }));
  const hana = await root.lead.findUnique({ where: { orgId_phone: { orgId: org.id, phone: fresh } } });
  const hanaEnq = hana ? await enquiriesOf(hana.id) : [];
  ok("a new buyer by email is a Dubizzle lead, named, with their address and the property",
     hana?.source === "DUBIZZLE" && hana.name === "Hana Ali" && hana.email === "hana@example.com" && hanaEnq[0]?.listingId === hills.id,
     JSON.stringify(hana && { source: hana.source, name: hana.name, email: hana.email }));
  const ch = await root.channel.findFirst({ where: { orgId: org.id, type: "DUBIZZLE", identifier: "lead-email" } });
  ok("on a Dubizzle lead-email channel the silence alarm can watch", ch?.label === "Dubizzle lead emails" && !!ch.lastSyncAt);
  ok("a lookalike sender makes no lead", !(await root.lead.findUnique({ where: { orgId_phone: { orgId: org.id, phone: phone(7) } } })));
  const todo = await root.followUp.findMany({ where: { orgId: org.id, agentId: sales!.id, title: { contains: "Property Finder lead email" } } });
  ok("an email with nothing to go on is on the mailbox owner's list, not lost", todo.length === 1, String(todo.length));
  ok("only the portals' emails were opened", JSON.stringify(bodiesFetched.sort()) === JSON.stringify(["m-bayut", "m-dubizzle", "m-pf-empty"]), JSON.stringify(bodiesFetched));
  ok("and no email text was stored", (await root.emailMessage.count({ where: { accountId: acct.id } })) === 0);
  ok("the only new person is Hana; the spoof and the empty email made nobody", (await root.lead.count({ where: { orgId: org.id } })) === leadsBefore + 1);

  const enquiriesNow = await root.enquiry.count({ where: { orgId: org.id } });
  await root.emailAccount.update({ where: { id: acct.id }, data: { cursor: null } });
  await syncAccount(acct.id);
  ok("syncing the same mail again adds nothing",
     (await root.enquiry.count({ where: { orgId: org.id } })) === enquiriesNow
       && (await root.followUp.count({ where: { orgId: org.id, title: { contains: "lead email" } } })) === 1);

  await cleanup();
  gmail.close();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); gmail.close(); fatal(e); });
