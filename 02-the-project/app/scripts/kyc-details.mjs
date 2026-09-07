import fs from "node:fs";
import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * A due diligence file can record who the person actually is.
 *
 * `aml.updateFile` writes the legal name, nationality, trade licence,
 * identity document, **source of funds** and **source of wealth** — and
 * no screen called it. A file could be opened, could collect a passport,
 * and could never say where the money came from, which is the question a
 * risk-based approach is built around and the first thing an inspector
 * reads.
 *
 * The assertion that matters most is the last one: filling this in must
 * move a file from NOT_STARTED to COLLECTING and **no further**.
 * PENDING_REVIEW comes from a document arriving and APPROVED is a
 * compliance decision, so an agent typing a passport number must not be
 * able to walk a file towards approved. That is the separation the
 * compliance appointment exists to create, and it is enforced in
 * `updateFile` rather than by the form.
 *
 *     npm run build && npm run start
 *     npm run browser:kyc-details
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};

const db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}}});
const org=await db.organisation.findFirst({where:{deletedAt:null},select:{id:true}});
const kyc=await db.kycRecord.findFirst({
  where:{orgId:org.id,status:"NOT_STARTED"},
  select:{id:true,leadId:true,status:true},
});
if(!kyc){console.error("no NOT_STARTED file to work with — run npm run db:seed");process.exit(1);}
const convo=await db.conversation.findFirst({where:{leadId:kyc.leadId},select:{id:true}});
if(!convo){console.error("that lead has no conversation to open");process.exit(1);}

console.log("\nA file can record who the person is\n");

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:1000}});
await ctx.addCookies(sessionCookies("dev-session-token-ask-history"));
const p=await ctx.newPage();
await p.goto(`http://localhost:3000/inbox/${convo.id}`,{waitUntil:"networkidle"}).catch(()=>{});
await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
await p.waitForTimeout(1600);

const body=()=>p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
ok("the panel names what is missing rather than looking complete",
   /has no nationality|no source of funds|no an identity document/i.test(await body()),
   "an empty file that says nothing is a file nobody fills in");

const start=p.getByRole("button",{name:/Record their details|Edit details/});
ok("there is a way to record them", await start.isVisible().catch(()=>false));
await start.click();
await p.waitForTimeout(500);

await p.getByLabel("Nationality").fill("British");
await p.getByLabel("Identity document").selectOption("PASSPORT");
await p.getByLabel("Document number").fill("P1234567");
await p.getByLabel("Where the money for this purchase came from")
       .fill("Sale of a property in London, completed March");
await p.getByLabel("How they made their money generally")
       .fill("Owns a logistics business in Jebel Ali");
await p.getByRole("button",{name:"Save"}).click();
await p.waitForTimeout(2200);

const after=await db.kycRecord.findUnique({
  where:{id:kyc.id},
  select:{nationality:true,idType:true,idNumber:true,sourceOfFunds:true,sourceOfWealth:true,status:true},
});
ok("the nationality is on the file", after?.nationality==="British", after?.nationality ?? "blank");
ok("so is the identity document", after?.idType==="PASSPORT" && after?.idNumber==="P1234567",
   `${after?.idType} ${after?.idNumber}`);
ok("and the source of funds, which is the point of the exercise",
   (after?.sourceOfFunds ?? "").includes("London"), after?.sourceOfFunds ?? "blank");
ok("and the source of wealth", (after?.sourceOfWealth ?? "").includes("Jebel Ali"),
   after?.sourceOfWealth ?? "blank");

/**
 * The separation, which is the assertion this file exists for.
 */
ok("the file moved to COLLECTING", after?.status==="COLLECTING", after?.status);
ok("and an agent cannot walk it any further than that",
   after?.status!=="PENDING_REVIEW" && after?.status!=="APPROVED",
   "approving is a compliance decision, not a side effect of typing");

const audited=await db.auditLog.count({
  where:{orgId:org.id,action:"aml.file_updated"},
});
ok("the change is on the audit log", audited>0, `${audited} entr(y|ies)`);

await p.waitForTimeout(400);
ok("and the panel now shows the person rather than the gap",
   /British/.test(await body()));

await b.close();
// Put the file back as the seed leaves it.
await db.kycRecord.update({where:{id:kyc.id},data:{
  nationality:null,idType:null,idNumber:null,idExpiresAt:null,
  sourceOfFunds:null,sourceOfWealth:null,status:"NOT_STARTED",
}});
await db.$disconnect();
console.log(bad?`\n  ${bad} failure(s)\n`:"\n  the file records who they are, and stops where a person has to decide.\n");
process.exitCode=bad?1:0;
