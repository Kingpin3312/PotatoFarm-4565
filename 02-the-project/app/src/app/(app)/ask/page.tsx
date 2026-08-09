"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Say it.
 *
 * The one genuinely good idea in the competing products: an agent
 * between viewings cannot type. Speaking a request is how they get a
 * reason to open this at all.
 *
 * Where we differ from them: no human sits behind this. The answer
 * comes back in seconds and states its own uncertainty, instead of an
 * advisor catching it hours later.
 */
export default function Ask() {
  const interpret = api.requests.interpret.useMutation();
  const comps = api.requests.comparables.useMutation();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<{ stop: () => void } | null>(null);

  function speak() {
    // Web Speech where it exists. On iOS Safari it does not, and the
    // honest fallback is the keyboard rather than a button that does
    // nothing.
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
      Array.from(e.results).map((x) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.start();
    rec.current = r;
    setListening(true);
  }

  const c = interpret.data;

  return (
    <div className="max-w-[620px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          Say it
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[46ch]">
          "What are two-beds going for in Marina Gate." "Book Tuesday afternoon at the
          Damac flat." "Log that I met a mortgage broker called Rashid."
        </p>
      </header>

      <label htmlFor="ask" className="sr-only">Your request</label>
      <textarea id="ask" rows={3} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Speak or type…"
        className="w-full px-4 py-3 text-[16px] text-ink bg-sunk border border-rule rounded-xl focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />

      <div className="flex gap-2 mt-3 flex-wrap">
        <Button variant={listening ? "primary" : "secondary"}
          onClick={() => listening ? (rec.current?.stop(), setListening(false)) : speak()}>
          {listening ? "Listening — tap to stop" : "Speak"}
        </Button>
        <Button variant="primary" loading={interpret.isPending}
          disabled={text.trim().length < 3}
          onClick={() => interpret.mutate({ transcript: text })}>
          Go
        </Button>
      </div>

      {/* Unclear comes back as one question, not an apology and a list.
          An agent in a car answers one thing. */}
      {c?.recipe === "UNCLEAR" && (
        <div className="mt-6 bg-sunk rounded-xl p-4 border-l-[3px] border-l-accent-edge">
          <p className="text-[16px] text-ink">{c.question}</p>
        </div>
      )}

      {c && c.recipe === "COMPARABLES" && !comps.data && (
        <div className="mt-6 bg-sunk rounded-xl p-4">
          <p className="text-[15px] text-ink-2 mb-3">
            Comparables for <strong className="text-ink">{c.entities.building ?? "—"}</strong>.
            How many bedrooms?
          </p>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4].map((b) => (
              <Button key={b} variant="secondary" loading={comps.isPending}
                onClick={() => comps.mutate({
                  building: c.entities.building ?? text, beds: b })}>
                {b} bed
              </Button>
            ))}
          </div>
        </div>
      )}

      {comps.data && <Report r={comps.data} />}

      {/* The outcome. Three shapes on purpose: done, one question, or a
          refusal with a reason the agent can act on. Never a spinner
          that resolves into nothing. */}
      {c?.outcome && c.recipe !== "COMPARABLES" && (
        <div className={cn("mt-6 rounded-xl p-4",
          c.outcome.kind === "REFUSED"
            ? "bg-sunk border-l-[3px] border-l-accent-edge" : "bg-sunk")}>
          {c.outcome.kind === "DONE" && (
            <>
              <p className="text-[16px] text-ink">{c.outcome.summary}</p>
              {c.outcome.caveats?.map((x, i) => (
                <p key={i} className="text-sm text-ink-2 mt-2 max-w-[44ch] leading-snug">{x}</p>
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
            <p className="text-[16px] text-ink max-w-[44ch] leading-snug">
              {c.outcome.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Report({ r }: { r: NonNullable<ReturnType<typeof api.requests.comparables.useMutation>["data"]> }) {
  return (
    <section className="mt-8">
      <h2 className="font-sans font-semibold text-[19px] text-ink -tracking-[0.02em]">
        {r.subject.building} · {r.subject.beds} bed
      </h2>

      {/* The range, or the absence of one. Never a number we do not
          have the evidence for — an agent quotes this to a seller. */}
      {r.range ? (
        <>
          <p className="font-sans font-semibold text-[30px] text-ink -tracking-[0.026em] tabular mt-2">
            {fmt(r.range.lowFils)} – {fmt(r.range.highFils)}
          </p>
          {r.range.perSqft && (
            <p className="text-sm text-ink-2 mt-1 tabular">{r.range.perSqft} per sq ft</p>
          )}
        </>
      ) : (
        <p className="text-[17px] text-ink mt-2 max-w-[44ch]">
          Not enough to put a range on this.
        </p>
      )}

      {r.caveats.length > 0 && (
        <div className="mt-4 pl-3 border-l-2 border-l-accent-edge space-y-2">
          {r.caveats.map((c, i) => (
            <p key={i} className="text-[15px] text-ink-2 max-w-[46ch] leading-snug">{c}</p>
          ))}
        </div>
      )}

      <div className="border-t border-ink mt-6">
        {r.comparables.map((c, i) => (
          <div key={i} className="flex items-baseline gap-3 py-3 border-b border-rule">
            <span className={cn("font-mono text-[10px] uppercase tracking-[0.1em] w-16 shrink-0",
              c.source === "OWN_DEAL" ? "text-ink" : "text-ink-3")}>
              {c.source === "OWN_DEAL" ? "sold" : "asking"}
            </span>
            <span className="text-[15px] text-ink flex-1">
              {c.beds} bed{c.sqft ? ` · ${c.sqft.toLocaleString()} sqft` : ""}
            </span>
            <span className="text-[15px] text-ink font-semibold tabular">{fmt(c.priceFils)}</span>
          </div>
        ))}
      </div>

      <p className="text-sm text-ink-3 mt-4 max-w-[46ch] leading-snug">
        Built from your own completed deals and listings. Pull the DLD transaction history
        for the tower before you quote a seller — this is your book, not the whole market.
      </p>
    </section>
  );
}

const fmt = (f: bigint | string) =>
  `AED ${(Number(f) / 100).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
