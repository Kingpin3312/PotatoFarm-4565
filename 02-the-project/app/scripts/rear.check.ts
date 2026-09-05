/**
 * A transaction becomes reportable, and somebody is told.
 *
 * ## What this is about
 *
 * A UAE brokerage owes the FIU a **Real Estate Activity Report** when a
 * deal settles with AED 55,000 or more in physical cash — a single
 * payment or several linked across ninety days — or with any virtual
 * asset at any amount.
 *
 * `assessRear()` has implemented that correctly since it was written and
 * is covered by unit tests. **Nothing called it.** The payments it takes
 * as input had nowhere to be recorded — `PaymentEvent` is Stripe's, our
 * own subscription billing — so a brokerage could take sixty thousand
 * dirhams in cash across three visits and the product, holding the code
 * that knows that is reportable, would say nothing.
 *
 * The unit tests prove the arithmetic. This proves the **path**: a
 * payment recorded through the router reaches the assessment, and the
 * threshold cases land on the right side.
 *
 *     npm run build && npm run start
 *     npm run check:rear
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

const tag = randomUUID().slice(0, 8);
const APP = process.env.APP_URL ?? "http://localhost:3000";
const COOKIE =
  "authjs.session-token=dev-session-token-ask-history; " +
  "__Secure-authjs.session-token=dev-session-token-ask-history";

async function call(proc: string, json: unknown) {
  const r = await fetch(`${APP}/api/trpc/${proc}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: COOKIE },
    body: JSON.stringify({ 0: { json } }),
  });
  return { status: r.status, body: await r.text() };
}
/**
 * The compliance officer, who is a different person on purpose.
 *
 * `aml.reportable` takes `compliance:read`, which an owner does not
 * have — telling a client a report was filed is an offence and the
 * separation is a legal requirement rather than a permissions
 * preference. A check that read this desk as the owner would be
 * asserting against a role that must never see it.
 */
const OFFICER =
  "authjs.session-token=dev-session-compliance_officer; " +
  "__Secure-authjs.session-token=dev-session-compliance_officer";

