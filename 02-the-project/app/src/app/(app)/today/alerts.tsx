"use client";

import Link from "next/link";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";

/**
 * What the product tried to tell this agent.
 *
 * ## Why this exists
 *
 * `Notification` rows have been written since the notification system
 * was built — a handover waiting, a qualified lead nobody has claimed,
 * a viewing tomorrow, a deal at risk — with an escalation ladder,
 * quiet hours, a morning digest and per-kind urgency behind them.
 *
 * **Nothing in the product ever read the table.** Push was the only
 * delivery route, and push has never worked: nothing calls
 * `registerDevice`, `PushDevice` has never had a row, and the only
 * client that could register one is an Expo app that cannot build. So
 * every notification the product generated reached nobody, by any
 * route, while the ladder recorded each rung as told.
 *
 * `/me/notifications` is the **preferences** screen — quiet hours, push
 * on or off — and the similar name is a large part of why this went
 * unnoticed for so long.
 *
 * This is the channel that works without a phone in it. Deliberately on
 * `/today` rather than behind a bell icon: an agent who has to go
 * looking for their alerts has not been alerted.
 */
export function Alerts() {
  const utils = api.useUtils();
  const { data } = api.org.inbox.useQuery({ unreadOnly: false });
  const markRead = api.org.markNotificationsRead.useMutation({
    onSuccess: () => void utils.org.inbox.invalidate(),
  });

  const items = data?.items ?? [];
  // Nothing to say is said by saying nothing. An empty panel headed
  // "Alerts" on a quiet morning trains an agent to stop looking.
  if (!items.length) return null;

  const unread = items.filter((i) => !i.readAt);

  return (
    <section className="mt-8" aria-labelledby="alerts-heading">
      <div className="flex items-baseline gap-3">
        <h2 id="alerts-heading" className="text-sub text-ink font-medium">
          {unread.length ? `${unread.length} to catch up on` : "Recently"}
        </h2>
        {unread.length > 0 && (
          <button
            type="button"
            className="ms-auto btn-inline text-sm"
            onClick={() => markRead.mutate({ ids: unread.map((i) => i.id) })}
          >
            Mark all read
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-px">
        {items.slice(0, 8).map((n) => (
          <li key={n.id}>
            <Link
              href={n.deeplink}
              onClick={() => { if (!n.readAt) markRead.mutate({ ids: [n.id] }); }}
              className={cn(
                "block p-3 rounded-sm no-underline border border-transparent",
                "hover:border-rule hover:bg-sunk",
                !n.readAt && "bg-sunk",
              )}
            >
              <span className="flex items-baseline gap-2 flex-wrap">
                <span className={cn("text-ui", n.readAt ? "text-ink-2" : "text-ink font-medium")}>
                  {n.title}
                </span>
                {/*
                  * Which rung of the ladder this reached.
                  *
                  * Shown only past the first, because an escalation is a
                  * different thing from a notification: it means the
                  * person it was meant for did not act and it has come
                  * to somebody else.
                  */}
                {n.escalation > 0 && (
                  <span className="text-note text-accent-type">
                    escalated{n.escalation > 1 ? ` ×${n.escalation}` : ""}
                  </span>
                )}
                <span className="ms-auto text-note text-ink-3 tabular">
                  {new Date(n.sentAt).toLocaleString("en-GB", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </span>
              <span className="block text-sm text-ink-2 mt-0.5 leading-snug">{n.body}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/*
        * Said once, at the bottom, when no phone has ever buzzed.
        *
        * An agent who believes they are being alerted works differently
        * from one who knows this screen is the only channel. Today
        * `pushed` is false for every row in the product, and saying so
        * is more honest than a silent list.
        */}
      {items.every((i) => !i.pushed) && (
        <p className="mt-3 text-note text-ink-3">
          These are on this screen only — no phone alerts are set up yet.
        </p>
      )}
    </section>
  );
}
