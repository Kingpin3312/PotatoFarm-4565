import pw from "playwright";
import { chromePath } from "../scripts/_browser.mjs";
const b = await pw.chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 794, height: 1123 } });
await p.emulateMedia({ media: "print" });
await p.goto("file://" + process.argv[2], { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
// The footer sits 10mm from the bottom; content must end 24mm above the edge.
const over = await p.evaluate(() => [...document.querySelectorAll("section.sec, section.front, section.refp")].map((s) => {
  const r = s.getBoundingClientRect(), mm = r.height / 297;
  const last = [...s.querySelectorAll("*")].filter((e) => !e.classList.contains("marker")).reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
  return [s.querySelector(".marker")?.textContent, Math.round((r.bottom - last) / mm)];
}).filter(([, f]) => f < 24));
console.log(over.length ? "TOO FULL (mm free at the bottom): " + JSON.stringify(over) : "every page fits");
await b.close();
