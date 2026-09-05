# The visa field, and what it deliberately is not

`Lead.visaExpiresAt` is a date. It is not a passport number, an Emirates
ID, a scan, or anything that would make this a KYC record rather than a
sales note.

**Never collected by asking.** The assistant does not have "what is your
visa expiry?" as a qualifying question, and no form on the site asks for
it. It is only ever something an agent typed in after a buyer mentioned
it in conversation — *"my visa renews in March, I want to be settled
before then"* — because there was nowhere to put that before.

The distinction matters for two reasons:

1. **A date is not enough to identify anyone.** A visa number, an
   Emirates ID or a scan is. Storing the weaker thing on purpose is what
   keeps this a CRM field rather than a document we would need to treat
   like the AML file — with its own retention rules, its own access
   controls, and its own place in a breach notification.

2. **It is never asked for.** A field a buyer volunteered in passing and
   a field we interrogated them for are different things even when the
   data looks the same, and only the first belongs in a sales record.

If this ever needs to hold more than a date — a document, a number, a
scan — it moves to the compliance file and gets the KYC retention and
access rules that go with it. It does not grow in place.
