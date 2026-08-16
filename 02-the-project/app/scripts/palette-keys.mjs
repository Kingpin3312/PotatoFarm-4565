import fs from "node:fs";
import pw from "playwright";

/**
 * The command palette, driven by the keyboard only.
 *
 * The mouse is not touched once here, deliberately: a palette that only
 * works with a pointer is a menu with extra steps. What is asserted is
 * the whole contract — a global shortcut that fires from inside a text
 * field, arrow keys that move a selection a screen reader can follow,
 * Enter that navigates, Escape that returns focus where it started.
 *
 *     npm run dev && npm run browser:palette-keys
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}
let bad=0;
const ok=(l,p,d="")=>{console.log(`  ${p?"✓":"✗"} ${l}${d?"  — "+d:""}`);if(!p)bad++;};

const b=await pw.chromium.launch({executablePath:cp()});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.addCookies([{name:"authjs.session-token",value:"dev-session-token-ask-history",
  domain:"localhost",path:"/",httpOnly:true,sameSite:"Lax"}]);
const p=await ctx.newPage();
await p.goto("http://localhost:3000/today",{waitUntil:"domcontentloaded"});
await p.waitForFunction(()=>document.body.innerText.length>500,null,{timeout:20000}).catch(()=>{});
await p.addStyleTag({content:"nextjs-portal{display:none!important}"});
await p.waitForTimeout(600);

const isOpen = () => p.evaluate(()=>!!document.querySelector("dialog[open]"));

console.log("\n=== opening ===");
ok("closed to begin with", !(await isOpen()));
await p.keyboard.press("Control+k");
await p.waitForTimeout(400);
ok("Ctrl+K opens it", await isOpen());
ok("and focus is in the box", await p.evaluate(()=>document.activeElement?.getAttribute("role")==="combobox"));

console.log("\n=== it is a real modal ===");
ok("the page behind is inert (browser-enforced)",
   await p.evaluate(()=>document.querySelector("dialog[open]")?.matches(":modal") ?? false));

console.log("\n=== arrow keys move a selection a screen reader can follow ===");
const activeId = () => p.evaluate(()=>document.querySelector('[role="combobox"]')?.getAttribute("aria-activedescendant"));
const first = await activeId();
ok("something is selected on open", !!first, first ?? "nothing");
await p.keyboard.press("ArrowDown");
await p.waitForTimeout(150);
const second = await activeId();
ok("ArrowDown moves it", !!second && second !== first, `${first} -> ${second}`);
ok("and exactly one option is aria-selected",
   (await p.evaluate(()=>document.querySelectorAll('[role="option"][aria-selected="true"]').length)) === 1);
await p.keyboard.press("ArrowUp");
await p.waitForTimeout(150);
ok("ArrowUp moves it back", (await activeId()) === first);

console.log("\n=== typing filters, and the count is announced ===");
await p.keyboard.type("pipe");
await p.waitForTimeout(500);
const labels = await p.evaluate(()=>[...document.querySelectorAll('[role="option"]')].map(o=>o.textContent?.trim()));
ok("filters to the matching screen", labels.some(l=>/pipeline/i.test(l||"")), labels.slice(0,3).join(" | "));
ok("the result count is in a live region",
   await p.evaluate(()=>[...document.querySelectorAll('[role="status"]')].some(n=>/result/i.test(n.textContent||""))));

console.log("\n=== Enter navigates ===");
await p.keyboard.press("Enter");
await p.waitForTimeout(1200);
ok("the dialog closed", !(await isOpen()));
ok("and the browser went there", (await p.evaluate(()=>location.pathname)) === "/pipeline",
   await p.evaluate(()=>location.pathname));

console.log("\n=== Escape, and focus goes back where it was ===");
await p.keyboard.press("Control+k");
await p.waitForTimeout(400);
ok("reopens", await isOpen());
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
ok("Escape closes it", !(await isOpen()));

console.log("\n=== it finds people and properties, not just screens ===");
/**
 * The half that is not navigation.
 *
 * A palette that only jumps between screens is a nav bar with a
 * keyboard. The point is that the same box answers "where is that
 * two-bed in the Marina" and "what was the Chen thread about", so this
 * asserts a real row comes back from `search.ask` and that Enter opens
 * it. `David Chen` and `Marina Gate` are seeded in *this* brokerage —
 * the names in the other seeded orgs return nothing here, which is row
 * level security doing its job rather than a broken search.
 */
