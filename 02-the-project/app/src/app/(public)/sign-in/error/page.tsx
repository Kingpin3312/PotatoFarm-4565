"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * When signing in does not work.
 *
 * Named as `error` in `config.ts` and never built, so every failure —
 * including the ordinary, expected one below — ended on a 404 that told
 * somebody nothing at all.
 *
 * NextAuth puts a code in `?error=`. Each one gets its own sentence,
 * because "authentication failed" is the message that generates the
 * support call. The important case is `Verification`, which is not a
 * fault: it is a ten-minute link used at minute eleven, or one already
 * used once. Both are the system working, and both should read as
 * "press this again" rather than as something being broken.
 */
const MESSAGES: Record<string, { title: string; detail: string; retry: boolean }> = {
  Verification: {
    title: "That link has already been used.",
    detail:
      "Links last ten minutes and work once — that is what stops a forwarded email being a " +
      "standing key to your brokerage. Ask for another and it will be with you in seconds.",
    retry: true,
  },
  AccessDenied: {
    title: "That address is not on this brokerage.",
    detail:
      "Sign-in is by invitation. Ask whoever runs your account to invite you, and the link " +
      "they send will bring you straight here.",
    retry: false,
  },
  Configuration: {
    title: "This is our problem, not yours.",
    detail:
      "Sign-in is misconfigured on our side. Nothing you do will fix it — tell us and we " +
      "will, usually within the hour.",
    retry: false,
  },
  Default: {
    title: "That didn't work.",
    detail: "Something went wrong signing you in. Trying once more usually settles it.",
    retry: true,
  },
};

function ErrorBody() {
  const code = useSearchParams().get("error") ?? "Default";
  const m = MESSAGES[code] ?? MESSAGES.Default!;

  return (
    <main id="main" className="max-w-[46ch] mx-auto px-6 py-24">
      <h1 className="font-sans font-semibold text-[32px] text-ink -tracking-[0.026em] leading-tight">
        {m.title}
      </h1>
      <p className="text-[17px] text-ink-2 mt-4 leading-snug">{m.detail}</p>

      <div className="mt-10 flex gap-3 flex-wrap">
        {m.retry && (
          <a
            href="/sign-in"
            className="inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-accent text-on-accent border border-[color:var(--accent-edge)] font-semibold text-[15px] no-underline"
          >
            Send another link
          </a>
        )}
        <a
          href="mailto:hello@potatofarm.io?subject=Can%27t%20sign%20in"
          className="inline-flex items-center justify-center min-h-12 px-6 rounded-full border border-rule text-ink font-medium text-[15px] no-underline"
        >
          hello@potatofarm.io
        </a>
      </div>

      {/* The code, small and last. Useless to the reader and the first
          thing we will ask for. */}
      <p className="font-mono text-[11px] text-ink-3 mt-10">Reference: {code}</p>
    </main>
  );
}

export default function SignInError() {
  return (
    <Suspense fallback={<main className="max-w-[46ch] mx-auto px-6 py-24" />}>
      <ErrorBody />
    </Suspense>
  );
}
