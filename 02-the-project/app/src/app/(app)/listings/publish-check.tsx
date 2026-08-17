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
 *
 * ---------------------------------------------------------------------
 * **Nothing transmits the listing to a portal yet, and this screen says
 * so.**
 *
 * `listings.publish` writes a `ListingPublication` row at state
 * `PENDING`. That row is read by nothing: there is no adapter that
 * pushes a listing out and no job among the twenty-four that drains the
 * queue. Portal *lead ingest* exists; portal *distribution* does not,
 * and it cannot until there is a partner agreement and a real wire
 * format for each portal.
 *
 * Until then the button records an intention rather than performing an
 * action, and it has to read that way. The dialog used to say "Publish
 * to the 2 that are ready" and then close, so an agent had every reason
 * to believe the villa was on Bayut. It was not, nothing errored, and
 * the first person to find out would have been the owner.
 *
 * This is the same call already made three times in this codebase — the
 * REAR cash panel, "Import contacts", the dispute confirmation. A
 * control that looks like it works and does not is worse than no
 * control, because somebody relies on it.
 *
 * **When distribution is built:** restore the plain wording, and delete
 * this note along with the `manual` copy below.
 * ---------------------------------------------------------------------
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
  /**
   * Kept open on success, deliberately.
   *
   * Closing the dialog is the gesture that says "done". It is not done —
   * it is written down. The confirmation stays on screen and says what
   * actually happened and what the agent still has to do.
   */
  const publish = api.listings.publish.useMutation();

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
          <h2 className="font-sans font-semibold text-h3 text-ink mb-1.5">Publish {reference}</h2>
          <p className="text-sm text-ink-3 mb-5">
            Checked against each portal&rsquo;s rules before anything is sent.
          </p>

          {isLoading && <p className="text-sm text-ink-3 py-4">Checking…</p>}

          <div className="border-t border-ink">
            {data?.map((c) => (
              <div key={c.channelId} className="py-3.5 border-b border-rule">
                <div className="flex items-center gap-2.5">
                  <span className="text-ui font-medium text-ink">{c.channel}</span>
                  <span
                    className={cn(
                      "ms-auto t-label",
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
                      "text-note mt-2 ps-3.5 border-s-2",
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

          {/* Said before the press, not only after. An agent deciding
              whether to bother needs to know it is a note to themselves. */}
          <p className="mt-5 text-note leading-snug text-ink-2 max-w-[54ch]">
            PotatoFarm does not upload to the portals yet. This records which
            listings passed the checks and are ready to go up, so whoever does
            the uploading is working from a list rather than from memory.
          </p>

          {publish.isSuccess && (
            /* role="status" because nothing navigates — without it a
               screen reader user presses the button and hears nothing. */
            <p role="status" className="mt-3 text-ui text-ink">
              <strong className="font-semibold">Marked ready.</strong>{" "}
              Upload {reference} to the portal as usual — this did not send it.
            </p>
          )}

          {publish.error && (
            <p role="alert" className="mt-3 text-sm text-danger">{publish.error.message}</p>
          )}

          <div className="flex gap-2.5 justify-end mt-5 flex-wrap">
            <Button variant="secondary" onClick={() => dialog.current?.close()}>
              {publish.isSuccess ? "Close" : "Cancel"}
            </Button>
            <Button
              variant="primary"
              loading={publish.isPending}
              disabled={ready.length === 0 || publish.isSuccess}
              onClick={() =>
                publish.mutate({ listingId, channelIds: ready.map((r) => r.channelId) })
              }
            >
              {ready.length === 0
                ? "Nothing can go yet"
                : `Mark ${ready.length} ready to upload`}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
