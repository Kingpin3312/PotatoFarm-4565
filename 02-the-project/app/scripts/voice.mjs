import http from "node:http";
import { PrismaClient } from "@prisma/client";

/**
 * The Speak button, end to end.
 *
 * ## Why this suite exists, and why none of this had ever run
 *
 * Nothing had ever posted to `/api/voice`. Worse than that: almost
 * none of the route is *reachable* without a transcription provider,
 * because `transcriptionConfigured()` is checked before the rate limit
 * and before every piece of validation. With `TRANSCRIBE_API_KEY`
 * unset — which is its state in development, and the boot log says so
 * on every start — the only two answers the route can give are 401 and
 * 501.
 *
 * So the size caps, the mis-tap guard, the format allowlist, the
 * AiAction record and the confidence threshold had never executed
 * anywhere, on any machine. They are not untested; they are unrun.
 *
 * ## The one that matters most
 *
 * **iOS Safari records `audio/mp4`. Everything else records
 * `audio/webm`.** The provider infers the container from the filename,
 * so sending `note.webm` for an mp4 body is a 400 that reads like a
 * corrupt recording. The route's own comment calls this "exactly the
 * bug that would have made this work everywhere except the phone it was
 * built for" — and nothing checked it. The stand-in below records the
 * filename it was handed, which is the only way to assert it.
 *
 *     TRANSCRIBE_API_KEY=any TRANSCRIBE_BASE_URL=http://127.0.0.1:4321 npm run start
 *     npm run check:voice
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";
const OWNER = "dev-session-token-ask-history";

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});
const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
if (!org) { console.error("no organisation — run npm run db:seed"); process.exit(1); }

/* ------------------------------------------------------------------ *
 * A stand-in for the transcription provider, speaking the same shape
 * the real one does: `text`, `duration`, `segments`.
 * ------------------------------------------------------------------ */
let seen = [];            // every request the provider received
let mode = "good";        // "good" | "unsure" | "fail"

const stub = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("latin1");
    // The filename is what the provider uses to infer the container, so
    // it is the thing worth capturing out of the multipart body.
    const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? null;
    seen.push({
      fileName: name,
      auth: req.headers.authorization ?? null,
      // Proves the route asks for segments, which is where confidence
      // comes from. Without them every transcript scores the default.
      verbose: /verbose_json/.test(raw),
      // The UAE vocabulary prompt — "Trakheesi", community names — is
      // what stops Whisper turning them into nonsense.
      prompt: /name="prompt"/.test(raw),
    });

    if (mode === "fail") { res.writeHead(500); res.end("provider exploded"); return; }

    const segments = mode === "unsure"
      // A low average logprob and a high no-speech probability: what a
      // muffled recording in a car park actually looks like.
      ? [{ avg_logprob: -1.4, no_speech_prob: 0.7 }]
      : [{ avg_logprob: -0.1, no_speech_prob: 0.01 }];

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      text: "  Met Sarah at the Marina Gate viewing, she wants a two-bed.  ",
      duration: 6.4,
      segments,
    }));
  });
});

const PORT = Number(process.env.TRANSCRIBE_STUB_PORT ?? 4321);
try {
  await new Promise((resolve, reject) => {
    stub.once("error", reject);
    stub.listen(PORT, "127.0.0.1", resolve);
  });
} catch (err) {
  console.error(`\ncould not bind 127.0.0.1:${PORT} — ${String(err).slice(0, 90)}`);
  console.error("set TRANSCRIBE_STUB_PORT, and start the application with");
  console.error("TRANSCRIBE_BASE_URL pointing at the same one.\n");
  process.exit(1);
}
const STUB_URL = `http://127.0.0.1:${PORT}`;

/** A blob of plausible size. The bytes are never decoded by anything. */
const audio = (bytes, type) => new Blob([new Uint8Array(bytes)], { type });

async function speak({ type = "audio/webm", bytes = 40_000, durationMs = 6400, signedIn = true, field = "audio" } = {}) {
  const form = new FormData();
  form.append(field, audio(bytes, type), "recording");
  if (durationMs != null) form.append("durationMs", String(durationMs));
  const headers = signedIn
    ? { cookie: `authjs.session-token=${OWNER}; __Secure-authjs.session-token=${OWNER}` }
    : {};
  const r = await fetch(`${APP}/api/voice`, { method: "POST", headers, body: form });
  let json = null;
  try { json = await r.json(); } catch { /* reported by the caller */ }
  return { status: r.status, json };
}

