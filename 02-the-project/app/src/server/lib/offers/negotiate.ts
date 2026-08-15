import { forOrg } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { aed } from "@/lib/money";
import { log } from "@/lib/log";
import { openKycFile } from "@/server/lib/aml/open";

/**
 * Offers, and everything said after them.
 *
 * The gap a twenty-two-year agent found in a morning: *"there is no way
 * to record what was offered, by whom, what the seller said back, the
 * counter, and the counter to the counter. That is the job."*
 *
 * He was right. The product had `UNDER_OFFER` as a listing status and
 * nothing else — the most important twenty minutes of any deal answered
 * by a dropdown.
 */

/**
 * Nothing is ever overwritten.
 *
 * A counter creates a response; it does not edit the amount. Overwriting
 * would erase the negotiation, which is the one record both sides argue
 * about six months later — and the one an agent needs when a commission
 * is disputed.
 */
export async function counter(args: {
  orgId: string;
  offerId: string;
  by: "BUYER" | "VENDOR" | "AGENT";
  amountFils: bigint;
  note?: string;
  actorId: string;
  /**
   * When the counter lapses. Written to the offer below and never
   * declared here, so the value was always `undefined` — an offer
   * countered on Tuesday kept Tuesday's deadline, which is the exact
   * "deal lost to a calendar" the line below says it prevents.
   */
  expiresAt?: Date | null;
}) {
  const db = forOrg(args.orgId);

  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUniqueOrThrow({
      where: { id: args.offerId },
      select: { id: true, status: true, amountFils: true, listingId: true, expiresAt: true },
    });

    if (["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(offer.status)) {
      // Closed is closed. A counter on a rejected offer is a new offer,
      // and pretending otherwise makes the history unreadable.
      return {
        ok: false as const,
        reason: `That offer was ${offer.status.toLowerCase()}. Record a new one instead — the history stays intact either way.`,
      };
    }

    await tx.offerResponse.create({
      data: {
        orgId: args.orgId, offerId: offer.id, by: args.by,
        kind: "COUNTER", amountFils: args.amountFils,
        note: args.note, recordedById: args.actorId,
      },
    });

    await tx.offer.update({
      where: { id: offer.id },
      data: {
        status: "COUNTERED",
        // The counter resets the clock. An offer countered on Tuesday
        // that still expires on Wednesday is a deal lost to a calendar.
        expiresAt: args.expiresAt ?? null,
      },
    });

    await audit(tx, args.orgId, {
      actorId: args.actorId,
      action: "offer.countered",
      entity: "Offer",
      entityId: offer.id,
      before: { amountFils: offer.amountFils.toString() },
      after: { amountFils: args.amountFils.toString(), by: args.by },
    });

    return { ok: true as const };
  });
}

/**
 * Accepting.
 *
 * Two things happen that are easy to forget separately and disastrous to
 * forget together: the listing goes under offer, and **every other live
 * offer on it is told.**
 *
 * An agent whose buyer offered last week and hears nothing assumes it is
 * still open, keeps them warm, and finds out from the portal. That is
 * how a brokerage loses a buyer who would have gone higher.
 */
