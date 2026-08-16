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
BODY = ("M31.8,3.2 C38.4,2.9 43.8,7.4 46.6,14.2 C49.0,20.0 49.8,26.4 50.4,32.6 "
        "C51.0,39.2 50.6,46.2 46.8,51.8 C42.9,57.6 35.6,61.2 28.6,60.6 "
        "C21.6,60.0 15.6,55.0 13.2,48.4 C10.8,41.8 11.4,34.4 12.6,27.4 "
        "C13.9,19.8 16.2,11.6 21.8,6.6 C24.6,4.1 28.0,3.4 31.8,3.2 Z")

# ---- the palette ----------------------------------------------------
# Amber, not the interface orange. The mark keeps its own gradient — it
# always did — and WCAG exempts a brand mark from contrast, which is
# why the logo can be warm while the type stays measurable.
G_HIGH = "#F8BA5E"   # lit top-left
G_MID  = "#F0A03A"   # body
G_LOW  = "#E5842A"   # lower right
RIM    = "#D9761C"   # the darker edge, all the way round
CREASE = "#DD8A2E"   # cheek line and surface marks
EYE    = "#3B2416"   # dark brown, not black

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
TLD      = "#E86A2C"   # the ".io" — the brand orange, Option 1

STOPS = (f'<stop offset="0" stop-color="{G_HIGH}"/>'
         f'<stop offset="0.5" stop-color="{G_MID}"/>'
         f'<stop offset="1" stop-color="{G_LOW}"/>')

# ---- the face -------------------------------------------------------
# Capsules rather than ellipses: the source has flat-sided eyes with
# round ends, and at 16px the difference is the whole character.
def eyes(p=""):
    return (f'<rect x="22.8" y="22.2" width="4.5" height="10.0" rx="2.25" fill="{EYE}"/>'
            f'<rect x="35.0" y="21.6" width="4.2" height="9.6" rx="2.1" fill="{EYE}"/>')

# Two separate strokes, not one smile.
#
# The first attempt swept a single heavy curve across the whole lower
# body and the mark grinned — which the source does not. The source has
# a long, very soft cheek boundary on the right and a short downturn at
# the lower left. Kept apart, and both quieter than the eyes, so the
# face reads as a potato with a face rather than a smiley.
CREASE_PATH = (f'<path d="M45.4,33.0 C46.2,41.4 42.6,49.4 35.4,52.8" fill="none" '
               f'stroke="{CREASE}" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>'
               f'<path d="M22.6,40.8 C24.4,42.6 27.2,43.0 29.4,41.8" fill="none" '
               f'stroke="{CREASE}" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>')

# Surface marks. Three, asymmetric, because a symmetrical potato reads
# as a logo of a potato rather than a potato.
MARKS = (f'<path d="M22.6,16.0 C24.2,14.6 26.4,14.5 28.0,15.6" fill="none" stroke="{CREASE}" '
         f'stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>'
         f'<ellipse cx="41.8" cy="16.8" rx="1.0" ry="1.3" fill="{CREASE}" opacity="0.5"/>'
         f'<ellipse cx="43.0" cy="43.2" rx="1.1" ry="1.4" fill="{CREASE}" opacity="0.45"/>')

FACE = eyes() + CREASE_PATH + MARKS


def svg(pfx: str, extra_g: str = "", size: str = "") -> str:
    """A standalone mark. `pfx` keeps ids unique when several are inlined."""
    return (
        f'<defs>'
        f'<linearGradient id="sh{pfx}" x1="22%" y1="10%" x2="74%" y2="90%">{STOPS}</linearGradient>'
        f'<filter id="bl{pfx}"><feGaussianBlur stdDeviation="7"/></filter>'
        f'<filter id="dp{pfx}" x="-35%" y="-35%" width="180%" height="180%">'
        f'<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#8A4310" flood-opacity="0.18"/></filter>'
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
    head = re.escape(BODY[:10])
    block = re.compile(
        r'<defs>.*?</defs>'
        r'\s*<path d="' + head + r'[^"]*"[^/]*/>'
        r'\s*<g clip-?[Pp]ath="url\(#cp[^)]*\)">.*?</g>'
        r'\s*<rect [^/]*/><rect [^/]*/><path [^/]*/><path [^/]*/><path [^/]*/>'
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
                  os.path.join(root, "02-the-project/app/preview-mobile.html")])
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
        n = len(block.findall(s)) + len(word_re.findall(s))
        if not n:
            continue
        def sub(m, _f=f):
            p = pfx_re.search(m.group(0))
            b = svg(p.group(1) if p else "m")
            return _jsx(b) if _f.endswith((".tsx", ".jsx")) else b
        s = block.sub(sub, s)
        s = word_re.sub(_reword, s)
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
