"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Machine } from "@/components/ui/machine";
import { cn } from "@/lib/cn";
import { aedWhole } from "@/lib/money";
import { MAX_MS, MESSAGES, canRecord, startRecording, type Recorder } from "@/lib/record";

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
  const [focused, setFocused] = useState(false);

  /**
   * Four states, not a boolean.
   *
   * "Listening" and "working out what you said" are different things to
   * be told, and collapsing them means an agent who has stopped talking
   * watches a button that still says Listening and taps it again.
   */
  const [voice, setVoice] = useState<"idle" | "recording" | "transcribing">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recorder = useRef<Recorder | null>(null);

  // Counting up in the button. Silent recording with no feedback is how
  // somebody talks for four minutes into a file nobody will transcribe.
  useEffect(() => {
    if (voice !== "recording") return;
    const started = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Date.now() - started), 200);
    return () => clearInterval(t);
  }, [voice]);

  // A recording must not outlive the screen it was started on.
  useEffect(() => () => recorder.current?.cancel(), []);

  async function beginVoice() {
    setVoiceNote(null);
    const r = await startRecording(() => void finishVoice());
    if (!r.ok) { setVoiceNote(MESSAGES[r.reason]); return; }
    recorder.current = r.recorder;
    setVoice("recording");
  }

  async function finishVoice() {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setVoice("transcribing");

    const { blob, durationMs } = await active.stop();

    /**
     * Under 900ms is a mis-tap, and it is dropped without comment.
     *
     * The same rule and the same silence as the native app, where
     * `MESSAGES.too_short` is deliberately null: somebody who brushed
     * the button does not need it explained to them.
     */
    if (durationMs < 900) { setVoice("idle"); return; }

    try {
      const form = new FormData();
      form.append("audio", blob, "note");
      form.append("durationMs", String(durationMs));
      const res = await fetch("/api/voice", { method: "POST", body: form });

      /**
       * 501 means not configured, and that is not a fault to report.
       *
       * It falls back to the browser's own speech API where one exists —
       * which is Chrome and Edge on a desktop, and nothing on an iPhone.
       * That is the honest split: this feature needs a transcription key
       * to work on the device it was built for.
       */
      if (res.status === 501) {
        setVoice("idle");
        if (browserSpeech(setText)) return;
        setVoiceNote("Speech isn't set up yet. Type it instead — it works the same.");
        return;
      }

      const body = (await res.json()) as {
        text?: string; error?: string; lowConfidence?: boolean; tooShort?: boolean;
      };
      setVoice("idle");
      if (body.tooShort) return;
      if (!res.ok || !body.text) {
        setVoiceNote(body.error ?? "That didn't come back. Type it instead.");
        return;
      }

      /**
       * The transcript lands in the box rather than being sent.
       *
       * `mobile/lib/voice.ts` calls this out as the decision that keeps
       * the feature honest: **the model drafts, a person commits.**
       * Transcription of accented English over road noise is wrong often
       * enough that acting on it directly would put invented sentences
       * into a client record. On the web the textarea *is* the draft and
       * Go is the accept, so it costs nothing to get right.
       */
      setText((prev) => (prev.trim() ? `${prev.trim()} ${body.text}` : body.text!));
      if (body.lowConfidence) {
        setVoiceNote("Have a read before you send it — some of that was hard to make out.");
      }
    } catch {
      setVoice("idle");
      setVoiceNote("That didn't come back. Type it instead — it works the same.");
    }
  }

  function cancelVoice() {
    recorder.current?.cancel();
    recorder.current = null;
    setVoice("idle");
  }

  const c = interpret.data;
  // Computed at render rather than in state: it cannot change for
  // the life of the page, and an effect to set it would flash the
  // button disabled on first paint.
  const recordingPossible = typeof window === "undefined" ? true : canRecord();
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {voice === "recording" ? (
          <>
            <Button variant="primary" onClick={() => void finishVoice()}>
              {/* The count is in the button because that is where the
                  eye already is, and it is what stops a four-minute
                  recording nobody will transcribe. */}
              Stop · {String(Math.floor(elapsed / 1000)).padStart(2, "0")}s
            </Button>
            <button
              onClick={cancelVoice}
              className="min-h-11 px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink"
            >
              Discard
            </button>
            <span
              role="status"
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-deep"
            >
              {/* Words, not only the pulsing button. Colour is never the
                  only signal in this product.

                  Near the ceiling it says so, because a recording that
                  cuts off mid-sentence with no warning is worse than one
                  that never started. */}
              {MAX_MS - elapsed <= 10_000
                ? `Stops in ${Math.max(0, Math.ceil((MAX_MS - elapsed) / 1000))}s`
                : "Recording"}
            </span>
          </>
        ) : (
          <Button
            variant="secondary"
            loading={voice === "transcribing"}
            disabled={voice === "transcribing" || !recordingPossible}
            onClick={() => void beginVoice()}
          >
            {voice === "transcribing" ? "Working out what you said" : "Speak"}
          </Button>
        )}

        <Button
          variant="primary"
          loading={interpret.isPending}
          disabled={text.trim().length < 3 || voice !== "idle"}
          onClick={() => interpret.mutate({ transcript: text })}
        >
          Go
        </Button>
      </div>

      {voiceNote && (
        <p role="status" className="mt-2 max-w-[46ch] text-sm leading-snug text-ink-2">
          {voiceNote}
        </p>
      )}

      {/* Unclear comes back as one question, not an apology and a list.
          An agent in a car answers one thing. */}
      {c?.recipe === "UNCLEAR" && (
        <Machine className="mt-6" label="Understood as">
          <p className="text-[16px] text-ink">{c.question}</p>
        </Machine>
      )}

      {c && c.recipe === "COMPARABLES" && !comps.data && (
        <Machine className="mt-6" label="Understood as">
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
        </Machine>
      )}

      {comps.data && <Report r={comps.data} />}

      {/* Three shapes on purpose: done, one question, or a refusal with a
          reason the agent can act on. Never a spinner that resolves into
          nothing. */}
      {c?.outcome && c.recipe !== "COMPARABLES" && (
        <Machine
          className="mt-6"
          tone={c.outcome.kind === "REFUSED" ? "refused" : "claim"}
          label={c.outcome.kind === "REFUSED" ? "Not done" : "Drafted"}
        >
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
        </Machine>
      )}
    </div>
  );
}

