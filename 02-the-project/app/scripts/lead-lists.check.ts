/**
 * The leads list, at the sizes where lists break.
 *
 * The audit's first P0: the screen showed twenty-five leads under a
 * heading that said three hundred, because it never asked for page two.
 * So this pages through books of 1, 25, 26 and 60 — the empty-second-page
 * edge, the exact-page edge, one over, and several pages — and asserts
 * every lead arrives exactly once. Then the filters, the sorts and the
 * bulk actions, each against the population it claims to act on, and
 * the roles: an agent's "everything matching" is their own book, and the
 * deleted drawer is a manager's.
 *
 *     npm run check:lead-lists
 */
import { crossTenant } from "../src/server/db/client";
import { leadsRouter } from "../src/server/api/routers/leads";
import { viewsRouter } from "../src/server/api/routers/views";
import { listingsRouter } from "../src/server/api/routers/listings";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "lead-lists-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `lead-lists-check-${k}-${RUN}@example.com`;

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
    await root.savedView.deleteMany({ where });
    await root.listing.deleteMany({ where });
    await root.leadOwnership.deleteMany({ where }).catch(() => {});
    await root.auditLog.deleteMany({ where }).catch(() => {});
    await root.conversation.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.pipelineStage.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "lead-lists-check-" } } }).catch(() => {});
}

let phone = Number(String(Date.now()).slice(-7));
const nextPhone = () => `+97150${String(++phone).padStart(7, "0")}`;

type Caller = ReturnType<typeof leadsRouter.createCaller>;
const ctxFor = (orgId: string, userId: string, role: string) => ({
  session: { user: { id: userId } },
  membership: { orgId, orgName: "x", role },
  ip: "127.0.0.1", userAgent: "lead-lists-check",
}) as never;

