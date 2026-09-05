import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

/**
 * Every product screenshot on the marketing site, regenerated.
 *
 * The site had no images at all, and the fix for that is only as good as
 * its second run: a screenshot of an interface goes stale the moment the
 * interface changes, and a stale screenshot is a lie that photographs
 * well. So there is one command rather than a folder of files somebody
 * made once.
 *
 *     npm --prefix ../app run dev        # a real app, real database
 *     node shots.mjs
 *
 * Three rules it enforces on itself, each from something that went
 * wrong the first time:
 *
 *   1. **Every shot in one run.** The first pair was captured hours
 *      apart, so a laptop reading "Good morning" sat beside a phone
 *      reading "Good evening" in the same composition — exactly the
 *      detail that tells a visitor a picture is staged.
 *   2. **Refuse a page that did not render.** Under 500 characters means
 *      a skeleton or an error, and a photograph of a loading state is
 *      worse than no photograph.
 *   3. **Write the real dimensions into the markup.** The intrinsic size
 *      has to follow the file or the browser reserves the wrong space
 *      and the page jumps as each image lands.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "assets");
const APP = process.env.APP ?? "http://localhost:3000";
const SESSION = process.env.SESSION ?? "dev-session-token-ask-history";

/** Shots, and the page each one argues for. */
const SHOTS = [
  // 1040 rather than 1440: the app centres its content, so a wider
  // viewport photographs a field of cream with a product in the middle.
  { file: "shot-today-desktop.webp", path: "/today", w: 1040, h: 760, cap: [1600, 1600] },
  { file: "shot-today-phone.webp", path: "/today", w: 390, h: 844, cap: [760, 1400], mobile: true },
  { file: "shot-inbox-desktop.webp", path: "/inbox", w: 1040, h: 760, cap: [1600, 1600] },
  // /leads rather than /pipeline: the pipeline board is empty in a fresh
  // brokerage, and an empty board photographs as a broken product. The
  // 500-character guard caught that on the first run.
  { file: "shot-leads-desktop.webp", path: "/leads", w: 1040, h: 760, cap: [1600, 1600] },
];

function chromePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (fs.existsSync(`${root}/chromium`)) return `${root}/chromium`;
  for (const d of fs.readdirSync(root).filter((x) => x.startsWith("chromium")).sort().reverse()) {
    const p = `${root}/${d}/chrome-linux/chrome`;
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const b = await pw.chromium.launch({ executablePath: chromePath() });
const greetings = new Set();
const written = [];

for (const s of SHOTS) {
  const ctx = await b.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
  });
  await ctx.addCookies([{
    name: "authjs.session-token", value: SESSION,
    domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax",
  }, {
    /**
     * The same session under the name a production build reads.
     *
     * `useSecureCookies` is on when NODE_ENV is production, so `next
     * start` looks for `__Secure-authjs.session-token` and ignores the
     * bare one. Sending only the development name produced a signed-out
     * shell — and this script did the right thing with that, refusing to
     * photograph a page that rendered 238 characters rather than
     * shipping a blank screenshot to the marketing site.
     *
     * `secure: true` is required or Chromium rejects the prefix
     * outright; it still reaches http://localhost because browsers treat
     * localhost as a trustworthy origin.
     */
    name: "__Secure-authjs.session-token", value: SESSION, secure: true,
    domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax",
  }]);
  const p = await ctx.newPage();
  await p.goto(APP + s.path, { waitUntil: "networkidle" });
  await p.waitForFunction(
    () => document.body.innerText.replace(/\s+/g, " ").trim().length > 500,
    null, { timeout: 25000 },
  ).catch(() => {});
  // The Next.js dev badge is a development artifact and must not appear
  // in a picture of the product.
  await p.addStyleTag({ content: "nextjs-portal,#__next-build-watcher{display:none!important}" });
  await p.waitForTimeout(1200);

  const info = await p.evaluate(() => ({
    chars: document.body.innerText.replace(/\s+/g, " ").trim().length,
    greeting: (document.querySelector("h1")?.textContent || "").trim(),
  }));
  if (info.chars < 500) {
    console.error(`  ✗ ${s.file}: ${s.path} rendered ${info.chars} characters — refusing to photograph it`);
    process.exit(1);
  }
  if (s.path === "/today") greetings.add(info.greeting);

  const tmp = path.join("/tmp", s.file.replace(".webp", ".png"));
  await p.screenshot({ path: tmp });
  await ctx.close();

  // Resized and converted with Pillow, which is already a dependency of
  // the audit scripts, rather than adding an image library to the site.
  execFileSync("python3", ["-c", `
from PIL import Image
im = Image.open(${JSON.stringify(tmp)}).convert("RGB")
im.thumbnail((${s.cap[0]}, ${s.cap[1]}), Image.LANCZOS)
im.save(${JSON.stringify(path.join(OUT, s.file))}, "WEBP", quality=84, method=6)
print(f"{im.size[0]}x{im.size[1]}")
`.trim()], { encoding: "utf8" }).trim();

  const im = execFileSync("python3", ["-c",
    `from PIL import Image; im=Image.open(${JSON.stringify(path.join(OUT, s.file))}); print(im.size[0], im.size[1])`,
  ], { encoding: "utf8" }).trim().split(" ").map(Number);
  written.push({ file: s.file, w: im[0], h: im[1] });
  const kb = Math.round(fs.statSync(path.join(OUT, s.file)).size / 1024);
  console.log(`  ✓ ${s.file.padEnd(30)} ${im[0]}x${im[1]}  ${kb} KB   ${s.path}`);
}
await b.close();

if (greetings.size > 1) {
  console.error(`\n✗ the Today shots disagree: ${[...greetings].join(" vs ")} — captured at different times`);
  process.exit(1);
}

/** Keep every intrinsic size in the markup honest. */
let touched = 0;
for (const f of fs.readdirSync(HERE).filter((x) => x.endsWith(".html"))) {
  const p = path.join(HERE, f);
  let html = fs.readFileSync(p, "utf8");
  const before = html;
  for (const { file, w, h } of written) {
    html = html.replace(
      new RegExp(`(${file.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}" )width="\\d+" height="\\d+"`, "g"),
      `$1width="${w}" height="${h}"`,
    );
  }
  if (html !== before) { fs.writeFileSync(p, html); touched++; }
}
console.log(`\n${written.length} shot(s); dimensions refreshed in ${touched} page(s).`);