function Report({ r }: { r: NonNullable<ReturnType<typeof api.requests.comparables.useMutation>["data"]> }) {
  return (
    <section className="mt-8">
      <h2 className="font-sans text-[19px] font-semibold -tracking-[0.02em] text-accent-deep">
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

/**
 * The fallback, and only when the server path is switched off.
 *
 * `webkitSpeechRecognition` is Chrome and Edge on a desktop. It is not
 * an iPhone, which is the whole reason the server path exists — so this
 * is not a second implementation competing with the first, it is what
 * keeps the Speak button working for a brokerage that has not set a
 * transcription key yet.
 *
 * It is also worse, and not only on coverage: the server path sends a
 * vocabulary hint, so it spells Jumeirah and Trakheesi. This one hears
 * "track easy".
 */
function browserSpeech(setText: (fn: (prev: string) => string) => void): boolean {
  const SR = (window as unknown as { webkitSpeechRecognition?: new () => never })
    .webkitSpeechRecognition;
  if (!SR) return false;

  const r = new SR() as unknown as {
    lang: string; interimResults: boolean; continuous: boolean;
    onresult: (e: { results: { transcript: string }[][] }) => void;
    start: () => void;
  };
  r.lang = "en-AE";
  r.interimResults = false;
  r.continuous = false;
  r.onresult = (e) => {
    const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join("");
    setText((prev) => (prev.trim() ? `${prev.trim()} ${said}` : said));
  };
  r.start();
  return true;
}
