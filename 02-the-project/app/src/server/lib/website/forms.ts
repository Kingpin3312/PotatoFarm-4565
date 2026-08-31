import { z } from "zod";
import { log } from "@/lib/log";
import { crossTenant } from "@/server/db/client";
import { escapeHtml, headerSafe, sendMail, wrap } from "@/server/lib/mail";

/**
 * The two public forms on the marketing site: book a call, and send me
 * the next guide.
 *
 * These are the only endpoints in the product an unauthenticated
 * stranger can reach that do work, so everything here is about the
 * difference between a brokerage owner and a script.
 */

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export const demoRequest = z.object({
  name: z.string().trim().min(2, "Please give us your full name.").max(80),

  company: z.string().trim().min(2, "Which brokerage are you with?").max(120),

  // E.164. UAE mobiles are +9715XXXXXXXX, but brokerages here are run by
  // people from everywhere, so we accept any valid international number
  // rather than turning away a Saudi or British owner at the first hurdle.
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Include the country code, like +971 50 123 4567."),

  email: z.string().trim().toLowerCase().email("That doesn't look like a working email address."),

  teamSize: z.enum(["solo", "2-10", "11-50", "50+"]),

  message: z.string().trim().max(1000).optional(),

  // Must be true. An unticked box is a refusal, not a validation error
  // to be talked around.
  consent: z.literal(true, {
    errorMap: () => ({ message: "We need your permission before we can call you." }),
  }),

  /**
   * **The honeypot must pass validation.** It was `.max(0)`, which looks
   * like the obvious way to say "this should be empty" and quietly did
   * the opposite of what the route intends.
   *
   * The route validates before it checks the honeypot. With `.max(0)` a
   * filled honeypot failed validation, so the honeypot check was
   * unreachable and the caller got a 422 reading
   * `{"fields":{"website":["String must contain at most 0 character(s)"]}}`
   * — which names the trap and tells whoever wrote the bot precisely
   * which field to leave alone next time.
   *
   * Letting the value through the schema is what makes the intended
   * behaviour — a 200 and a success body — possible. The length cap is
   * only so nobody can post a megabyte into it.
   */
  website: z.string().max(200).optional(),
  startedAt: z.coerce.number().optional(),
});

export type DemoRequest = z.infer<typeof demoRequest>;

export const subscribeRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  /**
   * Which guide they were reading. The only segmentation worth having:
   * somebody who came from the AML piece wants different things from
   * somebody who came from the WhatsApp one.
   */
  from: z.string().trim().max(60).optional(),
  /** The honeypot. A human never sees this field. */
  company: z.string().max(200).optional(),
});

