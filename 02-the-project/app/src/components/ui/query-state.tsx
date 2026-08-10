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

/** Refused on purpose, rather than failed. */
function refused(error?: { data?: { code?: string } | null } | null): boolean {
  const code = error?.data?.code;
  return code === "FORBIDDEN" || code === "UNAUTHORIZED";
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
