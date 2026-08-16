import crypto from "node:crypto";
import fs from "node:fs";
import pw from "playwright";
import { PrismaClient } from "@prisma/client";

/**
 * Saying you are away, and leads going elsewhere.
 *
 * Nothing ever wrote an `AgentAvailability` row, so routing applied
 * capacity 40 and "always available" to everybody. The assertion that
 * matters is not that the form saves — it is that **saving it changes
 * where a lead goes**. A settings screen that stores a preference
 * nothing reads is the shape this codebase keeps finding.
 *
 *     npm run dev
 *     npm run check:availability
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
const APP = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.WHATSAPP_APP_SECRET;
if (!SECRET) { console.error("WHATSAPP_APP_SECRET is not set."); process.exit(1); }

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const db = new PrismaClient({ datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}} });
const org = await db.organisation.findFirst({ where:{deletedAt:null}, select:{id:true} });
const sess = await db.session.findUnique({
  where: { sessionToken: "dev-session-token-ask-history" }, select: { userId: true },
});
const NUMBER_ID = `AVAIL-TEST-${Date.now()}`;
const made = [];
await db.channel.create({
  data: { orgId: org.id, type: "WHATSAPP", label: "Availability test", identifier: NUMBER_ID, active: true },
});
await db.agentAvailability.deleteMany({ where: { orgId: org.id } });

function payload(from, text) {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "w", changes: [{ field: "messages", value: {
    metadata: { phone_number_id: NUMBER_ID, display_phone_number: "+971500000000" },
    contacts: [{ profile: { name: "Availability Buyer" }, wa_id: from }],
    messages: [{ from, id: `wamid.${crypto.randomUUID()}`,
      timestamp: String(Math.floor(Date.now()/1000)), type: "text", text: { body: text } }],
  } }] }] });
}
async function arrive(text) {
  const from = `9715${Math.floor(Math.random()*90000000+10000000)}`;
  const body = payload(from, text);
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  await fetch(`${APP}/api/webhooks/whatsapp`, { method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body });
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const l = await db.lead.findFirst({ where: { orgId: org.id, phone: `+${from}` },
      select: { id: true, assignedToId: true } });
    if (l) { made.push(`+${from}`); return l; }
  }
  made.push(`+${from}`);
  return null;
}

// Two agents, so "somewhere else" is a place that exists.
const extra = await db.user.create({
  data: { email: `avail-check-${Date.now()}@example.invalid`, name: "Cover Agent" },
  select: { id: true },
});
await db.membership.create({ data: { orgId: org.id, userId: extra.id, role: "AGENT" } });

/**
 * The routing pool, read after the extra agent exists.
 *
 * Routing only considers members with the AGENT role — which is why
 * asserting against the signed-in OWNER proved nothing.
 */
const agents = await db.membership.findMany({
  where: { orgId: org.id, role: "AGENT" },
  select: { userId: true, user: { select: { name: true } } },
  orderBy: { createdAt: "asc" },
});
if (agents.length < 2) {
  console.error(`need two AGENT members to prove this; found ${agents.length}`);
  process.exit(1);
}

const b = await pw.chromium.launch({ executablePath: cp() });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "authjs.session-token", value: "dev-session-token-ask-history",
  domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const p = await ctx.newPage();

console.log("\n=== the screen is honest about the defaults ===");
// `domcontentloaded`, not `networkidle`: this screen holds a query that
// keeps the connection warm, so networkidle never settles and the goto
// times out on a page that rendered perfectly well.
await p.goto(`${APP}/me`, { waitUntil: "domcontentloaded" });
await p.waitForFunction(()=>/availability/i.test(document.body.innerText), null, { timeout: 25000 });
await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await p.waitForTimeout(1200);
{
  ok("an agent can see their own availability",
     /send me new leads/i.test(await p.evaluate(()=>document.body.innerText)));
  ok("every field is labelled", await p.evaluate(()=>
    [...document.querySelectorAll('input[type=date], input[type=text]')]
      .every(i=>!!i.getAttribute("aria-label"))));
  ok("no input under 16px", await p.evaluate(()=>
    [...document.querySelectorAll("input:not([type=checkbox])")]
      .every(i=>parseFloat(getComputedStyle(i).fontSize)>=16)));
}

