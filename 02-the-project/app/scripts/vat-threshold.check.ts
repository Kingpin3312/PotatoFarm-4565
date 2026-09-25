import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { signup } from "../src/server/lib/billing/signup";
import { vatPosition, VOLUNTARY_FILS } from "../src/server/lib/billing/vat-threshold";
import { JOBS } from "../src/server/jobs";
import { fatal } from "./fatal";

/**
 * Will anybody be told when VAT registration stops being optional?
 *
 * PotatoFarm is not VAT-registered and charges none. That is lawful only
 * while turnover stays at or under AED 375,000 over twelve months, and
 * the cost of finding out late is the VAT that should have been charged,
 * paid out of PotatoFarm's own pocket. So this runs **the real daily job**
 * against invoices written for the purpose, with a stand-in for the mail
 * provider on loopback, and asserts on what actually left:
 *
 *   - turnover counts issued invoices from the last twelve months, before
 *     VAT, and nothing voided, drafted or older
 *   - the thirty-day figure is the paying brokerages' seats at their price
 *   - a warning the mailer could not send is not remembered as sent
 *   - one email per step up, not one a day
 *   - silence once a TRN is set
 *
 *     npm run check:vat-threshold
 */
const root = crossTenant("sweep");
const SLUG = "vat-threshold-check-";
const RUN = Date.now().toString(36);
const JOB = "billing.vat-threshold";
const AED = (n: number) => BigInt(Math.round(n * 100));
const DAY = 86_400_000;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};

const mail: { to: string; subject: string; html: string }[] = [];
const standIn = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/emails") {
      const body = JSON.parse(raw);
      mail.push({ to: body.to, subject: body.subject, html: body.html });
      res.end(JSON.stringify({ id: `email-${mail.length}` }));
      return;
    }
    res.statusCode = 404; res.end("{}");
  });
});

let made = 0;
async function invoice(orgId: string, subId: string, subtotalFils: bigint, o: {
  daysAgo?: number; status?: "OPEN" | "PAID" | "FAILED" | "VOID" | "DRAFT"; overageFils?: bigint;
} = {}) {
  const issuedAt = new Date(Date.now() - (o.daysAgo ?? 1) * DAY);
  return root.invoice.create({
    data: {
      orgId, subId,
      // Outside the supplier's series on purpose: these are fixtures, and
      // a PF- number taken here would be a hole in the real one.
      number: `VTCHECK-${RUN}-${++made}`,
      periodFrom: new Date(issuedAt.getTime() - 30 * DAY), periodTo: issuedAt,
      seatDays: 1, seatDaysFull: 30,
      overageFils: o.overageFils ?? 0n,
      subtotalFils, vatRateBp: 0, vatFils: 0n, totalFils: subtotalFils,
      status: o.status ?? "OPEN", issuedAt, dueAt: new Date(issuedAt.getTime() + 14 * DAY),
    },
  });
}

const runJob = async () => {
  await JOBS[JOB]();
  const last = await root.jobRun.findFirst({
    where: { job: JOB }, orderBy: { startedAt: "desc" }, select: { state: true, result: true },
  });
  return { state: last?.state, result: (last?.result ?? {}) as Record<string, unknown> };
};

async function cleanup() {
  await root.invoice.deleteMany({ where: { number: { startsWith: "VTCHECK-" } } });
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    await root.invoice.deleteMany({ where: { orgId: { in: ids } } });
    // Subscription has no foreign key to Organisation, so deleting the
    // organisation alone leaves a paying subscription behind — and this
    // check's own next run counted it as a month's billing.
    await root.subscription.deleteMany({ where: { orgId: { in: ids } } });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "vat-threshold-check-" } } }).catch(() => {});
  // The job reads its own last result as memory. Only this check writes
  // runs of it outside production, and a stale one would decide the next.
  await root.jobRun.deleteMany({ where: { job: JOB } });
}

