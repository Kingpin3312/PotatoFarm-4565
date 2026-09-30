import { describe, it, expect } from "vitest";
import { guessMapping, planImport, readAed, readSource, tally } from "./plan";

const none = new Map<string, { id: string; name: string | null }>();

describe("guessMapping — the headers other systems use", () => {
  it("finds the obvious columns", () => {
    expect(guessMapping(["Full Name", "Mobile", "E-mail", "Lead Source", "Assigned To", "Comments"])).toEqual({
      name: "Full Name", phone: "Mobile", email: "E-mail", source: "Lead Source", agent: "Assigned To", notes: "Comments",
    });
  });
  it("uses first and last name when there is no full name", () => {
    const m = guessMapping(["First Name", "Last Name", "Phone"]);
    expect(m.firstName).toBe("First Name");
    expect(m.lastName).toBe("Last Name");
    expect(m.name).toBeUndefined();
  });
  it("does not map one column twice", () => {
    const m = guessMapping(["Contact Number", "Contact Name"]);
    expect(m.phone).toBe("Contact Number");
    expect(m.name).toBe("Contact Name");
  });
});

describe("planImport — every row gets a verdict", () => {
  const base = { mapping: { name: "name", phone: "phone", email: "email", agent: "agent", budget: "budget", areas: "areas", bedrooms: "beds" },
                 byPhone: none, byEmail: none, agents: new Map([["lena@x.ae", "u1"]]), batchTag: "import-1" };

  it("reads a good row, in any phone format", () => {
    const [v] = planImport({ ...base, rows: [{ name: "Sara", phone: "050 100 0041", email: "S@X.COM", agent: "lena@x.ae", budget: "3m", areas: "marina, the palm", beds: "Studio" }] });
    expect(v).toMatchObject({ line: 2, status: "new", lead: {
      phone: "+971501000041", email: "s@x.com", agentId: "u1", budgetMaxAed: 3_000_000,
      communities: ["Dubai Marina", "Palm Jumeirah"], bedrooms: 0, tags: ["import-1"] } });
  });
  it("names the line and the reason for a row it cannot take", () => {
    const v = planImport({ ...base, rows: [{ name: "No number" }, { name: "Bad", phone: "12345" }] });
    expect(v.map((x) => [x.line, x.status])).toEqual([[2, "error"], [3, "error"]]);
    expect(v[1]!.status === "error" && v[1]!.reason).toContain("12345");
  });
  it("one person twice in a file is one lead, and says which line", () => {
    const v = planImport({ ...base, rows: [{ phone: "0501000041" }, { phone: "+971 50 100 0041" }] });
    expect(v[1]).toMatchObject({ status: "repeat", of: 2 });
  });
  it("somebody already on file is matched by number or by email", () => {
    const byPhone = new Map([["+971501000041", { id: "L1", name: "Sara" }]]);
    const byEmail = new Map([["o@x.com", { id: "L2", name: "Omar" }]]);
    const v = planImport({ ...base, byPhone, byEmail, rows: [{ phone: "0501000041" }, { phone: "0501000099", email: "O@x.com" }] });
    expect(v.map((x) => x.status)).toEqual(["exists", "exists"]);
  });
  it("keeps the row and warns rather than guessing at a bad field", () => {
    const [v] = planImport({ ...base, rows: [{ phone: "0501000041", email: "not-an-email", agent: "gone@x.ae", budget: "lots", beds: "many" }] });
    expect(v!.status).toBe("new");
    expect(v!.warnings).toHaveLength(4);
    expect(tally([v!])).toEqual({ new: 1, exists: 0, repeat: 0, error: 0, warnings: 1 });
  });
});

describe("readers", () => {
  it("reads money the way it is written", () => {
    expect(readAed("AED 2,500,000")).toBe(2_500_000);
    expect(readAed("2.5 million")).toBe(2_500_000);
    expect(readAed("800k")).toBe(800_000);
    expect(readAed("")).toBeNull();
    expect(readAed("call me")).toBe("bad");
  });
  it("reads a source label into the list", () => {
    expect(readSource("Property Finder")).toBe("PROPERTY_FINDER");
    expect(readSource("Instagram ad")).toBe("META_LEAD_ADS");
    expect(readSource("Friend referral")).toBe("REFERRAL");
    expect(readSource("??")).toBe("UNKNOWN");
  });
});
