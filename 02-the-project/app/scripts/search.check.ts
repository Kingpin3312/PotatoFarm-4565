/**
 * Ask it in English, get the right person.
 *
 * A search is judged by what it *fails* to return, and that is invisible
 * in a demo — an agent types a question, gets three plausible names, and
 * has no way of knowing the person they were actually thinking of was
 * the fourth. So this checks both directions on every query: the right
 * one is in, and the wrong ones are out.
 *
 * The four ways this can be quietly wrong:
 *
 *   1. **Understanding the sentence differently from the agent.** "Under
 *      3m" including a 3.4m buyer, "around 4" excluding a 3.9m one.
 *   2. **Requiring everything.** Four clues that AND together return
 *      nothing, which is the worst behaviour a search can have.
 *   3. **Naming a colleague's client.** Same rule as everywhere else.
 *   4. **Leaking across brokerages.** The one that ends the company.
 *
 *     npm run check:search
 */
import { crossTenant } from "../src/server/db/client";
import { parse, isEmpty } from "../src/server/lib/search/parse";
import { search } from "../src/server/lib/search/run";
import { placesIn } from "../src/server/lib/places";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "search-check-";
const fails: string[] = [];

function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

const M = (aed: number) => BigInt(aed) * 100n;
const ago = (d: number) => new Date(Date.now() - d * 86_400_000);

