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

## Still to build

- **Outbound listing feed.** Portals take XML on a schedule. Generate it
  from `Listing`, and treat a portal rejecting a listing as an alert
  rather than a log line.
- **Bayut and Dubizzle adapters.** Both are Dubizzle Group and in practice
  likely share a mechanism — confirm that against the agreement rather
  than assuming it.
- **Replay.** Every raw payload kept for seven days, so a parsing bug can
  be fixed and the affected window reprocessed instead of the leads being
  gone.
