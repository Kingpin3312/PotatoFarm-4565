import { normalisePhone } from "@/lib/phone";
import { referenceCandidates, type MentionedPortal } from "./mention";

/**
 * A portal's "you have a new lead" email, read into an enquiry.
 *
 * ## Why this exists
 *
 * Every portal emails the brokerage when somebody fills in its contact
 * form, and that email was the only place those buyers existed: no
 * Bayut or Dubizzle delivery is connected (each needs the portal's
 * partner documents), so a brokerage on the product typed them in by
 * hand or lost them. A connected mailbox already reads that inbox
 * (`email/sync.ts`), so the email can become the lead.
 *
 * ## What it is sure of, and what it is not
 *
 * **The sender is the only thing that makes an email a portal lead**: a
 * From address on the portal's own domain. Nothing in the subject or the
 * body is trusted to say so, because anyone can write "Bayut" in a
 * subject.
 *
 * **The layout is not known.** No portal publishes its notification
 * format and no sample has been supplied yet, so the reading is generic
 * and conservative: a phone number written the way people write them,
 * the buyer's address from Reply-To or the body (never the portal's own
 * or a no-reply), a "Name:" line, a "Message:" line, and a reference the
 * brokerage actually has. An email with neither a phone number nor an
 * address is not guessed at — the caller puts it on the agent's list,
 * because a lead email that silently became nothing is the failure this
 * product exists to prevent. When real samples arrive this is the one
 * file that changes, as `property-finder.ts` is for its webhook.
 */

const DOMAINS: [MentionedPortal, RegExp][] = [
  ["BAYUT", /(^|\.)bayut\.(com|sa)$/i],
  ["DUBIZZLE", /(^|\.)dubizzle\.(com|ae)$/i],
  ["PROPERTY_FINDER", /(^|\.)propertyfinder\.(ae|com)$/i],
];

/** The portal a From address belongs to, by its domain alone. */
export function portalOfSender(address: string | null | undefined): MentionedPortal | null {
  const domain = (address ?? "").toLowerCase().split("@")[1];
  if (!domain) return null;
  return DOMAINS.find(([, re]) => re.test(domain))?.[0] ?? null;
}

const isPortalOrRobot = (a: string) =>
  !!portalOfSender(a) || /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster)@/i.test(a);

export type LeadEmailFields = {
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  /** Compacted reference candidates, best first; the caller keeps one the brokerage has. */
  refs: string[];
};

/** Plain text from a body that may be HTML. */
export function plainText(body: string): string {
  if (!/<[a-z][\s\S]*>/i.test(body)) return body;
  return body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
}

/** The value written after a label: "Name: Sara" or "Name  Sara" on its own line. */
function labelled(text: string, labels: string): string | undefined {
  const re = new RegExp(`(?:^|\\n)\\s*(?:${labels})\\s*[:\\-–]\\s*([^\\n]{1,300})`, "i");
  const v = re.exec(text)?.[1]?.trim();
  return v || undefined;
}

export function readLeadEmail(m: { subject?: string; body: string; replyTo?: string[] }): LeadEmailFields {
  const text = plainText(m.body).slice(0, 20_000);

  // Labelled first, then any number in the text that reads as one.
  const phoneLine = labelled(text, "phone|mobile|tel|telephone|contact number|phone number|whatsapp");
  let phone = normalisePhone(phoneLine ?? undefined) ?? undefined;
  if (!phone) {
    for (const mt of text.matchAll(/(?:\+|00)\d[\d\s\-()]{7,17}\d|\b0?5\d[\s\-]?\d{3}[\s\-]?\d{4}\b/g)) {
      const p = normalisePhone(mt[0]);
      if (p) { phone = p; break; }
    }
  }

  const fromBody = [...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((x) => x[0].toLowerCase());
  const email = [...(m.replyTo ?? []), ...fromBody].map((a) => a.toLowerCase()).find((a) => !isPortalOrRobot(a));

  const name = labelled(text, "name|full name|client name|customer name|lead name|contact name");
  const message = labelled(text, "message|enquiry|inquiry|comments?|question");
  const refs = referenceCandidates(`${m.subject ?? ""}\n${text}`);
  return {
    name: name?.slice(0, 120),
    phone,
    email,
    message: message?.slice(0, 2000),
    refs,
  };
}
