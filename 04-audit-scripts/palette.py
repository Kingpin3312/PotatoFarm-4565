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

# The one orange. Everything warm answers to this — exactly.
#
# #FFA500 replaced #E86A2C on instruction. Worth recording what the two
# measure, because the swap changes where the colour may be used rather
# than only how it looks: #E86A2C was 3.22:1 on white and #FFA500 is
# **1.97:1**, which is below the 3:1 a border or icon needs and far
# below the 4.5:1 text needs. As a *fill* it is the better of the two —
# black on it is 9.08:1 against the old 5.57:1. So the rule this palette
# now runs on is: orange fills, black type.
ACCENT = "#FFA500"

# Deliberately not a hue tolerance any more.
#
# The first version of this check allowed anything within six degrees,
# which passed a palette of four different oranges: #E86A2C for a fill,
# #CF5A22 for its hover, #B94E1F for its border, #A0431B for orange
# text. All one hue, all obviously different colours to anyone using the
# product, and the complaint that produced this file was made twice
# before the check was tightened.
#
# The direction is one colour, so the rule is equality.
EXCEPTIONS = {
    # The mark's brown. Eyes, mouth, brow and cheek line — dark enough
    # that nobody calls it orange, and it is what keeps the potato's face
    # readable now that the body is a flat fill.
    "#3B2416",
}

# Where a colour that ships lives. Deliberately not the whole repo:
# `PALETTE-V4.md`, `SPEC.md` and the repalette tooling record superseded
# palettes on purpose, and a check that fails on documented history
# teaches people to delete the history.
#
# ## This list was the hole, twice
#
# It named `src/styles`, `src/components` and `website/assets/site.css`
# — the places a palette obviously lives — and passed green while two
# whole surfaces sat on the old four-step ramp: `preview-mobile.html`
# and the entire native app, the latter still carrying the *old logo
# gradient* (#F0A03A over #D9761C, hue 35.8 and 28.6 against the
# interface's 19.8). That is the two-brands-on-one-screen effect the
# branding review reported, surviving inside the check written to catch
# it.
#
# So the entries below are directories rather than files. A named file
# covers what somebody remembered; a directory covers what they did not.
LIVE = [
    "02-the-project/app/src",
    "02-the-project/app/public",
    "02-the-project/app/preview-mobile.html",
    # The native palette. React Native has no custom properties, so this
    # is a duplicate of the tokens by necessity — and a duplicate is the
    # thing most able to drift.
    "02-the-project/app/mobile",
    # The whole site, not just its stylesheet. Ten pages carry inline
    # colour in `<svg>` marks and theme-colour meta tags.
    "02-the-project/website",
    "03-brand/logo",
    # The design-system prototypes. `consistency.py` caught these when
    # the tokens were unified and this list did not cover them — the
    # marketing and dashboard mockups still carried the old ramp, which
    # is exactly the "every asset" gap the direction was about.
    "03-brand/design-system",
]
SKIP_NAMES = {"PALETTE-V4.md", "SPEC.md", "PALETTE.md", "README.md", "THINKING.md"}
# Markdown is documentation, never a shipped surface. The brand
# documents quote every colour that was ever considered — including the
# rejected ones, on purpose — and a check that fails on a design
# rationale teaches people to delete the rationale.
SKIP_EXT = {".png", ".ico", ".webp", ".jpg", ".zip", ".md"}

HEX = re.compile(r"#([0-9A-Fa-f]{6})\b")


def strip_comments(t):
    """Prose is not a shipped colour.

    `tokens.css` explains at length which oranges were rejected and why,
    naming them. That history is worth keeping and is not a palette
    violation, so block comments, line comments and markdown quotes come
    out before anything is measured.
    """
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)      # CSS and JS blocks
    t = re.sub(r"^\s*//.*$", " ", t, flags=re.M)       # JS line comments
    t = re.sub(r"^\s*#.*$", " ", t, flags=re.M)        # Python and markdown
    return t


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
        text = strip_comments(text)
        for m in HEX.finditer(text):
            hx = "#" + m.group(1).upper()
            h, l, s = hls(hx)
            if not warm_enough(h, l, s):
                continue
            if hx in EXCEPTIONS:
                continue
            d = abs(h - ACC_H)
            d = min(d, 360 - d)
            rel = os.path.relpath(f, ROOT)
            seen.setdefault(hx, {"hue": h, "d": d, "files": set()})["files"].add(rel)
            if hx != ACCENT:
                seen[hx]["bad"] = True

print("Palette audit\n")
print(f"  the one orange: {ACCENT}")
print("  the rule:       exact equality, not a hue family\n")

ok = sorted((k, v) for k, v in seen.items() if not v.get("bad"))
bad = sorted((k, v) for k, v in seen.items() if v.get("bad"))

for hx, v in ok:
    print(f"    ok   {hx}  hue {v['hue']:5.1f}  ({v['d']:.1f} off)")
if bad:
    print()
    for hx, v in bad:
        where = ", ".join(sorted(v["files"])[:3])
        more = "" if len(v["files"]) <= 3 else f" +{len(v['files']) - 3} more"
        fails.append(f"{hx} is not {ACCENT} (hue {v['hue']:.1f}, {v['d']:.1f} off) — {where}{more}")
        print(f"    x    {hx}  hue {v['hue']:5.1f}  ({v['d']:.1f} off)  {where}{more}")

if fails:
    print(f"\n  {len(fails)} orange(s) outside the brand:\n")
    for f in fails:
        print(f"    x {f}")
    print(f"\n  One orange: {ACCENT}. Not a shade of it, not a hue near it.")
    print("  If a darker value is genuinely needed — an error that must not")
    print("  look like a link — the answer is a different colour, not")
    print("  another orange.\n")
    sys.exit(1)

print(f"\n  every warm colour that ships is exactly {ACCENT}.\n")
