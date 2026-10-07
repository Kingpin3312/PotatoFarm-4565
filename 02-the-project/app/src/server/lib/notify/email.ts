import { crossTenant } from "@/server/db/client";
import { escapeHtml, sendMail, wrap } from "@/server/lib/mail";
import { log } from "@/lib/log";

/**
 * "Email me as well", which until this existed was a checkbox that
 * saved and did nothing.
 *
 * `NotificationPrefs.email` was written by the Me page, read by the
 * dispatcher in exactly one place — `if (!p.push && !p.email) continue`
 * — and never acted on. So an agent who turned push off and email on, to
 * hear about leads at a desk, was told about nothing at all, by any
 * route, while the setting said otherwise.
 *
 * The same alert as the phone gets: the title, the line under it, and a
 * button to the page it is about. Sent to the person's own sign-in
 * address, which is the only one this product holds for them.
 */

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

/** A path inside the app, or Today. A link in an email is never another site. */
function safePath(p: string) {
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/today";
}

/** Whether it was handed to the mail service. Never throws. */
export async function sendAlertEmail(userId: string, msg: { title: string; body: string; deeplink: string }) {
  const user = await crossTenant("sweep").user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return false;
  const href = `${APP_URL()}${safePath(msg.deeplink)}`;
  try {
    return await sendMail({
      to: user.email,
      subject: msg.title,
      html: wrap(
        `<p style="margin:0 0 8px;font-size:19px;font-weight:600;color:#171717">${escapeHtml(msg.title)}</p>` +
          (msg.body ? `<p style="margin:0 0 20px;color:#4A4A4A">${escapeHtml(msg.body)}</p>` : "") +
          `<p style="margin:0 0 20px"><a href="${escapeHtml(href)}" style="display:inline-block;` +
          `background:#FF1493;border:1px solid #FF1493;color:#FFFFFF;text-decoration:none;` +
          `font-weight:600;padding:12px 20px;border-radius:8px">Open in PotatoFarm.io</a></p>` +
          `<p style="margin:0;font-size:13px;color:#6B6B6B">You asked for alerts by email as well. ` +
          `Change it under Mine → When not to buzz you.</p>`,
        { preheader: msg.body.slice(0, 120) },
      ),
    });
  } catch (e) {
    log.warn("alert email not sent", { userId }, { reason: (e as Error).message.slice(0, 120) });
    return false;
  }
}
