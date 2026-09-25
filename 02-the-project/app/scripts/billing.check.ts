import { createHmac } from "node:crypto";
import { crossTenant } from "../src/server/db/client";
import { signup } from "../src/server/lib/billing/signup";
import { generateInvoice } from "../src/server/lib/billing/invoice";
import { invoiceNumber } from "../src/server/lib/billing/number";
import { recordAnswered } from "../src/server/lib/billing/conversations";
import { fatal } from "./fatal";

/**
 * Can this company take money?
 *
 * Until this existed the honest answer was "nobody has ever checked".
 * The billing code was written, reviewed and documented; no invoice had
 * ever been produced and no webhook had ever been verified. For a
 * business whose entire model is seats plus conversations, that is the
 * one path where "it compiles" is worth nothing.
 *
 * ## What this proves without Stripe credentials
 *
 * Everything except Stripe's own API:
 *
 *   - a brokerage can be created, with a subscription and seats
 *   - the invoice arithmetic is right, in fils, including VAT
 *   - the webhook endpoint **verifies signatures** against the raw body
 *   - a forged signature is refused
 *   - a replayed webhook is refused on age
 *   - a duplicate delivery is idempotent
 *
 * The signature tests are the valuable half and they are genuinely end
 * to end: this script computes a real HMAC and posts it over HTTP to the
 * running application, exactly as Stripe would.
 *
 * ## What it does not prove
 *
 * That Stripe accepts a charge. That needs a test-mode key and is the
 * one step a human has to run once:
 *
 *     STRIPE_SECRET_KEY=sk_test_… npm run check:billing
 *
 * With the key present the charge path is exercised against Stripe's
 * test mode. Without it, that single assertion is **skipped and said to
 * be skipped** rather than quietly passing — the distinction this
 * codebase keeps insisting on.
 *
 *     npm run dev
 *     npm run check:billing
 */
const root = crossTenant("sweep");
const SLUG = "billing-check-";
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_check_only_secret";

const fails: string[] = [];
let skipped = 0;
function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}
function skip(label: string, why: string) {
  console.log(`  · ${label}  — skipped: ${why}`);
  skipped++;
}

