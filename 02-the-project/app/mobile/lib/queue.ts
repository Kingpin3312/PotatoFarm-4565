import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Notifications from "expo-notifications";
import { getSession } from "./auth";

/**
 * The offline queue. An actual one this time.
 *
 * The previous version was a type definition and a policy document. An
 * agent in a car park under Marina Gate does not need a policy.
 *
 * Four rules, and the third is the one that matters most.
 */

const KEY = "queue.v1";
const MAX_ATTEMPTS = 8;

export type Action =
  | { kind: "conversation.send"; conversationId: string; body: string; createdAt: string }
  | { kind: "conversation.handover"; conversationId: string; reason: string; createdAt: string }
  | { kind: "viewing.outcome"; viewingId: string; verdict: string; note?: string; createdAt: string }
  | { kind: "lead.note"; leadId: string; note: string; createdAt: string }
  | { kind: "lead.stage"; leadId: string; stageId: string; createdAt: string }
  | { kind: "conversation.mute"; conversationId: string; muted: boolean; createdAt: string };

export type Item = {
  id: string;
  action: Action;
  attempts: number;
  lastError?: string;
  /** Set when the server refused it for a reason retrying will not fix. */
  deadReason?: string;
  /** Set when somebody else changed the same thing first. Needs a person. */
  conflict?: { theirs?: { stage?: string; at?: string; who?: string } };
};

/**
 * Rule 1. **The timestamp is when it was created, never when it synced.**
 *
 * An agent who replies at 21:04 in a basement and surfaces at 21:20 must
 * show as having replied at 21:04. Otherwise bad signal quietly poisons
 * the response-time reporting the entire product is sold on — and that
 * chart is the sales argument.
 *
 * Every action carries `createdAt` and the server is told to use it.
 */
export async function enqueue(action: Action) {
  const q = await read();
  q.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, action, attempts: 0 });
  await write(q);
  void flush();
}

/**
 * Rule 2. **Messages to leads are attempted immediately and fail loudly.**
 *
 * They are queued so nothing is lost, but a message sitting unsent for
 * forty minutes is worse than one that failed — the agent believes the
 * buyer has been answered. So if a send is still queued after two
 * minutes, we tell them.
 */
const TELL_AFTER_MS = 120_000;

export async function flush(): Promise<{ sent: number; failed: number; queued: number }> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return { sent: 0, failed: 0, queued: (await read()).length };

  const token = await getSession();
  if (!token) return { sent: 0, failed: 0, queued: (await read()).length };

  const q = await read();
  let sent = 0, failed = 0;
  const keep: Item[] = [];

  // Indexed rather than for-of, because the 401 case needs to keep
  // everything from here on. The first version used q.indexOf(item)
  // inside the loop, which is O(n) per item and breaks outright if two
  // items are ever structurally equal.
  for (let i = 0; i < q.length; i += 1) {
    const item = q[i]!;
    if (item.deadReason) { keep.push(item); continue; }

    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/mobile/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          // Rule 4. The item id is the idempotency key. A retry after a
          // timeout must not send the message twice — the agent has no
          // way to know it did, and the buyer certainly does.
          "Idempotency-Key": item.id,
        },
        body: JSON.stringify(item.action),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) { sent += 1; continue; }

      /**
       * Rule 3. **Some failures must never be retried.**
       *
       * The 24-hour WhatsApp window is the case that matters. If it has
       * closed, retrying for two days sends nothing and tells nobody.
       * The agent thinks the lead is ignoring them.
       *
       * A 409 from the server means "this cannot succeed later". It goes
       * dead and the agent is told, immediately, with what to do instead.
       */
      /**
       * 412 means somebody else changed it first. Distinct from 409,
       * which means "this can never succeed" — a conflict CAN succeed,
       * once a person has chosen which version wins.
       *
       * It is held rather than dropped, and surfaced by conflicts()
       * below so ConflictSheet can ask.
       */
      if (res.status === 412) {
        const detail = await res.json().catch(() => ({}));
        item.conflict = detail;
        keep.push(item);
        failed += 1;
        continue;
      }

      if (res.status === 409) {
        const { reason } = await res.json().catch(() => ({ reason: "refused" }));
        item.deadReason = reason;
        failed += 1;
        await tell(item, reason);
        keep.push(item);
        continue;
      }

      if (res.status === 401) {
        // Session gone. Stop trying and keep this item and everything
        // after it — signing in again recovers all of it, and losing the
        // queue here would lose real work an agent believes is saved.
        keep.push(...q.slice(i));
        break;
      }

      item.attempts += 1;
      item.lastError = `${res.status}`;
      if (item.attempts >= MAX_ATTEMPTS) {
        item.deadReason = "gave up after repeated failures";
        await tell(item, item.deadReason);
      }
      keep.push(item);
      failed += 1;
    } catch (err) {
      item.attempts += 1;
      item.lastError = String(err).slice(0, 120);
      keep.push(item);
    }
  }

  await write(keep);
  return { sent, failed, queued: keep.length };
}

