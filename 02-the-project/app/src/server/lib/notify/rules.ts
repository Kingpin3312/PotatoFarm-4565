import type { NotificationKind } from "@prisma/client";

/**
 * What is worth interrupting someone for.
 *
 * The decision that shapes this whole module: **the notification that
 * matters is not "new lead". It is "a qualified lead nobody has picked
 * up."**
 *
 * Notifying on every enquiry is the default in this category and it is
 * why agents turn notifications off within a week. Once they are off, the
 * one that mattered at 11pm on a Saturday does not arrive either, and the
 * product quietly stops working. So the rule is: the assistant handling
 * something well is not news. The assistant stepping back, or nobody
 * picking something up, is.
 */

export type Urgency = "urgent" | "normal" | "digest";

export const RULES: Record<NotificationKind, {
  urgency: Urgency;
  /** How long the thing must have been unattended before anyone is told. */
  afterMinutes: number;
  /** Escalation ladder, in order. Each rung waits this long before the next. */
  escalateAfterMinutes: number[];
  why: string;
}> = {
  /**
   * The assistant stopped and a person needs to take over. This is the
   * one genuinely urgent notification in the product — a lead is sitting
   * mid-conversation waiting for an answer.
   */
  HANDOVER_WAITING: {
    urgency: "urgent",
    afterMinutes: 3,
    escalateAfterMinutes: [10, 25],
    why: "Someone is mid-conversation waiting for a person.",
  },

  /**
   * Qualified, and nobody owns it. The most expensive thing in the system
   * to leave alone, because the work is already done.
   */
  QUALIFIED_UNCLAIMED: {
    urgency: "urgent",
    afterMinutes: 15,
    escalateAfterMinutes: [30, 60],
    why: "The hard part is finished and nobody has taken it.",
  },

  VIEWING_SOON: {
    urgency: "urgent",
    afterMinutes: 0,
    escalateAfterMinutes: [],
    why: "An agent is due somewhere in an hour.",
  },

  VIEWING_TOMORROW: {
    urgency: "normal",
    afterMinutes: 0,
    escalateAfterMinutes: [],
    why: "Tomorrow's diary, sent at a civilised hour.",
  },

  /**
   * The field the pipeline depends on and the one agents never fill in.
   * Chased once, gently, and then it goes in the digest rather than
   * nagging — a notification nobody acts on twice is noise the third time.
   */
  OUTCOME_MISSING: {
    urgency: "digest",
    afterMinutes: 180,
    escalateAfterMinutes: [1440],
    why: "A viewing happened and nobody said what came of it.",
  },

  PERMIT_EXPIRING: { urgency: "digest", afterMinutes: 0, escalateAfterMinutes: [], why: "Renew before the listing is pulled." },
  ASSISTANT_STOPPED: { urgency: "normal", afterMinutes: 0, escalateAfterMinutes: [], why: "So nobody assumes the silence is a fault." },

  /**
   * A follow-up the agent set for themselves, usually from a voice note.
   *
   * No escalation ladder and no urgency. This is somebody's own note to
   * themselves — escalating it to a manager would turn a private habit
   * into a monitored one, and agents would stop setting them.
   */
  FOLLOW_UP_DUE: {
    urgency: "normal",
    afterMinutes: 0,
    escalateAfterMinutes: [],
    why: "You asked to be reminded.",
  },

  /**
   * A deal is slipping against its Form F date.
   *
   * Dispatched from the milestone sweep, and it had no rule — `RULES[kind]`
   * came back undefined and the next line read `.afterMinutes` off it.
   * Every deal-at-risk notification in the product would have thrown.
   *
   * Half a day before anyone is told, because a milestone slipping by an
   * hour is normal and a person cannot act on it at 2am anyway.
   */
  DEAL_AT_RISK: {
    urgency: "normal",
    afterMinutes: 720,
    escalateAfterMinutes: [2880],
    why: "A deal is behind its completion date.",
  },

  /**
   * A portal or feed has gone quiet.
   *
   * Same missing-rule bug. A day's silence before telling anybody: feeds
   * have quiet nights, and crying wolf on a Sunday morning is how people
   * learn to ignore this.
   */
  PORTAL_SILENT: {
    urgency: "normal",
    afterMinutes: 1440,
    escalateAfterMinutes: [4320],
    why: "A lead source has stopped sending.",
  },
};

/**
 * Quiet hours.
 *
 * Respected by default, and overridden only by someone who has explicitly
 * asked to be woken. A product that wakes agents at 3am for a lead the
 * assistant already answered gets uninstalled, and rightly.
 */
export function inQuietHours(
  now: Date,
  prefs: { quietFromMin: number | null; quietToMin: number | null; daysOff: number[] },
  timezone: string
) {
  const dow = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
      .format(now)
      .replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, (m) =>
        String(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(m)))
  );
  if (prefs.daysOff.includes(dow)) return true;
  if (prefs.quietFromMin === null || prefs.quietToMin === null) return false;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const mins =
    Number(parts.find((p) => p.type === "hour")!.value) * 60 +
    Number(parts.find((p) => p.type === "minute")!.value);

  // Quiet hours normally cross midnight, so the range wraps.
  return prefs.quietFromMin > prefs.quietToMin
    ? mins >= prefs.quietFromMin || mins < prefs.quietToMin
    : mins >= prefs.quietFromMin && mins < prefs.quietToMin;
}
