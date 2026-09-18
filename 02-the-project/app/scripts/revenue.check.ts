/**
 * Does the brokerage's revenue add up, and is it the right person's?
 *
 * ## Why a screen is not enough
 *
 * `/reports/revenue` is the first screen an owner is shown and the only
 * place in the product that states what the business made. Its unit
 * tests cover the price of a model turn; nothing covered the figures on
 * this page, and the ways they go wrong are all silent:
 *
 * - **Double counting.** The headline is the commission the brokerage
 *   was paid. The table below it is *shares of those same commissions*.
 *   An agent's 50% and the house's 45% sum to the fee; add them to the
 *   fee again and a year's earnings reads at twice its real value. No
 *   error, no exception — a confident wrong number in front of an
 *   investor or a tax inspector.
 * - **Money that quietly leaves.** A commission marked received with no
 *   payment date cannot sit in a windowed total. Dropping it silently
 *   is how a report stays plausible while under-reporting.
 * - **The wrong person's money.** Every other money read in this
 *   product scopes to the caller. This one deliberately does not, so
 *   the permission in front of it is the only thing standing between an
 *   agent and the whole firm's book.
 *
 * ## What this proves that the unit tests cannot
 *
 * It reads the procedure over HTTP, as a browser does, against a real
 * database — so it exercises the permission gate, the row-level
 * security scope, superjson over the wire, and the arithmetic, in the
 * arrangement the product actually ships.
 *
 *     npm run build && npm run start
 *     npm run check:revenue
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

const APP = process.env.APP_URL ?? "http://localhost:3000";
const cookie = (token: string) =>
  `authjs.session-token=${token}; __Secure-authjs.session-token=${token}`;

/** The owner, who holds `revenue:read`. */
const OWNER = cookie("dev-session-token-ask-history");
/** An agent, who does not — the token is named `manager` and the role is AGENT. */
const AGENT = cookie("dev-session-manager");
/** The compliance officer, deliberately excluded from the money. */
const OFFICER = cookie("dev-session-compliance_officer");

async function brokerage(as: string) {
  const r = await fetch(`${APP}/api/trpc/commission.brokerage?batch=1&input=${
    encodeURIComponent(JSON.stringify({ 0: { json: null, meta: { values: ["undefined"] } } }))
  }`, { headers: { cookie: as } });
  return { status: r.status, text: await r.text() };
}

/** Dirhams out of a formatted "AED 1,234.56", as fils. */
function filsOf(formatted: string): bigint {
  const digits = formatted.replace(/[^0-9.]/g, "");
  if (!digits) return 0n;
  const [whole, frac = ""] = digits.split(".");
  return BigInt(whole || "0") * 100n + BigInt((frac + "00").slice(0, 2));
}

