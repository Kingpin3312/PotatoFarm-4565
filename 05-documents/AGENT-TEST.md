# First agent test — what it's like to actually use this

Omar. Six years, mostly Marina and JBR, twenty-odd live buyers at a time.
I was asked to be honest, so this is honest.

---

## What's genuinely good, and I don't say that easily

**Replying from the lock screen.** This is the thing. I get a
notification at half nine at night, swipe down, type, send. I don't open
anything. Three seconds. Compare that to the CRM my last brokerage made
me use — I'd have to unlock, wait for it to load, find the lead, then
type. I stopped bothering and just used WhatsApp, which is why their CRM
had nothing in it.

**The reply window thing.** I didn't know about this. I have absolutely
sent follow-ups into the void and assumed the buyer was ghosting me.
Being told before I type is worth more than most of the rest.

**Voice notes.** I'm in the car two hours a day. Right now that time
produces nothing because I'm not typing at 100 on Sheikh Zayed. Hold,
talk, done — and the fact it shows me the transcript to check before
saving is right, because it will get "Jumeirah" wrong at least once.

**The commission screen.** Paid, owed, forecast. That's the first thing
I want to see and every other system I've used buries it four taps deep
or doesn't have it at all. Someone thought about the agent there.

---

## What stops me doing my job

### I can't call anyone

There is no phone number I can tap. Not on a lead, not on a viewing, not
anywhere.

**I call people all day.** A buyer who won't answer WhatsApp will pick
up. A buyer who's ten minutes late to a viewing gets a call, not a
message. That is the single most-used button in my working life and it
does not exist in this product.

### I can't get to the viewing

The Today screen says "No viewings today", which is fine. But when I do
have three, what does it give me? A time and a name.

**Where is it. How do I get there. Which building, which entrance, which
tower — Marina has six towers with almost the same name.** No address, no
map link, no route between the three of them so I do them in an order
that isn't insane.

I checked: the viewing record doesn't even hold an address. It points at
a listing and hopes.

### I can't send a brochure

Half my messages are "here's the floor plan" or "here's the payment
plan". Every one of those is a PDF I have on my phone or my drive.

There's no way to attach anything. So the moment a buyer asks for a
brochure I'm out of this app and back in WhatsApp — and once I'm there
for one thing, I stay there.

### I can't see how I'm doing against the others

No leaderboard, no ranking, nothing. I know that sounds like ego. It
isn't — it's how I know whether to worry. Every agent I've worked with
checks the board. Take it out and the tool feels like it belongs to
management.

---

## Two things that will make agents suspicious, and you should know why

### The response-time tracking

Your whole pitch is measuring how fast we reply. To the owner that's a
feature. **To me it's a stopwatch on my back**, and the first time a
manager opens that chart in a Monday meeting, every agent in the room
will work out that it's a performance review they didn't agree to.

I'm not saying remove it. I'm saying: if I can see my own numbers before
my manager does, it's a tool. If he sees them first, it's surveillance,
and people will start replying "ok" to enquiries at 11pm to game it.

### The round robin

Fair distribution is fair to the brokerage. **It is not fair to me.**

I close more than the guy two desks down who takes four hours to answer.
Giving us the same leads in rotation means my closing rate subsidises
his. Every good agent has left a brokerage over exactly this.

The "fastest" routing option is closer to right. Make it the default and
tell us that's the rule, and I'll compete for it.

---

## The bit that worries me most

**The assistant talks to my buyer before I do.**

I understand why. At half nine at night I'm asleep and it isn't. But
that buyer is my relationship and my commission, and something I don't
control is now the first voice they hear from my brokerage.

What I actually want to know, and nobody has told me:

- Does it use my name, or the brokerage's?
- If it says something wrong about a property, whose fault is that in
  the meeting afterwards?
- Can I switch it off for one buyer I'm handling carefully?

I found the stop button in settings. **That switches it off for
everyone.** There's no way to say "not this one, I've got it".

That's the feature I'd ask for first, and it's small.

---

## Would I use it?

**Yes — but not instead of WhatsApp. Alongside it.**

And that's the honest problem, because half the value goes if I'm in
both. Every time I have to leave to call someone or send a floor plan, I
don't come back for the next thing either.

Get me a call button, an address with a map link, and a way to send a
PDF, and I'd stay in it. Those three are the difference between a tool I
use and a tool I open when my manager asks whether I've updated it.

---

## What I'd fix, in the order I'd fix it

1. **A call button.** Everywhere a phone number exists. An afternoon.
2. **Address and directions on a viewing.** Including the tower name,
   because Marina.
3. **Send a file.** Brochure, floor plan, payment plan.
4. **Mute the assistant on one conversation**, not all of them.
5. **My numbers, visible to me first.**
6. **A leaderboard.**

The first four are the ones that decide whether I live in this or visit
it.

---

# Second pass — all six built

Omar's list, in the order he gave it.

**1. A call button.** Everywhere a number exists. Call first and widest
in the row — not because it is used most, but because it is used when
something has gone wrong, which is when hunting for a button is worst.
WhatsApp sits beside it, opening the real thread.

**2. Address and directions.** Viewings now carry a building, an address,
coordinates and an access note — the things a colleague tells you on the
phone and nobody writes down. Denormalised from the listing on purpose:
a listing can be edited between booking and attending, and an agent
outside the wrong tower does not care which record was correct.

It also warns when two viewings are too far apart for the gap between
them, before setting off rather than on the road.

**3. Send a file.** Attachments in the schema, attachable to a listing
once and sendable to any lead without re-uploading.

**4. Mute one conversation.** Separate from the kill switch and, like it,
**not cached** — an agent muting because a negotiation just got delicate
needs it on the next inbound message, not in five minutes. There is now a
third assistant invariant asserting the mute is checked before any model
call.

**5. My numbers, mine first.** A "Mine" screen with commission at the
top, and a `TeamVisibility` policy with a **24-hour head start**: an
agent sees the current window, a manager's view runs a day behind.

He said it better than a spec could: *"if I can see my own numbers before
my manager does, it's a tool. If he sees them first, it's surveillance."*
Twenty-four hours is enough for somebody to notice a bad day and raise it
themselves, which is the entire point. **A number your manager raises
first is a number you learn to manage rather than improve.**

**6. A leaderboard**, ranked on **viewings booked, not reply speed.**

That distinction is the one to defend. Reply speed is what we sell to the
owner and the worst possible thing to rank agents on — rank on it and
within a fortnight everybody is replying "ok" at eleven at night to move
a number, which measures nothing and costs the buyer a real answer.

Default mode is `RANKED`: your own row with real figures, everyone
else's position without theirs. Enough to know whether to worry, not
enough to humiliate anybody in a Monday meeting. A brokerage can open it
fully, but that should be a decision rather than a default.

---

## Still open, and honestly

**Round robin.** He is right that fair-to-the-brokerage is not
fair-to-the-best-agent, and that good agents leave over it. The routing
module already supports a fastest-responder mode. **Making it the default
is a commercial decision, not a technical one**, and it belongs to the
brokerage owner rather than to us.

**Whether he would live in it.** Four blockers are gone. Whether that is
enough to stop him drifting back to WhatsApp is not answerable from here
— it is answerable in week two of a pilot, by watching whether he opens
this or that when a buyer asks for a floor plan.
