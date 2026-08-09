import { log, report } from "@/lib/log";
import { aedToFils } from "@/lib/money";
import { forOrg } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { messagingWindow, sendText } from "@/server/lib/whatsapp";
import { recordAnswered } from "@/server/lib/billing/conversations";
import { getChannelCredentials } from "@/server/lib/secrets";
import { buildSystemPrompt, PROMPT_VERSION, type GenerationTrace } from "./prompt";
import { screenInbound, screenOutbound } from "./guardrails";
import { extraction, sane, needsConfirmation } from "./extract";
import { HANDOVER_TRIGGERS, type HandoverReason } from "./policy";
import { gate, isMuted, record } from "./controls";

const MODEL = process.env.ASSISTANT_MODEL ?? "claude-sonnet-4-6";

/**
 * One turn of the assistant.
 *
 * Ordered so that the cheap, certain checks happen before the expensive,
 * uncertain one. Most handovers never reach the model at all.
 */
export async function respond(orgId: string, conversationId: string) {
  const db = forOrg(orgId);
  const started = Date.now();

  // 0. Controls first, before any query and certainly before any model
  //    call. Fails closed — see controls.ts.
  const control = await gate(orgId);
  if (!control.allowed) {
    // Budget exhaustion hands the conversation to a person rather than
    // leaving the lead unanswered. An overspend is a billing conversation;
    // an ignored buyer is a lost one.
    if (control.reason === "budget_exhausted") {
      return handover(db, orgId, conversationId, "low_confidence", control.detail);
    }
    return { sent: false, reason: `blocked:${control.reason}` };
  }

  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, channelId: true, humanHandover: true, lastInboundAt: true,
      lead: {
        select: {
          id: true, phone: true, name: true, language: true, budgetMaxFils: true,
          assignedTo: { select: { name: true } },
          enquiries: {
            take: 1, orderBy: { createdAt: "desc" },
            select: { listing: true },
          },
        },
      },
      messages: {
        take: 20, orderBy: { sentAt: "desc" },
        select: { body: true, direction: true, author: true },
      },
      org: { select: { name: true } },
    },
  });
  if (!convo) return { sent: false, reason: "no_conversation" };

  // 1. A human already has it. The assistant does not "assist" alongside
  //    them — it is silent until released.
  if (convo.humanHandover) return { sent: false, reason: "handover_active" };

  // 2. Outside Meta's 24-hour window nothing free-form sends. Attempting
  //    it produces an accepted request and an undelivered message, which
  //    is the worst possible outcome.
  if (!messagingWindow(convo.lastInboundAt).open) {
    return { sent: false, reason: "window_closed" };
  }

  const history = convo.messages.slice().reverse();
  const lastInbound = history.filter((m) => m.direction === "INBOUND").at(-1);
  if (!lastInbound) return { sent: false, reason: "nothing_to_reply_to" };

  // 3. Cheap screening. Injection, complaints, negotiation, regulated
  //    questions and explicit requests never reach the model.
  const screened = screenInbound(lastInbound.body);
  if (screened) return handover(db, orgId, convo.id, screened);

  const profile = await db.qualificationProfile.findFirst({
    where: { active: true },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!profile) return handover(db, orgId, convo.id, "low_confidence");

  const listing = convo.lead.enquiries[0]?.listing ?? null;

  /**
   * The price, in dirhams, as a plain digit string.
   *
   * The column is `priceFils`. The prompt block is labelled `price_aed`
   * and the model is expected to quote dirhams. Both the prompt and the
   * fact set have to be in the same unit as each other or the guardrail
   * turns on the assistant:
   *
   * `screenOutbound` strips every non-digit from each figure in the draft
   * and rejects the message if the result is not in `facts`. Told
   * "price_aed: 2500000" the model writes "AED 2,500,000", which reduces
   * to "2500000". A fact set built from fils holds "250000000", the two
   * never match, and every correctly-priced reply is discarded as an
   * invented figure — an assistant that goes silent on the one question
   * every buyer asks first.
   *
   * The previous line read `listing.price`, a Decimal column removed when
   * money became fils, so this could not run at all.
   */
  const priceAed = listing?.priceFils != null ? (listing.priceFils / 100n).toString() : null;

  // 4. The fact set. Anything the model writes that is not in here is
  //    treated as invented — see screenOutbound.
  const facts = new Set(
    [
      priceAed,
      listing?.areaSqft?.toString(),
      listing?.bedrooms?.toString(),
      listing?.bathrooms?.toString(),
    ].filter(Boolean) as string[]
  );

  const system = buildSystemPrompt({
    brokerage: convo.org.name,
    agentName: convo.lead.assignedTo?.name ?? null,
    questions: profile.questions.map((q) => ({ key: q.key, prompt: q.prompt, required: q.required })),
    // Built explicitly rather than passed through as `any`. The cast was
    // hiding the fact that the row and the prompt's Listing type disagree
    // about both the name and the unit of the price.
    listing: listing && {
      reference: listing.reference,
      title: listing.title,
      community: listing.community,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      areaSqft: listing.areaSqft,
      price: priceAed,
      purpose: listing.purpose as "SALE" | "RENT",
      status: listing.status,
    },
    language: convo.lead.language ?? "en",
    tone: profile.tone,
  });

  // 5. Generate. The lead's text goes in as a user turn — never
  //    concatenated into the system prompt, which is what makes injection
  //    a content problem rather than an instruction problem.
  let draft: string;
  let trace: GenerationTrace;
  try {
    const t0 = Date.now();
    const res = await callModel(system, history);
    draft = res.text;
    trace = {
      promptVersion: PROMPT_VERSION,
      model: MODEL,
      listingRef: listing?.reference ?? null,
      questionKeys: profile.questions.map((q) => q.key),
      latencyMs: Date.now() - t0,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    };
  } catch (err) {
    // A model outage must not leave a lead unanswered and unowned.
    report(err, { orgId }, { conversationId: convo.id, stage: "generation" });
    /**
     * The billable event.
     *
     * Recorded here and nowhere else — after the message actually left,
     * not when the model was called. A reply that failed to send is a
     * reply the brokerage did not get, and charging for it would be
     * charging for our own failure.
     *
     * Deduplicated by a unique constraint on (conversation, day), so a
     * buyer messaging six times in an afternoon is one charge.
     */
    await recordAnswered({ orgId, conversationId: convo.id });

    await record({
      orgId, conversationId: convo.id, purpose: "reply", model: MODEL,
      promptVersion: PROMPT_VERSION, inputTokens: 0, outputTokens: 0,
      latencyMs: Date.now() - started, outcome: "error",
    });
    return handover(db, orgId, convo.id, "low_confidence");
  }

  // 6. Screen what came back. A failed check is a handover, never a
  //    silent retry — an assistant that quietly rewrites its own
  //    hallucinations is harder to trust than one that stops.
  const checked = screenOutbound(draft, facts);
  if (!checked.ok) {
    log.warn(`[assistant] draft rejected: ${checked.reason}`);
    // A blocked draft still cost money. Recording only successes gives a
    // ledger that under-reports exactly when something is going wrong.
    /**
     * The billable event.
     *
     * Recorded here and nowhere else — after the message actually left,
     * not when the model was called. A reply that failed to send is a
     * reply the brokerage did not get, and charging for it would be
     * charging for our own failure.
     *
     * Deduplicated by a unique constraint on (conversation, day), so a
     * buyer messaging six times in an afternoon is one charge.
     */
    await recordAnswered({ orgId, conversationId: convo.id });

    await record({
      orgId, conversationId: convo.id, purpose: "reply", model: MODEL,
      promptVersion: PROMPT_VERSION,
      inputTokens: trace.inputTokens ?? 0, outputTokens: trace.outputTokens ?? 0,
      latencyMs: trace.latencyMs, outcome: "blocked",
    });
    return handover(db, orgId, convo.id, checked.handover, checked.reason);
  }

  // 7. Send, then record. Recorded either way — a message that left
  //    without a row is a message nobody can account for.
  const creds = await getChannelCredentials(orgId, convo.channelId);
  const { externalId } = await sendText({
    phoneNumberId: creds.phoneNumberId,
    accessToken: creds.accessToken,
    to: convo.lead.phone.replace("+", ""),
    body: checked.text,
  });

  await db.message.create({
    data: {
      orgId,
      conversationId: convo.id,
      direction: "OUTBOUND",
      author: "ASSISTANT",
      body: checked.text,
      externalId,
      status: "SENT",
    },
  });

  await record({
    orgId, conversationId: convo.id, purpose: "reply", model: MODEL,
    promptVersion: PROMPT_VERSION,
    inputTokens: trace.inputTokens ?? 0, outputTokens: trace.outputTokens ?? 0,
    latencyMs: trace.latencyMs, outcome: "sent",
  });

  // 8. Extraction runs separately, and never blocks the reply. The lead
  //    has their answer before any of this happens.
  void extractAndStore(db, orgId, convo.lead.id, profile.id, history, checked.text);

  return { sent: true, latencyMs: Date.now() - started, trace };
}

