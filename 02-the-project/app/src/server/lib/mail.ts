import { log } from "@/lib/log";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

/**
 * One place that talks to Resend.
 *
 * There were three: this file, the website's demo route and the
 * website's subscribe route, each with its own `from` fallback. Two of
 * those fallbacks pointed at `potato.ai`, a domain nobody owns — so an
 * unset MAIL_FROM meant an unverified sender and every message rejected
 * on SPF, visible only in a log nobody was reading.
 *
 * Returns rather than throws when the key is absent. A brokerage running
 * a pilot with no Resend account should not have sign-up fail; it should
 * have the log say why the email did not arrive.
 */
export async function sendMail(msg: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.warn("[mail] RESEND_API_KEY not set — email not sent", {}, { subject: msg.subject });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "PotatoFarm.io <hello@potatofarm.io>",
      to: msg.to,
      subject: headerSafe(msg.subject),
      html: msg.html,
      reply_to: msg.replyTo,
      headers: msg.headers,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/**
 * Strip anything that could break out of a header line.
 *
 * A subject is assembled from a brokerage name somebody typed. A newline
 * in it is header injection.
 */
export function headerSafe(s: string) {
  return s.replace(/[\r\n]+/g, " ").slice(0, 120);
}

export async function sendInvite({
  to, token, orgName,
}: { to: string; token: string; orgName: string }) {
  // The token appears here and nowhere else. It is not logged, not stored
  // in plaintext, and not returned to the caller who created it.
  const link = `${APP_URL}/invite?token=${encodeURIComponent(token)}`;

  await sendMail({
    to,
    subject: `${orgName} has added you to PotatoFarm.io`,
    html:
      `<p>You've been added to <strong>${escapeHtml(orgName)}</strong> on PotatoFarm.io.</p>` +
      `<p><a href="${link}">Open PotatoFarm.io</a></p>` +
      `<p>The link works for seven days. If you weren't expecting this, ignore it — ` +
      `nothing happens until you open it.</p>`,
  });
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
