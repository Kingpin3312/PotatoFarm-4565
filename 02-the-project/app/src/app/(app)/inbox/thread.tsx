"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Message } from "@/components/ui/message";
import { WindowState, WindowClosed } from "@/components/ui/window-state";
import { KycPanel } from "./kyc-panel";
import { Button } from "@/components/ui/button";

/**
 * The thread. The screen agents live in, so the decisions here are about
 * what happens when things go wrong rather than when they go right.
 */
export function Thread({ conversationId }: { conversationId: string }) {
  const utils = api.useUtils();
  const { data, isLoading , isError, refetch, error } = api.conversations.thread.useQuery({ conversationId });
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = api.conversations.send.useMutation({
    /**
     * Optimistic, because a four-second round trip on hotel wifi makes
     * the product feel broken. The message appears immediately and is
     * marked pending — which is honest, because that is exactly what it
     * is.
     */
    async onMutate({ body }) {
      await utils.conversations.thread.cancel({ conversationId });
      const previous = utils.conversations.thread.getData({ conversationId });

      utils.conversations.thread.setData({ conversationId }, (old) =>
        old
          ? {
              ...old,
              messages: [
                ...old.messages,
                {
                  id: `pending-${Date.now()}`,
                  body,
                  direction: "OUTBOUND" as const,
                  author: "AGENT" as const,
                  status: "PENDING" as const,
                  sentAt: new Date(),
                  failure: null,
                  templateName: null,
                },
              ],
            }
          : old
      );
      setDraft("");
      return { previous };
    },

    onError(err, _vars, ctx) {
      // Put the draft back. Losing what somebody typed because the
      // network blinked is the fastest way to make them distrust the box.
      if (ctx?.previous) utils.conversations.thread.setData({ conversationId }, ctx.previous);
      setDraft((d) => d || (err.message.includes("window") ? "" : draft));
      setFailed(err.message);
    },

    onSettled() {
      void utils.conversations.thread.invalidate({ conversationId });
      void utils.conversations.list.invalidate();
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  if (isLoading) return <ThreadSkeleton />;
  if (isError) return <QueryError retry={() => void refetch()} what="this" error={error} />;
  if (!data) return null;

  const { window: w } = data;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <header className="px-6 py-3.5 border-b border-ink flex items-center gap-3.5 flex-wrap">
        <div>
          <div className="font-sans font-semibold -tracking-[0.024em] text-[22px] text-ink -tracking-[0.01em]">
            {data.lead.name ?? data.lead.phone}
          </div>
          <div className="font-mono text-[11px] text-ink-3">
            {data.lead.phone} · {data.lead.language}
          </div>
        </div>
        {data.humanHandover && (
          // Says why the assistant stopped. Silence with no explanation
          // reads as a fault, and the agent rings support.
          <div className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-accent-deep">
            You have this · {data.handoverReason}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {data.messages.map((m) => (
          <Message key={m.id} {...m} />
        ))}

        {/* The due diligence file, at the foot of the conversation.

            `KycPanel` existed, was carefully built around the
            tipping-off rules, and **was rendered by no screen at all** —
            a component wired to nothing, one level up from the module
            shape `reachability.py` looks for. Here rather than in the
            header because it is a state to notice while reading, not a
            control to reach for: an agent scrolls to the bottom to
            reply, and what is outstanding is the last thing they pass. */}
        <div className="px-6 pb-2">
          <KycPanel leadId={data.lead.id} />
        </div>

        <div ref={endRef} />
      </div>

      <div className="border-t border-ink p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {w.open ? (
          <>
            <WindowState open hoursLeft={w.hoursLeft} />
            {failed && (
              <p role="alert" className="text-[13px] text-accent-deep mt-2">
                {failed}
              </p>
            )}
            <div className="flex gap-3 items-end mt-3">
              <label htmlFor="reply" className="sr-only">Message</label>
              <textarea
                id="reply"
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift-Enter breaks the line. The other way
                  // round costs a message every time somebody is quick.
                  if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
                    e.preventDefault();
                    send.mutate({ conversationId, body: draft.trim() });
                  }
                }}
                placeholder="Write a reply…"
                className="flex-1 bg-transparent border-0 border-b border-rule py-2.5 text-[15px] text-ink resize-none focus:outline-none focus:border-accent focus:border-b-2"
              />
              <Button
                variant="primary"
                loading={send.isPending}
                disabled={!draft.trim()}
                onClick={() => send.mutate({ conversationId, body: draft.trim() })}
              >
                Send
              </Button>
            </div>
          </>
        ) : (
          <WindowClosed onTemplate={() => {}} onAssign={() => {}} />
        )}
      </div>
    </div>
  );
}

/**
 * Shaped like the thing it is replacing, not a spinner. A spinner tells
 * you to wait; a skeleton tells you what is coming, and the page does not
 * jump when it arrives.
 */
function ThreadSkeleton() {
  return (
    <div className="p-6" aria-busy>
      <span className="sr-only">Loading the conversation</span>
      {[70, 90, 55].map((w, i) => (
        <div key={i} className="py-4 border-b border-rule">
          <div className="h-2 w-12 bg-sunk rounded-sm mb-2" />
          <div className="h-3 bg-sunk rounded-sm" style={{ width: `${w}%` }} />
        </div>
      ))}
    </div>
  );
}