async function handover(
  db: ReturnType<typeof forOrg>,
  orgId: string,
  conversationId: string,
  reason: HandoverReason,
  detail?: string
) {
  await db.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        humanHandover: true,
        handoverAt: new Date(),
        handoverReason: detail ? `${HANDOVER_TRIGGERS[reason]} (${detail})` : HANDOVER_TRIGGERS[reason],
        unreadCount: { increment: 1 },
      },
    });
    // actorId null means the system did it — audit() has no actorType
    // field, and the `as any` that used to be here was hiding that.
    await audit(tx, orgId, {
      actorId: null,
      action: "assistant.handover",
      entity: "Conversation",
      entityId: conversationId,
      after: { reason, detail },
    });
  });
  return { sent: false, reason: `handover:${reason}` };
}

async function extractAndStore(
  db: ReturnType<typeof forOrg>,
  orgId: string,
  leadId: string,
  profileId: string,
  history: { body: string; direction: string }[],
  latest: string
) {
  try {
    const raw = await callExtractor([...history, { body: latest, direction: "OUTBOUND" }]);
    const parsed = sane(extraction.parse(raw));
    const unsure = needsConfirmation(parsed);

    await db.lead.update({
      where: { id: leadId },
      data: {
        /**
         * The extractor works in dirhams — `sane()` bounds it to
         * 50,000–500,000,000, which is only a plausible range for AED.
         * The columns are fils. `aedToFils` is the one conversion and
         * money.ts marks this exact case as where it belongs: "only at a
         * boundary — an import, or a person typing a number".
         *
         * These were written straight into `budgetMin` / `budgetMax`,
         * columns that no longer exist. Renaming them without converting
         * would have stored every budget at a hundredth of its value and
         * quietly excluded leads from every match they should have won.
         */
        budgetMinFils: parsed.budgetMin === null ? undefined : aedToFils(parsed.budgetMin),
        budgetMaxFils: parsed.budgetMax === null ? undefined : aedToFils(parsed.budgetMax),
        intent: parsed.intent ?? undefined,
        timeframe: parsed.timeframe ?? undefined,
        financing: parsed.financing ?? undefined,
        // Surfaced on the lead card rather than buried. An agent seeing
        // "budget: 2.5M (low confidence)" asks; an agent seeing "2.5M"
        // plans around it.
        notes: unsure.length ? `Confirm with the lead: ${unsure.join(", ")}` : undefined,
      },
    });
  } catch (err) {
    // Extraction failing is a degraded lead record, not a failed
    // conversation. Never let it surface to the person messaging.
    report(err, { orgId }, { leadId, stage: "extraction" });
  }
}

