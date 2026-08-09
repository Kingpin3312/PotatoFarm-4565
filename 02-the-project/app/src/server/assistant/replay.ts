import { crossTenant } from "@/server/db/client";
import { buildSystemPrompt } from "./prompt";
import { screenOutbound } from "./guardrails";

/**
 * Sandbox replay.
 *
 * Runs a candidate prompt against real historical conversations and shows
 * what would have been said differently — before it goes anywhere near a
 * customer.
 *
 * **This file cannot send.** It does not import the WhatsApp client and it
 * does not import the credential store. That is the guarantee, and it is
 * structural rather than a matter of remembering: there is no code path
 * from here to a message leaving the building.
 *
 * Why it exists: a one-word change to a prompt can alter behaviour across
 * every conversation at once, and "we tested it on three examples" is how
 * a brokerage ends up explaining to a buyer why the assistant started
 * quoting the wrong service charge.
 */

export type ReplayCase = {
  conversationId: string;
  leadName: string | null;
  transcript: { role: "lead" | "assistant"; body: string }[];
  /** What was actually sent at the time. */
  original: string;
  /** What the candidate prompt produces now. */
  candidate: string;
  /** Whether the candidate would have passed the outbound checks. */
  passed: boolean;
  blockedBecause?: string;
  changed: boolean;
};

export type ReplayReport = {
  sampled: number;
  changed: number;
  wouldBlock: number;
  /** Blocks the current prompt does not produce. The number that matters. */
  newBlocks: ReplayCase[];
  /** A readable sample, for someone to actually look at. */
  examples: ReplayCase[];
};

export async function replay(args: {
  orgId: string;
  candidatePromptVersion: string;
  sample?: number;
  since?: Date;
}): Promise<ReplayReport> {
  const sample = args.sample ?? 50;
  const since = args.since ?? new Date(Date.now() - 30 * 86_400_000);

  // Only conversations where the assistant actually replied — replaying
  // threads a human handled tells you nothing about the prompt.
  const conversations = await crossTenant("sweep").conversation.findMany({
    where: {
      orgId: args.orgId,
      updatedAt: { gte: since },
      messages: { some: { author: "ASSISTANT" } },
    },
    take: sample,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      lead: {
        select: {
          name: true, language: true,
          enquiries: { take: 1, orderBy: { createdAt: "desc" }, select: { listing: true } },
        },
      },
      messages: {
        take: 20, orderBy: { sentAt: "asc" },
        select: { body: true, direction: true, author: true },
      },
      org: { select: { name: true } },
    },
  });

  const profile = await crossTenant("sweep").qualificationProfile.findFirst({
    where: { orgId: args.orgId, active: true },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!profile) throw new Error("No active qualification profile to replay against.");

  const cases: ReplayCase[] = [];

  for (const c of conversations) {
    // Cut the thread at the last lead message the assistant answered, so
    // the candidate is asked the same question the original was.
    const lastAssistantAt = c.messages.map((m) => m.author).lastIndexOf("ASSISTANT");
    if (lastAssistantAt < 1) continue;

    const context = c.messages.slice(0, lastAssistantAt);
    // `lastAssistantAt` came from lastIndexOf and is >= 1 here, but the
    // compiler cannot see that through the guard above.
    const original = c.messages[lastAssistantAt]?.body;
    if (original === undefined) continue;
    const listing = c.lead.enquiries[0]?.listing ?? null;

    const facts = new Set(
      [
        // Dirhams, matching what the prompt tells the model. Built from
        // fils it would never match a figure the model wrote, and every
        // replayed reply quoting a price would be scored as an invented
        // number — a prompt harness that fails the prompt for being
        // right. Same bug as run.ts, same fix.
        listing?.priceFils != null ? (listing.priceFils / 100n).toString() : undefined,
        listing?.areaSqft?.toString(),
        listing?.bedrooms?.toString(),
        listing?.bathrooms?.toString(),
      ].filter(Boolean) as string[]
    );

    const system = buildSystemPrompt({
      brokerage: c.org.name,
      agentName: null,
      questions: profile.questions.map((q) => ({ key: q.key, prompt: q.prompt, required: q.required })),
      listing: listing as any,
      language: c.lead.language ?? "en",
      tone: profile.tone,
    });

    const candidate = await draft(system, context);
    const checked = screenOutbound(candidate, facts);

    cases.push({
      conversationId: c.id,
      leadName: c.lead.name,
      transcript: context.map((m) => ({
        role: m.direction === "INBOUND" ? "lead" : "assistant",
        body: m.body,
      })),
      original,
      candidate,
      passed: checked.ok,
      blockedBecause: checked.ok ? undefined : checked.reason,
      changed: normalise(candidate) !== normalise(original),
    });
  }

  const newBlocks = cases.filter((c) => !c.passed);

  return {
    sampled: cases.length,
    changed: cases.filter((c) => c.changed).length,
    wouldBlock: newBlocks.length,
    newBlocks,
    // Ten changed cases to read. A report nobody opens is a report nobody
    // reads, and a diff of fifty is nobody opening it.
    examples: cases.filter((c) => c.changed).slice(0, 10),
  };
}

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Generation only. No send path exists from this module. */
async function draft(system: string, history: { body: string; direction: string }[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ASSISTANT_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 300,
      system,
      messages: history.map((m) => ({
        role: m.direction === "INBOUND" ? "user" : "assistant",
        content: m.body,
      })),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`replay generation ${res.status}`);
  const data = await res.json();
  return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
}
