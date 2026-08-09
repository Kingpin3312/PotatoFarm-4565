"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { aedWhole } from "@/lib/money";

/**
 * The natural-language surface, in one place.
 *
 * It lives here rather than on the Ask screen because the command centre
 * needs the same thing, and two copies of an input that turns a sentence
 * into CRM writes is two places for the guardrails to drift. The Ask
 * screen and the front door render the same component.
 *
 * `compact` is the only difference between them: on the front door the
 * examples are hidden until the field is focused, because that screen is
 * a list of priorities with a command line above it, not a page about
 * asking.
 */
export function Ask({ compact = false }: { compact?: boolean }) {
  const utils = api.useUtils();
  const interpret = api.requests.interpret.useMutation({
    onSettled: () => {
      void utils.requests.mine.invalidate();
      // A spoken request can create a lead, a requirement and a
      // follow-up. The priorities above it are stale the moment it
      // lands, and an agent who acts on a stale list blames the list.
      void utils.today.brief.invalidate();
    },
  });
  const comps = api.requests.comparables.useMutation();

  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [focused, setFocused] = useState(false);
  const rec = useRef<{ stop: () => void } | null>(null);

  function speak() {
    /**
     * Web Speech where it exists, and it does not exist on an iPhone.
     *
     * `webkitSpeechRecognition` is not implemented in iOS Safari, and
     * every browser on iOS uses the Safari engine — so this fails on
     * Chrome and Firefox there too. The audit named it: the primary
     * interaction and the primary device do not currently meet.
     *
     * The honest fallback is the keyboard and a message saying so,
     * rather than a button that appears to work and does nothing.
     * Server-side transcription is the real fix and is its own change.
     */
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => never })
      .webkitSpeechRecognition;
    if (!SR) {
      alert("Your browser won't do speech. Type it instead — it works the same.");
      return;
    }
    const r = new SR() as unknown as {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: (e: { results: { transcript: string }[][] }) => void;
      onend: () => void; start: () => void; stop: () => void;
    };
    r.lang = "en-AE";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => setText(
      Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(""));
    r.onend = () => setListening(false);
    r.start();
    rec.current = r;
    setListening(true);
  }

  const c = interpret.data;
  const showExamples = !compact || focused || text.length > 0;

  return (
    <div>
      <label htmlFor="ask" className="sr-only">Your request</label>
      <textarea
        id="ask"
        rows={compact ? 2 : 3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={compact ? "Tell me what happened, or what you need…" : "Speak or type…"}
        className="w-full rounded-xl border border-rule bg-sunk px-4 py-3 text-[16px] text-ink focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
      />

      {showExamples && (
        <p className="mt-2 max-w-[52ch] text-sm leading-snug text-ink-3">
          &ldquo;Met Sarah today, after a four-bed villa in Dubai Hills around twelve
          million, moving within three months.&rdquo; &ldquo;What are two-beds going for
          in Marina Gate.&rdquo; &ldquo;Book Tuesday afternoon at the Damac flat.&rdquo;
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant={listening ? "primary" : "secondary"}
          onClick={() => (listening ? (rec.current?.stop(), setListening(false)) : speak())}
        >
          {listening ? "Listening — tap to stop" : "Speak"}
        </Button>
        <Button
          variant="primary"
          loading={interpret.isPending}
          disabled={text.trim().length < 3}
          onClick={() => interpret.mutate({ transcript: text })}
        >
          Go
        </Button>
      </div>

      {/* Unclear comes back as one question, not an apology and a list.
          An agent in a car answers one thing. */}
      {c?.recipe === "UNCLEAR" && (
        <div className="mt-6 rounded-xl border-l-[3px] border-l-accent-edge bg-sunk p-4">
          <p className="text-[16px] text-ink">{c.question}</p>
        </div>
      )}

      {c && c.recipe === "COMPARABLES" && !comps.data && (
        <div className="mt-6 rounded-xl bg-sunk p-4">
          <p className="mb-3 text-[15px] text-ink-2">
            Comparables for <strong className="text-ink">{c.entities.building ?? "—"}</strong>.
            How many bedrooms?
          </p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((b) => (
              <Button key={b} variant="secondary" loading={comps.isPending}
                onClick={() => comps.mutate({ building: c.entities.building ?? text, beds: b })}>
                {b} bed
              </Button>
            ))}
          </div>
        </div>
      )}

      {comps.data && <Report r={comps.data} />}

      {/* Three shapes on purpose: done, one question, or a refusal with a
          reason the agent can act on. Never a spinner that resolves into
          nothing. */}
      {c?.outcome && c.recipe !== "COMPARABLES" && (
        <div className={cn("mt-6 rounded-xl p-4",
          c.outcome.kind === "REFUSED"
            ? "border-l-[3px] border-l-accent-edge bg-sunk" : "bg-sunk")}>
          {c.outcome.kind === "DONE" && (
            <>
              <p className="text-[16px] text-ink">{c.outcome.summary}</p>
              {c.outcome.caveats?.map((x, i) => (
                <p key={i} className="mt-2 max-w-[44ch] text-sm leading-snug text-ink-2">{x}</p>
              ))}
              {c.outcome.href && (
                <a href={c.outcome.href} className="btn-inline mt-3 inline-block">Open</a>
              )}
            </>
          )}
          {c.outcome.kind === "NEEDS" && (
            <p className="text-[16px] text-ink">{c.outcome.question}</p>
          )}
          {c.outcome.kind === "REFUSED" && (
            <p className="max-w-[44ch] text-[16px] leading-snug text-ink">{c.outcome.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Report({ r }: { r: NonNullable<ReturnType<typeof api.requests.comparables.useMutation>["data"]> }) {
  return (
    <section className="mt-8">
      <h2 className="font-sans text-[19px] font-semibold -tracking-[0.02em] text-ink">
        {r.subject.building} · {r.subject.beds} bed
      </h2>

      {/* The range, or the absence of one. Never a number we do not have
          the evidence for — an agent quotes this to a seller. */}
      {r.range ? (
        <>
          <p className="tabular mt-2 font-sans text-[30px] font-semibold -tracking-[0.026em] text-ink">
            {aedWhole(r.range.lowFils)} – {aedWhole(r.range.highFils)}
          </p>
          {r.range.perSqft && (
            <p className="tabular mt-1 text-sm text-ink-2">{r.range.perSqft} per sq ft</p>
          )}
        </>
      ) : (
        <p className="mt-2 max-w-[44ch] text-[17px] text-ink">
          Not enough to put a range on this.
        </p>
      )}

      {r.caveats.length > 0 && (
        <div className="mt-4 space-y-2 border-l-2 border-l-accent-edge pl-3">
          {r.caveats.map((c, i) => (
            <p key={i} className="max-w-[46ch] text-[15px] leading-snug text-ink-2">{c}</p>
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-ink">
        {r.comparables.map((c, i) => (
          <div key={i} className="flex items-baseline gap-3 border-b border-rule py-3">
            <span className={cn("w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]",
              c.source === "OWN_DEAL" ? "text-ink" : "text-ink-3")}>
              {c.source === "OWN_DEAL" ? "sold" : "asking"}
            </span>
            <span className="flex-1 text-[15px] text-ink">
              {c.beds} bed{c.sqft ? ` · ${c.sqft.toLocaleString()} sqft` : ""}
            </span>
            <span className="tabular text-[15px] font-semibold text-ink">{aedWhole(c.priceFils)}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 max-w-[46ch] text-sm leading-snug text-ink-3">
        Built from your own completed deals and listings. Pull the DLD transaction history
        for the tower before you quote a seller — this is your book, not the whole market.
      </p>
    </section>
  );
}