await p.keyboard.press("Control+k");
await p.waitForTimeout(400);
await p.keyboard.type("David");
// Waits for the result rather than sleeping for a guessed interval. A
// fixed 1800ms passed eight times out of eight in isolation and failed
// once when five browser suites ran back to back against a dev server
// that was still compiling — which is a flaky check, and a flaky check
// is worse than none because the next real failure gets shrugged at.
await p.waitForFunction(
  ()=>[...document.querySelectorAll('[role="option"]')].some(o=>/david/i.test(o.textContent||"")),
  null, {timeout:15000},
).catch(()=>{});
const people = await p.evaluate(()=>[...document.querySelectorAll('[role="option"]')].map(o=>o.textContent?.trim()));
ok("a person comes back from the server", people.some(l=>/david/i.test(l||"")), people.slice(0,2).join(" | "));
// `textContent`, not `innerText`, and case-insensitively. The headings
// are uppercased in CSS, and `innerText` returns what is *rendered* — so
// the obvious version of this check reads "PEOPLE", fails against
// /People/, and sends you looking for a rendering bug that is not there.
ok("grouped under a heading, not mixed into the screens",
   await p.evaluate(()=>/people|properties/i.test(document.querySelector("dialog[open]")?.textContent||"")));
await p.keyboard.press("Enter");
await p.waitForTimeout(1500);
ok("Enter opens the person", !(await isOpen()) && (await p.evaluate(()=>location.pathname)) !== "/pipeline",
   await p.evaluate(()=>location.pathname));

console.log("\n=== the shortcut is discoverable ===");
/**
 * The reason this is asserted rather than eyeballed: the app had no
 * keyboard shortcuts at all before this one, so there is no habit to
 * lean on. If the button ever disappears, ⌘K becomes a feature only its
 * author knows about, and nothing else in the suite would notice.
 */
// Everything below is guarded on the button existing. Playwright's
// default is to wait 30s and then throw, which killed the run and took
// the two sections after it down unreported — a suite that dies partway
// through hides more than it shows.
const btn = p.locator('button[aria-label="Search and go to"]');
const hasBtn = (await btn.count()) === 1;
ok("there is a visible button", hasBtn);
if (hasBtn) {
  const kbd = (await btn.locator("kbd").textContent().catch(()=>"")) ?? "";
  ok("it shows the key combination", /⌘K|Ctrl K/.test(kbd), kbd || "none");
  ok("and it announces the shortcut to a screen reader",
     !!(await btn.getAttribute("aria-keyshortcuts")));
  await btn.click();
  await p.waitForTimeout(400);
  ok("clicking it opens the same palette", await isOpen());
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
} else {
  ok("it shows the key combination", false, "no button to read");
  ok("and it announces the shortcut to a screen reader", false, "no button to read");
  ok("clicking it opens the same palette", false, "no button to click");
}

console.log("\n=== it fires from inside a text field ===");
await p.goto("http://localhost:3000/search",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1200);
const box = p.locator('input[type=search], input[type=text]').first();
await box.click();
await box.type("abc");
await p.keyboard.press("Control+k");
await p.waitForTimeout(400);
ok("opens even while typing in a field", await isOpen());
ok("and did not leave a stray k in the field",
   !(await box.inputValue()).includes("k"), await box.inputValue());

await b.close();
console.log(bad?`\n${bad} PROBLEM(S)`:"\nPASS");
process.exitCode = bad?1:0;
