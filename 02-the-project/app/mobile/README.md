# The mobile app

## Why it exists

**Because the phone is the surface, not a companion to one.**

An earlier version of this file said the app existed "for push, and
everything else could be a web page". That was wrong, and it shaped the
work badly enough to be worth recording. `ARGUMENT.md` has the full case.

The short version: an agent is in a car park under Marina Gate, in a
lift, on a half-built floor. The desktop CRM is where a manager looks at
a board. **The work happens on a phone.**

## The strategy, in one line

**The best interaction with this product never opens the app.**

An agent replies about forty times a day. Through the app that is a cold
start, an auth check, a fetch, a render, a keyboard animation and then
typing — roughly fifteen seconds, with five places a weak connection
loses them.

From the notification it is swipe, type, send. **Under five seconds.**

iOS has had `UNTextInputNotificationAction` since iOS 10 and Android
`RemoteInput` since Nougat. WhatsApp uses both, so every agent already
replies from a lock screen — to everyone except us. Reapit does not do
it. Goyzer does not. It is not exotic; it is a category nobody thought to
compete in because they were all still building screens.

If a notification can be answered without unlocking the phone, **we are
measurably faster than every competitor at the action that defines the
job**, and it can be proved in a demo with a stopwatch.

## Offline

Agents in this market spend the day in underground car parks, lifts and
half-built towers. Signal goes for minutes at a time. Not an edge case.

The decision that matters is a product one, not a technical one:

> **Reads work offline. Some writes queue. Messages to leads never queue.**

A viewing outcome written in a basement and synced four minutes later is
fine — nobody is waiting on it. A message to a buyer that the agent
believes has sent, and which actually leaves forty minutes later when
they surface, is worse than not sending it at all. The buyer gets a reply
to a question they asked in a different context, and the agent does not
know it went late.

So the composer refuses politely rather than pretending. "No signal —
this hasn't sent" is a better experience than a message arriving at the
wrong time.

Also never queued: holding a viewing slot (it may be gone by the time it
syncs) and publishing a listing (portals reject stale data).

**Queued actions carry the time they were created**, and the server is
told. An outcome recorded at 14:10 and synced at 14:40 is stored as
14:10 — otherwise the response-time reporting the product is sold on gets
quietly poisoned by bad signal.

**Conflicts are not last-write-wins across the board.** A viewing outcome
applies regardless, because the agent was there and they know. A stage
change asks, because a manager may have moved the lead while the agent
was underground, and silently overwriting makes the board untrustworthy.

## Signing in

The web app uses a one-time email link, which is right there and awkward
here: the link opens in the mail app's browser, authenticates a session
belonging to that browser, and the app is none the wiser.

The fix is a **universal link on iOS and an app link on Android**, so the
operating system hands the URL to the app rather than a browser. It needs
a verified domain association file on potatofarm.io. Worth setting up
properly — the fallback experience is bad enough that people give up on
the app rather than on the link.

Sessions live in the Keychain and Keystore, never `AsyncStorage`. That is
plain text on a rooted device, and this token reaches a brokerage's
entire client list.

## Push, in practice

**Permission is asked for after the first lead is assigned**, not on
first launch. A prompt before somebody understands what the app is for
gets denied, and on iOS a denial is close to permanent — they have to go
into Settings to undo it, and they will not.

**Two Android channels**, so a user can silence the routine notifications
and keep the urgent ones. One channel makes it all-or-nothing, and people
choose nothing.

**A lead's name never goes in a push title.** A locked phone on a
restaurant table is a screen anyone can read.

**Dead tokens are marked, not retried.** A wiped phone or uninstalled app
accepts the send and delivers nowhere. Left alone, a brokerage's
notifications quietly stop and everyone assumes it went quiet because
nothing was happening — the same silence failure as everything else in
this system. `DeviceNotRegistered` is permanent and is recorded as such;
anything else is transient and retried.

If every device for a user is dead, push is not degraded, it is off, and
that is logged as a warning rather than passing quietly.

## Three tabs, not five

The phone does four things: **reply, log an outcome, look up a fact, know
what is next.** Reporting, settings, the pipeline board and listings
management all open the web app.

Every competitor's tab bar is full of things nobody taps, because a full
CRM on a phone looks more complete in a demo. It is worse to use. A
375px screen split three ways is three columns nobody can read.

## The queue is real now

It was a type definition and a policy document. An agent in a basement
does not need a policy.

Four rules, and the third matters most:

1. **The timestamp is when it was created, never when it synced.** A
   reply typed at 21:04 and synced at 21:20 is recorded at 21:04.
   Otherwise bad signal quietly poisons the response-time chart the
   entire product is sold on.
2. **Messages fail loudly.** Queued so nothing is lost, but anything
   still unsent after two minutes tells the agent — by notification,
   because they typed it from a lock screen and the app is closed.
