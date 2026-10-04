import pw from "playwright";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";
import { chromePath as cp } from "./_browser.mjs";

/**
 * An agent's microsite, in a real browser.
 *
 * `check:microsite` proves what the server does; this proves what a
 * person sees and does:
 *
 * - the editor's preview redraws as the agent types, before anything is
 *   saved, and Save then Publish put the words on the public page;
 * - the QR code draws, and the share controls are there;
 * - the public page fits every width it will be opened at — 375, 390
 *   and 430 (phones, mostly from a WhatsApp link), 768 (a tablet), 1280,
 *   1440 and 1920 — with no sideways scroll, every contact link at
 *   least 44px tall, and WhatsApp and Call pinned to the foot on a phone.
 *
 * Runs against the seeded demo brokerage, as Lena, whose microsite the
 * seed publishes, and puts her headline back afterwards.
 *
 *     npm run dev
 *     npm run browser:microsite
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";
const PAGE = "/p/seed-marina/agents/lena-popescu";
const TOKEN = "dev-session-manager"; // Lena Popescu, an agent
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } } });

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? `  — ${d}` : ""}`); if (!p) bad++; };

const org = await db.organisation.findFirst({ where: { slug: "seed-marina" }, select: { id: true } });
const site = org ? await db.agentMicrosite.findFirst({ where: { orgId: org.id, slug: "lena-popescu" } }) : null;
if (!site) { console.log("  ✗ no microsite for Lena — run npm run db:seed"); process.exit(1); }
const before = { draft: site.draft, live: site.live };

const b = await pw.chromium.launch({ executablePath: cp() });
try {
  console.log("\nThe editor\n");
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([...sessionCookies(TOKEN)]);
  const p = await ctx.newPage();
  await p.goto(`${APP}/microsite/edit`, { waitUntil: "networkidle", timeout: 90000 });
  const words = `Headline typed by the browser check ${Date.now().toString(36)}`;
  const headline = p.locator('[data-field="headline"] textarea');
  await headline.fill(words);
  const preview = p.locator("aside [data-preview]");
  await preview.getByText(words).waitFor({ timeout: 10000 }).catch(() => {});
  ok("the preview redraws as the agent types, before anything is saved", (await preview.textContent())?.includes(words) ?? false);
  const publicBefore = await (await fetch(`${APP}${PAGE}`)).text();
  ok("and nothing public has changed", !publicBefore.includes(words));
  await p.locator("[data-save]").click();
  await p.getByText("Draft saved").waitFor({ timeout: 15000 }).catch(() => {});
  ok("Save draft says what it did", await p.getByText("Draft saved. Nothing public has changed.").isVisible());
  await p.locator("[data-publish]").click();
  await p.getByText(/Published — your microsite is live/).waitFor({ timeout: 15000 }).catch(() => {});
  ok("Publish says it is live", await p.getByText(/Published — your microsite is live/).isVisible());
  ok("and the public page carries the new words", (await (await fetch(`${APP}${PAGE}`)).text()).includes(words));

  await p.goto(`${APP}/microsite`, { waitUntil: "networkidle" });
  ok("My microsite shows it live, with the address to copy",
     (await p.locator('[data-status="LIVE"]').count()) === 1 && ((await p.locator("[data-url]").textContent()) ?? "").endsWith(PAGE));
  await p.locator("[data-qr-open]").click();
  await p.locator("[data-qr-dialog] [data-qr]").waitFor({ timeout: 10000 }).catch(() => {});
  ok("the QR code draws in its dialog", await p.locator("[data-qr-dialog] [data-qr]").isVisible());
  await ctx.close();

  console.log("\nThe public page, at every width it is opened at\n");
  for (const w of [375, 390, 430, 768, 1280, 1440, 1920]) {
    const phone = w < 600;
    const c = await b.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone });
    const q = await c.newPage();
    await q.goto(`${APP}${PAGE}`, { waitUntil: "networkidle", timeout: 90000 });
    const r = await q.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > W + 1)
        .map((e) => e.tagName.toLowerCase() + (e.className ? `.${String(e.className).split(" ")[0]}` : ""));
      const small = [...document.querySelectorAll("[data-microsite] a[data-track], [data-microsite] a[href^='#']")]
        .filter((a) => a.getBoundingClientRect().height > 0 && a.getBoundingClientRect().height < 44).map((a) => a.textContent?.trim());
      const bar = document.querySelector("[data-contact-bar]");
      return { over: document.documentElement.scrollWidth - W, wide: wide.slice(0, 3), small, bar: !!bar && getComputedStyle(bar).display !== "none" };
    });
    ok(`${w}px: no sideways scroll, every contact link 44px or taller${phone ? ", WhatsApp and Call pinned" : ""}`,
       r.over <= 0 && r.small.length === 0 && (phone ? r.bar : true),
       r.over > 0 ? `${r.over}px over: ${r.wide.join(", ")}` : r.small.length ? `small: ${r.small.join(", ")}` : phone && !r.bar ? "no contact bar" : "");
    await c.close();
  }
} finally {
  await db.agentMicrosite.update({ where: { id: site.id }, data: { draft: before.draft, live: before.live } });
  await b.close();
  await db.$disconnect();
}
console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
process.exit(bad ? 1 : 0);
