import { log } from "@/lib/log";
import { VOCABULARY_TERMS } from "@/server/lib/places";

/**
 * Speech to text.
 *
 * The audit's finding: **voice does not work on an iPhone.** `/ask` used
 * `webkitSpeechRecognition`, which iOS Safari does not implement — and
 * every browser on iOS runs on Safari's engine, so it failed on Chrome
 * and Firefox there too. The primary interaction and the primary device
 * did not meet.
 *
 * The fix is not a different browser API. It is recording on the phone
 * and transcribing on the server, which is what `mobile/lib/voice.ts`
 * already decided for the native app and wrote down the reasoning for.
 * This is the web half of the same contract.
 *
 * **Provider-agnostic through the OpenAI audio API shape**, for the same
 * reason `storage.ts` speaks S3: it is the interface everybody
 * implements. OpenAI, Groq, a self-hosted whisper.cpp server and most
 * of the smaller providers all accept the same multipart POST, so
 * choosing between them is a base URL and a model name rather than a
 * rewrite. The brief asked for exactly this — do not hard-code the
 * application to one AI provider.
 *
 * It is deliberately **not** Anthropic. The assistant is Anthropic and
 * stays that way; Anthropic does not transcribe audio, and pretending
 * one vendor covers both would mean a worse result and a fiction in the
 * config.
 */

const NOT_WIRED =
  "Speech-to-text is not configured. Set TRANSCRIBE_API_KEY, and " +
  "TRANSCRIBE_BASE_URL if you are not using OpenAI. Any provider with an " +
  "OpenAI-compatible /audio/transcriptions endpoint works.";

export type Transcript = {
  text: string;
  /**
   * 0–1, derived rather than reported.
   *
   * `mobile/lib/voice.ts` sets `ACCEPT_THRESHOLD = 0.8` and the rule that
   * goes with it: below the threshold the transcript is shown but not
   * pre-selected. Honouring that needs a number, and the API does not
   * hand one over — see `confidenceFrom` for how it is inferred and what
   * that is worth.
   */
  confidence: number;
  /** Milliseconds of audio, as the provider measured it. */
  durationMs: number | null;
  /** Which model produced it, for the action log. */
  model: string;
};

type Config = { key: string; baseUrl: string; model: string };

function config(): Config | null {
  const key = process.env.TRANSCRIBE_API_KEY?.trim();
  if (!key) return null;
  return {
    key,
    baseUrl: (process.env.TRANSCRIBE_BASE_URL?.trim() || "https://api.openai.com/v1")
      .replace(/\/+$/, ""),
    model: process.env.TRANSCRIBE_MODEL?.trim() || "whisper-1",
  };
}

export function transcriptionConfigured(): boolean {
  return config() !== null;
}

/**
 * The vocabulary hint, and it is the reason this beats the browser API
 * rather than merely matching it on an iPhone.
 *
 * Whisper-family models accept a prompt that biases decoding. Dubai
 * place names are exactly what a general model gets wrong — "Jumeirah"
 * comes back as "Jumaira", "Trakheesi" as "track easy", "Damac" as "the
 * MAC" — and those are the words an estate agent says most. Web Speech
 * has no equivalent and never will.
 *
 * Kept short on purpose. A long prompt starts to steer the *content* of
 * the transcript rather than its spelling, and a model that has been
 * told to expect property words will hear property words in noise.
 *
 * Now built from `lib/places.ts` rather than hard-coded here. Search
 * needs the same place names and had started a second list; two lists
 * means one of them learns about a new community and the other does
 * not, and the failure is silent in both directions. `HINT_PLACES` is
 * what keeps this one short — the length above is a decision, not an
 * accident of how much anybody typed.
 */
const VOCABULARY = VOCABULARY_TERMS.join(", ");

/**
 * What the API gives back, and how much of it to trust.
 *
 * `verbose_json` returns per-segment `avg_logprob` (how confident the
 * decode was) and `no_speech_prob` (how likely the segment is silence).
 * Neither is a calibrated confidence and neither claims to be, so this
 * is a heuristic rather than a measurement — which is why the threshold
 * it feeds only decides whether text is *pre-selected*, never whether it
 * is used.
 */
type Segment = { avg_logprob?: number; no_speech_prob?: number };

export function confidenceFrom(segments: Segment[] | undefined): number {
  if (!segments?.length) return 0.75; // no signal either way

  let sum = 0;
  for (const s of segments) {
    // avg_logprob is a log probability, typically about -0.1 (excellent)
    // to -1.0 (poor). Mapped to 0–1 with a floor so one bad segment in a
    // long note does not sink the whole thing.
    const lp = s.avg_logprob ?? -0.4;
    const fromLogprob = Math.max(0, Math.min(1, 1 + lp));
    /**
     * Confident silence is not a confident transcript.
     *
     * Clamped at both ends. Only the upper bound was there, and a
     * negative `no_speech_prob` — nonsense from a provider, but this
     * parses somebody else's JSON — made `speech` greater than 1 and
     * pushed the whole confidence above 1. It would have surfaced as a
     * transcript that never trips the low-confidence warning, which is
     * the one direction this must not fail in.
     */
    const speech = 1 - Math.max(0, Math.min(1, s.no_speech_prob ?? 0));
    sum += fromLogprob * speech;
  }
  return Math.round((sum / segments.length) * 100) / 100;
}

/** Anything shorter is a mis-tap. Matches `MIN_MS` in mobile/lib/voice.ts. */
export const MIN_MS = 900;

/**
 * A cap, in bytes.
 *
 * A spoken CRM request is five to twenty seconds. Sixty seconds of
 * compressed speech is roughly 500KB, so 6MB is generous and still well
 * inside a serverless body limit. The cap exists because this endpoint
 * costs money per call and takes an upload from anybody with a session.
 */
export const MAX_BYTES = 6 * 1024 * 1024;

export async function transcribe(args: {
  audio: Blob;
  /** Used for the filename the API sees, which is how it infers format. */
  fileName: string;
  /** Hint only. Whisper detects language itself and is good at it. */
  language?: string;
}): Promise<Transcript> {
  const c = config();
  if (!c) throw new Error(NOT_WIRED);

  const form = new FormData();
  form.append("file", args.audio, args.fileName);
  form.append("model", c.model);
  form.append("prompt", VOCABULARY);
  // Segments, so a confidence can be inferred. Costs nothing extra.
  form.append("response_format", "verbose_json");
  if (args.language) form.append("language", args.language);

  const res = await fetch(`${c.baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}` },
    body: form,
    /**
     * Thirty seconds.
     *
     * An agent is standing still waiting for this. Past thirty seconds
     * they have given up and typed it, and a request still open is a
     * serverless function still being billed.
     */
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.error("[voice] transcription failed", {}, { status: res.status, body: body.slice(0, 200) });
    throw new Error(`Transcription failed (${res.status}).`);
  }

  const json = (await res.json()) as {
    text?: string;
    duration?: number;
    segments?: Segment[];
  };

  return {
    text: (json.text ?? "").trim(),
    confidence: confidenceFrom(json.segments),
    durationMs: json.duration != null ? Math.round(json.duration * 1000) : null,
    model: c.model,
  };
}
