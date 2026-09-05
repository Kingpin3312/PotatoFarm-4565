import fs from "node:fs";
import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * The document register, from the form to the nightly alarm.
 *
 * `documents.expiry` has swept this table every night since the first
 * schema. `expiry.ts` encodes UAE renewal turnaround for eight document
 * types and groups warnings per recipient. `README.md` explains why the
 * broker card is the one that catches people out. And **nothing in the
 * codebase could create a `Document` row** — the job ran, found nothing,
 * reported success, and a brokerage heard nothing because there was
 * nothing to hear. The fifth complete module in this product with no way
 * to start it.
 *
 * Four things are asserted, and the third is the one that matters:
 *
 *   - a document can be recorded at all, by an agent, against themselves;
 *   - an expiring type with no date is refused rather than filed looking
 *     handled and invisible to the sweep for ever;
 *   - the real `documents.expiry` job then finds it and notifies —
 *     triggered over the cron route, not reimplemented here, because a
 *     copy of the job's filter would pass while the job itself failed;
 *   - a renewal supersedes rather than accumulates. Without it the
 *     expired card stays in the sweep's filter and warns every morning
 *     for the rest of the year, which is how somebody turns the
 *     notifications off and then misses the next one.
 *
 *     npm run dev
 *     npm run browser:documents
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
/**
 * Failures are repeated at the end, and that is not decoration.
 *
 * `verify.sh` tails 25 lines of a failed step and this prints more than
 * that — so when this check failed inside the gate, the failing
 * assertion had scrolled off the top and every visible line was a tick.
 * Three hypotheses were tested against it (a second organisation, a
 * cold route compile, the preceding end-to-end checks) and none
 * reproduced, which is a bad place to be with a release gate.
 *
 * Whatever fails next time will be in the last five lines.
 */
let bad=0;
const failures=[];
const ok=(l,p,d="")=>{console.log(`  ${p?"\u2713":"\u2717"} ${l}${d?"  \u2014 "+d:""}`);if(!p){bad++;failures.push(d?`${l}  \u2014 ${d}`:l);}};

const db = new PrismaClient({ datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}} });
const org = await db.organisation.findFirst({ where:{deletedAt:null}, select:{id:true} });
if (!org) { console.error("no organisation to test against"); process.exit(1); }

// A clean slate for this org, so a re-run does not assert against rows
// the previous run left behind.
await db.document.deleteMany({ where: { orgId: org.id } });
await db.notification.deleteMany({ where: { orgId: org.id, kind: "PERMIT_EXPIRING" } });

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const p=await ctx.newPage();

/** The date input wants `yyyy-mm-dd`, and the assertions want the days. */
const inDays = (n) => new Date(Date.now() + n*86_400_000).toISOString().slice(0,10);

async function openForm() {
  await p.goto("http://localhost:3000/documents",{waitUntil:"networkidle"});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await p.getByRole("button",{name:"Record one"}).click();
  await p.waitForTimeout(400);
}

async function record({ type, expires, reference }) {
  // The owner defaults to an agent and the agent list defaults to
  // nobody, so both are chosen explicitly rather than relied on.
  await p.selectOption('select:below(:text("Belongs to"))', "USER").catch(()=>{});
  const selects = p.locator("form select");
  await selects.nth(0).selectOption("USER");
  await p.waitForTimeout(200);
  const who = await selects.nth(1).locator("option").nth(1).getAttribute("value");
  await selects.nth(1).selectOption(who);
  await selects.nth(2).selectOption(type);
  if (reference) await p.getByLabel("Number (optional)").fill(reference).catch(async()=>{
    await p.locator('input[placeholder="BRN 12345"]').fill(reference);
  });
  if (expires) await p.getByLabel("Expiry date").fill(expires);
  await p.getByRole("button",{name:"Record it"}).click();
  await p.waitForTimeout(1400);
  return who;
}

console.log("\n=== the screen the notification links to exists ===");
{
  // `documents.expiry` deeplinks at `/documents?filter=expiring`. It was
  // a 404, and had been since the job was written.
  const res = await p.goto("http://localhost:3000/documents?filter=expiring",{waitUntil:"networkidle"});
  ok("/documents?filter=expiring resolves", res.status() === 200, `status ${res.status()}`);
  /**
   * Wait for the register to render before reading it.
   *
   * This is the flake. It failed twice inside `npm run verify` and
   * passed every time it was run alone, and the reason is here: every
   * other navigation in this file settles after `goto` and this one
   * read `innerText` immediately. `networkidle` means the network went
   * quiet, not that React has painted — the register is a client
   * component behind a tRPC query, so on an unloaded machine it is
   * there within a frame and inside a gate run, with the dev server
   * compiling and three checks' worth of traffic behind it, it is not.
   *
   * Waiting on the heading rather than on a timeout, so a genuinely
   * broken page fails with "the register never rendered" instead of
   * passing because the sleep happened to be long enough.
   */
  const rendered = await p.waitForSelector("h1", { timeout: 15_000 })
    .then(() => true).catch(() => false);
  ok("the register renders", rendered, rendered ? "" : "no h1 after 15s");
  await p.waitForTimeout(300);
  const body = await p.evaluate(()=>document.body.innerText);
  ok("it says what the register is for when empty", /expire|renew/i.test(body),
     body.trim() ? "" : "the page body was empty — it had not rendered");
}

