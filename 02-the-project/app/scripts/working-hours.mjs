import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
import { PrismaClient } from "@prisma/client";

/**
 * The working week, and the empty list that meant two things.
 *
 * Nothing ever wrote a `WorkingHours` row, and `availableSlots()` skips
 * any day it has no row for — so every brokerage got `[]` from every
 * booking query and the screen said "Nothing free in the next week.
 * Widen the range or move something." A diary nobody had configured,
 * reported as one that was full.
 *
 * The order here is the order it actually happened in: start from no
 * hours, prove the booking screen now says the true thing, set the week,
 * prove times appear.
 *
 *     npm run dev
 *     npm run browser:working-hours
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};

const db = new PrismaClient({ datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}} });
const org = await db.organisation.findFirst({ where:{deletedAt:null}, select:{id:true} });
const saved = await db.workingHours.findMany({ where:{orgId:org.id} });

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([{name:"authjs.session-token",value:"dev-session-token-ask-history",
  domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}]);
const p=await ctx.newPage();

console.log("\n=== the state every brokerage was in ===");
await db.workingHours.deleteMany({ where: { orgId: org.id } });
await p.goto("http://localhost:3000/viewings/book",{waitUntil:"networkidle"});
await p.waitForFunction(()=>document.body.innerText.length>200,null,{timeout:25000});
await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
await p.waitForTimeout(1500);
{
  const body = await p.evaluate(()=>document.querySelector("main")?.innerText ?? "");
  ok("it does not claim the week is full", !/widen the range|move something/i.test(body),
     JSON.stringify(body.replace(/\s+/g," ").slice(0,80)));
  ok("it says the hours are unset", /no working hours are set/i.test(body));
  ok("and points at the screen that fixes it",
     await p.locator('a[href="/settings/hours"]').count() > 0);
}

console.log("\n=== setting the week ===");
await p.goto("http://localhost:3000/settings/hours",{waitUntil:"networkidle"});
await p.waitForFunction(()=>document.querySelectorAll('input[type=time]').length>0,null,{timeout:25000});
await p.waitForTimeout(600);
ok("all seven days are listed", await p.evaluate(()=>
  ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    .every(d=>document.body.innerText.includes(d))));
ok("it says the week is not set", /not set yet|days unset/i.test(
  await p.evaluate(()=>document.querySelector("h1")?.textContent ?? "")));
ok("every time field is labelled", await p.evaluate(()=>
  [...document.querySelectorAll("input[type=time]")].every(i=>!!i.getAttribute("aria-label"))));
ok("no input under 16px", await p.evaluate(()=>
  [...document.querySelectorAll("input[type=time]")].every(i=>parseFloat(getComputedStyle(i).fontSize)>=16)));

await p.getByRole("button",{name:"Save the week"}).click();
await p.waitForTimeout(2500);
ok("it saves", /saved/i.test(await p.evaluate(()=>document.body.innerText)),
   (await p.evaluate(()=>document.querySelector('[role=alert]')?.textContent ?? "")).slice(0,60));
{
  const rows = await db.workingHours.findMany({ where:{orgId:org.id}, orderBy:{dayOfWeek:"asc"} });
  ok("seven rows exist", rows.length === 7, `${rows.length}`);
  ok("Friday starts after prayers, not at nine",
     (rows.find(r=>r.dayOfWeek===5)?.startMin ?? 0) > 12*60,
     `${rows.find(r=>r.dayOfWeek===5)?.startMin} minutes`);
  ok("Saturday is open — the busiest viewing day here",
     rows.find(r=>r.dayOfWeek===6)?.closed === false);
}

console.log("\n=== and now a viewing can be booked ===");
await p.goto("http://localhost:3000/viewings/book",{waitUntil:"networkidle"});
await p.waitForTimeout(2500);
{
  const body = await p.evaluate(()=>document.querySelector("main")?.innerText ?? "");
  ok("the unset message is gone", !/no working hours are set/i.test(body));
  const times = await p.evaluate(()=>
    [...document.querySelectorAll("button")].map(b=>b.textContent?.trim() ?? "")
      .filter(t=>/^\d{1,2}[:.]\d{2}/.test(t) || /\d{1,2}(am|pm)/i.test(t)).length);
  ok("real times are offered", times > 0, `${times} slot button(s)`);
}

console.log("\n=== a day that ends before it starts is refused ===");
await p.goto("http://localhost:3000/settings/hours",{waitUntil:"networkidle"});
await p.waitForFunction(()=>document.querySelectorAll('input[type=time]').length>0,null,{timeout:25000});
await p.waitForTimeout(600);
// Monday: close at 08:00, open at 18:00.
await p.locator('input[aria-label="Monday opening time"]').fill("18:00");
await p.locator('input[aria-label="Monday closing time"]').fill("08:00");
await p.getByRole("button",{name:"Save the week"}).click();
await p.waitForTimeout(2000);
{
  const alert = await p.locator('[role="alert"]').first().innerText().catch(()=>"");
  ok("it explains why, naming the day", /monday/i.test(alert) && /ends before it starts/i.test(alert),
     JSON.stringify(alert.slice(0,90)));
  const mon = await db.workingHours.findFirst({ where:{orgId:org.id, dayOfWeek:1} });
  ok("and nothing was written", mon?.startMin === 9*60, `${mon?.startMin} minutes`);
}

// Put back whatever was there before.
await db.workingHours.deleteMany({ where: { orgId: org.id } });
if (saved.length) {
  await db.workingHours.createMany({ data: saved.map(({ id, ...r }) => r) });
}
await db.$disconnect();
await b.close();
console.log(bad?`\n${bad} PROBLEM(S)`:"\nPASS");
process.exitCode=bad?1:0;
