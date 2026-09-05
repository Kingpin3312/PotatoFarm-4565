/**
 * Is the SigV4 implementation correct?
 *
 * `sigv4.ts` is hand-rolled request signing. Hand-rolled crypto that has
 * never been checked against a known-good value is how you get an
 * integration that works against the one provider you happened to test
 * and fails against every other — and the failure is
 * `SignatureDoesNotMatch`, which reads like a credentials problem and
 * sends whoever is debugging it to the wrong place for a day.
 *
 * So it is checked against the signature AWS publishes in its own
 * documentation, plus the cases most likely to be got wrong: a key with
 * a space and brackets in it, and a UTF-8 filename.
 *
 *     npm run check:sigv4
 */
import { presign, uriEncode, _internals } from "../src/server/lib/files/sigv4";

const fails: string[] = [];

function is(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    console.log(`      got  ${got}`);
    console.log(`      want ${want}`);
    fails.push(label);
  }
}

/**
 * AWS's documented example: a presigned GET for `examplebucket/test.txt`,
 * valid 24 hours, with the example credentials that appear throughout
 * the Signature Version 4 documentation.
 *
 * The expected signature is published alongside it. If this line ever
 * changes, the implementation is wrong — not the vector.
 */
console.log("\nAWS's published presigned-URL example:");
{
  const { query } = presign({
    creds: {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "s3",
    },
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    headers: {},
    expiresInSeconds: 86400,
    now: new Date("2013-05-24T00:00:00Z"),
  });

  is(
    "signature matches AWS's documented value",
    query["X-Amz-Signature"],
    "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
  );
  is("credential scope", query["X-Amz-Credential"],
     "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request");
  is("signed headers is host alone", query["X-Amz-SignedHeaders"], "host");
  is("date stamp", query["X-Amz-Date"], "20130524T000000Z");
}

/**
 * The encoding rules, which are where this goes wrong quietly.
 *
 * `encodeURIComponent` leaves `!'()*` alone and AWS requires them
 * encoded. A brochure called "Marina Gate (2 bed).pdf" is an entirely
 * ordinary filename and would fail against a correct server while every
 * test with a tidy name passed.
 */
console.log("\nPercent-encoding, AWS's rules rather than JavaScript's:");
is("space", uriEncode("a b"), "a%20b");
is("parentheses", uriEncode("(2 bed)"), "%282%20bed%29");
is("apostrophe", uriEncode("O'Brien"), "O%27Brien");
is("exclamation and star", uriEncode("a!b*c"), "a%21b%2Ac");
is("unreserved untouched", uriEncode("A-Za-z0-9_.~"), "A-Za-z0-9_.~");
is("slash encoded by default", uriEncode("a/b"), "a%2Fb");
is("slash kept in a path", uriEncode("a/b", false), "a/b");
is("utf-8 is byte-wise", uriEncode("é"), "%C3%A9");

/**
 * A signed `content-length` is the whole size guarantee.
 *
 * If it is missing from `X-Amz-SignedHeaders`, a ticket issued for a 2MB
 * PDF can be used to push 100MB and nothing stops it.
 */
console.log("\nThe upload ticket signs what it claims to:");
{
  const { query, url } = presign({
    creds: { accessKeyId: "AKIA", secretAccessKey: "secret", region: "auto", service: "s3" },
    method: "PUT",
    host: "acc.r2.cloudflarestorage.com",
    path: "/potato/org/abc/files/Marina Gate (2 bed).pdf",
    headers: { "content-type": "application/pdf", "content-length": "2048" },
    expiresInSeconds: 900,
    now: new Date("2026-08-09T12:00:00Z"),
  });
  is("content-length is signed", query["X-Amz-SignedHeaders"],
     "content-length;content-type;host");
  is("expiry carried", query["X-Amz-Expires"], "900");
  is("path is encoded, slashes kept",
     url.split("?")[0],
     "https://acc.r2.cloudflarestorage.com/potato/org/abc/files/Marina%20Gate%20%282%20bed%29.pdf");
}

/**
 * Same inputs, same signature; one byte different, different signature.
 * Cheap, and it catches a signer that is accidentally ignoring an input.
 */
console.log("\nThe signature actually depends on its inputs:");
{
  const base = {
    creds: { accessKeyId: "AKIA", secretAccessKey: "secret", region: "auto", service: "s3" },
    method: "PUT" as const,
    host: "h.example.com",
    path: "/b/k",
    headers: { "content-length": "100" },
    expiresInSeconds: 900,
    now: new Date("2026-08-09T12:00:00Z"),
  };
  const a = presign(base).query["X-Amz-Signature"];
  const b = presign(base).query["X-Amz-Signature"];
  const c = presign({ ...base, headers: { "content-length": "101" } }).query["X-Amz-Signature"];
  const d = presign({ ...base, path: "/b/k2" }).query["X-Amz-Signature"];

  is("deterministic", a, b);
  console.log(`  ${a !== c ? "✓" : "✗"} a different content-length changes it`);
  if (a === c) fails.push("content-length does not affect the signature");
  console.log(`  ${a !== d ? "✓" : "✗"} a different key changes it`);
  if (a === d) fails.push("the object key does not affect the signature");
}

console.log(`\n${"─".repeat(58)}`);
if (fails.length === 0) {
  console.log("PASS — signing matches AWS's published vector.\n");
  process.exit(0);
}
console.log(`FAIL — ${fails.length}:`);
fails.forEach((f) => console.log(`  x ${f}`));
console.log();
void _internals;
process.exit(1);
