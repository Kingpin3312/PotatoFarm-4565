import fs from "node:fs";
import pw from "playwright";

/**
 * Is it actually installable, and does it actually work with no signal?
 *
 * **Two runs, and the second one needs the server stopped.** That is not
 * awkwardness for its own sake — it is the only honest way to test this.
 * Playwright's `setOffline`, and CDP's `emulateNetworkConditions`, both
 * govern the *page's* requests and leave the service worker's own
 * `fetch` going to the real network. With the server up, an "offline"
 * navigation quietly succeeded and returned the sign-in page, and the
 * check would have passed while proving nothing.
 *
 *     npm run build && npm run start
 *     npm run browser:installable          # phase 1, server up
 *     # stop the server
 *     OFFLINE=1 npm run browser:installable  # phase 2, server down
 *
 * A persistent profile carries the registered worker between the two.
 */

const PROFILE = "/tmp/potatofarm-pwa-profile";
const OFFLINE = process.env.OFFLINE === "1";

function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}

let bad = 0;
const ok=(l,p,d="")=>{console.log(`  ${p?"\u2713":"\u2717"} ${l}${d?"  \u2014 "+d:""}`);if(!p)bad++;};

const ctx = await pw.chromium.launchPersistentContext(PROFILE, {
  executablePath: cp(),
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true,
});
const p = ctx.pages()[0] ?? await ctx.newPage();

if (!OFFLINE) {
  console.log("\n=== phase 1: the manifest a phone reads ===");
  await p.goto("http://localhost:3000/offline", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);

  const man = await p.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const r = await fetch(link.getAttribute("href"));
    return { status: r.status, json: await r.json() };
  });
  ok("a manifest is linked and parses", !!man && man.status === 200);
  if (man) {
    const m = man.json;
    ok("has a name and a short name", !!m.name && !!m.short_name, m.short_name);
    ok("opens standalone, not in a browser tab", m.display === "standalone", m.display);
    ok("starts on Today", m.start_url === "/today", m.start_url);
    ok("has a 192 and a 512 icon", ["192x192","512x512"].every(s=>m.icons.some(i=>i.sizes===s)));
    ok("has a maskable icon, so Android does not crop the mark",
       m.icons.some(i=>(i.purpose||"").includes("maskable")));
  }

  console.log("\n=== the service worker ===");
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller, null, {timeout:20000}).catch(()=>{});
  const reg = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    if (!r) return null;
    await navigator.serviceWorker.ready;
    return { scope: r.scope, controlling: !!navigator.serviceWorker.controller };
  });
  ok("registers, activates and controls the page", !!reg?.controlling, reg?.scope ?? "not registered");

  console.log("\n=== what it put on the device ===");
  const cached = await p.evaluate(async () => {
    const out = [];
    for (const n of await caches.keys()) {
      const c = await caches.open(n);
      out.push(...(await c.keys()).map(r => new URL(r.url).pathname));
    }
    return out;
  });
  console.log("    " + (cached.join("\n    ") || "(nothing)"));
  ok("cached the offline page", cached.includes("/offline"));
  /* The two that matter. A cached page is somebody's leads sitting on the
     handset after they sign out, and served to the next person who opens
     it on a shared phone. */
  ok("cached NO page that carries data",
     !cached.some(u => ["/today","/inbox","/leads","/pipeline","/blackbook"].includes(u)));
  ok("cached NO api response",
     !cached.some(u => u.startsWith("/api")), "client names must not sit on the device");

  console.log("\n  Now stop the server and run:  OFFLINE=1 npm run browser:installable");
} else {
  console.log("\n=== phase 2: with the server genuinely gone ===");
  const reachable = await fetch("http://localhost:3000/offline").then(()=>true).catch(()=>false);
  ok("the server really is stopped", !reachable,
     reachable ? "it is still answering — phase 2 proves nothing" : "");

  const nav = await p.goto("http://localhost:3000/pipeline", { waitUntil: "domcontentloaded" })
    .catch(() => null);
  const text = await p.evaluate(()=>document.body.innerText.replace(/\s+/g," ").trim());
  ok("a navigation still renders", !!nav);
  ok("and it is our page, not the browser's error", /no connection/i.test(text), text.slice(0,60));
  ok("which says the leads are not kept on the phone", /not kept on this phone/i.test(text));
}

await ctx.close();
console.log(bad ? `\n${bad} PROBLEM(S)` : "\nPASS");
process.exitCode = bad ? 1 : 0;
