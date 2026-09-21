import { PrismaClient } from "@prisma/client";

/**
 * A brokerage's own website form, end to end, against the real application.
 *
 * ## Why this suite exists
 *
 * Nothing exercised `/api/webhooks/portals/[portal]` — the route that
 * receives from the website form and from every property portal. Thirty
 * five check suites and not one posted to it, and that is how
 * `WEBSITE_FORM` came to be a channel a brokerage could connect, with a
 * webhook URL printed on the settings screen, that answered **404
 * "Unknown portal."** to every delivery for the life of the product.
 *
 * It matters more than it looks. The portals each need a partner
 * agreement before a single lead can arrive, and Meta lead ads needs a
 * Facebook Page. A brokerage with neither has exactly one inbound
 * channel that needs nobody's permission — their own website — and it
 * was the one that did not work.
 *
 *     npm run start
 *     npm run check:website-form
 *
 * ## What it asserts
 *
 * The whole path, through the real procedures rather than fixtures:
 * connecting the form gives out a usable token, a post becomes a lead
 * on the pipeline board with a stage, a retry does not become a second
 * lead, an enquiry nobody can reply to is refused, the form name reaches
 * reporting, and a wrong token cannot post into somebody else's
 * pipeline.
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OWNER = "dev-session-token-ask-history";

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});
const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
if (!org) { console.error("no organisation — run npm run db:seed"); process.exit(1); }

const STAMP = Date.now();
const EMAIL = `web.check.${STAMP}@example.com`;
const PHONE = `+9715${Math.floor(Math.random() * 90000000 + 10000000)}`;
const FORM_ID = `web-check-${STAMP}`;

async function trpc(proc, json) {
  const r = await fetch(`${APP}/api/trpc/${proc}?batch=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `authjs.session-token=${OWNER}; __Secure-authjs.session-token=${OWNER}`,
    },
    body: JSON.stringify({ 0: { json } }),
  });
  return { status: r.status, text: await r.text() };
}

/** A post to the webhook, exactly as a brokerage's website would make it. */
async function submit(token, payload) {
  const r = await fetch(`${APP}/api/webhooks/portals/website_form?t=${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: (await r.text()).slice(0, 120) };
}

const leads = () => db.lead.count({ where: { orgId: org.id, email: EMAIL } });

console.log("\nThe website form, inbound\n");

/* ---------------- connecting it ------------------------------------ */
console.log("=== the brokerage connects their form ===");
let token = null;
{
  const { status, text } = await trpc("channels.connect", {
    type: "WEBSITE_FORM", label: `Website check ${STAMP}`, identifier: `check-form-${STAMP}`,
  });
  ok("the form connects", status === 200, `HTTP ${status} ${text.slice(0, 80)}`);
  try { token = JSON.parse(text)[0]?.result?.data?.json?.webhookToken; } catch { /* reported next */ }
  // The URL the settings screen prints is this token. Without it there
  // is nothing to give the brokerage's web developer.
  ok("and gives out a webhook token to post to", typeof token === "string" && token.length >= 20,
     token ?? "none — the screen has no URL to show");
}

if (!token) {
  console.error("\n  cannot continue without a token.\n");
  await db.$disconnect();
  process.exit(1);
}

/* ---------------- an enquiry ---------------------------------------- */
console.log("\n=== an enquiry from the website becomes a lead ===");
{
  const r = await submit(token, {
    id: FORM_ID,
    name: "Aisha Rahman",
    phone: PHONE,
    email: EMAIL,
    message: "Interested in a 2-bed in Marina, budget around 2.6M",
    source: "Contact page",
  });
  /**
   * The failure this suite was written for. A type with no adapter
   * answers 404 here, and the brokerage sees nothing at all: their
   * website reports a failed submission and the board stays empty.
   */
  ok("the webhook accepts it", r.status === 200,
     r.status === 404 ? `HTTP 404 ${r.body} — no adapter is registered for WEBSITE_FORM` : `HTTP ${r.status} ${r.body}`);

  let lead = null;
  for (let i = 0; i < 24 && !lead; i++) {
    await wait(500);
    lead = await db.lead.findFirst({
      where: { orgId: org.id, email: EMAIL },
      select: { id: true, name: true, phone: true, stageId: true, source: true },
    });
  }
  ok("a lead exists for the enquirer", !!lead, lead?.name ?? "none");
  if (lead) {
    ok("the name came through", lead.name === "Aisha Rahman", lead.name ?? "null");
    ok("and the phone, which is how an agent replies",
       (lead.phone ?? "").replace(/\s/g, "").endsWith(PHONE.slice(-9)), lead.phone ?? "null");
    ok("it is on the pipeline board, not stranded", !!lead.stageId,
       lead.stageId ? "has a stage" : "stageId is null — invisible on the board");
    ok("attributed to the website", lead.source === "WEBSITE", lead.source ?? "null");
  }

  const enquiry = await db.enquiry.findFirst({
    where: { orgId: org.id, externalId: FORM_ID },
    select: { message: true, campaign: true, channel: { select: { type: true } } },
  });
  ok("the enquiry is filed against the website channel",
     enquiry?.channel?.type === "WEBSITE_FORM", enquiry?.channel?.type ?? "no enquiry row");
  ok("what they typed is kept", /2-bed in Marina/.test(enquiry?.message ?? ""),
     (enquiry?.message ?? "nothing").slice(0, 60));
  // Which form on the site, so `reports.byChannel` can separate a
  // valuation request from a contact-page enquiry.
  ok("and which form it came from", enquiry?.campaign === "Contact page",
     enquiry?.campaign ?? "null — every form on the site reports as one");
}

/* ---------------- the retry ----------------------------------------- */
console.log("\n=== a retried submission is not a second lead ===");
{
  const before = await leads();
  // Same id: the visitor double-clicked, or the agency's form retried.
  const r = await submit(token, {
    id: FORM_ID, name: "Aisha Rahman", phone: PHONE, email: EMAIL, message: "duplicate",
  });
  await wait(1500);
  ok("the duplicate is accepted", r.status === 200, `HTTP ${r.status}`);
  ok("and creates nothing", (await leads()) === before, `${await leads()} lead(s), was ${before}`);
}

/* ---------------- field spellings ----------------------------------- */
console.log("\n=== the spelling their developer happened to use ===");
{
  const alt = `alt.${STAMP}@example.com`;
  const r = await submit(token, {
    submission_id: `alt-${STAMP}`,
    full_name: "Omar Haddad",
    phone_number: `+9715${Math.floor(Math.random() * 90000000 + 10000000)}`,
    email_address: alt,
    comments: "Looking for a villa in Arabian Ranches",
  });
  await wait(1500);
  const lead = await db.lead.findFirst({ where: { orgId: org.id, email: alt }, select: { name: true } });
  /**
   * `full_name` rather than `name`, `comments` rather than `message`.
   * A schema the brokerage's agency has to match exactly is one that
   * silently posts nothing for a fortnight before anybody asks why the
   * website has sent no leads.
   */
  ok("a common alternative spelling still works", lead?.name === "Omar Haddad",
     lead?.name ?? "nothing — the enquiry was accepted and dropped");
  await db.lead.deleteMany({ where: { orgId: org.id, email: alt } });
}

/* ---------------- nothing to reply to -------------------------------- */
console.log("\n=== an enquiry nobody can answer creates nothing ===");
{
  const before = await db.lead.count({ where: { orgId: org.id } });
  const r = await submit(token, { id: `empty-${STAMP}`, name: "No Contact", message: "call me" });
  await wait(1500);
  // `ingestEnquiry` refuses an enquiry with neither phone nor email.
  // Accepted so the website does not show an error to the visitor, and
  // recorded nowhere, because a lead nobody can reply to is noise.
  ok("still accepted, so the visitor sees no error", r.status === 200, `HTTP ${r.status}`);
  ok("and no unreachable lead is invented",
     (await db.lead.count({ where: { orgId: org.id } })) === before, "no new lead");
}

/* ---------------- somebody else's token ------------------------------ */
console.log("\n=== a wrong token cannot post into a pipeline ===");
{
  const r = await submit("not-a-real-channel-token-000000", {
    id: `evil-${STAMP}`, name: "Should Not Appear", phone: "+971500000000",
  });
  ok("refused", r.status === 404 || r.status === 401, `HTTP ${r.status}`);
  const planted = await db.lead.findFirst({ where: { name: "Should Not Appear" }, select: { id: true } });
  ok("and nothing was planted", !planted, planted ? "a lead was created" : "none");
}

/* ---------------- leave nothing behind ------------------------------- */
const chans = await db.channel.findMany({
  where: { orgId: org.id, identifier: `check-form-${STAMP}` }, select: { id: true },
});
for (const ch of chans) {
  await db.enquiry.deleteMany({ where: { channelId: ch.id } });
  await db.channel.delete({ where: { id: ch.id } });
}
await db.lead.deleteMany({ where: { orgId: org.id, email: EMAIL } });
await db.$disconnect();

console.log();
if (bad) { console.log(`${bad} PROBLEM(S)\n`); process.exit(1); }
console.log("  a website enquiry becomes a lead on the board.\n");
