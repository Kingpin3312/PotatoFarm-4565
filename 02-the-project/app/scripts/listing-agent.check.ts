import { crossTenant } from "../src/server/db/client";
import { listingsRouter } from "../src/server/api/routers/listings";
import { vendorsRouter } from "../src/server/api/routers/vendors";
import { fatal } from "./fatal";

/**
 * Who owns a listing and who looks after it — both ours, both settable.
 *
 * A listing recorded no agent, so the owner's weekly report guessed who
 * should send it. And an owner was attached by typing an internal ID
 * that no agent has seen, through a procedure that did not check the
 * owner belonged to this brokerage: a foreign key is validated without
 * row-level security, so another brokerage's owner would have been
 * accepted.
 *
 *     npm run check:listing-agent
 */
const root = crossTenant("sweep");
const SLUG = "listing-agent-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `listing-agent-check-${k}-${RUN}@example.com`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.listing.deleteMany({ where });
    await root.vendor.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "listing-agent-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nWho owns a listing and who looks after it\n");
  await cleanup();
  const ours = await root.organisation.create({ data: { name: "Listing Agent Check", slug: `${SLUG}a` } });
  const rival = await root.organisation.create({ data: { name: "Rival Brokerage", slug: `${SLUG}b` } });
  const mk = (k: string, name: string) => root.user.create({ data: { email: EMAIL(k), name } });
  const manager = await mk("manager", "Maya Chen");
  const agent = await mk("agent", "Tom Reilly");
  const outsider = await mk("outsider", "Somebody Else");
  await root.membership.createMany({
    data: [
      { orgId: ours.id, userId: manager.id, role: "MANAGER" },
      { orgId: ours.id, userId: agent.id, role: "AGENT" },
      { orgId: rival.id, userId: outsider.id, role: "AGENT" },
    ],
  });
  const ourOwner = await root.vendor.create({ data: { orgId: ours.id, name: "Hana Suleiman" } });
  const theirOwner = await root.vendor.create({ data: { orgId: rival.id, name: "Their Owner" } });

  const ctx = {
    session: { user: { id: manager.id } },
    membership: { orgId: ours.id, orgName: ours.name, role: "MANAGER" },
    ip: "127.0.0.1", userAgent: "listing-agent-check",
  } as never;
  const L = listingsRouter.createCaller(ctx), V = vendorsRouter.createCaller(ctx);

  const made = await L.create({ reference: `LA-${RUN}`, title: "2-bed, Marina", purpose: "SALE", priceAed: 2_000_000 } as never) as { id: string };
  const row = () => root.listing.findUniqueOrThrow({ where: { id: made.id } });

  console.log("=== who looks after it ===");
  ok("whoever adds a listing looks after it until told otherwise", (await row()).agentId === manager.id);
  await L.update({ id: made.id, agentId: agent.id });
  ok("it can be given to a colleague", (await row()).agentId === agent.id);
  const stranger = await refused(() => L.update({ id: made.id, agentId: outsider.id }));
  ok("but not to somebody on another brokerage's team",
     !!stranger && /isn't on your team/.test(stranger.message) && (await row()).agentId === agent.id, stranger?.message ?? "allowed");
  await L.update({ id: made.id, agentId: null });
  ok("and it can go back to nobody", (await row()).agentId === null);
  await L.update({ id: made.id, agentId: agent.id });
  const { rows } = await L.list({} as never);
  const mine = rows.find((l) => l.id === made.id);
  ok("the listings screen is given the agent", mine?.agent?.id === agent.id, JSON.stringify(mine?.agent ?? null));

  console.log("\n=== who owns it ===");
  const names = (await V.list()).map((o) => o.name);
  ok("owners can be chosen by name, and only ours", names.includes("Hana Suleiman") && !names.includes("Their Owner"));
  await V.attach({ listingId: made.id, vendorId: ourOwner.id });
  ok("one of ours attaches", (await row()).vendorId === ourOwner.id);
  const cross = await refused(() => V.attach({ listingId: made.id, vendorId: theirOwner.id }));
  ok("another brokerage's owner is refused", !!cross && (await row()).vendorId === ourOwner.id, cross?.message ?? "attached");
  const crossEdit = await refused(() => L.update({ id: made.id, vendorId: theirOwner.id }));
  ok("through the edit form too", !!crossEdit && (await row()).vendorId === ourOwner.id, crossEdit?.message ?? "attached");

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\nevery listing has an owner and a person, and both are ours.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