export async function accept(args: {
  orgId: string; offerId: string; actorId: string; note?: string;
}) {
  const db = forOrg(args.orgId);

  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUniqueOrThrow({
      where: { id: args.offerId },
      select: {
        id: true, listingId: true, amountFils: true, leadId: true,
        status: true, financing: true, sellerHasMortgage: true,
      },
    });

    if (offer.status === "ACCEPTED") return { ok: false as const, reason: "Already accepted." };

    await tx.offerResponse.create({
      data: {
        orgId: args.orgId, offerId: offer.id, by: "VENDOR",
        kind: "ACCEPT", note: args.note, recordedById: args.actorId,
      },
    });
    await tx.offer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED", decidedAt: new Date() },
    });
    await tx.listing.update({
      where: { id: offer.listingId },
      data: { status: "UNDER_OFFER" },
    });

    /**
     * The seam.
     *
     * `deals/` could plan backwards from a Form F completion date, warn
     * that a mortgage purchase against a mortgaged seller needs about 47
     * working days, and chase the two things nobody remembers — the
     * seller's liability letter and service charge clearance before the
     * NOC.
     *
     * **Nothing created a Deal.** A complete module with no trigger, and
     * the third time that shape has turned up in this codebase.
     *
     * An accepted offer is the trigger. It is the moment the job stops
     * being about finding a buyer and starts being about not losing one.
     *
     * The agreed value is the **latest counter**, not the opening offer.
     * Taking the opening figure would put the wrong number on the
     * commission, the invoice and the Form F — and it would be wrong
     * quietly, in the direction of whichever party countered last.
     */
    const latestCounter = await tx.offerResponse.findFirst({
      where: { offerId: offer.id, kind: "COUNTER" },
      orderBy: { at: "desc" },
      select: { amountFils: true },
    });
    const agreedFils = latestCounter?.amountFils ?? offer.amountFils;

    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: offer.listingId },
      select: { reference: true, purpose: true },
    });

    const deal = await tx.deal.create({
      data: {
        orgId: args.orgId,
        leadId: offer.leadId,
        listingId: offer.listingId,
        // The listing reference, so a deal and a property are findable
        // by the same string an agent already says on the phone.
        reference: listing.reference,
        // DealType is SALE | RENTAL | OFF_PLAN. "LETTING" is the word
        // the UK-English copy uses and is not a value of the enum.
        type: listing.purpose === "RENT" ? "RENTAL" : "SALE",
        valueFils: agreedFils,
        stage: "AGREED",
        financing: offer.financing,
        sellerHasMortgage: offer.sellerHasMortgage ?? false,
        agreedAt: new Date(),
      },
    });

    /**
     * The due diligence file opens here, with the deal.
     *
     * UAE AML attaches the obligation to concluding the transaction, and
     * this is the line where a lead becomes one. Opening it later means
     * an agent chasing a passport while a Form F is already moving;
     * opening it on a date somebody remembers means it is sometimes not
     * opened at all.
     *
     * Inside the same transaction as the deal, so the two cannot come
     * apart — a deal with no file is the state the whole module exists
     * to prevent, and it is exactly what a crash between two writes
     * would leave behind.
     */
    if (offer.leadId) {
      await openKycFile(tx, { orgId: args.orgId, leadId: offer.leadId });
    } else {
      /**
       * An offer with no lead record, and the file that cannot open.
       *
       * `Offer.leadId` is optional — an offer relayed by another agency
       * arrives with a listing and a figure and no buyer of ours — while
       * `KycRecord.leadId` is required and unique, because the file *is*
       * about a person. So there is nowhere to hang it.
       *
       * The obligation does not go away with the record: a brokerage
       * concluding that sale still owes due diligence on that buyer.
       * Logged rather than skipped silently, because the alternative is
       * a deal that quietly never had a file and nothing anywhere saying
       * so. Closing it properly means a buyer record for an offer that
       * arrived without one, which is a larger change than this.
       */
      log.warn("deal agreed with no lead record — no KYC file could be opened", {
        orgId: args.orgId,
      }, { dealId: deal.id });
    }

    await audit(tx, args.orgId, {
      actorId: args.actorId,
      action: "deal.created",
      entity: "Deal",
      entityId: deal.id,
      after: {
        fromOffer: offer.id,
        valueFils: agreedFils.toString(),
        // Recorded because it is the thing that decides whether the
        // completion date on the Form F is achievable at all.
        financing: offer.financing,
      },
    });

    // Everyone else, marked so an agent can see at a glance which of
    // their buyers needs a call this afternoon.
    const others = await tx.offer.findMany({
      where: {
        listingId: offer.listingId,
        id: { not: offer.id },
        status: { in: ["SUBMITTED", "PRESENTED", "COUNTERED"] },
      },
      select: { id: true, leadId: true, agentId: true },
    });
    if (others.length) {
      await tx.offer.updateMany({
        where: { id: { in: others.map((o) => o.id) } },
        data: { status: "REJECTED", decidedAt: new Date() },
      });
    }

    await audit(tx, args.orgId, {
      actorId: args.actorId,
      action: "offer.accepted",
      entity: "Offer",
      entityId: offer.id,
      after: { amountFils: offer.amountFils.toString(), othersClosed: others.length },
    });

    log.info("offer accepted", { orgId: args.orgId },
             { listingId: offer.listingId, othersClosed: others.length });

    return {
      ok: true as const,
      dealId: deal.id,
      agreed: aed(agreedFils),
      /** Who needs telling, by a person, today. */
      toTell: others.map((o) => ({ leadId: o.leadId, agentId: o.agentId })),
      /**
       * The first date that matters. Everything in `deals/` is planned
       * backwards from it, and it is not set yet — an agent has to put
       * the Form F date in, and the sooner they do the sooner the
       * warnings start being useful.
       */
      needsCompletionDate: true,
    };
  });
}

