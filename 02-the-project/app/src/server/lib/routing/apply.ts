import type { Prisma, AssignStrategy, LeadSource } from "@prisma/client";
import { route, type Candidate } from "./assign";

/**
 * Actually giving a lead to somebody.
 *
 * **`route()` was called by exactly one thing: `routing.preview`** — the
 * query that shows a manager who *would* get the next lead. Nothing
 * called it when a lead arrived. Neither WhatsApp ingest nor the portal
 * feeds set `assignedToId` at all, so every lead from every channel
 * landed with no owner, forever, while a screen in Settings cheerfully
 * demonstrated the rotation that was never going to run.
 *
 * That is the "light switch wired to nothing" shape again, with the
 * worst possible extra: a working preview of the thing that does not
 * happen.
 *
 * ## And there were no rules either
 *
 * Nothing ever created an `AssignmentRule`. `routing.rules` reads them,
 * `current` reports the strategy of the first one, and with none the
 * screen answered "what happens to a new lead" with "Not set" — which
 * was true, and read like a setting somebody had forgotten rather than
 * a feature with no way in.
 *
 * ## Why this never throws
 *
 * It runs inside the inbound webhook transaction. A lead that arrives
 * and cannot be routed must still be a lead — unassigned and visible in
 * the pool is a recoverable state that an agent can claim from, while a
 * failed ingest is a customer message that vanished. Every failure path
 * here returns "nobody" and says why.
 */

export type Assigner = {
  assignmentRule: {
    findMany(args: {
      where: { orgId: string; active: boolean };
      orderBy: { priority: "asc" };
    }): PromiseLike<RuleRow[]>;
  };
  membership: {
    findMany(args: {
      where: { orgId: string; role: "AGENT" };
      select: { userId: true; user: { select: { name: true } } };
    }): PromiseLike<{ userId: string; user: { name: string | null } }[]>;
  };
  lead: {
    count(args: { where: Prisma.LeadWhereInput }): PromiseLike<number>;
  };
  agentAvailability: {
    findMany(args: {
      where: { orgId: string };
    }): PromiseLike<AvailabilityRow[]>;
  };
  leadOwnership: {
    findMany(args: {
      where: { orgId: string };
      orderBy: { startedAt: "desc" };
      select: { userId: true; startedAt: true };
    }): PromiseLike<{ userId: string | null; startedAt: Date }[]>;
  };
};

type RuleRow = {
  id: string;
  name: string;
  priority: number;
  sources: LeadSource[];
  communities: string[];
  languages: string[];
  minBudgetFils: bigint | null;
  maxBudgetFils: bigint | null;
  strategy: AssignStrategy;
  userIds: string[];
};

type AvailabilityRow = {
  userId: string;
  capacity: number;
  acceptingLeads: boolean;
  awayTo: Date | null;
  languages: string[];
  communities: string[];
};

/**
 * The first rule whose conditions all match.
 *
 * Rules are ordered by `priority` ascending and an empty condition list
 * means "always", which is what makes the lowest-priority rule the
 * fallback — the model's own comment says so. Written as a plain scan
 * rather than a query because the conditions are five different shapes
 * and a rule set is small; a brokerage with two hundred routing rules
 * has a different problem.
 */
export function firstMatchingRule(
  rules: RuleRow[],
  lead: { source: LeadSource | null; community?: string | null; language?: string | null; budgetMaxFils?: bigint | null },
): RuleRow | null {
  for (const r of rules) {
    if (r.sources.length && (!lead.source || !r.sources.includes(lead.source))) continue;
    if (r.communities.length && (!lead.community || !r.communities.includes(lead.community))) continue;
    if (r.languages.length && (!lead.language || !r.languages.includes(lead.language))) continue;
    /**
     * Budget bands compare against what we know, and an unknown budget
     * does not match a band.
     *
     * A first WhatsApp message rarely carries a figure. Treating "no
     * budget yet" as zero would send every new enquiry to whoever
     * handles the cheapest properties, which is precisely backwards for
     * a lead nobody has qualified.
     */
    if (r.minBudgetFils !== null) {
      if (lead.budgetMaxFils == null || lead.budgetMaxFils < r.minBudgetFils) continue;
    }
    if (r.maxBudgetFils !== null) {
      if (lead.budgetMaxFils == null || lead.budgetMaxFils > r.maxBudgetFils) continue;
    }
    return r;
  }
  return null;
}

/**
 * Route one newly created lead, and say who got it.
 *
 * Returns the user id to assign, or null for the shared pool. The caller
 * writes the assignment, because it owns the transaction and the
 * `LeadOwnership` row that has to go with it.
 */
