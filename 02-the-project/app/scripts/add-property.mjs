import fs from "node:fs";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

/**
 * Adding a property, through the browser, against a real database.
 *
 * The point is not that the dialog opens. It is that a row lands, with
 * the price in the right unit — this codebase has already had a bug
 * where two money units met and a buyer would have been shown a
 * property at a hundred times their budget, so the assertion that
 * matters is "2,400,000 typed by a human comes back as AED 2,400,000",
 * not "the mutation returned 200".
 *
 *     npm run dev
 *     npm run browser:add-property
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};

const REF = `TEST-${Date.now().toString(36).toUpperCase()}`;
const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([{name:"authjs.session-token",value:"dev-session-token-ask-history",
  domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}]);
const p=await ctx.newPage();
await p.goto("http://localhost:3000/listings",{waitUntil:"networkidle"});
await p.waitForFunction(()=>document.body.innerText.length>300,null,{timeout:25000});
await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
await p.waitForTimeout(600);

console.log("\n=== the way in ===");
const add = p.getByRole("button",{name:"Add a property"}).first();
ok("there is a button to add one", await add.isVisible());
await add.click();
await p.waitForTimeout(400);
ok("it opens a real modal",
   await p.evaluate(()=>document.querySelector("dialog[open]")?.matches(":modal") ?? false));
ok("every field is labelled", await p.evaluate(()=>{
  const d=document.querySelector("dialog[open]");
  return [...d.querySelectorAll("input,select")].every(el=>
    !!el.closest("label") || !!el.getAttribute("aria-label"));
}));
ok("no input under 16px — iOS would zoom the page", await p.evaluate(()=>{
  const d=document.querySelector("dialog[open]");
  return [...d.querySelectorAll("input,select")].every(el=>
    parseFloat(getComputedStyle(el).fontSize) >= 16);
}));

console.log("\n=== only two fields are required ===");
ok("reference and name, nothing else", await p.evaluate(()=>{
  const d=document.querySelector("dialog[open]");
  return [...d.querySelectorAll("input")].filter(i=>i.required).map(i=>i.name).sort().join(",");
}) === "reference,title");

console.log("\n=== it writes a row ===");
await p.fill('dialog[open] input[name=reference]', REF);
await p.fill('dialog[open] input[name=title]', "Test 2-bed, Marina Gate");
await p.fill('dialog[open] input[name=community]', "Dubai Marina");
await p.fill('dialog[open] input[name=bedrooms]', "2");
// Typed the way a person types it, commas and all.
await p.fill('dialog[open] input[name=priceAed]', "2,400,000");
await p.click('dialog[open] button[type=submit]');
await p.waitForFunction(()=>!document.querySelector("dialog[open]"),null,{timeout:15000}).catch(()=>{});
ok("the dialog closes on success", !(await p.evaluate(()=>!!document.querySelector("dialog[open]"))));

await p.waitForFunction((ref)=>!!document.querySelector(`[data-listing="${ref}"]`), REF,
  {timeout:15000}).catch(()=>{});
const row = await p.evaluate((ref)=>
  document.querySelector(`[data-listing="${ref}"]`)?.innerText.replace(/\s+/g," ") ?? "", REF);
ok("the property appears in the list without a reload", !!row, REF);
/**
 * Read off *this* row, not off the page.
 *
 * The first version tested the whole document for "2,400,000" and
 * passed with the comma stripping deliberately broken — it was matching
 * the price of a listing left behind by an earlier run. A check that
 * can find its expected value somewhere else is not checking anything.
 */
ok("the price survived the unit conversion", /2,400,000/.test(row), JSON.stringify(row.slice(0,90)));

console.log("\n=== the reference is unique, and says so in English ===");
await p.getByRole("button",{name:"Add a property"}).first().click();
await p.waitForTimeout(400);
await p.fill('dialog[open] input[name=reference]', REF);
await p.fill('dialog[open] input[name=title]', "A duplicate");
await p.click('dialog[open] button[type=submit]');
await p.waitForTimeout(2500);
const alert = await p.locator('dialog[open] [role="alert"]').first().innerText().catch(()=>"");
ok("the clash is explained, not a 500", /already used/i.test(alert), JSON.stringify(alert.slice(0,80)));
ok("and the dialog stays open so the work is not lost",
   await p.evaluate(()=>!!document.querySelector("dialog[open]")));

await b.close();
console.log(bad?`\n${bad} PROBLEM(S)`:"\nPASS");
process.exitCode=bad?1:0;
