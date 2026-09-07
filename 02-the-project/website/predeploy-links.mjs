import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const b = await pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext(); const p = await ctx.newPage();
const B = "http://localhost:4321";
const seen = new Map(); let bad = 0, hops = 0;

for (const page of ["/","/product","/security","/guides","/demo","/legal",
                    "/trakheesi-permits","/uae-aml-for-brokerages","/whatsapp-24-hour-window","/nonsense"]) {
  await p.goto(B + page, { waitUntil: "networkidle" });
  const links = await p.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")]
    .map(a => a.getAttribute("href"))
    .filter(h => h && !/^(mailto:|tel:|#)/.test(h)))]);
  for (const href of links) {
    if (/^https?:/.test(href)) continue;          // external, not ours to serve
    const url = B + (href.startsWith("/") ? href : "/" + href);
    const key = url.split("#")[0];
    if (seen.has(key)) continue;
    const r = await ctx.request.get(key, { maxRedirects: 0 }).catch(() => null);
    const st = r ? r.status() : 0;
    seen.set(key, st);
    if (st >= 400 || st === 0) { console.log(`  ✗ ${page} → ${href}  ${st}`); bad++; }
    else if (st >= 300) { console.log(`  ⚠ ${page} → ${href}  ${st} (redirect hop)`); hops++; }
  }
}
console.log(`\n  ${seen.size} distinct internal links followed over HTTP`);
console.log(`  ${bad} broken, ${hops} taking a redirect hop`);
await b.close();
process.exit(bad || hops ? 1 : 0);
