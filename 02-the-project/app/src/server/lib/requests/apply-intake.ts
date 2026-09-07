import { forOrg } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { best, type Candidate } from "@/server/lib/matching/score";
import { defaultExpiry } from "@/server/lib/matching/requirements";
import { aedToFils, normalisePhone, type Intake } from "./intake";
import { entryStageId } from "@/server/lib/pipeline/defaults";

/**
 * Turning an extracted note into rows.
 *
 * The brief's flagship flow. One sentence produces: the person, their
 * requirement, the qualitative facts, a follow-up, a matching property,
 * and a record of what the assistant did.
 *
 * **Two rules govern everything below.**
 *
 * *A lead is a phone number.* `Lead` requires `phone` and is unique on
 * `[orgId, phone]` — the comment on the model says why: "E.164. This is
 * the identity in a WhatsApp-first product, not email." So somebody the
 * agent met with no number given cannot be a Lead, and inventing a
 * placeholder to make the flow tidy would poison the one key the whole
 * messaging side depends on. They go in the agent's blackbook, which is
 * exactly what it is for, and the reply asks for the number — one
 * question, which is the rule for anything spoken.
 *
 * *Nothing here messages anybody.* A requirement created this way is
 * `source: ASSISTANT`, and `canDriveOutreach()` will not let an inferred
 * requirement trigger an outbound message until an agent confirms it.
 * That is deliberate and it is the difference between a useful CRM and
 * the thing that gets a brokerage's WhatsApp number reported.
 */

export type IntakeResult = {
  /** What was created or updated, in the order a person would say it. */
  did: string[];
  /** The one thing worth asking for, if there is one. Never more than one. */
  ask?: string;
  /** Fields the model was not confident enough about to use. */
  dropped: string[];
  leadId?: string;
  blackbookEntryId?: string;
  match?: { reference: string; title: string; priceFils: bigint; score: number; reasons: string[] };
  href: string;
};

