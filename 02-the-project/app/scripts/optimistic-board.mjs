import fs from "node:fs";
import pw from "playwright";

/**
 * The pipeline board's optimistic move, both halves.
 *
 * HTML5 drag and drop is dispatched by hand rather than with Playwright's
 * `dragTo`. `dragTo` moves the mouse, and a real mouse drag in Chromium
 * is driven by the browser's own drag controller — which does not start
 * from synthesised mouse input, so the React `onDragStart` never fires
 * and the test passes by doing nothing at all. Building a `DataTransfer`
 * and firing `dragstart`/`dragover`/`drop` is what the handlers actually
 * listen for.
 *
 *     npm run dev
 *     npm run browser:optimistic-board
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};
const b=await pw.chromium.launch({executablePath:cp()});
const COOKIE={name:"authjs.session-token",value:"dev-session-token-ask-history",
  domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"};

async function board(delayMs, failIt) {
  const ctx=await b.newContext({viewport:{width:1400,height:900}});
  await ctx.addCookies([COOKIE]);
  const p=await ctx.newPage();
  await p.route("**/api/trpc/pipeline.move**", async (route) => {
    await new Promise(r=>setTimeout(r, delayMs));
    if (failIt) return route.fulfill({status:500,contentType:"application/json",
      body: JSON.stringify([{error:{json:{message:"Network is unavailable.",code:-32603,
        data:{code:"INTERNAL_SERVER_ERROR",httpStatus:500}}}}])});
    return route.continue();
  });
  await p.goto("http://localhost:3000/pipeline",{waitUntil:"networkidle"});
  await p.waitForFunction(()=>document.querySelectorAll("[data-lead]").length>0,null,{timeout:25000});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await p.waitForTimeout(700);
  return {ctx,p};
}

/** Which column each card is in, by stage name. */
const layout = (p) => p.evaluate(()=>{
  const out={};
  for (const sec of document.querySelectorAll("section[aria-label]")) {
    out[sec.getAttribute("aria-label")] =
      [...sec.querySelectorAll("[data-lead]")].map(el=>el.getAttribute("data-lead"));
  }
  return out;
});

/**
 * Drop `leadId` into the section labelled `stage`, at the end.
 *
 * The two halves are separate `evaluate` calls with a wait between them,
 * and that is not padding. `onDragStart` sets React state; `onDrop`
 * reads it and returns early when it is null. Fired in one synchronous
 * block React has not committed the update yet, so the drop is ignored
 * and the test observes a card that never moves — which reads exactly
 * like a broken optimistic update rather than a broken test. It cost me
 * one wrong diagnosis before I noticed the mutation was never sent at
 * all.
 *
 * `clientY` is deliberately below every card so the drop lands at the
 * bottom of the column, which is the unambiguous position to assert on.
 */
async function drop(p, leadId, stage) {
  await p.evaluate((leadId)=>{
    const card=document.querySelector(`[data-lead="${leadId}"]`);
    window.__dt = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:window.__dt}));
  }, leadId);
  await p.waitForTimeout(120);
  await p.evaluate((stage)=>{
    const target=[...document.querySelectorAll("section[aria-label]")]
      .find(s=>s.getAttribute("aria-label")===stage);
    for (const type of ["dragover","drop"]) {
      target.dispatchEvent(new DragEvent(type,{bubbles:true,dataTransfer:window.__dt,
        clientX:0, clientY:99999}));
    }
  }, stage);
}

const stagesOf = (l) => Object.keys(l);
const findCard = (l) => {
  for (const [stage, ids] of Object.entries(l)) if (ids.length) return {stage, id: ids[0]};
  return null;
};

console.log("\n=== the fast path: the card moves on drop, not on the reply ===");
{
  const {ctx,p}=await board(2500,false);
  const before=await layout(p);
  const src=findCard(before);
  const dest=stagesOf(before).find(s=>s!==src.stage);
  ok("there is a card to drag", !!src && !!dest, src?`${src.id.slice(0,8)}… in ${src.stage} → ${dest}`:"none");

  const t0=Date.now();
  await drop(p, src.id, dest);
  await p.waitForFunction(({id,stage})=>{
    const sec=[...document.querySelectorAll("section[aria-label]")]
      .find(s=>s.getAttribute("aria-label")===stage);
    return !!sec?.querySelector(`[data-lead="${id}"]`);
  }, {id:src.id, stage:dest}, {timeout:2000}).catch(()=>{});
  const moved=Date.now()-t0;

  const after=await layout(p);
  ok("the card is in the new column", after[dest].includes(src.id), `${moved}ms, server held for 2500ms`);
  ok("and gone from the old one", !after[src.stage].includes(src.id));
  ok("it happened before the server answered", moved < 800, `${moved}ms`);
  await ctx.close();
}

console.log("\n=== the failure path: it goes back, and says so ===");
{
  const {ctx,p}=await board(400,true);
  const before=await layout(p);
  const src=findCard(before);
  const dest=stagesOf(before).find(s=>s!==src.stage);

  await drop(p, src.id, dest);
  await p.waitForTimeout(250);
  const during=await layout(p);
  ok("it moves optimistically first", during[dest].includes(src.id));

  await p.waitForTimeout(1800);
  const after=await layout(p);
  ok("the card returns to its column", after[src.stage].includes(src.id));
  ok("and is not left in the new one", !after[dest].includes(src.id));
  const alert = await p.locator('[role="alert"]').first().innerText().catch(()=>"");
  ok("the agent is told, as an alert", /did not save|unavailable/i.test(alert), JSON.stringify(alert.slice(0,60)));
  await ctx.close();
}

await b.close();
console.log(bad?`\n${bad} PROBLEM(S)`:"\nPASS");
process.exitCode=bad?1:0;