/** Where the lead came from. Carried through to the notification. */
export const leadSource = z.object({
  path: z.string().optional(),
  referrer: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Spam                                                                */
/* ------------------------------------------------------------------ */

/**
 * Two checks, both invisible to a real person, plus the rate limit the
 * routes apply before either.
 *
 * There was a third — Cloudflare Turnstile — and it has gone. No
 * Turnstile widget was ever put on the page, so `site.js` never sent a
 * token, so `verifyTurnstile` read a key that was not set, logged
 * "captcha check skipped" and returned true. It was a config variable, a
 * log line and forty lines of code that could not do anything. Add it
 * back the day the widget goes on the form and not before.
 */

/** A field hidden from people, irresistible to bots. */
export function trippedHoneypot(value?: string) {
  return typeof value === "string" && value.length > 0;
}

/**
 * Nobody fills in five fields in under three seconds. We reject
 * implausibly fast, never slow — someone who wanders off mid-form and
 * comes back an hour later is a real lead, not a bot.
 */
export function tooFast(startedAt?: number, minMs = 3000) {
  if (!startedAt) return false;
  const elapsed = Date.now() - startedAt;
  return elapsed >= 0 && elapsed < minMs;
}

/* ------------------------------------------------------------------ */
/* What happens to a demo request                                      */
/* ------------------------------------------------------------------ */

export type Lead = DemoRequest & {
  id: string;
  receivedAt: string;
  ip: string;
  userAgent: string;
  source: Record<string, string | undefined>;
};

/**
 * Two emails: one to whoever answers the phone, one to the person who
 * asked.
 *
 * There were four. The other two posted to `CRM_ENDPOINT` and
 * `LEAD_WEBHOOK_URL` — an external CRM and a generic webhook, neither of
 * which exists, both configured by variables nothing set. A fan-out to
 * two unset URLs is not resilience, it is two `if (!url) return` guards
 * and a `Promise.allSettled` that always settles.
 *
 * The email goes to a person who reads it. That is the whole system, and
 * at one demo request a day it is the correct amount of machinery. When
 * PotatoFarm runs its own sales on PotatoFarm, this writes a Lead row and
 * the assistant answers it — which will be a good day, and is not today.
 *
 * Never awaited by the caller in a way that can fail the request: the
 * person asked for a call, and Resend having a bad afternoon is our
 * problem, not theirs.
 */
export async function dispatchLead(lead: Lead) {
  /**
   * **The row is written before either email is attempted.**
   *
   * This function used to be two emails and a `log.error`, and the
   * comment above it argued that at one demo request a day an email to
   * a person who reads it is the correct amount of machinery. That was
   * true, and it stopped being true the moment demos started: this is
   * the only path in the product that produces revenue, and an unset
   * `RESEND_API_KEY`, an expired sending domain or a bad afternoon at
   * the provider meant the enquiry did not exist anywhere.
   *
   * `crossTenant` because there is no tenant — the person filling in
   * this form is not a customer yet, which is the whole point of the
   * form. It is the same reason `RateLimitHit` is unscoped.
   */
  await recordWebsiteLead("DEMO", {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    teamSize: lead.teamSize,
    message: lead.message,
    source: lead.source,
    ip: lead.ip,
    userAgent: lead.userAgent,
  });

  const results = await Promise.allSettled([emailTeam(lead), emailLead(lead)]);

  /**
   * **A fulfilled promise is not a delivered email.**
   *
   * `sendMail` returns `false` when there is no API key rather than
   * throwing, so `allSettled` reports both of these as fulfilled and
   * `failed.length` was 0 — this function then stamped `emailedAt` on
   * an enquiry nobody had been told about, which is the exact failure
   * the row was added to prevent. It was found by `check:website-lead`
   * asserting the unhappy path rather than the happy one.
   *
   * So a send counts only when it both settled *and* returned true.
   */
  const failed = results.filter(
    (r) => r.status === "rejected" || r.value === false,
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      // Logged with the id so a failed delivery can be traced and sent
      // again by hand rather than quietly disappearing.
      log.error(`[demo] ${["team email", "lead email"][i]} failed`, {}, {
        leadId: lead.id,
        reason: String(r.reason),
      });
    }
  });

  /**
   * `emailedAt` is set only when **both** went. A half-delivered
   * enquiry — the customer thanked, nobody on our side told — is the
   * one that looks handled and is not, so it stays unstamped and the
   * sweep picks it up.
   */
  await settleWebsiteLead(
    lead.id,
    failed.length === 0,
    failed
      .map((r) =>
        r.status === "rejected"
          ? String(r.reason)
          : "mail is not configured — RESEND_API_KEY is unset",
      )
      .join(" | "),
  );
}

/** Written before delivery is attempted. Never throws into the request. */
async function recordWebsiteLead(
  kind: "DEMO" | "SUBSCRIBE",
  row: {
    id: string; name?: string | null; email: string; phone?: string | null;
    company?: string | null; teamSize?: string | null; message?: string | null;
    source?: unknown; ip?: string | null; userAgent?: string | null;
  },
) {
  try {
    await crossTenant("pre-tenant").websiteLead.create({
      data: {
        id: row.id,
        kind,
        name: row.name ?? null,
        email: row.email,
        phone: row.phone ?? null,
        company: row.company ?? null,
        teamSize: row.teamSize ?? null,
        message: row.message ?? null,
        source: (row.source ?? undefined) as never,
        ip: row.ip ?? null,
        userAgent: row.userAgent ?? null,
      },
    });
  } catch (err) {
    /**
     * A database that is down must not cost us the enquiry either, so
     * this is caught and the emails still go. Logged at error because
     * it means the durable half of this is not working — the opposite
     * failure from the one this function was written to fix, and just
     * as silent if nobody says so.
     */
    log.error("[website] could not record the enquiry", {}, {
      leadId: row.id, reason: String(err),
    });
  }
}

async function settleWebsiteLead(id: string, delivered: boolean, error: string) {
  try {
    await crossTenant("pre-tenant").websiteLead.update({
      where: { id },
      data: {
        emailedAt: delivered ? new Date() : null,
        emailError: delivered ? null : error.slice(0, 2000),
      },
    });
  } catch {
    // The row either does not exist (the create above failed and said
    // so) or the database is still down. Both are already reported.
  }
}

