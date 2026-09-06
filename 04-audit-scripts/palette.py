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
    # The shadow tint, written as `rgb(43 30 23 / .06)` and friends. It
    # is warm on purpose — a neutral grey shadow under a warm palette
    # reads as dirt — and it only ever ships at 5-18% opacity, so it is a
    # shadow rather than a colour anybody sees. Hue 21.0 against the
    # accent's 21.2: tuned to it, not competing with it. It becomes
    # visible to this check only now that rgb() notation is read.
    "#2B1E17",
}

# ---- the mark's own palette, read out of the file that defines it ----
#
# The rule above — one orange, exact equality — is about the *interface*
# and it is not relaxed. This is about the logo, which the owner has
# directed be the supplied artwork: a lit body with a gradient, a rim
# that is lighter where the light falls, and orange creases. That cannot
# be one hex value and it is not supposed to be.
#
# **It is not a typed-in list, and that is the whole point.** The mark's
# brown used to sit in EXCEPTIONS above as a literal `#3B2416`, which is
# the failure mode this repository has hit twice: `mobile/_check.py`
# compared against eight hardcoded colours that were two generations
# old, so its loop could never fire, and this file's own first version
# named three directories and passed green across two surfaces it had
# never been pointed at. A hardcoded exemption goes quiet exactly when
# the value it exempts is superseded.
#
# So the exemption is *read from `03-brand/logo/mark.py`* — the one file
# that defines the mark, the file `--apply` propagates from, and the
# only way any of these values can reach a surface. Change the mark
# there and the exemption follows; paste an orange anywhere else and it
# still fails. Comments are stripped first, because that file argues at
# length about oranges it has rejected and a sentence about `#CF5A22` is
# not a declaration of it — the same trap that made an earlier rewrite
# of this check unable to fail.
def mark_palette():
    f = os.path.join(ROOT, "03-brand/logo/mark.py")
    try:
        src = strip_comments(open(f, encoding="utf-8").read())
    except OSError:
        return set()
    return {m.group(1).upper() for m in
            re.finditer(r'^[A-Z_]+\s*=\s*"(#[0-9A-Fa-f]{6})"', src, re.M)}

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

# Archives. A packaged copy of a surface is a surface.
#
# `potatofarm-site.zip` sat in the repository root holding a complete
# marketing site on **#FF6B35 with black button labels** — the accent
# from *five* generations ago — while every source file and every loose
# asset measured correct. It was also missing ten files the live site
# had, including the favicon and all four product screenshots.
#
# Nothing could see it. This audit read source and loose images; a zip
# is neither. And it is the worst possible thing to be stale, because a
# package exists precisely to be handed to somebody or deployed — it is
# the copy that gets *used*, which is how "the .io is the wrong colour"
# was true and unfindable at the same time.
ARCHIVES = ["potatofarm-site.zip"]

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

# ---------------------------------------------------------------------
# CSS does not only write colour in hex, and this check only read hex.
#
# `--ring: 0 0 0 3px rgb(232 106 44 / .40)` sat in `tokens.css` through
# four accents. #E86A2C is the first orange this project ever had, and it
# was painting every keyboard focus ring in the CRM. The website, the
# mobile preview and both design-system pages carried
# `rgb(217 119 87 / .40)` — #D97757, a terracotta that was never one of
# this project's accents at all.
#
# Five surfaces, two wrong oranges, and nothing could see any of them:
# `recolour.py` rewrites hex, this file scanned hex, and `browser:palette`
# measures hue — 19.8 and 14.8 both sit inside its 8-45 orange window, so
# all three passed a colour none of them had ever read. It took an
# accessibility check printing the focus shadow verbatim to find it.
#
# Both notations are covered: the legacy comma form `rgb(232, 106, 44)`
# and `rgba(...)`, and the modern space form with an optional `/ alpha`.
# The alpha is not part of the colour and is discarded — a wrong orange
# at 40% opacity is still a wrong orange.
# ---------------------------------------------------------------------
RGB = re.compile(
    r"\brgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})"
    r"\s*(?:[,/]\s*[\d.%]+\s*)?\)"
)


