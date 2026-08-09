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

/**
 * The best candidate by a given ordering.
 *
 * Every branch below does `[...pool].sort(…)[0]` on a pool the guard has
 * already proved non-empty — which the compiler cannot see, so all ten
 * reads were errors under `noUncheckedIndexedAccess`.
 *
 * A non-null assertion at each site would silence it and would also be
 * ten places for the guard to drift out from under. One function, one
 * check: if the pool is ever empty here, that is a routing bug worth
 * hearing about rather than an agent picked at random.
 */
function bestOf<T>(pool: readonly T[], order?: (a: T, b: T) => number): T {
  const [head] = order ? [...pool].sort(order) : pool;
  if (!head) throw new Error("route(): pool was empty past the guard");
  return head;
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
    case "SPECIFIC": {
      const pick = bestOf(pool);
      return { assign: true, userId: pick.userId, why: `rule names ${pick.name}` };
    }

    case "LEAST_LOADED": {
      const pick = bestOf(pool, (a, b) => a.openLeads - b.openLeads);
      return { assign: true, userId: pick.userId, why: `fewest open leads (${pick.openLeads})` };
    }

    case "FASTEST": {
      // Unknown response time sorts last rather than first. A new agent
      // with no history should not win a "fastest" contest by default.
      const pick = bestOf(pool, (a, b) =>
        (a.medianFirstResponseSeconds ?? Infinity) - (b.medianFirstResponseSeconds ?? Infinity)
      );
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
      const pick = bestOf(pool, (a, b) => {
        if (!a.lastAssignedAt && !b.lastAssignedAt) return a.userId.localeCompare(b.userId);
        if (!a.lastAssignedAt) return -1;
        if (!b.lastAssignedAt) return 1;
        return a.lastAssignedAt.getTime() - b.lastAssignedAt.getTime();
      });

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
