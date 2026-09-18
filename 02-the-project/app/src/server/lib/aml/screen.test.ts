import { describe, it, expect, beforeEach } from "vitest";
import type { ScreeningResult } from "@prisma/client";
import { screen, registerScreener, screeningConfigured } from "./screen";
import type { Screener } from "./screening";

/**
 * The one property that matters here: **nothing may ever record a
 * `CLEAR` that a provider did not actually produce.**
 *
 * A fabricated clear is worse than no screening at all. No screening is
 * a gap somebody can find; a `CLEAR` row is positive evidence that a
 * check was performed, with a timestamp, sitting in the file an
 * inspector reads. It converts a missing control into a false record of
 * one.
 *
 * `ScreeningWriter` is structural precisely so this can be proved
 * without a database.
 */

type Written = {
  result: ScreeningResult;
  provider: string;
  lists: string[];
  nameChecked: string;
  clearedNote?: string | null;
};

function writer() {
  const rows: Written[] = [];
  return {
    rows,
    db: {
      screening: {
        create(args: { data: Record<string, unknown> }) {
          rows.push(args.data as unknown as Written);
          return Promise.resolve({
            id: `scr_${rows.length}`,
            result: args.data.result as ScreeningResult,
          });
        },
      },
    },
  };
}

/** Reset the module-level provider between tests. */
function clearProvider() {
  // `registerScreener` is the only way in, and the type forbids null, so
  // the reset goes through the same door with an explicit sentinel.
  (registerScreener as unknown as (s: Screener | null) => void)(null);
}

const subject = { orgId: "org_1", kycId: "kyc_1", fullName: "Mohammed Al Rashid" };

describe("screening with no provider configured", () => {
  beforeEach(clearProvider);

  it("records ERROR, never CLEAR", async () => {
    const w = writer();
    const out = await screen(w.db, subject);

    expect(out.result).toBe("ERROR");
    expect(out.result).not.toBe("CLEAR");
    expect(out.unscreened).toBe(true);
    expect(w.rows[0]?.result).toBe("ERROR");
  });

  it("names the provider 'none' rather than inventing one", async () => {
    const w = writer();
    await screen(w.db, subject);

    expect(w.rows[0]?.provider).toBe("none");
    // No list was consulted, so none may be claimed. The compliance
    // screen reads this to decide what to tell the officer.
    expect(w.rows[0]?.lists).toEqual([]);
  });

  it("says in the record itself that nothing was checked", async () => {
    const w = writer();
    await screen(w.db, subject);

    expect(w.rows[0]?.clearedNote).toMatch(/NOT been/i);
  });

  it("still writes a row, so the file is visibly unscreened", async () => {
    const w = writer();
    await screen(w.db, subject);

    // The alternative — writing nothing — is what the whole module did
    // before, and it left the compliance queue empty and reassuring.
    expect(w.rows).toHaveLength(1);
  });
});

describe("screening when the provider fails", () => {
  beforeEach(clearProvider);

  it("records ERROR rather than treating an outage as no hits", async () => {
    registerScreener({
      name: "test-provider",
      lists: ["UN Consolidated"],
      check: () => Promise.reject(new Error("upstream timeout")),
    });

    const w = writer();
    const out = await screen(w.db, subject);

    expect(out.result).toBe("ERROR");
    expect(out.guidance).toMatch(/upstream timeout/);
    expect(w.rows[0]?.result).toBe("ERROR");
  });
});

describe("screening with a working provider", () => {
  beforeEach(clearProvider);

  it("clears only when the provider returns no hits", async () => {
    registerScreener({
      name: "test-provider",
      lists: ["UN Consolidated", "UAE Local Terrorist List"],
      check: () => Promise.resolve({ result: "CLEAR" as ScreeningResult, hits: [] }),
    });

    const w = writer();
    const out = await screen(w.db, subject);

    expect(out.result).toBe("CLEAR");
    expect(out.unscreened).toBe(false);
    expect(w.rows[0]?.provider).toBe("test-provider");
    expect(w.rows[0]?.lists).toContain("UN Consolidated");
  });

  it("does not auto-clear a weak hit", async () => {
    registerScreener({
      name: "test-provider",
      lists: ["UN Consolidated"],
      check: () => Promise.resolve({
        result: "POSSIBLE_MATCH" as ScreeningResult,
        // Deliberately low. `AUTO_CLEAR_THRESHOLD` is null, so even a
        // weak name match goes to a person.
        hits: [{ listName: "UN Consolidated", matchedName: "M. Al Rashid", score: 0.62 }],
      }),
    });

    const w = writer();
    const out = await screen(w.db, subject);

    expect(out.result).toBe("POSSIBLE_MATCH");
    expect(out.urgency).toBe("review");
  });

  it("treats a strong hit as confirmed and urgent", async () => {
    registerScreener({
      name: "test-provider",
      lists: ["UAE Local Terrorist List"],
      check: () => Promise.resolve({
        result: "CONFIRMED_MATCH" as ScreeningResult,
        hits: [{ listName: "UAE Local Terrorist List", matchedName: "Mohammed Al Rashid", score: 0.98 }],
      }),
    });

    const w = writer();
    const out = await screen(w.db, subject);

    expect(out.result).toBe("CONFIRMED_MATCH");
    expect(out.urgency).toBe("immediate");
    // The guidance is what an officer acts on, and tipping off is a
    // separate offence — it has to say so.
    expect(out.guidance).toMatch(/tipping off/i);
  });
});

describe("screeningConfigured", () => {
  beforeEach(clearProvider);

  it("is false until a provider is registered", () => {
    expect(screeningConfigured()).toBe(false);
    registerScreener({
      name: "test-provider", lists: [],
      check: () => Promise.resolve({ result: "CLEAR" as ScreeningResult, hits: [] }),
    });
    expect(screeningConfigured()).toBe(true);
  });
});
