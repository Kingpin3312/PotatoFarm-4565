"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { QueryError } from "@/components/ui/query-state";

/**
 * What the assistant asks a buyer.
 *
 * This screen exists because of what it says at the top when the answer
 * is no. `assistant/run.ts` hands the conversation to a person when the
 * brokerage has no active qualification script, and **nothing in this
 * product had ever created one** — so the assistant had never answered
 * an enquiry, for anybody, ever. The failure was invisible from every
 * angle a brokerage looks from: a handover means a human replies, and a
 * human replying looks like a working inbox.
 *
 * There was also nowhere to look. The settings screen showed whether the
 * assistant was enabled, what it had spent and how many handovers there
 * had been — all true, all beside the point, none of it able to say the
 * assistant had no script and had therefore never run.
 *
 * So `configured` is the first thing this screen renders, and it is the
 * whole point of it.
 */
/**
 * Whether the assistant replies by itself while qualifying, with the
 * evidence beside the switch: what agents did with its drafts. An owner
 * deciding to let it send should be looking at that number when they do.
 */
const REPLY_MODES = [
  {
    key: "off", on: false, outOfHours: false, label: "Off",
    blurb: "Every reply is drafted for an agent to send.",
  },
  {
    key: "ooh", on: true, outOfHours: true, label: "Outside working hours",
    blurb: "While you are closed, it replies to new buyers by itself and qualifies them. While you are open, it drafts and an agent sends. The usual first step.",
  },
  {
    key: "always", on: true, outOfHours: false, label: "Always",
    blurb: "It replies to new buyers by itself at any hour while it qualifies them, then hands over to their agent.",
  },
] as const;

function AutoReply() {
  const { data: status } = api.assistant.status.useQuery();
  const { data: stats } = api.assistant.draftStats.useQuery();
  const utils = api.useUtils();
  const set = api.assistant.setAutoReply.useMutation({
    onSuccess: () => void utils.assistant.status.invalidate(),
  });
  if (!status) return null;
  const current = !status.autoReply ? "off" : status.autoReplyOutOfHours ? "ooh" : "always";
  return (
    <section className="border-t border-rule-strong pt-6 pb-8" aria-labelledby="auto-reply">
      <h2 id="auto-reply" className="text-sub font-semibold text-ink">Replies while qualifying</h2>
      <p className="text-sm text-ink-2 mt-2 max-w-[52ch]">
        When a new buyer writes, whether the assistant replies by itself within seconds, asking your
        questions one at a time, or drafts the reply for an agent. Once an agent writes in a
        conversation, it goes back to drafting there.
      </p>
      <div role="radiogroup" aria-labelledby="auto-reply" className="mt-4 grid gap-2 max-w-[560px]">
        {REPLY_MODES.map((m) => {
          const on = current === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={set.isPending}
              onClick={() => { if (!on) set.mutate({ on: m.on, outOfHours: m.outOfHours }); }}
              className={cn(
                "rounded-xl border px-4 py-3 text-start disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-[var(--ring)]",
                on ? "border-ink bg-sunk" : "border-rule hover:border-rule-strong",
              )}
            >
              <span className="flex items-baseline gap-2">
                <span className="text-control font-medium text-ink">{m.label}</span>
                {/* In words. The border alone is not a signal. */}
                {on && <span className="t-label text-accent-deep">Chosen</span>}
              </span>
              <span className="mt-1 block max-w-[52ch] text-sm leading-snug text-ink-2">{m.blurb}</span>
            </button>
          );
        })}
      </div>
      {current === "ooh" && (
        <p className="text-note text-ink-3 mt-3 max-w-[52ch]">
          Your hours are under <Link href="/settings/hours" className="text-ink">Settings → Working hours</Link>.
        </p>
      )}
      <p className="text-note text-ink-3 mt-3 max-w-[52ch]">
        It never claims to be a person, and says it is the brokerage&rsquo;s assistant if asked.
        “Stop everything” and “I&rsquo;ve got this” still stop it at once.
      </p>
      {stats && stats.sentAsWrittenPct !== null && (
        <p className="text-note text-ink-2 mt-2">
          Last 30 days: agents sent {stats.sentAsWrittenPct}% of {stats.decided} drafts exactly as written.
        </p>
      )}
      {set.error && <p role="alert" className="text-sm text-danger-deep mt-3">{set.error.message}</p>}
    </section>
  );
}