/**
 * Telling the agent. Not a toast they might miss — a notification,
 * because the failure often happens while the app is closed and the
 * whole point is that they typed this from a lock screen.
 */
async function tell(item: Item, reason: string) {
  const what = item.action.kind === "conversation.send"
    ? "Your reply didn't send"
    : "Something didn't save";

  const detail = reason === "window_closed"
    ? "It's been more than 24 hours since they messaged, so WhatsApp only allows an approved template. Open the app to send one, or give them a call."
    : reason;

  await Notifications.scheduleNotificationAsync({
    content: { title: what, body: detail, sound: "default" },
    trigger: null,
  });
}

/** Anything sitting too long is surfaced without being asked. */
export async function stale(): Promise<Item[]> {
  const q = await read();
  const now = Date.now();
  return q.filter(
    (i) =>
      !i.deadReason &&
      i.action.kind === "conversation.send" &&
      now - new Date(i.action.createdAt).getTime() > TELL_AFTER_MS
  );
}

export async function pending() { return (await read()).length; }

/** Anything waiting on a human decision. Drives ConflictSheet. */
export async function conflicts(): Promise<Item[]> {
  return (await read()).filter((i) => i.conflict);
}

/**
 * The agent chose. Either re-send with a flag that overrides, or drop it.
 *
 * Dropping is not silent — the change is already in the audit log as
 * attempted, so a manager can see that an agent tried to move it and
 * deferred.
 */
export async function resolve(id: string, keepMine: boolean) {
  const q = await read();
  const item = q.find((i) => i.id === id);
  if (!item) return;

  if (!keepMine) {
    await write(q.filter((i) => i.id !== id));
    return;
  }
  delete item.conflict;
  (item.action as { force?: boolean }).force = true;
  item.attempts = 0;
  await write(q);
  void flush();
}

export async function dismiss(id: string) {
  await write((await read()).filter((i) => i.id !== id));
}

/** Reconnect and app-foreground both trigger a flush. */
export function watch() {
  return NetInfo.addEventListener((s) => { if (s.isConnected) void flush(); });
}

async function read(): Promise<Item[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    // A corrupt queue must not brick the app. Losing it is bad; an app
    // that will not start is worse.
    return [];
  }
}

async function write(q: Item[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    // Storage full. Nothing sensible to do, and throwing here would
    // lose the action that was about to be queued anyway.
  }
}

/**
 * Never queued. Attempted now or refused now.
 *
 * Holding a viewing slot: it may be gone by the time it syncs, and
 * telling an agent they have a 10am somebody else took is worse than
 * telling them to try again.
 *
 * Publishing a listing: portals reject stale data.
 *
 * Declared here, next to the queue that enforces it. It was previously
 * in both this file and offline.ts, which is how a rule ends up being
 * true in one place and not the other.
 */
export const NEVER_QUEUE = ["viewing.hold", "listing.publish", "conversation.template"] as const;

export function canQueue(kind: string) {
  return !NEVER_QUEUE.includes(kind as (typeof NEVER_QUEUE)[number]);
}