async function reportable() {
  const r = await fetch(`${APP}/api/trpc/aml.reportable?batch=1`, { headers: { cookie: OFFICER } });
  const text = await r.text();
  if (r.status !== 200) throw new Error(`aml.reportable HTTP ${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text)[0].result.data.json as {
    reportable: { reference: string; rear: { reason?: string } }[];
    dealsWithPayments: number;
  };
}

async function read(dealId: string) {
  const q = encodeURIComponent(JSON.stringify({ 0: { json: { dealId } } }));
  const r = await fetch(`${APP}/api/trpc/deals.payments?batch=1&input=${q}`, {
    headers: { cookie: COOKIE },
  });
  const text = await r.text();
  if (r.status !== 200) throw new Error(`deals.payments HTTP ${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text)[0].result.data.json as {
    rear: { required: boolean; reason?: string; linkedPayments: number };
    totalFils: string;
  };
}

/** Days ago, as the ISO string the router accepts. */
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function main() {
  console.log("\nA transaction becomes reportable, and somebody is told\n");

  const up = await fetch(`${APP}/api/health`).then((r) => r.ok).catch(() => false);
  if (!up) {
    console.error(`  Nothing is serving ${APP}. Run \`npm run build && npm run start\` first.`);
    await db.$disconnect();
    process.exit(1);
  }

  const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
  if (!org) { console.error("no organisation"); process.exit(1); }

  const made: string[] = [];
  async function deal(ref: string) {
    const d = await db.deal.create({
      data: {
        orgId: org!.id, reference: `${ref}-${tag}`, type: "SALE",
        valueFils: 2_000_000_00n, stage: "AGREED",
      },
      select: { id: true },
    });
    made.push(d.id);
    return d.id;
  }

  // ---- under the threshold ----
  const quiet = await deal("RQ");
  let r = await call("deals.recordPayment", {
    dealId: quiet, amountFils: 5_000_000, method: "CASH", receivedAt: ago(2),
  });
  ok("a payment can be recorded at all", r.status === 200 && !r.body.includes('"error"'),
     `HTTP ${r.status}`);
  let a = await read(quiet);
  ok("AED 50,000 in cash is under the threshold and stays quiet", a.rear.required === false,
     a.rear.reason ?? "not required");

  // ---- one payment over it ----
  const single = await deal("RS");
  await call("deals.recordPayment", {
    dealId: single, amountFils: 5_500_000, method: "CASH", receivedAt: ago(1),
  });
  a = await read(single);
  ok("AED 55,000 exactly is reportable — the threshold is inclusive", a.rear.required === true,
     a.rear.reason ?? "not required");

  // ---- linked payments, the half that gets missed ----
  const linked = await deal("RL");
  for (const d of [3, 9, 20]) {
    await call("deals.recordPayment", {
      dealId: linked, amountFils: 2_000_000, method: "CASH", receivedAt: ago(d),
    });
  }
  a = await read(linked);
  ok("three cash payments of AED 20,000 across a fortnight are linked", a.rear.required === true,
     a.rear.reason ?? "not required");
  ok("and the reason says how many, so it can be argued with",
     a.rear.linkedPayments === 3, String(a.rear.linkedPayments));

  // ---- outside the window ----
  const stale = await deal("RO");
  await call("deals.recordPayment", {
    dealId: stale, amountFils: 3_000_000, method: "CASH", receivedAt: ago(200),
  });
  await call("deals.recordPayment", {
    dealId: stale, amountFils: 3_000_000, method: "CASH", receivedAt: ago(5),
  });
  a = await read(stale);
  ok("a payment from 200 days ago is not linked to a recent one", a.rear.required === false,
     a.rear.reason ?? "not required");

  // ---- the method that triggers regardless ----
  const crypto = await deal("RV");
  await call("deals.recordPayment", {
    dealId: crypto, amountFils: 100_00, method: "VIRTUAL_ASSET", receivedAt: ago(1),
  });
  a = await read(crypto);
  ok("a virtual asset triggers it at any amount", a.rear.required === true,
     a.rear.reason ?? "not required");

  // ---- a transfer is not cash ----
  const wire = await deal("RT");
  await call("deals.recordPayment", {
    dealId: wire, amountFils: 500_000_00, method: "TRANSFER", receivedAt: ago(1),
  });
  a = await read(wire);
  ok("a bank transfer of AED 500,000 is not a cash trigger", a.rear.required === false,
     a.rear.reason ?? "not required");

  // ---- a date typo must not suppress a report ----
  const future = await call("deals.recordPayment", {
    dealId: wire, amountFils: 6_000_000, method: "CASH",
    receivedAt: new Date(Date.now() + 40 * 86_400_000).toISOString(),
  });
  ok("a payment dated in the future is refused",
     future.status !== 200 || future.body.includes('"error"'),
     "outside the window, it would silently suppress a mandatory report");

  /**
   * The compliance desk, and the distinction its panel exists to make.
   *
   * The REAR section was removed from that screen once, and the note
   * left behind made the argument: an officer seeing an empty list would
   * reasonably read it as "nothing reportable", and this is the one
   * screen where absence of an alert must not be mistaken for an
   * all-clear. So the panel never prints an empty list on its own — it
   * carries how many transactions were examined to reach it.
   *
   * These two assertions are that distinction. If they ever collapse
   * into each other, the screen has started lying in the most expensive
   * direction available to it.
   */
  console.log("");
  const desk = await reportable();
  ok("the compliance desk sees the reportable ones",
     desk.reportable.some((r) => r.reference.includes(`RS-${tag}`)),
     `${desk.reportable.length} listed`);
  ok("and counts what it examined, so empty is not mistaken for all-clear",
     desk.dealsWithPayments >= 5, `${desk.dealsWithPayments} transaction(s) assessed`);
  ok("a transfer-only transaction is examined but not listed",
     desk.reportable.every((r) => !r.reference.includes(`RT-${tag}`)),
     "examined and cleared is a different fact from never looked at");

  await db.dealPayment.deleteMany({ where: { dealId: { in: made } } });
  await db.deal.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();

  console.log(failures === 0
    ? "\n  cash crossing the line is caught, and a transfer is not mistaken for it.\n"
    : `\n  ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