/** A Stripe-shaped signature header over the exact bytes being posted. */
function sign(body: string, secondsOld = 0) {
  const t = Math.floor(Date.now() / 1000) - secondsOld;
  const v1 = createHmac("sha256", SECRET).update(`${t}.${body}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

async function post(body: string, signature: string | null) {
  const res = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  console.log("\nCan this company take money?\n");

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });

  /* ---------------- a brokerage exists and is billable ------------- */
  console.log("Signing a brokerage up:");

  const seatPrice = 99_00n;   // AED 99, in fils
  const result = await signup({
    brokerageName: "Billing Check Brokerage",
    ownerEmail: "billing-check@example.com",
    ownerName: "Billing Check Owner",
    seats: 10,
    // So "carries the brokerage's TRN" compares a number, not two nulls.
    trn: "100000000000011",
    seatPriceFils: seatPrice,
  });

  ok("signup succeeded", result.ok, result.ok ? "" : (result as { reason: string }).reason);
  if (!result.ok) return;

  // By id from the signup result, not by a slug guessed here. `signup`
  // derives the slug from the brokerage name, so a hand-written one is
  // a second source of truth that is wrong the moment the name changes.
  const org = await root.organisation.findUnique({ where: { id: result.orgId } });
  ok("the organisation exists", Boolean(org), org?.name);

  /**
   * `subscription`, not `planSubscription`.
   *
   * The first version of this check asserted the wrong table and
   * "proved" that signup writes no subscription at all — which would
   * have meant the company could not invoice anybody. It was wrong.
   * There are two models with confusingly similar names:
   *
   *   Subscription      the billing agreement. Signup creates it.
   *   PlanSubscription  a task-plan subscription, read by the jobs
   *                     sweep. Nothing to do with money.
   *
   * Worth recording because the near-miss was a false alarm of the
   * worst kind: a red check, on the revenue path, that looked exactly
   * like the read-but-never-written shape this codebase keeps finding.
   */
  const sub = org
    ? await root.subscription.findFirst({ where: { orgId: org.id } })
    : null;
  ok("a billing subscription was written", Boolean(sub),
     sub ? `AED ${Number(sub.seatPriceFils) / 100}/seat/month`
         : "signup created no Subscription — nothing to invoice against");

  /* ---------------- the arithmetic --------------------------------- */
  console.log("\nThe invoice:");

  if (org && sub) {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const draft = await generateInvoice(sub.id, from, to);

    ok("an invoice can be produced", Boolean(draft), draft ? "" : "buildInvoice returned nothing");

    if (draft) {
      const d = draft as unknown as {
        subtotalFils: bigint; vatFils: bigint; totalFils: bigint; seatFils: bigint;
      };
      ok("every amount is an integer number of fils",
         [d.subtotalFils, d.vatFils, d.totalFils].every((v) => typeof v === "bigint"),
         "a float here is how a customer is billed 0.1 + 0.2");

      ok("the total is subtotal plus VAT",
         d.totalFils === d.subtotalFils + d.vatFils,
         `${d.subtotalFils} + ${d.vatFils} = ${d.totalFils}`);

      // UAE VAT is 5%. Rounding is allowed to differ by a fil.
      const expectedVat = (d.subtotalFils * 5n) / 100n;
      const drift = d.vatFils > expectedVat ? d.vatFils - expectedVat : expectedVat - d.vatFils;
      ok("VAT is 5% of the subtotal", drift <= 1n,
         `${d.vatFils} vs ${expectedVat} expected`);

      ok("the invoice is not free", d.totalFils > 0n, `${d.totalFils} fils`);

      /**
       * A brand-new subscription bills a very small number, and that is
       * correct rather than alarming — worth asserting so nobody reads
       * the figure as an undercharge.
       *
       * `generateInvoice` charges seat-*days*: the per-seat-day rate is
       * the monthly price divided by the period length, multiplied by
       * how many seat-days actually existed. Ten seats created seconds
       * ago have accrued about one seat-day, so 330 fils is one day at
       * AED 99/30. The check that matters is that a *full* period would
       * cost the full price.
       */
      const monthly = Number(seatPrice) * 10;          // 10 seats, one month
      ok("the invoice is prorated, not a full month",
         Number(d.subtotalFils) < monthly,
         `${d.subtotalFils} fils billed against ${monthly} for a full month — seat-days, not a flat charge`);
    }

    /* ---------------- the number on it ---------------------------- */
    /**
     * One series for the supplier. Numbers were per brokerage, prefixed
     * with six characters of an internal id — dozens of parallel series
     * under one TRN, where the VAT regulation expects the issuer's
     * sequence to show every supply.
     */
    console.log("\nThe invoice number:");
    const seq = async () => (await root.invoiceSequence.findUniqueOrThrow({ where: { id: "supplier" } })).next;
    const at = (days: number) => new Date(to.getTime() + days * 86_400_000);
    const n = (num: string) => Number(num.replace(/^PF-/, ""));

    ok("it comes from the supplier's one series", /^PF-\d{6}$/.test(draft.number), draft.number);
    ok("and carries PotatoFarm's VAT registration and the brokerage's",
       draft.supplierTrn === process.env.SUPPLIER_TRN?.replace(/\s/g, "") && draft.customerTrn === "100000000000011",
       `${draft.supplierTrn} / ${draft.customerTrn}`);

    const second = await signup({
      brokerageName: "Billing Check Second", ownerEmail: "billing-check-second@example.com",
      ownerName: "Second Owner", seats: 8, seatPriceFils: seatPrice,
    });
    const otherSub = second.ok ? await root.subscription.findFirst({ where: { orgId: second.orgId } }) : null;
    if (otherSub) {
      // Two brokerages, invoiced at the same moment.
      const [a, b] = await Promise.all([
        generateInvoice(sub.id, at(0), at(30)),
        generateInvoice(otherSub.id, at(0), at(30)),
      ]);
      ok("two brokerages invoiced at once share the one series, one after the other",
         Math.abs(n(a.number) - n(b.number)) === 1, `${a.number}, ${b.number}`);

      // A failure must give its number back. Plant an invoice holding the
      // next number, so the insert fails after the number is taken.
      const next = await seq();
      const { id: _id, providerRef: _ref, ...copy } = a;
      const planted = await root.invoice.create({ data: { ...copy, number: invoiceNumber(next) } });
      let failed = false;
      try { await generateInvoice(sub.id, at(30), at(60)); } catch { failed = true; }
      ok("an invoice that fails to save gives its number back", failed && (await seq()) === next,
         `failed ${failed}, series at ${await seq()} (was ${next})`);
      await root.invoice.delete({ where: { id: planted.id } });
      const c = await generateInvoice(sub.id, at(30), at(60));
      ok("so the next one takes it and the series has no hole", c.number === invoiceNumber(next), c.number);

      // Without PotatoFarm's registration, nothing is issued and no
      // number is used up.
      const held = process.env.SUPPLIER_TRN;
      const before = { count: await root.invoice.count(), next: await seq() };
      delete process.env.SUPPLIER_TRN;
      let refused = false;
      try { await generateInvoice(sub.id, at(60), at(90)); } catch { refused = true; }
      process.env.SUPPLIER_TRN = held;
      ok("no VAT invoice is issued without PotatoFarm's VAT registration",
         refused && (await root.invoice.count()) === before.count && (await seq()) === before.next);

      // Five years' retention, and a gap in the series: removing a
      // subscription used to take its invoices with it.
      const kept = await root.subscription.delete({ where: { id: sub.id } }).then(() => false, () => true);
      ok("a subscription with invoices cannot be deleted out from under them",
         kept && (await root.invoice.count({ where: { subId: sub.id } })) > 0);
    } else {
      ok("a second brokerage to invoice alongside the first", false, second.ok ? "no subscription" : second.reason);
    }
  }

  /* ---------------- the webhook, over real HTTP -------------------- */
  console.log("\nThe payment webhook, posted over HTTP:");

  const eventId = `evt_check_${Date.now()}`;
  const body = JSON.stringify({
    id: eventId,
    type: "payment_intent.succeeded",
    data: { object: { id: `pi_check_${Date.now()}`, status: "succeeded" } },
  });

  let reachable = true;
  try {
    const good = await post(body, sign(body));
    ok("a correctly signed event is accepted", good.status === 200, `HTTP ${good.status}`);
  } catch (e) {
    reachable = false;
    ok("the application is running", false,
       `${BASE} unreachable — start it with \`npm run dev\` (${e instanceof Error ? e.message : e})`);
  }

  if (reachable) {
    const forged = await post(body, "t=" + Math.floor(Date.now() / 1000) + ",v1=" + "0".repeat(64));
    ok("a forged signature is refused", forged.status === 401, `HTTP ${forged.status}`);

    const unsigned = await post(body, null);
    ok("an unsigned request is refused", unsigned.status === 401, `HTTP ${unsigned.status}`);

    /**
     * Replay. A captured webhook must not be usable for ever, or anyone
     * who once saw one can re-mark an invoice paid at will.
     */
    const stale = await post(body, sign(body, 600));
    ok("a replayed event more than five minutes old is refused",
       stale.status === 401, `HTTP ${stale.status}`);

    /**
     * Idempotency. Stripe redelivers; a redelivery must not settle an
     * invoice twice.
     */
    const again = await post(body, sign(body));
    ok("a duplicate delivery is idempotent",
       again.status === 200 && again.json?.duplicate === true,
       `HTTP ${again.status} duplicate=${again.json?.duplicate}`);

    const events = await root.paymentEvent.count({ where: { providerId: eventId } });
    ok("the duplicate was not recorded twice", events === 1, `${events} row(s)`);
  }

  /* ---------------- a charge is per the brokerage's day ------------ */
  console.log("\nConversations are charged per day — the brokerage's day:");
  if (org && sub) {
    /**
     * Charges were bucketed on the UTC day, which in Dubai turns over at
     * 4am. Once per conversation per day is the rule on the bill, and
     * the customer's day is the one they are in.
     */
    const channel = await root.channel.create({
      data: { orgId: org.id, type: "WHATSAPP", label: "Billing check", identifier: `+9714${Date.now() % 1e7}` },
    });
    const convo = async (n: string) => {
      const lead = await root.lead.create({ data: { orgId: org.id, phone: `+97150${n}${Date.now() % 1e5}`, name: "Billing Check" } });
      return root.conversation.create({ data: { orgId: org.id, leadId: lead.id, channelId: channel.id } });
    };
    const count = (id: string) => root.conversationCharge.count({ where: { conversationId: id } });
    // 03:30 and 04:30 Dubai (23:30 and 00:30 UTC) — one Dubai day.
    const small = await convo("11");
    await recordAnswered({ orgId: org.id, conversationId: small.id, at: new Date("2026-09-10T23:30:00Z") });
    await recordAnswered({ orgId: org.id, conversationId: small.id, at: new Date("2026-09-11T00:30:00Z") });
    ok("3:30am and 4:30am in Dubai are one charge", (await count(small.id)) === 1, `${await count(small.id)} charges`);
    // 23:30 and 00:30 Dubai (19:30 and 20:30 UTC) — two Dubai days.
    const late = await convo("22");
    await recordAnswered({ orgId: org.id, conversationId: late.id, at: new Date("2026-09-10T19:30:00Z") });
    await recordAnswered({ orgId: org.id, conversationId: late.id, at: new Date("2026-09-10T20:30:00Z") });
    ok("11:30pm and 12:30am in Dubai are two", (await count(late.id)) === 2, `${await count(late.id)} charges`);
    await root.conversationCharge.deleteMany({ where: { orgId: org.id } });
    await root.conversation.deleteMany({ where: { orgId: org.id } });
    await root.lead.deleteMany({ where: { orgId: org.id } });
    await root.channel.deleteMany({ where: { orgId: org.id } });
  }

  /* ---------------- the one step that needs a key ------------------ */
  console.log("\nStripe itself:");
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    skip("a test-mode charge is accepted",
         "set STRIPE_SECRET_KEY=sk_test_… to exercise the real API");
    console.log("      Nothing above proves Stripe will take a payment. That is");
    console.log("      one command with a test key, and it is the last gap.");
  } else {
    const { stripe } = await import("../src/server/lib/billing/provider");
    const res = await stripe.charge({
      customerId: process.env.STRIPE_TEST_CUSTOMER ?? "",
      amountFils: 100_00n,
      currency: "AED",
      invoiceNumber: `CHECK-${Date.now()}`,
      idempotencyKey: `check-${Date.now()}`,
    } as Parameters<typeof stripe.charge>[0]);
    ok("a test-mode charge is accepted", Boolean(res), JSON.stringify(res).slice(0, 90));
  }

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
}

main()
  .then(() => {
    if (fails.length) {
      console.log(`\n${fails.length} FAILURE(S)`);
      for (const f of fails) console.log(`  · ${f}`);
      console.log("");
      process.exit(1);
    }
    console.log(skipped
      ? `\nthe money path works, except ${skipped} step needing a Stripe key.\n`
      : "\nthe money path works end to end.\n");
    process.exit(0);
  })
  .catch(fatal);