console.log("\n=== the screen writes a row ===");
{
  const box = p.locator('input[type=checkbox]').first();
  if (await box.isChecked()) await box.uncheck();
  await p.getByRole("button", { name: "Save" }).first().click();
  await p.waitForTimeout(2000);
  ok("it saves", /saved/i.test(await p.evaluate(()=>document.body.innerText)));
  const row = await db.agentAvailability.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: sess.userId } },
    select: { acceptingLeads: true },
  });
  ok("and the row exists afterwards", !!row, row ? `acceptingLeads=${row.acceptingLeads}` : "none");
}

console.log("\n=== and routing reads it ===");
/**
 * Asserted against real agents, not against the signed-in user.
 *
 * The first version switched the *session* user off through the screen
 * and then asserted no lead reached them — and it passed against a
 * build with `acceptingLeads` hardcoded to true, because the session
 * user is an OWNER and `candidatesFor` only considers members with the
 * AGENT role. They were never a routing candidate, so "no lead came to
 * them" was true no matter what the code did. A vacuous assertion, and
 * the third of this shape in this session.
 *
 * The screen writes a row keyed by `(orgId, userId)` and routing reads
 * rows keyed by `(orgId, userId)`; those two halves are asserted
 * separately, and the half that decides where work goes is asserted
 * against somebody who is actually in the pool.
 */
{
  await db.agentAvailability.deleteMany({ where: { orgId: org.id } });

  const first = [];
  for (let i = 0; i < 2; i++) first.push((await arrive("Two bed please"))?.assignedToId ?? null);
  ok("with everyone available, leads are assigned", first.every(Boolean),
     `${new Set(first).size} distinct owner(s) across 2`);

  /**
   * Everyone except one is switched off, rather than one of two.
   *
   * Written for a pool of exactly two, this section reported "pool" for
   * any agent it did not have a name for — so a third agent taking the
   * lead looked like nobody taking it, and the final assertion failed
   * for a reason that had nothing to do with the code. Sized off the
   * pool it actually finds.
   */
  const keep = agents.at(-1);
  for (const a of agents) {
    if (a.userId === keep.userId) continue;
    await db.agentAvailability.upsert({
      where: { orgId_userId: { orgId: org.id, userId: a.userId } },
      create: { orgId: org.id, userId: a.userId, acceptingLeads: false },
      update: { acceptingLeads: false },
    });
  }

  const after = [];
  for (let i = 0; i < 3; i++) after.push((await arrive("Another enquiry"))?.assignedToId ?? null);
  ok("nothing goes to an agent who is not accepting leads",
     after.every((o) => o === keep.userId),
     after.map((o) => (o === keep.userId ? "the one who is on" : o ? "AN AGENT WHO IS OFF" : "pool")).join(", "));

  // Everyone off: there is nobody, and the honest answer is the pool.
  await db.agentAvailability.upsert({
    where: { orgId_userId: { orgId: org.id, userId: keep.userId } },
    create: { orgId: org.id, userId: keep.userId, acceptingLeads: false },
    update: { acceptingLeads: false },
  });
  const none = await arrive("And one more");
  ok("with nobody accepting, the lead waits in the pool rather than being forced on somebody",
     none?.assignedToId == null, none?.assignedToId ? "assigned anyway" : "pool");
}

console.log("\n=== an away period that ends before it starts is refused ===");
{
  await p.locator('input[aria-label="First day away"]').fill("2026-09-10");
  await p.locator('input[aria-label="Last day away"]').fill("2026-09-01");
  await p.getByRole("button", { name: "Save" }).first().click();
  await p.waitForTimeout(2000);
  const alert = await p.locator('[role="alert"]').first().innerText().catch(()=>"");
  ok("it says so, in English", /before the first/i.test(alert), JSON.stringify(alert.slice(0,70)));
}

console.log("\n=== half an away period is refused too ===");
{
  await p.locator('input[aria-label="Last day away"]').fill("");
  await p.getByRole("button", { name: "Save" }).first().click();
  await p.waitForTimeout(2000);
  const alert = await p.locator('[role="alert"]').first().innerText().catch(()=>"");
  // Routing reads `awayTo` alone, so a start with no end is stored and
  // does nothing at all.
  ok("both days, or neither", /both a first and a last/i.test(alert), JSON.stringify(alert.slice(0,70)));
}

// Clean up.
for (const phone of made) {
  const l = await db.lead.findFirst({ where: { orgId: org.id, phone }, select: { id: true } });
  if (!l) continue;
  const c = await db.conversation.findFirst({ where: { leadId: l.id }, select: { id: true } });
  if (c) await db.message.deleteMany({ where: { conversationId: c.id } });
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
await b.close();
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
