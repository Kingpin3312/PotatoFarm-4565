import type { Prisma, ScreeningResult } from "@prisma/client";
import { interpret, type Screener, type ScreeningHit } from "./screening";
import { deliver } from "../health/deliver";
import { log } from "@/lib/log";

/**
 * The thing that writes the first `Screening` row.
 *
 * **Nothing in this product had ever created one.** `screening.ts`
 * carried the provider interface, the UAE list names, `interpret()` with
 * its confirmed-match guidance, and `AUTO_CLEAR_THRESHOLD = null` with a
 * paragraph explaining why nothing may auto-clear. All of it correct,
 * and no code path reached any of it.
 *
 * The compliance officer's desk is what made it dangerous rather than
 * merely incomplete. `aml.reports` selects screenings whose result is
 * `POSSIBLE_MATCH` or `CONFIRMED_MATCH` and renders them as *pending* —
 * so with no writer the queue was permanently empty, and an empty
 * compliance queue does not read as "nobody has been screened". It reads
 * as a clean shop.
 *
 * This is the eleventh time in this codebase that a complete, documented
 * module has turned out to have nothing that starts it. See the list in
 * `CLAUDE.md`.
 *
 * ## The decision that matters: what happens with no provider
 *
 * There is no screening provider in this repository and there cannot be
 * one — Dow Jones, Refinitiv and LexisNexis all require a commercial
 * agreement, and the free UN and EOCN lists still need somewhere to
 * fetch and cache them.
 *
 * So the tempting shape is a stub that returns no hits. **That would be
 * the worst thing in this file**, because no hits means `interpret()`
 * returns `CLEAR`, and a `CLEAR` written by nobody is a sanctioned buyer
 * onboarded with a clean record and an audit trail saying a check was
 * performed. Fabricating that is worse than not screening at all: it
 * launders the absence of a control into evidence of one.
 *
 * When nothing is configured this records `ERROR` — the enum value that
 * already existed for exactly this — with `provider: "none"`. That is
 * true, it is visible, and it cannot be mistaken for a pass.
 */

/**
 * Structural, for the same reason `FileOpener` in `open.ts` is: callers
 * are both a real `tx` inside `$transaction` and the `$extends`-ed
 * client `forOrg()` returns, which is not structurally a
 * `Prisma.TransactionClient`.
 */
export type ScreeningWriter = {
  screening: {
    create(args: {
      data: Prisma.ScreeningUncheckedCreateInput;
      select: { id: true; result: true };
    }): PromiseLike<{ id: string; result: ScreeningResult }>;
  };
};

/**
 * The configured provider, or null.
 *
 * Registered at boot rather than read per call so that swapping in a
 * real vendor touches one place. Module-level state is normally wrong on
 * serverless — see the caches `CLAUDE.md` warns about — but this is
 * static configuration set during startup, not per-request state, so a
 * cold start re-registering it is correct rather than a missed cache.
 */
let provider: Screener | null = null;

/** Called once at startup by whatever knows the credentials. */
export function registerScreener(s: Screener): void {
  provider = s;
}

/** Read by the preflight check and by `screen()`. */
export function screeningConfigured(): boolean {
  return provider !== null;
}

export type ScreenOutcome = {
  id: string;
  result: ScreeningResult;
  urgency: "none" | "review" | "immediate";
  guidance: string;
  /** True when no provider was configured and nothing was actually checked. */
  unscreened: boolean;
};

/**
 * Screen one subject and record the result.
 *
 * `kycId` or `uboId` — a screening is of the applicant or of a beneficial
 * owner behind a company, and the model makes both optional for that
 * reason.
 */
export async function screen(
  db: ScreeningWriter,
  args: {
    orgId: string;
    kycId?: string;
    uboId?: string;
    fullName: string;
    nationality?: string;
    dateOfBirth?: string;
  },
): Promise<ScreenOutcome> {
  const name = args.fullName.trim();

  if (!provider) {
    const row = await db.screening.create({
      data: {
        orgId: args.orgId,
        kycId: args.kycId ?? null,
        uboId: args.uboId ?? null,
        nameChecked: name,
        lists: [],
        provider: "none",
        result: "ERROR",
        matches: undefined,
        clearedNote:
          "No screening provider is configured, so this subject has NOT been " +
          "checked against any sanctions or PEP list. This is recorded as an " +
          "error rather than a pass because an unchecked subject must never " +
          "look like a cleared one.",
      },
      select: { id: true, result: true },
    });

    log.warn("AML screening skipped — no provider configured", { orgId: args.orgId }, {
      kycId: args.kycId, uboId: args.uboId, screeningId: row.id,
    });

    return {
      id: row.id,
      result: "ERROR",
      urgency: "review",
      guidance:
        "Not screened. No sanctions provider is configured, so nothing has been " +
        "checked. Configure a provider before concluding this transaction — " +
        "screening is a legal obligation, not a feature.",
      unscreened: true,
    };
  }

  let hits: ScreeningHit[] = [];
  let failed: string | null = null;

  try {
    const res = await provider.check({
      fullName: name,
      dateOfBirth: args.dateOfBirth,
      nationality: args.nationality,
    });
    hits = res.hits;
  } catch (e) {
    /**
     * A provider outage is an `ERROR`, never a `CLEAR`.
     *
     * The same argument as the unconfigured branch: the failure mode of
     * getting this wrong is a sanctioned client onboarded against a
     * record that says somebody checked.
     */
    failed = e instanceof Error ? e.message : String(e);
  }

  const verdict = failed
    ? { result: "ERROR" as ScreeningResult, urgency: "review" as const,
        guidance: `The screening provider failed: ${failed}. Nothing has been checked. Retry before proceeding.` }
    : interpret(hits);

  const row = await db.screening.create({
    data: {
      orgId: args.orgId,
      kycId: args.kycId ?? null,
      uboId: args.uboId ?? null,
      nameChecked: name,
      lists: provider.lists,
      provider: provider.name,
      result: verdict.result,
      matches: failed ? undefined : (hits as unknown as Prisma.InputJsonValue),
    },
    select: { id: true, result: true },
  });

  /**
   * A confirmed match is the one thing here that cannot wait for someone
   * to open a screen.
   *
   * `interpret()` already says why: funds frozen without delay, a
   * Confirmed Name Match Report on goAML, the EOCN notified. The alert
   * deliberately carries **no client name** — it goes to whoever is on
   * the webhook, tipping off is an offence regardless of who does it,
   * and the identifier is enough to find the file.
   */
  if (verdict.result === "CONFIRMED_MATCH") {
    await deliver({
      key: `aml.confirmed.${row.id}`,
      severity: "PAGE",
      title: "Confirmed sanctions match on a due diligence file",
      detail:
        `Screening ${row.id} returned a confirmed match against ${provider.name}. ` +
        `Freeze any funds without delay and open the file in Compliance. ` +
        `Do not discuss this with the client.`,
      runbook: "OPERATIONS.md — confirmed sanctions match",
    });
  }

  return { ...verdict, id: row.id, unscreened: false };
}
