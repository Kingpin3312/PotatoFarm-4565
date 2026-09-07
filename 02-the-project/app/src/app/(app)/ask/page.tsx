"use client";

import { Ask } from "./ask-box";
import { History } from "./history";

/**
 * Say it.
 *
 * The one genuinely good idea in the competing product: an agent between
 * viewings cannot type. Speaking a request is how they get a reason to
 * open this at all.
 *
 * Where we differ: no human sits behind it. The answer comes back in
 * seconds and states its own uncertainty, instead of an advisor catching
 * it hours later.
 *
 * The input itself now lives in `ask-box.tsx`, because the command
 * centre needs the same one and two copies of the surface that turns a
 * sentence into CRM writes is two places for the guardrails to drift.
 * This page is that component plus the history beneath it.
 */
export default function AskPage() {
  return (
    <div className="mx-auto max-w-[620px] px-6 pb-24">
      <header className="pt-10 pb-6">
        <h1 className="font-sans text-page font-semibold text-ink">
          Say it
        </h1>
        <p className="mt-3 max-w-[46ch] text-sm text-ink-2">
          Tell it what happened, what you want, or what you need. It works out
          what should happen next.
        </p>
      </header>

      <Ask />
      <History />
    </div>
  );
}
