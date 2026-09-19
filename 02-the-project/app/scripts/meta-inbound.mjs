import crypto from "node:crypto";
import http from "node:http";
import { PrismaClient } from "@prisma/client";

/**
 * A signed Meta lead-ad webhook, end to end, against the real application.
 *
 * ## Why this suite exists
 *
 * Facebook and Instagram lead forms are where a large share of Dubai
 * brokerage lead spend goes, and this is the newest and least-proven
 * path into the product. Until now it had **no check at all** — the
 * WhatsApp path had `check:whatsapp-inbound` proving an inbound message
 * becomes a lead, and the commercially larger channel had nothing.
 *
 * ## Why it fails silently, which is why it needs asserting
 *
 * Every failure on this route ends in **HTTP 200**, on purpose: Meta
 * retries a non-200 for 36 hours and disables the subscription after
 * repeated failures, so a bug of ours would end with Facebook switching
 * the brokerage's entire lead flow off. Correct behaviour towards Meta,
 * and completely silent towards the brokerage. An unconnected Page, a
 * malformed id, a dead token — all 200, all invisible.
 *
 * And unlike a portal payload, a Meta lead **cannot be replayed**. The
 * webhook carries only an id; the answers must be fetched back with the
 * Page token inside a retention window. A token that has expired is not
 * a delay, it is leads gone permanently.
 *
 * ## What it does
 *
 * Runs a loopback stand-in for Graph — `META_GRAPH_BASE` is honoured
 * only for a loopback address, which is what makes this testable at all
 * — then posts properly signed webhooks and asserts what came out of
 * the far end.
 *
 *     npm run dev            # or npm run build && npm run start
 *     npm run check:meta-inbound
 */
const APP = process.env.APP_URL ?? process.env.APP ?? "http://localhost:3000";
const SECRET = process.env.META_APP_SECRET;
const VERIFY = process.env.META_VERIFY_TOKEN;

if (!SECRET) {
  console.error("META_APP_SECRET is not set — the webhook would reject every delivery.");
  console.error("Any value works locally: this script signs its own payloads with it.");
  process.exit(1);
}

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
if (!org) { console.error("no organisation — run npm run db:seed"); process.exit(1); }

const PAGE_ID = String(Date.now()).slice(-12);          // Meta ids are numeric strings
const LEADGEN = "99" + String(Date.now()).slice(-10);
const PHONE_RAW = `+9715${Math.floor(Math.random() * 90000000 + 10000000)}`;
const EMAIL = `meta.check.${Date.now()}@example.com`;

/* ------------------------------------------------------------------ *
 * The stand-in for Graph.
 *
 * `mode` is flipped between assertions rather than restarting a server,
 * so the application keeps one base URL for the whole run — which is
 * also how it behaves in life: the endpoint does not move, its answers
 * change.
 * ------------------------------------------------------------------ */
let mode = "lead";
let fetched = 0;
/** Set once the Page is connected with a resolvable credential. */
let connected = false;

const graph = http.createServer((req, res) => {
  fetched++;
  if (mode === "expired") {
    // What a dead Page token looks like. 401 is the branch that must
    // become an incident rather than a logged error.
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Error validating access token", code: 190 } }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    created_time: new Date().toISOString(),
    platform: "instagram",
    form_name: "Marina 2-bed enquiry",
    campaign_name: "Marina Q4",
    ad_id: "120200000000000000",
    field_data: [
      { name: "full_name", values: ["Yousef Al Marri"] },
      { name: "phone_number", values: [PHONE_RAW] },
      { name: "email", values: [EMAIL] },
      // Not one of the four recognised fields. The most useful answers
      // on a lead form are the unrecognised ones, and they must survive
      // rather than be dropped.
      { name: "what_is_your_budget", values: ["2.5M - 3M AED"] },
      { name: "when_are_you_looking_to_move", values: ["Within 3 months"] },
    ],
  }));
});
/**
 * A fixed port, not an ephemeral one.
 *
 * The application has to be started with `META_GRAPH_BASE` already
 * pointing here, which means the port must be known before this script
 * runs. Binding :0 and reporting the port afterwards would be tidier and
 * completely useless — the process that needs the value started first.
 */
