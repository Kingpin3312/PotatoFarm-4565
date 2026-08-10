"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Button } from "@/components/ui/button";

/**
 * The pre-publish check.
 *
 * Runs as the dialog opens, not when the button is pressed. Portals
 * reject listings silently — the listing simply never appears, and
 * nobody finds out until an owner rings to ask why their villa is not
 * on Bayut.
 *
 * The person who pressed publish is the one who can fix it, and they are
 * looking at the screen right now. Three days later they are not.
 */
export function PublishCheck({
  listingId,
  reference,
  channelIds,
}: {
  listingId: string;
  reference: string;
  channelIds: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { data, isLoading , isError, refetch } = api.listings.checkPublish.useQuery(
    { listingId, channelIds },
    { enabled: channelIds.length > 0 }
  );
  const publish = api.listings.publish.useMutation({
    onSuccess: () => dialog.current?.close(),
  });

  const ready = data?.filter((d) => d.canPublish) ?? [];

  return (
    <>
      <Button size="sm" onClick={() => { dialog.current?.showModal(); dialog.current?.focus(); }}>Publish</Button>

      <dialog
        ref={dialog}
        aria-labelledby="publish-title"
        tabIndex={-1}
        className="border border-ink rounded-[3px] p-0 max-w-[520px] w-[calc(100%-40px)] bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        <div className="p-6">
          <h2 className="font-sans font-semibold -tracking-[0.024em] text-[24px] text-accent-type mb-1.5">Publish {reference}</h2>
          <p className="text-sm text-ink-3 mb-5">
            Checked against each portal&rsquo;s rules before anything is sent.
          </p>

          {isLoading && <p className="text-sm text-ink-3 py-4">Checking…</p>}

          <div className="border-t border-ink">
            {data?.map((c) => (
              <div key={c.channelId} className="py-3.5 border-b border-rule">
                <div className="flex items-center gap-2.5">
                  <span className="text-[15px] font-semibold text-ink">{c.channel}</span>
                  <span
                    className={cn(
                      "ml-auto font-mono text-[9px] uppercase tracking-[0.1em]",
                      c.canPublish ? "text-success" : "text-accent"
                    )}
                  >
                    {c.canPublish ? "Ready" : "Blocked"}
                  </span>
                </div>

                {c.problems.map((p, i) => (
                  <p
                    key={i}
                    className={cn(
                      "text-[13px] mt-2 pl-3.5 border-l-2",
                      // A warning and a blocker look different, because
                      // "you can fix this later" and "this will not send"
                      // are different messages.
                      p.severity === "block"
                        ? "border-accent text-ink-2"
                        : "border-rule text-ink-3"
                    )}
                  >
                    {p.message}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <div className="flex gap-2.5 justify-end mt-5 flex-wrap">
            <Button variant="secondary" onClick={() => dialog.current?.close()}>Cancel</Button>
            <Button
              variant="primary"
              loading={publish.isPending}
              disabled={ready.length === 0}
              onClick={() =>
                publish.mutate({ listingId, channelIds: ready.map((r) => r.channelId) })
              }
            >
              {ready.length === 0
                ? "Nothing can go yet"
                : `Publish to the ${ready.length} that ${ready.length === 1 ? "is" : "are"} ready`}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
