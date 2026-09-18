#!/usr/bin/env python3
"""Every contrast ratio written in a comment, checked against the colour beside it.

    python3 04-audit-scripts/ratios.py <repo-root>

## Why this exists

Three times in one day a number in a comment was a generation behind the
colour it described:

  * `site.css` argued at length for warm cream — "Hermes does not put
    orange on #FFFFFF" — while `--ground` two lines below it was already
    `#FFFFFF`, and quoted the brand orange at 2.65:1 when on white it is
    3.22:1.
  * `tokens.css` recorded the wordmark navy at "14.88:1 on the ground,
    measured, not estimated". Correct against the cream it was measured
    on; 16.51:1 on the white that replaced it.
  * `PALETTE.md`'s whole interface table was cream figures, in a file
    whose second paragraph promises every number is measured against the
    shipped token rather than carried forward.

`repalette.py` moves hex values and cannot move prose. `consistency.py`
compares hexes across the four surfaces and passes happily while the
paragraph beside them says something else. `contrast.py` computes ratios
from the stylesheet and never reads what the comments claim.

So the gap was structural: **a comment carrying a number is a claim, and
nothing checked claims.** This checks them.

## What counts as a claim

A ratio on the same line as a hex colour. That is the shape that goes
stale, and it is unambiguous:

    --ink: #171717;   /* 17.93:1 on white, 16.19:1 on panel */
    | **Brand** | **`#E86A2C`** | **3.22:1** | 2.90:1 | ... |

## What is deliberately not a claim

A ratio with no hex on the line is a **requirement**, not a measurement —
"WCAG 1.4.11 wants the boundary of a form control at 3:1", "below the
4.5:1 needed for text". Those are facts about the standard and checking
them against a colour would be nonsense. They are skipped, and that is
why the rule is "same line as a hex" rather than "any ratio".
"""
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------
# The surfaces a ratio can honestly be measured against.
#
# Read from tokens.css rather than written here, so this file cannot
# itself go stale — which would be a joke it would not survive.
SURFACE_TOKENS = ["--ground", "--panel", "--accent-soft", "--accent", "--leather-deep", "--leather"]

# A surface is only taken from an explicit "on <surface>" that follows
# the ratio closely. The first version matched any occurrence of the
# word anywhere in the line, so
#
#     --accent-hover:#CF5A22;   /* 4.09:1 — the hover on a fill */
#
# read "the fill", decided the surface was `--accent`, and reported a
# correct 4.09:1 as stale because #CF5A22 on #E86A2C is 1.27. A check
# that invents the question it is asking will fail a correct file, and
# a false alarm costs more than the fault it was looking for.
ON = {
    "white": "--ground", "ground": "--ground", "cream": "--ground",
    "panel": "--panel",
    "soft orange": "--accent-soft", "the soft": "--accent-soft",
    "leather-deep": "--leather-deep", "leather": "--leather",
    "the accent": "--accent", "--accent": "--accent",
}

# Lines that are quoting a requirement or a superseded value on purpose.
#
# `PALETTE.md` says "`#E86A2C` was recorded at 2.56:1 and is 3.22:1 on
# white" — the first number is the fault being described. And "WCAG AA
# asks 4.5:1 for normal text" is a fact about the standard that happens
# to sit on a line with a colour. Neither is a claim about what a colour
# measures, and flagging them would train somebody to ignore this.
NOT_A_MEASUREMENT = re.compile(
    r"\b(?:was recorded|recorded|asks|wants|needs|required|requirement|"
    r"floor|threshold|used to|it read|falls to|on black|would be|"
    r"fails? at|below the|clears? the|above the|at least|must clear|"
    r"proved by|watching)\b",
    re.I,
)

# Prose wraps. "Both must clear\n4.5:1, which stops the ground going past
# `#2A2825`" puts the marker on one line and the number on the next, so a
# line is also excused by the sentence it is continuing. Two lines of
# lookback, because that is how far a marker can be from the number it
# governs in a 72-column paragraph.
LOOKBACK = 2

TOL = 0.02          # a claim is rounded to 2dp; allow the rounding


def lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum(hexv: str) -> float:
    h = hexv.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def ratio(a: str, b: str) -> float:
    l1, l2 = sorted((lum(a), lum(b)), reverse=True)
    return round((l1 + 0.05) / (l2 + 0.05), 2)


def surfaces(root: Path) -> dict:
    """The grounds, from the file that owns them."""
    css = (root / "02-the-project/app/src/styles/tokens.css").read_text()
    out = {}
    for name in SURFACE_TOKENS:
        m = re.search(rf"{re.escape(name)}:\s*(#[0-9a-fA-F]{{3,6}})\s*;", css)
        if m:
            out[name] = m.group(1)
    return out


HEX = re.compile(r"#[0-9a-fA-F]{6}\b")
RATIO = re.compile(r"(\d+\.\d+):1")


def check(path: Path, ground: dict, root: Path):
    fails, checked = [], 0
    lines = path.read_text(errors="ignore").split("\n")
    for n, line in enumerate(lines, 1):
        hexes = HEX.findall(line)
        claims = RATIO.findall(line)
        if not hexes or not claims:
            continue

        context = " ".join(lines[max(0, n - 1 - LOOKBACK): n])
        if NOT_A_MEASUREMENT.search(context):
            continue

        low = line.lower()

        for m in RATIO.finditer(line):
            claim = m.group(1)
            want = float(claim)
            # "on <surface>", and only within the words just after the
            # ratio — not anywhere on the line.
            tail = low[m.end(): m.end() + 26]
            allowed = [tok for word, tok in ON.items()
                       if f"on {word}" in tail and tok in ground] or list(ground)
            # A line may carry more than one colour (a pairing such as
            # "ink on the orange fill"), so any hex on the line against
            # any allowed surface — or against another hex on the line —
            # satisfies it.
            got = set()
            for h in hexes:
                for s in allowed:
                    got.add(ratio(h, ground[s]))
                for other in hexes:
                    if other.lower() != h.lower():
                        got.add(ratio(h, other))
            checked += 1
            if not any(abs(want - g) <= TOL for g in got):
                near = sorted(got, key=lambda g: abs(g - want))[:3]
                fails.append(
                    f"{path.relative_to(root)}:{n}  claims {claim}:1 — "
                    f"measures {', '.join(f'{g}' for g in near)}"
                    f"\n      {line.strip()[:96]}"
                )
    return checked, fails


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    ground = surfaces(root)
    if not ground:
        print("could not read the surfaces from tokens.css")
        return 1

    targets = [
        "02-the-project/app/src/styles/tokens.css",
        "02-the-project/app/src/styles/globals.css",
        "02-the-project/website/assets/site.css",
        "03-brand/logo/PALETTE.md",
        "03-brand/design-system/OPTION-1.md",
        "03-brand/design-system/TYPOGRAPHY.md",
    ]

    print(f"\nsurfaces: " + ", ".join(f"{k}={v}" for k, v in ground.items()))
    total, all_fails, files = 0, [], 0
    for t in targets:
        p = root / t
        if not p.exists():
            continue
        files += 1
        c, f = check(p, ground, root)
        total += c
        all_fails += f
        print(f"  {'✗' if f else '✓'} {t}  ({c} claim{'' if c == 1 else 's'})")

    print(f"\n{total} ratio claims across {files} files")
    if all_fails:
        print(f"\n{'=' * 62}\n{len(all_fails)} STALE:\n")
        for f in all_fails:
            print(f"  - {f}")
        print()
        return 1
    print("\nevery number written beside a colour is the number that colour measures.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