const PORT = Number(process.env.META_STUB_PORT ?? 4319);
try {
  await new Promise((resolve, reject) => {
    graph.once("error", reject);
    graph.listen(PORT, "127.0.0.1", resolve);
  });
} catch (err) {
  console.error(`\ncould not bind 127.0.0.1:${PORT} — ${String(err).slice(0, 90)}`);
  console.error("set META_STUB_PORT to a free port, and start the application with");
  console.error("META_GRAPH_BASE pointing at the same one.\n");
  process.exit(1);
}
const GRAPH_URL = `http://127.0.0.1:${PORT}`;

/* ------------------------------------------------------------------ */
function body(leadgenId, pageId) {
  return JSON.stringify({
    object: "page",
    entry: [{
      id: pageId,
      time: Math.floor(Date.now() / 1000),
      changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: pageId } }],
    }],
  });
}

async function post(payload, sign = true) {
  const headers = { "content-type": "application/json" };
  if (sign) {
    headers["x-hub-signature-256"] =
      "sha256=" + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  }
  const r = await fetch(`${APP}/api/webhooks/meta`, { method: "POST", headers, body: payload });
  return r.status;
}

const leadCount = () => db.lead.count({ where: { orgId: org.id, email: EMAIL } });

console.log("\nMeta lead ads, inbound\n");
console.log(`  graph stand-in on ${GRAPH_URL}`);
console.log(`  the application must run with META_GRAPH_BASE=${GRAPH_URL}\n`);

/* ---------------- the subscription handshake ---------------------- */
console.log("=== the handshake Meta does once, which must be exact ===");
if (!VERIFY) {
  console.log("  · skipped — META_VERIFY_TOKEN is not set");
} else {
  const good = await fetch(
    `${APP}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY)}&hub.challenge=abc123`);
  const text = await good.text();
  ok("the challenge is echoed back", good.status === 200 && text === "abc123",
     `HTTP ${good.status} body ${JSON.stringify(text.slice(0, 20))}`);
  // Meta compares the body byte for byte. A JSON-quoted string fails the
  // handshake and the error it gives says nothing useful.
  ok("as plain text, not quoted JSON", !text.startsWith("\""), JSON.stringify(text.slice(0, 12)));

  const badTok = await fetch(
    `${APP}/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123`);
  ok("a wrong verify token is refused", badTok.status === 403, `HTTP ${badTok.status}`);
}

/* ---------------- the signature ----------------------------------- */
console.log("\n=== an unsigned or forged delivery is refused ===");
{
  const unsigned = await post(body(LEADGEN, PAGE_ID), false);
  ok("no signature, no entry", unsigned === 401, `HTTP ${unsigned}`);

  const payload = body(LEADGEN, PAGE_ID);
  const forged = await fetch(`${APP}/api/webhooks/meta`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) },
    body: payload,
  });
  ok("a forged signature is refused", forged.status === 401, `HTTP ${forged.status}`);
  ok("and neither reached Graph", fetched === 0, `${fetched} fetch(es)`);
}

/* ---------------- a Page nobody connected -------------------------- */
console.log("\n=== a lead for a Page nobody connected creates nothing ===");
{
  const before = await leadCount();
  const status = await post(body(LEADGEN, PAGE_ID));
  await wait(2000);
  // 200 is correct: Meta disables a subscription that keeps failing, and
  // there is nothing to retry into. Right answer to Meta, wrong answer
  // to the brokerage — which is exactly why this is asserted.
  ok("Meta is told it succeeded", status === 200, `HTTP ${status}`);
  ok("no lead is invented", (await leadCount()) === before, `${before} lead(s)`);
  ok("and the token was never spent on it", fetched === 0, `${fetched} fetch(es)`);
}