console.log("\n=== an expiring document cannot be filed without a date ===");
{
  await openForm();
  await record({ type: "RERA_BROKER_CARD", expires: "" });
  const body = await p.evaluate(()=>document.body.innerText);
  ok("refused, and says why", /record the date/i.test(body),
     "a card with no expiry looks handled and is invisible to the sweep");
  const rows = await db.document.count({ where: { orgId: org.id } });
  ok("nothing was written", rows === 0, `${rows} row(s)`);
}

console.log("\n=== an agent records their own broker card ===");
let userId;
{
  await p.getByLabel("Expiry date").fill(inDays(30));
  await p.getByRole("button",{name:"Record it"}).click();
  await p.waitForTimeout(1600);

  const doc = await db.document.findFirst({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } });
  ok("a Document row exists", !!doc, doc ? doc.type : "nothing writes one");
  userId = doc?.ownerId;
  ok("it is the card, against a person", doc?.type === "RERA_BROKER_CARD" && doc?.ownerType === "USER");
  ok("no scan is required to record the date", doc?.storageRef === null);

  /**
   * Read out of the register rows, not out of the page.
   *
   * `document.body.innerText` contains the word "Rera broker card"
   * whenever the form is open, because it is an option in the type
   * picker — so the first version of this assertion passed on the run
   * where nothing had been written at all. Same shape as the
   * add-property test that matched another listing's price. Scoped to
   * `article[data-document]`, it can only pass on a row.
   */
  const rows = await p.evaluate(() =>
    [...document.querySelectorAll("article[data-document]")].map((a) => a.innerText));
  ok("the register shows it", rows.length === 1 && /rera broker card/i.test(rows[0] ?? ""),
     `${rows.length} row(s) rendered`);
  // The consequence, not the date. "30 days" is a fact; "this agent
  // cannot legally act on a transaction" is why anybody renews it.
  ok("and leads with what it stops", /cannot legally act/i.test(rows[0] ?? ""),
     "a row that only says a date is a row nobody acts on");
}

console.log("\n=== the nightly job finds it ===");
{
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error("CRON_SECRET not set — cannot run the real job"); process.exit(1); }
  // The real job over its real route. Reimplementing the filter here
  // would pass while `documents.expiry` itself found nothing.
  const res = await fetch("http://localhost:3000/api/cron/documents.expiry",
    { headers: { authorization: `Bearer ${secret}` } });
  const out = await res.json();
  ok("documents.expiry ran", res.status === 200, JSON.stringify(out).slice(0,120));
  ok("it found the card", out.documents >= 1, `${out.documents} document(s)`);
  ok("and told somebody", out.notifications >= 1, `${out.notifications} notification(s)`);

  const note = await db.notification.findFirst({
    where: { orgId: org.id, kind: "PERMIT_EXPIRING" }, orderBy: { sentAt: "desc" },
  });
  ok("the notification exists", !!note);
  ok("and deeplinks somewhere real", note?.deeplink?.startsWith("/documents"), note?.deeplink ?? "—");
}

console.log("\n=== a renewal supersedes rather than accumulates ===");
{
  await openForm();
  await record({ type: "RERA_BROKER_CARD", expires: inDays(720), reference: "BRN 99999" });

  const all = await db.document.findMany({ where: { orgId: org.id, type: "RERA_BROKER_CARD" } });
  ok("both cards are kept", all.length === 2, `${all.length} row(s) — the history is the record`);

  const live = all.filter((d) => d.supersededById === null);
  ok("exactly one is live", live.length === 1, `${live.length} live`);
  ok("and it is the new one", live[0]?.reference === "BRN 99999");

  // The point of superseding: the sweep's filter is
  // `supersededById: null`, so without it the expired card warns every
  // morning for ever and somebody turns the alarm off.
  await db.notification.deleteMany({ where: { orgId: org.id, kind: "PERMIT_EXPIRING" } });
  const res = await fetch("http://localhost:3000/api/cron/documents.expiry",
    { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const out = await res.json();
  ok("the renewed card no longer alarms", out.documents === 0,
     `${out.documents} document(s) still in the sweep`);
}

await b.close();
await db.$disconnect();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n" : "\nthe register writes, the job reads, the renewal closes the old one.\n");
process.exit(bad ? 1 : 0);
