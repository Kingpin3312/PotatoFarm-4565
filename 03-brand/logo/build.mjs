import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

/**
 * Every brand asset, rendered from the one definition.
 *
 * `mark.py` is where the potato is defined and `--apply` pushes it into
 * the forty-one places it is inlined. This does the other half: the
 * files that are not markup — the icon ladder, the favicon, the Apple
 * touch icon, the maskable PWA icon and the social preview.
 *
 * They were previously made by hand at some point and never again, so
 * the 180px Apple icon and the 512px PWA icon were two generations of
 * artwork apart and nothing could tell you that. Now:
 *
 *     python3 03-brand/logo/mark.py --apply     # the markup
 *     node    03-brand/logo/build.mjs           # the bitmaps
 *
 * ## Why Chromium rather than an SVG library
 *
 * The mark uses `feGaussianBlur` and `feDropShadow` for the highlight
 * and the lift, and the dark treatment is three blurred passes of the
 * silhouette. Most Python SVG rasterisers either ignore filters or
 * approximate them, which would ship a favicon that does not match the
 * logo on the website. The browser is the renderer the artwork is
 * designed against, so it is the one that renders it.
 */

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const LOGO = path.join(ROOT, "03-brand/logo");

function chromium() {
  const r = "/opt/pw-browsers";
  if (fs.existsSync(`${r}/chromium`)) return `${r}/chromium`;
  for (const d of fs.readdirSync(r).filter((x) => x.startsWith("chromium")).sort().reverse()) {
    const p = `${r}/${d}/chrome-linux/chrome`;
    if (fs.existsSync(p)) return p;
  }
}

/** The mark's SVG body, straight out of the definition. */
const py = (args) =>
  execFileSync("python3", [path.join(LOGO, "mark.py"), ...args], { encoding: "utf8" });

const MARK = py([]);                                  // <svg …>…</svg>, 64x64
const GLOW = py(["--glow"]);                          // 128x128 on dark

const GROUND = "#FFFFFF";
const NAVY = "#12202E";

/**
 * The icon ladder.
 *
 * Sizes are not a round series — each one is a real slot. 180 is the
 * Apple touch icon, 192 and 512 are what a web manifest must carry,
 * 152/120/76/60 are older iOS slots, 48/32/16 are browser chrome.
 */
const ICONS = [512, 192, 180, 152, 120, 76, 60, 48, 32, 16];

/**
 * The maskable icon is a different drawing, not the same one padded.
 *
 * Android crops a maskable icon to whatever shape the launcher wants,
 * and the safe zone is the middle 80%. Shipping the standard mark as
 * maskable is how a potato loses its head on a Pixel.
 */
const MASKABLE_INSET = 0.62;

const b = await pw.chromium.launch({ executablePath: chromium() });
const ctx = await b.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();
const wrote = [];

