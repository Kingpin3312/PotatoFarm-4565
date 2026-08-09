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
  /**
   * Phone, not email.
   *
   * Both procedures key on the phone number, and they are right to:
   * `Lead` is unique on `(orgId, phone)`, email is optional, and the
   * whole product runs on WhatsApp. This screen collected an email and
   * passed it to procedures that have no such input, so neither the
   * subject-access file nor the erasure could ever have run.
   *
   * `erase` also requires the number twice. That is deliberate — it is
   * the one irreversible action in the product — so the confirm step
   * asks for it again rather than just showing an "are you sure".
   */
  const [phone, setPhone] = useState("");
  const [confirmPhone, setConfirmPhone] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);

  // `subjectAccess` is a query — it builds a file and logs that it was
  // read. Run on demand rather than on every render.
  const [building, setBuilding] = useState(false);
  const subject = api.privacy.subjectAccess.useQuery({ phone }, { enabled: building && phone.length > 5 });
  const erase = api.privacy.erase.useMutation();

  const valid = phone.trim().length > 5;

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
        <label htmlFor="pphone" className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
          Their WhatsApp number
        </label>
        <input id="pphone" type="tel" inputMode="tel" value={phone} placeholder="+971 50 123 4567"
          onChange={(e) => { setPhone(e.target.value); setBuilding(false); }}
          className="w-full min-h-11 px-4 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
      </div>

      <h2 className="font-sans font-semibold text-[17px] text-ink mt-8 mb-2">
        Everything you hold on them
      </h2>
      <p className="text-sm text-ink-2 mb-3 max-w-[48ch] leading-snug">
        A file you can send them. Messages, viewings, offers and what was recorded about
        them, in plain language rather than a database dump.
      </p>
      <Button variant="secondary" loading={building && subject.isLoading} disabled={!valid}
        onClick={() => setBuilding(true)}>
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
        <Button variant="secondary" disabled={!valid} onClick={() => setConfirm(true)}>
          Erase
        </Button>
      ) : (
        <div className="bg-sunk rounded-xl p-4 border-l-[3px] border-l-danger">
          <p className="text-[15px] text-ink">This cannot be undone. Type the number again to confirm.</p>
          <label htmlFor="pconfirm" className="sr-only">Confirm the number</label>
          <input id="pconfirm" type="tel" inputMode="tel" value={confirmPhone}
            onChange={(e) => setConfirmPhone(e.target.value)} placeholder="+971 50 123 4567"
            className="w-full min-h-11 px-4 mt-3 text-[16px] text-ink bg-raised border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
          <label htmlFor="preason" className="sr-only">Why</label>
          <input id="preason" type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why — they asked, in writing, on 3 March"
            className="w-full min-h-11 px-4 mt-2 text-[16px] text-ink bg-raised border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
          <div className="flex gap-2 mt-3">
            <Button variant="primary" loading={erase.isPending}
              disabled={confirmPhone !== phone || reason.trim().length < 3}
              onClick={() => { erase.mutate({ phone, confirmPhone, reason }); setConfirm(false); }}>
              Yes, erase
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {erase.data?.deferredUntil && (
        <p className="text-sm text-ink-2 mt-4 pl-3 border-l-2 border-l-accent-edge max-w-[48ch] leading-snug">
          Deferred — there is a live KYC file. Scheduled for {erase.data.deferredUntil}.
        </p>
      )}
    </div>
  );
}
