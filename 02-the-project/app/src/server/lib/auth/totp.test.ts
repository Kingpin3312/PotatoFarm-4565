import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, checkTotp, hashRecovery, hotp, newRecoveryCodes, newSecret, stepAt, totp } from "./totp";

// RFC 6238 appendix B uses the ASCII key "12345678901234567890" for SHA-1.
const RFC_KEY = Buffer.from("12345678901234567890");
const RFC_SECRET = base32Encode(RFC_KEY);

describe("totp", () => {
  it("matches RFC 4226's HOTP test values", () => {
    const want = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    want.forEach((w, i) => expect(hotp(RFC_KEY, i)).toBe(w));
  });

  it("matches RFC 6238's SHA-1 vectors (eight digits)", () => {
    expect(totp(RFC_SECRET, new Date(59_000), 8)).toBe("94287082");
    expect(totp(RFC_SECRET, new Date(1_111_111_109_000), 8)).toBe("07081804");
    expect(totp(RFC_SECRET, new Date(2_000_000_000_000), 8)).toBe("69279037");
  });

  it("round-trips base32", () => {
    const s = newSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(base32Decode("gezd gnbv")).toEqual(base32Decode("GEZDGNBV"));
  });

  it("accepts this step and one either side, nothing further", () => {
    const now = new Date(1_700_000_000_000);
    const at = (s: number) => totp(RFC_SECRET, new Date(now.getTime() + s * 30_000));
    expect(checkTotp(RFC_SECRET, at(0), now, null)).toBe(stepAt(now));
    expect(checkTotp(RFC_SECRET, at(-1), now, null)).toBe(stepAt(now) - 1);
    expect(checkTotp(RFC_SECRET, at(1), now, null)).toBe(stepAt(now) + 1);
    expect(checkTotp(RFC_SECRET, at(-2), now, null)).toBeNull();
    expect(checkTotp(RFC_SECRET, at(2), now, null)).toBeNull();
  });

  it("refuses a code already used", () => {
    const now = new Date(1_700_000_000_000);
    const code = totp(RFC_SECRET, now);
    const step = checkTotp(RFC_SECRET, code, now, null)!;
    expect(checkTotp(RFC_SECRET, code, now, step)).toBeNull();
  });

  it("refuses junk and tolerates a space", () => {
    const now = new Date(1_700_000_000_000);
    const code = totp(RFC_SECRET, now);
    expect(checkTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now, null)).not.toBeNull();
    expect(checkTotp(RFC_SECRET, "12345", now, null)).toBeNull();
    expect(checkTotp(RFC_SECRET, "abcdef", now, null)).toBeNull();
  });

  it("recovery codes are distinct and hash the same however typed", () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hashRecovery(codes[0]!.toLowerCase().replace("-", " "))).toBe(hashRecovery(codes[0]!));
  });
});
