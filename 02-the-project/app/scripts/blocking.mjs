import fs from "node:fs";
import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * A lapsed broker card stops a deal, and nothing else does.
 *
 * `expiry.ts` has carried `blocking: true` on three document types since
 * it was written, and its README recorded honestly that nothing acted on
 * it. A warning sixty days out that is then ignored has achieved
 * nothing.
 *
 * The assertion that matters most here is the **negative** one, and it
 * is deliberately first: a brokerage that has recorded no documents at
 * all is not stopped from working. Blocking on a missing row would have
 * shut down every existing customer on the morning this shipped, and it
 * would be wrong on the facts as well — a missing row is not evidence
 * that a card has lapsed, it is evidence of nothing.
 *
 * Then, in order:
 *
 *   - a *valid* card does not block, so the block is about the date and
 *     not about the register existing;
 *   - an expired card refuses `Done`, names whose card and what it
 *     costs, and says where to clear it;
 *   - "stuck" still works, because somebody telling the truth about a
 *     transaction they cannot move is exactly what should survive;
 *   - recording the renewal clears it, in the same session.
 *
 *     npm run dev
 *     npm run check:blocking
 */
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
const org = await db.organisation.findFirst({ where:{deletedAt:null}, select:{id:true,name:true} });
if (!org) { console.error("no organisation to test against"); process.exit(1); }

/**
 * A deal with a lead, so the assigned agent is a real person.
 *
 * The step mutation checks the actor and the agent the deal belongs to,
 * and a deal with no lead would exercise only half of that.
 */
const deals = await db.deal.findMany({
  where: { orgId: org.id, stage: { notIn: ["COMPLETED","COLLAPSED"] } },
  select: { id: true, reference: true, leadId: true, contractualCompletionAt: true },
  take: 50,
});
const deal = deals.find((d) => d.leadId && d.contractualCompletionAt);
if (!deal) { console.error("no live deal with a lead and a completion date"); process.exit(1); }

const lead = await db.lead.findFirst({ where:{id:deal.leadId}, select:{assignedToId:true} });
// The signed-in user for these checks. Their card is the one that has to
// lapse for the block to be about them rather than about somebody else.
const me = await db.user.findFirst({ where:{email:"omar@marinabay.ae"}, select:{id:true,name:true} })
  ?? await db.user.findFirst({ select:{id:true,name:true} });

await db.document.deleteMany({ where: { orgId: org.id } });

function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const p=await ctx.newPage();

/** Open the deal and expand it, returning what the detail panel says. */
async function openDeal() {
  await p.goto("http://localhost:3000/deals",{waitUntil:"networkidle"});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  // By id, not by label: the row shows the counterparty's name when
  // there is one, so the reference is not always on screen.
  const row = p.locator(`[data-deal="${deal.id}"]`);
  if (await row.count() === 0) {
    console.error(`deal ${deal.reference} is not on the board — it may be filtered out`);
    process.exit(1);
  }
  await row.click();
  await p.waitForTimeout(1800);
  return {
    blocked: await p.locator("[data-blocked]").count() > 0,
    banner: await p.locator("[data-blocked]").innerText().catch(()=>""),
    doneEnabled: await p.getByRole("button",{name:"Done"}).first().isEnabled().catch(()=>false),
    stuckThere: await p.getByRole("button",{name:"Stuck"}).first().count() > 0,
  };
}

const card = (expiresAt, ownerId) => db.document.create({ data: {
  orgId: org.id, ownerType: "USER", ownerId, type: "RERA_BROKER_CARD",
  reference: "BRN 12345", expiresAt, uploadedById: ownerId,
}});
const days = (n) => new Date(Date.now() + n*86_400_000);

console.log("\n=== a brokerage with no documents is not stopped ===");
{
  const s = await openDeal();
  ok("nothing is blocked", !s.blocked,
     "a missing row is not evidence a card has lapsed — it is evidence of nothing");
  ok("Done is available", s.doneEnabled);
}

