/**
 * Off-plan, property types and leases — the audit's B5.
 *
 * A listing could not say it was off-plan, a villa, or a rental on four
 * cheques, so none of it could be filtered or matched, and a lease that
 * ended did so unnoticed. This drives the real procedures, then asks the
 * matcher and the renewal job whether they act on what was recorded.
 *
 *     npm run check:listing-model
 */
import { crossTenant } from "../src/server/db/client";
import { listingsRouter } from "../src/server/api/routers/listings";
import { requirementsRouter } from "../src/server/api/routers/requirements";
import { tenanciesRouter } from "../src/server/api/routers/tenancies";
import { buyersFor } from "../src/server/lib/matching/buyers";
import { sweepRenewals } from "../src/server/lib/tenancy/renewals";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "listing-model-check-";
const RUN = Date.now().toString(36);
let bad = 0;
const ok = (l: string, p: boolean, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const refused = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; } };
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.followUp.deleteMany({ where });
    await root.auditLog.deleteMany({ where }).catch(() => {});
    await root.requirement.deleteMany({ where });
    await root.tenancy.deleteMany({ where });
    await root.listing.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "listing-model-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nWhat a listing is, and the lease on it\n");
  await cleanup();
  const org = await root.organisation.create({ data: { name: "Listing Model", slug: `${SLUG}a` } });
  const rival = await root.organisation.create({ data: { name: "Rival", slug: `${SLUG}b` } });
  const u = await root.user.create({ data: { email: `listing-model-check-m-${RUN}@example.com`, name: "Maya Chen" } });
  await root.membership.createMany({ data: [{ orgId: org.id, userId: u.id, role: "MANAGER" }, { orgId: rival.id, userId: u.id, role: "MANAGER" }] });
  const ctx = (orgId: string) => ({ session: { user: { id: u.id } }, membership: { orgId, orgName: "x", role: "MANAGER" }, ip: "127.0.0.1", userAgent: "check" }) as never;
  const L = listingsRouter.createCaller(ctx(org.id));
  const R = requirementsRouter.createCaller(ctx(org.id));
  const T = tenanciesRouter.createCaller(ctx(org.id));

  console.log("=== off-plan, and what kind ===");
  const offplan = await L.create({
    reference: `OP-${RUN}`, title: "2-bed, Creek Rise", community: "Dubai Creek Harbour", bedrooms: 2, priceAed: 2_100_000,
    propertyType: "APARTMENT", completion: "OFF_PLAN", handoverAt: inDays(400), developer: "Emaar", project: "Creek Rise",
    paymentPlan: "80/20", unitNumber: "1204",
  });
  // Off-plan too, so that the type is the only thing it gets wrong.
  const villa = await L.create({ reference: `VL-${RUN}`, title: "4-bed villa", community: "Dubai Creek Harbour", bedrooms: 4, priceAed: 2_000_000, propertyType: "VILLA", completion: "OFF_PLAN" });
  const ready = await L.create({ reference: `RD-${RUN}`, title: "2-bed, ready", community: "Dubai Creek Harbour", bedrooms: 2, priceAed: 2_050_000, propertyType: "APARTMENT" });
  const stored = await root.listing.findUnique({ where: { id: offplan.id } });
  ok("the off-plan details are stored", stored?.completion === "OFF_PLAN" && stored.developer === "Emaar" && stored.paymentPlan === "80/20" && !!stored.handoverAt);
  ok("a listing that did not say is ready, as every earlier one was", (await root.listing.findUnique({ where: { id: ready.id } }))?.completion === "READY");
  const offOnly = await L.list({ completion: "OFF_PLAN" } as never);
  ok("filter: off-plan only", offOnly.rows.length === 2 && offOnly.rows.every((r) => r.completion === "OFF_PLAN"), String(offOnly.rows.length));
  const villas = await L.count({ propertyType: "VILLA" });
  ok("filter: villas only", villas.total === 1);
  const cleared = await L.update({ id: offplan.id, developer: null });
  void cleared;
  ok("an edit can clear a detail", (await root.listing.findUnique({ where: { id: offplan.id } }))?.developer === null);

  console.log("\n=== the matcher respects them ===");
  const buyer = await root.lead.create({ data: { orgId: org.id, phone: `+97150${String(Date.now()).slice(-7)}`, name: "Off-plan Investor", assignedToId: u.id } });
  await R.save({
    leadId: buyer.id, purpose: "SALE", intent: "BUY_TO_INVEST", budgetMinAed: null, budgetMaxAed: 2_500_000, bedroomsMin: 2,
    communities: ["Dubai Creek Harbour"], preferences: [], propertyTypes: ["APARTMENT"], completion: "OFF_PLAN",
  });
  const forOffplan = await buyersFor({ orgId: org.id, listingId: offplan.id, scope: { canSeeAll: true, viewerId: u.id } });
  const forVilla = await buyersFor({ orgId: org.id, listingId: villa.id, scope: { canSeeAll: true, viewerId: u.id } });
  ok("an off-plan apartment buyer is matched to the off-plan apartment", !!forOffplan?.matches.some((m) => m.name === "Off-plan Investor"));
  ok("and not to the villa next door at the same price", !forVilla?.matches.some((m) => m.name === "Off-plan Investor"),
     (forVilla?.matches ?? []).map((m) => m.name).join(" | ") || "none");
  const forReady = await buyersFor({ orgId: org.id, listingId: ready.id, scope: { canSeeAll: true, viewerId: u.id } });
  ok("nor to a ready apartment, when they asked for off-plan", !forReady?.matches.some((m) => m.name === "Off-plan Investor"),
     (forReady?.matches ?? []).map((m) => m.name).join(" | ") || "none");

  console.log("\n=== the lease ===");
  const flat = await L.create({ reference: `RN-${RUN}`, title: "1-bed to let", purpose: "RENT", priceAed: 95_000, rentCheques: 4, depositAed: 5_000 });
  const sale = await refused(() => T.record({ listingId: villa.id, startsAt: inDays(-270), endsAt: inDays(95), rentAed: 95_000 }));
  ok("a lease goes on a rental only", sale?.code === "BAD_REQUEST", sale?.message);
  const backwards = await refused(() => T.record({ listingId: flat.id, startsAt: inDays(10), endsAt: inDays(5), rentAed: 95_000 }));
  ok("and has to end after it starts", !!backwards);
  const first = await T.record({ listingId: flat.id, tenantName: "Ana Ruiz", startsAt: inDays(-270), endsAt: inDays(95), rentAed: 95_000, cheques: 4 });
  ok("recording it marks the rental let", (await root.listing.findUnique({ where: { id: flat.id } }))?.status === "LET");
  const renewed = await T.record({ listingId: flat.id, tenantName: "Ana Ruiz", startsAt: inDays(95), endsAt: inDays(460), rentAed: 99_000 });
  const leases = await T.forListing({ listingId: flat.id });
  ok("recording the renewal ends the old lease, keeping it", leases.length === 2 && leases.filter((l) => !l.endedAt).length === 1 && leases.some((l) => l.id === first.id && l.endedAt));
  void renewed;
  const rivalRead = await tenanciesRouter.createCaller(ctx(rival.id)).forListing({ listingId: flat.id });
  ok("another brokerage sees none of it", rivalRead.length === 0);

  console.log("\n=== the renewal comes round before the notice line ===");
  // A second rental, ending in 95 days: inside the reminder window.
  const soon = await L.create({ reference: `RS-${RUN}`, title: "Studio to let", purpose: "RENT", priceAed: 60_000 });
  await T.record({ listingId: soon.id, tenantName: "Omar Said", startsAt: inDays(-270), endsAt: inDays(95), rentAed: 60_000 });
  const r1 = await sweepRenewals();
  const tasks = await root.followUp.findMany({ where: { orgId: org.id, title: { contains: `RS-${RUN}` } } });
  ok("a lease 95 days from its end puts one task on the agent's list", tasks.length === 1 && tasks[0]!.agentId === u.id, `${tasks.length}`);
  ok("naming the notice date", /notice by/.test(tasks[0]?.body ?? ""), tasks[0]?.body ?? "");
  ok("the lease 460 days out does not", (await root.followUp.count({ where: { orgId: org.id, title: { contains: `RN-${RUN}` } } })) === 0);
  await sweepRenewals();
  ok("running again does not remind twice", (await root.followUp.count({ where: { orgId: org.id, title: { contains: `RS-${RUN}` } } })) === 1);
  ok("and the job reports what it did", r1.tasked >= 1, JSON.stringify(r1));

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
