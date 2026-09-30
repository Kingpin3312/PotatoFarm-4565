import { crossTenant } from "../src/server/db/client";
import { commissionRouter } from "../src/server/api/routers/commission";
import { fatal } from "./fatal";

/**
 * A fee is invoiced, received and paid out — and the numbers follow.
 *
 * `Commission.status` had four values and nothing ever moved it past
 * FORECAST; `CommissionSplit.paidAt` was read by three screens and
 * written by none. So "owed to you" was zero for every agent and the
 * revenue report said every brokerage had earned nothing. This drives
 * the lifecycle through the real procedures, as the people who would
 * press the buttons, and reads the result back off the screens' own
 * queries.
 *
 *     npm run check:commission-lifecycle
 */
const root = crossTenant("sweep");
const SLUG = "commission-lifecycle-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `commission-check-${k}-${RUN}@example.com`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return (e as { code?: string; message: string }); }
};

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.commissionSplit.deleteMany({ where });
    await root.commission.deleteMany({ where });
    await root.deal.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "commission-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nA fee is invoiced, received and paid out\n");
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Commission Check", slug: `${SLUG}a` } });
  const user = (k: string, name: string) => root.user.create({ data: { email: EMAIL(k), name } });
  const owner = await user("owner", "Omar Haddad");
  const manager = await user("manager", "Maya Chen");
  const agent = await user("agent", "Tom Reilly");
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: owner.id, role: "OWNER" },
      { orgId: org.id, userId: manager.id, role: "MANAGER" },
      { orgId: org.id, userId: agent.id, role: "AGENT" },
    ],
  });
  const deal = await root.deal.create({
    data: { orgId: org.id, reference: `CL-${RUN}`, type: "SALE", valueFils: 3_000_000_00n, stage: "AGREED" },
  });

  const as = (userId: string, role: "OWNER" | "MANAGER" | "AGENT") => commissionRouter.createCaller({
    session: { user: { id: userId } },
    membership: { orgId: org.id, orgName: org.name, role },
    ip: "127.0.0.1", userAgent: "commission-lifecycle-check",
  } as never);
  const O = as(owner.id, "OWNER"), M = as(manager.id, "MANAGER"), A = as(agent.id, "AGENT");

  // 2% of AED 3,000,000 = AED 60,000. Tom's 40% is AED 24,000.
  const c = await O.record({
    dealId: deal.id, rateBp: 200,
    splits: [
      { userId: agent.id, role: "SELLING_AGENT", shareBp: 4_000 },
      { role: "BROKERAGE", shareBp: 6_000 },
    ],
  });
  const split = await root.commissionSplit.findFirstOrThrow({ where: { commissionId: c.id, userId: agent.id } });
  const firm = await root.commissionSplit.findFirstOrThrow({ where: { commissionId: c.id, role: "BROKERAGE" } });

  console.log("=== recorded: a forecast, and nothing owed yet ===");
  {
    const m = await A.mine({});
    ok("the agent sees it forecast", m.forecast === "AED 24,000.00" && m.owed === "AED 0.00", `forecast ${m.forecast}, owed ${m.owed}`);
    const l = await O.ledger();
    ok("it is on the list to settle", l.rows.some((r) => r.id === c.id && r.status === "FORECAST"));
  }

  console.log("\n=== who may move money ===");
  {
    const e = await refused(() => M.setStatus({ id: c.id, to: "INVOICED" }));
    ok("a sales manager may not", e?.code === "FORBIDDEN", e?.message ?? "allowed");
    ok("and the list tells the screen so", (await M.ledger()).canSettle === false && (await O.ledger()).canSettle === true);
    const early = await refused(() => O.markPaid({ splitId: split.id }));
    ok("nobody is paid out of a fee not yet received", !!early && /received before paying/.test(early.message), early?.message ?? "paid");
  }

  console.log("\n=== invoiced ===");
  {
    await O.setStatus({ id: c.id, to: "INVOICED" });
    const m = await A.mine({});
    // It used to fall into none of the agent's figures at this point.
    ok("the agent still sees it — as invoiced, not vanished", m.invoiced === "AED 24,000.00" && m.forecast === "AED 0.00",
       `invoiced ${m.invoiced}, forecast ${m.forecast}`);
    const b = await O.brokerage();
    ok("the owner's report counts it invoiced", b.invoiced === "AED 60,000.00", b.invoiced);
    const back = await refused(() => O.setStatus({ id: c.id, to: "INVOICED" }));
    ok("an invoiced fee cannot be invoiced again", !!back, back?.message ?? "allowed");
  }

  console.log("\n=== received, on the day the money arrived ===");
  // Last month, so "the month it arrived" and "the month it was
  // recorded" are different months. Twenty days ago was this month on
  // most days, and the assertion below could not tell the two apart.
  const arrived = new Date(Date.now() - 40 * 86_400_000);
  {
    const future = await refused(() => O.setStatus({ id: c.id, to: "RECEIVED", at: new Date(Date.now() + 5 * 86_400_000) }));
    ok("a date in the future is refused", !!future, future?.message ?? "allowed");
    await O.setStatus({ id: c.id, to: "RECEIVED", at: arrived });
    const m = await A.mine({});
    ok("the agent is now owed their share", m.owed === "AED 24,000.00" && m.invoiced === "AED 0.00", `owed ${m.owed}`);
    const b = await O.brokerage();
    ok("the owner's report shows it earned", b.received === "AED 60,000.00", b.received);
    const month = arrived.toISOString().slice(0, 7);
    const thisMonth = new Date().toISOString().slice(0, 7);
    ok("in the month the money arrived, not the month it was recorded",
       month !== thisMonth && b.byMonth.find((x) => x.month === month)?.fils === 6_000_000n &&
       (b.byMonth.find((x) => x.month === thisMonth)?.fils ?? 0n) === 0n,
       `${month}: ${b.byMonth.find((x) => x.month === month)?.fils}`);
  }

  console.log("\n=== paid out ===");
  {
    const own = await refused(() => O.markPaid({ splitId: firm.id }));
    ok("the brokerage's own share is not paid to anybody", !!own, own?.message ?? "paid");
    await O.markPaid({ splitId: split.id, reference: "TRF-88213" });
    const m = await A.mine({});
    ok("the agent sees it paid, and owed goes to zero", m.paid === "AED 24,000.00" && m.owed === "AED 0.00", `paid ${m.paid}, owed ${m.owed}`);
    const again = await refused(() => O.markPaid({ splitId: split.id }));
    ok("paying twice is refused", !!again && /already been paid/.test(again.message), again?.message ?? "paid twice");
    const undo = await refused(() => O.setStatus({ id: c.id, to: "INVOICED" }));
    ok("once somebody is paid, 'not received after all' is refused",
       !!undo && /already been paid/.test(undo.message), undo?.message ?? "allowed");
    ok("a fully settled fee leaves the list", !(await O.ledger()).rows.some((r) => r.id === c.id));
    const trail = await root.auditLog.count({
      where: { orgId: org.id, action: { in: ["commission.status", "commission.paid"] } },
    });
    ok("every move is in the audit log", trail === 3, `${trail} entries`);
  }

  console.log("\n=== a mistaken 'received' can be undone before anybody is paid ===");
  {
    const c2 = await O.record({ dealId: deal.id, rateBp: 100, splits: [{ userId: agent.id, role: "SELLING_AGENT", shareBp: 10_000 }] });
    await O.setStatus({ id: c2.id, to: "RECEIVED" });
    await O.setStatus({ id: c2.id, to: "INVOICED" });
    const row = await root.commission.findUniqueOrThrow({ where: { id: c2.id } });
    ok("back to invoiced, and the received date is cleared", row.status === "INVOICED" && row.receivedAt === null);
    await O.setStatus({ id: c2.id, to: "WRITTEN_OFF" });
    const m = await A.mine({});
    ok("a written-off fee is in none of the agent's figures",
       m.invoiced === "AED 0.00" && m.owed === "AED 0.00" && m.forecast === "AED 0.00", JSON.stringify({ ...m, rows: undefined }));
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\nmoney that arrives shows up, and so does who is owed it.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
