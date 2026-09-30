import { crossTenant } from "../src/server/db/client";
import { leadsRouter } from "../src/server/api/routers/leads";
import { dueForVisaNudge } from "../src/server/lib/matching/visa-nudge";
import { fatal } from "./fatal";

/**
 * An agent can correct what the product knows about somebody.
 *
 * `leads` had create, assign and remove and no update, and the person
 * page never showed who the person was. A misheard name, a revised
 * budget and the visa renewal date the renewal prompt depends on were
 * fixed for ever at whatever was first written.
 *
 *     npm run check:lead-editing
 */
const root = crossTenant("sweep");
const SLUG = "lead-editing-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `lead-editing-check-${k}-${RUN}@example.com`;

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
    await root.conversation.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "lead-editing-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nAn agent can correct what we know about somebody\n");
  await cleanup();
  const org = await root.organisation.create({ data: { name: "Lead Editing Check", slug: `${SLUG}a` } });
  const mk = (k: string, name: string) => root.user.create({ data: { email: EMAIL(k), name } });
  const agent = await mk("agent", "Tom Reilly");
  const colleague = await mk("colleague", "Yasmin Haddad");
  const manager = await mk("manager", "Maya Chen");
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: agent.id, role: "AGENT" },
      { orgId: org.id, userId: colleague.id, role: "AGENT" },
      { orgId: org.id, userId: manager.id, role: "MANAGER" },
    ],
  });
  const channel = await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: `+9714${RUN.slice(-7)}` } });
  const phone = `+97150${String(Date.now()).slice(-7)}`;
  const lead = await root.lead.create({
    data: {
      orgId: org.id, phone, name: "Priya Nayr", assignedToId: agent.id,
      visaNudgedAt: new Date(Date.now() - 10 * 86_400_000),
      conversation: { create: { orgId: org.id, channelId: channel.id, lastInboundAt: new Date(Date.now() - 5 * 86_400_000) } },
    },
  });
  const theirs = await root.lead.create({ data: { orgId: org.id, phone: `+97155${String(Date.now()).slice(-7)}`, name: "Not Yours", assignedToId: colleague.id } });

  const as = (userId: string, role: "AGENT" | "MANAGER") => leadsRouter.createCaller({
    session: { user: { id: userId } },
    membership: { orgId: org.id, orgName: org.name, role },
    ip: "127.0.0.1", userAgent: "lead-editing-check",
  } as never);
  const A = as(agent.id, "AGENT"), M = as(manager.id, "MANAGER");

  console.log("=== correcting ===");
  {
    const renews = new Date(Date.now() + 40 * 86_400_000);
    await A.update({
      leadId: lead.id, name: "Priya Nair", email: "Priya@Example.com", budgetMinAed: 1_500_000, budgetMaxAed: 2_500_000,
      intent: "BUY_TO_LIVE", financing: "MORTGAGE", timeframe: "Within 3 months", visaExpiresAt: renews,
      // Not in the schema: must be ignored, not applied.
      ...({ phone: "+971509999999" } as object),
    });
    const d = await A.detail({ leadId: lead.id });
    ok("the name, email and wants are saved", d.name === "Priya Nair" && d.email === "priya@example.com" && d.intent === "BUY_TO_LIVE");
    // The unit that has bitten this codebase before: dirhams in, fils stored.
    ok("the budget is stored in fils and shown back in dirhams",
       d.budgetMinFils === 150_000_000n && d.budgetMaxAed === 2_500_000, `${d.budgetMinFils} fils`);
    ok("the phone number cannot be changed", d.phone === phone, d.phone);
    const row = await root.lead.findUniqueOrThrow({ where: { id: lead.id } });
    ok("a new visa date re-arms the renewal prompt", row.visaNudgedAt === null);
    const due = await dueForVisaNudge(org.id, new Date(new Date().setUTCHours(8, 0, 0, 0)));
    ok("and the renewal sweep can now find them — it never could before", due.some((x) => x.leadId === lead.id));
    const log = await root.auditLog.findFirst({ where: { orgId: org.id, action: "lead.update", entityId: lead.id } });
    const text = JSON.stringify(log?.after ?? {});
    ok("the audit log names the fields changed and not their values",
       !!log && text.includes("budgetMinFils") && !text.includes("example.com") && !text.includes("Nair"), text.slice(0, 120));
  }

  console.log("\n=== the rules ===");
  {
    const e = await refused(() => A.update({ leadId: lead.id, budgetMinAed: 3_000_000 }));
    ok("a lower budget above the upper one is refused", !!e && /above the upper/.test(e.message), e?.message ?? "allowed");
    const other = await refused(() => A.update({ leadId: theirs.id, name: "Changed" }));
    ok("an agent cannot edit a colleague's lead", other?.code === "NOT_FOUND", other?.code ?? "allowed");
    const peek = await refused(() => A.detail({ leadId: theirs.id }));
    ok("or read it", peek?.code === "NOT_FOUND");
    await M.update({ leadId: theirs.id, timeframe: "This year" });
    ok("a manager can", (await root.lead.findUniqueOrThrow({ where: { id: theirs.id } })).timeframe === "This year");
    await root.lead.update({ where: { id: theirs.id }, data: { deletedAt: new Date() } });
    const gone = await refused(() => M.update({ leadId: theirs.id, name: "Back" }));
    ok("a deleted lead cannot be edited back to life", gone?.code === "NOT_FOUND");
  }

  console.log("\n=== they asked us to stop ===");
  {
    await A.update({ leadId: lead.id, optedOut: true });
    const row = await root.lead.findUniqueOrThrow({ where: { id: lead.id } });
    ok("recorded, with when", row.optedOutOfOutreach && row.optedOutAt !== null);
    ok("as its own audit entry",
       !!(await root.auditLog.findFirst({ where: { orgId: org.id, action: "lead.opted_out", entityId: lead.id } })));
    const due = await dueForVisaNudge(org.id, new Date(new Date().setUTCHours(8, 0, 0, 0)));
    ok("and nothing is prepared for them any more", !due.some((x) => x.leadId === lead.id));
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\nwhat we know about somebody can be put right.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
