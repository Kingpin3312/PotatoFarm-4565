import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
import { PrismaClient } from "@prisma/client";

/**
 * Opening a due diligence file, both ways.
 *
 * Nothing in this product ever created a `KycRecord`, so the whole AML
 * module — the screening rules, the tipping-off separation, the
 * five-year retention — sat on a table with no way in.
 *
 * Two assertions carry this file:
 *
 *   - accepting an offer opens the file, in the same transaction as the
 *     deal, because UAE AML attaches the obligation to concluding the
 *     transaction and a deal without a file is the state the module
 *     exists to prevent;
 *   - an agent still cannot see *why* a screening was held. Telling a
 *     client, or an agent who will tell a client, that they matched a
 *     sanctions list is tipping off — an offence in its own right,
 *     separate from anything the client may have done.
 *
 *     npm run dev
 *     npm run browser:kyc-file
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};

const db = new PrismaClient({ datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}} });
const org = await db.organisation.findFirst({ where:{deletedAt:null}, select:{id:true} });

/**
 * Filtered in JS: this Prisma version rejects both `{ not: null }` and
 * `NOT: { leadId: null }` on a nullable relation scalar, and the error
 * ("Argument `not` must not be null") describes the filter rather than
 * the field. Ordered the way the inbox list orders, so the row this
 * test clicks is the lead it then reads out of the database.
 */
const convos = await db.conversation.findMany({
  where: { orgId: org.id }, select: { id: true, leadId: true },
  orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 50,
});
const convo = convos.find((c) => c.leadId);
if (!convo) { console.error("no conversation to test against"); process.exit(1); }
await db.kycRecord.deleteMany({ where: { leadId: convo.leadId } });

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([{name:"authjs.session-token",value:"dev-session-token-ask-history",
  domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}]);
const p=await ctx.newPage();

console.log("\n=== the panel is on the screen at all ===");
/**
 * Clicked, not linked: the inbox holds the selected conversation in
 * React state rather than the URL, so `?c=<id>` selects nothing and the
 * thread never mounts — which reads exactly like the panel being
 * missing.
 */
await p.goto("http://localhost:3000/inbox",{waitUntil:"networkidle"});
await p.waitForFunction(()=>document.querySelectorAll("button[aria-current]").length>0,
  null,{timeout:25000});
await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
await p.locator("button[aria-current]").first().click();
await p.waitForTimeout(2200);
{
  const body = await p.evaluate(()=>document.body.innerText);
  // Case-insensitive: the label is uppercased in CSS and `innerText`
  // returns what is rendered. Fourth time in this codebase.
  ok("the identity section is rendered", /identity/i.test(body),
     "KycPanel was built and mounted by nothing");
  ok("it explains whose obligation this is", /DNFBP|obligation/i.test(body));
}

console.log("\n=== an agent can start one early ===");
{
  const start = p.getByRole("button",{name:"Start one now"}).first();
  ok("there is a way to start one", await start.isVisible().catch(()=>false));
  await start.click();
  await p.waitForTimeout(2500);
  const rec = await db.kycRecord.findUnique({
    where: { leadId: convo.leadId }, select: { status: true, riskRating: true },
  });
  ok("a file exists", !!rec, rec ? rec.status : "none");
  ok("it starts NOT_STARTED — nothing has been checked", rec?.status === "NOT_STARTED", rec?.status);
  ok("and UNASSESSED — a risk rating nobody made is worse than none",
     rec?.riskRating === "UNASSESSED", rec?.riskRating);
  ok("the panel now shows what is outstanding",
     /passport|emirates/i.test(await p.evaluate(()=>document.body.innerText)));
}

console.log("\n=== an accepted offer opens one on its own ===");
{
  const listing = await db.listing.findFirst({ where: { orgId: org.id, deletedAt: null }, select: { id: true } });
  const lead = await db.lead.create({
    data: { orgId: org.id, phone: `+9715${Date.now().toString().slice(-8)}`, name: "Offer Test", status: "NEW" },
    select: { id: true },
  });
  const offer = await db.offer.create({
    data: { orgId: org.id, listingId: listing.id, leadId: lead.id,
            amountFils: 250000000n, status: "SUBMITTED", financing: "CASH" },
    select: { id: true },
  });

  ok("no file before the offer is accepted",
     (await db.kycRecord.count({ where: { leadId: lead.id } })) === 0);

  const res = await fetch("http://localhost:3000/api/trpc/offers.accept?batch=1", {
    method: "POST",
    headers: { "content-type": "application/json",
               cookie: "authjs.session-token=dev-session-token-ask-history" },
    body: JSON.stringify({ 0: { json: { offerId: offer.id } } }),
  });
  const text = await res.text();
  ok("the offer was accepted", res.status === 200 && !text.includes('"error"'),
     res.status + " " + text.slice(0, 80));

  const rec = await db.kycRecord.findUnique({ where: { leadId: lead.id }, select: { status: true } });
  ok("accepting it opened the file", !!rec, rec ? rec.status : "none");
  const deal = await db.deal.findFirst({ where: { leadId: lead.id }, select: { id: true } });
  ok("alongside the deal, from the same transaction", !!deal);

  if (deal) await db.deal.deleteMany({ where: { leadId: lead.id } });
  await db.kycRecord.deleteMany({ where: { leadId: lead.id } });
  await db.offerResponse.deleteMany({ where: { offerId: offer.id } });
  await db.offer.deleteMany({ where: { leadId: lead.id } });
  await db.lead.delete({ where: { id: lead.id } });
}

console.log("\n=== the agent still cannot see a screening reason ===");
{
  const rec = await db.kycRecord.findUnique({ where: { leadId: convo.leadId }, select: { id: true } });
  // The real column names — `nameChecked`, `lists` (an array) and the
  // detail as JSON in `matches`. Written from memory the first time as
  // listName/matchedName/score, and Prisma refused the lot.
  await db.screening.create({
    data: { orgId: org.id, kycId: rec.id, provider: "manual", result: "POSSIBLE_MATCH",
            nameChecked: "A Sanctioned Person", lists: ["UN Consolidated List"],
            matches: [{ name: "A Sanctioned Person", score: 91 }] },
  });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForFunction(()=>document.querySelectorAll("button[aria-current]").length>0,null,{timeout:25000});
  await p.locator("button[aria-current]").first().click();
  await p.waitForTimeout(2500);
  const body = await p.evaluate(()=>document.body.innerText);

  /**
   * Asserted first, and asserted positively.
   *
   * The three checks below are all "X is absent", and every one of them
   * passes on a blank screen. This is the assertion that proves the
   * panel is rendering the hold at all — without it the tipping-off
   * checks are the "passes by seeing nothing" failure this whole
   * codebase is built to catch.
   */
  ok("the hold is shown to the agent", /with compliance/i.test(body),
     JSON.stringify((body.match(/This file is[^\n]*/) ?? ["not found"])[0].slice(0, 70)));
  ok("the list is not named", !/UN Consolidated/i.test(body));
  ok("the matched name is not shown", !/A Sanctioned Person/.test(body));
  ok("the score is not shown", !/\b91\b/.test(body));
  await db.screening.deleteMany({ where: { kycId: rec.id } });
}

await db.kycRecord.deleteMany({ where: { leadId: convo.leadId } });
await db.$disconnect();
await b.close();
console.log(bad?`\n${bad} PROBLEM(S)`:"\nPASS");
process.exitCode=bad?1:0;
