import fs from "node:fs";
import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * Setting a commission plan, and the two things that make it safe.
 *
 * Nothing in this product ever wrote a `CommissionPlan`. `myTier` read
 * one, found none for every brokerage that has ever existed, and
 * returned null — so the line telling an agent what share they are on
 * never appeared, and the tiering engine had never run against a real
 * row.
 *
 * The assertions that matter are not "the form saves". They are:
 *
 *   - the agent's own screen now shows the right band, which means the
 *     thresholds survived the JSON boundary as fils rather than being
 *     cast into something that happens to compare;
 *   - changing a plan supersedes rather than overwrites, because
 *     restating what somebody was owed for work already done is how a
 *     commission dispute starts.
 *
 *     npm run dev
 *     npm run browser:commission-plan
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};

const db = new PrismaClient({ datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}} });
const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([...sessionCookies("dev-session-token-ask-history")]);
const p=await ctx.newPage();

// Start from nothing, so "no plan" is the state under test rather than
// whatever a previous run left behind.
const sess = await db.session.findUnique({
  where: { sessionToken: "dev-session-token-ask-history" },
  select: { userId: true, user: { select: { name: true, email: true } } },
});
await db.commissionPlan.deleteMany({ where: { userId: sess.userId } });
/**
 * The signed-in user's own row, by name.
 *
 * The first version clicked whichever row came first and then asserted
 * against /commission, which shows *your* band — so it set a plan for a
 * colleague and reported the agent's screen as broken. A brokerage has
 * more than one member and a test that assumes otherwise is testing a
 * brokerage nobody has.
 */
const ME = sess.user.name ?? sess.user.email;
const myRow = (label) => p.locator(`div:has(> div > span:text-is(${JSON.stringify(ME)}))`)
  .locator(`button:text-is(${JSON.stringify(label)})`).first();

await p.goto("http://localhost:3000/settings/commission",{waitUntil:"networkidle"});
await p.waitForFunction(()=>document.body.innerText.length>200,null,{timeout:25000});
await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
await p.waitForTimeout(800);

console.log("\n=== the gap is the headline ===");
const head = await p.evaluate(()=>document.querySelector("h1")?.textContent?.trim() ?? "");
ok("it counts who is on no plan", /on no plan/i.test(head), JSON.stringify(head));
const gapBefore = Number(head.match(/(\d+) on no plan/)?.[1] ?? -1);
ok("and says so on the row", /No plan/i.test(await p.evaluate(()=>document.body.innerText)));

console.log("\n=== setting one ===");
ok(`the signed-in user is on the list`, await p.evaluate((n)=>document.body.innerText.includes(n), ME), ME);
await myRow("Set a plan").click();
await p.waitForTimeout(400);
ok("both bands are labelled for a screen reader", await p.evaluate(()=>{
  const ins=[...document.querySelectorAll("form input")];
  return ins.length>0 && ins.every(i=>!!i.getAttribute("aria-label"));
}));
ok("no input under 16px", await p.evaluate(()=>
  [...document.querySelectorAll("form input")].every(i=>parseFloat(getComputedStyle(i).fontSize)>=16)));

// Typed the way a person types it.
const inputs = p.locator("form input");
await inputs.nth(0).fill("0");
await inputs.nth(1).fill("50");
await inputs.nth(2).fill("1,000,000");
await inputs.nth(3).fill("60");
await p.getByRole("button",{name:"Save"}).first().click();
await p.waitForTimeout(2500);

const body = await p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
ok("the plan is listed", /from 0 · 50%/.test(body), (body.match(/from [^·]+· \d+%/g)??[]).join(" | "));
ok("the second band survived the commas", /AED 1m · 60%/.test(body),
   (body.match(/AED 1m · \d+%/)??["missing"])[0]);
// The count drops by one, not to zero: this brokerage has five members
// and only one of them has just been given a plan. Asserting "no gap"
// was asserting a one-person company.
{
  const now = Number((await p.evaluate(()=>document.querySelector("h1")?.textContent ?? ""))
    .match(/(\d+) on no plan/)?.[1] ?? -1);
  ok("one fewer person is on no plan", now === gapBefore - 1, `${gapBefore} -> ${now}`);
}

console.log("\n=== the thresholds are real fils, not a lucky cast ===");
{
  const plan = await db.commissionPlan.findFirst({
    where: { userId: sess.userId, effectiveTo: null }, select: { tiers: true },
  });
  ok("stored as decimal strings", Array.isArray(plan?.tiers)
     && plan.tiers.every(t => typeof t.fromFils === "string"), JSON.stringify(plan?.tiers));
  ok("one million dirhams is a hundred million fils",
     plan?.tiers?.some(t => t.fromFils === "100000000"),
     plan?.tiers?.map(t=>t.fromFils).join(", "));
}

console.log("\n=== the agent's own screen agrees ===");
await p.goto("http://localhost:3000/commission",{waitUntil:"networkidle"});
await p.waitForTimeout(1500);
/**
 * Case-insensitive, and that is not defensiveness.
 *
 * The line is uppercased in CSS and `innerText` returns what is
 * *rendered*, so it reads "YOUR SHARE IS 50%". This is the third time in
 * this codebase a check has been written against the source casing and
 * failed against the screen — the palette's group headings and the
 * channels tag were the other two. Any assertion on `innerText` in a
 * design that uses `uppercase` should assume it.
 */
const own = await p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
ok("their band is shown", /your share is \d+%/i.test(own),
   (own.match(/your share is \d+%/i)??["missing"])[0]);

console.log("\n=== changing it supersedes, never overwrites ===");
await p.goto("http://localhost:3000/settings/commission",{waitUntil:"networkidle"});
await p.waitForTimeout(1200);
await myRow("Change").click();
await p.waitForTimeout(400);
await p.locator("form input").nth(1).fill("55");
await p.getByRole("button",{name:"Save"}).first().click();
await p.waitForTimeout(2500);
{
  const all = await db.commissionPlan.findMany({
    where: { userId: sess.userId }, orderBy: { effectiveFrom: "asc" },
    select: { effectiveTo: true, tiers: true },
  });
  ok("there are now two plans on record", all.length === 2, `${all.length}`);
  ok("the old one is closed, not deleted", all[0]?.effectiveTo !== null,
     all[0]?.effectiveTo?.toISOString() ?? "still open");
  ok("and it still carries what it paid", all[0]?.tiers?.[0]?.shareBp === 5000,
     `old first band ${all[0]?.tiers?.[0]?.shareBp}bp`);
  ok("exactly one plan is in force", all.filter(x=>x.effectiveTo===null).length === 1);
}

console.log("\n=== a plan that does not start at zero is refused ===");
await myRow("Change").click();
await p.waitForTimeout(400);
await p.locator("form input").nth(0).fill("500000");
await p.getByRole("button",{name:"Save"}).first().click();
await p.waitForTimeout(2000);
const alert = await p.locator('form [role="alert"]').first().innerText().catch(()=>"");
ok("it explains why, in English", /must start at 0/i.test(alert), JSON.stringify(alert.slice(0,80)));

await db.commissionPlan.deleteMany({ where: { userId: sess.userId } });
await db.$disconnect();
await b.close();
console.log(bad?`\n${bad} PROBLEM(S)`:"\nPASS");
process.exitCode=bad?1:0;
