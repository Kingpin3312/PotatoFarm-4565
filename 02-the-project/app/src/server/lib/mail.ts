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
 * The brand, around every message that goes to a person.
 *
 * Four emails leave this product and all four were bare `<p>` fragments
 * — no wordmark, no ground, no footer. A brokerage owner's first sight
 * of PotatoFarm.io was an unstyled paragraph from an address they did
 * not recognise, which is the one email in the sequence that most needs
 * to look like it came from a company.
 *
 * ## Why the mark is an image and the word is not
 *
 * Most clients block remote images until the reader allows them, and a
 * good number strip SVG entirely. So the potato is a hosted PNG that
 * degrades to its `alt` text, and **"PotatoFarm.io" is live text in the
 * brand navy** — which renders whether images load or not. A lockup
 * shipped as one image is a lockup that is invisible in Outlook with
 * remote content off, which is the default.
 *
 * Everything is inline-styled on tables. Email clients have no
 * stylesheet, no custom properties and, in Outlook's case, no flexbox,
 * so the tokens are resolved here rather than referenced.
 */
const NAVY = "#12202E";
const ORANGE = "#E86A2C";
const GROUND = "#FFFFFF";

export function wrap(body: string, opts: { preheader?: string } = {}) {
  return (
    `<!doctype html><html lang="en-GB"><body style="margin:0;padding:0;` +
    `background:${GROUND};font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif;">` +
    // The line the inbox shows beside the subject. Without one, clients
    // pull the first words of the body, which is usually "Hello".
    (opts.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>`
      : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="background:${GROUND};padding:32px 16px"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="max-width:560px;background:#FFFFFF;border-radius:14px;padding:32px">` +
    // The lockup as a two-cell row, not an image beside a span.
    //
    // Inline layout put the potato on one line and the word on the
    // next, and that is the good case — Outlook uses Word to lay out
    // HTML and will not honour inline-block at all. Two table cells is
    // the only construction that holds the mark and the wordmark on one
    // line in every client, which is why every email in the world is
    // built out of tables.
    `<tr><td style="padding-bottom:24px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="padding-right:10px;line-height:0">` +
    `<img src="${APP_URL}/icon-192.png" width="34" height="34" alt="" border="0" ` +
    `style="display:block;border:0" /></td>` +
    `<td style="font-size:19px;font-weight:600;letter-spacing:-.02em;color:${NAVY};` +
    `white-space:nowrap">PotatoFarm<span style="color:${ORANGE};font-weight:500">.io</span></td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="font-size:16px;line-height:1.55;color:#171717">${body}</td></tr>` +
    `<tr><td style="padding-top:28px;border-top:1px solid #E7E5E2;font-size:13px;color:#6B6B6B">` +
    `PotatoFarm.io — every property enquiry answered in seconds.` +
    `</td></tr></table></td></tr></table></body></html>`
  );
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
    html: wrap(
      `<p style="margin:0 0 16px">You've been added to <strong>${escapeHtml(orgName)}</strong> on PotatoFarm.io.</p>` +
        `<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;` +
        `background:${ORANGE};border:1px solid #E86A2C;color:#171717;text-decoration:none;` +
        `font-weight:600;padding:12px 20px;border-radius:8px">Open PotatoFarm.io</a></p>` +
        `<p style="margin:0;color:#4A4A4A">The link works for seven days. If you weren't ` +
        `expecting this, ignore it — nothing happens until you open it.</p>`,
      { preheader: `${orgName} has added you to their brokerage.` }
    ),
  });
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
