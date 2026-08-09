import type { DemoRequest } from "./validation";

export type Lead = DemoRequest & {
  id: string;
  receivedAt: string;
  ip: string;
  userAgent: string;
  source: Record<string, string | undefined>;
};

/**
 * Fan-out. Deliberately not awaited by the request handler — see route.ts.
 *
 * The rule: once a lead is captured, the person gets a success response.
 * A CRM that is having a bad afternoon is our problem, not theirs, and
 * showing them an error would make them submit again or give up.
 */
export async function dispatch(lead: Lead) {
  const results = await Promise.allSettled([
    emailTeam(lead),
    emailLead(lead),
    pushToCrm(lead),
    pushToWebhook(lead),
  ]);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const target = ["team email", "lead email", "CRM", "webhook"][i];
      // Log with the id so a failed delivery can be traced and replayed
      // rather than quietly disappearing.
      console.error(`[notify] ${target} failed for lead ${lead.id}:`, r.reason);
    }
  });
}

/* ---------------- email ---------------- */

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[notify] RESEND_API_KEY not set - email skipped");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "Potato <hello@potato.ai>",
      to,
      subject,
      html,
      reply_to: replyTo,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** Strip anything that could break out of a header line. */
function headerSafe(s: string) {
  return s.replace(/[\r\n]+/g, " ").slice(0, 120);
}

function emailTeam(lead: Lead) {
  const rows = [
    ["Name", lead.name],
    ["Brokerage", lead.company],
    ["WhatsApp", lead.phone],
    ["Email", lead.email],
    ["Team size", lead.teamSize],
    ["Message", lead.message || "-"],
    ["Source", lead.source.utm_source ?? lead.source.referrer ?? "direct"],
    ["Received", lead.receivedAt],
  ]
    .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escape(String(v))}</td></tr>`)
    .join("");

  // Subject line carries the two things that decide who picks it up.
  return send(
    process.env.SALES_INBOX ?? "sales@potato.ai",
    `Demo request - ${headerSafe(lead.company)} (${lead.teamSize})`,
    `<h2>New demo request</h2><table>${rows}</table><p>Lead ${lead.id}</p>`,
    lead.email
  );
}

function emailLead(lead: Lead) {
  // Short, human, and it tells them exactly what happens next. No branding
  // essay, no "we're excited". They asked for a call, not a newsletter.
  return send(
    lead.email,
    "We've got your request",
    `<p>Hello ${escape(lead.name.split(" ")[0])},</p>
     <p>Thanks for getting in touch. We'll message you on WhatsApp within the hour
     during working hours, and first thing otherwise.</p>
     <p>When we speak we'll use your own leads rather than a rehearsed demo, so it
     helps if you have last month's enquiries to hand.</p>
     <p>Speak soon.</p>`
  );
}

/* ---------------- CRM ---------------- */

async function pushToCrm(lead: Lead) {
  const url = process.env.CRM_ENDPOINT;
  const key = process.env.CRM_API_KEY;
  if (!url || !key) return;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      external_id: lead.id,
      full_name: lead.name,
      company: lead.company,
      phone: lead.phone,
      email: lead.email,
      team_size: lead.teamSize,
      note: lead.message,
      // Consent evidence. Under both GDPR and the UAE's PDPL you need to be
      // able to show when consent was given and from where. Storing it at
      // the point of capture is the only way that ever holds up.
      consent_given_at: lead.receivedAt,
      consent_ip: lead.ip,
      ...lead.source,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`CRM ${res.status}: ${await res.text()}`);
}

/* ---------------- generic webhook ---------------- */

async function pushToWebhook(lead: Lead) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Lets the receiver confirm it really came from us.
      "X-Potato-Signature": await sign(lead.id),
    },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Webhook ${res.status}`);
}

async function sign(payload: string) {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
