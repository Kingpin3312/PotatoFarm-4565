import { describe, it, expect } from "vitest";
import { portalOfSender, readLeadEmail, plainText } from "./lead-email";

/**
 * A portal's new-lead email, read without a published format.
 *
 * The sender is what makes it a lead; the body is read conservatively,
 * and anything it cannot find is left empty for the caller to put on the
 * agent's list rather than guessed.
 */
describe("which portal sent it", () => {
  it("goes by the sender's domain", () => {
    expect(portalOfSender("leads@bayut.com")).toBe("BAYUT");
    expect(portalOfSender("no-reply@mail.bayut.com")).toBe("BAYUT");
    expect(portalOfSender("alerts@dubizzle.com")).toBe("DUBIZZLE");
    expect(portalOfSender("leads@propertyfinder.ae")).toBe("PROPERTY_FINDER");
  });
  it("is not fooled by a lookalike or a name in the address", () => {
    expect(portalOfSender("bayut@gmail.com")).toBeNull();
    expect(portalOfSender("leads@bayut.com.evil.example")).toBeNull();
    expect(portalOfSender("leads@notbayut.com")).toBeNull();
    expect(portalOfSender(undefined)).toBeNull();
  });
});

describe("what the email says", () => {
  it("reads a labelled email", () => {
    const r = readLeadEmail({
      subject: "New lead for MG-202",
      body: "You have a new lead.\nName: Sara Ahmed\nPhone: 050 123 4567\nEmail: sara@example.com\nMessage: Is it still available?",
    });
    expect(r).toMatchObject({ name: "Sara Ahmed", phone: "+971501234567", email: "sara@example.com", message: "Is it still available?" });
    expect(r.refs[0]).toBe("mg202");
  });

  it("reads an HTML email laid out in a table", () => {
    const html = "<table><tr><td>Name:</td><td>Omar Khan</td></tr><tr><td>Mobile:</td><td>+971 55 765 4321</td></tr></table>";
    expect(plainText(html)).toContain("Name: Omar Khan");
    const r = readLeadEmail({ body: html });
    expect(r.name).toBe("Omar Khan");
    expect(r.phone).toBe("+971557654321");
  });

  it("takes the buyer's address from Reply-To, never the portal's or a robot's", () => {
    const r = readLeadEmail({ body: "Contact leads@bayut.com or noreply@x.com", replyTo: ["buyer@example.com"] });
    expect(r.email).toBe("buyer@example.com");
    expect(readLeadEmail({ body: "Sent by noreply@x.com via leads@bayut.com" }).email).toBeUndefined();
  });

  it("finds an unlabelled number but not a price", () => {
    expect(readLeadEmail({ body: "Call me on +44 7700 900123 please" }).phone).toBe("+447700900123");
    expect(readLeadEmail({ body: "Price AED 2,500,000 for 1,200 sq ft" }).phone).toBeUndefined();
  });

  it("leaves what it cannot find empty rather than guessing", () => {
    const r = readLeadEmail({ body: "Somebody is interested in your listing. Log in to see their details." });
    expect(r.phone).toBeUndefined();
    expect(r.email).toBeUndefined();
    expect(r.name).toBeUndefined();
  });
});
