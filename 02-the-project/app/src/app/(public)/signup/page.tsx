"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Sign-up.
 *
 * The router was mounted and nothing rendered it, which meant the
 * revenue path ended in a function nobody could reach. This is the page.
 *
 * Four fields. Every one of them is used — there is no "how did you hear
 * about us", no phone number we will not ring, no company size we
 * already asked for as seats. A sign-up form that asks for things it
 * does not need is a form that tells a brokerage owner what the next two
 * years will be like.
 */
export default function Signup() {
  const { data: terms } = api.billing.terms.useQuery();
  const signup = api.billing.signup.useMutation();

  const [form, setForm] = useState({
    brokerageName: "", ownerName: "", ownerEmail: "", seats: 10,
  });

  const minSeats = terms?.minSeats ?? 8;
  const tooSmall = form.seats > 0 && form.seats < minSeats;

  if (signup.isSuccess) {
    return (
      <main className="max-w-[46ch] mx-auto px-6 py-24">
        <h1 className="font-sans font-semibold text-h2 text-ink leading-tight">
          Check your email.
        </h1>
        <p className="text-sub text-ink-2 mt-4">
          We&rsquo;ve sent a link to <strong className="text-ink">{form.ownerEmail}</strong>.
          It signs you in — there&rsquo;s no password to choose or forget.
        </p>
        <p className="text-ui text-ink-2 mt-4">
          Your {terms?.trialDays ?? 14} days start when you first switch the assistant on,
          not today. Have a look around first.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-[46ch] mx-auto px-6 py-16">
      <h1 className="font-sans font-semibold text-h2 text-ink leading-tight">
        Start the trial.
      </h1>
      <p className="text-sub text-ink-2 mt-3">
        {terms?.trialDays ?? 14} days, no card. The first week we measure your response times
        with the assistant switched off, so the difference afterwards is yours to check.
      </p>

      <div className="mt-10 space-y-5">
        <Field label="Brokerage name" value={form.brokerageName}
               onChange={(v) => setForm({ ...form, brokerageName: v })} autoComplete="organization" />
        <Field label="Your name" value={form.ownerName}
               onChange={(v) => setForm({ ...form, ownerName: v })} autoComplete="name" />
        <Field label="Your email" value={form.ownerEmail} type="email"
               onChange={(v) => setForm({ ...form, ownerEmail: v })} autoComplete="email" />

        <div>
          <Field label="How many agents" value={String(form.seats)} type="number"
                 onChange={(v) => setForm({ ...form, seats: Number(v) || 0 })} />
          {tooSmall ? (
            // Said here rather than after they press the button. Being
            // told you are too small at the last step is worse than
            // being told before you filled anything in.
            <p className="text-ui text-ink-2 mt-2 leading-snug">
              Below {minSeats} agents this isn&rsquo;t worth it for you. You can answer that
              volume by hand, and you should — email us in a year.
            </p>
          ) : terms?.seatPrice && (
            <p className="text-ui text-ink-2 mt-2 tabular">
              {terms.seatPrice.usd} per agent after the trial &mdash;{" "}
              <span className="text-ink-3">{terms.seatPrice.aed}, invoiced in dirhams</span>
            </p>
          )}
        </div>
      </div>

      {signup.error && (
        <p role="alert" className="text-ui text-danger-deep mt-6 leading-snug">
          {signup.error.message}
        </p>
      )}

      <Button
        variant="primary"
        full
        className="mt-8"
        loading={signup.isPending}
        disabled={tooSmall || !form.brokerageName || !form.ownerEmail || !form.ownerName}
        onClick={() => signup.mutate(form)}
      >
        Start the trial
      </Button>

      <p className="text-note text-ink-3 mt-5 leading-relaxed">
        No card now. We&rsquo;ll ask for one before the trial ends, and tell you before we do.
      </p>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; autoComplete?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="block t-label text-ink-3 mb-2">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        // 16px. Below that iOS zooms the page on focus and the layout
        // jumps while somebody is typing their company name.
        className="w-full min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--glow-focus)]"
      />
    </div>
  );
}
