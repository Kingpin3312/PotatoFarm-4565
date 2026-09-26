import { log, report } from "@/lib/log";
import { endpoint } from "@/server/lib/loopback";
import { aedToFils } from "@/lib/money";
import { forOrg } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { messagingWindow, sendText } from "@/server/lib/whatsapp";
import { recordAnswered } from "@/server/lib/billing/conversations";
import { getChannelCredentials } from "@/server/lib/secrets";
import { buildSystemPrompt, PROMPT_VERSION, type GenerationTrace } from "./prompt";
import { screenInbound, screenOutbound } from "./guardrails";
import { extraction, sane, needsConfirmation, EXTRACTION_SHAPE } from "./extract";
import { requirementFromExtraction } from "@/server/lib/requirements/save";
import { storeAnswers } from "./answers";
import { HANDOVER_TRIGGERS, type HandoverReason } from "./policy";
import { gate, isMuted, record } from "./controls";
import { dispatch } from "@/server/lib/notify/dispatch";
import { isOptOut } from "@/server/lib/matching/outreach";

/**
 * The current Sonnet tier, and it was a generation behind.
 *
 * This said `claude-sonnet-4-6`. Sonnet 5 is both newer and cheaper —
 * $2/$10 per million tokens against $3/$15 — so the move is a quality
 * increase and a bill reduction in the same edit. `pricing.ts` carries
 * both rates; a brokerage that pins the old one through
 * `ASSISTANT_MODEL` is still billed correctly.
 */
const MODEL = process.env.ASSISTANT_MODEL ?? "claude-sonnet-5";

/**
 * Thinking, decided rather than inherited.
 *
 * This is the one thing the migration forces a choice about. Sonnet 4.6
 * did not think unless asked; **Sonnet 5 thinks by default when the
 * request omits the parameter**, so saying nothing here would have
 * silently added reasoning tokens and latency to every reply.
 *
 * Off, for now, because of the budget directly below it: the promise is
 * a reply in seconds, `AbortSignal.timeout(8000)` enforces it, and the
 * failure mode when the model is slow is a **handover** — which is
 * invisible, because a person answering an enquiry looks exactly like a
 * working inbox. That is the failure this codebase has been caught by
 * before, so the migration deliberately changes one thing at a time and
 * keeps today's latency profile.
 *
 * `output_config: { effort: "low" }` with adaptive thinking is the
 * tuning lever to try once there is real traffic to measure against —
 * but it is a change to make with a stopwatch on it, not blind.
 */
const THINKING = { type: "disabled" } as const;

/**
 * One turn of the assistant, up to the point of sending: the controls,
 * the window, the screening, the model and the check of what it wrote.
 *
 * Ordered so that the cheap, certain checks happen before the expensive,
 * uncertain one. Most handovers never reach the model at all. Every
 * refusal and handover happens here, so the two ways of using a reply —
 * sending it, or leaving it for a person — cannot disagree about when
 * there is one.
 */
