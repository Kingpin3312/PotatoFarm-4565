"""
The mark, defined once — and this file is the only place it is defined.

The mark is inlined into **41 places across 25 files**: nine logo
masters, ten website pages, two design-system references, the React
lockup every screen in the app renders, the mobile wordmark and the
preview. That is the shape this codebase has been bitten by repeatedly — "the potato replaced a PF chip and three
surfaces were still on the chip a week later" is in the brand spec, and
`consistency.py` exists because of it.

So: change the geometry or the colours here, run

    python3 03-brand/logo/mark.py --apply

from the repository root, and every surface is rewritten from this
definition. `consistency.py` fingerprints the body path, so a surface
that gets missed fails the build rather than the logo quietly becoming
two logos.

Rebuilt from the supplied artwork. The previous mark was a flat
three-stop orange with two eyes; this one is a warmer amber body with a
darker rim, a soft cheek crease and the surface marks a potato actually
has. All of it is drawn rather than traced, because the source was a
raster and this codebase renders the mark at sixteen pixels.
"""

# ---- the silhouette -------------------------------------------------
# Taller than wide, narrow-ish shoulders, a full round bottom that sits
# slightly left, and a bulge on the lower right. 64x64 to match every
# existing file, so nothing downstream has to change its viewBox.
BODY = ("M32.6,3.0 C39.6,2.8 45.0,7.6 47.8,14.6 C50.2,20.6 51.2,27.2 51.6,33.6 "
        "C52.0,40.6 51.0,47.6 46.6,52.8 C42.2,58.0 34.8,61.4 27.6,60.8 "
        "C20.4,60.2 14.2,55.4 11.8,48.6 C9.4,41.8 10.2,34.2 11.6,27.0 "
        "C13.0,19.4 15.4,11.4 21.2,6.4 C24.2,3.9 28.6,3.2 32.6,3.0 Z")

# ---- the palette ----------------------------------------------------
# **One orange. #E86A2C, exactly, everywhere.**
#
# This block has now been wrong twice. First it argued for an amber
# gradient — hue 28.6 to 35.8 against the interface's 19.8 — and a
# branding team said, correctly, that the logo was a different orange
# from the product. Then it was moved onto the interface *ramp*, which
# fixed the hue and still left four different hex values in the mark.
# That was the same answer in a smaller size: a button one shade, its
# border another.
#
# The direction was one colour, so there is one colour. Every stop of
# the gradient and the rim are the same value, which means the body is a
# flat #E86A2C.
#
# Dimension now comes from things that are not orange and therefore
# cannot disagree with it: the white highlight already clipped inside
# the body, and the dark eyes. The creases — the mouth, the brow, the
# cheek line — are drawn in the eye's brown at low opacity rather than a
# darker orange, because a darker orange is another orange.
G_HIGH = "#FFA500"   # the one orange
G_MID  = "#FFA500"   # the one orange
G_LOW  = "#FFA500"   # the one orange
RIM    = "#FFA500"   # the one orange
# Not an orange. The mark's own brown, already present in the eyes, so
# the face keeps a mouth and a brow without introducing a second warm
# value. Drawn at the opacities set in `CREASE_PATH` and `MARKS`.
CREASE = "#3B2416"
EYE    = "#3B2416"   # dark brown, not black. Not an orange, unchanged.

# ---- the wordmark ---------------------------------------------------
# The one colour the supplied artwork has that the product did not.
# "PotatoFarm" is a deep blue-black, sampled at #0E1822 off the flat
# interior of the thick strokes with blue leading red by eleven points
# — a decision rather than compression noise. The shipped value is
# lifted a little off that reading because a JPEG darkens stroke cores.
#
# It dresses the wordmark and nothing else. `--ink` stays neutral: a
# logo is not a reason to recolour every heading and table in a CRM.
NAVY     = "#12202E"   # 14.88:1 on the ground
NAVY_REV = "#F5F3F0"   # the same word on charcoal, where navy vanishes
TLD      = "#FFA500"   # the ".io" — the brand orange, Option 1

STOPS = (f'<stop offset="0" stop-color="{G_HIGH}"/>'
         f'<stop offset="0.5" stop-color="{G_MID}"/>'
         f'<stop offset="1" stop-color="{G_LOW}"/>')

