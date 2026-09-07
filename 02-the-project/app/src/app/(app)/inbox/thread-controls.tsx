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
      {/* "quiet", not "ghost" — see button.tsx for the variants that exist. */}
      <Button variant={muted ? "primary" : "quiet"} loading={mute.isPending}
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
            /* The banner `WindowClosed` used to draw, folded in here.
               
               That component rendered this explanation with two buttons
               wired to `() => {}` — "Send follow-up template" and
               "Assign an agent to call", neither of which did anything.
               This one has the same words and the same weight, and the
               button opens a picker that sends. Keeping both would have
               meant two components explaining Meta's rule in the same
               viewport. */
            <div className="border border-rule border-s-2 border-s-danger-deep bg-sunk rounded-xl p-4">
              <p className="text-sm text-ink-2">
                <strong className="text-ink font-semibold">Quiet for more than 24 hours.</strong>{" "}
                WhatsApp only allows an approved template until they reply. This isn&rsquo;t us
                — it&rsquo;s Meta&rsquo;s rule for every business on the platform.
              </p>
              <Button variant="primary" size="sm" className="mt-3.5"
                      onClick={() => setPicking(true)}>
                Send follow-up template
              </Button>
            </div>
          ) : (
            <div className="bg-sunk rounded-xl p-4">
              <span className="block t-label text-ink-3 mb-2">
                Approved templates
              </span>
              <div className="flex gap-2 flex-wrap">
                {["viewing_reminder", "new_listing_match", "checking_in"].map((t) => (
                  <button key={t} className="btn-inline"
                    onClick={() => sendTemplate.mutate({ conversationId, template: t, variables: [] })}>
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
