"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * The second step, after the email link.
 *
 * Reached only by the app layout's redirect, for somebody who has turned
 * two-step sign-in on and whose link has just signed a device in. The
 * one call it makes is `security.verify`, the one procedure open to a
 * session that has not passed this step.
 */
export default function TwoStep() {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const verify = api.security.verify.useMutation({
    onSuccess: () => { window.location.href = "/today"; },
  });

  return (
    <main id="main" className="max-w-[46ch] mx-auto px-6 py-24">
      <h1 className="font-sans font-semibold text-h2 text-ink leading-tight">One more step.</h1>
      <p className="text-sub text-ink-2 mt-4">
        {recovery
          ? "Type one of the recovery codes you saved when you turned this on. Each works once."
          : "Open your authenticator app and type the six-digit code it shows for PotatoFarm."}
      </p>
      <form className="mt-8 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); verify.mutate({ code }); }}>
        <label className="flex flex-col gap-1.5">
          <span className="t-label text-ink-3">{recovery ? "Recovery code" : "Code"}</span>
          <input
            name="code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus
            autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"}
            maxLength={recovery ? 12 : 7} placeholder={recovery ? "ABCD-EFGH" : "123 456"}
            className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink tabular tracking-widest"
          />
        </label>
        <div>
          <Button type="submit" variant="primary" loading={verify.isPending} disabled={code.trim().length < 6}>
            Finish signing in
          </Button>
        </div>
        {verify.error && <p role="alert" className="text-sm text-danger">{verify.error.message}</p>}
      </form>
      <div className="mt-10 pt-6 border-t border-rule">
        <button type="button" className="btn-inline min-h-11" onClick={() => { setRecovery(!recovery); setCode(""); verify.reset(); }}>
          {recovery ? "Use the app instead" : "Lost your phone? Use a recovery code"}
        </button>
        <p className="text-ui text-ink-2 leading-snug mt-2">
          No codes either? Your brokerage&rsquo;s owner can&rsquo;t switch this off for you — email{" "}
          <a href="mailto:hello@potatofarm.io" className="text-accent-deep underline">hello@potatofarm.io</a>{" "}
          from the address you sign in with.
        </p>
      </div>
    </main>
  );
}
