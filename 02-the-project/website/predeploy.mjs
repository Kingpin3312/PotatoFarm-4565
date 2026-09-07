import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const b = await pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let bad = 0;
const ok = (l,p,d="") => { console.log(`  ${p?"✓":"✗"} ${l}${d?`  — ${d}`:""}`); if(!p) bad++; };
const B = "http://localhost:4321";

for (const [name, opts] of [["desktop",{viewport:{width:1280,height:900}}],
                            ["iphone", pw.devices["iPhone 13"]]]) {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  const errs = [], blocked = [];
  p.on("pageerror", e => errs.push(String(e).slice(0,120)));
  p.on("console", m => {
    const t = m.text();
    if (m.type() !== "error") return;
    if (/Content Security Policy|Refused to/i.test(t)) blocked.push(t.slice(0,140));
    else errs.push(t.slice(0,120));
  });
  p.on("requestfailed", r => blocked.push(`${r.url().slice(0,70)} — ${r.failure()?.errorText}`));

  console.log(`\n=== ${name} (served over HTTP, under the real CSP) ===`);
  for (const path of ["/", "/product", "/security", "/guides", "/demo", "/legal",
                      "/trakheesi-permits", "/uae-aml-for-brokerages", "/whatsapp-24-hour-window"]) {
    await p.goto(B + path, { waitUntil: "networkidle" });
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => ({
      // Did the stylesheet actually apply? CSP blocking it is invisible
      // in the DOM but the page renders unstyled.
      styled: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily.slice(0, 40),
      h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 40),
      sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      // The mark, wherever it lives. `header svg path` found nothing on
      // every page and it was the selector that was wrong: the brand
      // sits in `nav > a.brand`, not a <header>. Anchor to the brand
      // link, which is what the thing actually is.
      mark: !!document.querySelector("a.brand svg path, header svg path"),
    }));
    const styled = m.styled !== "rgba(0, 0, 0, 0)" && m.styled !== "rgb(255, 255, 255)";
    console.log(`  ${path.padEnd(28)} ${styled ? "styled" : "UNSTYLED"}  h1="${m.h1}"`);
    if (!styled) { bad++; console.log(`     ✗ stylesheet did not apply (${m.styled})`); }
    if (m.sideways) { bad++; console.log(`     ✗ scrolls sideways`); }
    if (!m.mark) { bad++; console.log(`     ✗ logo missing`); }
  }

  ok("no CSP violations or blocked resources", blocked.length === 0, [...new Set(blocked)].slice(0,3).join(" | "));
  ok("no page errors", errs.length === 0, [...new Set(errs)].slice(0,3).join(" | "));

  // The demo form is the site's whole job.
  await p.goto(B + "/demo", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  const form = await p.evaluate(() => {
    const f = document.querySelector("form");
    if (!f) return null;
    return {
      action: f.getAttribute("action"),
      fields: [...f.querySelectorAll("input,textarea,select")]
        // A honeypot is unlabelled on purpose — it is hidden from
        // everyone, including screen readers, and a spam bot filling it
        // in is the whole point. Counting it as an accessibility fault
        // would push somebody to "fix" the spam trap.
        .filter(i => i.getAttribute("aria-hidden") !== "true" &&
                     i.getAttribute("tabindex") !== "-1")
        .map(i => ({
          name: i.getAttribute("name"), type: i.getAttribute("type"),
          required: i.hasAttribute("required"),
          // Three valid ways to label a field, not one. `consent` is a
          // checkbox wrapped in its own <label>, which is the better
          // pattern and which the first version scored as unlabelled.
          labelled: !!i.getAttribute("aria-label") ||
                    !!(i.id && document.querySelector(`label[for="${i.id}"]`)) ||
                    !!i.closest("label"),
        })),
      submit: !!f.querySelector('button[type=submit],button:not([type])'),
    };
  });
  ok("the demo page has a real form", !!form, form ? `${form.fields.length} fields` : "none");
  if (form) {
    ok("every field is labelled", form.fields.every(f => f.labelled),
       form.fields.filter(f=>!f.labelled).map(f=>f.name).join(","));
    ok("it has a submit button", form.submit);
    // Submitting empty must be refused by the browser, not the server.
    await p.locator("form button[type=submit], form button:not([type])").first().click().catch(()=>{});
    await p.waitForTimeout(500);
    const invalid = await p.evaluate(() =>
      document.querySelectorAll("form :invalid").length);
    ok("an empty submission is caught client-side", invalid > 0, `${invalid} invalid fields`);
  }
  await ctx.close();
}
await b.close();
console.log(bad === 0 ? "\nPASS\n" : `\n${bad} PROBLEM(S)\n`);
process.exit(bad?1:0);
