"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Whether I am taking work, and when I am away.
 *
 * Nothing ever wrote an `AgentAvailability` row. Routing reads it for
 * capacity, languages, communities and away-dates, so with no row every
 * agent silently defaulted to capacity 40 and always available — an
 * agent on leave kept receiving leads, and a brokerage that believed it
 * had set a limit had not.
 *
 * ## Why this is on an agent's own screen and needs no permission
 *
 * Marking a holiday is not a management task. Requiring a manager to do
 * it is how holidays stop being marked, and then a week of enquiries
 * lands on somebody in another country with their phone off.
 *
 * Capacity and specialisms are deliberately absent — they decide how
 * work is shared out between people, and an agent who can set their own
 * capacity to 400 has a lever nobody meant to give them. Those live on
 * the team screen.
 */
export function MyAvailability() {
  const { data } = api.org.availability.useQuery();
  const utils = api.useUtils();
  const [accepting, setAccepting] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Copied in once the query lands, so a half-finished edit survives a
  // background refetch.
  useEffect(() => {
    if (!data) return;
    setAccepting(data.acceptingLeads);
    setFrom(data.awayFrom ? new Date(data.awayFrom).toISOString().slice(0, 10) : "");
    setTo(data.awayTo ? new Date(data.awayTo).toISOString().slice(0, 10) : "");
    setNote(data.awayNote ?? "");
  }, [data]);

  const save = api.org.setAvailability.useMutation({
    onSuccess: () => { setFailed(null); setSaved(true); void utils.org.availability.invalidate(); },
    onError: (e) => { setSaved(false); setFailed(e.message); },
  });

  if (!data) return null;

  return (
    <section className="mt-12">
      <h2 className="font-sans font-semibold text-section text-accent-deep mb-1">
        Your availability
      </h2>
      <p className="text-sm text-ink-2 max-w-[52ch]">
        This is what decides whether a new enquiry comes to you. Nothing else on this screen
        changes who gets what.
      </p>

      {failed && (
        <p role="alert" className="mt-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
          {failed}
        </p>
      )}
      {saved && !failed && (
        <p role="status" className="mt-4 px-3 py-2.5 border border-rule text-sm rounded-[3px] text-ink-2">
          Saved.
        </p>
      )}

      <form
        className="border-t border-ink mt-5 pt-5 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          setFailed(null);
          save.mutate({
            acceptingLeads: accepting,
            // Midday UTC, not midnight: a date picked in Dubai and stored
            // at 00:00Z is the previous day for anyone reading it four
            // hours behind, and this decides who works next week.
            awayFrom: from ? new Date(`${from}T12:00:00.000Z`).toISOString() : null,
            awayTo: to ? new Date(`${to}T12:00:00.000Z`).toISOString() : null,
            awayNote: note.trim() || null,
          });
        }}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={accepting}
            onChange={(e) => setAccepting(e.target.checked)}
            className="size-5 mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-ui text-ink">Send me new leads</span>
            <span className="block text-note text-ink-3 max-w-[46ch] leading-snug">
              Off means routing skips you entirely. Leads you already have are unaffected —
              nobody takes work off you for this.
            </span>
          </span>
        </label>

        <div>
          <span className="block t-label text-ink-3 mb-2">
            Away
          </span>
          <div className="flex gap-3 flex-wrap items-end">
            <label className="flex flex-col gap-1">
              <span className="text-note text-ink-3">First day</span>
              <input
                type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                aria-label="First day away"
                className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-note text-ink-3">Last day</span>
              <input
                type="date" value={to} onChange={(e) => setTo(e.target.value)}
                aria-label="Last day away"
                className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
              />
            </label>
            {(from || to) && (
              <button
                type="button"
                onClick={() => { setFrom(""); setTo(""); setNote(""); }}
                className="min-h-11 px-2 bg-transparent border-0 text-note text-accent-deep underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <label className="flex flex-col gap-1 mt-3 max-w-[36ch]">
            <span className="text-note text-ink-3">Note (optional)</span>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Back Monday"
              aria-label="Away note"
              className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
            />
          </label>
        </div>

        <div className="flex">
          <Button type="submit" variant="primary" loading={save.isPending} className="ml-auto">
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}
