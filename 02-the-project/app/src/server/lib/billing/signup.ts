import { randomBytes } from "node:crypto";
import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { log } from "@/lib/log";
import { seedStages } from "@/server/lib/pipeline/defaults";
import { seedHours } from "@/server/lib/hours/defaults";
import { seedQualification } from "@/server/lib/assistant/qualification";
import { seedRoutingRule } from "@/server/lib/routing/apply";

/**
 * The organisation's URL-safe handle.
 *
 * `Organisation.slug` is required and unique, and nothing anywhere
 * generated one — this is the only place an organisation is created, and
 * it passed a name and no slug, so sign-up could never have inserted a
 * row.
 *
 * A six-character suffix rather than a uniqueness loop. Two brokerages
 * called "Marina Properties" is not a hypothetical in this market, and a
 * read-then-insert loop is both a race and a way for one firm to discover
 * another exists by watching which slug it was given.
 */
function slugFor(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents, then anything that is not a letter, digit or space.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  // An all-Arabic name strips to nothing, which is a real case here.
  return `${base || "brokerage"}-${randomBytes(3).toString("hex")}`;
}

/**
 * Becoming a customer.
 *
 * This file did not exist, and its absence was the largest commercial
 * defect in the product.
 *
 * The billing module could compute seat-days exactly, raise a
 * VAT-correct invoice, chase it through a dunning ladder and reconcile
 * against Stripe. **It could do all of that for a customer that no code
 * path was capable of creating.** There was no organisation creation, no
 * sign-up, no subscription, no trial and no card collection anywhere in
 * the codebase.
 *
 * A system that can invoice but cannot acquire is a system that earns
 * nothing.
 */

/**
 * The trial.
 *
 * Fourteen days, no card. That is a deliberate commercial choice and it
 * is worth stating the reasoning, because the instinct is to take a card
 * up front.
 *
 * Taking a card first raises conversion on paper and destroys the
 * pilot. Our entire sales argument is *"we measure your response times
 * for a week before switching anything on"* — a brokerage cannot do that
 * honestly while worrying about being charged. The baseline week is the
 * product demo, and it has to be free of that friction.
 *
 * Fourteen days rather than thirty because a brokerage that has not
 * decided in a fortnight has not adopted it, and a long trial hides that
 * from both of us.
 */
export const TRIAL_DAYS = 14;

/**
 * The floor.
 *
 * Below eight agents the overhead of setup is not worth it for them and
 * the revenue is not worth it for us. Saying so at sign-up is better
 * than discovering it in month two — and it is already what the website
 * says, so the code should agree.
 */
export const MIN_SEATS = 8;

export type SignupInput = {
  brokerageName: string;
  ownerEmail: string;
  ownerName: string;
  seats: number;
  /** Fils per seat per month, from the price list at time of signing. */
  seatPriceFils: bigint;
  /** For a valid UAE tax invoice. Optional at signup, required before billing. */
  trn?: string;
};

export type SignupResult =
  | { ok: true; orgId: string; trialEndsAt: Date }
  | { ok: false; reason: string };

/**
 * Everything in one transaction.
 *
 * An organisation without an owner is unreachable — nobody can sign in
 * to it and nobody can delete it. An organisation without a subscription
 * is invisible to every billing job, so it runs free forever and nothing
 * reports it.
 *
 * Both of those are states you only discover months later, which is why
 * this is one transaction rather than three calls a signup flow might
 * partially complete.
 */
