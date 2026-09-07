import type { Action } from "./queue";

/**
 * Offline policy.
 *
 * `canQueue()` and `NEVER_QUEUE` moved to queue.ts, next to the code
 * that enforces them. Removing the const and leaving the function behind
 * — which is what happened here first — is worse than the duplication it
 * was fixing, because it compiles nowhere instead of disagreeing quietly.
 *
 * What is cached and how conflicts resolve. **The queue itself lives in
 * queue.ts** — this file held a duplicate `NEVER_QUEUE` and a
 * `QueuedItem` type that no longer matched the real one, which is how a
 * rule ends up true in one file and not the other.
 *
 * Agents in this market spend their day in underground car parks, lifts
 * and half-built towers. Signal goes for minutes at a time, and it is not
 * an edge case.
 *
 * The decision that matters, and it is a product decision rather than a
 * technical one:
 *
 *   **Reads work offline. Some writes queue. Messages to leads never
 *   queue.**
 *
 * A viewing outcome written in a basement and synced four minutes later
 * is fine — nobody is waiting on it. A message to a buyer that the agent
 * believes has sent, and which actually leaves forty minutes later when
 * they surface, is worse than not sending it at all: the buyer gets a
 * reply to a question they asked in a different context, and the agent
 * does not know it happened late.
 *
 * So the composer refuses politely rather than pretending. "No signal —
 * this hasn't sent" is a better experience than a message that arrives at
 * the wrong time.
 */


/** Never queued. Attempted now or refused now. */

/**
 * Cached for offline reading. Deliberately small — an agent needs today,
 * not the archive, and syncing four years of messages over a hotel wifi
 * is how an app gets deleted.
 */
export const CACHE_POLICY = {
  "viewings.mine": { days: 2, staleAfterMinutes: 15 },
  "leads.assigned": { count: 50, staleAfterMinutes: 30 },
  "conversations.recent": { count: 20, messagesEach: 30, staleAfterMinutes: 5 },
  "listings.active": { count: 100, staleAfterMinutes: 60 },
} as const;

/**
 * Every queued action carries the time it was created, and the server is
 * told. An outcome recorded at 14:10 and synced at 14:40 is stored as
 * 14:10 — otherwise the response-time reporting the product is sold on
 * gets quietly poisoned by bad signal.
 */

/**
 * Conflict handling on sync.
 *
 * Keyed off `Action` in queue.ts rather than a parallel type. There were
 * two action unions and they had already drifted: this file listed
 * `viewing.confirm`, which does not exist, and omitted
 * `conversation.send`, which is the most common queued action there is.
 *
 * So the most important thing in the queue had no conflict policy at
 * all, and nothing said so because the two types never had to agree.
 *
 * Last-write-wins is wrong across the board:
 *
 *   - A **viewing outcome** applies regardless. The agent was standing
 *     there; they know and the system does not.
 *   - A **stage change** asks. A manager may have moved the lead while
 *     the agent was underground, and silently overwriting makes the
 *     board untrustworthy — which costs more than the one lost edit.
 *   - A **message** never conflicts. It is additive, and it goes in the
 *     order the timestamps say rather than the order it synced.
 */
export const CONFLICT_POLICY: Record<Action["kind"], "apply" | "ask" | "append"> = {
  "conversation.send": "append",
  "conversation.handover": "apply",
  "viewing.outcome": "apply",
  "lead.note": "append",
  "lead.stage": "ask",
  // Apply, not ask. If an agent said "I've got this" while underground
  // and a manager did nothing meanwhile, there is no conflict — and if
  // there were, the agent standing in front of the buyer wins.
  "conversation.mute": "apply",
};