export default function AssistantScript() {
  const { data, isLoading, isError, refetch, error } = api.assistant.script.useQuery();
  const utils = api.useUtils();

  const [tone, setTone] = useState("");
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Copied in once, so a half-finished edit survives a background
  // refetch. Same reason as the working-hours form.
  useEffect(() => {
    if (!data) return;
    setTone(data.tone ?? "");
    setPrompts(Object.fromEntries(data.questions.map((q) => [q.key, q.prompt])));
  }, [data]);

  const save = api.assistant.updateScript.useMutation({
    onSuccess: () => { setFailed(null); setSaved(true); void utils.assistant.script.invalidate(); },
    onError: (e) => { setSaved(false); setFailed(e.message); },
  });

  if (isError) return <QueryError retry={() => void refetch()} what="the assistant's script" error={error} />;
  if (isLoading) {
    return <div className="max-w-[620px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;
  }

  const script = data!;

  return (
    <div className="max-w-[620px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">
          The assistant
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {script.configured ? "What it asks." : "It has no script."}
        </h1>
        {script.configured ? (
          <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
            Five questions, in this order, asked one at a time as the conversation allows.
            You can change the wording. The answers feed the pipeline, so what each question
            is <em>for</em> is fixed.
          </p>
        ) : (
          /* The state that was true for every brokerage until this
             screen existed, said in the words an owner would use. */
          <p className="text-sub text-ink mt-3 max-w-[50ch]">
            Without one the assistant cannot reply to anything — every enquiry goes straight
            to whoever is on the inbox. That is not an outage and nothing will alarm about
            it, because a person answering an enquiry looks exactly like a working inbox.
          </p>
        )}
      </header>

      {script.configured && <AutoReply />}

      {!script.configured ? (
        <p className="text-sm text-ink-2 max-w-[46ch]">
          Contact support. A script is created when a brokerage is set up, so a missing one
          means something went wrong at signup rather than a setting somebody turned off.
        </p>
      ) : (
        <form
          className="border-t border-rule-strong pt-6 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            setFailed(null);
            save.mutate({
              tone: tone.trim() || null,
              questions: script.questions.map((q) => ({
                key: q.key,
                prompt: prompts[q.key] ?? q.prompt,
              })),
            });
          }}
        >
          {failed && (
            <p role="alert" className="px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">{failed}</p>
          )}
          {saved && !failed && (
            <p role="status" className="px-3 py-2.5 border border-rule text-sm rounded-[3px] text-ink-2">
              Saved. The next enquiry uses it.
            </p>
          )}

          <ol className="flex flex-col gap-5">
            {script.questions.map((q, i) => (
              <li key={q.key} data-question={q.key}>
                <label htmlFor={`q-${q.key}`} className="flex items-baseline gap-2 mb-1.5">
                  <span className="t-label text-ink-3">
                    {i + 1} · {q.key}
                  </span>
                  {!q.required && (
                    <span className="t-label text-ink-3">
                      optional
                    </span>
                  )}
                </label>
                <input
                  id={`q-${q.key}`}
                  value={prompts[q.key] ?? ""}
                  onChange={(e) => setPrompts((p) => ({ ...p, [q.key]: e.target.value }))}
                  className="w-full min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
                />
                {q.options.length > 0 && (
                  <p className="mt-1.5 text-note text-ink-3 leading-snug">
                    Answers are matched to: {q.options.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>

          <div className="border-t border-rule pt-5">
            <label htmlFor="tone" className="block t-label text-ink-3 mb-2">
              Tone
            </label>
            <textarea
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
            />
            <p className="mt-1.5 text-note text-ink-3 max-w-[48ch] leading-snug">
              How it should sound, in your words. It cannot override the rules that stop it
              quoting a price nobody gave it or negotiating on your behalf.
            </p>
          </div>

          <div className="flex">
            <Button type="submit" variant="primary" loading={save.isPending} className="ms-auto">
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