/** Every lead the list will hand over, page by page, as the screen asks. */
async function all(c: Caller, input: Record<string, unknown>, limit = 25) {
  const ids: string[] = [];
  let cursor: string | null | undefined = undefined;
  for (let guard = 0; guard < 100; guard++) {
    const page = await c.list({ ...input, limit, cursor } as never);
    ids.push(...page.rows.map((r) => r.id));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return ids;
}

async function main() {
  console.log("\nThe leads list\n");
  await cleanup();
  const owner = await root.user.create({ data: { email: EMAIL("owner"), name: "Maya Chen" } });
  const agent = await root.user.create({ data: { email: EMAIL("agent"), name: "Tom Reilly" } });
  const other = await root.user.create({ data: { email: EMAIL("other"), name: "Yasmin Haddad" } });

  console.log("=== every lead arrives, exactly once, at the sizes lists break at ===");
  for (const n of [1, 25, 26, 60]) {
    const org = await root.organisation.create({ data: { name: `Paging ${n}`, slug: `${SLUG}p${n}` } });
    await root.membership.create({ data: { orgId: org.id, userId: owner.id, role: "OWNER" } });
    // Same second for many of them, so the cursor has ties to get past.
    const at = new Date();
    await root.lead.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        orgId: org.id, phone: nextPhone(), name: `Buyer ${i}`, createdAt: i % 3 ? at : new Date(at.getTime() - i * 1000),
      })),
    });
    const M = leadsRouter.createCaller(ctxFor(org.id, owner.id, "OWNER"));
    for (const sort of ["newest", "score", "name"] as const) {
      const ids = await all(M, { sort });
      ok(`${n} leads, sorted ${sort}: all ${n}, none twice`, ids.length === n && new Set(ids).size === n, `${ids.length} / ${new Set(ids).size}`);
    }
    const d = await M.distribution({});
    ok(`and the heading says ${n}`, d.total === n, String(d.total));
  }

  console.log("\n=== a working brokerage ===");
  const org = await root.organisation.create({ data: { name: "Lead Lists", slug: `${SLUG}a` } });
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: owner.id, role: "OWNER" },
      { orgId: org.id, userId: agent.id, role: "AGENT" },
      { orgId: org.id, userId: other.id, role: "AGENT" },
    ],
  });
  const [s1, s2] = await Promise.all([
    root.pipelineStage.create({ data: { orgId: org.id, name: "New", position: 1, maps: "NEW" } }),
    root.pipelineStage.create({ data: { orgId: org.id, name: "Viewing booked", position: 2, maps: "VIEWING_BOOKED" } }),
  ]);
  const channel = await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: `+9714${RUN.slice(-7)}` } });
  const mk = (o: { name: string; source?: "BAYUT" | "REFERRAL" | "WEBSITE"; score?: number | null; agentId?: string | null; tags?: string[]; quietDays?: number }) =>
    root.lead.create({
      data: {
        orgId: org.id, phone: nextPhone(), name: o.name, source: o.source ?? "WEBSITE", score: o.score ?? null,
        assignedToId: o.agentId === undefined ? agent.id : o.agentId, tags: o.tags ?? [], stageId: s1.id, status: "NEW",
        ...(o.quietDays !== undefined ? {
          conversation: { create: { orgId: org.id, channelId: channel.id, lastInboundAt: new Date(Date.now() - o.quietDays * 86_400_000) } },
        } : {}),
      },
    });
  for (let i = 0; i < 12; i++) await mk({ name: `Bayut ${i}`, source: "BAYUT", score: 40 + i * 5 });
  for (let i = 0; i < 8; i++) await mk({ name: `Referral ${i}`, source: "REFERRAL", score: null, agentId: other.id });
  await mk({ name: "Quiet Search Target", quietDays: 30 });
  await mk({ name: "Quiet Other", quietDays: 30 });
  await mk({ name: "Pool Lead", agentId: null, tags: ["golden visa"] });

  const M = leadsRouter.createCaller(ctxFor(org.id, owner.id, "OWNER"));
  const A = leadsRouter.createCaller(ctxFor(org.id, agent.id, "AGENT"));

  {
    const bayut = await all(M, { source: "BAYUT" });
    ok("source filter: 12 from Bayut", bayut.length === 12, String(bayut.length));
    const hot = await M.list({ band: "HOT", limit: 100 } as never);
    ok("score filter: Hot is 60–79", hot.rows.length > 0 && hot.rows.every((r) => r.score !== null && r.score >= 60 && r.score < 80),
       hot.rows.map((r) => r.score).join(","));
    const unscored = await all(M, { band: "UNSCORED" });
    ok("and 'not scored yet' is its own band", unscored.length === 11, String(unscored.length));
    const withOther = await all(M, { agentId: other.id });
    ok("agent filter", withOther.length === 8, String(withOther.length));
    const tagged = await all(M, { tag: "golden visa" });
    ok("tag filter", tagged.length === 1);
    /**
     * The bug the rewrite found: the search and "Gone quiet" both wrote
     * an `OR`, and spreading one over the other kept only the second.
     */
    const quiet = await M.list({ filter: "cold", search: "Quiet Search", limit: 50 } as never);
    ok("searching inside 'Gone quiet' searches", quiet.rows.length === 1 && quiet.rows[0]!.name === "Quiet Search Target",
       quiet.rows.map((r) => r.name).join(" | "));
    const byScore = (await M.list({ sort: "score", limit: 100 } as never)).rows.map((r) => r.score);
    const firstNull = byScore.indexOf(null);
    ok("best score first, unscored last",
       byScore.slice(0, firstNull < 0 ? undefined : firstNull).every((s, i, a) => i === 0 || (a[i - 1] as number) >= (s as number))
       && (firstNull < 0 || byScore.slice(firstNull).every((s) => s === null)), byScore.join(","));
  }

  console.log("\n=== bulk, on what the filter matches ===");
  {
    const r = await M.bulk({ target: { matching: { filter: "all", view: "active", source: "BAYUT" } }, action: { type: "tag", tag: "portal" } });
    ok("tag everything from Bayut", r.count === 12, String(r.count));
    ok("and only them", (await all(M, { tag: "portal" })).length === 12);
    const again = await M.bulk({ target: { matching: { filter: "all", view: "active", source: "BAYUT" } }, action: { type: "tag", tag: "portal" } });
    const dupes = await root.lead.count({ where: { orgId: org.id, name: "Bayut 0" } });
    const row = await root.lead.findFirst({ where: { orgId: org.id, name: "Bayut 0" }, select: { tags: true } });
    ok("tagging twice does not tag twice", again.count === 12 && dupes === 1 && row?.tags.filter((t) => t === "portal").length === 1);
    const tags = await M.tags();
    ok("the tag list counts it", tags.some((t) => t.tag === "portal" && t.count === 12), JSON.stringify(tags));
    const moved = await M.bulk({ target: { matching: { filter: "all", view: "active", tag: "portal" } }, action: { type: "stage", stageId: s2.id } });
    const st = await root.lead.findMany({ where: { orgId: org.id, tags: { has: "portal" } }, select: { status: true, stageId: true } });
    ok("moving stage moves the status with it", moved.count === 12 && st.every((x) => x.stageId === s2.id && x.status === "VIEWING_BOOKED"));
    const audited = await root.auditLog.count({ where: { orgId: org.id, action: "lead.bulk_tag" } });
    ok("and each bulk action is one audit entry", audited === 2, String(audited));
  }

  console.log("\n=== archive, and back ===");
  {
    const before = (await M.distribution({})).total;
    const one = (await M.list({ search: "Pool Lead" } as never)).rows[0]!;
    await M.bulk({ target: { ids: [one.id] }, action: { type: "archive" } });
    ok("an archived lead leaves the list", (await M.distribution({})).total === before - 1);
    ok("and is in the archive", (await M.list({ view: "archived" } as never)).rows.some((r) => r.id === one.id));
    await M.bulk({ target: { ids: [one.id] }, action: { type: "unarchive" } });
    ok("and comes back", (await M.distribution({})).total === before);
  }

  console.log("\n=== an agent's 'everything' is their own book ===");
  {
    const own = await root.lead.count({ where: { orgId: org.id, assignedToId: agent.id, deletedAt: null, archivedAt: null } });
    const r = await A.bulk({ target: { matching: { filter: "all", view: "active" } }, action: { type: "tag", tag: "mine" } });
    ok("bulk on 'all matching' touches only the agent's leads", r.count === own, `${r.count} vs ${own}`);
    const leaked = await root.lead.count({ where: { orgId: org.id, tags: { has: "mine" }, NOT: { assignedToId: agent.id } } });
    ok("and none of a colleague's", leaked === 0, String(leaked));
    const theirs = await root.lead.findFirst({ where: { orgId: org.id, assignedToId: other.id }, select: { id: true } });
    const byId = await A.bulk({ target: { ids: [theirs!.id] }, action: { type: "archive" } });
    ok("naming a colleague's lead by id does nothing", byId.count === 0, String(byId.count));
    const del = await refused(() => A.bulk({ target: { ids: [theirs!.id] }, action: { type: "delete" } }));
    ok("an agent cannot delete", del?.code === "FORBIDDEN", del?.code ?? "allowed");
    const asg = await refused(() => A.bulk({ target: { ids: [theirs!.id] }, action: { type: "assign", agentId: agent.id } }));
    ok("or reassign", asg?.code === "FORBIDDEN", asg?.code ?? "allowed");
    const drawer = await refused(() => A.list({ view: "deleted" } as never));
    ok("or open the deleted drawer", drawer?.code === "FORBIDDEN", drawer?.code ?? "allowed");
  }

  console.log("\n=== delete, and restore ===");
  {
    const before = (await M.distribution({})).total;
    const r = await M.bulk({ target: { matching: { filter: "all", view: "active", agentId: other.id } }, action: { type: "delete" } });
    ok("a manager deletes eight", r.count === 8, String(r.count));
    ok("they leave the list", (await M.distribution({})).total === before - 8);
    const drawer = await all(M, { view: "deleted" });
    ok("and are in Recently deleted", drawer.length === 8, String(drawer.length));
    const back = await M.bulk({ target: { matching: { filter: "all", view: "deleted" } }, action: { type: "restore" } });
    ok("restored, all of them", back.count === 8 && (await M.distribution({})).total === before, String(back.count));
  }

  console.log("\n=== pool and reassign through the same path as the board ===");
  {
    const r = await M.bulk({ target: { matching: { filter: "unassigned", view: "active" } }, action: { type: "assign", agentId: other.id } });
    const own = await root.leadOwnership.count({ where: { orgId: org.id, userId: other.id, endedAt: null } });
    ok("assigning records ownership, as the board does", r.count === 1 && own >= 1, `${r.count}, ${own}`);
  }

  console.log("\n=== saved views ===");
  {
    const V = (u: string, role: string) => viewsRouter.createCaller(ctxFor(org.id, u, role));
    await V(agent.id, "AGENT").save({ screen: "leads", name: "My Bayut", filters: { source: "BAYUT" }, shared: false });
    await V(owner.id, "OWNER").save({ screen: "leads", name: "Team hot", filters: { band: "HOT" }, shared: true });
    const share = await refused(() => V(agent.id, "AGENT").save({ screen: "leads", name: "x", filters: {}, shared: true }));
    ok("an agent cannot share a view", share?.code === "FORBIDDEN", share?.code ?? "allowed");
    const seen = (await V(other.id, "AGENT").list({ screen: "leads" })).map((v) => v.name);
    ok("a colleague sees the team's view and not the private one", seen.includes("Team hot") && !seen.includes("My Bayut"), seen.join(", "));
    const mine = await V(agent.id, "AGENT").list({ screen: "leads" });
    const stolen = await refused(() => V(other.id, "AGENT").remove({ id: mine.find((v) => v.name === "My Bayut")!.id }));
    ok("and cannot delete somebody else's", stolen?.code === "NOT_FOUND", stolen?.code ?? "allowed");
    const rivalOrg = await root.organisation.create({ data: { name: "Rival", slug: `${SLUG}r` } });
    await root.membership.create({ data: { orgId: rivalOrg.id, userId: other.id, role: "OWNER" } });
    const rival = await viewsRouter.createCaller(ctxFor(rivalOrg.id, other.id, "OWNER")).list({ screen: "leads" });
    ok("another brokerage sees none of them", rival.length === 0, String(rival.length));
  }

  console.log("\n=== listings: every one arrives, and the filters are the server's ===");
  {
    const lorg = await root.organisation.create({ data: { name: "Listing Lists", slug: `${SLUG}l` } });
    await root.membership.create({ data: { orgId: lorg.id, userId: owner.id, role: "OWNER" } });
    const areas = ["Dubai Marina", "Dubai Hills Estate", "JVC"];
    await root.listing.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        orgId: lorg.id, reference: `LL-${100 + i}`, title: `Listing ${i}`, community: areas[i % 3],
        bedrooms: (i % 5) + 1, priceFils: BigInt(1_000_000 + i * 100_000) * 100n, purpose: "SALE" as const,
        status: i % 10 === 0 ? ("SOLD" as const) : ("AVAILABLE" as const),
      })),
    });
    const L = listingsRouter.createCaller(ctxFor(lorg.id, owner.id, "OWNER"));
    const every = async (input: Record<string, unknown>) => {
      const ids: string[] = [];
      let cursor: string | null | undefined;
      for (let g = 0; g < 50; g++) {
        const page = await L.list({ ...input, limit: 25, cursor } as never);
        ids.push(...page.rows.map((r) => r.id));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return ids;
    };
    for (const sort of ["updated", "price_asc", "price_desc"] as const) {
      const ids = await every({ sort });
      ok(`60 listings, sorted ${sort}: all 60, none twice`, ids.length === 60 && new Set(ids).size === 60, `${ids.length}`);
    }
    const c = await L.count({});
    ok("the count is the whole stock, and says how much is available", c.total === 60 && c.available === 54, JSON.stringify(c));
    const marina = await every({ community: "marina" });
    ok("'marina' finds Dubai Marina", marina.length === 20, String(marina.length));
    const hills = await every({ community: "DHE" });
    ok("'DHE' finds the ones filed as Dubai Hills Estate", hills.length === 20, String(hills.length));
    const typed = await every({ community: "jvc" });
    ok("an area typed in lower case still matches", typed.length === 20, String(typed.length));
    const band = await L.list({ minPriceAed: 2_000_000, maxPriceAed: 3_000_000, limit: 100 } as never);
    ok("price range, both ends inclusive", band.rows.length === 11 && band.rows.every((r) => r.priceFils! >= 200_000_000n && r.priceFils! <= 300_000_000n),
       String(band.rows.length));
    const beds = await every({ bedrooms: 4 });
    ok("bedrooms is 'at least'", beds.length === 24, String(beds.length));
    const avail = await L.count({ status: "AVAILABLE" });
    ok("and status filters too", avail.total === 54, String(avail.total));
    for (const q of ["LL-105", "ll105", "LL 105"]) {
      const r = await L.list({ search: q } as never);
      ok(`"${q}" finds LL-105`, r.rows.some((x) => x.reference === "LL-105"), r.rows.map((x) => x.reference).join(","));
    }
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
