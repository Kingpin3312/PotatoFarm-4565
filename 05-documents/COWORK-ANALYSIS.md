# Kendal Co-Work — what actually launched

## First, what is behind that URL

`cowork.kendal.ai` redirects to `/auth/login`. The entire public surface
is a logo, one headline, one sentence, and a login form:

> **AI Assistant Built for Agents Who Close**
> Manage your blackbook, sync email, contacts and WhatsApp in one place.
> Voice-activated and runs 24/7.

No pricing. No screenshots. No feature page. No marketing site. You
cannot see the product without an account.

**That is a landing page and a login, not a launch.** It is either an
invite-only beta or a page testing whether the positioning pulls
sign-ups. Treating it as a shipped competitor overstates what is
verifiably there — and I would rather say that than agree with the
premise.

## But the strategic move is real, and it is the important part

Read the headline again: **"Agents Who Close."** Not brokerages. And
**"your blackbook"** — the agent's own contact list, the one they take
with them when they change firm.

Kendal's main product sells to the brokerage. Co-Work sells to the
**agent**. That is a different company motion:

| | Brokerage sale | Agent sale |
|---|---|---|
| Cycle | Weeks, one principal | Minutes, self-serve |
| Spread | Top-down, contract | Inside a firm, viral |
| Churn | The firm leaves | The agent leaves and takes it |

**This is the exact risk the investor memo named** — that in this market
the relationship belongs to the agent, not the firm, and a brokerage CRM
is a system of record for something it does not own. Kendal has now
built a product that assumes that is true.

## What they have that we do not

Three things, and only one matters much.

| | Us | Note |
|---|---|---|
| **Email sync** | none | A real gap. Agents live in email as well as WhatsApp |
| **Contacts sync** | none | Device contacts into the CRM |
| **Agent-owned blackbook** | none | Ours are org-owned, deliberately |
| Voice **commands** | dictation only | We record notes; they drive the CRM |

## What we have that an agent-side tool structurally cannot

This is the part worth being clear about, because it is not a feature
list — it is a category difference.

- **Vendors, offers with negotiation history, deal progression to DLD
  transfer, commission splits**
- **KYC records, screening, compliance reports** — `KycRecord`,
  `KycDocument`, `Screening`, `ComplianceReport`

**AML is a brokerage obligation, not an agent one.** A DNFBP filing is
made by the firm. An agent's personal blackbook cannot hold the
compliance file, cannot be the audit trail an inspector reads, and
cannot be the system that refuses to publish a listing without a valid
Trakheesi permit.

An agent tool and a brokerage system of record are **different
products**, and Co-Work existing is evidence Kendal thinks so too —
otherwise it would be a feature inside the main CRM rather than a
separate subdomain with its own login.

---

## Built anyway — and here is what "improve" actually meant

The recommendation below was overruled, which is a reasonable call to
make. So it is built, and the improvement is not a longer feature list.

**Their blackbook walks out with the agent. This one splits.**

| | |
|---|---|
| **The agent's, exports with them** | nicknames, private notes, their own tags, starred, last touched |
| **The brokerage's, stays** | the client record, conversations, viewings, offers, deals, the KYC file |

An agent who believes the book is theirs will use it. One who suspects
it is a trap keeps their real notes on their phone — and then the
brokerage has neither the notes nor the relationship. Saying which is
which, on the export screen, is better than either side finding out on
the day somebody resigns.

**Three things make it hold rather than just claim it:**

- A blackbook entry is a **view** of a lead or vendor, not a copy. Two
  contact stores is how a CRM starts lying to itself.
- The private note is **not audited**. An audit row is a record a
  manager can read, and auditing a private note would quietly make it
  public.
- `audit.py` fails the build if any blackbook procedure touches the
  table without scoping to the calling agent. A single dropped filter
  turns the whole thing into a report.

**Email sync is in too** — the one gap worth building on its own merits.
Headers and a snippet, never bodies: a brokerage mailbox holds salary
discussions and legal advice that has nothing to do with property, and
storing that turns this into a mail archive with a far worse breach
story. Only mail involving somebody the brokerage already knows is kept;
the rest is discarded before it is written down.

---

## The original recommendation, for the record

**Do not clone Co-Work.** Three reasons, in order of weight:

**1. It cannibalises the sale you have not made yet.** PotatoFarm has
zero customers. Building an agent-side tool splits a product that has
not yet proved the brokerage-side one, and it competes with your own
pitch — a principal buying a system of record does not want their agents
handed a portable blackbook.

**2. It is a different business.** Self-serve, low ACV, consumer-shaped
support. Nothing about the current architecture, pricing model or sales
motion fits it.

**3. Chasing a competitor's newest SKU before landing customer one is
the reliable way to never land customer one.** That is the failure mode,
and it is more common than being out-featured.

### What to actually do

**Build email sync.** It is the one genuine gap and it is
brokerage-appropriate: a shared record of what was said to a client,
across WhatsApp *and* email, is a system-of-record feature. Microsoft
365 and Google are both already in the connector list.

**Sharpen the positioning against exactly this.** Co-Work is an argument
*for* the brokerage-side pitch, and it can be said out loud in a
meeting:

> "There are tools that help your agents manage their own contact book.
> That is useful for the agent. When they leave, it goes with them. What
> we do is make sure the brokerage still has the client, the file and the
> audit trail."

That line is stronger *because* Co-Work exists. A principal who has seen
an agent walk out with a client list understands it immediately.

**Watch it, do not react to it.** Check again in six weeks. If it is
still a login form, it was a test. If there is pricing and a feature
page, it shipped — and then it is worth a second look.

---

## The honest scoreboard

We are not behind on product. We are behind on **customers**, which was
true before this page existed and is unchanged by it.

Kendal names Betterhomes, Prime Capital and Chestertons. That is the
gap, and no amount of building closes it.
