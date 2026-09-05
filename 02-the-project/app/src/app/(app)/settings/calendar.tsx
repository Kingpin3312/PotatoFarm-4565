"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * The agent's calendar subscription.
 *
 * A viewing booked here used to exist only here. An agent's day lives in
 * the calendar already on their phone, and a CRM that cannot put a
 * viewing there is one they forget to open.
 *
 * **The copy does the security work.** This is a capability URL — the
 * token in the address is the whole credential, because Apple Calendar
 * and Google fetch on a timer with no way to sign in. That is a fine
 * trade for a read-only diary, and it is a bad surprise if nobody says
 * so. The warning is on screen, not in a document, and rotating is one
 * button rather than a revoke buried somewhere else: the moment somebody
 * realises they have pasted the link into a group chat, the useful
 * action has to be one press away.
 */
export function CalendarFeed() {
  const utils = api.useUtils();
  const { data } = api.org.calendarFeed.useQuery();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const rotate = api.org.calendarRotate.useMutation({
    onSuccess: () => {
      setConfirming(false);
      void utils.org.calendarFeed.invalidate();
    },
  });

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="mt-12 border-t border-rule pt-7">
      <h2 className="font-sans font-semibold text-section text-ink mb-1">
        Your viewings, on your phone
      </h2>
      <p className="max-w-[56ch] text-ink-2 text-ui">
        Subscribe once and every viewing booked for you appears in the calendar
        you already use — Apple, Google or Outlook. It updates about every
        fifteen minutes and is read-only: changing an event here changes nothing
        in PotatoFarm.
      </p>

      {!data?.url && (
        <div className="mt-5">
          <Button
            variant="primary"
            loading={rotate.isPending}
            onClick={() => rotate.mutate()}
          >
            Create my calendar link
          </Button>
        </div>
      )}

      {data?.url && (
        <div className="mt-5">
          <label
            htmlFor="cal-url"
            className="t-label text-ink-3 block mb-2"
          >
            Your private link
          </label>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              id="cal-url"
              readOnly
              value={data.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-[260px] font-mono text-label bg-sunk border border-rule rounded-md px-3 min-h-11 text-ink-2"
            />
            <Button variant="secondary" onClick={() => void copy(data.url!)}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          {/* role="status": the copy happened without anything navigating,
              and a sighted user sees the label change. */}
          <p role="status" className="sr-only">{copied ? "Link copied" : ""}</p>

          <p className="mt-3 text-note leading-snug text-ink-2 max-w-[58ch]">
            <strong className="text-ink font-semibold">Treat this like a password.</strong>{" "}
            Anyone with the link can read your viewings — including client names
            and numbers — without signing in. That is what lets your phone fetch
            it. If you share it by accident, replace it below and the old one
            stops working immediately.
          </p>

          <p className="mt-3 text-note text-ink-3">
            {data.lastReadAt
              ? `Your calendar last collected it on ${new Date(data.lastReadAt).toLocaleString("en-GB")}.`
              : "Nothing has collected it yet. It can take a few minutes after you subscribe."}
          </p>

          <div className="mt-5">
            {!confirming ? (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Replace this link
              </Button>
            ) : (
              <div className="border border-rule rounded-lg p-4 bg-sunk max-w-[52ch]">
                <p className="text-ui text-ink font-medium">Replace it?</p>
                <p className="mt-1 text-note text-ink-2">
                  The current link stops working straight away. You will need to
                  remove the old subscription on your phone and add the new one.
                </p>
                <div className="mt-4 flex gap-2 flex-wrap">
                  <Button
                    variant="primary"
                    loading={rotate.isPending}
                    onClick={() => rotate.mutate()}
                  >
                    Yes, replace it
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirming(false)}>
                    Keep the current one
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {rotate.error && (
        <p role="alert" className="mt-3 text-sm text-danger">{rotate.error.message}</p>
      )}
    </section>
  );
}
