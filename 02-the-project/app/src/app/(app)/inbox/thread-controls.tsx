"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * The controls on one conversation.
 *
 * Three procedures an agent uses constantly and none had a screen:
 * silencing the assistant on this thread, taking over properly, and
 * sending a template when the window has closed.
 *
 * "I've got this" is per-conversation. "Stop everything" in the header
 * halts the whole brokerage. Two names, two scopes, and the audit
 * asserts both are checked before any model call.
 */
export function ThreadControls({ conversationId, muted, windowOpen, handover }: {
  conversationId: string; muted: boolean; windowOpen: boolean; handover: boolean;
}) {
  const mute = api.conversations.mute.useMutation();
  const takeover = api.conversations.takeover.useMutation();
  const sendTemplate = api.conversations.sendTemplate.useMutation();
  const [picking, setPicking] = useState(false);

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <Button variant={muted ? "primary" : "ghost"} loading={mute.isPending}
        onClick={() => mute.mutate({ conversationId, muted: !muted })}>
        {muted ? "Assistant is off here" : "I've got this"}
      </Button>

      {handover && (
        <Button variant="secondary" loading={takeover.isPending}
          onClick={() => takeover.mutate({ conversationId, on: false,
                                           reason: "Agent finished, handing back" })}>
          Hand back
        </Button>
      )}

      {/* The window is the whole reason templates exist. Outside it a
          normal message is accepted by WhatsApp and never delivered,
          and nothing tells the sender. */}
      {!windowOpen && (
        <div className="w-full mt-2">
          {!picking ? (
            <>
              <p className="text-sm text-ink-2 max-w-[46ch] leading-snug">
                The window closed. A normal message won't arrive — WhatsApp takes it and
                silently drops it.
              </p>
              <Button variant="primary" className="mt-2" onClick={() => setPicking(true)}>
                Use a template
              </Button>
            </>
          ) : (
            <div className="bg-sunk rounded-xl p-4">
              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
                Approved templates
              </span>
              <div className="flex gap-2 flex-wrap">
                {["viewing_reminder", "new_listing_match", "checking_in"].map((t) => (
                  <button key={t} className="btn-inline"
                    onClick={() => sendTemplate.mutate({ conversationId, template: t, variables: {} })}>
                    {t.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
              <p className="text-sm text-ink-2 mt-3 max-w-[44ch] leading-snug">
                Once they reply, the window reopens and you can send anything for 24 hours.
              </p>
            </div>
          )}
        </div>
      )}

      {sendTemplate.error && (
        <p role="alert" className="text-sm text-danger w-full">{sendTemplate.error.message}</p>
      )}
    </div>
  );
}
