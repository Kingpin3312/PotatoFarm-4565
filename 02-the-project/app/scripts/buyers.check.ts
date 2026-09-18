/**
 * Who wants this property — proved against a real database.
 *
 * This is the number an agent says out loud to an owner, so the ways it
 * can be wrong are not typos, they are embarrassments:
 *
 *   1. **Counting people twice.** Somebody with three saved searches that
 *      all fit is one buyer to ring. "Twelve buyers" that is really five
 *      people is a lie an owner can check.
 *   2. **Promising a message the send path will refuse.** `contactableNow`
 *      has to agree with the two gates the outbound sweep actually uses,
 *      or the agent is made to look foolish by their own software.
 *   3. **Showing an agent another agent's client.** The count is
 *      firm-wide; the names are not.
 *   4. **Wrong-purpose matches.** A tenant is not a buyer.
 *
 *     npm run check:buyers
 */
import { crossTenant } from "../src/server/db/client";
import { buyersFor, pitch, sendableAt, SHOW_THRESHOLD } from "../src/server/lib/matching/buyers";
import { SEND_THRESHOLD } from "../src/server/lib/matching/score";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "buyers-check-";
const fails: string[] = [];

function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

const M = (aed: number) => BigInt(aed) * 100n;

/**
 * 11am Dubai, on a fixed date.
 *
 * `decide()` refuses to send outside 9–20 local, so a check run at the
 * wrong hour would fail for a reason that has nothing to do with
 * matching. Pinning the clock is the difference between a test and a
 * coin toss — the deals check learned this the same way.
 */
const NOW = new Date("2026-08-12T07:00:00Z");

/**
 * Relative to `NOW`, not to the wall clock. **Half this check used to
 * run on a different clock from the other half.**
 *
 * `ago()` was `Date.now() - d days` while every assertion was evaluated
 * against the frozen `NOW` above. That agrees on the day the date was
 * written and drifts one day per day afterwards. Three days later
 * `ago(1)` — the requirement that is supposed to have *expired* —
 * landed two days in `NOW`'s future, the matcher correctly included it,
 * and "an expired search does not appear at all" failed. Nothing in the
 * product had changed; the check had simply outlived its own constant.
 *
 * A pinned clock is only pinned if everything reads it. This is the
 * same lesson the comment above already states, applied to the helper
 * sitting next to it.
 */
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