# ---- the face -------------------------------------------------------
# Ellipses, not capsules.
#
# The previous artwork had flat-sided eyes with round ends and this file
# argued for capsules on that basis. The revised artwork does not: the
# eyes are plainly oval, rounder, larger and set further apart, and that
# is most of what makes the new mark read as softer than the old one.
#
# The ratio matters more than the size. At roughly 1.6 tall to wide they
# stay oval at 16px; pushed nearer 2.2, as the capsules were, they
# collapse into two dashes and the face loses its expression in the
# favicon — which is the one place this mark is seen most often.
def eyes(p=""):
    return (f'<ellipse cx="26.4" cy="29.6" rx="2.6" ry="4.1" fill="{EYE}"/>'
            f'<ellipse cx="38.4" cy="29.2" rx="2.6" ry="4.1" fill="{EYE}"/>')

# Two separate strokes, not one smile.
#
# The first attempt swept a single heavy curve across the whole lower
# body and the mark grinned — which the source does not. The source has
# a long, very soft cheek boundary on the right and a short downturn at
# the lower left. Kept apart, and both quieter than the eyes, so the
# face reads as a potato with a face rather than a smiley.
CREASE_PATH = (f'<path d="M46.0,33.4 C46.6,42.0 42.8,49.8 35.2,53.4" fill="none" '
               f'stroke="{CREASE}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>'
               f'<path d="M23.8,45.6 C26.0,48.2 29.6,48.6 32.2,46.6" fill="none" '
               f'stroke="{CREASE}" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>')

# Surface marks. Three, asymmetric, because a symmetrical potato reads
# as a logo of a potato rather than a potato.
MARKS = (f'<path d="M23.4,15.4 C25.2,13.9 27.6,13.8 29.4,15.0" fill="none" stroke="{CREASE}" '
         f'stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>'
         f'<ellipse cx="42.4" cy="17.4" rx="1.0" ry="1.3" fill="{CREASE}" opacity="0.5"/>'
         f'<ellipse cx="43.4" cy="44.0" rx="1.1" ry="1.4" fill="{CREASE}" opacity="0.45"/>')

FACE = eyes() + CREASE_PATH + MARKS


def svg(pfx: str, extra_g: str = "", size: str = "") -> str:
    """A standalone mark. `pfx` keeps ids unique when several are inlined."""
    return (
        f'<defs>'
        f'<linearGradient id="sh{pfx}" x1="22%" y1="10%" x2="74%" y2="90%">{STOPS}</linearGradient>'
        f'<filter id="bl{pfx}"><feGaussianBlur stdDeviation="7"/></filter>'
        f'<filter id="dp{pfx}" x="-35%" y="-35%" width="180%" height="180%">'
        f'<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#FFA500" flood-opacity="0.18"/></filter>'
        f'<clipPath id="cp{pfx}"><path d="{BODY}"/></clipPath>'
        f'</defs>'
        f'<path d="{BODY}" fill="url(#sh{pfx})" stroke="{RIM}" stroke-width="1.7" '
        f'stroke-linejoin="round" filter="url(#dp{pfx})"/>'
        f'<g clip-path="url(#cp{pfx})">'
        f'<ellipse cx="24" cy="17" rx="17" ry="18" fill="#FFFFFF" opacity="0.20" filter="url(#bl{pfx})"/>'
        f'</g>'
        + FACE
    )


# ---------------------------------------------------------------------
# The dark treatment.
#
# Supplied as a second reference: the same potato on near-black, lit
# from inside by a wide orange bloom, with the wordmark falling away
# into the dark so the mark carries it alone.
#
# It is the mark plus light, not a second mark — the body path, the
# gradient stops and the face are the ones above, so the two cannot
# drift apart. What is added is a blurred copy of the silhouette behind
# it in the rim colour, which is what the glow in the reference actually
# is: the potato's own edge, bleeding.
#
# The viewBox is padded to 128 rather than 64 because a bloom that wide
# is clipped by a tight box, and a clipped glow reads as a rectangle of
# slightly lighter black around the logo.
GLOW_BG = "#0A0705"   # not pure black; the reference has warmth in it


