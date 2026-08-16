"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * Sign in.
 *
 * Referenced by `auth/config.ts`, by the middleware redirect and by the
 * mobile app, and it did not exist. Every one of those paths landed on a
 * 404 — there was no way into the application at all.
 *
 * **No password field, and there never will be one.** `config.ts` sets
 * out the reasoning: nothing to store means nothing to leak, credential
 * stuffing has nothing to work with, and agents already live in their
 * inbox. What that costs is a dependency on email delivery, which is why
 * the page after this one is written the way it is.
 */
function SignInForm() {
  const params = useSearchParams();

  /**
   * Two parameters, both from somewhere real.
   *
   * `next` is set by the middleware when it turns somebody away from a
   * page they asked for, so they land back on it rather than on the
   * inbox. `email` is set by the mobile app, which already knows the
   * address and should not make somebody type it on a phone.
   */
  const next = params.get("next") ?? "/inbox";
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  async function send() {
    setState("sending");
    const res = await signIn("resend", {
      email: email.trim().toLowerCase(),
      redirectTo: next,
      redirect: false,
    });
    // A failure here is almost always email delivery rather than the
    // address. Say so, and give them the way round it.
    setState(res?.error ? "failed" : "idle");
    if (!res?.error) window.location.href = "/sign-in/check-your-email";
  }

  return (
    <main id="main" className="max-w-[46ch] mx-auto px-6 py-16">
      <h1 className="font-sans font-semibold text-[32px] text-ink -tracking-[0.026em] leading-tight">
        Sign in.
      </h1>
      <p className="text-[17px] text-ink-2 mt-3">
        We send a link to your work email. There is no password to choose, and none to
        forget.
      </p>

      <form
        className="mt-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void send();
        }}
      >
        <label
          htmlFor="email"
          className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2"
        >
          Work email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          placeholder="you@brokerage.ae"
          spellCheck={false}
          /* 16px exactly. Below it iOS zooms on focus and the layout
             shifts under somebody's thumb mid-address. */
          className="w-full min-h-12 px-4 text-[16px] text-ink bg-raised border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
        />

        {state === "failed" && (
          <p role="alert" className="text-[15px] text-danger mt-4 leading-snug">
            We couldn&rsquo;t send that link. Email{" "}
            <a href="mailto:hello@potatofarm.io" className="text-accent-deep underline">
              hello@potatofarm.io
            </a>{" "}
            and we&rsquo;ll get you in by hand.
          </p>
        )}

        <Button
          variant="primary"
          full
          className="mt-6"
          type="submit"
          loading={state === "sending"}
          disabled={!valid}
        >
          Email me a link
        </Button>
      </form>

      <p className="text-[13px] text-ink-3 mt-5 leading-relaxed">
        The link lasts ten minutes. Long enough to switch to your phone, short enough that a
        forwarded email is not a standing key to your brokerage.
      </p>

      <p className="text-[15px] text-ink-2 mt-10">
        No account yet?{" "}
        <a href="/signup" className="text-accent-deep underline">
          Start a trial
        </a>
        .
      </p>
    </main>
  );
}

/**
 * `useSearchParams` needs a Suspense boundary or the whole route opts out
 * of static rendering and the build says so.
 */
export default function SignIn() {
  return (
    <Suspense fallback={<main className="max-w-[46ch] mx-auto px-6 py-16" />}>
      <SignInForm />
    </Suspense>
  );
}
