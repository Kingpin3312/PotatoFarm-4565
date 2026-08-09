/**
 * Does voice work, and does it work on the phone it was built for?
 *
 * The model call is not exercised — there is no transcription key in
 * this environment — so a small OpenAI-compatible server stands in for
 * one. It checks the multipart it receives rather than echoing blindly,
 * because a stub that accepts anything proves only that fetch works.
 *
 * The iOS-specific parts are the point. Safari on iOS has no webm
 * encoder, and the failure that would otherwise ship is subtle: the
 * recording succeeds, the file is fine, and the *filename* says webm
 * while the body is mp4 — which the provider rejects as corrupt, so it
 * reads as a broken microphone.
 *
 *     npm run check:voice
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { confidenceFrom, MAX_BYTES, MIN_MS } from "../src/server/lib/voice/transcribe";

const fails: string[] = [];
function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

/** What the fake provider last received, so it can be asserted on. */
let seen: { model?: string; prompt?: string; format?: string; fileName?: string; bytes?: number } = {};

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c as Buffer));
  req.on("end", () => {
    if (req.url !== "/v1/audio/transcriptions") {
      return void res.writeHead(404).end();
    }
    if (!(req.headers.authorization ?? "").startsWith("Bearer ")) {
      return void res.writeHead(401).end("no key");
    }

    // Crude multipart parsing — enough to see the field values, which is
    // all this needs to prove.
    const body = Buffer.concat(chunks).toString("latin1");
    const field = (n: string) =>
      body.match(new RegExp(`name="${n}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1];
    seen = {
      model: field("model"),
      prompt: field("prompt"),
      format: field("response_format"),
      fileName: body.match(/name="file"; filename="([^"]+)"/)?.[1],
      bytes: Buffer.concat(chunks).length,
    };

    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      text: "Met Sarah today, four bed villa in Dubai Hills around twelve million.",
      duration: 6.2,
      segments: [
        { avg_logprob: -0.18, no_speech_prob: 0.01 },
        { avg_logprob: -0.22, no_speech_prob: 0.02 },
      ],
    }));
  });
});

async function main() {
  /* ---------------- the confidence heuristic ---------------- */

  console.log("\nConfidence is inferred, and behaves sensibly:");
  ok("a clean decode is high",
     confidenceFrom([{ avg_logprob: -0.1, no_speech_prob: 0.01 }]) > 0.85);
  ok("a poor decode is low",
     confidenceFrom([{ avg_logprob: -0.9, no_speech_prob: 0.05 }]) < 0.3);
  ok("confident silence is not a confident transcript",
     confidenceFrom([{ avg_logprob: -0.05, no_speech_prob: 0.95 }]) < 0.2);
  ok("no segments gives a neutral value rather than zero",
     confidenceFrom(undefined) === 0.75);
  ok("always inside 0–1", [
       [{ avg_logprob: -5, no_speech_prob: 1 }],
       [{ avg_logprob: 0.5, no_speech_prob: -1 }],
       [{}],
     ].every((sg) => { const c = confidenceFrom(sg); return c >= 0 && c <= 1; }));
  // 0.8 is ACCEPT_THRESHOLD in mobile/lib/voice.ts. Below it the
  // transcript is shown but not pre-selected.
  ok("the threshold the UI keys off is meaningful in this range",
     confidenceFrom([{ avg_logprob: -0.15, no_speech_prob: 0.02 }]) >= 0.8 &&
     confidenceFrom([{ avg_logprob: -0.45, no_speech_prob: 0.05 }]) < 0.8);

  /* ---------------- unconfigured ---------------- */

  console.log("\nUnconfigured, it says which key to set:");
  for (const k of ["TRANSCRIBE_API_KEY", "TRANSCRIBE_BASE_URL", "TRANSCRIBE_MODEL"]) delete process.env[k];
  {
    const m = await import("../src/server/lib/voice/transcribe");
    ok("transcriptionConfigured() is false", m.transcriptionConfigured() === false);
    let msg = "";
    await m.transcribe({ audio: new Blob(["x"]), fileName: "n.webm" })
      .catch((e) => (msg = String(e.message)));
    ok("and it names the variable", msg.includes("TRANSCRIBE_API_KEY"), msg.slice(0, 60) + "…");
  }

  /* ---------------- configured, against the fake ---------------- */

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.TRANSCRIBE_API_KEY = "test-key";
  process.env.TRANSCRIBE_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.TRANSCRIBE_MODEL = "whisper-large-v3-turbo";

  const m = await import("../src/server/lib/voice/transcribe");
  ok("configured once the key is set", m.transcriptionConfigured() === true);

  console.log("\nWhat the provider actually receives:");
  const audio = new Blob([new Uint8Array(4096).fill(7)], { type: "audio/mp4" });
  const out = await m.transcribe({ audio, fileName: "note.mp4" });

  ok("the transcript comes back", out.text.startsWith("Met Sarah"), out.text.slice(0, 40) + "…");
  ok("with a confidence", out.confidence > 0.7 && out.confidence <= 1, String(out.confidence));
  ok("and the duration", out.durationMs === 6200, String(out.durationMs));
  ok("the configured model is used, not a hard-coded one",
     seen.model === "whisper-large-v3-turbo", seen.model);
  ok("segments are requested, or there is no confidence to compute",
     seen.format === "verbose_json", seen.format);
  ok("the audio actually arrives", (seen.bytes ?? 0) > 4000, `${seen.bytes} bytes`);

  console.log("\nThe vocabulary hint — why this beats the browser API:");
  ok("Dubai place names are sent", (seen.prompt ?? "").includes("Jumeirah"));
  ok("so is Trakheesi, which no general model spells",
     (seen.prompt ?? "").includes("Trakheesi"));
  ok("and it stays short enough not to steer the content",
     (seen.prompt ?? "").length < 400, `${(seen.prompt ?? "").length} chars`);

  console.log("\nThe iPhone case — the filename carries the container:");
  ok("an mp4 from iOS Safari is named .mp4, not .webm",
     seen.fileName === "note.mp4", seen.fileName);
  await m.transcribe({ audio: new Blob(["x"], { type: "audio/webm" }), fileName: "note.webm" });
  ok("and a webm from Chrome is named .webm", seen.fileName === "note.webm", seen.fileName);

  console.log("\nThe constants match the native app, which set them first:");
  ok("MIN_MS is 900, as in mobile/lib/voice.ts", MIN_MS === 900);
  ok("the size cap is generous but finite", MAX_BYTES === 6 * 1024 * 1024);

  console.log("\nA provider failure is an error, not an empty transcript:");
  {
    // A path the fake does not serve, so it really 404s.
    process.env.TRANSCRIBE_BASE_URL = `http://127.0.0.1:${port}/v2`;
    const m2 = await import("../src/server/lib/voice/transcribe");
    let threw = false;
    await m2.transcribe({ audio: new Blob(["x"]), fileName: "n.webm" }).catch(() => (threw = true));
    ok("a 404 from the provider throws rather than returning ''", threw);
  }

  server.close();
  console.log(`\n${"─".repeat(60)}`);
  if (fails.length === 0) {
    console.log("PASS — audio in, text out, with the right filename on an iPhone.\n");
    process.exit(0);
  }
  console.log(`FAIL — ${fails.length}:`);
  fails.forEach((f) => console.log(`  x ${f}`));
  process.exit(1);
}

main().catch((e) => { console.error(e); server.close(); process.exit(1); });
