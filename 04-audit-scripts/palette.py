#!/usr/bin/env python3
"""
Palette audit — is there one orange, or several?

Every other check in this suite was green while the brand carried three
different oranges at once, and it took an outside branding team to say
so. Measured afterwards:

    interface / .io   hue 18.0 - 19.8      #E86A2C #CF5A22 #B94E1F
    the logo          hue 28.6 - 35.8      #F8BA5E #F0A03A #D9761C
    reversed lockups  hue 24.1             #FF8533  (the `.io`, of all things)

Sixteen degrees apart is not a shade of the same orange, it is a
different one. On a screen showing the logo beside an orange button it
reads as two brands, which is exactly what was reported.

`ratios.py` checks that a contrast ratio written in a comment is true.
`contrast.py` checks that text is legible. Neither has an opinion about
whether two oranges are the *same* orange, because both are about
lightness and this is about hue. Nothing measured hue until now.

## The rule

Any colour that is warm and saturated enough to read as "the brand
orange" must sit within TOLERANCE degrees of the accent. Greys, the navy
wordmark, the brown of the eye and near-white tints are excluded — not
because they are exempt, but because hue is meaningless at very low
saturation and unstable at the extremes of lightness.

    python3 04-audit-scripts/palette.py <repo-root>
"""
import colorsys, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

# The one orange. Everything warm answers to this.
ACCENT = "#E86A2C"
TOLERANCE = 6.0          # degrees of hue either side

# Where a colour that ships lives. Deliberately not the whole repo:
# `PALETTE-V4.md`, `SPEC.md` and the repalette tooling record superseded
# palettes on purpose, and a check that fails on documented history
# teaches people to delete the history.
LIVE = [
    "02-the-project/app/src/styles",
    "02-the-project/app/src/components",
    "02-the-project/app/src/server/lib/mail.ts",
    "02-the-project/website/assets/site.css",
    "03-brand/logo",
]
SKIP_NAMES = {"PALETTE-V4.md", "SPEC.md", "PALETTE.md", "README.md", "THINKING.md"}
SKIP_EXT = {".png", ".ico", ".webp", ".jpg", ".zip"}

HEX = re.compile(r"#([0-9A-Fa-f]{6})\b")


def hls(hx):
    r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, l * 100, s * 100


def warm_enough(h, l, s):
    """Would a person call this 'the orange'?"""
    # Hue is meaningless below this saturation — greys and near-greys.
    if s < 25:
        return False
    # And unstable at the ends of lightness: #FFF1E8 is a tint nobody
    # reads as a hue, #0A0705 is black with a rumour of warmth in it.
    if l < 12 or l > 90:
        return False
    # Warm half of the wheel only. Navy, greens and the rest are not
    # competing to be the brand orange.
    return h <= 60 or h >= 350


ACC_H, _, _ = hls(ACCENT)
fails, seen = [], {}

for base in LIVE:
    p = os.path.join(ROOT, base)
    files = []
    if os.path.isfile(p):
        files = [p]
    elif os.path.isdir(p):
        for dirpath, _, names in os.walk(p):
            files += [os.path.join(dirpath, n) for n in names]
    for f in files:
        if os.path.basename(f) in SKIP_NAMES:
            continue
        if os.path.splitext(f)[1].lower() in SKIP_EXT:
            continue
        try:
            text = open(f, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError):
            continue
        for m in HEX.finditer(text):
            hx = "#" + m.group(1).upper()
            h, l, s = hls(hx)
            if not warm_enough(h, l, s):
                continue
            # Distance on a circle, so 359 and 1 are two degrees apart.
            d = abs(h - ACC_H)
            d = min(d, 360 - d)
            rel = os.path.relpath(f, ROOT)
            seen.setdefault(hx, {"hue": h, "d": d, "files": set()})["files"].add(rel)
            if d > TOLERANCE:
                seen[hx]["bad"] = True

print("Palette audit\n")
print(f"  the one orange: {ACCENT}  hue {ACC_H:.1f}")
print(f"  tolerance:      +/-{TOLERANCE:.0f} degrees\n")

ok = sorted((k, v) for k, v in seen.items() if not v.get("bad"))
bad = sorted((k, v) for k, v in seen.items() if v.get("bad"))

for hx, v in ok:
    print(f"    ok   {hx}  hue {v['hue']:5.1f}  ({v['d']:.1f} off)")
if bad:
    print()
    for hx, v in bad:
        where = ", ".join(sorted(v["files"])[:3])
        more = "" if len(v["files"]) <= 3 else f" +{len(v['files']) - 3} more"
        fails.append(f"{hx} is hue {v['hue']:.1f}, {v['d']:.1f} degrees off the accent — {where}{more}")
        print(f"    x    {hx}  hue {v['hue']:5.1f}  ({v['d']:.1f} off)  {where}{more}")

if fails:
    print(f"\n  {len(fails)} orange(s) outside the brand:\n")
    for f in fails:
        print(f"    x {f}")
    print("\n  One orange. Derive shades from the accent by changing")
    print("  lightness, not hue — `mark.py` shows the ramp.\n")
    sys.exit(1)

print(f"\n  every warm colour that ships is within {TOLERANCE:.0f} degrees of the accent.\n")