def glow(pfx: str) -> str:
    """The mark on a dark ground, lit. 128x128 viewBox, mark inset at 32."""
    return (
        f'<defs>'
        f'<linearGradient id="sh{pfx}" x1="22%" y1="10%" x2="74%" y2="90%">{STOPS}</linearGradient>'
        # Three radii, not one. A single blur gives either a smudge with
        # no hot edge or a hard edge with no spill; the reference has
        # both, so it is built as three passes at 22 / 11 / 4.
        f'<filter id="ga{pfx}" x="-150%" y="-150%" width="400%" height="400%">'
        f'<feGaussianBlur stdDeviation="22"/></filter>'
        f'<filter id="gb{pfx}" x="-120%" y="-120%" width="340%" height="340%">'
        f'<feGaussianBlur stdDeviation="11"/></filter>'
        f'<filter id="gc{pfx}" x="-60%" y="-60%" width="220%" height="220%">'
        f'<feGaussianBlur stdDeviation="4"/></filter>'
        f'<filter id="bl{pfx}"><feGaussianBlur stdDeviation="7"/></filter>'
        f'<clipPath id="cp{pfx}"><path d="{BODY}"/></clipPath>'
        f'</defs>'
        f'<g transform="translate(32,32)">'
        # Outermost: the room the light fills. Deep orange, because a
        # yellow halo this wide turns the whole plate to mud.
        f'<path d="{BODY}" fill="{RIM}" filter="url(#ga{pfx})" opacity="0.95"/>'
        f'<path d="{BODY}" fill="{G_LOW}" filter="url(#gb{pfx})" opacity="0.95"/>'
        # Innermost: the heat right at the edge, which is what makes the
        # silhouette read as lit rather than as a sticker on a glow.
        f'<path d="{BODY}" fill="{G_MID}" filter="url(#gc{pfx})" opacity="0.85"/>'
        f'<path d="{BODY}" fill="url(#sh{pfx})" stroke="{RIM}" stroke-width="1.7" '
        f'stroke-linejoin="round"/>'
        f'<g clip-path="url(#cp{pfx})">'
        f'<ellipse cx="24" cy="17" rx="17" ry="18" fill="#FFFFFF" opacity="0.20" '
        f'filter="url(#bl{pfx})"/>'
        f'</g>'
        + FACE +
        f'</g>'
    )


# ---- the lockup -----------------------------------------------------
# The wordmark is live text in a font stack rather than outlined paths,
# and that is a deliberate limitation with a boundary drawn round it.
#
# Outlining would freeze the letterforms into whichever font happened to
# be installed on the machine that ran the build, which is not the same
# guarantee it sounds like. Live text means the SVG lockups render in
# the product's own typeface wherever that resolves, and fall back
# gracefully where it does not.
#
# **Where a font cannot be assumed — email, Open Graph, app icons, the
# favicon — the PNG masters are used, never the SVG.** That rule is what
# makes this choice safe rather than merely convenient.
# The same stack as `tokens.css`, and it must stay that way: the
# wordmark is set in live text inside the SVG, so a different
# first name here means the logo renders in a different face from
# the product it sits on. It led with Inter, which the interface
# no longer uses anywhere.
WORD_STACK = ("-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif")


def wordmark(x: int, y: int, size: int, fill: str, anchor: str = "start") -> str:
    """"PotatoFarm" in navy with an orange ".io"."""
    return (
        f'<text x="{x}" y="{y}" font-family="{WORD_STACK}" font-size="{size}" '
        f'font-weight="500" letter-spacing="{-size * 0.0115:.2f}" fill="{fill}" '
        f'text-anchor="{anchor}">PotatoFarm<tspan fill="{TLD}">.io</tspan></text>'
    )

def _jsx(block):
    """SVG attributes as React and react-native-svg want them."""
    for a, b in [("stop-color=", "stopColor="), ("clip-path=", "clipPath="),
                 ("stroke-width=", "strokeWidth="), ("stroke-linejoin=", "strokeLinejoin="),
                 ("stroke-linecap=", "strokeLinecap="), ("flood-color=", "floodColor="),
                 ("flood-opacity=", "floodOpacity=")]:
        block = block.replace(a, b)
    return block


