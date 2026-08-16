"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Button } from "@/components/ui/button";

/**
 * The Stop everything.
 *
 * First and largest thing on the settings page, because anyone reaching
 * for it is already having a bad afternoon and should not have to hunt
 * through tabs.
 *
 * One confirmation, not three. Friction between somebody and a stop
 * button is not caution, it is delay. What the dialog does instead is
 * state the consequence in the brokerage's own numbers, so the decision
 * is informed rather than merely slowed down.
 */
export function KillSwitch() {
  const utils = api.useUtils();
  const { data , isError, refetch } = api.assistant.status.useQuery();
  /**
   * Rounded to the day. See the note in viewings/page.tsx — a live
   * timestamp in a query input is a new React Query key on every
   * render, and this one sits in the shell's settings screen refetching
   * a funnel report in a loop.
   */
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const { data: volume } = api.reports.funnel.useQuery({
    from: new Date(to.getTime() - 7 * 86_400_000),
    to,
  });

  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");

  const pause = api.assistant.pause.useMutation({
    onSuccess: () => { void utils.assistant.status.invalidate(); dialog.current?.close(); },
  });
  const resume = api.assistant.resume.useMutation({
    onSuccess: () => void utils.assistant.status.invalidate(),
  });

  if (!data) return null;
  const running = data.enabled;
  const perDay = volume ? Math.round(volume.enquiries / 7) : null;

  return (
    <>
      <div
        className={cn(
          "rounded-[3px] overflow-hidden",
          running ? "border border-ink" : "border-2 border-accent"
        )}
      >
        <div className={cn("p-6 flex gap-5 items-center flex-wrap", !running && "bg-accent/5")}>
          <div>
            <div className="font-sans font-semibold text-title text-ink flex items-center gap-2.5">
              {/* Filled versus hollow, not green versus red.
                  The palette is two colours now, so a dot that relied on
                  hue to say "running" would have said nothing. Shape
                  survives the palette and colour blindness both. Filled
                  is the state that wants attention. */}
              <span
                aria-hidden
                className={cn(
                  "size-2.5 rounded-full",
                  running ? "border-2 border-ink-3" : "bg-accent",
                )}
              />
              {running ? "Running" : "Stopped"}
            </div>
            <p className="text-sm text-ink-2 mt-1 max-w-[48ch]">
              {running
                ? "Replying to new enquiries within the reply window. Conversations an agent has taken over are untouched."
                : "Not replying to anything. Enquiries still arrive and still appear in the inbox — they now wait for a person."}
            </p>
          </div>

          <div className="ml-auto">
            {running ? (
              <Button variant="primary" size="md" onClick={() => { dialog.current?.showModal(); dialog.current?.focus(); }}>
                Stop the assistant
              </Button>
            ) : (
              <Button variant="secondary" size="md" loading={resume.isPending} onClick={() => resume.mutate()}>
                Start it again
              </Button>
            )}
          </div>
        </div>

        {!running && data.pausedAt && (
          <div className="border-t border-rule bg-raised px-6 py-4 font-mono text-label tracking-[0.06em] text-ink-2">
            Stopped by <strong className="text-ink font-medium">{data.pausedBy ?? "someone"}</strong>{" "}
            · {when(data.pausedAt)} · <strong className="text-ink font-medium">{data.pausedReason}</strong>
          </div>
        )}
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="kill-title"
        tabIndex={-1}
        className="border border-ink rounded-[3px] p-0 max-w-[460px] w-[calc(100%-40px)] bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        <div className="p-6">
          <h2 className="font-sans font-semibold text-h3 text-ink mb-2.5">Stop the assistant?</h2>
          <p className="text-ui mb-1.5">
            It stops replying to every conversation, immediately.
          </p>

          <div className="border-l-2 border-accent pl-3.5 my-4 text-sm">
            New enquiries will still arrive and still appear in the inbox — but nobody will
            answer them until an agent does.
            {/* The brokerage's own number, not a generic warning. */}
            {perDay !== null && (
              <> At your current volume that is roughly{" "}
                <strong className="text-ink">{perDay} enquiries a day</strong> waiting on a person.</>
            )}
          </div>

          <label htmlFor="why" className="block t-label text-ink-3 mt-5 mb-1.5">
            Why (goes in the audit log)
          </label>
          <input
            id="why"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. wrong price quoted on MG2-1184"
            className="w-full bg-transparent border-0 border-b border-rule py-2.5 text-control text-ink focus:outline-none focus:border-accent focus:border-b-2"
          />

          <div className="flex gap-2.5 justify-end mt-6 flex-wrap">
            <Button variant="secondary" onClick={() => dialog.current?.close()}>Cancel</Button>
            <Button
              variant="primary"
              loading={pause.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => pause.mutate({ reason: reason.trim() })}
            >
              Stop it
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
  }).format(new Date(d));