def colours_in(text):
    """Every colour the file ships, whichever notation it is written in."""
    for m in HEX.finditer(text):
        yield "#" + m.group(1).upper()
    for m in RGB.finditer(text):
        r, g, b = (int(m.group(i)) for i in (1, 2, 3))
        if r > 255 or g > 255 or b > 255:
            continue          # not a colour; some other three numbers
        yield f"#{r:02X}{g:02X}{b:02X}"


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
MARK = mark_palette()
if not MARK:
    print('  ! 03-brand/logo/mark.py could not be read — this run would\n'
          '    exempt nothing of the mark and fail on the logo everywhere.')
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
        for hx in colours_in(text):
            h, l, s = hls(hx)
            if not warm_enough(h, l, s):
                continue
            if hx in EXCEPTIONS or hx in MARK:
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
# ## Two bugs in the previous version of this block, both latent
#
# It opened each file with `.convert("RGB")` and then took the single
# most common warm pixel. Both halves were wrong and neither could show
# it while the mark was a flat fill.
#
# **It threw the alpha away.** A fully transparent pixel is (0,0,0) in a
# PNG and an invisible shadow fringe keeps its colour, so the check was
# reading pixels nobody can see. In `icon-512.png` the "dominant orange"
# it reported was `#BF0000` — 5,361 pixels of pure red at an alpha
# between 4 and 16 out of 255, which is the outer 2% of a drop shadow.
# It named a colour that does not appear on anybody's screen.
#
# **And "the dominant pixel" assumed a flat fill.** With one colour over
# most of the mark, the most common pixel was that colour and the test
# meant something. A gradient has no dominant pixel: every pixel differs
# slightly from its neighbour, so `most_common` returns whichever small
# flat region happens to be largest — which is now the eyes.
#
# So the question changes to one a gradient can answer: **is every warm
# pixel a person can actually see inside the hue span the mark declares?**
# That still fails on a stale asset carrying a different orange family,
# it fails on a stray warm colour composited into an icon, and unlike
# the old test it does not depend on the artwork being flat.
# ## And a third thing, found by proving the rewrite
#
# The first rewrite tested every opaque warm pixel individually and lit
# up on all sixteen assets — at fringes like `#FFC6C7` and `#B02100`,
# one to seven degrees outside. Those are antialiasing: the edge of an
# orange shape against white passes through pink, and the edge of the
# deep rim against transparency passes through a redder orange. Real
# pixels, visible, and not a palette decision by anybody.
#
# A per-pixel rule cannot separate those from a wrong colour. A **mass**
# rule can: a stale asset has its whole body at the wrong hue, which is
# most of its warm pixels, while an antialiased edge is a rounding error
# on a boundary and never approaches one percent. So the test is what
# share of the warm pixels sit outside the span, not whether any do.
OPAQUE_ENOUGH = 24      # /255. Below this a pixel is a shadow, not a colour.
HUE_SLACK = 6.0         # PNG rounding and blending between two stops.
# Three percent, and the number is not a fudge.
#
# The lockup PNGs are mark *plus type*, so their warm-pixel population
# is small and the wordmark's own antialiasing — which passes through
# pinks and mauves against a coloured ground — is a larger share of it:
# 1.1% to 2.3% measured across the three. A stale asset, by contrast,
# has its whole body at the wrong hue, which is most of its warm pixels.
# The gap between "an antialiased edge" and "the wrong mark" is two
# percent against roughly a hundred, so this threshold sits in the
# middle of nothing.
OUTSIDE_LIMIT = 0.03
# Two percent, and the first attempt at this line said ten because it
# was guessed rather than measured — which flagged seven correct assets.
#
# The actual spread of the warm share across everything that ships, of
# the pixels a person can see:
#
#     4.3 - 5.2%   the social cards, which are mostly white around a
#                  small mark
#     12.7 - 15.5% the lockups: mark plus navy wordmark
#     20.7%        the maskable icon, which is mostly safe-area padding
#     53.9 - 100%  the icon ladder
#
# An asset that has lost the mark's colour altogether measures ~0 — the
# proof case recolours an icon green, and green is not warm, so its warm
# population empties. The floor therefore has to sit between 0 and 4.3,
# and it is a floor against **absence** rather than a target: it exists
# so that "no warm pixels to measure" cannot be mistaken for "no warm
# pixel is wrong", which is how the hue rule above passed a green potato.
WARM_SHARE = 0.02

