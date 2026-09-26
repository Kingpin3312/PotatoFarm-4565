"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";

/**
 * Your mailbox, on each client's timeline.
 *
 * Connected per agent. Only mail with somebody the brokerage already
 * knows is kept, and only who, when, the subject and a short snippet —
 * never the body, which stays in the mailbox it came from.
 */
function EmailSettings() {
  const params = useSearchParams();
  const { data, isError, error, refetch } = api.email.status.useQuery();
  const disconnect = api.email.disconnect.useMutation({ onSuccess: () => void refetch() });
  const connected = params.get("connected");
  const problem = params.get("problem");

  if (isError) return <QueryError retry={() => void refetch()} what="your mailbox" error={error} />;

  return (
    <div className="max-w-[640px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">Email</span>
        <h1 className="font-sans font-semibold text-page text-ink">Your mailbox</h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
          Mail with your clients appears on their page beside WhatsApp. Only mail with somebody already
          on the book is kept, and only who it was with, when, the subject and a line of it — never the
          whole message, and nothing else from your inbox.
        </p>
      </header>

      {connected && <p role="status" className="text-ui text-ink mb-6">Connected {connected}. Mail with your clients will appear on their pages.</p>}
      {problem && <p role="alert" className="text-ui text-danger mb-6">{problem}</p>}

      <section aria-labelledby="yours" className="border-t border-rule-strong pt-5">
        <h2 id="yours" className="font-sans font-semibold text-section text-ink">Connected</h2>
        {data && data.accounts.length === 0 && <p className="text-sm text-ink-3 mt-2">Nothing yet.</p>}
        <ul>
          {(data?.accounts ?? []).map((a) => (
            <li key={a.id} data-mailbox={a.address} className="py-3 border-b border-rule flex items-baseline gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-ui text-ink">{a.address}</p>
                <p className={a.lastError ? "text-sm text-danger" : "text-sm text-ink-3"}>
                  {a.lastError ?? (a.lastSyncedAt
                    ? `${a.messages} message${a.messages === 1 ? "" : "s"} logged · last checked ${new Date(a.lastSyncedAt).toLocaleString("en-GB")}`
                    : "Waiting for the first check")}
                </p>
              </div>
              <button type="button" className="btn-inline min-h-11 ms-auto" disabled={disconnect.isPending}
                onClick={() => disconnect.mutate({ id: a.id })}>
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="add" className="mt-10">
        <h2 id="add" className="font-sans font-semibold text-section text-ink">Connect a mailbox</h2>
        <div className="mt-3 flex flex-col gap-3">
          <Connect provider="google" label="Google (Gmail, Workspace)" ready={data?.google} />
          <Connect provider="microsoft" label="Microsoft (Outlook, 365)" ready={data?.microsoft} />
        </div>
      </section>
    </div>
  );
}

function Connect({ provider, label, ready }: { provider: string; label: string; ready?: boolean }) {
  if (ready === undefined) return null;
  return ready ? (
    <a href={`/api/oauth/${provider}/start`} className="btn-inline min-h-11 inline-flex items-center">{`Connect ${label}`}</a>
  ) : (
    <p className="text-sm text-ink-3">{label}: not set up on this installation yet. Whoever runs it needs to register the app with the provider.</p>
  );
}

export default function Page() {
  return <Suspense><EmailSettings /></Suspense>;
}
