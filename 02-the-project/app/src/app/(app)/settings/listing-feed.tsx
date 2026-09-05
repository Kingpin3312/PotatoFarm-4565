"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * The listing feed a portal collects.
 *
 * ## Why this screen exists
 *
 * `org.listingFeed` and `org.rotateListingFeed` were written, mounted,
 * permission-gated and covered by a check — and nothing called them. A
 * brokerage owner had no way to obtain the URL, which made the feed a
 * feature that existed only in the database.
 *
 * That matters more than the usual unreachable procedure. Until a portal
 * agreement is signed, this feed and the public property page are the
 * only two ways inventory leaves the product, and this is the half a
 * portal can consume. A distribution channel nobody can find is off.
 *
 * ## Brokerage-level, and the copy says so
 *
 * The calendar feed beside this one is one agent's diary. This is the
 * firm's whole inventory, which is why the procedure requires
 * `org:update` and why the warning here is worded harder. Same
 * capability-URL trade: the token in the address is the entire
 * credential, because a portal fetches on a timer with nowhere to sign
 * in.
 *
 * An agent without `org:update` gets FORBIDDEN from the query and the
 * section renders nothing. There is no client-side permission surface in
 * this codebase to ask beforehand, and a red box on a settings page they
 * cannot act on is worse than an absence.
 */
export function ListingFeed() {
  const utils = api.useUtils();
  const { data, isError } = api.org.listingFeed.useQuery(undefined, { retry: false });
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const rotate = api.org.rotateListingFeed.useMutation({
    onSuccess: () => {
      setConfirming(false);
      void utils.org.listingFeed.invalidate();
    },
  });

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (isError) return null;

  return (
    <section className="mt-12 border-t border-rule pt-7">
      <h2 className="font-sans font-semibold text-section text-ink mb-1">
        Your listings, sent to a portal
      </h2>
      <p className="max-w-[56ch] text-ink-2 text-ui">
        A portal can collect your available properties from one address
        instead of anybody re-typing them. Give this link to Bayut, Property
        Finder or Dubizzle once your agreement is signed — they fetch it on
        their own schedule, so a price you change here is the price they show
        next time they look.
      </p>
      <p className="mt-3 max-w-[56ch] text-note text-ink-3">
        Only properties that are available and carry a valid Trakheesi permit
        appear in it. Anything missing a permit is held back rather than sent,
        because advertising without one is the brokerage&rsquo;s fine to pay.
      </p>

      {!data?.url && (
        <div className="mt-5">
          <Button
            variant="primary"
            loading={rotate.isPending}
            onClick={() => rotate.mutate()}
          >
            Create the feed link
          </Button>
        </div>
      )}

      {data?.url && (
        <div className="mt-5">
          <label htmlFor="feed-url" className="t-label text-ink-3 block mb-2">
            Your feed address
          </label>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              id="feed-url"
              readOnly
              value={data.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-[260px] font-mono text-label bg-sunk border border-rule rounded-md px-3 min-h-11 text-ink-2"
            />
            <Button variant="secondary" onClick={() => void copy(data.url!)}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <p role="status" className="sr-only">{copied ? "Link copied" : ""}</p>

          <p className="mt-3 text-note leading-snug text-ink-2 max-w-[58ch]">
            <strong className="text-ink font-semibold">Treat this like a password.</strong>{" "}
            Anyone with the link can read every property you have for sale or
            rent, with prices and permit numbers, without signing in. That is
            what lets a portal collect it. If it reaches somebody it should not,
            replace it below and the old address stops working immediately.
          </p>

          {data.createdAt && (
            <p className="mt-3 text-note text-ink-3">
              Created {new Date(data.createdAt).toLocaleDateString("en-GB")}.
            </p>
          )}

          <div className="mt-5">
            {!confirming ? (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                Replace this link
              </Button>
            ) : (
              <div className="border border-rule rounded-lg p-4 bg-sunk max-w-[52ch]">
                <p className="text-ui text-ink font-medium">Replace it?</p>
                <p className="mt-1 text-note text-ink-2">
                  The current address stops working straight away. Any portal
                  already collecting from it will stop receiving your properties
                  until you send them the new one.
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
