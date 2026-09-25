"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { sentence } from "@/lib/sentence";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { TeamCapacity } from "./capacity";
import { TeamVisibility } from "./visibility";

/**
 * The team.
 *
 * Blocks everything else: a brokerage that cannot invite its agents has
 * a CRM with one user in it. This was a mounted router with no screen.
 */
export default function Team() {
  const { data, isLoading, isError, refetch, error } = api.org.members.useQuery();
  const [removing, setRemoving] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const remove = api.org.removeMember.useMutation({
    onSuccess: (r, vars) => {
      const gone = members.find((m) => m.user.id === vars.userId);
      const to = members.find((m) => m.user.id === r.handTo);
      const parts = [
        r.leads && `${r.leads} lead${r.leads === 1 ? "" : "s"}`,
        r.viewings && `${r.viewings} upcoming viewing${r.viewings === 1 ? "" : "s"}`,
        r.followUps && `${r.followUps} follow-up${r.followUps === 1 ? "" : "s"}`,
        r.listings && `${r.listings} listing${r.listings === 1 ? "" : "s"}`,
      ].filter((x): x is string => !!x);
      const what = and(parts);
      const who = gone?.user.name ?? gone?.user.email ?? "They";
      setRemoved(
        !parts.length ? `${who} has been removed. They held nothing that needed handing over.`
        : to ? `${who} has been removed. ${what} went to ${to.user.name ?? to.user.email}.`
        : `${who} has been removed. ${what} went back to the pool.`,
      );
      setRemoving(null);
      void refetch();
    },
  });
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
        <span className="t-label text-ink-3 block mb-3">
          Team
        </span>
        <h1 className="font-sans font-semibold text-page text-ink tabular">
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
               className="block t-label text-ink-3 mb-2">
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
            className="flex-1 min-w-[220px] min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "AGENT" | "MANAGER")}
            aria-label="Role"
            // 16px for the same reason as the input above, which said so
            // and then this line directly beneath it used 15. Anything
            // under 16 makes iOS zoom the page on focus.
            className="min-h-11 px-3 text-control text-ink bg-sunk border border-rule rounded-lg"
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

      <div className="border-t border-rule-strong mt-10">
        {isLoading
          ? [...Array(3)].map((_, i) => <div key={i} className="h-14 bg-sunk" aria-busy />)
          : members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-2 py-3.5 border-b border-rule">
                <span className="text-ui text-ink">{m.user.name ?? m.user.email}</span>
                <span className="t-label text-ink-3">
                  {sentence(m.role)}
                </span>
                {/* Every Membership row is an accepted one — an
                    invitation that has not been taken up lives in
                    `data.pending` and has no membership yet, so
                    `m.acceptedAt` was a field that could not exist.
                    Last seen is the useful thing to show instead. */}
                <span className="ms-auto text-label text-ink-3">
                  {m.user.lastSeenAt
                    ? `seen ${new Date(m.user.lastSeenAt).toLocaleDateString("en-GB")}`
                    : "not signed in yet"}
                </span>
                {/* Removing stops the seat the same day. The billing
                    consequence is stated on this screen already, so this
                    is a plain action rather than a warning. */}
                {/* Two steps, not one. A single tap here used to send a
                    whole book back to the pool with no undo. */}
                {m.role !== "OWNER" && removing !== m.user.id && (
                  <button className="btn-inline"
                    onClick={() => { setRemoved(null); remove.reset(); setRemoving(m.user.id); }}>
                    Remove
                  </button>
                )}
                {removing === m.user.id && (
                  <RemovePanel
                    name={m.user.name ?? m.user.email}
                    userId={m.user.id}
                    // Agents first: the default is the first option, and a
                    // book handed to the owner pressing the button is a
                    // book nobody is working.
                    others={members.filter((o) => o.user.id !== m.user.id)
                      .sort((a, b) => Number(b.role === "AGENT") - Number(a.role === "AGENT"))
                      .map((o) => ({ id: o.user.id, name: o.user.name ?? o.user.email }))}
                    pending={remove.isPending}
                    error={remove.error?.message ?? null}
                    onCancel={() => setRemoving(null)}
                    onConfirm={(handTo) => remove.mutate({ userId: m.user.id, handTo })}
                  />
                )}
              </div>
            ))}
      </div>
      {removed && <p role="status" className="text-sm text-ink-2 mt-3">{removed}</p>}

      {/* Availability is the other half of a team screen: who is here
          is one question, and how much work each of them takes is the
          one that decides where a lead goes. */}
      <TeamCapacity />

      {/* And the third question a team screen has to answer: what any
          of them can see about the others. It ran on a default nobody
          picked, in every brokerage, because nothing could write the
          row. */}
      <TeamVisibility />
    </div>
  );
}

/** "1 lead and 1 upcoming viewing", not "1 lead, 1 upcoming viewing". */
const and = (parts: string[]) =>
  new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" }).format(parts);

/**
 * What they hold, and who takes it.
 *
 * Shown before anything happens. The counts come from the server so the
 * question is asked about the real book, not the one the screen last
 * loaded; the default is the first colleague rather than "nobody",
 * because a book sent back to the pool is a book nobody is working
 * until somebody notices.
 */
function RemovePanel({
  name, userId, others, pending, error, onCancel, onConfirm,
}: {
  name: string;
  userId: string;
  others: { id: string; name: string }[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (handTo: string | null) => void;
}) {
  const { data } = api.org.removalPreview.useQuery({ userId });
  const [handTo, setHandTo] = useState<string>(others[0]?.id ?? "");
  const holds = data
    ? [
        data.leads && `${data.leads} lead${data.leads === 1 ? "" : "s"}`,
        data.viewings && `${data.viewings} upcoming viewing${data.viewings === 1 ? "" : "s"}`,
        data.followUps && `${data.followUps} open follow-up${data.followUps === 1 ? "" : "s"}`,
        data.listings && `${data.listings} listing${data.listings === 1 ? "" : "s"}`,
      ].filter((x): x is string => !!x)
    : [];

  return (
    <div className="basis-full bg-sunk rounded-lg p-4" role="group" aria-label={`Remove ${name}`}>
      <p className="text-ui text-ink">
        {!data ? `Checking what ${name} is holding…`
          : holds.length ? `${name} holds ${and(holds)}.`
          : `${name} holds no leads, viewings, follow-ups or listings.`}
      </p>
      {holds.length > 0 && (
        <label className="block mt-3">
          <span className="t-label text-ink-3 block mb-1.5">Hand them to</span>
          <select
            value={handTo}
            onChange={(e) => setHandTo(e.target.value)}
            className="min-h-11 px-3 text-control text-ink bg-ground border border-rule rounded-lg w-full max-w-[320px]"
          >
            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="">Nobody — back to the pool</option>
          </select>
        </label>
      )}
      <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
        Their seat stops today and they are signed out of this brokerage.
      </p>
      {error && <p role="alert" className="text-sm text-danger mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <Button variant="danger" loading={pending} disabled={!data}
          onClick={() => onConfirm(holds.length ? (handTo || null) : null)}>
          Remove {name.split(" ")[0]}
        </Button>
        <button type="button" className="btn-inline" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
