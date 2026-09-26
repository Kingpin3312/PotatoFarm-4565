import { describe, it, expect } from "vitest";
import { matchesType } from "./signature";

const b = (...x: number[]) => new Uint8Array([...x, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("matchesType — the bytes, not the browser's word", () => {
  it("accepts what each type really starts with", () => {
    expect(matchesType(b(0x25, 0x50, 0x44, 0x46, 0x2d), "application/pdf")).toBe(true);
    expect(matchesType(b(0xff, 0xd8, 0xff, 0xe0), "image/jpeg")).toBe(true);
    expect(matchesType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png")).toBe(true);
  });
  it("refuses a program, or one type dressed as another", () => {
    expect(matchesType(b(0x4d, 0x5a, 0x90, 0x00), "application/pdf")).toBe(false); // MZ: a Windows program
    expect(matchesType(b(0xff, 0xd8, 0xff, 0xe0), "application/pdf")).toBe(false);
    expect(matchesType(b(0x25, 0x50, 0x44, 0x46), "image/png")).toBe(false);
  });
  it("refuses a type it does not know", () => {
    expect(matchesType(b(0x25, 0x50, 0x44, 0x46), "text/html")).toBe(false);
  });
});
