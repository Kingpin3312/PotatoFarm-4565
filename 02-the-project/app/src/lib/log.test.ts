import { describe, it, expect, vi, afterEach } from "vitest";
import { log, report } from "./log";

/**
 * Nothing personal reaches a log — in any of the three parts of a line.
 *
 * `extra` was scrubbed and the message and the context were not, and
 * `report()` puts an error's own text in the message. These capture what
 * actually reaches the console, because that is what gets shipped.
 */
function captured(fn: () => void) {
  const lines: string[] = [];
  const spy = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  vi.spyOn(console, "log").mockImplementation(spy);
  vi.spyOn(console, "warn").mockImplementation(spy);
  vi.spyOn(console, "error").mockImplementation(spy);
  fn();
  return lines.join("\n");
}

afterEach(() => vi.restoreAllMocks());

describe("log scrubbing", () => {
  it("scrubs a phone number and an email in the message itself", () => {
    const out = captured(() => log.warn("send to +971501234567 failed, cc priya@example.com", { orgId: "org_1" }));
    expect(out).not.toContain("501234567");
    expect(out).not.toContain("priya@example.com");
    expect(out).toContain("org_1");
  });

  it("scrubs the arguments a refused database call prints back", () => {
    // The shape of a Prisma validation error: the call, quoted.
    const err = new Error(`Invalid \`prisma.lead.create()\` invocation:\n{\n  data: {\n    name: "Priya Nair",\n    notes: "divorcing, needs to sell fast",\n    phone: "+971501234567"\n  }\n}`);
    const out = captured(() => report(err, { orgId: "org_1" }));
    expect(out).not.toContain("Priya Nair");
    expect(out).not.toContain("divorcing");
    expect(out).not.toContain("501234567");
    // The shape of the failure survives, which is what makes it debuggable.
    expect(out).toContain("prisma.lead.create");
  });

  it("scrubs the context as well as the extras", () => {
    const out = captured(() =>
      log.info("x", { orgId: "org_1", entityId: "+971501234567" } as never, { email: "a@b.co" }));
    expect(out).not.toContain("501234567");
    expect(out).not.toContain("a@b.co");
  });

  it("leaves ids and ordinary words alone", () => {
    const out = captured(() => log.info("lead cm1abc moved to QUALIFYING", { orgId: "org_1", entityId: "cm1abc" }));
    expect(out).toContain("lead cm1abc moved to QUALIFYING");
    expect(out).toContain('"entityId":"cm1abc"');
  });
});
