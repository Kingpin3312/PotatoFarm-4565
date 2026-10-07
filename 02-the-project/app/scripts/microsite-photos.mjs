/**
 * Fetch the microsite photo pack.
 *
 *     npm run microsite:photos
 *
 * For each role in `ROLES`, searches Unsplash, takes the first result
 * that is free to use (not Unsplash+), and writes three WebP widths to
 * `public/microsite/demo/`, then rewrites `src/lib/microsite/demo-photos.ts`
 * and `public/microsite/demo/CREDITS.md`. The Unsplash licence allows this
 * use, commercial included, without attribution; the credits are kept
 * because it is right to.
 *
 * Needs `unsplash.com` and `images.unsplash.com` reachable. Look at what
 * it chose before committing — `CREDITS.md` links every photograph — and
 * pin a choice by putting its id in `PINNED`.
 *
 * The portrait is searched as a figure seen from behind or in silhouette
 * on purpose: it stands in for a named agent on the demonstration
 * brokerage's pages, and a stranger's face given an agent's name and
 * licence number would put words in a real person's mouth.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = "public/microsite/demo";
const MANIFEST = "src/lib/microsite/demo-photos.ts";
const WIDTHS = [640, 1280, 1920];
const PER_ROLE = 3;

const ROLES = {
  hero: "dubai skyline dusk",
  portrait: "businesswoman from behind looking at city skyline window",
  interior: "luxury apartment living room city view",
  "property:apartment": "luxury apartment interior dubai",
  "property:villa": "modern villa pool exterior",
  "property:penthouse": "penthouse terrace skyline",
  "area:marina": "dubai marina",
  "area:jbr": "jumeirah beach residence",
  "area:palm": "palm jumeirah",
  "area:downtown": "downtown dubai burj khalifa",
  "area:business-bay": "business bay dubai canal",
  "area:difc": "difc dubai",
  "area:creek": "dubai creek harbour",
  "area:hills": "dubai hills",
  "area:ranches": "desert villa community dubai",
  "area:emirates-hills": "luxury villa lake golf",
  "area:jlt": "jumeirah lake towers",
  "area:bluewaters": "ain dubai bluewaters",
  "area:beachfront": "dubai beachfront towers",
  "area:city-walk": "city walk dubai",
};
/** Photo ids to use instead of the search's choice, per role. */
const PINNED = {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (role, i) => `${role.replace(/[^a-z0-9]+/g, "-")}-${i + 1}`;

async function search(query) {
  const u = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=30&orientation=landscape`;
  const r = await fetch(u, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`search "${query}" answered ${r.status}`);
  const j = await r.json();
  return (j.results ?? []).filter((p) => !p.premium && !p.plus && p.urls?.raw);
}

async function save(rawUrl, name) {
  for (const w of WIDTHS) {
    const r = await fetch(`${rawUrl}&w=${w}&q=80&fm=jpg&fit=max`);
    if (!r.ok) throw new Error(`${name} at ${w}px answered ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await sharp(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(OUT, `${name}-${w}.webp`));
  }
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
const credits = [];
for (const [role, query] of Object.entries(ROLES)) {
  const found = await search(query);
  const chosen = (PINNED[role] ?? []).length ? found.filter((p) => PINNED[role].includes(p.id)) : found.slice(0, PER_ROLE);
  manifest[role] = [];
  for (const [i, p] of chosen.entries()) {
    const file = slug(role, i);
    await save(p.urls.raw, file);
    const credit = `${p.user?.name ?? "Unknown"} on Unsplash`;
    manifest[role].push({ file, credit });
    credits.push(`- \`${file}\` — ${p.alt_description ?? query} — ${credit} — ${p.links?.html ?? ""}`);
    console.log(`  ✓ ${role} ${file}  ${p.links?.html ?? ""}`);
    await sleep(300);
  }
}

fs.writeFileSync(path.join(OUT, "CREDITS.md"), `# Microsite photo pack\n\nFrom Unsplash, under the Unsplash licence. Fetched by \`npm run microsite:photos\`.\n\n${credits.join("\n")}\n`);
const src = fs.readFileSync(MANIFEST, "utf8");
fs.writeFileSync(MANIFEST, src.replace(/export const DEMO_PHOTOS[\s\S]*$/, `export const DEMO_PHOTOS: Partial<Record<DemoRole, DemoPhoto[]>> = ${JSON.stringify(manifest, null, 2)};\n`));
console.log(`\n${credits.length} photographs. Review public/microsite/demo/CREDITS.md before committing.`);