/**
 * A clean slate for the limiter, so the suite is idempotent.
 *
 * `limitAll` runs *before* every piece of validation in the route, so
 * even the requests this suite expects to be refused spend budget. Two
 * runs inside the five-minute window would therefore start the second
 * one part-spent and 429 the assertions above, which reads as the
 * product being broken rather than as the previous run having happened.
 */
await db.rateLimitHit.deleteMany({ where: { action: "voice.transcribe" } });

console.log("\nThe Speak button\n");
console.log(`  transcription stand-in on ${STUB_URL}`);
console.log(`  the application must run with TRANSCRIBE_BASE_URL=${STUB_URL}\n`);

/* ---------------- the door ------------------------------------------ */
console.log("=== it is not an open endpoint ===");
{
  const anon = await speak({ signedIn: false });
  // Every call spends money with the provider.
  ok("a stranger cannot spend the brokerage's money", anon.status === 401, `HTTP ${anon.status}`);

  const get = await fetch(`${APP}/api/voice`);
  ok("and GET is refused", get.status === 405, `HTTP ${get.status}`);
}

/* ---------------- speech to text ------------------------------------- */
console.log("\n=== an agent speaks and gets text back ===");
{
  seen = [];
  const r = await speak();
  if (r.status === 501) {
    console.error("\n  the application is running without a transcription provider.");
    console.error("  everything below this point is unreachable, so the suite cannot");
    console.error("  prove anything. Restart it with:\n");
    console.error(`    TRANSCRIBE_API_KEY=check-only TRANSCRIBE_BASE_URL=${STUB_URL} npm run start\n`);
    stub.close();
    await db.$disconnect();
    process.exit(1);
  }
  ok("it answers", r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 80)}`);
  ok("with the words", /Met Sarah at the Marina Gate/.test(r.json?.text ?? ""),
     (r.json?.text ?? "nothing").slice(0, 50));
  // The provider pads its output; the box the agent sees should not.
  ok("trimmed, because it lands in a box an agent is looking at",
     (r.json?.text ?? " ").trim() === r.json?.text, JSON.stringify((r.json?.text ?? "").slice(0, 8)));
  ok("the provider was actually called", seen.length === 1, `${seen.length} call(s)`);
  ok("with our key, not the agent's session",
     (seen[0]?.auth ?? "").startsWith("Bearer "), seen[0]?.auth ? "bearer token" : "no authorization header");
  ok("asking for segments, which is where confidence comes from",
     seen[0]?.verbose === true, String(seen[0]?.verbose));
  // Without it, Whisper renders Dubai community names as nonsense.
  ok("and carrying the local vocabulary", seen[0]?.prompt === true, String(seen[0]?.prompt));
  ok("a confident recording is not flagged", r.json?.lowConfidence === false,
     `confidence ${r.json?.confidence}`);
}

/* ---------------- THE PHONE IT WAS BUILT FOR -------------------------- */
console.log("\n=== the iPhone, which records a different format ===");
{
  seen = [];
  const r = await speak({ type: "audio/mp4" });
  ok("an iOS recording is accepted", r.status === 200, `HTTP ${r.status}`);
  /**
   * The assertion the route's own comment asks for. The provider infers
   * the container from the extension, so an mp4 body under a `.webm`
   * name is a 400 that reads like a corrupt file — working everywhere
   * except the phone the feature exists for.
   */
  ok("and reaches the provider named as mp4, not webm",
     seen[0]?.fileName === "note.mp4",
     seen[0]?.fileName ?? "nothing reached the provider");

  seen = [];
  const m4a = await speak({ type: "audio/x-m4a" });
  ok("older Safari's m4a too", m4a.status === 200 && seen[0]?.fileName === "note.m4a",
     seen[0]?.fileName ?? `HTTP ${m4a.status}`);

  seen = [];
  const bad = await speak({ type: "audio/aiff" });
  ok("and a format nobody supports is refused, not forwarded",
     bad.status === 415 && seen.length === 0, `HTTP ${bad.status}, ${seen.length} call(s)`);
}

/* ---------------- the mis-tap ----------------------------------------- */
console.log("\n=== a brushed button is not an error ===");
{
  seen = [];
  const r = await speak({ durationMs: 300 });
  // Under 900ms. Silently discarded: somebody who brushed the button
  // does not need it explained to them.
  ok("a 300ms recording comes back empty and calm", r.status === 200 && r.json?.tooShort === true,
     `HTTP ${r.status} ${JSON.stringify(r.json)}`);
  ok("and nothing was paid for", seen.length === 0, `${seen.length} call(s)`);
}

/* ---------------- the guards ------------------------------------------ */
console.log("\n=== what it refuses, without spending anything ===");
{
  seen = [];
  const big = await speak({ bytes: 7 * 1024 * 1024 });
  ok("an oversized recording is refused", big.status === 413, `HTTP ${big.status}`);

  const empty = await speak({ bytes: 0 });
  ok("an empty one is refused", empty.status === 400, `HTTP ${empty.status}`);

  const wrongField = await speak({ field: "file" });
  ok("a request with no audio field is refused", wrongField.status === 400, `HTTP ${wrongField.status}`);

  ok("and none of them reached the provider", seen.length === 0, `${seen.length} call(s)`);
}

/* ---------------- the audit trail -------------------------------------- */
console.log("\n=== the brokerage can see what it did ===");
{
  const before = await db.aiAction.count({ where: { orgId: org.id, origin: "voice.transcribe" } });
  await speak();
  let after = before;
  for (let i = 0; i < 20 && after === before; i++) {
    await new Promise((r) => setTimeout(r, 250));
    after = await db.aiAction.count({ where: { orgId: org.id, origin: "voice.transcribe" } });
  }
  /**
   * Every action the product takes on its own initiative is recorded,
   * and `/activity` is the screen that makes an assistant acceptable to
   * agents paid on commission. A transcription that leaves no trace is
   * a gap in that record.
   */
  ok("the transcription is on the record", after > before, `${after - before} action(s) logged`);

  const row = await db.aiAction.findFirst({
    where: { orgId: org.id, origin: "voice.transcribe" },
    orderBy: { createdAt: "desc" },
    select: { autonomy: true, after: true },
  });
  // The model drafts, a person commits.
  ok("as a suggestion, never as something done on the agent's behalf",
     row?.autonomy === "SUGGEST", row?.autonomy ?? "none");
  ok("with how long it took, so a slow provider is visible later",
     typeof (row?.after ?? {}).latencyMs === "number", JSON.stringify(row?.after ?? {}).slice(0, 70));
}

/* ---------------- a muffled recording ---------------------------------- */
console.log("\n=== a recording it is unsure about says so ===");
{
  mode = "unsure";
  const r = await speak();
  // Below the threshold the client shows the text but does not
  // pre-select it. The rule: the model drafts, a person commits.
  ok("low confidence is flagged for the agent", r.json?.lowConfidence === true,
     `confidence ${r.json?.confidence}`);
  mode = "good";
}

/* ---------------- the provider falls over ------------------------------ */
console.log("\n=== and when the provider falls over ===");
{
  mode = "fail";
  const r = await speak();
  // 502, and a sentence an agent can act on rather than a stack trace.
  ok("it fails as a gateway error, not a 500", r.status === 502, `HTTP ${r.status}`);
  ok("and tells the agent what to do instead", /type it/i.test(r.json?.error ?? ""),
     r.json?.error ?? "no message");
  mode = "good";
}

/* ---------------- the rate limit --------------------------------------- */
console.log("\n=== somebody holding the button down is stopped ===");
{
  /**
   * `ratelimit.ts` carries `voice.transcribe` at 20 in 5 minutes, and
   * CLAUDE.md records a rule that sat in that file for the life of the
   * project with nothing invoking it — `limit()` returns *allowed* for
   * an unknown action, so a typo reads as a wired limit and enforces
   * nothing. This asserts the rule fires.
   */
  let limited = 0, calls = 0;
  for (let i = 0; i < 26 && !limited; i++) {
    const r = await speak();
    calls++;
    if (r.status === 429) limited = r.status;
  }
  ok("the limit fires", limited === 429, limited ? `after ${calls} recordings` : `${calls} allowed, none refused`);
}

stub.close();
await db.$disconnect();

console.log();
if (bad) { console.log(`${bad} PROBLEM(S)\n`); process.exit(1); }
console.log("  speech becomes text, and the iPhone is the one that works.\n");