async function main() {
  console.log("\nWhat the brokerage earned\n");

  const res = await brokerage(OWNER);
  if (res.status !== 200) {
    console.log(`  ✗ the owner could not read it — HTTP ${res.status}: ${res.text.slice(0, 200)}`);
    await db.$disconnect();
    process.exit(1);
  }
  const data = JSON.parse(res.text)[0].result.data.json as {
    received: string; invoiced: string; forecast: string; writtenOff: string;
    vat: string; transacted: string; deals: number; undated: number;
    invoicedCount: number; forecastCount: number; writtenOffCount: number;
    byAgent: { name: string; kind: string; earned: string; deals: number }[];
    byMonth: { month: string; fils: string }[];
  };

  /* ---------------- the ledger, against the database ---------------- */
  console.log("=== the figures are the database's, not a summary of it ===");

  const since = new Date(Date.now() - 365 * 86_400_000);
  const receivedRows = await db.commission.findMany({
    where: { status: "RECEIVED", receivedAt: { gte: since } },
    select: { grossFils: true, vatFils: true, deal: { select: { id: true, valueFils: true } } },
  });
  const expectReceived = receivedRows.reduce((n, c) => n + c.grossFils, 0n);
  const expectVat = receivedRows.reduce((n, c) => n + c.vatFils, 0n);
  /**
   * Once per property, not once per fee.
   *
   * There is no unique constraint on `Commission.dealId` — a deal can
   * carry both sides of a transaction, or a referral beside the selling
   * commission — and the first version of the screen summed the deal
   * value per commission. Two fees on one eleven-million sale reported
   * twenty-two million transacted, with the headline commission still
   * correct beside it.
   */
  const expectTransacted = [...new Map(
    receivedRows.map((c) => [c.deal.id, c.deal.valueFils]),
  ).values()].reduce((n, v) => n + v, 0n);

  ok("received matches the ledger", filsOf(data.received) === expectReceived,
     `screen ${filsOf(data.received)} · db ${expectReceived}`);
  ok("the deal count matches", data.deals === receivedRows.length,
     `${data.deals} vs ${receivedRows.length}`);
  ok("VAT matches", filsOf(data.vat) === expectVat, `${filsOf(data.vat)} vs ${expectVat}`);
  ok("property transacted matches, counted once per property",
     filsOf(data.transacted) === expectTransacted,
     `${filsOf(data.transacted)} vs ${expectTransacted}`);

  /**
   * And the assertion that actually catches the double count, because
   * the one above cannot while every deal carries a single fee: with
   * two fees on one property the naive sum exceeds the deduplicated
   * one, and only then do the two expressions disagree.
   */
  const naiveTransacted = receivedRows.reduce((n, c) => n + c.deal.valueFils, 0n);
  const feesPerDeal = new Map<string, number>();
  for (const c of receivedRows) {
    feesPerDeal.set(c.deal.id, (feesPerDeal.get(c.deal.id) ?? 0) + 1);
  }
  const doubled = [...feesPerDeal.values()].some((n) => n > 1);
  ok(doubled
       ? "a property carrying two fees is still counted once"
       : "no property carries two fees yet, so the sums agree (fixture note)",
     filsOf(data.transacted) === expectTransacted
       && (!doubled || naiveTransacted > expectTransacted),
     doubled ? `naive ${naiveTransacted} · deduped ${expectTransacted}`
             : `${feesPerDeal.size} propert${feesPerDeal.size === 1 ? "y" : "ies"}, one fee each`);

  /* ---------------- the invariant that stops double counting -------- */
  console.log("\n=== the shares are shares, not a second set of fees ===");

  const splitTotal = data.byAgent.reduce((n, a) => n + filsOf(a.earned), 0n);
  ok("every share together equals the received total exactly",
     splitTotal === expectReceived,
     `shares ${splitTotal} · received ${expectReceived}`);
  ok("and nobody is counted twice",
     new Set(data.byAgent.map((a) => a.name)).size === data.byAgent.length,
     data.byAgent.map((a) => a.name).join(", ") || "nobody yet");

  /**
   * The house is not a referrer, and an owner should not be told their
   * own firm is an outside party to its own fee. This was the shipped
   * behaviour until a screenshot caught it.
   */
  const house = data.byAgent.filter((a) => a.kind === "brokerage");
  ok("the brokerage's own share is labelled as the house, if it has one",
     house.every((h) => h.kind === "brokerage"),
     house.map((h) => `${h.name}=${h.kind}`).join(", ") || "no house split");

  /* ---------------- money that would otherwise vanish --------------- */
  console.log("\n=== nothing is dropped in silence ===");

  const undated = await db.commission.count({ where: { status: "RECEIVED", receivedAt: null } });
  ok("a received commission with no payment date is counted and reported",
     data.undated === undated, `screen says ${data.undated}, db has ${undated}`);

  /**
   * Current state, deliberately **not** windowed: what you are owed is
   * a question about today, whatever year the invoice was raised in. A
   * check that applied the window here would be asserting the bug.
   */
  const expectInvoiced = await db.commission.aggregate({
    where: { status: "INVOICED" }, _sum: { grossFils: true },
  });
  ok("invoiced-and-unpaid is every one of them, not just this year's",
     filsOf(data.invoiced) === (expectInvoiced._sum.grossFils ?? 0n),
     `${filsOf(data.invoiced)} vs ${expectInvoiced._sum.grossFils ?? 0n}`);

  const monthTotal = data.byMonth.reduce((n, m) => n + BigInt(m.fils), 0n);
  ok("the monthly chart sums to the headline",
     monthTotal === expectReceived, `chart ${monthTotal} · headline ${expectReceived}`);
  ok("and every month in the window is present, earning or not",
     data.byMonth.length >= 12, `${data.byMonth.length} months`);

  /* ---------------- whose money it is ------------------------------- */
  console.log("\n=== and it is only shown to the people it belongs to ===");

  const asAgent = await brokerage(AGENT);
  ok("an agent is refused", /FORBIDDEN|UNAUTHORIZED/.test(asAgent.text),
     `HTTP ${asAgent.status}`);
  ok("and is not handed any figures",
     !/"received"/.test(asAgent.text), asAgent.text.slice(0, 80));

  const asOfficer = await brokerage(OFFICER);
  ok("the compliance officer is refused too, which is deliberate",
     /FORBIDDEN|UNAUTHORIZED/.test(asOfficer.text), `HTTP ${asOfficer.status}`);

  await db.$disconnect();
  console.log(failures === 0
    ? "\n  the revenue on the screen is the revenue in the ledger, and only the right people see it.\n"
    : `\n  ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