# The span the rasters are measured against. **Warm members only** — the
# wordmark navy is declared in `mark.py` too, and including it stretched
# the ceiling to 214 degrees, which is a window wide enough to pass a
# green potato. `warm_enough` is the same filter the source scan uses.
_warm = [hls(c)[0] for c in (MARK | EXCEPTIONS | {ACCENT})
         if warm_enough(*hls(c))]
HUE_LO = (min(_warm) if _warm else ACC_H) - HUE_SLACK
HUE_HI = (max(_warm) if _warm else ACC_H) + HUE_SLACK
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
                    im = Image.open(f).convert("RGBA")
                except Exception:
                    continue
                checked += 1
                # The window the mark declares, plus the accent, plus the
                # named exceptions. Read from mark.py, so it cannot go
                # stale; if that file is unreadable MARK is empty and the
                # window collapses to the accent alone, which fails loudly
                # rather than passing quietly.
                warm, outside, opaque, worst = 0, 0, 0, None
                for px in im.getdata():
                    if px[3] < OPAQUE_ENOUGH:
                        continue          # a shadow fringe is not a colour
                    opaque += 1
                    h, l, sat = hls("#%02X%02X%02X" % px[:3])
                    if not warm_enough(h, l, sat):
                        continue
                    warm += 1
                    if HUE_LO <= h <= HUE_HI:
                        continue
                    outside += 1
                    off = min(abs(h - HUE_LO), abs(h - HUE_HI))
                    if worst is None or off > worst[1]:
                        worst = ("#%02X%02X%02X" % px[:3], off, h)
                # A mark that is no longer orange at all must not pass
                # by having no warm pixels to measure.
                #
                # This was `if not warm: continue`, and proving the check
                # is how it was found: recolouring `icon-192.png` by
                # swapping its red and green channels turns the potato
                # green, which is about as wrong as an asset can be — and
                # green pixels are not warm, so the warm population fell
                # to nothing and the file passed. The hue rule only ever
                # looked at pixels that were already the right family.
                if opaque and warm / opaque < WARM_SHARE:
                    rel = os.path.relpath(f, ROOT)
                    raster_fails.append(
                        f"{rel} is {warm / opaque:.1%} warm — the mark is an "
                        f"orange potato, so this asset is not it")
                    continue
                if not warm or outside / warm <= OUTSIDE_LIMIT:
                    continue
                rel = os.path.relpath(f, ROOT)
                raster_fails.append(
                    f"{outside / warm:.1%} of {rel} is outside the mark's hue span "
                    f"{HUE_LO:.1f}-{HUE_HI:.1f} — worst {worst[0]} at hue {worst[2]:.1f}")
    print(f"\n  {checked} lossless asset(s) scanned")
    print("  (WebP and JPEG are not checked — see RASTER_EXT for why;")
    print("   regenerate them with the commands in REGENERATORS)")

# ---- packaged copies -----------------------------------------------
import zipfile
archive_fails = []
for rel in ARCHIVES:
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        continue
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:
        archive_fails.append(f"{rel} could not be read ({e})")
        continue
    seen_in_zip = {}
    for info in z.infolist():
        if info.is_dir():
            continue
        ext = os.path.splitext(info.filename)[1].lower()
        if ext not in {".css", ".html", ".svg", ".webmanifest", ".json", ".js"}:
            continue
        try:
            text = strip_comments(z.read(info).decode("utf-8", "ignore"))
        except Exception:
            continue
        for hx in colours_in(text):
            h, l, s = hls(hx)
            if not warm_enough(h, l, s) or hx in EXCEPTIONS or hx in MARK or hx == ACCENT:
                continue
            seen_in_zip.setdefault(hx, set()).add(info.filename)
    for hx, files in sorted(seen_in_zip.items()):
        where = ", ".join(sorted(files)[:2])
        archive_fails.append(f"{hx} is declared inside {rel} ({where})")
    print(f"  {len(z.infolist())} file(s) inside {rel} checked")

if archive_fails:
    print(f"\n  {len(archive_fails)} stale colour(s) inside a packaged copy:\n")
    for f in archive_fails:
        print(f"    x {f}")
    print("\n  A package is the copy that gets handed to somebody. Rebuild it")
    print("  from the live directory rather than editing it in place.\n")
    fails += archive_fails

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
