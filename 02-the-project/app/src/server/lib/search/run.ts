import { forOrg } from "@/server/db/client";
import { storedVariants } from "@/server/lib/places";
import { aedToFils } from "@/server/lib/requests/intake";
import type { Query } from "./parse";

/**
 * The query, actually run.
 *
 * Three record types, because an agent's question does not know which
 * table the answer is in: a **person** (a lead, with their requirements
 * and the facts remembered about them), an **owner** (a vendor), and a
 * **property**.
 *
 * Every result carries the reason it came back. That is not decoration —
 * the agent is about to ring this person, and "matched your budget band
 * and a note saying relocating from Moscow" is the difference between a
 * confident call and reading a screen out loud.
 */

export type Hit = {
  kind: "person" | "owner" | "property";
  id: string;
  /** Where clicking goes. */
  href: string;
  title: string;
  /** One line under the name: budget, area, whatever identifies them. */
  subtitle: string | null;
  /** Why this came back, in words. */
  why: string[];
  /**
   * Higher is better. Structured agreement outranks a word appearing in
   * a note, because a budget that fits is a fact and a word in a note is
   * a coincidence until a human looks.
   */
  score: number;
  /** Redacted for an agent looking at a colleague's client. */
  restricted: boolean;
  agentName: string | null;
};

export type Results = {
  hits: Hit[];
  counts: { people: number; owners: number; properties: number };
  /** True when nothing was asked that could be searched. */
  empty: boolean;
};

/** Weights, in one place so the ranking can be argued about. */
const W = {
  budget: 3,
  community: 3,
  bedrooms: 2,
  intent: 2,
  /** A term hit in a name is worth far more than one in a note. */
  name: 4,
  note: 1,
  fact: 1.5,
  /** Somebody the brokerage already thinks is hot, all else equal. */
  warmth: 0.01,
};

/**
 * Case-insensitive "contains", built for Prisma.
 *
 * Deliberately `contains` and not full-text: at pilot scale — thousands
 * of rows, not millions — a sequential scan is single-digit
 * milliseconds, and full-text would mean a migration, a GIN index per
 * table and a tsvector column that has to be kept in step. When a
 * brokerage's book outgrows this, the upgrade is a `pg_trgm` index
 * behind the same call, not a rewrite of the caller.
 */
const like = (s: string) => ({ contains: s, mode: "insensitive" as const });

/**
 * The reasons a colleague is allowed to see.
 *
 * Hiding the name is pointless if the line underneath says
 * `name matches "faisal"` or quotes a private note back — which the
 * first version did. Structured agreement is fine to show (a budget
 * band and an area are not secrets); anything drawn from a name or a
 * remembered sentence is not.
 *
 * And a row with every reason stripped needs *something*, or an agent
 * sees a blank line and learns to ignore these. Watching this on a real
 * screen, "who is relocating" returned one result reading "Another
 * agent's client — Ask Omar Haddad" and nothing else at all. Saying
 * that the match came from notes they cannot see is both true and
 * enough to act on.
 */
function redact(why: string[]): string[] {
  const safe = why.filter((w) => !w.startsWith("name matches") && !w.startsWith("remembered"));
  return safe.length ? safe : ["matches something in their notes"];
}

