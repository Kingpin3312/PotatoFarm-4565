/**
 * Does the product know when a deal is going wrong, and say why?
 *
 * The timeline arithmetic already existed and was already good — this
 * checks the layer on top of it, which is the half that reads the
 * signals a calendar cannot see. Three of them, and all three were
 * fields nothing had ever read:
 *
 *   - a buyer who has gone silent
 *   - a milestone an agent explicitly marked blocked
 *   - a deposit that is not recorded but has been moved past
 *
 *     npm run check:deals
 */
import { assessRisk, RISK_LABEL, STEP_STAGES, type RiskInput } from "../src/server/lib/deals/risk";

const fails: string[] = [];
function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

const NOW = new Date("2026-08-10T09:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/** A deal with plenty of room and nothing wrong with it. */
function deal(over: Partial<RiskInput> = {}): RiskInput {
  return {
    reference: "PF-2041",
    stage: "DEPOSIT_PAID",
    financing: "CASH",
    sellerHasMortgage: false,
    // Far enough out that the timeline is comfortable.
    contractualCompletionAt: inDays(60),
    completed: ["AGREED", "MOU_SIGNED", "DEPOSIT_PAID"],
    blocked: [],
    daysSinceContact: 1,
    counterparty: "James Whitfield",
    ...over,
  };
}

function main() {
  console.log("\nA deal with nothing wrong with it says nothing:");
  const healthy = assessRisk(deal(), NOW);
  ok("it is healthy", healthy.level === "HEALTHY", `${healthy.level} — ${healthy.reason}`);
  ok("and offers no action, because there is nothing to do",
     healthy.action === null, healthy.action?.headline);

  console.log("\nSilence, which is the signal nobody records:");
  const quiet = assessRisk(deal({ daysSinceContact: 9 }), NOW);
  ok("nine days moves it to watch", quiet.level === "WATCH", quiet.level);
  ok("and names the person", quiet.reason.includes("James"), quiet.reason);

  const silent = assessRisk(deal({ daysSinceContact: 20 }), NOW);
  ok("twenty days is at risk", silent.level === "AT_RISK", silent.level);
  ok("and the action is to ring them", silent.action?.kind === "CALL", silent.action?.headline);

  console.log("\nA blocker somebody wrote down, which nothing ever read:");
  const blocked = assessRisk(
    deal({ blocked: [{ stage: "NOC_APPLIED", reason: "Developer wants the service charge cleared first" }] }),
    NOW
  );
  ok("a recorded blocker is at risk on its own", blocked.level === "AT_RISK", blocked.level);
  ok("the agent's own words are the reason",
     blocked.reason.includes("service charge"), blocked.reason);
  ok("and the action is to clear it",
     blocked.action?.headline.includes("Clear the block") === true, blocked.action?.headline);

  console.log("\nMoney that should be in and is not:");
  const noDeposit = assessRisk(
    deal({ stage: "MORTGAGE_APPLIED", completed: ["AGREED", "MOU_SIGNED"] }),
    NOW
  );
  ok("past the deposit with no deposit recorded is at risk",
     noDeposit.level === "AT_RISK", noDeposit.level);
  ok("and it is stated plainly",
     noDeposit.factors.some((f) => f.includes("deposit is not recorded")),
     noDeposit.factors.join(" | "));

  console.log("\nThe timeline arithmetic still drives it:");
  //
  // A mortgage purchase where the seller also has one, completing in a
  // week, is the case `checkProposedDate` was written to warn about.
  const impossible = assessRisk(
    deal({
      financing: "MORTGAGE", sellerHasMortgage: true,
      contractualCompletionAt: inDays(7), completed: ["AGREED"],
      stage: "AGREED",
    }),
    NOW
  );
  ok("a date that cannot be met is at risk", impossible.level === "AT_RISK", impossible.level);
  ok("the arithmetic is shown, not just the verdict",
     impossible.factors.some((f) => /working days/.test(f)), impossible.factors[0]);
  ok("and the advice is to move the date, not to chase harder",
     impossible.action?.kind === "NEGOTIATE", impossible.action?.headline);

  console.log("\nA deal with no completion date is assessable, not crashed:");
  const undated = assessRisk(deal({ contractualCompletionAt: null, daysSinceContact: 30 }), NOW);
  ok("it does not invent a deadline",
     undated.timeline.message.includes("No completion date"), undated.timeline.message);
  ok("but silence still counts", undated.level === "AT_RISK", undated.level);

  console.log("\nThe worst thing wins, and only one action comes back:");
  const everything = assessRisk(
    deal({
      daysSinceContact: 30,
      blocked: [{ stage: "NOC_APPLIED", reason: "Waiting on the developer" }],
      contractualCompletionAt: inDays(3),
      completed: ["AGREED"],
      stage: "MORTGAGE_APPLIED",
      financing: "MORTGAGE",
    }),
    NOW
  );
  ok("several problems still produce one action",
     everything.action !== null && typeof everything.action.headline === "string");
  ok("but all of them are listed for the detail view",
     everything.factors.length >= 3, `${everything.factors.length} factors`);
  ok("the headline reason is the first, not a summary",
     everything.reason === everything.factors[0]);

  console.log("\nHousekeeping:");
  ok("every level has a plain-English label",
     Object.values(RISK_LABEL).every((v) => v.length > 3 && v === v.toLowerCase()),
     Object.values(RISK_LABEL).join(" / "));
  ok("COLLAPSED is not offered as a step somebody can tick",
     !(STEP_STAGES as readonly string[]).includes("COLLAPSED"));
  ok("COMPLETED is, because it is the last one",
     (STEP_STAGES as readonly string[]).includes("COMPLETED"));

  console.log(`\n${"─".repeat(60)}`);
  if (fails.length === 0) {
    console.log("PASS — a deal in trouble says so, and says why.\n");
    process.exit(0);
  }
  console.log(`FAIL — ${fails.length}:`);
  fails.forEach((f) => console.log(`  x ${f}`));
  process.exit(1);
}

main();