3. **Some failures are never retried.** A closed 24-hour window cannot
   succeed later. Retrying for two days sends nothing and tells nobody,
   and the agent concludes the lead is ignoring them.
4. **The item id is the idempotency key.** A retry after a timeout must
   not send twice. The agent would not know; the buyer would.

## What is built

`notifications.ts` — inline reply, quick actions, two Android channels.
`queue.ts` — persisted, retried, dead-lettered.
`theme.ts` — the palette, checked against the web tokens by `_check.py`.
`reply-bar.tsx` — the in-app fallback, deliberately second-class.
Today, root and tab layouts.

## Voice notes — the second differentiator

An agent driving between viewings cannot type and should not be trying.
Every agent here spends about two hours a day in a car, and that time
currently produces nothing because the only way to record anything is a
keyboard. Reapit and Goyzer both have a text note field on a mobile
screen, which is the same as having nothing when your hands are on a
wheel.

Four decisions:

**Hold to record, slide up to cancel.** Borrowed from WhatsApp because
every agent already knows it. Hold rather than tap-to-toggle for one
reason that is not ergonomics: **a recording somebody forgot to stop is a
recording of a private conversation they did not mean to capture.**

**The transcript is a draft until a person accepts it.** Transcription of
accented English over road noise is wrong often enough that accepting it
silently would put invented sentences into a client record — and a lead
note is evidence in a dispute about who said what. Below 0.8 confidence
the field is focused for editing rather than pre-accepted, and the agent
is told why. The audio stays until they decide.

Same principle as the assistant: **the model drafts, a person commits.**

**Queued like everything else**, audio included, timestamped when spoken.

**Orphaned files are swept after a day**, not immediately — deleting
aggressively risks throwing away a note the queue has not read yet.

## Look up, not search

One job: an agent standing in front of a buyer who has just asked
something they do not know. **Answers, not listings.** A property card
with twelve fields is a page to read; this returns the field they asked
for, large enough to read at arm's length while somebody is watching
them.

And it never guesses. If it is not in the listings it says so — better to
say you will check than to be wrong out loud.

## Conflicts now ask

`CONFLICT_POLICY` said `ask` for a stage change and nothing asked. It
does now.

An agent moves a lead underground; a manager moves the same lead
meanwhile. The server returns 412, the queue **holds** it rather than
dropping it, and the sheet shows both versions with who and when.

**The system does not decide.** Same restraint as the ownership dispute
view — a manager handed a ruling argues with the system; one handed a
timeline makes the call and owns it.

Note the distinction from 409: a 409 can never succeed and goes dead. A
412 *can* succeed, once a person has chosen.

## What is not built

Real data. Every screen is structure and copy against empty arrays —
`useState` where a query belongs. Wiring them to tRPC is the first job
once the CRM compiles, and it is deliberately last here because the
decisions above are the expensive ones to get wrong.

## Parity with the desktop, and where it deliberately differs

The first agent test found four blockers and every one of them mattered
more on a phone than on a desktop, because a phone is the thing an agent
is holding when they need it.

**Call and directions.** `lib/contact.ts` mirrors the web version —
duplicated because React Native cannot import from the web bundle, and
`_check.py` compares the two so duplication does not become drift.

Two native details worth keeping:

- **The maps URL is platform-specific.** iOS opens Apple Maps, Android
  opens Google Maps, and there is a web fallback. Forcing one provider
  sends somebody to an app they have not installed, and an agent standing
  in a car park does not want an App Store page.
- **`canOpenURL` fails silently on iOS** for a scheme the app has not
  declared, which the agent reads as a broken button. Every call falls
  back to a web URL.

**The viewing card differs from the desktop one on purpose.** Building
name is the largest thing on it — not the buyer's name, not the time —
because that is what an agent glances at while driving, and Marina has
six towers with nearly the same name. Buttons are 52pt rather than 44,
because this is pressed one-handed, often while walking, sometimes in a
hurry.

**Today shows the whole day** rather than a card you tap. An agent
checking whether they can take a call at eleven should not have to
navigate to find out — that is the question the screen exists to answer.

**Mute is optimistic and queued.** An agent who taps "I've got this"
because a negotiation just turned delicate should not watch a spinner,
and the queue makes it true whether or not there is signal. Its conflict
policy is `apply` rather than `ask`: the agent standing in front of the
buyer wins.

## Run the checks

    python3 _check.py

Unused imports, `let` that should be `const`, unexported types in public
signatures, duplicate declarations across files, `Record` on a union that
misses a member, palette drift against the web tokens, and tap targets
under 44pt.

It has produced three false positives so far, all from matching text that
was explaining something rather than doing it. **Verify before you fix.**
