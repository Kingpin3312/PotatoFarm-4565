# The pilot

I said last turn that the honest next step is not more building. This is
that step written down, plus the reporting it needs — because a pilot you
cannot measure is just a customer using unfinished software.

## The one rule

**Capture the baseline before you switch anything on.**

`reports.captureBaseline` computes how the brokerage performs today —
median time to first reply, share answered within five minutes, enquiry
volume — and writes it to the audit log, which is append-only. Nobody can
adjust it afterwards, including you.

A pilot without a baseline captured beforehand cannot be failed. A pilot
that cannot be failed is not a pilot, it is a demo with a longer runway.

Run it over the four weeks *before* go-live, not the four weeks before
the meeting.

## Who to pick

**Not your friendliest customer.** Pick a brokerage with:

- 8 to 25 agents. Below that the volume is too low to show anything in a
  fortnight; above it, a bad week costs them too much to forgive.
- At least 300 enquiries a month, so the numbers move.
- A real out-of-hours problem. If they already answer everything within
  ten minutes, you will prove nothing and they will not care.
- One person who will actually take your call at 8am when something
  breaks. This matters more than their size.

## Four weeks

**Week 0 — baseline.** Connect the portals and WhatsApp. Assistant stays
**off**. Everything flows into the inbox and agents work it by hand. You
are measuring, not helping. Resist the urge to switch it on early; this
week is the entire evidentiary basis for everything that follows.

**Week 1 — supervised.** Assistant on, but every draft goes to an agent
to send. Slower than manual, on purpose. You are checking whether what it
writes is what a good agent would have written, on their leads, about
their properties. Read every single message. This is the week that finds
the problems that testing does not.

**Week 2 — live, narrow.** Assistant sends, but only outside working
hours and only on one portal. Smallest blast radius that still proves the
point, and out-of-hours is where the value is anyway.

**Weeks 3–4 — live, full.** All channels, all hours. Daily check on the
numbers below.

## What to watch, daily

| Metric | Where | Bad sign |
|---|---|---|
| Median time to first reply | `reports.responseTime` | Not materially better than baseline |
| Answered within 5 minutes | same | Below 90% |
| Handover rate | `assistant.handovers` | Above 30%, or rising week on week |
| Drafts blocked | settings page | Any cluster of the same reason |
| Viewings per 100 enquiries | `reports.funnel` | **Below baseline** — see below |
| Spend | settings page | Projection above the ceiling |
| No-show rate | `reports.funnel` | Above 25%, or worse than baseline |

## Kill criteria, agreed before you start

Write these into the pilot agreement. Pilots without pre-agreed failure
conditions never fail — they just quietly continue until everyone stops
talking about them.

Stop the assistant immediately if:

1. **It states anything untrue about a property.** Once. Not a pattern,
   not a trend. Once.
2. **Viewings per 100 enquiries drops below baseline.** Fast replies that
   convert worse than slow ones mean the qualification is putting people
   off, and that is a worse outcome than doing nothing.
3. **Handover rate exceeds 40%.** At that point agents are doing the work
   anyway plus reading a transcript first.
4. **Any complaint about being messaged by software.** Investigate before
   resuming, not alongside.
5. **A lead's data reaches the wrong brokerage.** Stop everything, not
   just the assistant.

The switch is on the settings page. One click, one confirmation, effective
immediately — see `controls.ts` for why it is not cached.

## The chart that sells it

`reports.responseByHour` is the one to put in front of an owner, and it
is the one they have never seen.

Their daytime numbers are usually fine. It is the 8pm to 8am block, where
enquiries arrive and sit until morning, that nobody has ever counted for
them. Run it on their baseline week and show them their own data before
you show them a single feature.

That chart is a better sales asset than anything on the marketing site,
and it costs you one query.

## What the pilot will actually teach you

Three things I cannot answer from here, and neither can you until real
agents use it:

1. **Whether agents trust the qualification.** If they re-ask every
   question on the call, the extraction is not earning its place and the
   confidence threshold needs raising.
2. **What the real handover reasons are.** My six triggers are educated
   guesses. The grouped view on the settings page will show you which one
   actually fires, and it will not be the one you expect.
3. **Whether the 24-hour window is a bigger problem than it looks.** In
   this market a lot of enquiries arrive late and go quiet. If most
   conversations die at the window, the template strategy matters more
   than the assistant does — and that changes the roadmap.

## After the pilot

Do not sign the second customer until the first has run a full month
unsupervised. The failure mode for a product like this is not a bad
demo — it is five brokerages onboarded on the strength of one good
fortnight, and then one shared bug that damages all five at once.