export async function applyIntake(args: {
  orgId: string;
  agentId: string;
  transcript: string;
  intake: Intake;
  requestId?: string;
}): Promise<IntakeResult> {
  const db = forOrg(args.orgId);
  const { intake } = args;
  const did: string[] = [];

  const name = intake.person.name?.trim() || null;
  const phone = normalisePhone(intake.person.phone);
  const r = intake.requirement;
  const wantsProperty =
    r.intent !== null || r.budgetMaxAed !== null || r.bedrooms !== null || r.communities.length > 0;

  /* ---------------------------------------------------------------- */
  /* The person                                                        */
  /* ---------------------------------------------------------------- */

  let leadId: string | undefined;
  let blackbookEntryId: string | undefined;

  if (phone) {
    /**
     * Upsert, not create.
     *
     * An agent meeting somebody they already have is the common case,
     * not the exception — a buyer they spoke to in March turns up at an
     * open house in August. Creating a second row would split their
     * history in half and the unique key would reject it anyway.
     */
    const existing = await db.lead.findUnique({
      where: { orgId_phone: { orgId: args.orgId, phone } },
      select: { id: true, name: true, assignedToId: true },
    });

    if (existing) {
      leadId = existing.id;
      await db.lead.update({
        where: { id: existing.id },
        data: {
          // Only fill blanks. An agent's voice note should not overwrite
          // a name somebody typed carefully, and speech-to-text on a
          // name is the least reliable field in the set.
          ...(existing.name ? {} : name ? { name } : {}),
          ...(existing.assignedToId ? {} : { assignedToId: args.agentId, assignedAt: new Date() }),
          ...(r.timeframe ? { timeframe: r.timeframe } : {}),
          ...(r.intent && r.intent !== "SELL" && r.intent !== "LIST" ? { intent: r.intent } : {}),
        },
      });
      did.push(`updated ${existing.name ?? name ?? "them"} on your board`);
    } else {
      const intakeStageId = await entryStageId(db, args.orgId, "QUALIFYING");
      const lead = await db.lead.create({
        data: {
          orgId: args.orgId,
          // QUALIFYING, matching the status below: somebody has spoken to
          // this person, so New would be a step backwards on the board.
          ...(intakeStageId ? { stageId: intakeStageId } : {}),
          phone,
          name,
          email: intake.person.email,
          source: "REFERRAL",
          status: "QUALIFYING",
          assignedToId: args.agentId,
          assignedAt: new Date(),
          timeframe: r.timeframe,
          ...(r.intent && r.intent !== "SELL" && r.intent !== "LIST" ? { intent: r.intent } : {}),
          ...(r.budgetMinAed !== null ? { budgetMinFils: aedToFils(r.budgetMinAed) } : {}),
          ...(r.budgetMaxAed !== null ? { budgetMaxFils: aedToFils(r.budgetMaxAed) } : {}),
        },
        select: { id: true },
      });
      leadId = lead.id;
      did.push(`added ${name ?? phone} to your leads`);
    }
  } else {
    /**
     * No number. The blackbook, which is what an agent's own book of
     * people is — and it is private to them, which is right for somebody
     * met at an open house who has not enquired about anything.
     */
    const entry = await db.blackbookEntry.create({
      data: {
        orgId: args.orgId,
        agentId: args.agentId,
        standaloneName: name,
        standaloneEmail: intake.person.email,
        privateNote: args.transcript,
        tags: [],
        lastTouched: new Date(),
      },
      select: { id: true },
    });
    blackbookEntryId = entry.id;
    did.push(`${name ?? "they"} are in your blackbook`);
  }

  const subject = leadId
    ? { leadId }
    : { blackbookEntryId: blackbookEntryId! };

  /* ---------------------------------------------------------------- */
  /* The requirement                                                   */
  /* ---------------------------------------------------------------- */

  let match: IntakeResult["match"];

  if (leadId && wantsProperty) {
    const purpose = r.intent === "RENT" ? "RENT" : "SALE";
    const requirement = await db.requirement.create({
      data: {
        orgId: args.orgId,
        leadId,
        label: describe(r),
        purpose,
        ...(r.intent && r.intent !== "SELL" && r.intent !== "LIST" ? { intent: r.intent } : {}),
        ...(r.budgetMinAed !== null ? { budgetMinFils: aedToFils(r.budgetMinAed) } : {}),
        ...(r.budgetMaxAed !== null ? { budgetMaxFils: aedToFils(r.budgetMaxAed) } : {}),
        bedroomsMin: r.bedrooms,
        communities: r.communities,
        preferences: [...r.preferences, ...(r.propertyType ? [r.propertyType] : [])],
        // Not AGENT. The agent said it, but a model extracted it, and
        // `canDriveOutreach()` reads this field to decide whether we may
        // message the person. An extraction is not a confirmation.
        source: "ASSISTANT",
        confidence: intake.confidence["budgetMaxAed"] ?? intake.confidence["bedrooms"] ?? null,
        active: true,
        expiresAt: defaultExpiry(r.intent),
      },
      select: { id: true },
    });
    did.push(`saved what they're looking for`);

    /**
     * The match, computed now rather than waiting for the nightly sweep.
     *
     * An agent standing in a car park who has just described a buyer
     * wants to know whether we hold anything, now. `matching.new-listings`
     * runs overnight and is the right place for the other direction —
     * new listing, who wants it — but it is the wrong latency for this.
     *
     * `best()` returns **one** match and only above 0.75. Five mediocre
     * ones is a mailshot, and it is the same threshold the outbound path
     * uses, so what the agent is shown here is what the system would
     * actually send.
     */
    const rows = await db.listing.findMany({
      where: {
        // AVAILABLE and UNDER_OFFER, matching the nightly sweep. A
        // property under offer is still worth showing an agent standing
        // in a car park — offers fall through, and knowing about it is
        // how they get the second call in.
        status: { in: ["AVAILABLE", "UNDER_OFFER"] },
        deletedAt: null,
        purpose,
        ...(r.bedrooms !== null ? { bedrooms: { gte: r.bedrooms } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, reference: true, title: true, priceFils: true,
        bedrooms: true, community: true, purpose: true, createdAt: true,
      },
    });

    // `Candidate.listedAt` is `Listing.createdAt`. The nightly matching
    // job maps it the same way — there is no separate listed date on the
    // model, and having two names for one column is how they drift.
    const candidates: Candidate[] = rows.map((l) => ({
      id: l.id,
      reference: l.reference,
      title: l.title,
      priceFils: l.priceFils,
      bedrooms: l.bedrooms,
      community: l.community,
      purpose: l.purpose as "SALE" | "RENT",
      listedAt: l.createdAt,
    }));

    const found = best(
      {
        budgetMinFils: r.budgetMinAed !== null ? aedToFils(r.budgetMinAed) : null,
        budgetMaxFils: r.budgetMaxAed !== null ? aedToFils(r.budgetMaxAed) : null,
        bedrooms: r.bedrooms,
        communities: r.communities,
        intent: r.intent === "RENT" ? "RENT"
              : r.intent === "BUY_TO_INVEST" ? "BUY_TO_INVEST"
              : r.intent === "BUY_TO_LIVE" ? "BUY_TO_LIVE" : null,
      },
      candidates
    );

    if (found?.listing.priceFils != null) {
      match = {
        reference: found.listing.reference,
        title: found.listing.title,
        priceFils: found.listing.priceFils,
        score: found.score,
        reasons: found.reasons,
      };
      did.push(`found one on your book that fits`);
    }

    void requirement;
  }

  /* ---------------------------------------------------------------- */
  /* The facts                                                         */
  /* ---------------------------------------------------------------- */

  if (intake.facts.length > 0) {
    await db.clientFact.createMany({
      data: intake.facts.map((f) => ({
        orgId: args.orgId,
        ...subject,
        kind: f.kind,
        body: f.body,
        // EXTRACTED, not CLIENT. The agent said it; the model lifted it
        // out. Showing an extraction as something the client said is how
        // an agent repeats a "fact" back to somebody who never said it.
        source: "EXTRACTED" as const,
        confidence: intake.confidence["facts"] ?? null,
        originRequestId: args.requestId,
        statedAt: new Date(),
      })),
    });
    did.push(`kept ${intake.facts.length} thing${intake.facts.length === 1 ? "" : "s"} about them`);
  }

  /* ---------------------------------------------------------------- */
  /* The follow-up — the half people forget, so it is not optional     */
  /* ---------------------------------------------------------------- */

  const due = dueFrom(r.timeframe);
  await db.followUp.create({
    data: {
      orgId: args.orgId,
      agentId: args.agentId,
      title: `Follow up with ${name ?? "your new contact"}`,
      body: args.transcript.slice(0, 300),
      ...subject,
      dueAt: due,
    },
  });
  // Phrased as a verb because it is usually the last clause, and
  // "…and reminder set for Sunday" reads like a telegram.
  did.push(`set you a reminder for ${due.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}`);

  await audit(db, args.orgId, {
    actorId: args.agentId,
    action: "intake.captured",
    entity: leadId ? "Lead" : "BlackbookEntry",
    entityId: leadId ?? blackbookEntryId!,
    after: { name, hasPhone: Boolean(phone), facts: intake.facts.length, matched: Boolean(match) },
  });

  /**
   * One question, never a list.
   *
   * An agent walking between viewings answers one thing. The number is
   * the one worth asking for, because without it nothing can be sent,
   * no requirement can exist, and the person stays in a private book
   * rather than on the board.
   */
  const ask =
    !phone && name ? `What's ${name.split(" ")[0]}'s number? Then I can put a requirement on them and start matching.`
    : !phone ? "What's their number?"
    : leadId && !wantsProperty ? "What are they looking for?"
    : undefined;

  return {
    did,
    ask,
    dropped: [],
    leadId,
    blackbookEntryId,
    match,
    href: leadId ? `/leads` : `/blackbook`,
  };
}

/** A label a person would recognise on a list. */
function describe(r: Intake["requirement"]): string {
  const bits = [
    r.bedrooms !== null ? `${r.bedrooms}-bed` : null,
    r.propertyType,
    r.communities[0] ? `in ${r.communities[0]}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" ") : "New requirement";
}

/**
 * When to chase, from what they said about timing.
 *
 * Somebody moving in three months does not want a call tomorrow, and
 * somebody moving in three weeks will have bought by the time a
 * three-day default comes round. Parsed loosely from their own words,
 * because that is the only form the information arrives in.
 */
function dueFrom(timeframe: string | null, now = new Date()): Date {
  const t = (timeframe ?? "").toLowerCase();
  const days =
    /(asap|immediate|urgent|this week|now)/.test(t) ? 1
    : /(week)/.test(t) ? 2
    : /(month)/.test(t) ? 7
    : /(year|next year|no rush|not urgent)/.test(t) ? 30
    : 3;
  return new Date(now.getTime() + days * 86_400_000);
}