export async function assignmentFor(
  tx: Assigner,
  args: {
    orgId: string;
    source: LeadSource | null;
    community?: string | null;
    language?: string | null;
    budgetMaxFils?: bigint | null;
    now?: Date;
  },
): Promise<{ userId: string | null; why: string; ruleId: string | null }> {
  const rules = await tx.assignmentRule.findMany({
    where: { orgId: args.orgId, active: true },
    orderBy: { priority: "asc" },
  });

  const rule = firstMatchingRule(rules, args);
  if (!rule) {
    // Not an error. A brokerage may deliberately work from a shared
    // pool, and `seedRoutingRule` gives every new one a fallback anyway.
    return { userId: null, why: "no routing rule matched", ruleId: null };
  }
  if (rule.strategy === "UNASSIGNED") {
    return { userId: null, why: `rule "${rule.name}" sends these to the pool`, ruleId: rule.id };
  }

  const candidates = await candidatesFor(tx, args.orgId, rule.userIds);
  if (!candidates.length) {
    return { userId: null, why: "no agents to route to", ruleId: rule.id };
  }

  const routed = route(rule.strategy, candidates, {
    language: args.language,
    community: args.community,
    now: args.now,
  });

  if (!routed.assign) {
    return { userId: null, why: routed.why, ruleId: rule.id };
  }
  return { userId: routed.userId, why: `rule "${rule.name}": ${routed.why}`, ruleId: rule.id };
}

/**
 * The pool, with the state each strategy sorts by.
 *
 * Three queries rather than three per agent. The preview in
 * `routing.ts` does `Promise.all` over every member with three queries
 * each — fine for a settings screen somebody opens occasionally, and not
 * fine on the inbound path of every WhatsApp message, where it would be
 * 3N round trips inside the webhook transaction.
 */
async function candidatesFor(
  tx: Assigner,
  orgId: string,
  restrictTo: string[],
): Promise<Candidate[]> {
  const members = await tx.membership.findMany({
    where: { orgId, role: "AGENT" },
    select: { userId: true, user: { select: { name: true } } },
  });

  // An empty pool on the rule means everyone with the AGENT role — the
  // model's comment says so, and it is what makes a rule useful before
  // anybody has been picked out by name.
  const pool = restrictTo.length
    ? members.filter((m) => restrictTo.includes(m.userId))
    : members;
  if (!pool.length) return [];

  const [availability, ownership] = await Promise.all([
    tx.agentAvailability.findMany({ where: { orgId } }),
    tx.leadOwnership.findMany({
      where: { orgId },
      orderBy: { startedAt: "desc" },
      select: { userId: true, startedAt: true },
    }),
  ]);

  const avail = new Map(availability.map((a) => [a.userId, a]));
  // First occurrence wins because the rows arrive newest first, so this
  // is each agent's most recent assignment — the rotation pointer.
  const lastFor = new Map<string, Date>();
  for (const o of ownership) {
    if (o.userId && !lastFor.has(o.userId)) lastFor.set(o.userId, o.startedAt);
  }

  const counts = await Promise.all(
    pool.map((m) =>
      tx.lead.count({
        where: { assignedToId: m.userId, deletedAt: null, status: { notIn: ["WON", "LOST"] } },
      })
    )
  );

  return pool.map((m, i) => {
    const a = avail.get(m.userId);
    return {
      userId: m.userId,
      name: m.user.name ?? "an agent",
      openLeads: counts[i] ?? 0,
      capacity: a?.capacity ?? 40,
      acceptingLeads: a?.acceptingLeads ?? true,
      awayUntil: a?.awayTo ?? null,
      languages: a?.languages ?? [],
      communities: a?.communities ?? [],
      lastAssignedAt: lastFor.get(m.userId) ?? null,
      medianFirstResponseSeconds: null,
    };
  });
}

/**
 * The rule every brokerage starts with.
 *
 * One rule, no conditions, round robin over everybody. It is the
 * arrangement a small brokerage actually uses, and — more to the point —
 * it is the one that makes the behaviour visible. A brokerage that wants
 * something else can see a rule on the screen and change it; a brokerage
 * with no rules at all sees "Not set" and cannot tell whether routing is
 * off, broken, or waiting for them.
 *
 * `priority: 1000` leaves room to insert rules above it without
 * renumbering, in the same spirit as the pipeline stage spacing.
 */
export async function seedRoutingRule(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<boolean> {
  const existing = await tx.assignmentRule.count({ where: { orgId } });
  if (existing > 0) return false;

  await tx.assignmentRule.create({
    data: {
      orgId,
      name: "Everyone, in turn",
      priority: 1000,
      active: true,
      strategy: "ROUND_ROBIN",
    },
  });
  return true;
}

/** Reported the same way everywhere, so the audit row and the log agree. */
export function describeAssignment(r: { userId: string | null; why: string }): string {
  return r.userId ? `assigned — ${r.why}` : `left in the pool — ${r.why}`;
}

