import { describe, it, expect, afterEach } from "vitest";
import { invoiceNumber, supplierTrn } from "./number";

describe("invoiceNumber — one series for the supplier", () => {
  it("is the supplier's prefix and a zero-padded count", () => {
    expect(invoiceNumber(1)).toBe("PF-000001");
    expect(invoiceNumber(1234)).toBe("PF-001234");
  });
  it("sorts in issue order as text, so a register reads in sequence", () => {
    const n = [9, 10, 99, 100].map(invoiceNumber);
    expect([...n].sort()).toEqual(n);
  });
  it("refuses anything that is not a count", () => {
    for (const bad of [0, -1, 1.5, NaN]) expect(() => invoiceNumber(bad)).toThrow();
  });
});

describe("supplierTrn — no VAT without a registration", () => {
  const was = process.env.SUPPLIER_TRN;
  afterEach(() => { process.env.SUPPLIER_TRN = was; });

  it("refuses when it is not set", () => {
    delete process.env.SUPPLIER_TRN;
    expect(() => supplierTrn()).toThrow(/SUPPLIER_TRN is not set/);
  });
  it("refuses a number that is not fifteen digits, since it is printed on every invoice", () => {
    process.env.SUPPLIER_TRN = "10000000000000";
    expect(() => supplierTrn()).toThrow(/fifteen-digit/);
  });
  it("accepts one written with spaces, as it is on the certificate", () => {
    process.env.SUPPLIER_TRN = "100 0000 0000 0003";
    expect(supplierTrn()).toBe("100000000000003");
  });
});