/* ---------------- connected: the assertion that matters ------------ */
console.log("\n=== once the Page is connected, the lead lands on the board ===");
/**
 * Connected through the real procedure, not by inserting a row.
 *
 * Inserting a `Channel` directly would skip the step where the access
 * token is written to the vault — and that step was exactly what was
 * broken: `secretRef` was generated for WhatsApp only, so a Page's
 * token went nowhere while the response reported it stored. A check
 * that writes its own row asserts a path no customer takes and proves
 * the wrong thing.
 */
{
  const OWNER = "dev-session-token-ask-history";
  const r = await fetch(`${APP}/api/trpc/channels.connect?batch=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `authjs.session-token=${OWNER}; __Secure-authjs.session-token=${OWNER}`,
    },
    body: JSON.stringify({ 0: { json: {
      type: "META_LEAD_ADS", label: "Meta check", identifier: PAGE_ID,
      accessToken: "EAA-check-only-page-token-not-a-real-credential",
    } } }),
  });
  const text = await r.text();
  ok("the Page connects", r.status === 200, `HTTP ${r.status} ${text.slice(0, 90)}`);

  let stored = null;
  try { stored = JSON.parse(text)[0]?.result?.data?.json?.tokenStored; } catch { /* reported below */ }
  // The lie that hid the bug: this came back true while the token was
  // written nowhere, so the screen showed a connected Page.
  ok("and reports the token stored, truthfully", stored === true, `tokenStored=${stored}`);

  const row = await db.channel.findFirst({
    where: { orgId: org.id, identifier: PAGE_ID },
    select: { secretRef: true },
  });
  connected = !!row?.secretRef;
  ok("a credential reference exists to read the token back with",
     connected, row?.secretRef ?? "none — every lead will fail at the credential lookup");
}
{
  const status = await post(body(LEADGEN, PAGE_ID));
  ok("accepted", status === 200, `HTTP ${status}`);

  // The route answers before it works — Meta retries anything slow — so
  // poll rather than assert immediately.
  let lead = null;
  for (let i = 0; i < 24 && !lead; i++) {
    await wait(500);
    lead = await db.lead.findFirst({
      where: { orgId: org.id, email: EMAIL },
      select: { id: true, name: true, phone: true, stageId: true, source: true, notes: true },
    });
  }
  /**
   * The misconfiguration that would otherwise read as a product bug.
   *
   * If the application was started without `META_GRAPH_BASE`, it called
   * the real Graph with a fake id and got nothing — no lead, and this
   * stand-in never touched. Identical symptom to the ingest being
   * broken, so it is named rather than left to be diagnosed.
   *
   * `connected` guards it, and that guard is not hypothetical: with the
   * credential bug reinstated to prove this suite can fail, the token
   * lookup throws *before* anything reaches Graph, so `fetched` is 0
   * for a completely different reason and this branch confidently
   * blamed the environment for a product defect. **A diagnosis that
   * fires on a symptom rather than a cause sends the next person to
   * the wrong file.** Only claim the base URL is wrong when the
   * credential path was sound.
   */
  if (!lead && fetched === 0 && connected) {
    console.error(`\n  the application never called ${GRAPH_URL}.`);
    console.error("  it is not running with META_GRAPH_BASE set to that address, so this");
    console.error("  suite cannot prove anything. Restart it with:\n");
    console.error(`    META_GRAPH_BASE=${GRAPH_URL} npm run start\n`);
    graph.close();
    await db.channel.deleteMany({ where: { identifier: PAGE_ID } });
    await db.$disconnect();
    process.exit(1);
  }

  ok("a lead exists for the enquirer", !!lead, lead ? lead.name : "none");

  if (lead) {
    ok("the name came through", lead.name === "Yousef Al Marri", lead.name ?? "null");
    ok("and the phone, which is how an agent replies",
       (lead.phone ?? "").replace(/\s/g, "").endsWith(PHONE_RAW.slice(-9)),
       lead.phone ?? "null");
    ok("it is on the pipeline board, not stranded", !!lead.stageId,
       lead.stageId ? "has a stage" : "stageId is null — invisible on the board");
    // `ingestEnquiry` sets this from a fixed per-portal map, so it is
    // the channel and not the campaign. See the note below the suite
    // about what that costs.
    ok("the lead is attributed to the channel it came from",
       lead.source === "META_LEAD_ADS", lead.source ?? "null");
  }

  /**
   * `Enquiry` has no `portal` column — the channel carries the type, and
   * this is how the delivery is traced back to the Page it arrived on.
   */
  const enquiry = await db.enquiry.findFirst({
    where: { orgId: org.id, externalId: LEADGEN },
    select: { id: true, channel: { select: { type: true, identifier: true } } },
  });
  ok("the delivery is recorded against the Page it arrived on",
     enquiry?.channel?.type === "META_LEAD_ADS" && enquiry?.channel?.identifier === PAGE_ID,
     enquiry ? `${enquiry.channel?.type} ${enquiry.channel?.identifier}` : "no enquiry row");
}

/* ---------------- the answers nobody maps -------------------------- */
console.log("\n=== the unrecognised answers survive, because they are the useful ones ===");
{
  /**
   * `Enquiry.message` is where they land, and it is the only place.
   *
   * `normalise()` appends every answer it could not match to
   * `raw.message`, and `ingestEnquiry` writes that straight onto the
   * enquiry — portal ingest opens no conversation, so there is no
   * thread and no `Message` row to look in. Asserted here rather than
   * against the lead, because a future change that moved these into a
   * field no screen reads would still satisfy "the lead exists".
   */
  const enquiry = await db.enquiry.findFirst({
    where: { orgId: org.id, externalId: LEADGEN },
    select: { message: true },
  });
  const haystack = enquiry?.message ?? "";
  // "Budget" and "timeframe" are not in the four recognised patterns, so
  // they are appended rather than dropped. Losing them turns a qualified
  // enquiry into a name and a number.
  ok("the budget answer is kept", /2\.5M/.test(haystack),
     haystack.replace(/\n/g, " | ").slice(0, 70) || "nothing");
  ok("and the timeframe answer", /3 months/i.test(haystack),
     haystack.replace(/\n/g, " | ").slice(0, 70) || "nothing");
  // The label the brokerage typed, not a slug. `humanise()` is the only
  // thing standing between an agent and "budget_aed_range: 2.5M".
  ok("labelled the way the form asked it, not as a slug",
     /What is your budget/.test(haystack) && !/what_is_your_budget/.test(haystack),
     haystack.replace(/\n/g, " | ").slice(0, 70) || "nothing");
}

/* ---------------- a malformed id ----------------------------------- */
console.log("\n=== an id that is not Meta's shape is refused, not fetched ===");
{
  const spent = fetched;
  const status = await post(body("../../etc/passwd", PAGE_ID));
  await wait(1500);
  ok("still 200, so the subscription survives", status === 200, `HTTP ${status}`);
  ok("and nothing was fetched with it", fetched === spent, `${fetched - spent} fetch(es)`);
}

/* ---------------- the failure that loses leads --------------------- */
console.log("\n=== a dead token becomes an incident, not a log line ===");
{
  mode = "expired";
  await db.channel.updateMany({ where: { identifier: PAGE_ID }, data: { lastError: null } });

  const status = await post(body("88" + String(Date.now()).slice(-10), PAGE_ID));
  ok("Meta is still told it succeeded", status === 200, `HTTP ${status}`);

  let chan = null;
  for (let i = 0; i < 24; i++) {
    await wait(500);
    chan = await db.channel.findFirst({
      where: { orgId: org.id, identifier: PAGE_ID },
      select: { lastError: true },
    });
    if (chan?.lastError) break;
  }
  ok("the channel records the failure", !!chan?.lastError,
     chan?.lastError ? "" : "nothing recorded — health/alert.ts sweeps lastError and would see nothing");
  // The wording is the runbook. Whoever reads this at eleven at night
  // has to know the leads are gone, not queued.
  ok("and says the leads are lost, not delayed",
     /permanently|lost/i.test(chan?.lastError ?? ""),
     (chan?.lastError ?? "none").slice(0, 70));
  mode = "lead";
}

/* ---------------- leave nothing behind ----------------------------- */
const chans = await db.channel.findMany({ where: { identifier: PAGE_ID }, select: { id: true } });
for (const ch of chans) {
  const convos = await db.conversation.findMany({ where: { channelId: ch.id }, select: { id: true } });
  for (const c of convos) await db.message.deleteMany({ where: { conversationId: c.id } });
  await db.conversation.deleteMany({ where: { channelId: ch.id } });
  await db.enquiry.deleteMany({ where: { channelId: ch.id } });
  await db.channel.delete({ where: { id: ch.id } });
}
await db.lead.deleteMany({ where: { orgId: org.id, email: EMAIL } });

graph.close();
await db.$disconnect();
console.log(bad ? `\n${bad} PROBLEM(S)\n` : "\n  a lead ad becomes a lead, and a dead token becomes an incident.\n");
process.exitCode = bad ? 1 : 0;
