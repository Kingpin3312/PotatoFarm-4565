import { Button } from "./button";

/**
 * What a failed fetch looks like.
 *
 * Every screen was rendering an error as an empty list, which reads as
 * "you have no leads" rather than "this is broken". An agent seeing an
 * empty pipeline on a Monday morning assumes the worst thing, and it is
 * the wrong worst thing.
 */
export function QueryError({ retry, what }: { retry: () => void; what: string }) {
  return (
    <div role="alert" className="px-6 py-10 max-w-[46ch]">
      <p className="text-[15px] text-ink font-semibold">Couldn&rsquo;t load {what}.</p>
      <p className="text-sm text-ink-2 mt-1.5">
        Nothing is lost — this is a problem fetching, not a problem with your data.
      </p>
      <Button className="mt-4" onClick={retry}>Try again</Button>
    </div>
  );
}
