"""
The mark, defined once — and this file is the only place it is defined.

The mark is inlined into **33 places across 22 files**: nine logo
masters, ten website pages, two design-system references, the app shell,
the mobile wordmark and the preview. That is the shape this codebase has
been bitten by repeatedly — "the potato replaced a PF chip and three
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
               + [os.path.join(root, "02-the-project/app/src/components/layout/shell.tsx"),
                  os.path.join(root, "02-the-project/app/preview-mobile.html")])
    out = {}
    for f in sorted(set(targets)):
        if not os.path.exists(f):
            continue
        s = _io.open(f, encoding="utf-8").read()
        n = len(block.findall(s))
        if not n:
            continue
        def sub(m, _f=f):
            p = pfx_re.search(m.group(0))
            b = svg(p.group(1) if p else "m")
            return _jsx(b) if _f.endswith((".tsx", ".jsx")) else b
        _io.open(f, "w", encoding="utf-8").write(block.sub(sub, s))
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
    else:
        sys.stdout.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
                         + svg("m") + '</svg>')
