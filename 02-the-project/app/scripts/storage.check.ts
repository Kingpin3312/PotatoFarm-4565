/**
 * Does the storage adapter actually store, read back and delete?
 *
 * `sigv4.check.ts` proves the signing matches AWS's published value.
 * This proves the layer above it — path style, the scheme, the object
 * key, which HTTP verb goes where, and the 404 handling that decides
 * whether a row is written into the attachment library.
 *
 * It runs against a tiny S3-shaped server on localhost rather than a
 * real provider, so it needs no credentials and no network. That server
 * **verifies the presigned signature itself**, recomputing it from the
 * request with an independent copy of the algorithm — a stub that
 * accepted any request would prove only that fetch works.
 *
 *     npm run check:storage
 */
import { createHmac, createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const KEY_ID = "TESTKEYID";
const SECRET = "testsecretkey";
const BUCKET = "potato-test";

const fails: string[] = [];
function ok(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
  if (!pass) fails.push(label);
}

/* ------------------------------------------------------------------ */
/* A very small S3                                                     */
/* ------------------------------------------------------------------ */

const objects = new Map<string, { body: Buffer; contentType: string }>();

/**
 * Independent verification of the presigned signature.
 *
 * Written from the AWS specification rather than by importing the
 * implementation under test — importing it would make this a check that
 * the code equals itself.
 */
function verifyPresigned(method: string, url: URL, headers: Record<string, string>): boolean {
  const q = url.searchParams;
  const signature = q.get("X-Amz-Signature");
  const credential = q.get("X-Amz-Credential");
  const amzDate = q.get("X-Amz-Date");
  const signedHeaders = q.get("X-Amz-SignedHeaders");
  if (!signature || !credential || !amzDate || !signedHeaders) return false;

  const [, dateStamp, region, service] = credential.split("/");
  if (!dateStamp || !region || !service) return false;

  const enc = (s: string, slash = true) =>
    [...s]
      .map((ch) =>
        /[A-Za-z0-9\-._~]/.test(ch)
          ? ch
          : ch === "/" && !slash
            ? "/"
            : [...Buffer.from(ch, "utf8")]
                .map((b) => "%" + b.toString(16).toUpperCase().padStart(2, "0"))
                .join("")
      )
      .join("");

  const canonicalQuery = [...q.keys()]
    .filter((k) => k !== "X-Amz-Signature")
    .sort()
    .map((k) => `${enc(k)}=${enc(q.get(k) ?? "")}`)
    .join("&");

  const names = signedHeaders.split(";");
  const canonicalHeaders = names.map((n) => `${n}:${(headers[n] ?? "").trim()}`).join("\n") + "\n";

  const canonicalRequest = [
    method,
    enc(decodeURIComponent(url.pathname), false),
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    `${dateStamp}/${region}/${service}/aws4_request`,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const h = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d, "utf8").digest();
  const kSigning = h(h(h(h("AWS4" + SECRET, dateStamp), region), service), "aws4_request");
  const expected = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return expected === signature;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const key = decodeURIComponent(url.pathname).replace(new RegExp(`^/${BUCKET}/`), "");
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c as Buffer));
  req.on("end", () => {
    const hdrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) hdrs[k] = Array.isArray(v) ? v.join(",") : (v ?? "");

    if (url.searchParams.has("X-Amz-Signature")) {
      if (!verifyPresigned(req.method ?? "GET", url, hdrs)) {
        res.writeHead(403).end("SignatureDoesNotMatch");
        return;
      }
      // The signed content-length must match what actually arrived —
      // this is the whole size guarantee.
      const declared = hdrs["content-length"];
      const actual = String(Buffer.concat(chunks).length);
      if (declared !== undefined && declared !== actual) {
        res.writeHead(400).end("IncorrectContentLength");
        return;
      }
    } else if (!(hdrs["authorization"] ?? "").startsWith("AWS4-HMAC-SHA256 ")) {
      res.writeHead(403).end("MissingAuthorization");
      return;
    }

    switch (req.method) {
      case "PUT":
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: hdrs["content-type"] ?? "application/octet-stream",
        });
        res.writeHead(200).end();
        return;
      case "HEAD": {
        const o = objects.get(key);
        if (!o) return void res.writeHead(404).end();
        res.writeHead(200, { "content-length": String(o.body.length) }).end();
        return;
      }
      case "GET": {
        const o = objects.get(key);
        if (!o) return void res.writeHead(404).end();
        res.writeHead(200, { "content-type": o.contentType }).end(o.body);
        return;
      }
      case "DELETE":
        objects.delete(key);
        res.writeHead(204).end();
        return;
      default:
        res.writeHead(405).end();
    }
  });
});