/** The guide subscribers, same durability, far less machinery. */
export async function recordSubscriber(args: {
  id: string; email: string; from?: string; ip?: string | null; userAgent?: string | null;
}) {
  await recordWebsiteLead("SUBSCRIBE", {
    id: args.id,
    email: args.email,
    source: args.from ? { from: args.from } : undefined,
    ip: args.ip,
    userAgent: args.userAgent,
  });
  return args.id;
}

/** Called by the subscribe route once the guide has actually gone. */
export async function settleSubscriber(id: string, delivered: boolean, error = "") {
  await settleWebsiteLead(id, delivered, error);
}

function emailTeam(lead: Lead) {
  const rows = [
    ["Name", lead.name],
    ["Brokerage", lead.company],
    ["WhatsApp", lead.phone],
    ["Email", lead.email],
    ["Team size", lead.teamSize],
    ["Message", lead.message || "—"],
    ["Source", lead.source.utm_source ?? lead.source.referrer ?? "direct"],
    ["Received", lead.receivedAt],
  ]
    .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");

  return sendMail({
    // The fallback has to be an address that exists, because this is the
    // one carrying the actual lead.
    to: process.env.SALES_INBOX ?? "hello@potatofarm.io",
    // The subject carries the two things that decide who picks it up.
    subject: `Demo request — ${headerSafe(lead.company)} (${lead.teamSize})`,
    html: wrap(`<h2 style="margin:0 0 16px;font-size:20px">New demo request</h2>`
      + `<table style="border-collapse:collapse;font-size:15px">${rows}</table>`
      + `<p style="margin:16px 0 0;color:#6B6B6B;font-size:13px">Lead ${lead.id}</p>`),
    // Reply goes straight to them rather than to the shared inbox.
    replyTo: lead.email,
  });
}

function emailLead(lead: Lead) {
  // Short, human, and it says exactly what happens next. No branding
  // essay, no "we're excited". They asked for a call, not a newsletter.
  return sendMail({
    to: lead.email,
    subject: "We've got your request",
    html: wrap(
      `<p style="margin:0 0 16px">Hello ${escapeHtml(lead.name.split(" ")[0] ?? "there")},</p>` +
        `<p style="margin:0 0 16px">Thanks for getting in touch. We'll message you on ` +
        `WhatsApp within the hour during working hours, and first thing otherwise.</p>` +
        `<p style="margin:0 0 16px">When we speak we'll use your own leads rather than a ` +
        `rehearsed demo, so it helps if you have last month's enquiries to hand.</p>` +
        `<p style="margin:0">Speak soon.</p>`,
      { preheader: "We'll message you on WhatsApp within the hour." }
    ),
  });
}

/* ------------------------------------------------------------------ */
/* What happens to a guide subscription                                */
/* ------------------------------------------------------------------ */

/**
 * A guide reader who leaves an email is the most qualified lead this
 * site produces — they have the problem, they read 300 words about it,
 * and they want the next one.
 */
export async function sendGuideFollowUp(email: string, from?: string) {
  await sendMail({
    to: email,
    subject: subjectFor(from),
    html: wrap(bodyFor(from)),
    // Every send carries it. A one-click unsubscribe is what the form
    // promised and it is what stops a mailbox provider deciding we are
    // the kind of sender who ignores that.
    headers: { "List-Unsubscribe": "<mailto:stop@potatofarm.io>" },
  });

  // Disposable domains are recorded, never blocked. Somebody using a
  // burner to read a compliance guide may still become a customer, and
  // refusing them teaches us nothing.
  if (/@(mailinator|guerrillamail|10minutemail|tempmail)\./i.test(email)) {
    log.info("[subscribe] disposable address", {}, { from: from ?? "unknown" });
  }
}

/** What they actually asked for, not a welcome sequence. */
function subjectFor(from?: string) {
  switch (from) {
    case "whatsapp-24-hour-window": return "The 24-hour window, on one page";
    case "trakheesi-permits":       return "Trakheesi renewals, on one page";
    case "uae-aml-for-brokerages":  return "AML for brokerages, on one page";
    default:                        return "The next guide, when it's written";
  }
}

function bodyFor(from?: string) {
  const sign =
    `<p>— PotatoFarm.io<br>One a month, roughly. Reply 'stop' and that's the end of it.</p>`;
  if (!from || from === "guides") {
    return (
      `<p>Thanks for reading.</p><p>We'll send the next guide when it's written — likely ` +
      `on service charges and NOCs, which is the one that costs brokerages the most ` +
      `weeks.</p>` + sign
    );
  }
  return (
    `<p>Thanks for reading. The one-page version is attached, and we'll send the next ` +
    `guide when it's written.</p>` + sign
  );
}
