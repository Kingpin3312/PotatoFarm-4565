# Portal ingestion

## Read this before writing any adapter

I searched for official Property Finder and Bayut lead APIs. What is
publicly documented is **third-party scrapers** — RapidAPI wrappers,
Apify actors advertising "2026 anti-bot bypass", services offering to
extract owner phone numbers from listings.

**Do not build on any of them.** Three reasons, in order of how much they
will cost you:

1. They breach the portals' terms. The account that gets suspended is
   your customer's portal account — the one their entire lead flow runs
   through. You would be the reason a brokerage lost its advertising.
2. Several of them sell scraped owner contact details. Ingesting those
   into a CRM makes your customer the data controller for personal data
   obtained without a lawful basis, and you the processor. That is not a
   risk to take on somebody else's behalf.
3. They break constantly, by design — they are in an arms race with the
   portals' bot protection.

Official lead delivery comes through a **partner agreement** with each
portal. Get the agreement, then fill in `parse`.

## The design

Everything portal-specific lives behind one interface in `types.ts`. The
pipeline that matters — matching, deduplication, normalisation, the first
reply — is written once and knows nothing about any particular portal.

When the real Property Finder spec arrives, `property-finder.ts` is the
only file that changes.

## Three things this gets right

**One person is one lead.** The same buyer enquiring on three properties
across two portals in an afternoon produces one lead and three enquiries.
Get that wrong and an agent rings them three times, which is the fastest
way for a brokerage to look disorganised to somebody holding two and a
half million dirhams.

**Phone numbers are normalised, or rejected.** Portals send `0501234567`,
`971501234567`, `+971 50 123 4567` and `00971501234567` for the same
person. Store them as they arrive and deduplication does nothing.
`normalisePhone` returns null rather than guessing, because a wrong
normalisation silently merges two different people into one lead — which
is worse than a duplicate and much harder to spot.

**Masked numbers are flagged.** Portals often supply a proxy number that
forwards to the lead and expires after a few days. Trust it as the lead's
identity and in a week you have a contact nobody can reach, and a
duplicate the next time they enquire.

## The silence alarm

`health.ts` is the most important file here and the one most products
never write.

A broken portal feed almost never throws. Credentials expire, a webhook
secret gets rotated, a firewall rule changes — and the endpoint simply
stops being called. Nothing errors. Nothing alerts. The board just gets
quieter and everyone assumes the market is slow.

By the time an owner rings to ask why leads dried up it has usually been
a fortnight, and those leads went to whoever else was advertising on that
portal. That is a churn event, and it is entirely preventable by watching
for **absence** rather than for errors.

The threshold is derived from each channel's own history — the median gap
between enquiries over thirty days, times three, floored at four hours
and capped at forty-eight. A portal delivering forty leads a day should
alarm within hours; one delivering two a week should not.

`contactabilityByChannel` is the commercial companion: a portal sending a
rising share of enquiries with no usable phone number is a brokerage
paying for leads it cannot ring, and it is invisible unless somebody
counts.

## Where a listing is: the location tree

Property Finder files every listing under one node of its own location
tree — city, community, sub-community, building — by its own numeric id.
So a listing points at a node of ours (`Location`, `lib/locations/`), a
new one cannot be saved without an exact node (a building, or a villa's
sub-community), and each node can carry Property Finder's id.

**Those ids come only from Property Finder's location list**, which
arrives with the partner agreement:

    npm run locations:import -- pf-locations.csv [--dry-run]

It reads a `path` column ("Dubai > Dubai Marina > Marina Gate > Marina
Gate 1") or a column per level, with the id in `pf_id`, `location_id` or
`id`; it is idempotent, refuses rather than guesses on a conflicting id,
and lists the places listings are filed under that still have none —
usually a name we spell differently from Property Finder. Until a place
has its id, publishing that listing to Property Finder is refused with a
reason naming the command, in the publish check, the publish itself and
the queue. The feed carries the tree by name either way, and the id when
there is one. `check:locations`.

## Buyers who come from a portal by WhatsApp

Not every portal buyer reaches us through the portal's delivery. Most
press the advert's WhatsApp button and write to the agent, and that
message arrives at the WhatsApp webhook, not here. `mention.ts` reads the
first message for the portal it names and the reference it quotes;
`lib/ingest.ts` files the lead under that portal (so routing rules by
source apply) and records an `Enquiry` on the quoted property with the
campaign "Bayut, via WhatsApp". It needs no agreement, because it reads
only what the buyer wrote. `check:portal-leads`.

## Buyers whose lead arrives as an email

Each portal emails the brokerage a notification for every form lead. A
connected mailbox (Settings → Email) is already being read, so mail from
a portal's own domain becomes an enquiry through `ingestEnquiry`
(`lead-email.ts` reads it; `email/sync.ts` `leadFromEmail` files it).
The layout is read generically until real samples arrive — that file is
the only one that changes when they do. Unreadable ones go on the
agent's list rather than vanishing. `check:portal-leads`.

## Still to build

- **Outbound listing feed.** Portals take XML on a schedule. Generate it
  from `Listing`, and treat a portal rejecting a listing as an alert
  rather than a log line.
- **Bayut and Dubizzle adapters.** Both are Dubizzle Group and in practice
  likely share a mechanism — confirm that against the agreement rather
  than assuming it. Their buyers who write on WhatsApp are already
  credited (above); this is the portal's own delivery of form leads.
- **Replay.** Every raw payload kept for seven days, so a parsing bug can
  be fixed and the affected window reprocessed instead of the leads being
  gone.