console.log("\n=== a card that has not expired does not block ===");
{
  const d = await card(days(45), me.id);
  const s = await openDeal();
  ok("still not blocked", !s.blocked, "the block is about the date, not about the register existing");
  ok("Done is available", s.doneEnabled);
  await db.document.delete({ where: { id: d.id } });
}

console.log("\n=== an expired card stops the deal ===");
{
  await card(days(-9), me.id);
  const s = await openDeal();
  ok("the deal is blocked", s.blocked);
  ok("it names whose card", new RegExp(me.name.split(" ")[0],"i").test(s.banner), s.banner.slice(0,90));
  ok("and what it costs", /cannot legally act/i.test(s.banner));
  ok("and where to clear it", /documents/i.test(s.banner));
  ok("Done is disabled", !s.doneEnabled);
  ok("Stuck still works", s.stuckThere,
     "telling the truth about a stalled transaction must survive the block");
}

console.log("\n=== the server refuses it, not only the button ===");
{
  // The button is disabled, so this goes at the API directly — a
  // disabled button is a courtesy and the mutation is the control.
  /**
   * A stage this deal has not already completed.
   *
   * The first version counted completed `MOU_SIGNED` milestones and
   * asserted zero — which failed against seed data that had already
   * signed one, reporting the block broken when it had worked. An
   * absolute count answers "is this stage done", not "did that call
   * write it", and those are different questions.
   */
  const done = new Set((await db.dealMilestone.findMany({
    where: { dealId: deal.id, completedAt: { not: null } }, select: { stage: true },
  })).map((m) => m.stage));
  const stage = ["MOU_SIGNED","DEPOSIT_PAID","NOC_APPLIED","NOC_ISSUED","TRANSFER_BOOKED"]
    .find((s) => !done.has(s));
  if (!stage) { console.error("this deal has completed every step"); process.exit(1); }

  const res = await p.evaluate(async ({ dealId, stage }) => {
    const r = await fetch("/api/trpc/deals.step?batch=1", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: { json: { dealId, stage, done: true } } }),
    });
    return { status: r.status, body: (await r.text()).slice(0, 400) };
  }, { dealId: deal.id, stage });

  ok("refused over the API", /FORBIDDEN|expired/i.test(res.body), `status ${res.status}`);
  ok("and the milestone was not written", (await db.dealMilestone.count({
    where: { dealId: deal.id, stage, completedAt: { not: null } },
  })) === 0, stage);

  const refusal = await db.auditLog.findFirst({
    where: { orgId: org.id, action: "deal.step.refused" }, orderBy: { createdAt: "desc" },
  });
  ok("and it is on the audit log", !!refusal,
     "'we stopped them and they stopped' is the only evidence the control worked");
}

console.log("\n=== recording the renewal clears it ===");
{
  await p.goto("http://localhost:3000/documents",{waitUntil:"networkidle"});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await p.getByRole("button",{name:"Record one"}).click();
  await p.waitForTimeout(400);
  const selects = p.locator("form select");
  await selects.nth(0).selectOption("USER");
  await selects.nth(1).selectOption(me.id);
  await selects.nth(2).selectOption("RERA_BROKER_CARD");
  await p.getByLabel("Expiry date").fill(days(400).toISOString().slice(0,10));
  await p.getByRole("button",{name:"Record it"}).click();
  await p.waitForTimeout(1600);

  const live = await db.document.count({
    where: { orgId: org.id, type: "RERA_BROKER_CARD", supersededById: null },
  });
  ok("one live card", live === 1, `${live}`);

  const s = await openDeal();
  ok("the deal moves again", !s.blocked);
  ok("Done is available", s.doneEnabled);
}

await db.document.deleteMany({ where: { orgId: org.id } });
await b.close();
await db.$disconnect();
console.log(bad ? "\n" + bad + " FAILED:\n  - " + failures.join("\n  - ") + "\n" : "\nnothing blocks on silence; a lapsed card blocks until it is renewed.\n");
process.exit(bad ? 1 : 0);
