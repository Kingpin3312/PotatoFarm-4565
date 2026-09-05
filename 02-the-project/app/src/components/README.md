# The interface

Until now the CRM had a complete backend and no React at all — sixteen
routers, fifty-six models, and five static HTML previews. This is the
bridge.

## Same tokens as the marketing site

`src/styles/tokens.css` is the same paper-and-ink file, values and all,
so the transition from potatofarm.io to app.potatofarm.io has no seam in it. A
brokerage that signs up should not feel like it has been handed to a
different company at the door.

## Three decisions in the thread

**Optimistic send.** A four-second round trip on hotel wifi makes the
product feel broken. The message appears immediately, marked pending —
which is honest, because that is exactly what it is.

**The draft comes back on failure.** Losing what somebody typed because
the network blinked is the fastest way to make them stop trusting the
box, and they will start writing messages in WhatsApp and pasting them
in.

**Enter sends, Shift-Enter breaks the line.** The other way round costs a
message every time somebody is quick, and agents are quick.

## The window, again

`WindowState` and `WindowClosed` are separate components on purpose. When
the 24-hour window has shut the composer is **replaced**, not disabled —
a greyed box with no explanation leaves somebody typing into nothing and
wondering why the lead never replied.

If this component is wrong the failure is silent: Meta accepts the
message and never delivers it. That is why it is the most carefully
written thing in the folder.

## Skeletons, not spinners

Shaped like the thing they are replacing. A spinner tells you to wait; a
skeleton tells you what is coming, and the page does not jump when it
arrives.

## What the types do and do not protect

`AppRouter` means every call from the interface is checked against what
the server exposes. It would have caught the five unmounted modules — if
anything had been calling them.

**Types only protect what somebody is actually using.** That is precisely
why an unused module slips through a type system and needs a separate
question asked across the codebase. Worth remembering before trusting
"it compiles" as a completeness check.

## The screens

| Route | State |
|---|---|
| `/inbox` | List and thread, two panes on desktop, one at a time on a phone |
| `/pipeline` | Board with drag, and conflict handling when two people drag at once |
| `/settings` | Kill switch, spend, handover reasons |
| `/commission` | What an agent is owed |
| `/listings` | Permit alerts, portal state, and the pre-publish check |

### Three decisions worth knowing

**Mobile is one pane, not a squeezed grid.** A 375px screen split three
ways is three columns nobody can read. On a phone the list is the screen
until you pick something, then the thread is.

**A drag conflict is not an error to dismiss.** If somebody else moved
the column while you were dragging, the server refuses and the client
refetches. It says so once and corrects itself — a board that silently
applies a stale move is a board nobody trusts.

**The kill switch dialog uses the brokerage's own number.** It reads the
last seven days of enquiry volume and says "roughly 60 enquiries a day
waiting on a person", rather than a generic warning. The decision is
informed rather than merely slowed down.

**"Assistant stopped" only appears in the header when it is stopped.** A
green everything-is-fine badge is noise; its absence is the normal state.

### The listings screen

Two things on it are the whole point, and both are silent failures
anywhere else: **a Trakheesi permit about to lapse**, and **a portal that
has quietly refused a listing.** Both are counted above the list, because
a permit nobody sees becomes a permit that lapses.

The pre-publish check runs as the dialog **opens**, not when the button is
pressed. The person who pressed publish is the one who can fix it, and
they are looking at the screen right now — three days later they are not.

A warning and a blocker are styled differently on purpose. "You can fix
this later" and "this will not send" are different messages and should not
look the same.

## Empty states say what will happen

Not "no data". An empty inbox on day one should not look broken, so it
says new enquiries land there the moment they arrive.
