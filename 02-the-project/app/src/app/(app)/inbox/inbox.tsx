"use client";

import { useRouter } from "next/navigation";
import { InboxList } from "./list";
import { Thread } from "./thread";
import { cn } from "@/lib/cn";

/**
 * Two panes on a desktop, one at a time on a phone.
 *
 * Not a responsive grid that squeezes — a 375px screen split three ways
 * is three columns nobody can read. On mobile the list is the screen
 * until you pick something, then the thread is.
 *
 * ## The open thread is in the URL, and it was not
 *
 * This held the selection in `useState`, so a conversation had no
 * address. Every row on the Leads screen linked to
 * `/inbox/<conversationId>` — a route that did not exist — and returned
 * a 404 on every click. Nobody had noticed, because the link is only
 * reachable from a screen that itself only became useful once leads
 * were being assigned.
 *
 * A thread with a URL can also be bookmarked, sent to a colleague, and
 * linked from Today or a search result, which is what an agent expects
 * of anything that looks like a page.
 *
 * `replace`, not `push`: picking through six conversations should not
 * leave six entries in the back button between the agent and the screen
 * they came from.
 */
export function Inbox({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const selected = selectedId ?? null;

  return (
    // The header is 3.5rem and a 1px rule. The columns are held to the
    // row (`h-full`), or the list grew to its full length and the whole
    // page scrolled as one — 3,500px of it with forty conversations, and
    // a thread opened from "Try a live enquiry" landed half under the
    // header. Below `lg` the bottom tab bar (3.5rem and the home
    // indicator) is under it as well, and `main` pads for it.
    <div className="grid md:grid-cols-[340px_1fr] h-[calc(100dvh-7rem-1px-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-3.5rem-1px)] min-h-0">
      <div className={cn("min-h-0 h-full", selected && "max-md:hidden")}>
        <InboxList
          selectedId={selected}
          onSelect={(id) => router.replace(`/inbox/${id}`)}
        />
      </div>

      <div className={cn("min-h-0 h-full flex flex-col", !selected && "max-md:hidden")}>
        {selected ? (
          <>
            <button
              onClick={() => router.replace("/inbox")}
              className="md:hidden px-5 py-3 t-label text-ink-3 border-b border-rule w-full text-start"
            >
              ← All conversations
            </button>
            <div className="flex-1 min-h-0">
              <Thread conversationId={selected} />
            </div>
          </>
        ) : (
          <div className="hidden md:grid place-items-center h-full text-sm text-ink-3">
            Pick a conversation.
          </div>
        )}
      </div>
    </div>
  );
}