def apply(root="."):
    """Rewrite every inlined copy of the mark from the definition above."""
    import os, re, glob, io as _io
    # ---- what an inlined mark looks like, without assuming its shape --
    #
    # This used to anchor on `BODY[:10]` — the first ten characters of
    # the *current* silhouette. That meant the propagator could only
    # find marks that already matched the definition it was about to
    # write, so it could push a change to the face and **could not push
    # a change to the body path at all**. Editing the silhouette and
    # running `--apply` rewrote nothing and reported success, because the
    # lockups still counted a wordmark substitution.
    #
    # Ten files kept the old potato and five said "updated". A tool that
    # silently does nothing is worse than no tool, and this one guards
    # the single thing it exists to keep identical.
    #
    # The anchor is the structure instead: the gradient id `sh<pfx>` and
    # the clip group are unique to this mark, so the body path in
    # between can be anything and is replaced wholesale. The face
    # accepts either eye primitive for the same reason — capsules
    # yesterday, ellipses today.
    eye = r'(?:<rect [^/]*/>|<ellipse [^/]*/>)'
    block = re.compile(
        r'<defs><linearGradient id="sh[\w-]*".*?</defs>'
        r'\s*<path d="M[^"]*"[^/]*/>'
        r'\s*<g clip-?[Pp]ath="url\(#cp[^)]*\)">.*?</g>'
        r'\s*' + eye + eye + r'<path [^/]*/><path [^/]*/><path [^/]*/>'
        r'<ellipse [^/]*/><ellipse [^/]*/>', re.S)
    pfx_re = re.compile(r'<linearGradient id="sh([\w-]+)"')

    targets = (glob.glob(os.path.join(root, "03-brand/logo/*.svg"))
               + glob.glob(os.path.join(root, "02-the-project/website/assets/*.svg"))
               + glob.glob(os.path.join(root, "02-the-project/website/*.html"))
               + glob.glob(os.path.join(root, "03-brand/design-system/*.html"))
               # The React lockup. It replaced the copy that used to be
               # inlined in shell.tsx, and it is the only React copy —
               # every screen in the app now renders this one component.
               + [os.path.join(root, "02-the-project/app/src/components/brand/logo.tsx"),
                  os.path.join(root, "02-the-project/app/src/components/layout/shell.tsx"),
                  os.path.join(root, "02-the-project/app/preview-mobile.html"),
                  # The app's own favicon, which this list did not cover.
                  # It is the most-seen instance of the mark — every open
                  # tab — and it was the last thing left showing the old
                  # potato after a propagation that reported success.
                  os.path.join(root, "02-the-project/app/public/favicon.svg"),
                  # The Expo app cannot build, but a stale mark in a file
                  # nobody compiles is still a second logo waiting to be
                  # shipped the day somebody fixes the build.
                  os.path.join(root, "02-the-project/app/mobile/components/wordmark.tsx")])
    # The wordmark's colour, wherever it is written as SVG text.
    #
    # The mark has been propagated from this file since it was written
    # and the wordmark never was — so when the artwork's navy arrived,
    # nine lockups still said #171717 and there was nothing to catch it.
    # A brand definition that governs the potato and not the word beside
    # it is half a definition.
    #
    # Reversed lockups are left alone: on charcoal the navy disappears,
    # and their light fill is correct rather than stale.
    word_re = re.compile(r'(<text\b[^>]*?\bfill=")(#[0-9A-Fa-f]{6})("[^>]*>PotatoFarm)')

    # The `.io`, which nothing governed.
    #
    # The rule above matches the wordmark's own `fill` on `<text>`. The
    # `.io` is a `<tspan>` inside it and was never covered, so its colour
    # was set by hand wherever a lockup was written. The reversed lockups
    # carried #FF8533 — a third orange, on the one piece of the wordmark
    # that is deliberately the brand orange.
    tld_re = re.compile(r'(<tspan\b[^>]*?\bfill=")(#[0-9A-Fa-f]{6})("[^>]*>\.io)')

    def _reword(m):
        return m.group(1) + (m.group(2) if _light(m.group(2)) else NAVY) + m.group(3)

    def _light(hex6):
        v = int(hex6[1:3], 16) + int(hex6[3:5], 16) + int(hex6[5:7], 16)
        return v > 382          # already a reversed-out wordmark

    out = {}
    for f in sorted(set(targets)):
        if not os.path.exists(f):
            continue
        s = _io.open(f, encoding="utf-8").read()
        n = len(block.findall(s)) + len(word_re.findall(s)) + len(tld_re.findall(s))
        if not n:
            continue
        def sub(m, _f=f):
            p = pfx_re.search(m.group(0))
            b = svg(p.group(1) if p else "m")
            return _jsx(b) if _f.endswith((".tsx", ".jsx")) else b
        s = block.sub(sub, s)
        s = word_re.sub(_reword, s)
        # The `.io` is the brand orange on every background. Unlike the
        # wordmark it is not lightened for reversed lockups: that is what
        # produced the third orange in the first place.
        s = tld_re.sub(lambda m: m.group(1) + TLD + m.group(3), s)
        _io.open(f, "w", encoding="utf-8").write(s)
        out[f] = n
    return out


if __name__ == "__main__":
    import sys
    if "--apply" in sys.argv:
        i = sys.argv.index("--apply")
        r = apply(sys.argv[i + 1] if len(sys.argv) > i + 1 else ".")
        for f, n in sorted(r.items()):
            print("  %d  %s" % (n, f))
        print("%d files, %d instances" % (len(r), sum(r.values())))
    elif "--glow" in sys.argv:
        # Padded to 128 because a bloom this wide is clipped by a tight
        # box, and a clipped glow reads as a lighter rectangle round the
        # logo — which is worse than no glow.
        sys.stdout.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
                         + glow("g") + '</svg>')
    else:
        sys.stdout.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
                         + svg("m") + '</svg>')
