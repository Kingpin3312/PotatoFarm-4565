"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * What agents can see about each other.
 *
 * Nothing ever wrote a `TeamVisibility` row, so every brokerage ran on
 * `RANKED` with a 24-hour head start whether it suited them or not.
 * Both defaults are defensible — that is why they are the defaults —
 * and neither was ever anybody's decision.
 *
 * `leaderboard.ts` records where this came from, from the first agent
 * test, and it is the whole argument for the feature:
 *
 *   *"If I can see my own numbers before my manager does, it's a tool.
 *   If he sees them first, it's surveillance."*
 *
 * ## Why the options are described by what an agent sees
 *
 * Not by their names. `RANKED` means nothing to an owner deciding
 * between them, and the difference that matters is not the label — it
 * is whether the slowest person in the room can be identified by
 * everyone else on a Monday morning.
 */

const MODES = [
  {
    value: "OPEN" as const,
    title: "Everyone sees everything",
    detail:
      "Full board, every name, every figure. Most brokerages land here and agents are "
      + "competitive — but it should be a decision rather than something that happened.",
  },
  {
    value: "RANKED" as const,
    title: "Your own figures, and where you rank",
    detail:
      "You see your numbers and your position. Everyone else appears as a position "
      + "without their numbers. Enough to know whether to worry, not enough to "
      + "humiliate anybody in a meeting.",
  },
  {
    value: "PRIVATE" as const,
    title: "Your own figures only",
    detail:
      "No ranking, no colleagues. For a brokerage that has been burned by a "
      + "leaderboard before.",
  },
];

export function TeamVisibility() {
  const { data } = api.org.teamVisibility.useQuery();
  const utils = api.useUtils();

  const [mode, setMode] = useState<"OPEN" | "RANKED" | "PRIVATE">("RANKED");
  const [hours, setHours] = useState(24);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setMode(data.mode as typeof mode);
    setHours(data.agentHeadStartHours);
  }, [data]);

  const save = api.org.setTeamVisibility.useMutation({
    onSuccess: () => {
      setFailed(null);
      setSaved(true);
      void utils.org.teamVisibility.invalidate();
      // The board is computed from this policy, so it is wrong the
      // moment the policy changes.
      void utils.reports.leaderboard.invalidate();
    },
    onError: (e) => { setSaved(false); setFailed(e.message); },
  });

  if (!data) return null;

  return (
    <section className="mt-14" data-visibility>
      <h2 className="font-sans font-semibold text-section text-ink mb-1">
        What agents see about each other
      </h2>
      <p className="text-sm text-ink-2 max-w-[54ch]">
        The board is the first thing most agents open. What it shows them about everyone
        else is the part worth choosing deliberately.
      </p>
      {/* Said here rather than discovered. An owner choosing the most
          private option should not believe it hides the team from
          managers — the head start is what protects an agent from a
          manager, and it is the setting below. */}
      <p className="text-sm text-ink-2 mt-2 max-w-[54ch]">
        These settle what <em>agents</em> see of each other. Managers and owners always
        see the whole team; what protects an agent from their manager is the head start.
      </p>

      {/* The state every brokerage was in until this screen existed. */}
      {!data.set && (
        <p className="text-sm text-ink mt-3 max-w-[54ch]">
          Nobody has chosen yet, so this brokerage is running on the defaults below.
        </p>
      )}

      {!data.canChange && (
        <p className="text-sm text-ink-2 mt-3 max-w-[54ch]">
          Shown to everyone, changed by an admin. You are entitled to know what your
          colleagues can see about you.
        </p>
      )}

      {failed && (
        <p role="alert" className="mt-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
          {failed}
        </p>
      )}
      {saved && !failed && (
        <p role="status" className="mt-4 px-3 py-2.5 border border-rule text-sm rounded-[3px] text-ink-2">
          Saved. Everyone&rsquo;s board changes on their next look.
        </p>
      )}

      <form
        className="border-t border-ink mt-5 pt-5 flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          setFailed(null);
          save.mutate({ mode, agentHeadStartHours: hours });
        }}
      >
        <fieldset className="border-0 p-0 m-0 flex flex-col gap-2.5" disabled={!data.canChange}>
          <legend className="t-label text-ink-3 mb-1.5">
            The board
          </legend>
          {MODES.map((m) => (
            <label
              key={m.value}
              data-mode={m.value}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer",
                mode === m.value ? "border-accent-edge bg-sunk" : "border-rule",
                !data.canChange && "cursor-default opacity-70",
              )}
            >
              <input
                type="radio"
                name="mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="size-5 mt-0.5 accent-[var(--accent)] shrink-0"
              />
              <span>
                <span className="block text-ui text-ink font-medium">{m.title}</span>
                <span className="block text-note text-ink-3 max-w-[48ch] leading-snug mt-0.5">
                  {m.detail}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <label
            htmlFor="headstart"
            className="block t-label text-ink-3 mb-2"
          >
            Head start
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              id="headstart"
              type="number"
              min={0}
              max={168}
              value={hours}
              disabled={!data.canChange}
              onChange={(e) => setHours(Math.max(0, Math.min(168, Number(e.target.value) || 0)))}
              className="w-[8ch] min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink tabular"
            />
            <span className="text-ui text-ink-2">hours</span>
          </div>
          {/* Said in terms of the consequence, because the number on its
              own does not explain itself. */}
          <p className="mt-2 text-note text-ink-3 max-w-[52ch] leading-snug">
            {hours === 0
              ? "No head start. Managers and agents see the same figures at the same moment."
              : `A manager's board stops ${hours} hours short, so an agent sees a bad day
                 before anyone else does and can raise it themselves. A number your manager
                 raises first is one you learn to manage rather than improve.`}
          </p>
        </div>

        {data.canChange && (
          <div className="flex">
            <Button type="submit" variant="primary" loading={save.isPending} className="ms-auto">
              Save
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
