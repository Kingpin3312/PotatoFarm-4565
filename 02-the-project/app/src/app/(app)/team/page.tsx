"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";

/**
 * The team.
 *
 * Blocks everything else: a brokerage that cannot invite its agents has
 * a CRM with one user in it. This was a mounted router with no screen.
 */
export default function Team() {
  const { data, isLoading, isError, refetch, error } = api.org.members.useQuery();
  const remove = api.org.removeMember.useMutation({ onSuccess: () => void refetch() });
  const invite = api.org.invite.useMutation({
    onSuccess: () => { setEmail(""); void refetch(); },
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"AGENT" | "MANAGER">("AGENT");

  if (isError) return <QueryError retry={() => void refetch()} what="your team" error={error} />;

  const members = data?.members ?? [];
  const seats = members.length;

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Team
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-accent-type -tracking-[0.026em] leading-none tabular">
          {seats} {seats === 1 ? "person" : "people"}
        </h1>
        {/* Billing consequence stated at the point of the decision, not
            discovered on the invoice. */}
        <p className="text-sm text-ink-2 mt-3 max-w-[46ch]">
          Adding someone starts their seat today and you pay for the days they use, not the
          whole month. Removing them stops it the same way.
        </p>
      </header>

      <div className="border-t border-rule pt-5">
        <label htmlFor="invite-email"
               className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
          Invite by email
        </label>
        <div className="flex gap-2 flex-wrap">
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@brokerage.ae"
            autoComplete="off"
            // 16px. Below that iOS zooms and the layout jumps mid-typing.
            className="flex-1 min-w-[220px] min-h-11 px-4 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "AGENT" | "MANAGER")}
            aria-label="Role"
            // 16px for the same reason as the input above, which said so
            // and then this line directly beneath it used 15. Anything
            // under 16 makes iOS zoom the page on focus.
            className="min-h-11 px-3 text-[16px] text-ink bg-sunk border border-rule rounded-lg"
          >
            <option value="AGENT">Agent</option>
            <option value="MANAGER">Manager</option>
          </select>
          <Button
            variant="primary"
            loading={invite.isPending}
            disabled={!email.includes("@")}
            onClick={() => invite.mutate({ email, role })}
          >
            Send
          </Button>
        </div>
        {invite.error && (
          <p role="alert" className="text-sm text-danger mt-3">{invite.error.message}</p>
        )}
        {invite.isSuccess && (
          <p className="text-sm text-success mt-3">
            Sent. The link signs them in — there's no password to choose.
          </p>
        )}
      </div>

      <div className="border-t border-ink mt-10">
        {isLoading
          ? [...Array(3)].map((_, i) => <div key={i} className="h-14 bg-sunk" aria-busy />)
          : members.map((m) => (
              <div key={m.id} className="flex items-baseline gap-3 py-3.5 border-b border-rule">
                <span className="text-[15px] text-ink">{m.user.name ?? m.user.email}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  {m.role.toLowerCase()}
                </span>
                {/* Every Membership row is an accepted one — an
                    invitation that has not been taken up lives in
                    `data.pending` and has no membership yet, so
                    `m.acceptedAt` was a field that could not exist.
                    Last seen is the useful thing to show instead. */}
                <span className="ml-auto font-mono text-[11px] text-ink-3">
                  {m.user.lastSeenAt
                    ? `seen ${new Date(m.user.lastSeenAt).toLocaleDateString("en-GB")}`
                    : "not signed in yet"}
                </span>
                {/* Removing stops the seat the same day. The billing
                    consequence is stated on this screen already, so this
                    is a plain action rather than a warning. */}
                {m.role !== "OWNER" && (
                  <button className="btn-inline"
                    onClick={() => remove.mutate({ userId: m.user.id })}>
                    Remove
                  </button>
                )}
              </div>
            ))}
      </div>
    </div>
  );
}
