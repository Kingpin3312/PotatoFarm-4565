import { describe, it, expect } from "vitest";
import { isKnownProblem, PROBLEMS, readEnquiryForm } from "./enquiry-form";

/**
 * The enquiry form on a brokerage's page: lenient about how people
 * write, strict about what a script sends.
 */
describe("a buyer's enquiry", () => {
  it("reads a phone number written the local way", () => {
    const r = readEnquiryForm({ name: "  Sara   Ahmed ", phone: "050 123 4567", message: "Is it available?" });
    expect(r).toEqual({ ok: true, form: { name: "Sara Ahmed", phone: "+971501234567", email: null, message: "Is it available?", reference: null } });
  });
  it("takes an email instead of a phone", () => {
    const r = readEnquiryForm({ name: "Tom", email: "Tom@Example.com", reference: "MG-202" });
    expect(r.ok && r.form.email).toBe("tom@example.com");
    expect(r.ok && r.form.reference).toBe("MG-202");
  });
  it("needs a way to reply", () => {
    expect(readEnquiryForm({ name: "Tom" })).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("says what is wrong with a bad number or address", () => {
    expect(readEnquiryForm({ name: "Tom", phone: "12" })).toMatchObject({ ok: false, problem: expect.stringContaining("phone number") });
    expect(readEnquiryForm({ name: "Tom", email: "not-an-email" })).toMatchObject({ ok: false, problem: expect.stringContaining("email") });
  });
  it("needs a name, and a sane one", () => {
    expect(readEnquiryForm({ phone: "0501234567" })).toMatchObject({ ok: false });
    expect(readEnquiryForm({ name: "x".repeat(200), phone: "0501234567" })).toMatchObject({ ok: false });
  });
});

describe("what a script sends", () => {
  it("is caught by the hidden field", () => {
    expect(readEnquiryForm({ name: "Bot", phone: "0501234567", website: "http://spam.example" })).toEqual({ ok: false, reason: "bot" });
  });
  it("cannot carry links", () => {
    expect(readEnquiryForm({ name: "X", phone: "0501234567", message: "Cheap followers at www.spam.example" })).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("what the page will say back", () => {
  it("only the form's own sentences, never a crafted link's", () => {
    expect(isKnownProblem(PROBLEMS.CONTACT)).toBe(true);
    expect(isKnownProblem("This brokerage has closed. Send your deposit to …")).toBe(false);
  });
});