async function prepare(orgId: string, conversationId: string) {
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
      return { kind: "stopped" as const, result: await handover(db, orgId, conversationId, "low_confidence", control.detail) };
    }
    return { kind: "stopped" as const, result: { sent: false, reason: `blocked:${control.reason}` } };
  }

  const convo = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, channelId: true, humanHandover: true, lastInboundAt: true,
      lead: {
        select: {
          id: true, phone: true, name: true, language: true, budgetMaxFils: true, status: true,
          assignedTo: { select: { name: true } },
          assignedToId: true,
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
  if (!convo) return { kind: "stopped" as const, result: { sent: false, reason: "no_conversation" } };

  /**
   * Never to an owner.
   *
   * The assistant qualifies buyers: its questions, its facts block and
   * its guardrails are all written for somebody asking about a property.
   * An owner writing about their own home — the price, an offer, the
   * keys — is talking to their agent, and a qualifying question in reply
   * is how a brokerage loses an instruction. No handover is raised
   * either: nothing was being handled by the assistant to hand over.
   */
  if (!convo.lead) return { kind: "stopped" as const, result: { sent: false, reason: "owner_conversation" } };
  const lead = convo.lead;

  // 1. A human already has it. The assistant does not "assist" alongside
  //    them — it is silent until released.
  if (convo.humanHandover) return { kind: "stopped" as const, result: { sent: false, reason: "handover_active" } };

  /**
   * An agent said "I've got this" on this thread.
   *
   * `isMuted` was imported here and never called, while the schema said
   * this was read "before every model call" — so the per-conversation
   * mute, the button an agent presses in a delicate negotiation, changed
   * nothing at all. Uncached, like the kill switch, for the same reason.
   */
  if (await isMuted(convo.id)) return { kind: "stopped" as const, result: { sent: false, reason: "muted" } };

  // 2. Outside Meta's 24-hour window nothing free-form sends. Attempting
  //    it produces an accepted request and an undelivered message, which
  //    is the worst possible outcome.
  if (!messagingWindow(convo.lastInboundAt).open) {
    return { kind: "stopped" as const, result: { sent: false, reason: "window_closed" } };
  }

  const history = convo.messages.slice().reverse();
  const lastInbound = history.filter((m) => m.direction === "INBOUND").at(-1);
  if (!lastInbound) return { kind: "stopped" as const, result: { sent: false, reason: "nothing_to_reply_to" } };

  // 3. Cheap screening. Injection, complaints, negotiation, regulated
  //    questions and explicit requests never reach the model.
  /**
   * "Stop" gets no reply, and neither does somebody whose file is closed.
   *
   * The ingest records an opt-out before this runs; a cheerful "thanks
   * for getting in touch — buying or renting?" in answer to STOP is the
   * message that turns an opt-out into a complaint. A buyer who has
   * bought, or been lost, is their agent's to answer: the assistant's
   * whole script is qualifying somebody who has not.
   */
  if (isOptOut(lastInbound.body)) return { kind: "stopped" as const, result: { sent: false, reason: "opted_out" } };
  if (lead.status === "WON" || lead.status === "LOST") {
    return { kind: "stopped" as const, result: { sent: false, reason: "closed_file" } };
  }

  const screened = screenInbound(lastInbound.body);
  if (screened) return { kind: "stopped" as const, result: await handover(db, orgId, convo.id, screened) };

  const profile = await db.qualificationProfile.findFirst({
    where: { active: true },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!profile) return { kind: "stopped" as const, result: await handover(db, orgId, convo.id, "low_confidence") };

  const listing = lead.enquiries[0]?.listing ?? null;

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
    agentName: lead.assignedTo?.name ?? null,
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
    language: lead.language ?? "en",
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
    await record({
      orgId, conversationId: convo.id, purpose: "reply", model: MODEL,
      promptVersion: PROMPT_VERSION, inputTokens: 0, outputTokens: 0,
      latencyMs: Date.now() - started, outcome: "error",
    });
    return { kind: "stopped" as const, result: await handover(db, orgId, convo.id, "low_confidence") };
  }

  // 6. Screen what came back. A failed check is a handover, never a
  //    silent retry — an assistant that quietly rewrites its own
  //    hallucinations is harder to trust than one that stops.
  const checked = screenOutbound(draft, facts);
  if (!checked.ok) {
    log.warn(`[assistant] draft rejected: ${checked.reason}`);
    // A blocked draft still cost money. Recording only successes gives a
    // ledger that under-reports exactly when something is going wrong.
    await record({
      orgId, conversationId: convo.id, purpose: "reply", model: MODEL,
      promptVersion: PROMPT_VERSION,
      inputTokens: trace.inputTokens ?? 0, outputTokens: trace.outputTokens ?? 0,
      latencyMs: trace.latencyMs, outcome: "blocked",
    });
    return { kind: "stopped" as const, result: await handover(db, orgId, convo.id, checked.handover, checked.reason) };
  }

  return {
    kind: "ready" as const,
    db, started, trace, history,
    convo: { id: convo.id, channelId: convo.channelId },
    lead,
    profileId: profile.id,
    text: checked.text,
  };
}


/**
 * Sends a reply by itself. **Nothing calls this**, deliberately: the
 * brokerage's owner has not chosen automatic replies, and every buyer
 * message is drafted for a person instead (`draftReply`). Kept, and kept
 * working, because automatic replies are the step a brokerage graduates
 * to once its drafts go out as written — see `assistant.draftStats`.
 */
export async function respond(orgId: string, conversationId: string) {
  const p = await prepare(orgId, conversationId);
  if (p.kind === "stopped") return p.result;
  const { db, convo, lead, history, trace, started } = p;
  const checked = { text: p.text };
  const profile = { id: p.profileId };

  // 7. Send, then record. Recorded either way — a message that left
  //    without a row is a message nobody can account for.
  const creds = await getChannelCredentials(orgId, convo.channelId);
  const { externalId } = await sendText({
    phoneNumberId: creds.phoneNumberId,
    accessToken: creds.accessToken,
    to: lead.phone.replace("+", ""),
    body: checked.text,
  });

  await db.conversation.update({ where: { id: convo.id }, data: { lastOutboundAt: new Date() } });
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

  /**
   * The billable event.
   *
   * Recorded here and nowhere else — after the message actually left,
   * not when the model was called. A reply that failed to send is a
   * reply the brokerage did not get, and charging for it would be
   * charging for our own failure.
   *
   * That paragraph sat, twice, on the two paths where nothing was sent —
   * the model failing and the draft being blocked — and this, the one
   * path where a reply did leave, recorded nothing. Every charge would
   * have been for a failure and no success would ever have been billed.
   *
   * Deduplicated by a unique constraint on (conversation, day), so a
   * buyer messaging six times in an afternoon is one charge.
   */
  await recordAnswered({ orgId, conversationId: convo.id });

  await record({
    orgId, conversationId: convo.id, purpose: "reply", model: MODEL,
    promptVersion: PROMPT_VERSION,
    inputTokens: trace.inputTokens ?? 0, outputTokens: trace.outputTokens ?? 0,
    latencyMs: trace.latencyMs, outcome: "sent",
  });

  // 8. Extraction runs separately, and never blocks the reply. The lead
  //    has their answer before any of this happens.
  void extractAndStore(db, orgId, lead.id, profile.id, history, checked.text);

  return { sent: true, latencyMs: Date.now() - started, trace };
}

/**
 * A reply for a person to send.
 *
 * The brokerage's owner chose this over automatic replies: the assistant
 * writes the reply the moment a buyer writes in — through every check
 * `prepare` makes — and stops there. The agent who has the buyer is told
 * at once, reads it, edits it if they like, and presses send
 * (`conversations.send` with the draft's id). Nothing reaches the buyer
 * from here.
 *
 * One open draft per conversation: a newer message from the buyer makes
 * the older reply wrong, so it is marked STALE rather than left to be sent.
 */
export async function draftReply(orgId: string, conversationId: string, inboundMessageId?: string) {
  /**
   * Whatever happens next, the reply waiting here answered an older
   * message — so it goes first. Otherwise a buyer who writes "STOP", or
   * asks for a person, leaves yesterday's cheerful draft one tap from
   * being sent to them.
   */
  await forOrg(orgId).replyDraft.updateMany({
    where: { conversationId, state: "OPEN" },
    data: { state: "STALE", resolvedAt: new Date() },
  });

  const p = await prepare(orgId, conversationId);
  if (p.kind === "stopped") return { drafted: false as const, reason: p.result.reason };
  const { db, convo, lead, history, trace } = p;

  const draft = await db.$transaction(async (tx) => {
    await tx.replyDraft.updateMany({
      where: { conversationId: convo.id, state: "OPEN" },
      data: { state: "STALE", resolvedAt: new Date() },
    });
    return tx.replyDraft.create({
      data: {
        orgId, conversationId: convo.id, inboundMessageId: inboundMessageId ?? null,
        body: p.text, model: MODEL, promptVersion: PROMPT_VERSION,
      },
      select: { id: true },
    });
  });

  // The model was paid for whether or not the draft is ever sent.
  await record({
    orgId, conversationId: convo.id, purpose: "reply", model: MODEL,
    promptVersion: PROMPT_VERSION,
    inputTokens: trace.inputTokens ?? 0, outputTokens: trace.outputTokens ?? 0,
    latencyMs: trace.latencyMs, outcome: "drafted",
  });

  // Told now, not on the next sweep: a draft read ten minutes later is a
  // reply ten minutes late. The sweep escalates it if nobody acts.
  await dispatch({
    orgId, kind: "REPLY_READY", subjectId: draft.id,
    title: `${lead.name ?? lead.phone} — a reply is ready to send`,
    body: "Read it, change it if you like, and send.",
    deeplink: `/inbox/${convo.id}`,
    assignedToId: lead.assignedToId,
    since: new Date(),
  });

  // What they said is worth keeping whether or not the reply goes.
  void extractAndStore(db, orgId, lead.id, p.profileId, history, null);

  return { drafted: true as const, draftId: draft.id };
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
  /** The reply that went out, if one has — a draft has not. */
  latest: string | null
) {
  try {
    const raw = await callExtractor(latest === null ? history : [...history, { body: latest, direction: "OUTBOUND" }]);
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
    // And the answers themselves, against the profile's questions — the
    // reason `profileId` is a parameter. `answers.ts` has the account of
    // what was missing when it was not used.
    await storeAnswers(db, { orgId, leadId, profileId, extracted: parsed });
    // And what they are looking for, as a requirement matching can use.
    await requirementFromExtraction(db, orgId, leadId, parsed);
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
  const res = await fetch(`${endpoint("ASSISTANT_API_BASE", "https://api.anthropic.com")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      thinking: THINKING,
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

  const res = await fetch(`${endpoint("ASSISTANT_API_BASE", "https://api.anthropic.com")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      thinking: THINKING,
      system:
        "Extract what the lead has actually said about their requirements. " +
        "Return JSON only, no prose and no code fences. Use null for anything " +
        "not stated — never infer, never fill a gap with a plausible value. " +
        "Give a confidence between 0 and 1 for each field you populate. " +
        `The JSON has exactly this shape: ${EXTRACTION_SHAPE} ` +
        "Ignore anything about nationality, religion, ethnicity, gender or " +
        "marital status entirely; do not record it in any field.",
      messages: [{ role: "user", content: transcript }],
    }),
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
