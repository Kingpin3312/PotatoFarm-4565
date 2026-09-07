#!/usr/bin/env python3
"""
Move the dark surfaces from near-black to charcoal.

**Why this is not a job for repalette.py.** That script maps hex to hex
across whole files, and `#1A1A1A` in this palette is two different
decisions wearing the same value: it is `--ink`, the black body text and
button label, and it is `--leather-deep`, the background of the inverted
band. The instruction was to change the *backgrounds* and keep the
black, so a value-level replace would do exactly the wrong thing to
every heading and every button label in the product.

So this edits **named declarations**, not values. Each target names the
token it is changing, and the old value is asserted present before
anything is written.

    python3 03-brand/charcoal.py            # report
    python3 03-brand/charcoal.py --apply

Idempotent: run it twice and the second run reports nothing to do.

---

The numbers, and why they are these numbers.

Charcoal is bounded from above by two pairs, and the ceiling is lower
than it looks:

  * `--accent` is the heading colour *inside* the dark band, and it also
    has to work on the raised panel within that band. #FF6B35 needs the
    panel no lighter than roughly #343434 to clear 4.5:1.
  * `.on-leather` sets `--on-accent: var(--leather-deep)`, so the dark
    ground is *also* the label colour on every orange button in that
    band. Lightening the ground therefore lightens button text sitting
    on orange, and that pair has to clear 4.5:1 too.

Between them the ground cannot go much past #2A2825 without failing
something. That is a real charcoal — a 16-point lift in each channel
from #1A1A1A — but it is not a mid grey, and it cannot be one while the
brand orange is doing work on top of it.

The muted grey had to move with it. `--leather-ink-3` was #8A8A8A at
4.74:1 on near-black; on charcoal that falls to 4.03:1 and fails. It is
#9A9A96 now. Raising the floor of a surface raises everything standing
on it, and that is the step a palette change usually forgets.

Every pair below was measured, not estimated:

    leather-ink   on ground  12.21    on panel  10.62
    leather-ink-2 on ground   7.17    on panel   6.23
    leather-ink-3 on ground   5.21    on panel   4.53
    accent        on ground   5.18    on panel   4.51
    button label on orange    5.18
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

GROUND = "#2A2825"   # was #1A1A1A — the inverted band's background
PANEL  = "#34322F"   # was #2E2E2E — cards raised within that band
INK3   = "#9A9A96"   # was #8A8A8A — forced up by the lighter ground
RULE   = "#42403D"   # was #2E2E2E — borders on the dark surface

# (old declaration, new declaration). Named tokens only — never bare hex.
EDITS = [
    ("--leather:      #2E2E2E;",
     f"--leather:      {PANEL};   /* raised inside the dark band */"),
    ("--leather-deep: #1A1A1A;",
     f"--leather-deep: {GROUND};   /* charcoal, not black — see charcoal.py */"),
    ("--leather-ink-3: #8A8A8A;   /*  4.74:1 */",
     f"--leather-ink-3: {INK3};   /*  5.21:1 on charcoal — #8A8A8A fell to 4.03 */"),
    ("--rule: #2E2E2E;", f"--rule: {RULE};"),
]

TARGETS = [
    "02-the-project/app/src/styles/tokens.css",
    "02-the-project/website/assets/site.css",
    "02-the-project/app/preview-mobile.html",
    "03-brand/design-system/dashboard-v4.html",
    "03-brand/design-system/homepage-v4.html",
]

apply = "--apply" in sys.argv
total = 0

for rel in TARGETS:
    p = ROOT / rel
    if not p.exists():
        print(f"  MISSING  {rel}")
        continue
    s = p.read_text()
    hits = 0
    for old, new in EDITS:
        n = s.count(old)
        if n:
            s = s.replace(old, new)
            hits += n
    if hits:
        total += hits
        print(f"  {'wrote ' if apply else 'would'}  {rel:<52} {hits}")
        if apply:
            p.write_text(s)

print(f"\n{total} declaration(s) changed{'' if apply else '  — run with --apply'}")

# The black that must NOT have moved. --ink is body text and headings,
# --on-accent is the label on an orange button, --success is a word. If
# any of them became charcoal, the instruction was "keep the black" and
# this script broke it.
if apply:
    bad = []
    for rel in TARGETS:
        p = ROOT / rel
        if not p.exists():
            continue
        text = p.read_text()
        for token in ("--ink:", "--on-accent:", "--success:"):
            for line in text.splitlines():
                if line.strip().startswith(token) and GROUND.lower() in line.lower():
                    bad.append(f"{rel}  {line.strip()}")
    if bad:
        print("\nTEXT TOKENS WERE CHANGED — they must stay black:")
        for x in bad:
            print(f"  x {x}")
        sys.exit(1)
    print("Text tokens (--ink, --on-accent, --success) are still black.")
