import { log } from "@/lib/log";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function sendInvite({
  to, token, orgName,
}: { to: string; token: string; orgName: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.warn("[mail] RESEND_API_KEY not set — invitation not sent");
    return;
  }

  // The token appears here and nowhere else. It is not logged, not stored
  // in plaintext, and not returned to the caller who created it.
  const link = `${APP_URL}/invite?token=${encodeURIComponent(token)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "PotatoFarm.io <hello@potatofarm.io>",
      to,
      subject: `${orgName.replace(/[\r\n]+/g, " ").slice(0, 80)} has added you to PotatoFarm.io`,
      html:
        `<p>You've been added to <strong>${escapeHtml(orgName)}</strong> on PotatoFarm.io.</p>` +
        `<p><a href="${link}">Open PotatoFarm.io</a></p>` +
        `<p>The link works for seven days. If you weren't expecting this, ignore it — ` +
        `nothing happens until you open it.</p>`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
