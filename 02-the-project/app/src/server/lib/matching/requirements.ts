import type { RequirementSource } from "@prisma/client";

/**
 * Requirements, and how much to trust them.
 *
 * The rule that matters, and it links back to the extraction work:
 *
 *   **A requirement the assistant guessed does not trigger an outbound
 *   message.**
 *
 * The extractor already records a confidence per field, and anything
 * under 0.7 is flagged rather than treated as fact. Proactive contact is
 * a higher bar than an internal note, because getting it wrong means
 * messaging somebody about a property they never asked for — which is the
 * exact behaviour that gets a WhatsApp number reported.
 *
 * So: an agent-entered or explicitly-stated requirement can drive
 * outreach. An inferred one has to be confirmed first, and until then it
 * only appears on the lead's file for a human to look at.
 */

export const OUTREACH_CONFIDENCE_FLOOR = 0.85;

export function canDriveOutreach(r: {
  source: RequirementSource;
  confidence: number | null;
  confirmedAt: Date | null;
  active: boolean;
  expiresAt: Date | null;
}) {
  if (!r.active) return { ok: false, reason: "requirement is not active" };
  if (r.expiresAt && r.expiresAt < new Date()) return { ok: false, reason: "requirement has expired" };

  // A person put it there, or a person checked it. Either is enough.
  if (r.source === "AGENT" || r.confirmedAt) return { ok: true };

  if (r.source === "LEAD") return { ok: true };

  // Inferred. Needs to be very confident indeed, and even then this is
  // the one place a wrong guess is visible to the customer.
  if ((r.confidence ?? 0) >= OUTREACH_CONFIDENCE_FLOOR) return { ok: true };

  return {
    ok: false,
    reason: `inferred at ${((r.confidence ?? 0) * 100).toFixed(0)}% — needs an agent to confirm before we message them`,
  };
}

/**
 * How long a requirement stays live.
 *
 * Shorter than feels natural, deliberately. Somebody who was looking six
 * months ago has usually bought, and messaging them about a property is a
 * message that says nobody here has been paying attention.
 */
export function defaultExpiry(intent: string | null, from = new Date()) {
  const months = intent === "RENT" ? 2 : 4;
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Refreshed whenever the lead says anything, because they are still looking. */
export function refresh(expiresAt: Date | null, intent: string | null) {
  return defaultExpiry(intent);
}
