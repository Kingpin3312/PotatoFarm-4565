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
# Three accents on instruction, and the measurements are worth keeping
# together because each swap changed where the colour may be used, not
# only how it looks:
#
#     on white          as type   black on the fill
#     #E86A2C            3.22:1        5.57:1
#     #FFA500            1.97:1        9.08:1
#     #C65A1E            4.30:1        4.17:1
#     #FF5A00            3.13:1        5.73:1   <- current
#
# The rule the palette runs on is unchanged through all four — orange
# fills, black type — because no accent yet has cleared 4.5:1 as text.
#
# What #FF5A00 does change is the *label*: it is the first accent since
# #E86A2C where ink on the fill passes AA and white does not, which
# reverses the standing white-on-orange instruction on the numbers. The
# instruction is kept and the conflict is recorded in `tokens.css`
# rather than resolved here — a palette audit measures, it does not
# overrule a brand decision.
ACCENT = "#FF5A00"

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
# Rendered assets, scanned as pixels rather than as text.
#
# ## Why this was added, and what it cost to find
#
# This audit read source files and skipped every image by extension, so
# a colour baked into a PNG was invisible to it. Three Open Graph cards
# — the share previews for the whole marketing site — sat on #E86A2C
# through **two** further accent changes, and one still carried #A0431B
# from the four-step ramp three generations back. Every source file was
# exactly right and the audit was green the entire time.
#
# They are generated by `02-the-project/website/og.mjs`, which reads its
# colours from `site.css` and would have produced correct cards on any
# run. Nothing ran it. The generator was right, the inputs were right,
# and the output was three palettes old.
#
# **That is the worst version of this failure**, because an OG card is
# the first thing anybody sees when a link is shared — and for a
# WhatsApp-first product, sharing a link is the product. It was found by
# a person looking at a screenshot, which is not a control.
RASTERS = [
    "02-the-project/app/public",
    "02-the-project/website/assets",
    "03-brand/logo",
]
#
# **Lossless only, and the exclusion is a real limit rather than a
# convenience.** WebP and JPEG re-quantise every pixel, so a correct
# screenshot never contains the exact accent — the regenerated ones here
# came back as #E36021 and #FFDEC6, both plainly the right orange and
# neither equal to it. Exact equality is a meaningful test on a PNG and
# a meaningless one on a WebP.
#
# A tolerance does not rescue it either: #E86A2C and #FF5A00 are 1.4
# degrees of hue apart, so any band loose enough to forgive compression
# is loose enough to pass a screenshot from the previous palette. The
# honest position is that this check cannot see lossy assets, so the
# defence for those is the runbook below rather than a number here.
RASTER_EXT = {".png", ".ico"}

# Regenerated whenever the palette moves. Named here because both were
# missed: `og.mjs` had not run in three accent changes, and `shots.mjs`
# was carrying screenshots of an older product.
REGENERATORS = [
    "node 02-the-project/website/og.mjs      # needs: node 02-the-project/website/serve.mjs",
    "node 02-the-project/website/shots.mjs   # needs: the app running on :3000",
    "node 03-brand/logo/build.mjs",
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

# ---- rendered assets ---------------------------------------------------
#
# Source is not enough. A generated PNG carries whatever palette was
# current the last time somebody remembered to run its generator.
#
# The test is the *dominant* warm colour rather than every warm pixel:
# anti-aliasing around orange type produces hundreds of near-misses that
# are not decisions, and a shadow or a blend is not a palette violation.
# One colour per file, the one a person actually sees.
raster_fails = []
try:
    from PIL import Image
except ImportError:
    print("  ! Pillow is not installed — no rendered asset was checked.\n"
          "    pip install pillow, or this audit is blind to every PNG.")
    raster_fails.append("Pillow missing — rasters unchecked")
else:
    import collections
    checked = 0
    for base in RASTERS:
        root = os.path.join(ROOT, base)
        if not os.path.isdir(root):
            continue
        for dirpath, _, names in os.walk(root):
            for n in sorted(names):
                if os.path.splitext(n)[1].lower() not in RASTER_EXT:
                    continue
                f = os.path.join(dirpath, n)
                try:
                    im = Image.open(f).convert("RGB")
                except Exception:
                    continue
                checked += 1
                counts = collections.Counter()
                for px in im.getdata():
                    h, l, s = hls("#%02X%02X%02X" % px)
                    if warm_enough(h, l, s):
                        counts[px] += 1
                if not counts:
                    continue  # a mark with no orange in it is fine
                top = "#%02X%02X%02X" % counts.most_common(1)[0][0]
                if top in EXCEPTIONS or top == ACCENT:
                    continue
                h, _, _ = hls(top)
                d = abs(h - ACC_H); d = min(d, 360 - d)
                rel = os.path.relpath(f, ROOT)
                raster_fails.append(
                    f"{top} is the dominant orange in {rel} (hue {h:.1f}, {d:.1f} off)")
    print(f"\n  {checked} lossless asset(s) scanned")
    print("  (WebP and JPEG are not checked — see RASTER_EXT for why;")
    print("   regenerate them with the commands in REGENERATORS)")

if raster_fails:
    print(f"\n  {len(raster_fails)} rendered asset(s) on the wrong orange:\n")
    for f in raster_fails:
        print(f"    x {f}")
    print("\n  A generated image holds whatever palette was current when its")
    print("  generator last ran. Re-run them:")
    for cmd in REGENERATORS:
        print(f"    {cmd}")
    print()
    fails += raster_fails

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
