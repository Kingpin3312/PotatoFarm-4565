import { forOrg } from "@/server/db/client";
import { normalisePhone } from "@/server/lib/portals/normalise";

/**
 * Data export.
 *
 * This exists because the marketing site already promises it. The FAQ
 * says "every contact, message and deal, in one export, whenever you
 * ask", and the security page says the same. A promise in copy with no
 * code behind it is the thing that turns a sales conversation into a
 * refund, so it gets built properly rather than as a CSV of leads.
 *
 * Two exports, for two different requests:
 *
 *   - **Tenant export.** A brokerage leaving, or backing up. Everything
 *     they own, in a format they can actually load somewhere else.
 *   - **Subject export.** One person asking what is held about them.
 *     Different question, different answer, and conflating the two is how
 *     a brokerage accidentally hands one buyer another buyer's file.
 */

export type ExportManifest = {
  generatedAt: string;
  organisation: string;
  counts: Record<string, number>;
  files: string[];
  notes: string[];
};

/** Everything a brokerage owns. Streamed, because some of these are large. */
export async function* exportTenant(orgId: string) {
  const db = forOrg(orgId);

  const org = await db.organisation.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, timezone: true, currency: true },
  });

  const counts: Record<string, number> = {};
  const files: string[] = [];

  /**
   * Cursor-paged rather than loaded whole. A brokerage with four years of
   * messages will not fit in memory, and an export that falls over at 80%
   * is worse than one that was never offered.
   */
  async function* table<T>(name: string, fetch: (cursor: string | null) => Promise<T[]>) {
    let cursor: string | null = null;
    let n = 0;
    yield `\n--- ${name} ---\n`;
    for (;;) {
      const rows = await fetch(cursor);
      if (!rows.length) break;
      for (const r of rows) yield JSON.stringify(r) + "\n";
      n += rows.length;
      cursor = (rows.at(-1) as { id: string }).id;
      if (rows.length < 500) break;
    }
    counts[name] = n;
    files.push(name);
  }

  yield* table("leads", (c) =>
    db.lead.findMany({
      take: 500, ...(c && { cursor: { id: c }, skip: 1 }), orderBy: { id: "asc" },
      include: { answers: true, enquiries: true, viewings: true },
    })
  );

  yield* table("conversations", (c) =>
    db.conversation.findMany({
      take: 500, ...(c && { cursor: { id: c }, skip: 1 }), orderBy: { id: "asc" },
      include: { messages: { orderBy: { sentAt: "asc" } } },
    })
  );

  yield* table("listings", (c) =>
    db.listing.findMany({
      take: 500, ...(c && { cursor: { id: c }, skip: 1 }), orderBy: { id: "asc" },
      include: { publications: true },
    })
  );

  yield* table("viewings", (c) =>
    db.viewing.findMany({ take: 500, ...(c && { cursor: { id: c }, skip: 1 }), orderBy: { id: "asc" } })
  );

  yield* table("audit", (c) =>
    db.auditLog.findMany({ take: 500, ...(c && { cursor: { id: c }, skip: 1 }), orderBy: { id: "asc" } })
  );

  const manifest: ExportManifest = {
    generatedAt: new Date().toISOString(),
    organisation: org.name,
    counts,
    files,
    notes: [
      "Times are UTC. The brokerage's own timezone is " + org.timezone + ".",
      "Money is in " + org.currency + ".",
      "Access tokens and webhook secrets are deliberately excluded — they are held in the secrets manager, not the database, and are not yours to take elsewhere.",
    ],
  };

  yield `\n--- manifest ---\n${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * What is held about one person.
 *
 * Scoped to a single lead by phone number, because that is the identity
 * in this product. Deliberately does not include the brokerage's internal
 * notes about other people, agent names beyond the one who dealt with
 * them, or anything from another lead's file.
 */
export async function exportSubject(orgId: string, phone: string) {
  const db = forOrg(orgId);

  const lead = await db.lead.findUnique({
    where: { orgId_phone: { orgId, phone } },
    include: {
      answers: { include: { question: { select: { prompt: true } } } },
      enquiries: { include: { listing: { select: { reference: true, title: true } } } },
      viewings: { include: { listing: { select: { reference: true, title: true } } } },
      conversation: { include: { messages: { orderBy: { sentAt: "asc" } } } },
      assignedTo: { select: { name: true } },
    },
  });

  const owners = await ownersFor(db, phone);
  if (!lead && !owners.length) return null;
  if (!lead) {
    // One shape either way, so whoever reads the file — or a check —
    // finds each section in the same place, empty where it does not apply.
    return {
      generatedAt: new Date().toISOString(),
      aboutYou: {
        name: owners[0]!.name as string | null, phone, email: owners[0]!.email,
        language: null as string | null, firstContact: owners[0]!.createdAt, source: null as string | null,
      },
      whatYouToldUs: [] as { question: string; answer: string; recorded: Date }[],
      propertiesYouAskedAbout: [] as { property: string; reference: string | undefined; when: Date }[],
      viewings: [] as { property: string | undefined; when: Date; outcome: string }[],
      messages: [] as { from: string; text: string; when: Date }[],
      handledBy: null as string | null,
      asPropertyOwner: owners.map(asOwner),
    };
  }

  // What they told us about each viewing. Not a relation on `Lead`, so
  // read separately — and easy to leave out of a subject access request
  // for exactly that reason.
  const feedback = await db.viewingFeedback.findMany({
    where: { leadId: lead.id, answeredAt: { not: null } },
    select: { viewingId: true, verdict: true, reasons: true, comment: true, answeredAt: true },
  });
  const said = new Map(feedback.map((f) => [f.viewingId, f]));

  return {
    generatedAt: new Date().toISOString(),
    aboutYou: {
      name: lead.name, phone: lead.phone, email: lead.email, language: lead.language,
      firstContact: lead.createdAt,
      source: lead.source,
    },
    whatYouToldUs: lead.answers.map((a) => ({
      question: a.question.prompt, answer: a.value, recorded: a.createdAt,
    })),
    propertiesYouAskedAbout: lead.enquiries.map((e) => ({
      property: e.listing?.title ?? "(no longer listed)",
      reference: e.listing?.reference,
      when: e.createdAt,
    })),
    viewings: lead.viewings.map((v) => ({
      property: v.listing?.title, when: v.scheduledAt, outcome: v.status,
      ...(said.has(v.id) && {
        whatYouThought: {
          verdict: said.get(v.id)!.verdict, reasons: said.get(v.id)!.reasons,
          inYourWords: said.get(v.id)!.comment, recorded: said.get(v.id)!.answeredAt,
        },
      }),
    })),
    messages: lead.conversation?.messages.map((m) => ({
      from: m.author === "LEAD" ? "you" : m.author === "ASSISTANT" ? "our assistant" : "our team",
      text: m.body, when: m.sentAt,
    })) ?? [],
    handledBy: lead.assignedTo?.name ?? null,
    // Somebody buying one flat can be selling another.
    asPropertyOwner: owners.map(asOwner),
  };
}

/**
 * The same number as a property owner.
 *
 * Owners have had a thread with the brokerage since
 * `20260929090000_owner_conversations`, and this file was built from a
 * buyer's record alone, so an owner asking what we hold was told
 * "nothing" while their messages sat in the inbox. Matched by normalised
 * number, because an owner's is typed by an agent.
 *
 * Their properties by reference and title, and their own thread. Not the
 * offers on those properties: those are other people's data.
 */
async function ownersFor(db: ReturnType<typeof forOrg>, phone: string) {
  const want = normalisePhone(phone) ?? phone;
  const rows = await db.vendor.findMany({
    where: { phone: { not: null } },
    select: {
      id: true, name: true, email: true, phone: true, prefers: true, reportDay: true, reportsOff: true, createdAt: true,
      listings: { select: { reference: true, title: true, status: true } },
      conversation: { select: { messages: { orderBy: { sentAt: "asc" }, select: { author: true, body: true, sentAt: true } } } },
    },
  });
  return rows.filter((v) => normalisePhone(v.phone ?? undefined) === want);
}

function asOwner(o: Awaited<ReturnType<typeof ownersFor>>[number]) {
  return {
    name: o.name, email: o.email, since: o.createdAt,
    howYouAskedToHearFromUs: o.prefers,
    weeklyReport: o.reportsOff ? "off" : o.reportDay ? `day ${o.reportDay} of the week` : "none",
    propertiesYouAskedUsToHandle: o.listings.map((l) => ({ reference: l.reference, property: l.title, status: l.status })),
    messages: o.conversation?.messages.map((m) => ({
      from: m.author === "LEAD" ? "you" : "our team", text: m.body, when: m.sentAt,
    })) ?? [],
  };
}
