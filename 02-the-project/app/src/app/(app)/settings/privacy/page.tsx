"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Subject access and erasure.
 *
 * The legal page promises both and neither had a screen. A promise on a
 * website with no way to honour it is worse than not making it.
 *
 * The important behaviour here is that erasure **defers** against a live
 * KYC file rather than refusing or silently deleting. UAE retention is
 * five years and outranks the request — saying so plainly is the honest
 * version.
 */
export default function Privacy() {
  const subject = api.privacy.subjectAccess.useMutation();
  const erase = api.privacy.erase.useMutation();
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="max-w-[620px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Privacy requests
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          Somebody asking about their data
        </h1>
      </header>

      <div className="border-t border-rule pt-5">
        <label htmlFor="pemail" className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
          Their email
        </label>
        <input id="pemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full min-h-11 px-4 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
      </div>

      <h2 className="font-sans font-semibold text-[17px] text-ink mt-8 mb-2">
        Everything you hold on them
      </h2>
      <p className="text-sm text-ink-2 mb-3 max-w-[48ch] leading-snug">
        A file you can send them. Messages, viewings, offers and what was recorded about
        them, in plain language rather than a database dump.
      </p>
      <Button variant="secondary" loading={subject.isPending} disabled={!email.includes("@")}
        onClick={() => subject.mutate({ email })}>
        Build the file
      </Button>

      <h2 className="font-sans font-semibold text-[17px] text-ink mt-10 mb-2">Erase them</h2>
      <p className="text-sm text-ink-2 mb-3 max-w-[48ch] leading-snug">
        Personal details are scrubbed and the audit trail is kept — the log cannot be edited
        or deleted, which is enforced at the database.
      </p>
      <p className="text-sm text-ink-2 mb-3 max-w-[48ch] leading-snug">
        <strong className="text-ink">If there is a live KYC file, erasure defers.</strong> UAE
        rules require five years of due diligence records even where the transaction never
        completed, and that obligation outranks the request. We will tell them that, and when
        it expires.
      </p>

      {!confirm ? (
        <Button variant="secondary" disabled={!email.includes("@")} onClick={() => setConfirm(true)}>
          Erase
        </Button>
      ) : (
        <div className="bg-sunk rounded-xl p-4 border-l-[3px] border-l-danger">
          <p className="text-[15px] text-ink">This cannot be undone. Erase {email}?</p>
          <div className="flex gap-2 mt-3">
            <Button variant="primary" loading={erase.isPending}
              onClick={() => { erase.mutate({ email }); setConfirm(false); }}>
              Yes, erase
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {erase.data?.deferred && (
        <p className="text-sm text-ink-2 mt-4 pl-3 border-l-2 border-l-accent-edge max-w-[48ch] leading-snug">
          Deferred — there is a live KYC file. Scheduled for {erase.data.deferredUntil}.
        </p>
      )}
    </div>
  );
}