/**
 * What the vendor is actually choosing between.
 *
 * A seller comparing two offers looks at the numbers. An agent worth
 * their commission explains that the lower cash offer with no conditions
 * completes in three weeks and the higher one is subject to a mortgage
 * the buyer has not applied for.
 *
 * This produces that comparison so the agent does not have to hold it in
 * their head on the phone.
 */
export async function compare(orgId: string, listingId: string) {
  const offers = await forOrg(orgId).offer.findMany({
    where: { listingId, status: { in: ["SUBMITTED", "PRESENTED", "COUNTERED"] } },
    orderBy: { amountFils: "desc" },
    include: {
      responses: { orderBy: { at: "asc" } },
      // Named so a vendor call is a conversation rather than a lookup.
    },
  });

  return offers.map((o) => {
    const latest = o.responses.filter((r) => r.kind === "COUNTER").at(-1);
    const current = latest?.amountFils ?? o.amountFils;

    return {
      id: o.id,
      opened: aed(o.amountFils),
      current: aed(current),
      // Movement matters. A buyer who has come up twice is a buyer with
      // room; one who opened and stood still is not.
      moves: o.responses.filter((r) => r.kind === "COUNTER").length,
      financing: o.financing,
      preApproved: o.preApproved,
      conditions: o.conditions,
      /**
       * The honest ranking, and it is not by price.
       *
       * Cash with no conditions beats a higher mortgage offer that has
       * not been pre-approved, and every experienced agent knows it. The
       * system should say so rather than sorting by the biggest number
       * and letting somebody get it wrong on a Friday.
       */
      strength:
        (o.financing === "CASH" ? 3 : o.preApproved ? 2 : 0) +
        (o.conditions ? 0 : 1),
      expiresAt: o.expiresAt,
      history: o.responses.map((r) => ({
        by: r.by, kind: r.kind,
        amount: r.amountFils ? aed(r.amountFils) : null,
        note: r.note, at: r.at,
      })),
    };
  });
}

/**
 * Offers that have quietly run out.
 *
 * An agent chasing an acceptance on an offer that lapsed on Tuesday is
 * an agent about to be embarrassed in front of a buyer. Swept hourly,
 * and the agent is told rather than the record silently changing.
 */
export async function sweepExpired() {
  const { crossTenant } = await import("@/server/db/client");
  const now = new Date();
  const due = await crossTenant("sweep").offer.findMany({
    where: { status: { in: ["SUBMITTED", "PRESENTED", "COUNTERED"] }, expiresAt: { lte: now } },
    select: { id: true, orgId: true, agentId: true, listingId: true },
  });

  for (const o of due) {
    await crossTenant("sweep").offer.update({
      where: { id: o.id }, data: { status: "LAPSED" },
    });
  }
  return { lapsed: due.length, notify: due };
}
