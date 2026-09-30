import { afterEach, describe, expect, it, vi } from "vitest";
import { storageOrigin } from "./storage-origin";
import { signGet } from "@/server/lib/files/storage";
import { buildCsp } from "./csp";

/**
 * The policy must allow exactly the address storage signs, or every
 * direct upload is refused in production with nothing logged anywhere.
 * These compare the helper with the real signer rather than with a
 * string written here, so the two cannot drift apart.
 */
const cases: Record<string, Record<string, string>> = {
  "R2 (path style)": { S3_BUCKET: "photos", S3_ENDPOINT: "https://abc.r2.cloudflarestorage.com" },
  "AWS (virtual-hosted)": { S3_BUCKET: "photos", S3_ENDPOINT: "https://s3.me-central-1.amazonaws.com", S3_REGION: "me-central-1" },
  "AWS forced to path style": { S3_BUCKET: "photos", S3_ENDPOINT: "https://s3.amazonaws.com", S3_FORCE_PATH_STYLE: "true" },
  "MinIO over http": { S3_BUCKET: "photos", S3_ENDPOINT: "http://minio.internal:9000/" },
};

describe("storageOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const [name, env] of Object.entries(cases)) {
    it(`matches what storage signs: ${name}`, () => {
      vi.stubEnv("S3_ACCESS_KEY_ID", "k");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "s");
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const signed = new URL(signGet({ key: "org/x/listings/y/photos/z", expiresInSeconds: 60 })).origin;
      expect(storageOrigin()).toBe(signed);
      expect(buildCsp("n")).toContain(`connect-src 'self' https://api.stripe.com ${signed}`);
    });
  }

  it("is null, and the policy unchanged, when storage is not set up", () => {
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("S3_ENDPOINT", "");
    expect(storageOrigin()).toBeNull();
    expect(buildCsp("n")).toMatch(/connect-src 'self' https:\/\/api\.stripe\.com(;| ws:)/);
  });
});
