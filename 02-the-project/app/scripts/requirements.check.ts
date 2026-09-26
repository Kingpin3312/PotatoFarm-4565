/**
 * What a buyer is looking for — written, and then read by everything
 * that needs it.
 *
 * The audit asked for "buyers in dubai marina" and got nobody, from a
 * brokerage of forty-two buyers. The query was read correctly; there was
 * nothing to find, because only voice intake had ever written a
 * `Requirement`. So this does not stop at "a row was saved": it saves
 * through the real procedure and then asks search and the matcher —
 * the two readers an agent actually sees — whether they now find the
 * buyer. A requirement nothing reads is the same bug again.
 *
 *     npm run check:requirements
 */
import { crossTenant } from "../src/server/db/client";
import { requirementsRouter } from "../src/server/api/routers/requirements";
import { requirementFromExtraction } from "../src/server/lib/requirements/save";
import { forOrg } from "../src/server/db/client";
import { parse } from "../src/server/lib/search/parse";
import { search } from "../src/server/lib/search/run";
import { buyersFor } from "../src/server/lib/matching/buyers";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "requirements-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `requirements-check-${k}-${RUN}@example.com`;

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
    await root.auditLog.deleteMany({ where }).catch(() => {});
    await root.requirement.deleteMany({ where });
    await root.listing.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "requirements-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nWhat they are looking for\n");
  await cleanup();
  const org = await root.organisation.create({ data: { name: "Requirements Check", slug: `${SLUG}a` } });
  const rival = await root.organisation.create({ data: { name: "Rival", slug: `${SLUG}b` } });
  const mk = (k: string, name: string) => root.user.create({ data: { email: EMAIL(k), name } });
  const agent = await mk("agent", "Tom Reilly");
  const colleague = await mk("colleague", "Yasmin Haddad");
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: agent.id, role: "AGENT" },
      { orgId: org.id, userId: colleague.id, role: "AGENT" },
      { orgId: rival.id, userId: colleague.id, role: "AGENT" },
    ],
  });
  const n = String(Date.now()).slice(-7);
  const buyer = await root.lead.create({ data: { orgId: org.id, phone: `+97150${n}`, name: "Priya Nayr", assignedToId: agent.id, status: "QUALIFYING" } });
  const theirs = await root.lead.create({ data: { orgId: org.id, phone: `+97155${n}`, name: "Not Yours", assignedToId: colleague.id } });
  const chatty = await root.lead.create({ data: { orgId: org.id, phone: `+97152${n}`, name: "Arjun Mehta", assignedToId: agent.id } });
  const marina = await root.listing.create({
    data: { orgId: org.id, reference: `RQ-1-${RUN}`, title: "3-bed apartment, Marina Gate", community: "Dubai Marina",
            bedrooms: 3, priceFils: 2_900_000_00n, purpose: "SALE", status: "AVAILABLE" },
  });
  const hills = await root.listing.create({
    data: { orgId: org.id, reference: `RQ-2-${RUN}`, title: "4-bed villa, Maple", community: "Dubai Hills Estate",
            bedrooms: 4, priceFils: 5_500_000_00n, purpose: "SALE", status: "AVAILABLE" },
  });

  const as = (userId: string, orgId = org.id) => requirementsRouter.createCaller({
    session: { user: { id: userId } },
    membership: { orgId, orgName: "x", role: "AGENT" },
    ip: "127.0.0.1", userAgent: "requirements-check",
  } as never);
  const A = as(agent.id);

  console.log("=== an agent writes it down ===");
  const saved = await A.save({
    leadId: buyer.id, purpose: "SALE", intent: "BUY_TO_LIVE",
    budgetMinAed: 2_500_000, budgetMaxAed: 3_000_000, bedroomsMin: 3,
    communities: ["marina", " the palm "], preferences: ["Sea view", ""],
  });
  const row = await root.requirement.findUnique({ where: { id: saved.id } });
  ok("areas are stored as listings write them", row?.communities.join("|") === "Dubai Marina|Palm Jumeirah", row?.communities.join("|"));
  ok("money is stored in fils", row?.budgetMaxFils === 3_000_000_00n, String(row?.budgetMaxFils));
  ok("it is the agent's, confirmed by them", row?.source === "AGENT" && row?.confirmedById === agent.id);
  ok("and it will lapse rather than live for ever", !!row?.expiresAt && row.expiresAt > new Date());
  ok("empty must-haves are dropped", row?.preferences.join("|") === "Sea view", row?.preferences.join("|"));
  const logged = await root.auditLog.count({ where: { orgId: org.id, action: "requirement.create", entityId: saved.id } });
  ok("and the change is in the audit log", logged === 1);

  const listed = await A.forLead({ leadId: buyer.id });
  ok("the person page reads it back", listed.length === 1 && listed[0]!.bedroomsMin === 3);

  console.log("\n=== the readers find the buyer ===");
  {
    const r = await search({ orgId: org.id, q: parse("buyers in dubai marina"), scope: { canSeeAll: false, viewerId: agent.id } });
    ok("search: 'buyers in dubai marina' finds them", r.hits.some((h) => h.title === "Priya Nayr"), r.hits.map((h) => h.title).join(" | ") || "nobody");
    const m = await buyersFor({ orgId: org.id, listingId: marina.id, scope: { canSeeAll: true, viewerId: agent.id } });
    ok("matching: they are a buyer for the Marina flat", !!m?.matches.some((x) => x.name === "Priya Nayr"),
       (m?.matches ?? []).map((x) => x.name).join(" | ") || "nobody");
  }

  console.log("\n=== an alias meets the listing's own spelling ===");
  {
    /**
     * The matcher compared areas by exact text, so "Dubai Hills" never
     * met a listing filed as "Dubai Hills Estate".
     */
    await A.save({
      leadId: buyer.id, purpose: "SALE", intent: "BUY_TO_INVEST",
      budgetMinAed: null, budgetMaxAed: 6_000_000, bedroomsMin: 4,
      communities: ["DHE"], preferences: [],
    });
    const m = await buyersFor({ orgId: org.id, listingId: hills.id, scope: { canSeeAll: true, viewerId: agent.id } });
    const hit = m?.matches.find((x) => x.name === "Priya Nayr");
    ok("'DHE' matches a listing in Dubai Hills Estate, on the area", !!hit && hit.reasons.some((w) => /Dubai Hills/.test(w)),
       hit ? hit.reasons.join(" · ") : (m?.matches ?? []).map((x) => x.name).join(" | ") || "nobody");
  }

  console.log("\n=== nobody else's buyer ===");
  {
    const e = await refused(() => A.save({
      leadId: theirs.id, purpose: "SALE", intent: null, budgetMinAed: null, budgetMaxAed: null,
      bedroomsMin: 2, communities: ["JVC"], preferences: [],
    }));
    ok("an agent cannot write on a colleague's buyer", e?.code === "NOT_FOUND", e?.code ?? "allowed");
    const r = await refused(() => as(colleague.id, rival.id).forLead({ leadId: buyer.id }));
    ok("and another brokerage cannot read one", r?.code === "NOT_FOUND", r?.code ?? "allowed");
    const back = await refused(() => A.save({
      leadId: buyer.id, purpose: "SALE", intent: null, budgetMinAed: 4_000_000, budgetMaxAed: 3_000_000,
      bedroomsMin: null, communities: [], preferences: [],
    }));
    ok("a budget the wrong way round is refused", !!back);
  }

  console.log("\n=== the assistant's reading of the chat ===");
  {
    const db = forOrg(org.id);
    const base = { budgetMin: null, budgetMax: 1_800_000, intent: "BUY_TO_LIVE" as const, timeframe: null, financing: null };
    const first = await requirementFromExtraction(db, org.id, chatty.id,
      { ...base, communities: ["jumeirah village circle"], bedrooms: 2, confidence: { budgetMax: 0.9, communities: 0.6 } });
    const r1 = await root.requirement.findFirst({ where: { leadId: chatty.id } });
    ok("the chat becomes a requirement", first === "created" && r1?.communities.join() === "JVC", `${first} ${r1?.communities.join()}`);
    ok("marked as the assistant's, with its least certain confidence", r1?.source === "ASSISTANT" && r1?.confidence === 0.6);
    const shown = (await A.forLead({ leadId: chatty.id }))[0];
    ok("and the person page says the assistant was unsure", shown?.unsure === true, String(shown?.unsure));
    const again = await requirementFromExtraction(db, org.id, chatty.id,
      { ...base, communities: [], bedrooms: 3, confidence: {} });
    const r2 = await root.requirement.findMany({ where: { leadId: chatty.id } });
    ok("a later message updates it rather than adding a second", again === "updated" && r2.length === 1 && r2[0]!.bedroomsMin === 3,
       `${again}, ${r2.length} rows`);
    ok("and what was not said again is kept", r2[0]?.communities.join() === "JVC");

    // The agent confirms it — it is theirs now, and the chat stops touching it.
    await A.save({
      leadId: chatty.id, id: r2[0]!.id, purpose: "SALE", intent: "BUY_TO_LIVE",
      budgetMinAed: null, budgetMaxAed: 1_800_000, bedroomsMin: 2, communities: ["JVC"], preferences: [],
    });
    const after = await requirementFromExtraction(db, org.id, chatty.id,
      { ...base, communities: ["palm"], bedrooms: 5, confidence: {} });
    const r3 = await root.requirement.findMany({ where: { leadId: chatty.id } });
    ok("once an agent has saved it, the assistant leaves it alone", after === "skipped" && r3.length === 1 && r3[0]!.bedroomsMin === 2,
       `${after}, beds ${r3[0]?.bedroomsMin}`);
    const seller = await requirementFromExtraction(db, org.id, theirs.id,
      { ...base, intent: "SELL", communities: ["marina"], bedrooms: 2, confidence: {} });
    ok("a seller is not given a search", seller === "skipped");
  }

  console.log("\n=== they stop looking ===");
  {
    const live = (await A.forLead({ leadId: buyer.id })).filter((r) => r.active);
    for (const r of live) await A.close({ id: r.id });
    const r = await search({ orgId: org.id, q: parse("buyers in dubai marina"), scope: { canSeeAll: false, viewerId: agent.id } });
    ok("closed, and search no longer offers them for it", !r.hits.some((h) => h.title === "Priya Nayr"));
    ok("but the history is kept", (await A.forLead({ leadId: buyer.id })).length >= 1);
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