async function main() {
  console.log("\nWho wants this property\n");

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  const org = await root.organisation.create({
    data: { name: "Buyers Check", slug: `${SLUG}a` },
  });

  const mine = await root.user.upsert({
    where: { email: "buyers-check-a@example.com" },
    create: { email: "buyers-check-a@example.com", name: "Yasmin Haddad" },
    update: { name: "Yasmin Haddad" },
  });
  const theirs = await root.user.upsert({
    where: { email: "buyers-check-b@example.com" },
    create: { email: "buyers-check-b@example.com", name: "Tom Reilly" },
    update: { name: "Tom Reilly" },
  });
  await root.membership.createMany({
    data: [
      { orgId: org.id, userId: mine.id, role: "AGENT" },
      { orgId: org.id, userId: theirs.id, role: "AGENT" },
    ],
  });

  // A conversation belongs to a channel. Nothing here sends anything —
  // the check never touches the WhatsApp client — but `lastInboundAt`
  // lives on the conversation, and that is what the window rule reads.
  const channel = await root.channel.create({
    data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: "+97140000000" },
  });

  const listing = await root.listing.create({
    data: {
      orgId: org.id, reference: "BC-1", title: "3-bed villa, Dubai Hills",
      community: "Dubai Hills", bedrooms: 3, priceFils: M(4_000_000),
      purpose: "SALE", status: "AVAILABLE",
    },
  });

  /**
   * A buyer built to a shape, rather than a fixture file.
   *
   * Every one of these fields is a gate somewhere: `lastInboundAt` is the
   * 24-hour window and the "never replied" rule, `lastOutreachAt` is the
   * fortnight rule, `optedOutOfOutreach` is the first rule of all.
   */
  let phone = 500_000_200;
  async function buyer(o: {
    name: string;
    agentId?: string;
    status?: "NEW" | "QUALIFYING" | "QUALIFIED" | "WON" | "LOST" | "UNRESPONSIVE";
    optedOut?: boolean;
    lastInboundAt?: Date | null;
    lastOutreachAt?: Date | null;
    score?: number;
    budgetMaxFils?: bigint;
  }) {
    const lead = await root.lead.create({
      data: {
        orgId: org.id, phone: `+971${++phone}`, name: o.name,
        status: o.status ?? "QUALIFYING",
        assignedToId: o.agentId ?? mine.id,
        optedOutOfOutreach: o.optedOut ?? false,
        lastOutreachAt: o.lastOutreachAt ?? null,
        score: o.score ?? null,
        budgetMaxFils: o.budgetMaxFils ?? M(4_200_000),
        createdAt: ago(60),
      },
    });
    if (o.lastInboundAt !== null) {
      await root.conversation.create({
        data: {
          orgId: org.id, leadId: lead.id, channelId: channel.id,
          lastInboundAt: o.lastInboundAt ?? ago(3),
        },
      });
    }
    return lead;
  }

  async function wants(leadId: string, o: {
    budgetMaxFils?: bigint;
    bedroomsMin?: number | null;
    communities?: string[];
    purpose?: "SALE" | "RENT";
    intent?: "BUY_TO_LIVE" | "BUY_TO_INVEST" | "RENT" | null;
    source?: "AGENT" | "LEAD" | "ASSISTANT";
    confidence?: number | null;
    active?: boolean;
    expiresAt?: Date | null;
  } = {}) {
    return root.requirement.create({
      data: {
        orgId: org.id, leadId,
        purpose: o.purpose ?? "SALE",
        intent: o.intent === undefined ? "BUY_TO_LIVE" : o.intent,
        budgetMaxFils: o.budgetMaxFils ?? M(4_200_000),
        bedroomsMin: o.bedroomsMin === undefined ? 3 : o.bedroomsMin,
        communities: o.communities ?? ["Dubai Hills"],
        source: o.source ?? "AGENT",
        confidence: o.confidence ?? null,
        active: o.active ?? true,
        expiresAt: o.expiresAt ?? null,
      },
    });
  }

  /* ---------------- the fit itself ---------------- */

  const perfect = await buyer({ name: "Aisha Rahman", score: 74 });
  await wants(perfect.id);

  const wrongBeds = await buyer({ name: "One Bed Only" });
  await wants(wrongBeds.id, { bedroomsMin: 5 });

  const tooPoor = await buyer({ name: "Way Under Budget" });
  await wants(tooPoor.id, { budgetMaxFils: M(900_000) });

  const tenant = await buyer({ name: "A Tenant, Not A Buyer" });
  await wants(tenant.id, { purpose: "RENT", intent: "RENT" });

  const scope = { canSeeAll: false, viewerId: mine.id };
  let r = (await buyersFor({ orgId: org.id, listingId: listing.id, scope, now: NOW }))!;

  ok("the property was found", r !== null);
  ok("the buyer who fits is listed",
     r.matches.some((m) => m.name === "Aisha Rahman"));
  ok("somebody who needs five bedrooms is not",
     !r.matches.some((m) => m.name === "One Bed Only"));
  ok("somebody at a fifth of the price is not",
     !r.matches.some((m) => m.name === "Way Under Budget"));
  ok("a tenant is not a buyer for a sale listing",
     !r.matches.some((m) => m.name === "A Tenant, Not A Buyer"));

  /* ---------------- one person, one row ---------------- */

  console.log("\nOne person is one buyer, however many searches they saved:");
  await wants(perfect.id, { communities: ["Dubai Hills", "Arabian Ranches"] });
  await wants(perfect.id, { budgetMaxFils: M(5_000_000) });

  r = (await buyersFor({ orgId: org.id, listingId: listing.id, scope, now: NOW }))!;
  const aisha = r.matches.filter((m) => m.name === "Aisha Rahman");
  ok("three saved searches produce one row", aisha.length === 1,
     `${aisha.length} row(s)`);
  ok("and it is the best of them", (aisha[0]?.score ?? 0) >= SHOW_THRESHOLD,
     String(aisha[0]?.score));

  /* ---------------- what "can be messaged today" means ---------------- */

  console.log("\nContactable means the send path would actually agree:");

  const stopped = await buyer({ name: "Said Stop", optedOut: true });
  await wants(stopped.id);

  const recent = await buyer({ name: "Messaged Tuesday", lastOutreachAt: ago(3) });
  await wants(recent.id);

  const silent = await buyer({ name: "Never Replied", lastInboundAt: null });
  await wants(silent.id);

  const dead = await buyer({ name: "Gone Quiet", status: "UNRESPONSIVE" });
  await wants(dead.id);

  const guessed = await buyer({ name: "Only Inferred" });
  await wants(guessed.id, { source: "ASSISTANT", confidence: 0.4 });

  const expired = await buyer({ name: "Stale Search" });
  await wants(expired.id, { expiresAt: ago(1) });

  r = (await buyersFor({ orgId: org.id, listingId: listing.id, scope, now: NOW }))!;
  const by = (n: string) => r.matches.find((m) => m.name === n);

  const reason = (n: string) => {
    const c = by(n)?.contactable;
    return c && !c.ok ? c.reason : "";
  };

  ok("somebody who said stop cannot be messaged",
     by("Said Stop")?.contactable.ok === false, reason("Said Stop"));
  ok("and the reason says so in words", reason("Said Stop").includes("opted out"));
  ok("messaged three days ago cannot be messaged again",
     by("Messaged Tuesday")?.contactable.ok === false, reason("Messaged Tuesday"));
  ok("somebody who never replied is not a target",
     by("Never Replied")?.contactable.ok === false, reason("Never Replied"));
  ok("an unresponsive lead is left alone",
     by("Gone Quiet")?.contactable.ok === false, reason("Gone Quiet"));

  /**
   * The rule the brief is most explicit about, seen from this side.
   *
   * A requirement the assistant guessed at 40% appears in the list —
   * because an agent reading it will use their judgement — and is marked
   * as needing confirmation. It must never be counted as contactable.
   */
  ok("a guessed requirement is shown but not contactable",
     by("Only Inferred") !== undefined && by("Only Inferred")?.contactable.ok === false,
     reason("Only Inferred"));
  ok("and it says an agent has to confirm it first",
     reason("Only Inferred").includes("confirm"), reason("Only Inferred"));
  ok("an expired search does not appear at all", by("Stale Search") === undefined);

  ok("the unconfirmed count is not zero", r.unconfirmed >= 1, String(r.unconfirmed));
  ok("contactableNow equals the rows that say ok",
     r.contactableNow === r.matches.filter((m) => m.contactable.ok).length,
     `${r.contactableNow} of ${r.matches.length}`);
  ok("nobody uncontactable is counted",
     r.contactableNow <= r.matches.length);

  /* ---------------- a partial fit, and why it is shown ---------------- */

  /**
   * The buyer this whole screen exists for, and the one every earlier
   * assertion above was too kind to test.
   *
   * Everybody so far scores a flat 1.00 — right beds, right community,
   * inside budget — so "sorted by fit" was being proved by a list where
   * fit was identical. That is a check passing by not looking, which is
   * the failure this codebase keeps finding in its own tooling.
   *
   * This one is 4M against a 3.8M ceiling, in the right place, and asked
   * for two bedrooms rather than three. A real near-miss: worth an
   * agent's glance, not worth an unprompted WhatsApp. Given the highest
   * warmth score on the book so that a warmth-first sort would wrongly
   * put them at the top.
   */
  console.log("\nA near-miss is shown, ranked honestly, and not sent:");
  const nearly = await buyer({ name: "Nearly, But Warm", score: 95 });
  await wants(nearly.id, { budgetMaxFils: M(3_800_000), bedroomsMin: 2 });

  r = (await buyersFor({ orgId: org.id, listingId: listing.id, scope, now: NOW }))!;
  const near = r.matches.find((m) => m.name === "Nearly, But Warm");

  ok("the near-miss appears", near !== undefined);
  ok("above the showing bar", (near?.score ?? 0) >= SHOW_THRESHOLD, String(near?.score));
  ok("below the sending bar", (near?.score ?? 1) < SEND_THRESHOLD, String(near?.score));
  ok("and the stretch is said out loud rather than hidden",
     (near?.caveats ?? []).some((c) => c.includes("over")), (near?.caveats ?? []).join("; "));
  ok("the warmest lead on the book is not at the top of a fit list",
     r.matches[0]?.name !== "Nearly, But Warm", r.matches[0]?.name ?? "—");

  /* ---------------- whose client is it ---------------- */

  console.log("\nThe count is the firm's. The names are not:");
  const other = await buyer({ name: "Tom's Client", agentId: theirs.id });
  await wants(other.id);

  const asAgent = (await buyersFor({ orgId: org.id, listingId: listing.id, now: NOW,
                                     scope: { canSeeAll: false, viewerId: mine.id } }))!;
  const asManager = (await buyersFor({ orgId: org.id, listingId: listing.id, now: NOW,
                                       scope: { canSeeAll: true, viewerId: mine.id } }))!;

  ok("an agent is told the same total as a manager",
     asAgent.matches.length === asManager.matches.length,
     `${asAgent.matches.length} vs ${asManager.matches.length}`);
  ok("a manager sees the other agent's client by name",
     asManager.matches.some((m) => m.name === "Tom's Client"));
  ok("an agent does not",
     !asAgent.matches.some((m) => m.name === "Tom's Client"));
  ok("but is told whose it is, so they can go and ask",
     asAgent.matches.some((m) => m.name === null && m.agentName === "Tom Reilly"));
  ok("and cannot click through to the lead",
     asAgent.matches.every((m) => m.name !== null || m.leadId === null));
  ok("every row still has a unique key",
     new Set(asAgent.matches.map((m) => m.key)).size === asAgent.matches.length);

  /* ---------------- the sentence an agent says ---------------- */

  console.log("\nThe sentence under the number:");
  ok("it is a sentence, not a count", pitch(asAgent).includes("looking for"),
     pitch(asAgent));
  ok("it agrees with contactableNow when some can be messaged",
     asAgent.contactableNow === 0 ||
     pitch(asAgent).includes(String(asAgent.contactableNow)) ||
     pitch(asAgent).includes("all of them"));

  const none = { matches: [], contactableNow: 0, unconfirmed: 0, outsideHours: false };
  ok("an empty book says so plainly", pitch(none).startsWith("Nobody"), pitch(none));
  const one = { matches: [asAgent.matches[0]!], contactableNow: 1, unconfirmed: 0,
                outsideHours: false };
  ok("one person is 'person', not '1 people'",
     pitch(one).includes("1 person on your book is"), pitch(one));

  /**
   * The bug this screen shipped with for about four minutes.
   *
   * Opened for the first time against real data at 23:38 Dubai, it said
   * *nobody can be messaged today* — literally true, because `decide()`
   * refuses between 20:00 and 09:00, and completely useless, because an
   * agent sitting with an owner in the evening is precisely when this
   * gets opened. The evening is the pitch.
   */
  console.log("\nThe evening, which is when this screen is actually opened:");
  const midnight = new Date("2026-08-12T19:38:00Z"); // 23:38 in Dubai
  const night = (await buyersFor({ orgId: org.id, listingId: listing.id, scope,
                                   now: midnight }))!;
  ok("it knows it is out of hours", night.outsideHours === true);
  ok("and still counts the people who can be messaged",
     night.contactableNow > 0, `${night.contactableNow}`);
  ok("the sentence says the morning, not today",
     pitch(night).includes("in the morning") && !pitch(night).includes("today"),
     pitch(night));
  ok("the daytime answer is the same set of people",
     night.contactableNow === asAgent.contactableNow,
     `${night.contactableNow} vs ${asAgent.contactableNow}`);
  ok("and daytime still says today", !asAgent.outsideHours && pitch(asAgent).includes("today"),
     pitch(asAgent));

  ok("9am is inside hours", sendableAt(new Date("2026-08-12T05:00:00Z")).outsideHours === false);
  ok("8am is not", sendableAt(new Date("2026-08-12T04:00:00Z")).outsideHours === true);
  ok("8pm is not", sendableAt(new Date("2026-08-12T16:00:00Z")).outsideHours === true);
  ok("and the wait lands at 10am the next day", (() => {
    const { at } = sendableAt(new Date("2026-08-12T19:38:00Z"));
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai", hour: "2-digit", hour12: false,
    }).format(at) === "10";
  })());
  // London moves twice a year; Dubai does not. The stepping loop is
  // here so neither one needs a special case.
  ok("a timezone with DST still lands at 10am", (() => {
    const { at } = sendableAt(new Date("2026-03-28T23:00:00Z"), "Europe/London");
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", hour: "2-digit", hour12: false,
    }).format(at) === "10";
  })());

  /* ---------------- the two thresholds are different on purpose ------- */

  console.log("\nShowing is a lower bar than sending:");
  ok("SHOW_THRESHOLD is below SEND_THRESHOLD",
     SHOW_THRESHOLD < SEND_THRESHOLD, `${SHOW_THRESHOLD} < ${SEND_THRESHOLD}`);
  ok("every row shown clears the showing bar",
     asManager.matches.every((m) => m.score >= SHOW_THRESHOLD));

  /**
   * Ranked by fit, then by warmth — and the order matters more than it
   * looks. A hot lead who wants something else is not a buyer for this
   * property, and putting them at the top is how a list like this stops
   * being believed.
   */
  console.log("\nOrder:");
  const sorted = asManager.matches.every((m, i) => {
    const p = asManager.matches[i - 1];
    if (!p) return true;
    return p.score > m.score ||
           (p.score === m.score && (p.leadScore ?? 0) >= (m.leadScore ?? 0));
  });
  ok("fit first, then warmth", sorted,
     asManager.matches.map((m) => `${m.score.toFixed(2)}/${m.leadScore ?? "-"}`).join(" "));
  // The assertion above is satisfied by a list where every score is
  // equal, which is exactly what this list was before the near-miss was
  // added. Prove the sort had something to sort.
  ok("and the list actually contains more than one fit level",
     new Set(asManager.matches.map((m) => m.score)).size > 1,
     [...new Set(asManager.matches.map((m) => m.score.toFixed(2)))].join(" "));

  /* ---------------- another brokerage's book is not ours -------------- */

  console.log("\nTenancy:");
  const other_org = await root.organisation.create({
    data: { name: "Rival Brokerage", slug: `${SLUG}b` },
  });
  const rival = await root.lead.create({
    data: { orgId: other_org.id, phone: "+971509999999", name: "Rival's Buyer",
            status: "QUALIFYING", budgetMaxFils: M(4_200_000) },
  });
  await root.requirement.create({
    data: { orgId: other_org.id, leadId: rival.id, purpose: "SALE",
            intent: "BUY_TO_LIVE", budgetMaxFils: M(4_200_000), bedroomsMin: 3,
            communities: ["Dubai Hills"], source: "AGENT" },
  });

  r = (await buyersFor({ orgId: org.id, listingId: listing.id, scope, now: NOW }))!;
  ok("a rival brokerage's perfect match is invisible",
     !r.matches.some((m) => m.name === "Rival's Buyer"));

  const acrossOrgs = await buyersFor({
    orgId: other_org.id, listingId: listing.id,
    scope: { canSeeAll: true, viewerId: mine.id }, now: NOW,
  });
  ok("and our listing does not exist for them", acrossOrgs === null);

  /* ---------------- nothing to say is a real answer ------------------- */

  console.log("\nA property nobody wants:");
  const oddity = await root.listing.create({
    data: { orgId: org.id, reference: "BC-2", title: "Warehouse, Al Quoz",
            community: "Al Quoz", bedrooms: 0, priceFils: M(30_000_000),
            purpose: "SALE", status: "AVAILABLE" },
  });
  const empty = (await buyersFor({ orgId: org.id, listingId: oddity.id, scope, now: NOW }))!;
  ok("no matches rather than weak ones", empty.matches.length === 0,
     `${empty.matches.length}`);
  ok("and the sentence does not pretend otherwise",
     pitch(empty).startsWith("Nobody"), pitch(empty));

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });

  console.log(
    fails.length
      ? `\n${fails.length} FAILURE(S)\n${fails.map((f) => `  · ${f}`).join("\n")}\n`
      : "\nAll checks passed.\n"
  );
  process.exit(fails.length ? 1 : 0);
}

main().catch(fatal);