async function main() {
  console.log("\nWill anybody be told when VAT registration stops being optional?\n");
  await new Promise<void>((r) => standIn.listen(0, "127.0.0.1", () => r()));
  process.env.RESEND_API_BASE = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  process.env.SALES_INBOX = "owner@potatofarm.test";
  const heldKey = process.env.RESEND_API_KEY;
  const heldTrn = process.env.SUPPLIER_TRN;
  delete process.env.SUPPLIER_TRN;       // not registered: the real position
  delete process.env.RESEND_API_KEY;
  await cleanup();

  // Taken before the brokerage exists, so a trial wrongly counted shows
  // up as a difference. Taken after, it is in both figures and cancels.
  const base = await vatPosition();
  if (base.trailingFils >= VOLUNTARY_FILS) {
    throw new Error(`This database already holds ${base.trailingFils} fils of invoices this year; the check needs to start below AED 187,500.`);
  }

  const s = await signup({
    brokerageName: `VAT Threshold Check ${RUN}`, ownerEmail: `vat-threshold-check-${RUN}@example.com`,
    ownerName: "Threshold Owner", seats: 8, seatPriceFils: 25_708n,
  });
  if (!s.ok) throw new Error(`signup: ${s.reason}`);
  const sub = await root.subscription.findFirstOrThrow({ where: { orgId: s.orgId } });


  /* ---------------- the figures ------------------------------------ */
  console.log("What counts as turnover:");
  await invoice(s.orgId, sub.id, AED(100_000), { daysAgo: 30, overageFils: AED(12.34) });
  await invoice(s.orgId, sub.id, AED(500_000), { status: "VOID" });
  await invoice(s.orgId, sub.id, AED(500_000), { status: "DRAFT" });
  await invoice(s.orgId, sub.id, AED(500_000), { daysAgo: 366 });
  const after = await vatPosition();
  ok("an issued invoice from this year counts, before VAT",
     after.trailingFils - base.trailingFils === AED(100_000),
     `+${after.trailingFils - base.trailingFils} fils`);
  ok("voided, drafted and older-than-a-year invoices do not",
     after.trailingFils - base.trailingFils < AED(200_000));

  ok("a brokerage still on trial is not counted as a month's billing",
     after.next30Fils - base.next30Fils === AED(12.34),
     `+${after.next30Fils - base.next30Fils} fils (last month's overage only)`);
  await root.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE" } });
  const paying = await vatPosition();
  // Seats on the ledger, not the number typed at sign-up: the ledger is
  // what the invoice charges, and so far it holds the owner alone.
  ok("a paying one is: its seats on the ledger at its price, for the next thirty days",
     paying.next30Fils - base.next30Fils === 1n * 25_708n + AED(12.34),
     `+${paying.next30Fils - base.next30Fils} fils`);

  /* ---------------- the warnings ----------------------------------- */
  console.log("\nWho is told, and when:");
  const quiet = await runJob();
  ok("below AED 187,500 the job runs and says nothing",
     quiet.state === "SUCCEEDED" && quiet.result.band === "BELOW" && mail.length === 0,
     `${quiet.state} ${String(quiet.result.band)}, ${mail.length} emails`);

  // Up to AED 310,000 this year: past the point of warning.
  const toApproaching = AED(310_000) - (paying.trailingFils);
  await invoice(s.orgId, sub.id, toApproaching, { daysAgo: 2 });

  const noKey = await runJob();
  ok("with no mail key, the warning is not remembered as given",
     noKey.result.band === "APPROACHING" && noKey.result.emailed === false && noKey.result.alerted === "BELOW",
     JSON.stringify(noKey.result));

  process.env.RESEND_API_KEY = "check-only-not-a-key";
  const warned = await runJob();
  const first = mail[0];
  ok("so the next run sends it, to the owner's inbox",
     warned.result.emailed === true && mail.length === 1 && first?.to === "owner@potatofarm.test",
     `${mail.length} emails${first ? ` to ${first.to}` : ""}`);
  ok("saying where turnover stands and what to do",
     Boolean(first && /nearing the compulsory VAT registration threshold/.test(first.subject)
       && first.html.includes("AED 310,000.00") && first.html.includes("SUPPLIER_TRN")
       && first.html.includes("thirty days' notice")),
     first?.subject ?? "");
  ok("the job's memory is JSON it can read back tomorrow",
     typeof warned.result.trailingAed === "number" && warned.result.alerted === "APPROACHING",
     `trailingAed ${String(warned.result.trailingAed)}`);

  await runJob();
  ok("the next day says nothing new", mail.length === 1, `${mail.length} emails`);

  await invoice(s.orgId, sub.id, AED(70_000), { daysAgo: 1 });
  const must = await runJob();
  ok("past AED 375,000 it says registration is compulsory",
     must.result.band === "MUST_REGISTER" && mail.length === 2
       && /must register for VAT within 30 days/.test(mail[1]?.subject ?? ""),
     mail[1]?.subject ?? `${mail.length} emails`);
  await runJob();
  ok("once, not every day", mail.length === 2, `${mail.length} emails`);

  process.env.SUPPLIER_TRN = "100000000000003";
  const registered = await runJob();
  ok("and nothing at all once the TRN is set",
     registered.result.band === "REGISTERED" && mail.length === 2,
     `${String(registered.result.band)}, ${mail.length} emails`);

  if (heldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = heldKey;
  if (heldTrn === undefined) delete process.env.SUPPLIER_TRN; else process.env.SUPPLIER_TRN = heldTrn;

  await cleanup();
  standIn.close();
  console.log(bad ? `\n${bad} FAILED\n` : "\nturnover is watched, and somebody is told.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
