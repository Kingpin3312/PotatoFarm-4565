import { normalisePhone } from "@/lib/phone";

/**
 * What a buyer typed into the enquiry form on a brokerage's page.
 *
 * Kept away from the database so the rules can be tested on their own.
 * A form a stranger can post to is a form a script can post to, so the
 * reading is strict about shape and lenient about how people write:
 * "050 123 4567" is a phone number; a name of four hundred characters or
 * a message with a link in it is not an enquiry.
 *
 * `website` is the honeypot — a field hidden from people, which only a
 * form-filling script fills in. A filled one is answered exactly like a
 * success and recorded as nothing, so the script learns nothing.
 */
export type EnquiryForm = {
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  reference: string | null;
};

export type ReadForm =
  | { ok: true; form: EnquiryForm }
  | { ok: false; reason: "bot" }
  | { ok: false; reason: "invalid"; problem: string };

/**
 * Everything the form can say is wrong, as fixed sentences. The page shows
 * a problem only if it is one of these, so a crafted link cannot put
 * somebody else's words on a brokerage's page.
 */
export const PROBLEMS = {
  NAME: "Please tell us your name.",
  NAME_LONG: "That name is too long.",
  PHONE: "That phone number doesn't look right. Include the country code if it isn't a UAE number.",
  EMAIL: "That email address doesn't look right.",
  CONTACT: "Please leave a phone number or an email address, so we can reply.",
  LINKS: "Please leave out links — just tell us what you're looking for.",
  BUSY: "We've had several messages from you just now. Give it a few minutes, or message us on WhatsApp.",
} as const;
export const isKnownProblem = (text: string) => (Object.values(PROBLEMS) as string[]).includes(text);

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export function readEnquiryForm(data: Record<string, string | undefined>): ReadForm {
  if ((data.website ?? "").trim()) return { ok: false, reason: "bot" };
  const name = (data.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, reason: "invalid", problem: PROBLEMS.NAME };
  if (name.length > 120) return { ok: false, reason: "invalid", problem: PROBLEMS.NAME_LONG };

  const rawPhone = (data.phone ?? "").trim();
  const phone = rawPhone ? normalisePhone(rawPhone) : null;
  if (rawPhone && !phone) return { ok: false, reason: "invalid", problem: PROBLEMS.PHONE };
  const rawEmail = (data.email ?? "").trim().toLowerCase();
  const email = rawEmail && EMAIL.test(rawEmail) ? rawEmail : null;
  if (rawEmail && !email) return { ok: false, reason: "invalid", problem: PROBLEMS.EMAIL };
  if (!phone && !email) return { ok: false, reason: "invalid", problem: PROBLEMS.CONTACT };

  const message = (data.message ?? "").trim().slice(0, 2000) || null;
  // Links are the signature of spam on a form like this, and a buyer
  // asking about a property never needs one.
  if (message && /https?:\/\/|www\./i.test(message)) return { ok: false, reason: "invalid", problem: PROBLEMS.LINKS };

  const reference = (data.reference ?? "").trim().slice(0, 40) || null;
  return { ok: true, form: { name, phone, email, message, reference } };
}
