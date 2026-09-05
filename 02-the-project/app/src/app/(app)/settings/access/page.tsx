"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";

/**
 * Support access.
 *
 * The security page promises a named 72-hour grant that the brokerage
 * controls and can revoke. Until now there was no way to grant or
 * revoke one — a promise on a website with no mechanism behind it.
 *
 * Three things make this a real control rather than a checkbox:
 * a named person, an expiry that arrives on its own, and a revoke
 * button that works immediately.
 */
export default function Access() {
  const { data, isLoading, isError, refetch, error } = api.support.grants.useQuery();
  const grant = api.support.grant.useMutation({
    onSuccess: () => { setEmail(""); setReason(""); void refetch(); },
  });
  const revoke = api.support.revoke.useMutation({ onSuccess: () => void refetch() });

  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  if (isError) return <QueryError retry={() => void refetch()} what="support access" error={error} />;

  const grants = data?.grants ?? [];
  const live = grants.filter((g) => g.active);

  return (
    <div className="max-w-[640px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">
          Support access
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {live.length === 0 ? "Nobody has access." : `${live.length} active`}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[50ch]">
          Nobody at PotatoFarm.io can see your data unless you grant it. A grant names one
          person, lasts 72 hours, and expires on its own — you do not have to remember to
          close it.
        </p>
      </header>

      {live.length > 0 && (
        <div className="border-t border-ink mb-10">
          {live.map((g) => (
            <div key={g.id} className="py-4 border-b border-rule">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-control text-ink font-medium">{g.staffEmail}</span>
                <span className="t-label text-accent-deep">
                  {g.hoursLeft}h left
                </span>
                <Button variant="secondary" className="ms-auto"
                  loading={revoke.isPending}
                  onClick={() => revoke.mutate({ grantId: g.id })}>
                  Revoke now
                </Button>
              </div>
              <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">{g.reason}</p>
              <p className="text-label text-ink-3 mt-1">
                granted by {g.grantedBy} · {new Date(g.grantedAt).toLocaleString("en-GB")}
              </p>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-sans font-medium text-sub text-ink mb-3">Grant access</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="semail" className="block t-label text-ink-3 mb-2">
            Who — one named person
          </label>
          <input id="semail" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@potatofarm.io"
            className="w-full min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
          <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
            Not a team, not a role. If you cannot name the person, do not grant it.
          </p>
        </div>
        <div>
          <label htmlFor="sreason" className="block t-label text-ink-3 mb-2">
            Why
          </label>
          <textarea id="sreason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Investigating why the Bayut feed stopped on Tuesday"
            className="w-full px-4 py-2.5 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
          <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
            Goes on the permanent record next to their name. If it ever needs explaining, this
            is the explanation.
          </p>
        </div>
      </div>

      {grant.error && <p role="alert" className="text-sm text-danger mt-4">{grant.error.message}</p>}

      <Button variant="primary" className="mt-6" loading={grant.isPending}
        disabled={!email.includes("@") || reason.trim().length < 8}
        onClick={() => grant.mutate({ staffEmail: email, reason })}>
        Grant for 72 hours
      </Button>

      {grants.filter((g) => !g.active).length > 0 && (
        <>
          <h2 className="font-sans font-medium text-sub text-ink mt-12 mb-3">Past grants</h2>
          <div className="border-t border-rule">
            {grants.filter((g) => !g.active).slice(0, 10).map((g) => (
              <div key={g.id} className="flex items-baseline gap-3 py-3 border-b border-rule">
                <span className="text-ui text-ink-2">{g.staffEmail}</span>
                <span className="ms-auto font-mono text-label text-ink-3">
                  {g.revokedAt ? "revoked early" : "expired"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
