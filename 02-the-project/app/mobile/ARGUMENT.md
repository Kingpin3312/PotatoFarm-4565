# We built the wrong thing, and I want to say why before we build more

To the mobile team. This is not a critique of your work — it is a
critique of the brief, which was mine.

## What we have

Three files. Five functions. **Zero screens.** An offline queue that is a
TypeScript type with nothing persisting it, retrying it or syncing it.

That is not a mobile app. It is a set of opinions about one.

## The deeper problem, which is worse

We built mobile as **a notification channel for a desktop product.** Read
the README I wrote: *"Why it exists: for push. Everything else on it
could be a web page."*

That sentence is wrong and it has shaped everything since.

**For this product the phone is not a companion surface. It is the
surface.** The agent is in a car park under Marina Gate, in a lift, on a
half-built floor with one bar of signal. The desktop CRM is where the
manager sits and looks at a board. The work happens on a phone.

Goyzer and Reapit made the same mistake, and their apps are read-only CRM
views with a diary bolted on. **If we build what they built, we have
built a worse version of theirs** — later, with fewer engineers and no
customers.

## The one thing we can be better at

An agent replies to leads about forty times a day. That is the atomic
unit of the job.

What our current design costs them, per reply:

1. Notification arrives
2. Tap it
3. App cold-starts — two to four seconds
4. Auth check, then the thread fetches
5. Thread renders
6. Tap the composer, keyboard animates up
7. Type, send

**Roughly fifteen seconds and five points where a slow connection loses
them.** In a car park it fails entirely.

What it should cost:

1. Notification arrives
2. Swipe down, type, send

**Under five seconds, and the app never launches.**

## The argument, plainly

**The best mobile interaction with this product is one that never opens
the app.**

iOS has had `UNTextInputNotificationAction` since iOS 10. Android has had
`RemoteInput` since Nougat. WhatsApp itself uses both — your agents
already reply from the lock screen every day, to everyone except us.

Nobody in this market does it. Reapit does not. Goyzer does not. It is
not exotic technology; it is a category nobody has thought to compete in
because they are all still building screens.

**If a PotatoFarm.io notification can be replied to without unlocking the phone,
we are measurably faster than every competitor at the single action that
defines the job.** That is a claim we can prove in a demo with a
stopwatch.

## Three things, in this order

**1. Notification-first replies.** Inline reply on both platforms,
straight through the API. Quick actions for the two other common
responses. The app is the fallback, not the path.

**2. An offline queue that exists.** Persisted, retried, and timestamped
at creation rather than at sync. An agent in a basement needs the queue,
not a policy document about one.

**3. Voice notes.** An agent driving between viewings cannot type and
should not be trying. Hold to record, transcribe, attach to the lead.
Nobody in proptech does this properly and every agent in Dubai spends two
hours a day in a car.

## What we are not building

**Not a full CRM on the phone.** Pipeline board, reporting, settings,
listings management — desktop work. Cramming them into 375px produces
three columns nobody can read, which is the mistake the market leaders
made and we do not need to repeat it to look complete.

The phone does four things: **reply, log an outcome, look up a fact, know
what is next.** Everything else opens the web app.

## Where we honestly stand

Against Reapit's mobile app we are nowhere. They have one, in the stores,
with years of correction behind it.

We do not beat them by building the same thing. We beat them by being
five seconds where they are fifteen, at the action that happens forty
times a day.

That is the strategy. Everything below implements it.

---

## Addendum — after the first agent test

An agent used it and the first line of his report was **"I can't call
anyone."**

He was right. There was no dialable phone number anywhere in the
product. Not on a lead, not on a viewing. We had built an entire
communications tool around one channel and forgotten the one an agent
reaches for when something has gone wrong.

Three more of the same shape:

- **No address on a viewing.** He got a time and a name. Marina has six
  towers with almost the same name.
- **No way to send a file.** Half an agent's messages are a floor plan.
  The moment a buyer asks, he leaves for WhatsApp — and does not come
  back for the next thing either.
- **No way to mute the assistant on one conversation.** The only control
  was org-wide. An agent asked to choose between "it answers all my
  buyers" or "nobody's assistant answers anybody" trusts neither.

All four are now built. None took long. **Every one of them was missing
because the product was designed around messages, and an agent's day is
calls and viewings.**

That is the lesson worth keeping. Seven audit scripts, four reviews and a
UX pass found none of this, because they all asked whether the thing we
built was correct. One agent asked whether it was the right thing.