export async function search(args: {
  orgId: string;
  q: Query;
  scope: { canSeeAll: boolean; viewerId: string };
  limit?: number;
}): Promise<Results> {
  const db = forOrg(args.orgId);
  const { q } = args;
  const limit = args.limit ?? 30;

  const hits: Hit[] = [];
  const counts = { people: 0, owners: 0, properties: 0 };

  const minFils = q.budget?.minAed != null ? aedToFils(q.budget.minAed) : null;
  const maxFils = q.budget?.maxAed != null ? aedToFils(q.budget.maxAed) : null;

  /**
   * Remembered facts, fetched once for everybody.
   *
   * `ClientFact.leadId` is a foreign key column with no Prisma relation
   * declared on either side — the same shape `Requirement` had, where
   * `include: { lead: … }` typed as `never`. Declaring the relation
   * would add a constraint and therefore a migration, and this needs
   * neither: one query keyed by body, then attributed to whichever
   * parent it names.
   *
   * This is the half of search that makes it worth having. "Relocating
   * from Moscow", "walked away over service charges", "only answers
   * WhatsApp" are not columns and never will be, and they are exactly
   * what an agent remembers about somebody a year later.
   */
  const factsByLead = new Map<string, string[]>();
  const factsByVendor = new Map<string, string[]>();
  if (q.terms.length) {
    const rows = await db.clientFact.findMany({
      where: { retractedAt: null, OR: q.terms.map((t) => ({ body: like(t) })) },
      take: 300,
      select: { leadId: true, vendorId: true, body: true },
    });
    for (const f of rows) {
      const bag = f.leadId ? factsByLead : f.vendorId ? factsByVendor : null;
      const key = f.leadId ?? f.vendorId;
      if (!bag || !key) continue;
      bag.set(key, [...(bag.get(key) ?? []), f.body]);
    }
  }

  /* ------------------------------- people ------------------------------ */

  if (q.only !== "properties") {
    /**
     * Everything that could possibly match, then scored in memory.
     *
     * The alternative — one SQL query per criterion combination — either
     * ANDs everything (and a search with four clues returns nothing,
     * which is the worst behaviour a search can have) or ORs everything
     * and cannot rank. Fetching a bounded candidate set and scoring it
     * is the honest version, and the bound is what keeps it sane.
     */
    const where: Record<string, unknown>[] = [];

    for (const t of q.terms) {
      where.push({ name: like(t) }, { notes: like(t) }, { email: like(t) },
                  { phone: { contains: t } });
    }
    if (factsByLead.size) where.push({ id: { in: [...factsByLead.keys()] } });
    if (q.communities.length) {
      where.push({
        requirements: {
          some: { communities: { hasSome: q.communities.flatMap(storedVariants) } },
        },
      });
    }
    if (minFils || maxFils) {
      where.push({
        budgetMaxFils: { ...(minFils ? { gte: minFils } : {}), ...(maxFils ? { lte: maxFils } : {}) },
      });
      where.push({
        requirements: {
          some: {
            budgetMaxFils: {
              ...(minFils ? { gte: minFils } : {}),
              ...(maxFils ? { lte: maxFils } : {}),
            },
          },
        },
      });
    }
    if (q.intent && q.intent !== "SELL") where.push({ intent: q.intent });
    if (q.bedrooms != null) where.push({ requirements: { some: { bedroomsMin: q.bedrooms } } });
    if (q.since) where.push({ createdAt: { gte: q.since } }, { updatedAt: { gte: q.since } });

    if (where.length) {
      const rows = await db.lead.findMany({
        where: { deletedAt: null, OR: where },
        take: 200,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, name: true, phone: true, email: true, notes: true,
          score: true, intent: true, budgetMaxFils: true, createdAt: true,
          assignedToId: true,
          assignedTo: { select: { name: true, email: true } },
          requirements: {
            where: { active: true },
            select: { communities: true, bedroomsMin: true, budgetMaxFils: true, intent: true },
          },
        },
      });

      for (const r of rows) {
        const why: string[] = [];
        let score = 0;
        const facts = factsByLead.get(r.id) ?? [];

        for (const t of q.terms) {
          const fact = facts.find((b) => b.toLowerCase().includes(t));
          if (r.name?.toLowerCase().includes(t)) { score += W.name; why.push(`name matches "${t}"`); }
          else if (r.notes?.toLowerCase().includes(t)) { score += W.note; why.push(`"${t}" in your notes`); }
          else if (fact) {
            score += W.fact;
            why.push(`remembered: ${fact.slice(0, 80)}`);
          } else if (r.email?.toLowerCase().includes(t) || r.phone.includes(t)) {
            score += W.note; why.push(`contact details match "${t}"`);
          }
        }

        const budgets = [r.budgetMaxFils, ...r.requirements.map((x) => x.budgetMaxFils)]
          .filter((x): x is bigint => x !== null);
        if ((minFils || maxFils) && budgets.some((b) =>
              (!minFils || b >= minFils) && (!maxFils || b <= maxFils))) {
          score += W.budget; why.push("budget fits");
        }

        if (q.communities.length) {
          const want = new Set(q.communities.flatMap(storedVariants).map((s) => s.toLowerCase()));
          const has = r.requirements.flatMap((x) => x.communities)
            .find((c) => want.has(c.toLowerCase()));
          if (has) { score += W.community; why.push(`looking in ${has}`); }
        }

        if (q.bedrooms != null && r.requirements.some((x) => x.bedroomsMin === q.bedrooms)) {
          score += W.bedrooms; why.push(`wants ${q.bedrooms} bedrooms`);
        }

        if (q.intent && q.intent !== "SELL" &&
            (r.intent === q.intent || r.requirements.some((x) => x.intent === q.intent))) {
          score += W.intent;
          why.push(q.intent === "BUY_TO_INVEST" ? "investor" : q.intent === "RENT" ? "renting" : "buying to live in");
        }

        if (q.since && (r.createdAt >= q.since)) { score += 1; why.push("added recently"); }

        if (score <= 0) continue;
        score += (r.score ?? 0) * W.warmth;

        const mine = args.scope.canSeeAll || r.assignedToId === args.scope.viewerId;
        counts.people += 1;
        hits.push({
          kind: "person",
          id: r.id,
          href: mine ? `/blackbook/${r.id}` : "",
          // Same rule as "Who wants it": the count is the firm's, the
          // name is not. A search that quietly names every colleague's
          // client is a poaching tool with a text box.
          title: mine ? (r.name ?? r.phone) : "Another agent's client",
          subtitle: mine ? null : `Ask ${r.assignedTo?.name ?? r.assignedTo?.email ?? "the agent"}`,
          why: mine ? why : redact(why),
          score,
          restricted: !mine,
          agentName: r.assignedTo?.name ?? r.assignedTo?.email ?? null,
        });
      }
    }
  }

  /* ------------------------------- owners ------------------------------ */

  if (q.only !== "properties" && (q.terms.length || q.intent === "SELL")) {
    const where: Record<string, unknown>[] = [];
    for (const t of q.terms) {
      // No free-text note field on Vendor — what an agent remembers
      // about an owner lives in `ClientFact`, same as for a buyer.
      where.push({ name: like(t) }, { email: like(t) }, { phone: { contains: t } },
                 { actingFor: like(t) });
    }
    if (factsByVendor.size) where.push({ id: { in: [...factsByVendor.keys()] } });
    // "Sellers in Palm Jumeirah" with no other clue: every owner of a
    // property there, which is the question actually being asked.
    if (q.communities.length) {
      where.push({
        listings: { some: { deletedAt: null, community: { in: q.communities.flatMap(storedVariants), mode: "insensitive" } } },
      });
    }

    if (where.length) {
      const rows = await db.vendor.findMany({
        where: { OR: where },
        take: 80,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, name: true, phone: true, email: true, actingFor: true,
          listings: { where: { deletedAt: null }, select: { reference: true, community: true }, take: 3 },
        },
      });

      for (const r of rows) {
        const why: string[] = [];
        let score = 0;
        const facts = factsByVendor.get(r.id) ?? [];
        for (const t of q.terms) {
          const fact = facts.find((b) => b.toLowerCase().includes(t));
          if (r.name.toLowerCase().includes(t)) { score += W.name; why.push(`name matches "${t}"`); }
          else if (fact) { score += W.fact; why.push(`remembered: ${fact.slice(0, 80)}`); }
          else if (r.actingFor?.toLowerCase().includes(t)) {
            score += W.note; why.push(`acting for ${r.actingFor}`);
          }
        }
        if (q.communities.length) {
          const want = new Set(q.communities.flatMap(storedVariants).map((s) => s.toLowerCase()));
          const l = r.listings.find((x) => x.community && want.has(x.community.toLowerCase()));
          if (l) { score += W.community; why.push(`owns ${l.reference} in ${l.community}`); }
        }
        if (q.intent === "SELL" && r.listings.length) { score += W.intent; why.push("has a property with you"); }
        if (score <= 0) continue;

        counts.owners += 1;
        hits.push({
          kind: "owner", id: r.id,
          /**
           * No href, because there is no owner screen to send them to.
           *
           * `/vendors` has a `new` page and a report component and no
           * list and no detail — the seller side is reachable through
           * listings and offers only. Linking to a page that does not
           * exist would be worse than not linking: the phone number is
           * what an agent actually needs from this row, so it goes in
           * the subtitle and the row stays honest about being an answer
           * rather than a destination.
           */
          href: "",
          title: r.name,
          subtitle: [r.phone, r.listings.map((l) => l.reference).join(", ")]
            .filter(Boolean).join(" · ") || null,
          why, score, restricted: false, agentName: null,
        });
      }
    }
  }

  /* ----------------------------- properties ---------------------------- */

  if (q.only !== "people") {
    /**
     * **Filters on a property are hard. Filters on a person are soft.**
     *
     * The asymmetry is the point, and it took a failing check to see it.
     * "3 bed in Downtown under 5m" was returning a 40m villa in Emirates
     * Hills, because the bedroom clause matched and everything was OR'd
     * together — the same generosity that is right for people.
     *
     * It is not right here. An agent searching people is trying to
     * *remember somebody*, and a near-miss ranked fourth is a help; an
     * agent searching properties is filtering stock they are about to
     * put in front of a client, and a villa at eight times the stated
     * ceiling is not a near-miss, it is the search ignoring them.
     *
     * So price, area and bedrooms constrain; the words rank.
     */
    const AND: Record<string, unknown>[] = [];

    if (minFils || maxFils) {
      AND.push({
        OR: [
          // Price on application. It cannot be ruled out by a ceiling,
          // and hiding stock because nobody typed a number is worse
          // than showing one line the agent can dismiss.
          { priceFils: null },
          { priceFils: { ...(minFils ? { gte: minFils } : {}), ...(maxFils ? { lte: maxFils } : {}) } },
        ],
      });
    }
    if (q.communities.length) {
      AND.push({ community: { in: q.communities.flatMap(storedVariants), mode: "insensitive" } });
    }
    // More bedrooms than asked for is fine. Fewer never is.
    if (q.bedrooms != null) AND.push({ bedrooms: { gte: q.bedrooms } });

    const words: Record<string, unknown>[] = [];
    for (const t of q.terms) {
      words.push({ title: like(t) }, { reference: like(t) }, { community: like(t) },
                 { building: like(t) });
    }

    if (AND.length || words.length) {
      const rows = await db.listing.findMany({
        where: {
          deletedAt: null,
          ...(q.purpose ? { purpose: q.purpose } : {}),
          ...(AND.length ? { AND } : {}),
          ...(words.length ? { OR: words } : {}),
        },
        take: 120,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, reference: true, title: true, community: true, building: true,
          bedrooms: true, priceFils: true, status: true,
        },
      });

      for (const r of rows) {
        const why: string[] = [];
        let score = 0;
        for (const t of q.terms) {
          if (r.title.toLowerCase().includes(t) || r.reference.toLowerCase().includes(t)) {
            score += W.name; why.push(`matches "${t}"`);
          } else if (r.building?.toLowerCase().includes(t)) {
            score += W.note; why.push(`${r.building}`);
          }
        }
        if (q.communities.length && r.community) {
          const want = new Set(q.communities.flatMap(storedVariants).map((s) => s.toLowerCase()));
          if (want.has(r.community.toLowerCase())) { score += W.community; why.push(r.community); }
        }
        if (minFils || maxFils) {
          if (r.priceFils === null) {
            // Let through by the filter above on the grounds that a
            // ceiling cannot exclude a price nobody has entered. It
            // needs a score too, or it is admitted by the query and
            // then silently dropped by the ranking.
            score += 1; why.push("no price on file");
          } else if ((!minFils || r.priceFils >= minFils) && (!maxFils || r.priceFils <= maxFils)) {
            score += W.budget; why.push("price is in range");
          }
        }
        if (q.bedrooms != null && r.bedrooms != null && r.bedrooms >= q.bedrooms) {
          score += W.bedrooms; why.push(`${r.bedrooms} bedrooms`);
        }
        if (score <= 0) continue;

        counts.properties += 1;
        hits.push({
          kind: "property", id: r.id,
          // The listings screen now takes `?q=`, so this lands on the
          // list already filtered to this one reference.
          href: `/listings?q=${encodeURIComponent(r.reference)}`,
          title: r.title, subtitle: `${r.reference} · ${r.status.toLowerCase().replace(/_/g, " ")}`,
          why, score, restricted: false, agentName: null,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);

  return { hits: hits.slice(0, limit), counts, empty: hits.length === 0 };
}
