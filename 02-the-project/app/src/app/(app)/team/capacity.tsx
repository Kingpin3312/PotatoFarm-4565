"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * How work is shared out.
 *
 * The half of `AgentAvailability` that is a management decision:
 * capacity, and which languages and communities somebody is routed
 * leads for. An agent sets their own away dates on /me; they do not set
 * their own capacity, because that decides how much of the brokerage's
 * work comes to them rather than to a colleague.
 *
 * ## Why every agent is listed, including the ones with no row
 *
 * Because the defaults are already in force. Routing applies capacity
 * 40 and "accepting leads" to anybody with no record, so a list of only
 * the configured half would hide the fact that most of the brokerage is
 * on a number nobody chose. The row says "default" rather than showing
 * a blank.
 */
export function TeamCapacity() {
  const { data } = api.org.teamAvailability.useQuery();
  const [editing, setEditing] = useState<string | null>(null);

  if (!data) return null;

  const unset = data.filter((a) => !a.set).length;

  return (
    <section className="mt-14">
      <h2 className="font-sans font-semibold -tracking-[0.024em] text-[22px] text-accent-type mb-1">
        Who gets what
      </h2>
      <p className="text-sm text-ink-2 max-w-[54ch]">
        {unset === 0
          ? "Capacity and specialisms decide how new leads are shared out."
          : `${unset} of ${data.length} are on the defaults — capacity 40, every language, ` +
            "every community. Routing is already applying that."}
      </p>

      <div className="border-t border-ink mt-5">
        {data.map((a) => (
          <div key={a.userId} className="py-4 border-b border-rule">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[16px] text-ink font-semibold">{a.name}</span>

              {/* State in words, never colour alone. */}
              {a.awayNow ? (
                <Tag warn>Away</Tag>
              ) : !a.acceptingLeads ? (
                <Tag warn>Not taking leads</Tag>
              ) : !a.set ? (
                <Tag>Default</Tag>
              ) : null}

              <span className="ml-auto font-mono text-[12px] text-ink-3">
                capacity {a.capacity}
              </span>
              <button
                type="button"
                onClick={() => setEditing(editing === a.userId ? null : a.userId)}
                className="min-h-11 text-[14px] bg-transparent border-0 p-0 text-accent-deep underline cursor-pointer"
              >
                {editing === a.userId ? "Cancel" : "Change"}
              </button>
            </div>

            <p className="font-mono text-[11px] text-ink-3 mt-1">
              {a.languages.length ? a.languages.join(", ") : "any language"}
              {" · "}
              {a.communities.length ? a.communities.join(", ") : "any community"}
            </p>

            {editing === a.userId && (
              <Editor
                userId={a.userId}
                name={a.name}
                capacity={a.capacity}
                languages={a.languages}
                communities={a.communities}
                onDone={() => setEditing(null)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Editor({
  userId, name, capacity, languages, communities, onDone,
}: {
  userId: string; name: string; capacity: number;
  languages: string[]; communities: string[]; onDone: () => void;
}) {
  const utils = api.useUtils();
  const [cap, setCap] = useState(String(capacity));
  const [langs, setLangs] = useState(languages.join(", "));
  const [comms, setComms] = useState(communities.join(", "));
  const [failed, setFailed] = useState<string | null>(null);

  const save = api.org.setTeamAvailability.useMutation({
    onSuccess: () => { void utils.org.teamAvailability.invalidate(); onDone(); },
    onError: (e) => setFailed(e.message),
  });

  /**
   * Comma-separated, split and trimmed, empties dropped.
   *
   * "en, ar," is what a person types, and `split(",")` on it yields a
   * trailing empty string — which the procedure would reject as a
   * language of zero length, on a form that looks correctly filled in.
   */
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <form
      className="mt-3 border border-rule rounded-[3px] p-4 bg-ground"
      onSubmit={(e) => {
        e.preventDefault();
        setFailed(null);
        const n = Number(cap.trim());
        if (!Number.isInteger(n) || n < 1) {
          setFailed("Capacity is a whole number of open leads, at least 1.");
          return;
        }
        save.mutate({ userId, capacity: n, languages: list(langs), communities: list(comms) });
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-3">{name}</p>

      {failed && (
        <p role="alert" className="mb-3 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
          {failed}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 max-w-[14ch]">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Capacity</span>
          <input
            value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric"
            aria-label={`${name} capacity, in open leads`}
            className="min-h-11 px-3 text-[16px] bg-raised border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
          />
          <span className="text-[12px] text-ink-3 leading-snug">
            Open leads. Past it, routing skips them.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Languages</span>
          <input
            value={langs} onChange={(e) => setLangs(e.target.value)} placeholder="en, ar"
            aria-label={`${name} languages`}
            className="min-h-11 px-3 text-[16px] bg-raised border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
          />
          {/* Empty is the permissive answer, not the restrictive one, and
              that is worth saying on the form: an empty list means every
              language, so somebody "clearing" it widens their intake. */}
          <span className="text-[12px] text-ink-3 leading-snug">
            Leave empty for any language.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">Communities</span>
          <input
            value={comms} onChange={(e) => setComms(e.target.value)} placeholder="Dubai Marina, JBR"
            aria-label={`${name} communities`}
            className="min-h-11 px-3 text-[16px] bg-raised border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
          />
          <span className="text-[12px] text-ink-3 leading-snug">
            Leave empty for any community.
          </span>
        </label>
      </div>

      <div className="flex mt-4">
        <Button type="submit" variant="primary" size="sm" loading={save.isPending} className="ml-auto">
          Save
        </Button>
      </div>
    </form>
  );
}

function Tag({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={cn(
      "font-mono text-[9px] uppercase tracking-[0.1em] border rounded-[2px] px-1.5 py-0.5",
      warn ? "text-accent-deep border-accent-edge" : "text-ink-3 border-rule border-dashed",
    )}>
      {children}
    </span>
  );
}
