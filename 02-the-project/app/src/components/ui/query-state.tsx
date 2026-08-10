import { Button } from "./button";

/**
 * What a failed fetch looks like.
 *
 * Every screen was rendering an error as an empty list, which reads as
 * "you have no leads" rather than "this is broken". An agent seeing an
 * empty pipeline on a Monday morning assumes the worst thing, and it is
 * the wrong worst thing.
 *
 * **It also used to state a cause it did not know.** The copy said "this
 * is a problem fetching, not a problem with your data" on every failure
 * — including the one where the server had refused on purpose. A VIEWER
 * opening the activity log was told the software was broken and given a
 * Try again button that could never work, because the real answer was
 * that their role does not allow it. Three screens did this, and it is
 * the difference between a colleague who asks for access and one who
 * reports a bug.
 */

/** Refused because of the role. Signing in again will not help. */
function refused(error?: { data?: { code?: string } | null } | null): boolean {
  return error?.data?.code === "FORBIDDEN";
}

/**
 * Signed out — which is a different thing entirely.
 *
 * These two were treated as one, so a session that expired mid-shift
 * told an agent "you don't have access to your leads". They had access
 * ten minutes ago; what they need is a way back in, not an explanation
 * of permissions.
 */
function signedOut(error?: { data?: { code?: string } | null } | null): boolean {
  return error?.data?.code === "UNAUTHORIZED";
}

/** It is not there — a stale link, or something somebody deleted. */
function missing(error?: { data?: { code?: string } | null } | null): boolean {
  return error?.data?.code === "NOT_FOUND";
}

export function QueryError({
  retry,
  what,
  error,
}: {
  retry: () => void;
  what: string;
  /**
   * The query's error, when the caller has it. Optional so the fifty
   * existing call sites keep working — without it the copy stays
   * truthful, it just cannot be specific.
   */
  error?: { data?: { code?: string } | null; message?: string } | null;
}) {
  if (signedOut(error)) {
    return (
      <div role="alert" className="px-6 py-10 max-w-[46ch]">
        <p className="text-[15px] text-ink font-semibold">You&rsquo;ve been signed out.</p>
        <p className="text-sm text-ink-2 mt-1.5">
          Sessions don&rsquo;t last forever. Sign in again and you&rsquo;ll come straight
          back here.
        </p>
        <a
          href={`/sign-in?next=${encodeURIComponent(
            typeof window === "undefined" ? "/" : window.location.pathname + window.location.search
          )}`}
          className="btn-inline mt-4 inline-flex min-h-11 items-center"
        >
          Sign in
        </a>
      </div>
    );
  }

  if (missing(error)) {
    return (
      <div role="alert" className="px-6 py-10 max-w-[46ch]">
        <p className="text-[15px] text-ink font-semibold">
          We can&rsquo;t find {what}.
        </p>
        <p className="text-sm text-ink-2 mt-1.5">
          It may have been deleted, or the link may be out of date. Nothing else is
          affected.
        </p>
        {/* No Try again: it will not appear on a second attempt. */}
      </div>
    );
  }

  if (refused(error)) {
    return (
      <div role="alert" className="px-6 py-10 max-w-[46ch]">
        <p className="text-[15px] text-ink font-semibold">
          You don&rsquo;t have access to {what}.
        </p>
        <p className="text-sm text-ink-2 mt-1.5">
          Nothing is broken — your role doesn&rsquo;t include this. An owner or admin
          can change it in Settings.
        </p>
        {/* Deliberately no Try again. A button that cannot ever succeed
            is worse than no button: it teaches people to keep pressing. */}
      </div>
    );
  }

  return (
    <div role="alert" className="px-6 py-10 max-w-[46ch]">
      <p className="text-[15px] text-ink font-semibold">Couldn&rsquo;t load {what}.</p>
      <p className="text-sm text-ink-2 mt-1.5">
        Nothing is lost — your data is safe. This is usually the connection.
      </p>
      <Button className="mt-4" onClick={retry}>Try again</Button>
    </div>
  );
}
