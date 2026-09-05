import { NextResponse } from "next/server";
import { getSessionContext } from "@/server/auth/session";
import { log } from "@/lib/log";
import { keysFor, limitAll } from "@/server/lib/ratelimit";
import { crossTenant } from "@/server/db/client";
import {
  MAX_BYTES, MIN_MS, transcribe, transcriptionConfigured,
} from "@/server/lib/voice/transcribe";

/**
 * Audio in, text out.
 *
 * A plain route handler rather than a tRPC procedure because the body is
 * binary. tRPC serialises through JSON, so an audio blob would have to be
 * base64-encoded — a third larger on the wire, on a phone, on hotel wifi,
 * for no benefit.
 *
 * **Small enough to go through the server, unlike a brochure.** The file
 * upload path signs a URL and has the browser PUT straight to storage,
 * because a 40MB PDF through a serverless function is a timeout. Twenty
 * seconds of speech is a few hundred kilobytes and the extra round trip
 * to presign would be the slowest part of the interaction, with an agent
 * standing still waiting for it.
 *
 * The audio is **not stored**. It is transcribed and dropped. On the
 * native app the recording is kept until the agent accepts the draft,
 * because there the transcript may arrive minutes later over a bad
 * connection; here the round trip is seconds and the text lands in a box
 * the agent is looking at. Keeping voice recordings of client
 * conversations that nothing ever reads again is a data-protection
 * liability with no user facing it.
 */
export const runtime = "nodejs";
/** Transcription is the slow part. The default 10s is not enough. */
export const maxDuration = 60;

export async function POST(req: Request) {
  const { session, membership } = await getSessionContext();
  const userId = session?.user?.id;

  // Signed in and in a brokerage. This endpoint spends money per call.
  if (!userId || !membership) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!transcriptionConfigured()) {
    /**
     * 501, not 500. The client uses the distinction: a "not configured"
     * answer makes it fall back to the browser's own speech API where
     * that exists, rather than telling an agent something is broken when
     * it simply has not been switched on.
     */
    return NextResponse.json(
      { error: "Speech-to-text is not set up for this brokerage yet.", configured: false },
      { status: 501 }
    );
  }

  const verdict = await limitAll("voice.transcribe", keysFor({ ip: callerIp(req), email: userId }));
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "That's a lot of recording. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  /**
   * The size cap, checked twice.
   *
   * `Content-Length` is a claim, and a client can lie about it or omit
   * it entirely — so it is a cheap early rejection, and the real check
   * is on the bytes that actually arrived.
   */
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Couldn't read that recording." }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No audio in that request." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long." }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That recording was empty." }, { status: 400 });
  }

  /**
   * Under 900ms is a mis-tap, and it is discarded without comment.
   *
   * The same constant and the same silence as the native app —
   * `MESSAGES.too_short` is deliberately null there, because somebody who
   * brushed the button does not need it explained to them.
   */
  const durationMs = Number(form.get("durationMs") ?? 0);
  if (durationMs > 0 && durationMs < MIN_MS) {
    return NextResponse.json({ text: "", tooShort: true });
  }

  /**
   * The filename carries the format.
   *
   * The transcription API infers the container from the extension, and
   * **iOS Safari records `audio/mp4` while everything else records
   * `audio/webm`.** Sending a `.webm` name for an mp4 body is a 400 from
   * the provider that reads like a corrupt file, which is exactly the
   * bug that would have made this "work everywhere except the phone it
   * was built for".
   */
  const mime = (file.type || "audio/webm").split(";")[0]!;
  const ext = EXT[mime];
  if (!ext) {
    return NextResponse.json(
      { error: "That audio format isn't supported." },
      { status: 415 }
    );
  }

  const started = Date.now();
  try {
    const result = await transcribe({ audio: file, fileName: `note.${ext}` });

    /**
     * Logged as an AI action, like everything else the product does on
     * its own initiative. The transcript is not stored — this records
     * that a transcription happened, how long it took and how confident
     * it was, which is what makes a bad provider visible later.
     */
    await crossTenant("pre-tenant").aiAction.create({
      data: {
        orgId: membership.orgId,
        agentId: userId,
        origin: "voice.transcribe",
        interpretation: result.text.slice(0, 200),
        autonomy: "SUGGEST",
        outcome: "DONE",
        after: {
          model: result.model,
          confidence: result.confidence,
          audioMs: result.durationMs ?? durationMs,
          latencyMs: Date.now() - started,
        },
      },
    }).catch((e: unknown) => {
      // The log failing must not cost the agent their transcript.
      log.warn("[voice] could not record the action", {}, { reason: String(e) });
    });

    return NextResponse.json({
      text: result.text,
      confidence: result.confidence,
      /**
       * Below the threshold the client shows the text but does not
       * pre-select it — `ACCEPT_THRESHOLD` in mobile/lib/voice.ts, and
       * the rule it enforces: the model drafts, a person commits.
       */
      lowConfidence: result.confidence < 0.8,
    });
  } catch (e) {
    log.error("[voice] transcribe threw", {}, { reason: String(e) });
    return NextResponse.json(
      { error: "That didn't come back. Type it instead — it works the same." },
      { status: 502 }
    );
  }
}

/**
 * What each browser actually produces.
 *
 * iOS Safari has no webm encoder and gives mp4; Chrome and Firefox give
 * webm; older Safari on macOS can give a bare mp4 or an mpeg. An
 * allowlist rather than trusting the extension, because the filename is
 * built from this rather than from anything the client sent.
 */
const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mpga": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function callerIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export async function GET() {
  return NextResponse.json({ error: "Use POST." }, { status: 405 });
}