/* ------------------------------------------------------------------ */

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  // Unconfigured first, before the environment is set — the important
  // property is that it refuses loudly rather than pretending.
  console.log("\nUnconfigured, it refuses rather than pretends:");
  {
    for (const k of ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      delete process.env[k];
    }
    const s = await import("../src/server/lib/files/storage");
    ok("storageConfigured() is false", s.storageConfigured() === false);
    let threw = "";
    await s.signPut({ key: "k", mimeType: "application/pdf", sizeBytes: 1, expiresInSeconds: 60 })
      .catch((e) => (threw = String(e.message)));
    ok("signPut throws and names what to set", threw.includes("S3_BUCKET"), threw.slice(0, 48) + "…");
  }

  process.env.S3_BUCKET = BUCKET;
  process.env.S3_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.S3_ACCESS_KEY_ID = KEY_ID;
  process.env.S3_SECRET_ACCESS_KEY = SECRET;
  process.env.S3_REGION = "auto";

  const s = await import("../src/server/lib/files/storage");
  ok("storageConfigured() is true once set", s.storageConfigured() === true);

  // A filename with the characters that break naive encoding.
  const key = "org/abc123/files/Marina Gate (2 bed) — O'Brien.pdf";
  const body = Buffer.from("%PDF-1.7\nnot really a pdf, but exact bytes matter\n");

  console.log("\nRound trip:");
  ok("objectExists is false before anything is uploaded", (await s.objectExists(key)) === false);

  const url = await s.signPut({
    key, mimeType: "application/pdf", sizeBytes: body.length, expiresInSeconds: 900,
  });
  const put = await fetch(url, {
    method: "PUT", body,
    headers: { "Content-Type": "application/pdf", "Content-Length": String(body.length) },
  });
  ok("the browser's PUT is accepted", put.status === 200, `status ${put.status}`);
  ok("objectExists is true afterwards", (await s.objectExists(key)) === true);

  const read = await s.readObject(key);
  ok("readObject returns the exact bytes", Buffer.from(read).equals(body));

  console.log("\nThe signature is doing work, not decoration:");
  {
    const tampered = url.replace(/X-Amz-Signature=[0-9a-f]+/, "X-Amz-Signature=" + "0".repeat(64));
    const r = await fetch(tampered, { method: "PUT", body, headers: { "Content-Type": "application/pdf" } });
    ok("a tampered signature is rejected", r.status === 403, `status ${r.status}`);
  }
  {
    // A ticket issued for this many bytes cannot carry more.
    const small = await s.signPut({
      key: "org/abc123/files/small.pdf", mimeType: "application/pdf",
      sizeBytes: 10, expiresInSeconds: 900,
    });
    const big = Buffer.alloc(5000, 0x41);
    const r = await fetch(small, {
      method: "PUT", body: big,
      headers: { "Content-Type": "application/pdf", "Content-Length": String(big.length) },
    });
    ok("a bigger body than the ticket allows is rejected", r.status === 403 || r.status === 400,
       `status ${r.status}`);
  }
  {
    const wrongType = await s.signPut({
      key: "org/abc123/files/t.pdf", mimeType: "application/pdf",
      sizeBytes: body.length, expiresInSeconds: 900,
    });
    const r = await fetch(wrongType, {
      method: "PUT", body,
      headers: { "Content-Type": "text/html", "Content-Length": String(body.length) },
    });
    ok("a different content-type than was signed is rejected", r.status === 403, `status ${r.status}`);
  }

  console.log("\nDelete:");
  await s.deleteObject(key);
  ok("the object is gone", (await s.objectExists(key)) === false);
  let threw = false;
  await s.deleteObject("org/abc123/files/never-existed").catch(() => (threw = true));
  ok("deleting something that was never there is not an error", !threw);

  server.close();
  console.log(`\n${"─".repeat(58)}`);
  if (fails.length === 0) {
    console.log("PASS — objects go in, come back byte-for-byte, and go away.\n");
    process.exit(0);
  }
  console.log(`FAIL — ${fails.length}:`);
  fails.forEach((f) => console.log(`  x ${f}`));
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
