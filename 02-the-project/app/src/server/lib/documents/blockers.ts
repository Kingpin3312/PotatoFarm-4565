import type { DocumentType, Prisma } from "@prisma/client";
import { RULES } from "./expiry";

/**
 * The documents that stop a transaction, enforced rather than announced.
 *
 * `expiry.ts` has carried `blocking: true` on three document types since
 * it was written, and the README recorded honestly that nothing acted on
 * it: "nothing yet stops a deal progressing when the agent's card has
 * lapsed. That is the obvious next step and the one with teeth."
 *
 * A warning that arrives sixty days out and is then ignored has achieved
 * nothing. This is the part that cannot be ignored.
 *
 * ## The rule that matters most: absence never blocks
 *
 * A blocker exists only when a document has been **recorded and has
 * expired**. A brokerage that has never opened the register is not
 * stopped from working, and neither is an agent nobody has filed a card
 * for. Blocking on a missing row would make the register compulsory
 * overnight and shut down every existing customer on the morning it
 * shipped — and it would be dishonest as well as rude, because a missing
 * row is not evidence that a card has lapsed. It is evidence of nothing.
 *
 * So: silence means we do not know, and we do not act on what we do not
 * know. `documents.expiry` is what chases the gaps.
 */

export type Blocker = {
  type: DocumentType;
  /** What it is called on screen. */
  what: string;
  /** Who has to renew it. Named, because "a document" fixes nothing. */
  whose: string;
  expiredAt: Date;
  daysExpired: number;
  consequence: string;
};

type BlockerReader = {
  document: {
    findMany: (args: Prisma.DocumentFindManyArgs) => Promise<
      { type: DocumentType; ownerType: string; ownerId: string; expiresAt: Date | null }[]
    >;
  };
  user: {
    findMany: (args: Prisma.UserFindManyArgs) => Promise<{ id: string; name: string | null; email: string | null }[]>;
  };
};

/** Only these stop a transaction. A lapsed passport does not. */
const BLOCKING = RULES.filter((r) => r.blocking).map((r) => r.type);

const WHAT: Partial<Record<DocumentType, string>> = {
  RERA_BROKER_CARD: "RERA broker card",
  BROKERAGE_LICENCE: "brokerage licence",
  TRAKHEESI_PERMIT: "Trakheesi permit",
};

/**
 * What stops these people acting on this transaction, right now.
 *
 * `people` is the actor and the agent the deal belongs to — both are
 * acting on it at the moment a milestone is recorded, one by doing it
 * and one by authorising it. The brokerage licence is checked always,
 * because when it lapses nobody can transact.
 */
export async function transactionBlockers(
  db: BlockerReader,
  args: { orgId: string; orgName: string; people: string[]; now?: Date },
): Promise<Blocker[]> {
  const now = args.now ?? new Date();
  const people = [...new Set(args.people.filter(Boolean))];

  const docs = await db.document.findMany({
    where: {
      supersededById: null,
      type: { in: BLOCKING },
      // Expired, not expiring. A warning is the sweep's job; this is the
      // line, and it is the date on the document rather than a lead time.
      expiresAt: { lt: now },
      OR: [
        { ownerType: "ORGANISATION" },
        { ownerType: "USER", ownerId: { in: people } },
      ],
    },
    select: { type: true, ownerType: true, ownerId: true, expiresAt: true },
  });

  if (docs.length === 0) return [];

  const named = new Map<string, string>();
  const userIds = docs.filter((d) => d.ownerType === "USER").map((d) => d.ownerId);
  if (userIds.length) {
    for (const u of await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    })) {
      named.set(u.id, u.name ?? u.email ?? "an agent");
    }
  }

  const consequenceFor = (t: DocumentType) => RULES.find((r) => r.type === t)?.consequence ?? "";

  return docs
    .map((d) => ({
      type: d.type,
      what: WHAT[d.type] ?? d.type.toLowerCase().replace(/_/g, " "),
      whose: d.ownerType === "ORGANISATION" ? args.orgName : named.get(d.ownerId) ?? "an agent",
      expiredAt: d.expiresAt!,
      daysExpired: Math.floor((now.getTime() - d.expiresAt!.getTime()) / 86_400_000),
      consequence: consequenceFor(d.type),
    }))
    // Worst first: the longest-lapsed is the one somebody has been
    // ignoring, and it is the one to name if only one fits in a message.
    .sort((a, b) => b.daysExpired - a.daysExpired);
}

/**
 * One sentence, and then how to clear it.
 *
 * A refusal that does not say what to do next becomes a support ticket,
 * and a compliance control everybody has to ring somebody about is one
 * that gets disabled. Recording a renewal takes two minutes and the
 * message says where.
 */
export function refusalMessage(blockers: Blocker[]) {
  const first = blockers[0];
  if (!first) return "";
  const others = blockers.length - 1;
  return (
    `${first.whose}'s ${first.what} expired ${first.daysExpired === 0 ? "today" : `${first.daysExpired} days ago`}. ` +
    `${first.consequence} ` +
    (others > 0 ? `${others} other blocking document ${others === 1 ? "has" : "have"} lapsed too. ` : "") +
    `Record the renewal under Documents and this will clear.`
  );
}
