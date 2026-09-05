# How to work on this

## Read the API before calling it

The single most common failure in this project has been writing a screen
against a procedure's *assumed* shape. It has happened eight times in
one pass, plus `getSecret` (it is `readSecret`) and `fail()` (it is
`issue()`).

**Grep the router first. Every time.** It costs one command and it is
the difference between working code and a runtime error nobody sees
until a user hits it.

Two of those eight were not wrong arguments but the **wrong design** —
`assessRisk` takes factors and derives a rating, and `updateSettings`
governs spend, not features. Reading the input taught something about
the product, not just the signature.

## The collector each script uses

Four times now a check has been written calling `fail(...)` into a
script that does not have one. The names differ per script and there is
no way to guess correctly:

| Script | Call |
|---|---|
| `audit.py`, `crm-audit.py` | `fail(msg)` |
| `claims.py`, `consistency.py`, `contrast.py`, `reachability.py` | `FAILS.append(msg)` |
| `ux-audit.py`, `responsive.py` | `issue(file, msg)` |
| `deep-audit.py`, `site-deep.py` | `bug(msg)` |

**Grep the script before adding to it.** The failure is silent when the
new code sits past the main loop — the script reports zero and looks
healthy.

## A module with no way in is not built

Six times a library has been written that no router, job or webhook
imports. `crm-audit.py` checks for this. If it fails, the work is not
finished.

## Test the test

`open(p, "w").write(open(p).read().replace(...))` truncates the file
before reading it — every tampered copy comes out empty and every check
reports a false pass. Read fully, **assert the target string is
present**, then write.

A test that silently does nothing looks exactly like a check that does
not work.

## Verify, do not assume

- Count files inside a zip rather than trusting the command that built
  it. One release shipped without the logo.
- Render an image and look at it before saying it is right.
- When a check fails, decide whether the check or the code is wrong
  before fixing either. Several "failures" have been the check.

## Nav discipline

The top bar has drifted to nine or ten items twice, because every new
screen looks like it belongs there. **Top-level is somewhere an agent
goes several times a day.** Everything else goes under Settings.

## The standing question

The website is ready. Almost every review has ended in the same place:
the next move is a phone call, not a commit.
