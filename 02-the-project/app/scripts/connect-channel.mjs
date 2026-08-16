import fs from "node:fs";
import pw from "playwright";

/**
 * Connecting a WhatsApp number, end to end.
 *
 * The assertion that matters is not that the form submits — it is that
 * the screen tells the truth about a half-connected channel. Inbound
 * works the moment the row exists; sending needs a token that is
 * deliberately not stored in the database. A screen that showed those
 * two states as one would send an agent to type a reply that silently
 * never goes.
 *
 *     npm run dev
 *     npm run browser:connect-channel
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};

const NUM = `TESTNUM${Date.now()}`;
const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([{name:"authjs.session-token",value:"dev-session-token-ask-history",
  domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}]);
const p=await ctx.newPage();
await p.goto("http://localhost:3000/settings/channels",{waitUntil:"networkidle"});
await p.waitForFunction(()=>document.body.innerText.length>200,null,{timeout:25000});
await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
await p.waitForTimeout(800);

console.log("\n=== connecting ===");
const btn = p.getByRole("button",{name:"Connect a channel"}).first();
ok("there is a way to connect one", await btn.isVisible());
await btn.click();
await p.waitForTimeout(400);
ok("it opens a real modal",
   await p.evaluate(()=>document.querySelector("dialog[open]")?.matches(":modal") ?? false));
ok("no input under 16px", await p.evaluate(()=>{
  const d=document.querySelector("dialog[open]");
  return [...d.querySelectorAll("input,select")].every(el=>parseFloat(getComputedStyle(el).fontSize)>=16);
}));
ok("the identifier field is named the way Meta names it",
   /Phone number ID/i.test(await p.evaluate(()=>document.querySelector("dialog[open]").innerText)));
ok("and it never asks for the access token",
   !/access token/i.test(await p.evaluate(()=>
     [...document.querySelectorAll("dialog[open] label")].map(l=>l.innerText).join(" "))));

await p.fill('dialog[open] input[name=label]', "Test sales number");
await p.fill('dialog[open] input[name=identifier]', NUM);
await p.click('dialog[open] button[type=submit]');
await p.waitForFunction(()=>/is connected/i.test(document.querySelector("dialog[open]")?.innerText ?? ""),
  null,{timeout:15000}).catch(()=>{});

console.log("\n=== it says what is still needed ===");
const after = await p.evaluate(()=>document.querySelector("dialog[open]")?.innerText ?? "");
ok("it confirms inbound works now", /incoming messages will now reach/i.test(after), JSON.stringify(after.slice(0,70)));
ok("and names the exact environment variable", /SECRET_wa_[0-9a-f]+=/.test(after),
   (after.match(/SECRET_\S+/) ?? ["none"])[0]);
await p.click('dialog[open] button:has-text("Done")');
await p.waitForTimeout(1200);

console.log("\n=== the row is honest about what it can do ===");
const body = await p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
ok("the channel is listed", body.includes("Test sales number"));
ok("marked as receiving but not sending, in words", /Receives only/i.test(body));
// "All connected" is the specific wrong answer here: the number
// receives and cannot reply, and an owner reading that heading would
// trust the inbox to work in both directions.
ok("the heading does not claim it is fully connected", !/All connected/.test(body),
   (body.match(/(Nothing connected|All connected|\d+ gone quiet|\d+ can.t reply yet)/) ?? ["?"])[0]);

console.log("\n=== another brokerage cannot claim the same number ===");
/**
 * The security assertion. Inbound routing searches every tenant for an
 * active channel with this identifier, so two brokerages holding the
 * same number means one receives the other's customer messages. Refused
 * by a partial unique index rather than by application code, because two
 * requests can both pass a check-then-insert.
 */
await p.getByRole("button",{name:"Connect a channel"}).first().click();
await p.waitForTimeout(400);
await p.fill('dialog[open] input[name=label]', "Duplicate attempt");
await p.fill('dialog[open] input[name=identifier]', NUM);
await p.click('dialog[open] button[type=submit]');
await p.waitForTimeout(2500);
const err = await p.locator('dialog[open] [role="alert"]').first().innerText().catch(()=>"");
// Same brokerage twice, so this exercises the per-org branch. The
// cross-tenant one — the case that actually matters, where another
// brokerage would start receiving these messages — is enforced by a
// partial unique index and proved directly against the database,
// because it needs two organisations and this session has one.
ok("it is refused", /already connected/i.test(err), JSON.stringify(err.slice(0,90)));
ok("and does not reveal who holds it", !/brokerage|org|company/i.test(err.replace(/brokerages?/i,"")) || !/[A-Z][a-z]+ (Bay|Properties|Brokerage)/.test(err), err.slice(0,60));

await b.close();
console.log(bad?`\n${bad} PROBLEM(S)`:"\nPASS");
process.exitCode=bad?1:0;
