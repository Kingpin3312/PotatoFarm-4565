import type { AssignStrategy } from "@prisma/client";

/**
 * Routing a new lead.
 *
 * Agents watch this more closely than anything else in the product. A
 * round robin that is not obviously fair is worse than no round robin,
 * because the belief that somebody is being favoured survives any amount
 * of evidence — so the rotation is derived from the record rather than
 * from a counter somebody could have nudged.
 */

export type Candidate = {
  userId: string;
  name: string;
  openLeads: number;
  capacity: number;
  acceptingLeads: boolean;
  awayUntil: Date | null;
  languages: string[];
  communities: string[];
  /** When they were last given a lead. The rotation pointer, from data. */
  lastAssignedAt: Date | null;
  medianFirstResponseSeconds: number | null;
};

export type RoutingContext = {
  language?: string | null;
  community?: string | null;
  now?: Date;
};

export type Routed =
  | { assign: true; userId: string; why: string }
  | { assign: false; why: string };

/**
 * Who is actually available.
 *
 * Applied before any strategy runs. Routing to somebody on leave is how a
 * lead sits unanswered for three days while the board cheerfully reports
 * it as assigned — which is worse than leaving it in a pool, because at
 * least a pool looks unowned.
 */
export function available(c: Candidate[], ctx: RoutingContext = {}): Candidate[] {
  const now = ctx.now ?? new Date();

  return c.filter((a) => {
    if (!a.acceptingLeads) return false;
    if (a.awayUntil && a.awayUntil > now) return false;
    // At capacity means skip, not queue. A lead nobody has time for is
    // better off visible in a pool.
    if (a.openLeads >= a.capacity) return false;
    if (ctx.language && a.languages.length && !a.languages.includes(ctx.language)) return false;
    if (ctx.community && a.communities.length && !a.communities.includes(ctx.community)) return false;
    return true;
  });
}

export function route(strategy: AssignStrategy, candidates: Candidate[], ctx: RoutingContext = {}): Routed {
  if (strategy === "UNASSIGNED") {
    return { assign: false, why: "rule sends this to the shared pool" };
  }

  const pool = available(candidates, ctx);

  if (!pool.length) {
    /**
     * Nobody available is a real state, and it goes to the pool rather
     * than to whoever is least unavailable. Forcing an assignment here
     * produces the worst outcome in the system: a lead that looks handled
     * and is not.
     */
    const why = candidates.length
      ? "everyone matching is away, at capacity, or not accepting leads"
      : "no agents configured for this rule";
    return { assign: false, why };
  }

  switch (strategy) {
    case "SPECIFIC":
      return { assign: true, userId: pool[0].userId, why: `rule names ${pool[0].name}` };

    case "LEAST_LOADED": {
      const pick = [...pool].sort((a, b) => a.openLeads - b.openLeads)[0];
      return { assign: true, userId: pick.userId, why: `fewest open leads (${pick.openLeads})` };
    }

    case "FASTEST": {
      // Unknown response time sorts last rather than first. A new agent
      // with no history should not win a "fastest" contest by default.
      const pick = [...pool].sort((a, b) =>
        (a.medianFirstResponseSeconds ?? Infinity) - (b.medianFirstResponseSeconds ?? Infinity)
      )[0];
      return {
        assign: true,
        userId: pick.userId,
        why: pick.medianFirstResponseSeconds
          ? `fastest to reply (${Math.round(pick.medianFirstResponseSeconds / 60)} min median)`
          : "no response history — next in rotation",
      };
    }

    case "ROUND_ROBIN":
    default: {
      /**
       * Longest since their last lead wins. Derived from the ownership
       * record, so there is no counter to drift, no counter to reset on
       * deploy, and nothing anybody can be accused of adjusting.
       *
       * Never assigned at all sorts first, which is how a new joiner gets
       * their first lead on day one rather than at the end of a cycle.
       */
      const pick = [...pool].sort((a, b) => {
        if (!a.lastAssignedAt && !b.lastAssignedAt) return a.userId.localeCompare(b.userId);
        if (!a.lastAssignedAt) return -1;
        if (!b.lastAssignedAt) return 1;
        return a.lastAssignedAt.getTime() - b.lastAssignedAt.getTime();
      })[0];

      return {
        assign: true,
        userId: pick.userId,
        why: pick.lastAssignedAt
          ? `longest without a lead (since ${pick.lastAssignedAt.toISOString().slice(0, 10)})`
          : "no leads yet",
      };
    }
  }
}
