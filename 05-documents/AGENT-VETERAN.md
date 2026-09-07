# Day one. Twenty-two years. Here's where I am.

I came from Reapit and before that a Kendal shop. I left both to come
here because you told me the system was better. I've spent the morning in
it and I need to say this before I unpack anything.

---

## What's genuinely better than what I've used

**The assistant.** Kendal's replies fast; yours replies fast and knows
about the 24-hour window, which Kendal never told me about and cost me at
least three deals I know of. I've sent follow-ups into the void for years
and assumed people were ghosting me.

**Replying from the lock screen.** Reapit's app takes eleven seconds to
open on my phone. I timed it once out of spite. Yours doesn't open at
all — I just reply.

**Trakheesi.** Reapit doesn't know what a Trakheesi permit is. It's a UK
product with a Dubai coat of paint and every one of us works around it.
Yours blocks a publish without a valid one. That's someone who's actually
stood in this market.

**"I've got this."** Being able to silence the assistant on one buyer
without switching it off for the whole floor. Nobody else does that.

---

## And then I looked for the seller

**There isn't one.**

I went looking for where I record who instructed us. There's no vendor,
no landlord, no owner on a listing. A property in this system belongs to
nobody.

So:

- Who do I ring when a buyer likes it?
- Who signs the Form A?
- Who am I sending the weekly feedback to?
- Whose mobile number is on the file when the buyer wants a second
  viewing on Saturday?

I found a **vendor report** in here — a weekly summary of viewings and
feedback. It's a good idea and it's well thought out. **There is nobody
to send it to.** It generates a report for a person the system has no
record of.

## And then I looked for the offer

**There isn't one of those either.**

`UNDER_OFFER` exists as a status on a listing. That's it. There is no
way to record:

- What was offered, by whom, on what
- What the seller said back
- The counter, and the counter to the counter
- Whether it was cash or mortgage, and what the pre-approval said
- Who accepted, and when

**That is the job.** Everything before it is admin. I spend my week
getting to an offer and then managing one, and this system's answer to
the most important twenty minutes of any deal is a dropdown that says
under offer.

Reapit records an offer with a full negotiation history and I can show a
seller every number that's been on the table. Kendal is weaker but it at
least has the field.

---

## So what have I actually joined?

I'll be straight with you, because you were straight with me.

**This is a brilliant lead qualification tool with a pipeline attached.
It is not yet a CRM.**

It handles the first ten minutes of a buyer relationship better than
anything I've used. Then it stops. The half of my job that produces the
commission — the seller, the offer, the negotiation, the chain of
conversations that turns interest into a signed Form F — is not in here.

I can work around it. I'd keep the sellers in my phone and the offers in
a WhatsApp group with the manager, like I did in 2009. **But you didn't
hire me from Reapit so I could go back to 2009.**

---

## What I need before I stop looking at other jobs

**One. A vendor.** A person, on a listing. Name, number, whether they
want calls or WhatsApp, and what they've been told so far. Without it
the feedback report you've built cannot run and I'm keeping half my
client list on my phone.

**Two. An offer.** Amount, buyer, date, financing, status, and every
response after it. If you build one thing from this list, build this
one. It's the record of the thing we're all paid for.

**Three. The seller's side of the conversation.** I talk to a seller as
much as I talk to a buyer. Right now every conversation in this system
is with a buyer. Where does "the owner says he'll take 2.4 but not
before March" go?

Those three are the difference between a tool I'll use and a tool I'll
work around.

---

## Would I stay?

**Today, yes — because of the assistant and because someone here clearly
understands this market**, which is rarer than it should be.

**In a month, only if the offer exists.** Not because I'm precious, but
because on the day I've got a buyer at 2.35 and a seller who wants 2.5
and three days to bridge it, I need somewhere to put that. And if that
somewhere is a WhatsApp group, then everything else in here is
decoration.

You've built the hardest half. I'd want to know when the other half is
coming, with a date, before I turn down the next call I get.

---

# Two days later

All three are in.

**A vendor.** A person on a listing, with the field that actually
matters: how they want to be contacted. `OFFERS_ONLY` is a real
instruction and ringing one of those owners for a chat is the fastest way
to lose a property — so the brief screen says so before you dial. The
weekly report now resolves a real owner, goes out on the day they asked
for, and is prepared rather than sent for anyone who wanted a call.

It turned out `VendorReport` had been sitting in the schema all along,
with no `Vendor` anywhere near it. He spotted in a morning what six audit
scripts had run past.

**An offer, and every turn after it.** A counter creates a row; it never
edits the amount. Accepting closes every other live offer on the listing
and hands back a list of who needs a call — deliberately returned rather
than auto-notified, because a buyer whose offer just lost hears it from
their agent and not from a push notification.

**The offer board is ranked by strength, not price**, and the top one is
labelled *"Strongest, not highest"*. Cash with no conditions beats a
higher mortgage offer nobody has applied for. Sorting by the biggest
number invites somebody to get that wrong on a Friday in front of an
owner.

**The seller's side of the conversation.** `Conversation.leadId` was
required and unique — a conversation could only be with a buyer. It is
now a party, buyer or owner, with a database constraint enforcing exactly
one because Prisma cannot say it and a conversation belonging to nobody
is invisible in every list.

*"The owner says he'll take 2.4 but not before March"* now has somewhere
to go.

---

## What he asked for and did not get

**A date.** He said he wanted one before turning down the next call.

The honest answer is that all of this is written and none of it has run.
The offer he records on his first real deal will be the first offer this
code has ever seen. That is worth telling him plainly rather than
selling him a Gantt chart — a man with twenty-two years can tell the
difference, and being lied to on day two is worse than being told the
truth on day one.
