# Who owns what in the blackbook

The competing product sells "your blackbook" to the agent. When the
agent changes firm, the book goes with them and the brokerage's system
of record is a record of nothing.

That is honest to the agent and dishonest to the person paying. This
splits it.

## The agent's, and it exports with them

- `nickname` — what they actually call somebody
- `privateNote` — free text, **never shown to a manager**
- `tags` — their own taxonomy: "mortgage broker", "Emaar", "school run"
- `starred`, `lastTouched`

An agent who leaves can export all of it and it is theirs. That is not
a concession, it is the point: a tool the agent believes is theirs is a
tool they will actually use, and a blackbook nobody updates is worth
nothing to either party.

## The brokerage's, and it stays

- The lead, the vendor, the conversation, the messages
- Viewings, offers, deals, commission
- The KYC file, screening, compliance reports

**AML is a brokerage obligation, not an agent one.** A DNFBP filing is
made by the firm. That file cannot leave with a person, and no version
of this product should let it.

## Why a blackbook entry is a view, not a copy

`BlackbookEntry` points at a `Lead` or a `Vendor`. It does not duplicate
their phone number or their name.

A second contact store is how a CRM starts lying to itself — two records
for one person, diverging, and nobody knowing which is right. The
standalone fields exist only for people who are in nobody's pipeline: a
conveyancer, a developer's sales manager, somebody's accountant.

## What an agent sees when they leave

Both, explicitly, on the export screen:

> **Yours:** your notes, nicknames and tags for 340 people.
> **Stays with [brokerage]:** the client records, the transaction
> history and the compliance file, which the firm is legally required to
> retain.

Saying it plainly is better than either party discovering it on the day.
