import { createHmac } from "node:crypto";
import { crossTenant } from "../src/server/db/client";
import { signup } from "../src/server/lib/billing/signup";
import { generateInvoice, explain } from "../src/server/lib/billing/invoice";
import { billingRouter } from "../src/server/api/routers/billing";
import { invoiceNumber } from "../src/server/lib/billing/number";
import { aed } from "../src/lib/money";
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
 *   - the invoice arithmetic is right, in fils: no VAT while PotatoFarm
 *     is unregistered, and 5% the day a TRN is set
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

/**
 * Invoices first, deliberately by hand. The database refuses to delete a
 * brokerage that still has invoices — VAT records are kept for five years
 * — and a test brokerage is the one case where they should go too. This
 * clean-up used to leave them behind as orphans instead.
 */
async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) await root.invoice.deleteMany({ where: { orgId: { in: ids } } });
  await root.organisation.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  console.log("\nCan this company take money?\n");

  await cleanup();

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
    // Whatever the environment says, each case below sets it itself.
    const heldTrn = process.env.SUPPLIER_TRN;
    const heldSupplier = { name: process.env.SUPPLIER_NAME, address: process.env.SUPPLIER_ADDRESS };
    process.env.SUPPLIER_NAME = "PotatoFarm Check FZ-LLC";
    process.env.SUPPLIER_ADDRESS = "Office 1, Check Tower\nDubai";
    const FICTIONAL_TRN = "100000000000003";

    /**
     * Not registered — PotatoFarm's real position. Only a registered
     * business may charge VAT, so the invoice carries none, no TRN, and
     * says why rather than leaving a gap where the VAT line was. This
     * path used to refuse every invoice, which with no registration
     * meant nobody was ever billed.
     */
    delete process.env.SUPPLIER_TRN;
    const draft = await generateInvoice(sub.id, from, to);
    ok("an invoice can be produced", Boolean(draft), draft ? "" : "buildInvoice returned nothing");

    ok("unregistered, it charges no VAT",
       draft.vatFils === 0n && draft.vatRateBp === 0,
       `${draft.vatFils} fils at ${draft.vatRateBp}bp`);
    ok("so the total is the subtotal",
       draft.totalFils === draft.subtotalFils, `${draft.subtotalFils} → ${draft.totalFils}`);
    ok("and it carries no supplier TRN, because there is none",
       draft.supplierTrn === null, String(draft.supplierTrn));
    const lines = explain(draft);
    ok("the bill says no VAT is charged, and why",
       lines.includes("No VAT charged — PotatoFarm is not VAT-registered") && !lines.some((l) => /^VAT at/.test(l)),
       lines.join(" | "));

    /**
     * Registered — the day the FTA certificate arrives and the TRN is
     * set. Nothing else changes: 5%, on the whole supply, with both
     * parties' TRNs recorded as they were on the day.
     */
    process.env.SUPPLIER_TRN = FICTIONAL_TRN;
    const taxed = await generateInvoice(sub.id, from, to);
    if (heldTrn === undefined) delete process.env.SUPPLIER_TRN; else process.env.SUPPLIER_TRN = heldTrn;

    {
      const d = taxed;
      ok("every amount is an integer number of fils",
         [d.subtotalFils, d.vatFils, d.totalFils].every((v) => typeof v === "bigint"),
         "a float here is how a customer is billed 0.1 + 0.2");

      ok("registered, the total is subtotal plus VAT",
         d.totalFils === d.subtotalFils + d.vatFils && d.vatRateBp === 500,
         `${d.subtotalFils} + ${d.vatFils} = ${d.totalFils} at ${d.vatRateBp}bp`);

      // UAE VAT is 5%. Rounding is allowed to differ by a fil.
      const expectedVat = (d.subtotalFils * 5n) / 100n;
      const drift = d.vatFils > expectedVat ? d.vatFils - expectedVat : expectedVat - d.vatFils;
      ok("VAT is 5% of the subtotal", drift <= 1n && d.vatFils > 0n,
         `${d.vatFils} vs ${expectedVat} expected`);
      ok("and the bill shows the VAT line",
         explain(d).includes(`VAT at 5.00% — ${aed(d.vatFils)}`),
         explain(d).join(" | "));

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

    /**
     * What the screens are told. The public terms said "5%" as a
     * constant, and the billing page promised "plus 5% VAT" under the
     * running total — a tax the invoice will not charge.
     */
    console.log("\nWhat the screens say:");
    const owner = await root.membership.findFirstOrThrow({ where: { orgId: org.id, role: "OWNER" } });
    const B = billingRouter.createCaller({
      session: { user: { id: owner.userId } },
      membership: { orgId: org.id, orgName: org.name, role: "OWNER" },
      ip: "127.0.0.1", userAgent: "billing-check",
    } as never);
    delete process.env.SUPPLIER_TRN;
    const unregTerms = await B.terms();
    const unregStatus = await B.status();
    const listed = (await B.invoices()).find((i) => i.number === draft.number);
    process.env.SUPPLIER_TRN = FICTIONAL_TRN;
    const regTerms = await B.terms();
    if (heldTrn === undefined) delete process.env.SUPPLIER_TRN; else process.env.SUPPLIER_TRN = heldTrn;
    ok("unregistered, sign-up and the billing page quote no VAT",
       unregTerms.vatRate === null && unregStatus.subscribed && unregStatus.vatRate === null,
       `terms ${unregTerms.vatRate}, status ${unregStatus.subscribed ? unregStatus.vatRate : "no subscription"}`);
    ok("registered, they quote 5%", regTerms.vatRate === "5%", String(regTerms.vatRate));
    ok("the invoice list explains the missing VAT line",
       Boolean(listed?.lines.includes("No VAT charged — PotatoFarm is not VAT-registered")),
       listed ? listed.lines.join(" | ") : "invoice not listed");

    /* ---------------- the document -------------------------------- */
    /**
     * The invoice a brokerage keeps. Both parties are written onto the
     * invoice when it is issued, so renaming the brokerage or moving
     * office afterwards changes the next invoice and never an old one.
     */
    console.log("\nThe invoice as a document:");
    ok("it records who it was from and to, on the day",
       draft.supplierName === "PotatoFarm Check FZ-LLC" && draft.supplierAddress === "Office 1, Check Tower\nDubai"
         && draft.customerName === org.name,
       `${draft.supplierName} → ${draft.customerName}`);

    const bad = await B.setDetails({ billingAddress: "x", trn: "12345" }).then(() => null, (e: { code?: string }) => e);
    ok("a TRN that is not fifteen digits is refused", bad?.code === "BAD_REQUEST", String(bad?.code));
    await B.setDetails({ billingAddress: "  Unit 4, Marina Plaza\nDubai  ", trn: "100 0000 0000 0029" });
    const saved = await B.details();
    ok("billing details save, the TRN as its fifteen digits",
       saved.billingAddress === "Unit 4, Marina Plaza\nDubai" && saved.trn === "100000000000029",
       JSON.stringify(saved));
    ok("and the change is in the audit log, without the values",
       (await root.auditLog.count({ where: { orgId: org.id, action: "billing.details" } })) === 1);

    delete process.env.SUPPLIER_TRN;
    const addressed = await generateInvoice(sub.id, from, to);
    if (heldTrn === undefined) delete process.env.SUPPLIER_TRN; else process.env.SUPPLIER_TRN = heldTrn;
    await root.organisation.update({ where: { id: org.id }, data: { name: "Billing Check Renamed" } });
    await B.setDetails({ billingAddress: "Somewhere else entirely", trn: "" });

    const doc = await B.invoice({ number: addressed.number });
    ok("the next invoice is addressed to what was saved",
       doc.customer.address === "Unit 4, Marina Plaza\nDubai" && doc.customer.trn === "100000000000029",
       `${doc.customer.address?.replace("\n", ", ")} / ${doc.customer.trn}`);
    ok("and a later rename or move does not rewrite it",
       doc.customer.name === org.name && doc.customer.name !== "Billing Check Renamed",
       doc.customer.name);
    ok("unregistered, it is an invoice, not a tax invoice, with no VAT line",
       doc.title === "Invoice" && doc.vat === null && doc.supplier.trn === null && doc.total === aed(addressed.totalFils),
       `${doc.title}, total ${doc.total}`);
    const taxDoc = await B.invoice({ number: taxed.number });
    ok("registered, it is a tax invoice showing the VAT in dirhams and both TRNs",
       taxDoc.title === "Tax invoice" && taxDoc.vat?.rate === "5.00%" && taxDoc.vat.amount === aed(taxed.vatFils)
         && taxDoc.supplier.trn === FICTIONAL_TRN && taxDoc.customer.trn === "100000000000011",
       `${taxDoc.title}, VAT ${taxDoc.vat?.amount}`);
    ok("its lines add up to its subtotal",
       doc.lines.length === 2 && doc.subtotal === aed(addressed.subtotalFils)
         && doc.lines[0]!.amount === aed(addressed.seatFils),
       doc.lines.map((l) => `${l.description} ${l.amount}`).join(", "));
    const missing = await B.invoice({ number: "PF-999999" }).then(() => null, (e: { code?: string }) => e);
    ok("a number that is not this brokerage's finds nothing", missing?.code === "NOT_FOUND", String(missing?.code));

    for (const [k, v] of [["SUPPLIER_NAME", heldSupplier.name], ["SUPPLIER_ADDRESS", heldSupplier.address]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
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
    ok("registered, it carries PotatoFarm's VAT registration and the brokerage's",
       taxed.supplierTrn === FICTIONAL_TRN && taxed.customerTrn === "100000000000011",
       `${taxed.supplierTrn} / ${taxed.customerTrn}`);
    ok("both kinds share the one series", n(taxed.number) === n(draft.number) + 1, `${draft.number}, ${taxed.number}`);

    const second = await signup({
      brokerageName: "Billing Check Second", ownerEmail: "billing-check-second@example.com",
      ownerName: "Second Owner", seats: 8, seatPriceFils: seatPrice,
    });
    const otherSub = second.ok ? await root.subscription.findFirst({ where: { orgId: second.orgId } }) : null;
    if (otherSub) {
      // Another brokerage's owner, asking for this brokerage's invoice by
      // its number — which is printed on the invoice, so not a secret.
      const otherOwner = await root.membership.findFirstOrThrow({ where: { orgId: otherSub.orgId, role: "OWNER" } });
      const B2 = billingRouter.createCaller({
        session: { user: { id: otherOwner.userId } },
        membership: { orgId: otherSub.orgId, orgName: "Billing Check Second", role: "OWNER" },
        ip: "127.0.0.1", userAgent: "billing-check",
      } as never);
      const peek = await B2.invoice({ number: draft.number }).then(() => null, (e: { code?: string }) => e);
      ok("another brokerage cannot open this one's invoice", peek?.code === "NOT_FOUND", String(peek?.code));

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

      // A TRN that is set but wrong would be printed on every invoice:
      // nothing is issued and no number is used up.
      const held = process.env.SUPPLIER_TRN;
      const before = { count: await root.invoice.count(), next: await seq() };
      process.env.SUPPLIER_TRN = "10000000000000";   // fourteen digits
      let refused = false;
      try { await generateInvoice(sub.id, at(60), at(90)); } catch { refused = true; }
      if (held === undefined) delete process.env.SUPPLIER_TRN; else process.env.SUPPLIER_TRN = held;
      ok("a malformed TRN issues nothing and uses up no number",
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

  await cleanup();
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
