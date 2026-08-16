import fs from "node:fs";
import pw from "playwright";

/**
 * Does the optimistic update actually work, and does it fail safely?
 *
 * Both halves need a browser, and neither is provable any other way. The
 * fast path holds the mutation for 2.5 seconds and asserts the row is
 * gone in well under half of one — a screenshot cannot show that, and a
 * unit test cannot either.
 *
 * The failure path matters more. An optimistic update that silently
 * reverts is worse than a spinner: the row reappears and the agent has
 * no idea whether the work was recorded. So the route is forced to 500
 * and the test asserts the row comes back *and* that something says so.
 *
 *     npm run dev
 *     npm run browser:optimistic
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
const b=await pw.chromium.launch({executablePath:cp()});
const COOKIE={name:"authjs.session-token",value:"dev-session-token-ask-history",domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"};
const ok=(l,p,d="")=>console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);

async function page(delayMs, failIt) {
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  await ctx.addCookies([COOKIE]);
  const p=await ctx.newPage();
  // Hold the mutation so the optimistic removal is observable, and
  // optionally fail it so the rollback path is exercised for real.
  await p.route("**/api/trpc/today.act**", async (route) => {
    await new Promise(r=>setTimeout(r, delayMs));
    if (failIt) return route.fulfill({ status: 500, contentType:"application/json",
      body: JSON.stringify([{error:{json:{message:"Network is unavailable.",code:-32603,data:{code:"INTERNAL_SERVER_ERROR",httpStatus:500}}}}]) });
    return route.continue();
  });
  await p.goto("http://localhost:3000/today",{waitUntil:"networkidle"});
  await p.waitForFunction(()=>document.body.innerText.length>500,null,{timeout:20000});
  await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
  await p.waitForTimeout(800);
  return {ctx,p};
}
const count = (p) => p.evaluate(()=>document.querySelectorAll("ol > li").length);

console.log("\n=== the fast path: row leaves before the server answers ===");
{
  const {ctx,p} = await page(2500,false);
  const before = await count(p);
  const t0 = Date.now();
  await p.getByRole("button",{name:/^Done$/}).first().click();
  await p.waitForFunction((n)=>document.querySelectorAll("ol > li").length < n, before, {timeout:2000});
  const gone = Date.now()-t0;
  ok("the row goes immediately", gone < 500, `${gone}ms, server held for 2500ms`);
  ok("the header count follows", (await p.locator("h2").first().innerText()).includes(String(before-1)));
  await ctx.close();
}

console.log("\n=== the failure path: it comes back, and says so ===");
{
  const {ctx,p} = await page(300,true);
  const before = await count(p);
  await p.getByRole("button",{name:/^Done$/}).first().click();
  await p.waitForTimeout(300);
  const during = await count(p);
  await p.waitForTimeout(2500);
  const after = await count(p);
  const alert = await p.locator('[role="alert"]').first().innerText().catch(()=>"");
  ok("the row went, optimistically", during < before, `${before} -> ${during}`);
  ok("the row came back on failure", after === before, `${during} -> ${after}`);
  ok("and the agent is told, as an alert", alert.length > 0, JSON.stringify(alert.slice(0,60)));
  await ctx.close();
}
await b.close();
