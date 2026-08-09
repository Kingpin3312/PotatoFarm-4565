"use client";

import { useState } from "react";
import { InboxList } from "./list";
import { Thread } from "./thread";
import { cn } from "@/lib/cn";

/**
 * Two panes on a desktop, one at a time on a phone.
 *
 * Not a responsive grid that squeezes — a 375px screen split three ways
 * is three columns nobody can read. On mobile the list is the screen
 * until you pick something, then the thread is.
 */
export default function InboxPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="grid md:grid-cols-[340px_1fr] h-[calc(100dvh-3.5rem)] min-h-0">
      <div className={cn("min-h-0", selected && "max-md:hidden")}>
        <InboxList selectedId={selected} onSelect={setSelected} />
      </div>

      <div className={cn("min-h-0", !selected && "max-md:hidden")}>
        {selected ? (
          <>
            <button
              onClick={() => setSelected(null)}
              className="md:hidden px-5 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 border-b border-rule w-full text-left"
            >
              ← All conversations
            </button>
            <Thread conversationId={selected} />
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