async function shot(html, w, h, out, transparent) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;${transparent ? "" : ""}}
     *{box-sizing:border-box}</style>${html}`
  );
  await page.screenshot({ path: out, omitBackground: !!transparent });
  wrote.push(path.relative(ROOT, out));
}

// ---- the icon ladder, transparent -----------------------------------
for (const s of ICONS) {
  await shot(
    `<div style="width:${s}px;height:${s}px;display:grid;place-items:center">
       <div style="width:${s}px;height:${s}px">${sized(MARK, s)}</div></div>`,
    s, s, path.join(LOGO, `icon-${s}.png`), true
  );
}

// ---- maskable, on the brand ground with the safe-zone inset ---------
{
  const s = 512, inner = Math.round(s * MASKABLE_INSET);
  await shot(
    `<div style="width:${s}px;height:${s}px;background:${GROUND};display:grid;place-items:center">
       <div style="width:${inner}px;height:${inner}px">${sized(MARK, inner)}</div></div>`,
    s, s, path.join(LOGO, "icon-maskable-512.png"), false
  );
}

// ---- the dark treatment ---------------------------------------------
for (const s of [512, 192]) {
  await shot(
    `<div style="width:${s}px;height:${s}px;background:#0A0705;display:grid;place-items:center">
       <div style="width:${s}px;height:${s}px">${sized(GLOW, s)}</div></div>`,
    s, s, path.join(LOGO, `icon-glow-${s}.png`), false
  );
}

// ---- the social preview ----------------------------------------------
// 1200x630, the size every scraper assumes. Built from the lockup rather
// than from a stretched favicon, which is what the brief calls out and
// what the old og-default.png was.
for (const [name, bg, word] of [
  ["og-image", GROUND, NAVY],
  ["og-image-dark", "#0A0705", "#F5F3F0"],
]) {
  const dark = bg !== GROUND;
  await shot(
    `<div style="width:1200px;height:630px;background:${bg};display:flex;
                 flex-direction:column;align-items:center;justify-content:center;gap:34px;
                 font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif">
       <div style="width:${dark ? 330 : 260}px;height:${dark ? 330 : 260}px">
         ${sized(dark ? GLOW : MARK, dark ? 330 : 260)}</div>
       <div style="font-size:76px;font-weight:600;letter-spacing:-.028em;color:${word}">
         PotatoFarm<span style="color:#FF5A00;font-weight:500">.io</span></div>
       <div style="font-size:27px;color:${dark ? "#B5B5B5" : "#4A4A4A"};letter-spacing:-.01em">
         Every property enquiry answered in seconds.</div>
     </div>`,
    1200, 630, path.join(LOGO, `${name}.png`), false
  );
}

// ---- the lockup masters ----------------------------------------------
//
// Rendered from their own SVGs rather than laid out again here, so the
// PNG is a derivative of the vector and the two cannot say different
// things. They were not regenerated when the wordmark went navy, which
// left five PNG masters carrying the old neutral ink while every SVG
// beside them carried the new colour — the exact drift `mark.py`
// exists to prevent, in the files it does not reach.
for (const [name, w, h, bg] of [
  ["lockup",                  300, 64,  GROUND],
  ["lockup-reversed",         300, 64,  "#2A2825"],
  ["lockup-stacked",          300, 162, GROUND],
  ["lockup-stacked-reversed", 300, 162, "#2A2825"],
  ["lockup-stacked-onbg",     300, 162, GROUND],
]) {
  const f = path.join(LOGO, `${name}.svg`);
  if (!fs.existsSync(f)) continue;
  const svg = fs.readFileSync(f, "utf8");
  await shot(
    `<div style="width:${w}px;height:${h}px;background:${bg}">${svg}</div>`,
    w, h, path.join(LOGO, `${name}.png`), false
  );
}

// The presentation copy, at 8x, for anywhere a print or a deck needs it.
{
  const svg = fs.readFileSync(path.join(LOGO, "lockup-stacked.svg"), "utf8");
  await shot(
    `<div style="width:2400px;height:1296px;background:${GROUND};display:grid;place-items:center">
       <div style="width:2400px">${svg.replace("<svg ", '<svg width="2400" height="1296" ')}</div></div>`,
    2400, 1296, path.join(LOGO, "lockup-stacked-2400.png"), false
  );
}

// ---- the contact sheet ----------------------------------------------
//
// The one file somebody opens to answer "what does the brand look
// like", which makes it the one file that must never be a generation
// behind. It was: it still showed a flat orange potato and a neutral
// wordmark, two artworks and one colour ago.
{
  const stacked = fs.readFileSync(path.join(LOGO, "lockup-stacked.svg"), "utf8");
  const rev = fs.readFileSync(path.join(LOGO, "lockup-stacked-reversed.svg"), "utf8");
  const horiz = fs.readFileSync(path.join(LOGO, "lockup.svg"), "utf8");
  const cell = (label, inner, bg) =>
    `<div style="display:flex;flex-direction:column;gap:10px">
       <div style="background:${bg};padding:18px;border-radius:10px;display:grid;
                   place-items:center;min-height:150px">${inner}</div>
       <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;
                   letter-spacing:.1em;text-transform:uppercase;color:#6B6B6B">${label}</div>
     </div>`;
  await shot(
    `<div style="width:1000px;height:560px;background:${GROUND};padding:36px;
                 font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;display:flex;
                 flex-direction:column;gap:26px">
       <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px">
         ${cell("Stacked", stacked, GROUND)}
         ${cell("Reversed", rev, "#2A2825")}
         ${cell("Horizontal", `<div style="width:100%;max-width:260px">${horiz.replace("<svg ", '<svg style="width:100%;height:auto" ')}</div>`, GROUND)}
       </div>
       <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px">
         ${cell("App icon", `<div style="width:96px;height:96px">${sized(MARK, 96)}</div>`, GROUND)}
         ${cell("Maskable", `<div style="width:96px;height:96px;transform:scale(.62)">${sized(MARK, 96)}</div>`, GROUND)}
         ${cell("Dark", `<div style="width:120px;height:120px">${sized(GLOW, 120)}</div>`, "#0A0705")}
         ${cell("16 · 32 · 48",
            `<div style="display:flex;align-items:flex-end;gap:14px">
               <div style="width:16px;height:16px">${sized(MARK, 16)}</div>
               <div style="width:32px;height:32px">${sized(MARK, 32)}</div>
               <div style="width:48px;height:48px">${sized(MARK, 48)}</div></div>`, GROUND)}
       </div>
     </div>`,
    1000, 560, path.join(LOGO, "logo-sheet.png"), false
  );
}

// The 1024 master every app-store pipeline asks for.
await shot(
  `<div style="width:1024px;height:1024px;background:${GROUND};display:grid;place-items:center">
     <div style="width:1024px;height:1024px">${sized(MARK, 1024)}</div></div>`,
  1024, 1024, path.join(LOGO, "icon-1024.png"), false
);

await b.close();

/** Force a width/height onto the standalone svg string. */
function sized(svg, s) {
  return svg.replace("<svg ", `<svg width="${s}" height="${s}" `);
}

// ---- favicon.ico -----------------------------------------------------
// Three sizes in one file, written here rather than by a dependency:
// the ICO container is a 6-byte header, a 16-byte directory entry per
// image and then the PNGs verbatim. A browser picks the size it wants.
{
  const parts = [16, 32, 48].map((s) => ({
    s, png: fs.readFileSync(path.join(LOGO, `icon-${s}.png`)),
  }));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(parts.length, 4);
  let offset = 6 + 16 * parts.length;
  const dir = [], body = [];
  for (const { s, png } of parts) {
    const e = Buffer.alloc(16);
    e.writeUInt8(s === 256 ? 0 : s, 0); e.writeUInt8(s === 256 ? 0 : s, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length; dir.push(e); body.push(png);
  }
  fs.writeFileSync(path.join(LOGO, "favicon.ico"), Buffer.concat([head, ...dir, ...body]));
  wrote.push(path.relative(ROOT, path.join(LOGO, "favicon.ico")));
}

// ---- favicon.svg -----------------------------------------------------
// The mark alone, never the lockup. A wordmark at 16px is a grey smear.
fs.writeFileSync(path.join(LOGO, "favicon.svg"), MARK);
wrote.push(path.relative(ROOT, path.join(LOGO, "favicon.svg")));

// ---- and then out to the surfaces that consume them ------------------
//
// Copied rather than symlinked: the app and the website deploy
// separately, and a symlink out of a build directory is a broken asset
// on one of them.
const COPY = [
  ["favicon.ico",        "02-the-project/app/public/favicon.ico"],
  ["favicon.svg",        "02-the-project/app/public/favicon.svg"],
  ["icon-180.png",       "02-the-project/app/public/apple-touch-icon.png"],
  ["icon-192.png",       "02-the-project/app/public/icon-192.png"],
  ["icon-512.png",       "02-the-project/app/public/icon-512.png"],
  ["icon-maskable-512.png", "02-the-project/app/public/icon-maskable-512.png"],
  ["og-image.png",       "02-the-project/app/public/og-image.png"],

  // The website's three OG cards are NOT copied here. `website/og.mjs`
  // owns them: it renders one per page with that page's own headline,
  // which beats one generic card on three URLs. Both generators were
  // writing og-default.png for a moment, which is how a file ends up
  // depending on which command ran last.
  ["favicon.ico",  "02-the-project/website/assets/favicon.ico"],
  ["favicon.svg",  "02-the-project/website/assets/favicon.svg"],
  ["icon-16.png",  "02-the-project/website/assets/icon-16.png"],
  ["icon-32.png",  "02-the-project/website/assets/icon-32.png"],
  ["icon-180.png", "02-the-project/website/assets/icon-180.png"],
  ["icon-192.png", "02-the-project/website/assets/icon-192.png"],
  ["icon-512.png", "02-the-project/website/assets/icon-512.png"],
  ["icon-maskable-512.png", "02-the-project/website/assets/icon-maskable-512.png"],
];
for (const [from, to] of COPY) {
  fs.copyFileSync(path.join(LOGO, from), path.join(ROOT, to));
  wrote.push(to);
}

for (const w of wrote) console.log("  " + w);
console.log(`${wrote.length} files`);
