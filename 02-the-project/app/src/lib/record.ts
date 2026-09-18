"use client";

/**
 * Recording a voice note in a browser, including the one that matters.
 *
 * `webkitSpeechRecognition` — what `/ask` used — is not implemented in
 * iOS Safari, and every browser on iOS runs on Safari's engine, so it
 * fails on Chrome and Firefox there too. An estate agent's phone is an
 * iPhone roughly three times out of four in this market. The primary
 * interaction did not work on the primary device.
 *
 * `MediaRecorder` does work there, and has since iOS 14.3. It gives back
 * a file rather than text, so the transcription happens on the server —
 * which `mobile/lib/voice.ts` had already concluded for the native app,
 * and for a better reason than iOS support: doing it on-device means an
 * eighty-megabyte model in the app and a worse result.
 */

/**
 * The format each browser will actually give you.
 *
 * **iOS Safari has no webm encoder.** Asking for `audio/webm` there does
 * not throw — `MediaRecorder` quietly falls back to its own default and
 * produces `audio/mp4`, so a naive implementation records perfectly well
 * and then sends a file whose name says webm and whose body is mp4. The
 * transcription API rejects it as corrupt, and the failure looks like a
 * broken microphone rather than a wrong extension.
 *
 * So: ask in order of preference, take the first the browser admits to
 * supporting, and let the browser decide if it admits to none.
 */
const PREFERRED = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",       // iOS Safari lands here
  "audio/mpeg",
];

export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of PREFERRED) {
    // Older Safari has MediaRecorder without isTypeSupported.
    if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function canRecord(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export type Recorder = {
  /** Resolves with the audio once `stop()` is called. */
  stop: () => Promise<{ blob: Blob; durationMs: number }>;
  /** Throw it away — releases the microphone and resolves nothing. */
  cancel: () => void;
};

export type StartResult =
  | { ok: true; recorder: Recorder }
  | { ok: false; reason: "unsupported" | "denied" | "failed" };

/**
 * A ceiling, because a recording somebody forgot to stop is a recording
 * of a conversation they did not mean to capture.
 *
 * The native app solves this with hold-to-record. A browser cannot rely
 * on a held touch — Safari interrupts a touch on scroll, and a desktop
 * user has a mouse — so this is tap-to-start with a hard stop.
 */
export const MAX_MS = 60_000;

export async function startRecording(onStopped?: () => void): Promise<StartResult> {
  if (!canRecord()) return { ok: false, reason: "unsupported" };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      /**
       * Constraints for speech, not for music.
       *
       * Echo cancellation and noise suppression are what make a note
       * dictated in a car legible. Browsers apply them by default for
       * microphone capture, but Safari has historically not, and asking
       * costs nothing where they are already on.
       */
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    // NotAllowedError covers both "denied" and "dismissed". They are the
    // same thing to the agent: no microphone, keyboard instead.
    const name = (e as { name?: string })?.name;
    return { ok: false, reason: name === "NotAllowedError" ? "denied" : "failed" };
  }

  const mimeType = pickMimeType();
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    return { ok: false, reason: "failed" };
  }

  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let settled = false;

  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  /** The microphone must be released on every path out of here. */
  const release = () => stream.getTracks().forEach((t) => t.stop());

  const stopped = new Promise<{ blob: Blob; durationMs: number }>((resolve) => {
    rec.onstop = () => {
      release();
      resolve({
        // `rec.mimeType` rather than the type we asked for — on iOS
        // those differ, and the server builds the filename from this.
        blob: new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }),
        durationMs: Date.now() - startedAt,
      });
    };
  });

  // Timeslice, so a tab suspended mid-recording still has the audio it
  // captured up to that point rather than one chunk that never arrived.
  rec.start(1000);

  const timer = setTimeout(() => {
    if (rec.state === "recording") { rec.stop(); onStopped?.(); }
  }, MAX_MS);

  return {
    ok: true,
    recorder: {
      stop: () => {
        clearTimeout(timer);
        if (!settled && rec.state !== "inactive") { settled = true; rec.stop(); }
        return stopped;
      },
      cancel: () => {
        clearTimeout(timer);
        settled = true;
        rec.onstop = null;
        if (rec.state !== "inactive") rec.stop();
        release();
      },
    },
  };
}

/** What the agent is told, in their words. Mirrors mobile/lib/voice.ts. */
export const MESSAGES = {
  denied:
    "PotatoFarm.io needs the microphone to record a note. You can turn it on in " +
    "your browser settings — everything else keeps working without it.",
  unsupported: "This browser won't record. Type it instead — it works the same.",
  failed: "The microphone didn't start. Type it instead — it works the same.",
} as const;