export async function signup(input: SignupInput): Promise<SignupResult> {
  if (input.seats < MIN_SEATS) {
    return {
      ok: false,
      reason: `PotatoFarm.io is built for brokerages of ${MIN_SEATS} agents or more. Below that you can answer enquiries by hand, and you should.`,
    };
  }
  if (input.seatPriceFils <= 0n) {
    // Guards against a misconfigured price list creating free customers
    // that no invoice ever catches.
    return { ok: false, reason: "No seat price configured. Nothing can be created without one." };
  }

  const db = crossTenant("pre-tenant");

  const existing = await db.user.findUnique({
    where: { email: input.ownerEmail.toLowerCase() },
    select: { id: true },
  });

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  const periodTo = new Date(trialEndsAt);
  periodTo.setUTCMonth(periodTo.getUTCMonth() + 1);

  const result = await db.$transaction(async (tx) => {
    const org = await tx.organisation.create({
      data: { name: input.brokerageName.trim(), slug: slugFor(input.brokerageName) },
    });

    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { name: input.ownerName } })
      : await tx.user.create({
          data: { email: input.ownerEmail.toLowerCase(), name: input.ownerName },
        });

    await tx.membership.create({
      data: { orgId: org.id, userId: user.id, role: "OWNER" },
    });

    // A brokerage with no pipeline stages has no board at all — every
    // lead lands with `stageId: null` and is invisible on the screen
    // meant to show it. Inside the transaction because an organisation
    // without a pipeline is a state nothing else in the product can
    // recover from.
    await seedStages(tx, org.id);

    // And with no working hours, `availableSlots()` skips every day and
    // returns nothing, so the booking screen can never offer a time —
    // while telling the agent their week is full. Same reasoning, same
    // transaction.
    await seedHours(tx, org.id);

    // And a routing rule, so a new lead has somewhere to go. With none,
    // `assignmentFor` matches nothing and every enquiry sits in the pool
    // — which is a legitimate way to work, and not one anybody chose.
    await seedRoutingRule(tx, org.id);

    // And the qualification script, without which the assistant is
    // switched off. `run.ts` reads an active profile and hands the
    // conversation to a human when there is none — so a brokerage
    // seeded with stages, hours and routing but no script has a
    // beautifully organised inbox that a person answers every message
    // in. Same transaction, for the same reason as the other three.
    await seedQualification(tx, org.id);

    const sub = await tx.subscription.create({
      data: {
        orgId: org.id,
        plan: "standard",
        seatPriceFils: input.seatPriceFils,
        status: "TRIALING",
        trialEndsAt,
        // The billing period starts when the trial ends, so the first
        // invoice covers the first paid month rather than the trial.
        currentFrom: trialEndsAt,
        currentTo: periodTo,
        trn: input.trn,
      },
    });

    // The seat ledger starts at one — the owner. Every agent invited
    // later adds an event, and the invoice is computed from seat-days.
    // Starting it empty would bill them for nothing in month one.
    await tx.seatEvent.create({
      data: { orgId: org.id, subId: sub.id, userId: user.id, change: 1, reason: "signup" },
    });

    await audit(tx, org.id, {
      actorId: user.id,
      action: "org.created",
      entity: "Organisation",
      entityId: org.id,
      after: {
        name: input.brokerageName,
        seats: input.seats,
        trialEndsAt: trialEndsAt.toISOString(),
      },
    });

    return { orgId: org.id, userId: user.id };
  });

  log.info("brokerage signed up", { orgId: result.orgId }, {
    seats: input.seats,
    trialDays: TRIAL_DAYS,
  });

  return { ok: true, orgId: result.orgId, trialEndsAt };
}

/**
 * The end of the trial.
 *
 * Runs daily. Three outcomes, and the second is the one that determines
 * whether this business works.
 */
export async function sweepTrials() {
  const db = crossTenant("sweep");
  const now = new Date();

  const ending = await db.subscription.findMany({
    where: { status: "TRIALING", trialEndsAt: { lte: now } },
    select: { id: true, orgId: true, providerCustomerId: true, trialEndsAt: true },
  });

  let converted = 0, lapsed = 0;

  for (const sub of ending) {
    if (sub.providerCustomerId) {
      // A card is on file. Becomes a paying customer, and the first
      // invoice is raised by the ordinary invoicing job.
      await db.subscription.update({
        where: { id: sub.id },
        data: { status: "ACTIVE" },
      });
      converted += 1;
      continue;
    }

    /**
     * No card. **The assistant stops; the data does not.**
     *
     * This is the same principle as the dunning ladder and it matters
     * more here, because a lapsed trial is a brokerage that might still
     * come back. Deleting their data, or locking them out of leads they
     * generated, converts a maybe into a never — and is probably
     * unlawful under most data protection regimes anyway.
     *
     * They keep the inbox, they keep every lead, they can export
     * everything. They lose the thing they were not paying for.
     */
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: "RESTRICTED" },
    });
    await db.assistantSettings.upsert({
      where: { orgId: sub.orgId },
      create: {
        orgId: sub.orgId, enabled: false,
        pausedReason: "Trial ended — add a card to switch it back on",
        pausedAt: now,
      },
      update: {
        enabled: false,
        pausedReason: "Trial ended — add a card to switch it back on",
        pausedAt: now,
      },
    });
    lapsed += 1;
  }

  return { ending: ending.length, converted, lapsed };
}

/**
 * How the trial is going, for us rather than for them.
 *
 * A brokerage on day eleven with no card and no assistant activity has
 * already decided. Knowing that on day eleven rather than day fifteen is
 * the difference between a phone call and a lost customer.
 */
export async function trialHealth() {
  const db = crossTenant("sweep");
  const trials = await db.subscription.findMany({
    where: { status: "TRIALING" },
    select: { orgId: true, trialEndsAt: true, providerCustomerId: true },
  });

  const out = [];
  for (const t of trials) {
    const daysLeft = t.trialEndsAt
      ? Math.ceil((t.trialEndsAt.getTime() - Date.now()) / 86_400_000)
      : null;

    const [agents, replies] = await Promise.all([
      db.membership.count({ where: { orgId: t.orgId } }),
      db.message.count({
        where: { orgId: t.orgId, direction: "OUTBOUND", author: "ASSISTANT" },
      }),
    ]);

    out.push({
      orgId: t.orgId,
      daysLeft,
      hasCard: Boolean(t.providerCustomerId),
      agents,
      repliesSent: replies,
      // The one signal that predicts conversion. A brokerage whose
      // assistant has never replied has not started, whatever else the
      // dashboard says.
      started: replies > 0,
      atRisk: (daysLeft ?? 99) <= 4 && !t.providerCustomerId,
    });
  }
  return out.sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
}
