# Full review — website, app, CRM

Three surfaces, three stakeholders. The findings are grouped by who they
hurt, because that is what decides which ones matter.

---

## The one that would have ended the launch

**The homepage was attributing four performance figures to a pilot
brokerage that does not exist.**

    Median first reply, before      4h 12m
    Median first reply, after       38s
    Out-of-hours answered           100%
    Viewings booked per 100         +31%

    "Pilot brokerage, four weeks."

There is no pilot brokerage. The product has never been compiled, let
alone run. Those numbers were invented, and they were on a page about to
go live with a stated deploy date.

Plus **"63% of enquiries arrive after your team has gone home"** — a
figure that appears nowhere in this project except on that page.

**Why this is the worst possible defect and not merely a bad one:**

The results panel is the most interesting thing on the homepage. It is
what a brokerage owner reads twice. The first one who says *"which
brokerage?"* — and one will, in the first week — gets an answer that
ends the meeting and the relationship.

Nothing else in this review comes close. Seven audit scripts, five
reviews and a UX pass had all run over that page. **Every one of them
asked whether the code was correct. None asked whether the marketing was
true.**

### What replaced it

The panel now says **"Your number"** four times, with:

> *We are new. Rather than show you somebody else's figures — or invent
> our own — we will fill this in with yours in week one, and you will see
> it before we do.*

That is more persuasive than the fabricated version, not less. It turns
a claim a buyer must take on trust into a promise they can hold you to,
and it matches what the product actually does — the baseline week was
always the demo.

**`claims.py` now fails the build** on any performance figure attributed
to a customer, so this cannot come back.

---

## Three capability claims that were true of the assistant and not of
the product around it

- **Arabic.** The assistant replies in it. The interface is English.
  Now says so.
- **Sanctions screening.** Built, with no provider connected. Now says a
  provider is connected during setup — *"so you know whose list you are
  checking against"*, which is a better line than the one it replaced.
- **goAML.** Referenced without a submission path. Now says reports are
  prepared here and filed by your compliance officer, *"and you should be
  wary of anyone who offers to submit on your behalf."*

Each was one clause from honest. None needed a feature.

---

## For the agent

**The stop control had four names across three surfaces**, and two of
them are now genuinely different features.

    site      "stop button"
    web app   "kill switch", "pause"
    mobile    "stop button", "mute"

An agent who has read the website's *"stop button on every screen"* and
then finds both a kill switch and a mute has to work out which is which
— in the moment they most need to be certain.

Now two names, doing what they say:

- **"I've got this"** — one conversation. The agent takes over.
- **"Stop everything"** — every conversation in the brokerage,
  immediately.

The homepage explains both rather than mentioning one.

**The reply window had three names.** Now one, everywhere.

---

## For the CEO

The commercial picture is unchanged and worth restating plainly.

**The website is finished and honest.** Ten pages, five audit scripts
clean, a real price, share cards, a 404, and — as of today — nothing on
it that cannot be defended in a meeting.

**The CRM has never been compiled.** Nothing in this review changes that.

**There is still no customer**, which is the only number that moves the
score.

---

## For the client

Nothing here changes what a brokerage gets. What changed is what they are
**told** they get, which now matches.

The single sentence that made this review worth running:

> Correctness checks ask whether the code works. Security checks ask
> whether it leaks. **Nothing was asking whether the marketing was
> true.**

There are now six scripts. The sixth is `claims.py` and it is the one I
would keep if I could only keep one.
