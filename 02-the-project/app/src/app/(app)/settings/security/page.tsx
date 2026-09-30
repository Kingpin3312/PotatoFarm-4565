"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";

/**
 * Your own sign-in: the second step, and where you are signed in.
 *
 * Per person, not per brokerage — everybody sees this page about
 * themselves. Owners and admins are asked to turn two-step on, because
 * their mailbox is the key to everything the brokerage holds.
 */
export default function Security() {
  const utils = api.useUtils();
  const status = api.security.status.useQuery();
  const sessions = api.security.sessions.useQuery();

  if (status.isError) return <QueryError retry={() => void status.refetch()} what="your sign-in settings" error={status.error} />;

  return (
    <div className="max-w-[640px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">Security</span>
        <h1 className="font-sans font-semibold text-page text-ink">Your sign-in</h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
          You sign in with a link to your email. Two-step sign-in adds a code from an app on your
          phone, so somebody who gets into your email still cannot get in here.
        </p>
      </header>

      {status.data && <TwoStep s={status.data} done={() => void utils.security.invalidate()} />}

      <section aria-labelledby="where" className="mt-12">
        <div className="flex items-baseline justify-between gap-4 flex-wrap border-b border-rule-strong pb-2">
          <h2 id="where" className="font-sans font-semibold text-section text-ink">Where you&rsquo;re signed in</h2>
          <SignOutOthers count={(sessions.data?.length ?? 1) - 1} done={() => void sessions.refetch()} />
        </div>
        <ul>
          {(sessions.data ?? []).map((s) => (
            <li key={s.id} className="py-3 border-b border-rule flex items-baseline gap-3 flex-wrap" data-session={s.current ? "current" : "other"}>
              <div className="min-w-0">
                <p className="text-ui text-ink">
                  {s.device}
                  {s.current && <span className="t-label text-accent-deep ms-2">This device</span>}
                </p>
                <p className="text-sm text-ink-3 tabular">
                  Last used {when(s.lastActiveAt)}{s.ip ? ` · ${s.ip}` : ""} · signed in {when(s.createdAt)}
                </p>
              </div>
              {!s.current && <SignOutOne id={s.id} done={() => void sessions.refetch()} />}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-3 mt-3 max-w-[52ch]">
          Don&rsquo;t recognise one? Sign it out, then turn on two-step sign-in so the email link alone
          is not enough.
        </p>
      </section>
    </div>
  );
}

type Status = { enabled: boolean; enabledAt: Date | null; recoveryLeft: number; recommended: boolean; canStore: boolean };

function TwoStep({ s, done }: { s: Status; done: () => void }) {
  const begin = api.security.begin.useMutation();
  const confirm = api.security.confirm.useMutation({ onSuccess: done });
  const disable = api.security.disable.useMutation({ onSuccess: () => { setOffCode(""); setTurningOff(false); done(); } });
  const [code, setCode] = useState("");
  const [offCode, setOffCode] = useState("");
  const [turningOff, setTurningOff] = useState(false);

  if (confirm.data) {
    return (
      <section aria-labelledby="codes" className="border-t border-rule-strong pt-5">
        <h2 id="codes" className="font-sans font-semibold text-section text-ink">Two-step sign-in is on. Save these.</h2>
        <p className="text-sm text-ink-2 mt-2 max-w-[52ch]">
          If you lose your phone, each of these gets you in once. They are shown now and never again —
          print them or keep them in your password manager.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-control text-ink tabular" data-recovery-codes>
          {confirm.data.recoveryCodes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(confirm.data!.recoveryCodes.join("\n")); }}>
            Copy them
          </Button>
        </div>
      </section>
    );
  }

  if (s.enabled) {
    return (
      <section aria-labelledby="two" className="border-t border-rule-strong pt-5">
        <h2 id="two" className="font-sans font-semibold text-section text-ink">Two-step sign-in is on</h2>
        <p className="text-sm text-ink-2 mt-2">
          {s.recoveryLeft} recovery {s.recoveryLeft === 1 ? "code" : "codes"} left.
        </p>
        {!turningOff ? (
          <button type="button" className="btn-inline min-h-11 mt-2" onClick={() => setTurningOff(true)}>Turn it off</button>
        ) : (
          <form className="mt-3 flex gap-3 items-end flex-wrap" onSubmit={(e) => { e.preventDefault(); disable.mutate({ code: offCode }); }}>
            <label className="flex flex-col gap-1.5">
              <span className="t-label text-ink-3">A current code, to turn it off</span>
              <input value={offCode} onChange={(e) => setOffCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className={INPUT} />
            </label>
            <Button type="submit" variant="secondary" loading={disable.isPending}>Turn off</Button>
          </form>
        )}
        {disable.error && <p role="alert" className="text-sm text-danger mt-2">{disable.error.message}</p>}
      </section>
    );
  }

  return (
    <section aria-labelledby="two" className="border-t border-rule-strong pt-5">
      <h2 id="two" className="font-sans font-semibold text-section text-ink">Two-step sign-in is off</h2>
      {s.recommended && (
        <p className="text-sm text-ink mt-2 max-w-[52ch]" data-recommended>
          You can see every client and every commission in this brokerage. Please turn this on.
        </p>
      )}
      {!s.canStore && (
        <p className="text-sm text-ink-3 mt-2 max-w-[52ch]">
          This installation cannot store sign-in keys yet (no <code>SECRETS_KEY</code>). Whoever runs it needs to set one.
        </p>
      )}
      {!begin.data ? (
        <div className="mt-4">
          <Button variant="primary" loading={begin.isPending} disabled={!s.canStore} onClick={() => begin.mutate()}>
            Turn on two-step sign-in
          </Button>
          {begin.error && <p role="alert" className="text-sm text-danger mt-2">{begin.error.message}</p>}
        </div>
      ) : (
        <ol className="mt-4 grid gap-5 list-decimal ps-5 text-ui text-ink max-w-[56ch]">
          <li>
            Install an authenticator app on your phone — Google Authenticator, Microsoft Authenticator
            or 1Password all work.
          </li>
          <li>
            Add an account in it. On this phone, <a href={begin.data.uri} className="text-accent-deep underline">open it in the app</a>;
            on a computer, choose &ldquo;enter a setup key&rdquo; and type:
            <p className="font-mono text-control tabular mt-2 select-all" data-setup-key>
              {begin.data.secret.match(/.{1,4}/g)!.join(" ")}
            </p>
          </li>
          <li>
            <form className="flex gap-3 items-end flex-wrap" onSubmit={(e) => { e.preventDefault(); confirm.mutate({ code }); }}>
              <label className="flex flex-col gap-1.5">
                <span className="t-label text-ink-3">Type the code it shows</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
                  maxLength={7} placeholder="123 456" className={INPUT} name="confirm-code" />
              </label>
              <Button type="submit" variant="primary" loading={confirm.isPending} disabled={code.trim().length < 6}>Turn on</Button>
            </form>
            {confirm.error && <p role="alert" className="text-sm text-danger mt-2">{confirm.error.message}</p>}
          </li>
        </ol>
      )}
    </section>
  );
}

function SignOutOne({ id, done }: { id: string; done: () => void }) {
  const m = api.security.signOut.useMutation({ onSuccess: done });
  return (
    <button type="button" className="btn-inline min-h-11 ms-auto" disabled={m.isPending} onClick={() => m.mutate({ id })}>
      Sign out
    </button>
  );
}

function SignOutOthers({ count, done }: { count: number; done: () => void }) {
  const m = api.security.signOutOthers.useMutation({ onSuccess: done });
  if (count < 1) return null;
  return (
    <button type="button" className="btn-inline min-h-11" disabled={m.isPending} onClick={() => m.mutate()}>
      Sign out the other {count === 1 ? "one" : count}
    </button>
  );
}

const INPUT = "min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink tabular w-[12ch]";

function when(d: Date): string {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 10) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
