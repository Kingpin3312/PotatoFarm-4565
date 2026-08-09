import { forOrg } from "@/server/db/client";
import { messagingWindow } from "@/server/lib/whatsapp";

/**
 * One person, everything said to them.
 *
 * The competing product's pitch is "WhatsApp, email and contacts in one
 * place". The hard part is not fetching them — it is that a WhatsApp
 * thread and an email thread are different shapes, and interleaving
 * them naively produces a list nobody can read.
 *
 * So a timeline entry is normalised down to what an agent scanning it
 * actually needs: who, when, which channel, and one line of what.
 */

export type Entry = {
  at: Date;
  channel: "whatsapp" | "email" | "note" | "viewing" | "offer";
  direction: "in" | "out" | "none";
  summary: string;
  /** Present for email — opens the original in Gmail or Outlook. */
  link?: string;
};

export async function timeline(args: {
  orgId: string;
  agentId: string;
  leadId?: string;
  vendorId?: string;
  limit?: number;
}): Promise<{ entries: Entry[]; replyWindow: { open: boolean; hoursLeft: number } | null }> {
  const db = forOrg(args.orgId);
  const take = args.limit ?? 60;
  const who = args.leadId ? { leadId: args.leadId } : { vendorId: args.vendorId! };

  const [messages, emails, viewings, offers] = await Promise.all([
    args.leadId
      ? db.message.findMany({
          where: { conversation: { leadId: args.leadId } },
          orderBy: { createdAt: "desc" }, take,
          select: { body: true, direction: true, createdAt: true },
        })
      : Promise.resolve([]),
    db.emailMessage.findMany({
      where: who, orderBy: { sentAt: "desc" }, take,
      select: { subject: true, snippet: true, direction: true, sentAt: true, webLink: true },
    }),
    args.leadId
      ? db.viewing.findMany({
          where: { leadId: args.leadId }, orderBy: { scheduledAt: "desc" }, take: 10,
          select: { scheduledAt: true, listing: { select: { building: true } } },
        })
      : Promise.resolve([]),
    db.offer.findMany({
      where: who, orderBy: { submittedAt: "desc" }, take: 10,
      select: { amountFils: true, submittedAt: true, status: true },
    }),
  ]);

  const { aed } = await import("@/lib/money");
  const entries: Entry[] = [
    ...messages.map((m) => ({
      at: m.createdAt,
      channel: "whatsapp" as const,
      direction: m.direction === "INBOUND" ? ("in" as const) : ("out" as const),
      summary: oneLine(m.body ?? ""),
    })),
    ...emails.map((e) => ({
      at: e.sentAt,
      channel: "email" as const,
      direction: e.direction === "INBOUND" ? ("in" as const) : ("out" as const),
      // Subject first — it is what an agent recognises. The snippet is
      // the fallback for the many emails with a useless subject.
      summary: oneLine(e.subject || e.snippet || "(no subject)"),
      link: e.webLink ?? undefined,
    })),
    ...viewings.map((v) => ({
      at: v.scheduledAt,
      channel: "viewing" as const,
      direction: "none" as const,
      summary: `Viewing — ${v.listing?.building ?? "a property"}`,
    })),
    ...offers.map((o) => ({
      at: o.submittedAt,
      channel: "offer" as const,
      direction: "none" as const,
      summary: `Offer ${aed(o.amountFils)} — ${o.status.toLowerCase()}`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);

  /**
   * The reply window, surfaced on the person rather than the thread.
   *
   * An agent looking at somebody's history is often about to message
   * them, and this is the moment that matters — after 24 hours of
   * silence a normal WhatsApp message does not arrive and nothing tells
   * you.
   */
  const lastInbound = messages.find((m) => m.direction === "INBOUND")?.createdAt ?? null;
  const w = args.leadId ? messagingWindow(lastInbound) : null;

  return {
    entries,
    replyWindow: w ? { open: w.open, hoursLeft: w.hoursLeft } : null,
  };
}

/** Collapsed to one line. A four-paragraph email in a timeline row
 *  pushes everything else off the screen. */
const oneLine = (s: string) =>
  s.replace(/\s+/g, " ").trim().slice(0, 120) + (s.length > 120 ? "…" : "");
