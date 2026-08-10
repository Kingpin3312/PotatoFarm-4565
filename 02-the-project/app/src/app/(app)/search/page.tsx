"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { QueryError } from "@/components/ui/query-state";

/**
 * Ask it in English.
 *
 * The question an agent has fifty times a week and could not ask
 * anywhere in this product: *who was that Emirati investor looking in
 * Downtown around four million?* Until now the only search was a name
 * and a phone number, on two screens, each looking at one table.
 *
 * **The interpretation is shown, always.** Above the results, in the
 * agent's own words: "AED 3.4m–4.6m · Downtown · investors". A search
 * that silently reinterprets the question is a search nobody trusts
 * twice, and the honest version also teaches the phrasing that works.
 */
export default function SearchPage() {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");

  const { data, isFetching, isError, refetch, error } = api.search.ask.useQuery(
    { q: asked },
    { enabled: asked.length > 0 }
  );

  return (
    <div className="mx-auto max-w-[680px] px-6 pb-28">
      <header className="pt-10 pb-5">
        <h1 className="font-sans text-[clamp(2rem,1.5rem+2vw,2.5rem)] font-semibold leading-none -tracking-[0.026em] text-ink">
          Find anyone
        </h1>
        <p className="mt-3 max-w-[48ch] text-[15px] leading-snug text-ink-2">
          Ask the way you&rsquo;d ask a colleague. People, owners and properties, all
          in one place.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); setAsked(text.trim()); }}
        className="flex gap-2 border-t border-ink pt-5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Not `type="search"` — Safari's clear button is a native
          // control that ignores the theme and sits on the wrong side.
          type="text"
          /**
           * No `autoFocus`, and it was there until a keyboard test.
           *
           * Focusing the field on load drops everybody straight into
           * the middle of the page: the first Tab went to an example
           * chip instead of the skip link, and a screen-reader user
           * landed on an unlabelled text box having never heard the
           * heading that says what the page is.
           *
           * It costs a sighted keyboard user one keystroke. It costs
           * everybody else the answer to "where am I".
           */
          maxLength={200}
          aria-label="What are you looking for?"
          placeholder="Emirati investor in Downtown around 4 million"
          className="min-h-11 flex-1 rounded-lg border border-rule bg-raised px-3.5 text-[16px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="min-h-11 shrink-0 rounded-lg border border-ink bg-ink px-4 text-[15px] font-semibold text-ground disabled:opacity-40"
        >
          Find
        </button>
      </form>

      {/* The phrasings that work, shown before anybody has typed. An
          empty box with no examples teaches nothing and gets used once. */}
      {!asked && (
        <div className="mt-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Try
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <li key={e}>
                <button
                  onClick={() => { setText(e); setAsked(e); }}
                  // 44px, not the 34px this shipped with. The design
                  // system says 44 and the sweep caught these at 34 —
                  // a chip is exactly the sort of small control that
                  // gets an approximate tap and does nothing.
                  className="inline-flex min-h-11 items-center rounded-full border border-rule px-4 text-[13px] text-ink-2 hover:border-rule-strong hover:text-ink"
                >
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {asked && (
        <section className="mt-7">
          {/**
           * Everything that changes without the page changing goes in
           * one polite status region.
           *
           * Results arrive by fetch, so nothing navigates and a screen
           * reader says nothing at all — the user is left holding a
           * search box wondering whether it worked. The list itself
           * stays *outside* the region on purpose: announcing thirty
           * rows is worse than announcing none. What gets read is the
           * count and how the question was understood, which is the
           * same thing a sighted user takes from a glance.
           */}
          <div role="status" aria-live="polite">
            {/* What it understood. Never hidden, even when it understood
                nothing — "nothing structured" is itself the explanation
                for a disappointing result. */}
            {data && (
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {data.reading.length ? `Read as: ${data.reading.join(" · ")}` : "Searched as words"}
              </p>
            )}

            {isFetching && <p className="mt-3 text-sm text-ink-3">Looking…</p>}

            {data && !isFetching && data.hits.length > 0 && (
              <p className="mt-2 text-[15px] text-ink">{summary(data.counts)}</p>
            )}
          </div>

          {isError && (
            <div className="mt-3">
              <QueryError retry={() => void refetch()} what="those results" error={error} />
            </div>
          )}

          {data?.nothingToSearch && (
            <p className="mt-3 max-w-[46ch] text-[15px] leading-snug text-ink-2">
              There isn&rsquo;t anything in that to search on. Add a name, an area, a
              budget or something you remember about them.
            </p>
          )}

          {data && !data.nothingToSearch && data.empty && !isFetching && (
            <p className="mt-3 max-w-[46ch] text-[15px] leading-snug text-ink-2">
              Nothing matched. If you were expecting somebody, it may be that what
              you remember about them was never written down.
            </p>
          )}

          {data && data.hits.length > 0 && (
            <>
              <ul className="mt-3 border-t border-ink">
                {data.hits.map((h) => (
                  <li key={`${h.kind}:${h.id}`} className="border-b border-rule py-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className="w-[68px] shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
                        {LABEL[h.kind]}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-ink">
                          {h.href ? (
                            <Link href={h.href} className="hover:underline">{h.title}</Link>
                          ) : (
                            <span className={cn(h.restricted && "text-ink-2")}>{h.title}</span>
                          )}
                        </p>

                        {h.subtitle && (
                          <p className="mt-0.5 font-mono text-[11px] text-ink-3">{h.subtitle}</p>
                        )}

                        {/* Why it came back. The agent is about to ring
                            this person and needs a reason to open with. */}
                        {h.why.length > 0 && (
                          <p className="mt-0.5 max-w-[52ch] text-sm leading-snug text-ink-2">
                            {h.why.slice(0, 3).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

const LABEL: Record<"person" | "owner" | "property", string> = {
  person: "person",
  owner: "owner",
  property: "property",
};

const EXAMPLES = [
  "Emirati investor in Downtown around 4 million",
  "3 bed in Dubai Marina under 3m",
  "sellers in Palm Jumeirah",
  "anyone relocating",
];

/** "Four people and two properties." Said, not tallied. */
function summary(c: { people: number; owners: number; properties: number }): string {
  const parts: string[] = [];
  const say = (n: number, one: string, many: string) =>
    n === 1 ? `1 ${one}` : `${n} ${many}`;

  if (c.people) parts.push(say(c.people, "person", "people"));
  if (c.owners) parts.push(say(c.owners, "owner", "owners"));
  if (c.properties) parts.push(say(c.properties, "property", "properties"));

  if (!parts.length) return "Nothing matched.";
  if (parts.length === 1) return `${parts[0]}.`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
}
