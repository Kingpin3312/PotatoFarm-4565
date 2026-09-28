"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/lib/trpc";

export type PickedLocation = { id: string; path: string };

/**
 * Where a property is, chosen from the location tree.
 *
 * The agent types a building, a sub-community or an area and picks the
 * exact place — the building, or a villa's sub-community. An area with
 * places beneath it is shown but not chosen: picking it narrows the
 * search to what is inside it, because "Dubai Marina" is a
 * neighbourhood, not an address, and Property Finder files a listing
 * under exactly the node it is given.
 *
 * The chosen id rides in a hidden input called `name`, so a form that
 * reads `FormData` gets it like any other field.
 */
export function LocationPicker({ name, initial, required }: {
  name: string;
  initial?: PickedLocation | null;
  required?: boolean;
}) {
  const id = useId();
  const [picked, setPicked] = useState<PickedLocation | null>(initial ?? null);
  const [typing, setTyping] = useState(!initial);
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 200);
    return () => clearTimeout(t);
  }, [typed]);

  const { data, isFetching } = api.locations.search.useQuery({ q }, { enabled: typing && q.length >= 2 });

  return (
    <div className="flex flex-col gap-1.5 col-span-2">
      <label htmlFor={id} className="t-label text-ink-3">
        Location{required && <span className="text-accent-deep"> *</span>}
      </label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />

      {picked && !typing ? (
        <div className="min-h-11 flex items-center justify-between gap-3 px-3 border border-rule rounded-[3px] bg-ground">
          <span className="text-control text-ink truncate" title={picked.path}>{picked.path}</span>
          <button type="button" className="btn-inline min-h-11 shrink-0" onClick={() => { setTyping(true); setTyped(""); }}>
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            id={id}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Building, sub-community or area"
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
          />
          <p id={`${id}-hint`} className="text-note text-ink-3">
            Choose the building, or the sub-community for a villa. Property Finder files the listing exactly there.
          </p>
          {q.length >= 2 && (
            <ul className="border border-rule rounded-[3px] max-h-64 overflow-y-auto" aria-label="Places">
              {isFetching && !data && <li className="px-3 py-2 text-sm text-ink-3">Looking…</li>}
              {data?.results.length === 0 && (
                <li className="px-3 py-2 text-sm text-ink-3">Nothing on the list matches. Try the building’s or community’s name.</li>
              )}
              {data?.results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (r.exact) { setPicked({ id: r.id, path: r.path }); setTyping(false); }
                      else setTyped(r.path.split(" > ").pop() ?? r.path);
                    }}
                    className="w-full min-h-11 flex items-baseline justify-between gap-3 px-3 py-2 text-start hover:bg-sunk focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
                  >
                    <span className={r.exact ? "text-sm text-ink" : "text-sm text-ink-3"}>{r.path}</span>
                    <span className="t-label text-ink-3 shrink-0">{r.exact ? "" : "Area — look inside"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked && (
            <button type="button" className="btn-inline self-start" onClick={() => setTyping(false)}>
              Keep {picked.path.split(" > ").pop()}
            </button>
          )}
        </>
      )}
    </div>
  );
}
