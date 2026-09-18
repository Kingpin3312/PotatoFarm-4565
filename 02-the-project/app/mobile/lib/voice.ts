import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { enqueue } from "./queue";

/**
 * Voice notes.
 *
 * The second differentiator after lock-screen replies, and for the same
 * reason: an agent driving between viewings cannot type and should not
 * be trying. Every agent in this market spends roughly two hours a day
 * in a car, and right now that time produces nothing because the only
 * way to record anything is a keyboard.
 *
 * Nobody in proptech does this properly. Reapit and Goyzer both have
 * text note fields on a mobile screen, which is the same as having
 * nothing when your hands are on a wheel.
 *
 * Four decisions, and the second is the one that keeps it honest.
 */

/**
 * 1. **Hold to record, release to stop.**
 *
 * Not tap-to-start and tap-again-to-stop. Hold is unambiguous with one
 * thumb, cannot be left running by accident, and — this is the real
 * reason — a recording somebody forgot to stop is a recording of a
 * private conversation they did not mean to capture.
 */
export type Recording = {
  uri: string;
  durationMs: number;
  /** When the agent spoke, not when it uploaded. Same rule as the queue. */
  createdAt: string;
};

let active: Audio.Recording | null = null;

export async function start(): Promise<{ ok: boolean; reason?: string }> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: "microphone_denied" };

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    // Ducks rather than stops. An agent listening to directions should
    // not lose them because they recorded a note.
    playsInSilentModeIOS: true,
    interruptionModeIOS: 2,
    shouldDuckAndroid: true,
  });

  const rec = new Audio.Recording();
  // Low quality on purpose. This is speech for transcription, not audio
  // anyone will listen to, and an agent on hotel wifi should not be
  // uploading three megabytes to record eight seconds.
  await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
  await rec.startAsync();
  active = rec;
  return { ok: true };
}

/** Anything under a second is a mis-tap. Discarded without comment. */
const MIN_MS = 900;

export async function stop(): Promise<Recording | null> {
  if (!active) return null;
  const rec = active;
  active = null;

  await rec.stopAndUnloadAsync();
  const uri = rec.getURI();
  const status = await rec.getStatusAsync();
  const durationMs = status.durationMillis ?? 0;

  if (!uri || durationMs < MIN_MS) {
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
    return null;
  }
  return { uri, durationMs, createdAt: new Date().toISOString() };
}

export async function cancel() {
  if (!active) return;
  const rec = active;
  active = null;
  await rec.stopAndUnloadAsync().catch(() => {});
  const uri = rec.getURI();
  if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * 2. **The transcript is a draft until a person accepts it.**
 *
 * This is the decision that keeps the feature honest. Transcription of
 * accented English over road noise is wrong often enough that treating
 * it as fact would put invented sentences into a client record — and a
 * lead note is evidence in a dispute about who said what.
 *
 * So it arrives as a draft the agent taps to accept, edit or discard.
 * The audio is kept until they do, so there is always something true to
 * fall back to.
 *
 * The same principle as the assistant: **the model drafts, a person
 * commits.**
 */
export const TRANSCRIPT_IS_A_DRAFT = true;

export type Draft = {
  id: string;
  text: string;
  /** Below this, the transcript is shown but not pre-selected. */
  confidence: number;
  audioUri: string;
  durationMs: number;
  createdAt: string;
};

export const ACCEPT_THRESHOLD = 0.8;

/**
 * 3. **Queued like everything else, audio included.**
 *
 * A note dictated in a basement uploads when there is signal, and it is
 * recorded at the time it was spoken. The audio file goes with it — the
 * transcript happens server-side, because doing it on-device would mean
 * an eighty-megabyte model in the app and a worse result.
 */
export async function attach(leadId: string, rec: Recording) {
  const b64 = await FileSystem.readAsStringAsync(rec.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await enqueue({
    kind: "lead.note",
    leadId,
    // Placeholder text until the transcript returns. An empty note in
    // the record is worse than one that says what it is waiting for.
    note: `[Voice note, ${Math.round(rec.durationMs / 1000)}s — transcribing]`,
    createdAt: rec.createdAt,
    audio: { data: b64, mimeType: "audio/m4a", durationMs: rec.durationMs },
  } as never);

  // Deleted only once queued. If the app dies between recording and
  // enqueue, the file is orphaned rather than lost, and sweep() finds it.
  await FileSystem.deleteAsync(rec.uri, { idempotent: true });
}

/**
 * 4. **Orphaned audio is cleaned up, but not immediately.**
 *
 * A crash between recording and queueing leaves a file on disk. Deleting
 * aggressively risks throwing away a note the queue has not read yet;
 * leaving it forever fills the phone. A day is the compromise.
 */
export async function sweep(olderThanHours = 24) {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return 0;

  const files = await FileSystem.readDirectoryAsync(dir).catch(() => []);
  const cutoff = Date.now() - olderThanHours * 3_600_000;
  let removed = 0;

  for (const f of files.filter((x) => x.endsWith(".m4a"))) {
    const info = await FileSystem.getInfoAsync(dir + f);
    if (info.exists && (info.modificationTime ?? 0) * 1000 < cutoff) {
      await FileSystem.deleteAsync(dir + f, { idempotent: true });
      removed += 1;
    }
  }
  return removed;
}

/** What the agent is told, in their words rather than an error code. */
export const MESSAGES = {
  microphone_denied:
    "PotatoFarm.io needs the microphone to record a note. You can turn it on in Settings — everything else keeps working without it.",
  too_short: null, // deliberately silent; a mis-tap needs no explanation
  transcribing: "Transcribing — the audio is saved either way.",
  low_confidence:
    "The transcript may be wrong. Have a read before you accept it — the recording is here if you need it.",
} as const;