async function main() {
  console.log("\nFind anyone\n");

  /* ------------------- the sentence, before any database ------------- */

  console.log("Reading the question:");
  {
    const q = parse("who was that Emirati investor looking in Downtown around 4 million");
    ok("a band, not a number", q.budget?.minAed === 3_400_000 && q.budget?.maxAed === 4_600_000,
       JSON.stringify(q.budget));
    ok("the place", q.communities.join() === "Downtown", q.communities.join());
    ok("the intent", q.intent === "BUY_TO_INVEST");
    ok("and the word it could not place is kept, not thrown away",
       q.terms.includes("emirati"), JSON.stringify(q.terms));
    ok("people, not properties", q.only === "people");
  }

  ok("'under 3m' is a ceiling", (() => {
    const b = parse("3 bed in Dubai Marina under 3m").budget;
    return b?.maxAed === 3_000_000 && b.minAed === null;
  })());
  ok("'between 5 and 7 million' is both ends", (() => {
    const b = parse("villa between 5 and 7 million").budget;
    return b?.minAed === 5_000_000 && b.maxAed === 7_000_000;
  })());
  ok("'over 10m' is a floor", (() => {
    const b = parse("anything over 10m").budget;
    return b?.minAed === 10_000_000 && b.maxAed === null;
  })());
  ok("a bare number in this trade means millions",
     parse("around 4").budget?.maxAed === 4_600_000);
  ok("but a written-out figure is taken as written",
     parse("around 4,000,000").budget?.maxAed === 4_600_000);
  ok("800k is thousands", parse("800k").budget?.maxAed === 920_000);
  /**
   * The guard that matters more than the parsing.
   *
   * "4 billion" is not a Dubai property, it is a typo or a
   * transcription error, and treating it as a filter returns nothing
   * while looking like it worked.
   */
  ok("an implausible figure is ignored rather than filtered on",
     parse("villa 900 million").budget === null,
     JSON.stringify(parse("villa 900 million").budget));

  /**
   * The bug that would have made half the queries silently do nothing.
   *
   * `\b` sits between a word and a space, not between "seller" and its
   * own plural, so `/\bseller\b/` never matched "sellers" — the
   * commonest way anybody says it.
   */
  console.log("\nPlurals, which the first version got wrong:");
  ok("sellers", parse("sellers in Palm Jumeirah").intent === "SELL");
  ok("investors", parse("investors in JVC").intent === "BUY_TO_INVEST");
  ok("tenants", parse("tenants in Marina").intent === "RENT");
  ok("singular still works", parse("an investor in JVC").intent === "BUY_TO_INVEST");

  console.log("\nHow people actually say Dubai:");
  ok("Ranches is Arabian Ranches", placesIn("in the ranches").places.join() === "Arabian Ranches");
  ok("JBR is JBR", placesIn("jbr").places.join() === "JBR");
  ok("the Palm is Palm Jumeirah", placesIn("on the palm").places.join() === "Palm Jumeirah");
  ok("Dubai Marina beats Marina to it",
     placesIn("dubai marina").places.join() === "Dubai Marina",
     placesIn("dubai marina").places.join());
  ok("and a matched place does not survive as a keyword too", (() => {
    const q = parse("3 bed in dubai marina");
    return q.communities.join() === "Dubai Marina" && !q.terms.includes("marina");
  })(), JSON.stringify(parse("3 bed in dubai marina").terms));

  console.log("\nA question with nothing in it says so:");
  ok("'who did I meet' is not a search", isEmpty(parse("who did I meet")),
     JSON.stringify(parse("who did I meet")));
  ok("but 'who did I meet last week' is",
     !isEmpty(parse("who did I meet last week")));

  /* ---------------------- against a real database -------------------- */

  console.log("\nAgainst a real brokerage:");
  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  const org = await root.organisation.create({
    data: { name: "Search Check", slug: `${SLUG}a` },
  });
  const mine = await root.user.upsert({
    where: { email: "search-check-a@example.com" },
    create: { email: "search-check-a@example.com", name: "Yasmin Haddad" },
    update: { name: "Yasmin Haddad" },
  });
  const theirs = await root.user.upsert({
    where: { email: "search-check-b@example.com" },
    create: { email: "search-check-b@example.com", name: "Tom Reilly" },
    update: { name: "Tom Reilly" },
  });
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: mine.id, role: "AGENT" },
      { orgId: org.id, userId: theirs.id, role: "AGENT" },
    ],
  });

  let phone = 500_000_300;
  async function person(o: {
    name: string; agentId?: string; budget?: bigint; beds?: number;
    community?: string; intent?: "BUY_TO_LIVE" | "BUY_TO_INVEST" | "RENT";
    notes?: string; fact?: string; createdAt?: Date;
  }) {
    const lead = await root.lead.create({
      data: {
        orgId: org.id, phone: `+971${++phone}`, name: o.name,
        status: "QUALIFYING", assignedToId: o.agentId ?? mine.id,
        budgetMaxFils: o.budget ?? null, intent: o.intent ?? null,
        notes: o.notes ?? null, createdAt: o.createdAt ?? ago(60),
      },
    });
    if (o.community || o.beds || o.budget) {
      await root.requirement.create({
        data: {
          orgId: org.id, leadId: lead.id, purpose: "SALE",
          intent: o.intent ?? "BUY_TO_LIVE", budgetMaxFils: o.budget ?? null,
          bedroomsMin: o.beds ?? null, communities: o.community ? [o.community] : [],
          source: "AGENT",
        },
      });
    }
    if (o.fact) {
      await root.clientFact.create({
        data: { orgId: org.id, leadId: lead.id, kind: "CIRCUMSTANCE", body: o.fact, source: "AGENT" },
      });
    }
    return lead;
  }

  // The person the question is about.
  await person({
    name: "Khalid Al Suwaidi", budget: M(4_100_000), community: "Downtown",
    intent: "BUY_TO_INVEST", fact: "Emirati, buying through a family office",
  });
  // Right area, right money, wrong reason to be buying.
  await person({
    name: "Grace Adeyemi", budget: M(4_000_000), community: "Downtown",
    intent: "BUY_TO_LIVE",
  });
  // Right everything except the money, and out by enough to matter.
  await person({
    name: "Tomasz Nowak", budget: M(9_000_000), community: "Downtown",
    intent: "BUY_TO_INVEST",
  });
  // Right money and reason, wrong side of town.
  await person({
    name: "Beatriz Santos", budget: M(4_200_000), community: "JVC",
    intent: "BUY_TO_INVEST",
  });
  // The one whose only distinguishing feature is a remembered sentence.
  await person({
    name: "Ivan Petrov", budget: M(6_000_000), community: "Dubai Hills",
    fact: "Relocating from Moscow in the spring, wants to be near a good school",
  });
  await person({
    name: "Nadia Haddad", notes: "Walked away from the last one over service charges",
  });
  // Somebody else's, matching the headline query perfectly.
  await person({
    name: "Faisal Al Nuaimi", agentId: theirs.id, budget: M(4_050_000),
    community: "Downtown", intent: "BUY_TO_INVEST",
  });
  // Added this morning, for the "last week" query.
  await person({ name: "Brand New Person", createdAt: ago(1), community: "Marina" });

  const vendor = await root.vendor.create({
    data: { orgId: org.id, name: "Margaret Okonjo", phone: "+971509998888" },
  });
  await root.listing.create({
    data: {
      orgId: org.id, reference: "SC-1", title: "3-bed apartment, Downtown",
      community: "Downtown", bedrooms: 3, priceFils: M(4_300_000),
      purpose: "SALE", status: "AVAILABLE", vendorId: vendor.id,
    },
  });
  await root.listing.create({
    data: {
      orgId: org.id, reference: "SC-2", title: "5-bed villa, Emirates Hills",
      community: "Emirates Hills", bedrooms: 5, priceFils: M(40_000_000),
      purpose: "SALE", status: "AVAILABLE",
    },
  });

  const asAgent = { canSeeAll: false, viewerId: mine.id };
  const asManager = { canSeeAll: true, viewerId: mine.id };
  const run = (q: string, scope = asAgent) =>
    search({ orgId: org.id, q: parse(q), scope });

  const names = (r: Awaited<ReturnType<typeof run>>) => r.hits.map((h) => h.title);

  /* -- the headline question -- */
  {
    const r = await run("who was that Emirati investor looking in Downtown around 4 million");
    console.log(`  → ${names(r).join(" | ")}`);
    ok("the right person is first", r.hits[0]?.title === "Khalid Al Suwaidi", names(r)[0]);
    ok("and it says why", (r.hits[0]?.why ?? []).length >= 3, (r.hits[0]?.why ?? []).join(" · "));
    ok("the remembered fact is one of the reasons",
       (r.hits[0]?.why ?? []).some((w) => w.includes("Emirati")),
       (r.hits[0]?.why ?? []).join(" · "));
    /**
     * Partial matches come back, and rank below the whole one.
     *
     * Written first as "the 9m investor does not appear", which failed —
     * and the assertion was wrong, not the code. AND-ing every clue
     * means four clues return nothing, so the agent learns to give
     * fewer, and the search gets worse the harder they try. The right
     * property is not exclusion, it is **order**: two-out-of-three above
     * one-out-of-three, and the full match above both.
     */
    const at = (n: string) => names(r).indexOf(n);
    ok("the two-out-of-three matches come back", at("Grace Adeyemi") > 0 && at("Beatriz Santos") > 0,
       names(r).join(" | "));
    ok("area and money outrank area and intent",
       at("Grace Adeyemi") < at("Tomasz Nowak"),
       `Grace ${at("Grace Adeyemi")} vs Tomasz ${at("Tomasz Nowak")}`);
    ok("and everything partial is below the whole match",
       at("Khalid Al Suwaidi") === 0);
    ok("the 9m investor is last of the people, not absent",
       at("Tomasz Nowak") > at("Beatriz Santos"),
       `Tomasz ${at("Tomasz Nowak")} vs Beatriz ${at("Beatriz Santos")}`);
    ok("and his row does not claim the budget fits",
       !(r.hits.find((h) => h.title === "Tomasz Nowak")?.why ?? []).includes("budget fits"),
       (r.hits.find((h) => h.title === "Tomasz Nowak")?.why ?? []).join(" · "));
  }

  /* -- the half that is not a column -- */
  {
    const r = await run("who was relocating");
    ok("a remembered sentence is searchable", names(r).includes("Ivan Petrov"), names(r).join(" | "));
    ok("and the reason quotes it back",
       (r.hits.find((h) => h.title === "Ivan Petrov")?.why ?? []).some((w) => w.includes("Moscow")),
       (r.hits.find((h) => h.title === "Ivan Petrov")?.why ?? []).join(" · "));
  }
  {
    const r = await run("who walked away over service charges");
    ok("so is a note", names(r).includes("Nadia Haddad"), names(r).join(" | "));
  }

  /* -- whose client -- */
  {
    const q = "Downtown investor around 4 million";
    const a = await run(q, asAgent);
    const m = await run(q, asManager);
    ok("a manager sees the other agent's client by name",
       names(m).includes("Faisal Al Nuaimi"));
    ok("an agent does not", !names(a).includes("Faisal Al Nuaimi"), names(a).join(" | "));
    ok("but the row is still there, counted",
       a.counts.people === m.counts.people, `${a.counts.people} vs ${m.counts.people}`);
    ok("shown as somebody else's, with the colleague named",
       a.hits.some((h) => h.restricted && h.agentName === "Tom Reilly"));
    ok("and with no link to click",
       a.hits.filter((h) => h.restricted).every((h) => h.href === ""));
    /**
     * The subtle half of the redaction. Hiding the name is pointless if
     * the reason underneath says 'name matches "faisal"' or quotes a
     * private note back.
     */
    ok("and no reason that gives the name away",
       a.hits.filter((h) => h.restricted)
        .every((h) => h.why.every((w) => !w.startsWith("name matches") && !w.startsWith("remembered"))),
       a.hits.filter((h) => h.restricted).flatMap((h) => h.why).join(" · "));
    ok("but never a blank row either",
       a.hits.filter((h) => h.restricted).every((h) => h.why.length > 0));
  }

  /**
   * The row that had nothing on it.
   *
   * Seen in a browser, not in a check: as an agent, "who is relocating"
   * returned one result reading "Another agent's client — Ask Omar
   * Haddad" and no reason at all, because the only reason was the
   * remembered sentence and that had been stripped. Correct, and
   * useless.
   */
  {
    const a = await run("who is relocating", asAgent);
    const m = await run("who is relocating", asManager);
    ok("a colleague's memory-only match is still surfaced",
       a.counts.people === m.counts.people && a.counts.people >= 1,
       `${a.counts.people} vs ${m.counts.people}`);
    ok("without the sentence itself",
       a.hits.every((h) => !h.restricted || h.why.every((w) => !w.includes("Moscow"))),
       a.hits.flatMap((h) => h.why).join(" · "));
    ok("but saying where the match came from",
       a.hits.filter((h) => h.restricted).every((h) => h.why.length > 0),
       a.hits.filter((h) => h.restricted).flatMap((h) => h.why).join(" · "));
  }

  /* -- properties -- */
  {
    const r = await run("3 bed in Downtown under 5m");
    ok("a property comes back", names(r).some((n) => n.includes("Downtown")), names(r).join(" | "));
    ok("the 40m villa does not", !names(r).some((n) => n.includes("Emirates Hills")));
    ok("and the property links somewhere real",
       (r.hits.find((h) => h.kind === "property")?.href ?? "").startsWith("/listings?q="),
       r.hits.find((h) => h.kind === "property")?.href);
  }
  {
    const r = await run("show me properties in Downtown");
    ok("asking for properties returns no people",
       r.counts.people === 0, `${r.counts.people} people`);
  }
  {
    const r = await run("who is looking in Downtown");
    ok("asking for people returns no properties",
       r.counts.properties === 0, `${r.counts.properties} properties`);
  }

  /* -- owners -- */
  {
    const r = await run("sellers in Downtown");
    ok("the owner of the Downtown flat comes back",
       names(r).includes("Margaret Okonjo"), names(r).join(" | "));
    ok("with their number, since there is no owner screen to open",
       (r.hits.find((h) => h.kind === "owner")?.subtitle ?? "").includes("+971"),
       r.hits.find((h) => h.kind === "owner")?.subtitle ?? "");
  }

  /* -- when -- */
  {
    const r = await run("who did I add last week");
    ok("recency narrows it", names(r).includes("Brand New Person"), names(r).join(" | "));
    ok("and the sixty-day-old people are not in it",
       !names(r).includes("Khalid Al Suwaidi"), names(r).join(" | "));
  }

  /* -- nothing found is a real answer -- */
  {
    const r = await run("penthouse in Sharjah for a Norwegian pilot");
    ok("no results rather than weak ones", r.empty, names(r).join(" | "));
  }

  /* -- tenancy -- */
  console.log("\nTenancy:");
  const rival = await root.organisation.create({
    data: { name: "Rival", slug: `${SLUG}b` },
  });
  await root.lead.create({
    data: { orgId: rival.id, phone: "+971509999111", name: "Khalid Al Suwaidi",
            status: "QUALIFYING", budgetMaxFils: M(4_100_000), intent: "BUY_TO_INVEST" },
  });
  {
    const r = await search({ orgId: rival.id, q: parse("Emirati investor around 4 million"), scope: asManager });
    ok("the rival's own lead is the only thing they see",
       r.hits.every((h) => h.title !== "Grace Adeyemi" && h.title !== "Ivan Petrov"),
       names(r).join(" | "));
    const ours = await run("Emirati investor around 4 million", asManager);
    ok("and ours does not include theirs",
       ours.hits.filter((h) => h.title === "Khalid Al Suwaidi").length === 1,
       String(ours.hits.filter((h) => h.title === "Khalid Al Suwaidi").length));
  }

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });

  console.log(
    fails.length
      ? `\n${fails.length} FAILURE(S)\n${fails.map((f) => `  · ${f}`).join("\n")}\n`
      : "\nAll checks passed.\n"
  );
  process.exit(fails.length ? 1 : 0);
}

main().catch(fatal);