/* -------------------------------------------------------------------- */
/* Model calls. Kept behind two small functions so the provider can be    */
/* swapped without touching any of the logic above.                       */
/* -------------------------------------------------------------------- */

/**
 * Exported so the agent-request classifier uses this path rather than
 * opening a second one. Two routes to a provider is two places to
 * forget the kill switch — callers must still call `gate()` first.
 */
export async function callModel(system: string, history: { body: string; direction: string }[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: history.map((m) => ({
        role: m.direction === "INBOUND" ? "user" : "assistant",
        content: m.body,
      })),
    }),
    // The product promise is a reply in seconds. Past this, a handover is
    // a better outcome than a late message.
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`model ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return {
    text: (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim(),
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}

async function callExtractor(history: { body: string; direction: string }[]): Promise<unknown> {
  const transcript = history
    .map((m) => `${m.direction === "INBOUND" ? "Lead" : "Assistant"}: ${m.body}`)
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system:
        "Extract what the lead has actually said about their requirements. " +
        "Return JSON only, no prose and no code fences. Use null for anything " +
        "not stated — never infer, never fill a gap with a plausible value. " +
        "Give a confidence between 0 and 1 for each field you populate. " +
        "Ignore anything about nationality, religion, ethnicity, gender or " +
        "marital status entirely; do not record it in any field.",
      messages: [{ role: "user", content: transcript }],
    }),
    signal: AbortSignal.timeout(8000),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`extractor ${res.status}`);

  const data = await res.json();
  const text = (data.content ?? []).map((b: any) => b.text ?? "").join("");
  // The model can return something that is not JSON — a refusal, a
  // preamble, a truncated response. An unhandled throw here is the worst
  // failure in the product: the customer gets no reply and there is no
  // record of why.
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}
