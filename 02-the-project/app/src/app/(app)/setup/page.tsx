"use client";

import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * Setup.
 *
 * The path from "signed up" to "the assistant is answering", and until
 * now it existed only as a router. A brokerage could create an account
 * and then had no way to connect a number, import a listing or invite
 * anybody.
 *
 * Ordered by dependency, not by importance. Nothing below step two
 * works without step two.
 */
export default function Setup() {
  const { data, isLoading, isError, refetch, error } = api.onboarding.checklist.useQuery();
  const setStep = api.onboarding.setStep.useMutation({
    onSuccess: () => void refetch(),
  });

  if (isError) return <QueryError retry={() => void refetch()} what="your setup" error={error} />;
  if (isLoading) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const steps = data?.steps ?? [];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">
          Setup · {done} of {steps.length}
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {done === steps.length ? "You're set up." : next?.title ?? "Nearly there."}
        </h1>
        {done < steps.length && (
          <p className="text-sub text-ink-2 mt-3 max-w-[46ch]">
            {next?.why ?? "A few things left."}
          </p>
        )}
      </header>

      <div className="border-t border-ink">
        {steps.map((s, i) => (
          <div key={s.key} className={cn("py-4 border-b border-rule",
            !s.done && s.key === next?.key && "border-s-[3px] border-s-accent ps-4 -ms-4")}>
            <div className="flex items-baseline gap-3">
              <span className={cn("font-mono text-label tabular",
                s.done ? "text-success" : "text-ink-3")}>
                {s.done ? "done" : String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <p className={cn("text-control font-medium",
                  s.done ? "text-ink-3 line-through decoration-1" : "text-ink")}>
                  {s.title}
                </p>
                {!s.done && (
                  <p className="text-sm text-ink-2 mt-1 max-w-[44ch] leading-snug">{s.why}</p>
                )}
              </div>
              {!s.done && s.href && (
                <a href={s.href} className="btn-inline">Do it</a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* The baseline week is the one step people skip, and it is the one
          that makes the whole pilot provable. Said plainly rather than
          left as a checkbox. */}
      {!steps.find((s) => s.key === "baseline")?.done && (
        <div className="mt-8 bg-sunk rounded-xl p-5 border-s-[3px] border-s-accent-edge">
          <p className="text-control text-ink font-medium">
            Leave the assistant off for the first week.
          </p>
          <p className="text-sm text-ink-2 mt-1.5 max-w-[48ch] leading-snug">
            We record how fast enquiries are answered today, hour by hour. Without that
            number the difference afterwards is just a feeling — and most brokerages have
            never seen the chart for their own business.
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            loading={setStep.isPending}
            onClick={() => setStep.mutate({ key: "baseline", state: "DONE" })}
          >
            Start the baseline week
          </Button>
        </div>
      )}
    </div>
  );
}
