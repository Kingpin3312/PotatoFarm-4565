"use client";

import { use, useEffect } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * The other end of an invitation link.
 *
 * `org.acceptInvite` was mounted with no page behind it, so the Team
 * screen could send invitations that nobody could accept.
 *
 * The router requires a session before it will accept — so this handles
 * both states rather than throwing "sign in first" at somebody who has
 * just clicked a link from their email. Being bounced to a login with no
 * explanation is where people give up.
 */
export default function Invite({ searchParams }: {
  // Next 15 passes this as a Promise, the same as `params`.
  searchParams: Promise<{ token?: string }>;
}) {
  const { token: tokenParam } = use(searchParams);
  const token = tokenParam ?? "";

  /**
   * `org.mine` returns the brokerages this user belongs to. It has no
   * `userId` on it — the screen read `session?.userId` and got
   * `undefined` every time, so an already-signed-in agent never had
   * their invitation accepted and sat looking at a sign-in prompt they
   * did not need.
   *
   * A successful response is itself the proof of a session: the
   * procedure is behind `orgProcedure` and throws UNAUTHORIZED
   * otherwise. An empty array is a signed-in user with no brokerage
   * yet, which is exactly who follows an invitation link.
   */
  const { data: memberships, isLoading: checking } = api.org.mine.useQuery(undefined, {
    retry: false,
  });
  const signedIn = memberships !== undefined;
  const accept = api.org.acceptInvite.useMutation();

  // Signed in already — accept without making them press anything. They
  // clicked a link that says "join"; a second button asking the same
  // question is friction with no purpose.
  useEffect(() => {
    if (signedIn && token && accept.isIdle) accept.mutate({ token });
  }, [signedIn, token, accept]);

  if (!token) {
    return (
      <Shell title="That link is incomplete.">
        <p className="text-sub text-ink-2 max-w-[42ch]">
          It may have been cut short by an email client. Ask whoever invited you to send it
          again — the link only works once and expires after seven days.
        </p>
      </Shell>
    );
  }

  if (accept.isSuccess) {
    return (
      <Shell title={`You're in.`}>
        <p className="text-sub text-ink-2 max-w-[42ch]">
          You've joined {accept.data.orgName}. Your leads will start arriving here.
        </p>
        <a href="/inbox" className="btn-inline mt-6 inline-block">Open the inbox</a>
      </Shell>
    );
  }

  if (accept.error) {
    const expired = /expire|used|invalid/i.test(accept.error.message);
    return (
      <Shell title={expired ? "That link has been used." : "That didn't work."}>
        <p className="text-sub text-ink-2 max-w-[44ch]">
          {expired
            ? "An invitation works once and lasts seven days. Ask for a new one — it takes them a few seconds."
            : accept.error.message}
        </p>
      </Shell>
    );
  }

  if (checking || accept.isPending) {
    return <Shell title="One moment."><span className="sr-only">Joining</span></Shell>;
  }

  // Not signed in. The link is preserved through the sign-in so they
  // land back here rather than on an inbox that is not theirs yet.
  return (
    <Shell title="Sign in to join.">
      <p className="text-sub text-ink-2 max-w-[44ch]">
        We'll email you a link — there's no password to choose. You'll come straight back
        here and the invitation will be waiting.
      </p>
      <Button variant="primary" className="mt-6"
        onClick={() => {
          const next = encodeURIComponent(`/invite?token=${token}`);
          window.location.href = `/auth/signin?next=${next}`;
        }}>
        Sign in
      </Button>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="max-w-[46ch] mx-auto px-6 py-24">
      <h1 className="font-sans font-semibold text-h2 text-ink leading-tight">
        {title}
      </h1>
      <div className="mt-4">{children}</div>
    </main>
  );
}
