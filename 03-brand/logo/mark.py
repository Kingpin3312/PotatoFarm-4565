"""
The mark, defined once — and this file is the only place it is defined.

The mark is inlined into **47 places across 26 files**: nine logo
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
# A bottom-heavy pear, traced off the supplied artwork rather than
# guessed at.
#
# The previous silhouette was an egg: widest across the middle, roughly
# symmetrical top to bottom. The artwork is not. Scanning the supplied
# render row by row and expressing each row as a percentage of the
# bounding box, the widest point is at **68% of the height**, the crown
# is only about a quarter of the full width, and the centre line drifts
# left below 70% while the right side carries a bulge. That profile —
# narrow domed top, full round base sitting slightly left — is most of
# what makes the mark read as a potato rather than as an egg with a
# face on it.
#
# The crown is a dome, not a point, and getting that wrong is what made
# a first attempt read as a teardrop. Traced by edge gradient rather
# than by brightness threshold — the artwork's lower right is in shadow
# and a brightness cut-off drops it, which is what produced an earlier
# reading that the base "sits left". It does not: the centre line holds
# at 50% for the whole body. The top row is a flat about a quarter of
# the width across, offset very slightly left, and that flat is the
# whole difference between a potato and a teardrop.
#
# Fitted against the measured profile, which now agrees within about
# two points of width everywhere below the crown, at an aspect of
# 1.26 against the artwork's 1.29.
#
# 64x64 to match every existing file, so nothing downstream has to
# change its viewBox. Body box is x 8.9->55, y 3->61.5.
BODY = ("M27.6,3.0 C34.6,3.0 40.6,6.6 44.0,11.6 "
        "C46.6,17.2 48.8,23.6 50.8,29.8 "
        "C53.0,35.6 55.4,40.6 54.6,45.8 "
        "C53.4,53.0 47.2,58.6 39.8,60.5 "
        "C32.8,62.2 25.4,61.6 19.8,58.6 "
        "C13.4,55.2 9.4,49.0 8.9,42.0 "
        "C8.4,35.0 10.2,28.0 12.4,21.6 "
        "C14.6,15.2 17.0,8.0 21.4,5.2 "
        "C23.2,4.0 25.0,3.0 27.6,3.0 Z")

# ---- the palette ----------------------------------------------------
# **A gradient, on the owner's explicit direction, and the block this
# replaces argued the opposite. That history is kept because it is the
# reason somebody would change it back.**
#
# What was here: one flat #FF5A00, everywhere, because a branding team
# had twice objected that the logo was a different orange from the
# product. The fix was to collapse the mark to the single interface
# accent. It satisfied the objection and it also flattened the artwork
# into a silhouette — no light direction, no rim, no form.
#
# The owner has since supplied the artwork as the definitive mark and
# asked for it exactly, so the constraint that produced the flat fill no
# longer applies. What replaces it is not "any colour": every value
# below is sampled from the supplied render and every one of them sits
# inside the hue window `browser:palette` enforces (8-45), so the mark
# is still unambiguously the product's orange — it is now lit.
#
# Sampled, not invented. Upper-left body #FDDF68, centre #FD990F,
# lower-right #C03B00, bottom rim #8C1C00. The shipped values are those
# readings pulled a little toward the accent's own hue, because the
# source is a JPEG-ish render on black and its bloom biases warm.
G_HIGH = "#FFD04A"   # the lit upper-left: pale gold        hue 44
G_MID  = "#FCA51B"   # the amber body                       hue 37
G_WARM = "#F2760A"   # the turn into shadow                 hue 28
G_LOW  = "#D24500"   # the lower right, in shadow           hue 20
# The rim is two values, because in the artwork it is not one.
#
# Drawn as a single deep value it came out as a heavy cartoon outline
# and swamped a 512px icon. The artwork's edge is lit where the body is
# lit — sampled #FD6904 on the upper left — and falls to #8C1C00 under
# the base. So the stroke takes its own gradient on the same light axis
# as the body, which is what makes it read as an edge rather than as a
# drawn border.
RIM      = "#B83400"   # the single value, still used for the bloom  hue 17
RIM_HIGH = "#E8620A"   # the lit edge, upper left                    hue 24
RIM_LOW  = "#9E2A00"   # the edge in shadow, under the base          hue 16

# The creases are orange, not brown, and that is a correction.
#
# Under the flat-fill rule a darker orange was "another orange", so the
# mouth, the brow and the cheek line were drawn in the eyes' brown at
# low opacity. In the artwork they are plainly orange indentations and
# only the eyes are brown — which is what stops the face reading as a
# drawn-on smiley.
CREASE = "#D2530C"   # hue 21
EYE    = "#4A1E0C"   # dark warm brown, sampled off the sockets. hue 17
SHADE  = "#B23600"   # the soft shading lobe over the lower right
GLOSS  = "#FFF0CE"   # the specular edge, upper left.  hue 42

# ---- the wordmark ---------------------------------------------------
# The one colour the supplied artwork has that the product did not.
# "PotatoFarm" is a deep blue-black, sampled at #0E1822 off the flat
# interior of the thick strokes with blue leading red by eleven points
# - a decision rather than compression noise. The shipped value is
# lifted a little off that reading because a JPEG darkens stroke cores.
#
# It dresses the wordmark and nothing else. `--ink` stays neutral: a
# logo is not a reason to recolour every heading and table in a CRM.
NAVY     = "#12202E"   # 14.88:1 on the ground
NAVY_REV = "#F5F3F0"   # the same word on charcoal, where navy vanishes
TLD      = "#FF5A00"   # the ".io" - the brand orange, Option 1

# Four stops, not three. The artwork's light falls from the upper left
# and turns over into shadow across the lower right, and three stops put
# that turn in the wrong place - either the middle stayed pale to
# halfway down or the shadow climbed into the face.
RIM_STOPS = (f'<stop offset="0" stop-color="{RIM_HIGH}"/>'
             f'<stop offset="1" stop-color="{RIM_LOW}"/>')

STOPS = (f'<stop offset="0" stop-color="{G_HIGH}"/>'
         f'<stop offset="0.42" stop-color="{G_MID}"/>'
         f'<stop offset="0.72" stop-color="{G_WARM}"/>'
         f'<stop offset="1" stop-color="{G_LOW}"/>')

# ---- the face -------------------------------------------------------
# Ellipses, and bigger than they were.
#
# Measured off the artwork as a fraction of the body box: each eye is
# about 13% of the width and 15% of the height, centred at 36% and 67%
# across and 48% down. The previous eyes were 12.6% x 14.2% at 38.5% and
# 67.6%, which is close in size and too close together, and they sat
# 46% down rather than 48%.
#
# The ratio matters more than the size. At roughly 1.4 tall to wide they
# stay oval at 16px; pushed nearer 2.2, as an earlier version was, they
# collapse into two dashes and the face loses its expression in the
# favicon - which is the one place this mark is seen most often.
def eyes(p=""):
    return (f'<ellipse cx="26.2" cy="31.4" rx="3.1" ry="4.4" fill="{EYE}"/>'
            f'<ellipse cx="40.4" cy="31.4" rx="3.1" ry="4.4" fill="{EYE}"/>')


def crescent(x0, y0, x1, y1, outer, inner):
    """A tapered crease: two arcs on the same two endpoints.

    Every crease in the artwork is thick in the body and comes to a
    point at each end. SVG has no variable-width stroke, and a uniform
    round-capped stroke - which is what this file used to draw - reads
    as a drawn-on line rather than as a dent in a surface.

    Two quadratic arcs sharing endpoints give the taper for free: the
    shape is `outer - inner` thick at the middle and zero at both ends.
    `outer` and `inner` are signed distances along the left-hand normal,
    so the sign decides which way the crease bows - which is the
    difference between this mark's downturned mouth and a smile.
    """
    dx, dy = x1 - x0, y1 - y0
    L = (dx * dx + dy * dy) ** 0.5
    nx, ny = -dy / L, dx / L
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    return (f'M{x0:.1f},{y0:.1f} '
            f'Q{mx + nx * outer * 2:.1f},{my + ny * outer * 2:.1f} {x1:.1f},{y1:.1f} '
            f'Q{mx + nx * inner * 2:.1f},{my + ny * inner * 2:.1f} {x0:.1f},{y0:.1f} Z')


# The mouth turns **down**, and the mark this replaces smiled.
#
# That was not a stylistic drift, it was the wrong shape: the old path
# swept from lower-left up through a dip and back, which is a grin. The
# artwork has a short crescent below and left of centre whose ends point
# down. It is the single feature that decides whether this reads as the
# supplied character or as a generic smiley, so it is drawn from the
# measured endpoints rather than by eye: (21.9,50.4) to (29.3,52.6) in
# the body box, bowing up.
MOUTH = (f'<path d="{crescent(21.9, 50.4, 29.3, 52.6, -2.4, -1.15)}" '
         f'fill="{CREASE}" opacity="0.9"/>')

# The long cheek crease on the lower right, at the top edge of the
# shading lobe. Thick, and much longer than the mouth - it is what gives
# the lower half of the body its turn.
CHEEK = (f'<path d="{crescent(40.2, 47.4, 51.6, 40.2, -2.6, -1.0)}" '
         f'fill="{CREASE}" opacity="0.72"/>')

# Surface marks. Asymmetric, because a symmetrical potato reads as a
# logo of a potato rather than a potato. Two dashes and two dots, each
# measured off the artwork the same way.
MARKS = (f'<path d="{crescent(26.0, 11.7, 32.9, 10.4, -1.5, -0.55)}" '
         f'fill="{CREASE}" opacity="0.85"/>'
         f'<path d="{crescent(16.8, 38.6, 22.0, 39.1, -1.1, -0.4)}" '
         f'fill="{CREASE}" opacity="0.8"/>'
         f'<ellipse cx="44.7" cy="17.6" rx="0.75" ry="0.95" fill="{CREASE}" opacity="0.7"/>'
         f'<ellipse cx="47.6" cy="51.1" rx="0.85" ry="1.05" fill="{CREASE}" opacity="0.5"/>')

FACE = eyes() + MOUTH + CHEEK + MARKS

# ---- the modelling --------------------------------------------------
# Everything inside the silhouette that is not the face, clipped to the
# body so nothing can spill past the rim.
#
# Three layers, and they are the reason the flat version looked like a
# sticker: a broad soft shadow over the lower right, the diffuse sheen
# on the upper left, and a hard specular crescent riding the upper-left
# edge. The first two are blurred; the third is not, because a blurred
# specular is just more sheen.
def modelling(pfx: str) -> str:
    return (
        f'<g clip-path="url(#cp{pfx})">'
        f'<ellipse cx="46" cy="52" rx="22" ry="18" fill="{SHADE}" opacity="0.5" '
        f'filter="url(#sd{pfx})"/>'
        f'<ellipse cx="24" cy="18" rx="16" ry="17" fill="#FFFFFF" opacity="0.28" '
        f'filter="url(#bl{pfx})"/>'
        f'<path d="{crescent(14.6, 27.0, 27.0, 6.2, -2.4, -0.8)}" fill="{GLOSS}" '
        f'opacity="0.45" filter="url(#sp{pfx})"/>'
        f'</g>'
    )


def svg(pfx: str, extra_g: str = "", size: str = "") -> str:
    """A standalone mark. `pfx` keeps ids unique when several are inlined."""
    return (
        f'<defs>'
        f'<linearGradient id="sh{pfx}" x1="18%" y1="6%" x2="88%" y2="96%">{STOPS}</linearGradient>'
        f'<linearGradient id="rm{pfx}" x1="18%" y1="6%" x2="88%" y2="96%">{RIM_STOPS}</linearGradient>'
        f'<filter id="bl{pfx}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter><filter id="sd{pfx}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter><filter id="sp{pfx}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.1"/></filter>'
        f'<filter id="dp{pfx}" x="-35%" y="-35%" width="180%" height="180%">'
        f'<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="{RIM}" flood-opacity="0.22"/></filter>'
        f'<clipPath id="cp{pfx}"><path d="{BODY}"/></clipPath>'
        f'</defs>'
        f'<path d="{BODY}" fill="url(#sh{pfx})" stroke="url(#rm{pfx})" stroke-width="1.15" '
        f'stroke-linejoin="round" filter="url(#dp{pfx})"/>'
        + modelling(pfx)
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
        f'<linearGradient id="sh{pfx}" x1="18%" y1="6%" x2="88%" y2="96%">{STOPS}</linearGradient>'
        f'<linearGradient id="rm{pfx}" x1="18%" y1="6%" x2="88%" y2="96%">{RIM_STOPS}</linearGradient>'
        # Three radii, not one. A single blur gives either a smudge with
        # no hot edge or a hard edge with no spill; the reference has
        # both, so it is built as three passes at 22 / 11 / 4.
        f'<filter id="ga{pfx}" x="-150%" y="-150%" width="400%" height="400%">'
        f'<feGaussianBlur stdDeviation="22"/></filter>'
        f'<filter id="gb{pfx}" x="-120%" y="-120%" width="340%" height="340%">'
        f'<feGaussianBlur stdDeviation="11"/></filter>'
        f'<filter id="gc{pfx}" x="-60%" y="-60%" width="220%" height="220%">'
        f'<feGaussianBlur stdDeviation="4"/></filter>'
        f'<filter id="bl{pfx}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter><filter id="sd{pfx}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter><filter id="sp{pfx}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.1"/></filter>'
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
        f'<path d="{BODY}" fill="url(#sh{pfx})" stroke="url(#rm{pfx})" stroke-width="1.15" '
        f'stroke-linejoin="round"/>'
        + modelling(pfx)
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



# ---- the native mark ------------------------------------------------
# React Native cannot import an SVG file, so `mobile/components/
# wordmark.tsx` rebuilds the mark out of `react-native-svg` components
# against theme tokens. That put it outside the propagator's reach for
# three generations of artwork — see the comment at the top of that
# file for what it was carrying by the end.
#
# So the geometry is generated into it, between markers, and the
# colours come from `mobile/lib/theme.ts`, whose values mirror the ones
# above. Nothing in that file is hand-maintained any more.
def native_block() -> str:
    eyes = "[26.2, 31.4, 3.1, 4.4], [40.4, 31.4, 3.1, 4.4]"
    creases = ",\n".join(
        f'  ["{d}", {o}]' for d, o in [
            (crescent(21.9, 50.4, 29.3, 52.6, -2.4, -1.15), 0.9),
            (crescent(40.2, 47.4, 51.6, 40.2, -2.6, -1.0), 0.72),
            (crescent(26.0, 11.7, 32.9, 10.4, -1.5, -0.55), 0.85),
            (crescent(16.8, 38.6, 22.0, 39.1, -1.1, -0.4), 0.8),
        ])
    return (
        "\nconst BODY =\n  \"" + BODY + "\";\n\n"
        "/** cx, cy, rx, ry. */\n"
        "const EYES: [number, number, number, number][] = [\n"
        f"  {eyes},\n];\n\n"
        "/** d, opacity — the mouth, the cheek line and two surface dashes. */\n"
        "const CREASES: [string, number][] = [\n" + creases + ",\n];\n\n"
        "/** cx, cy, rx, ry, opacity. */\n"
        "const DOTS: [number, number, number, number, number][] = [\n"
        "  [44.7, 17.6, 0.75, 0.95, 0.7],\n"
        "  [47.6, 51.1, 0.85, 1.05, 0.5],\n];\n"
    )


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
    # The face is counted, not enumerated.
    #
    # This used to spell out the exact run the face happened to be —
    # three paths then two ellipses — which meant the propagator could
    # only find a face with the number of features it was about to
    # write. Adding the fourth crease would have matched nothing on the
    # second run and reported success, which is the failure the comment
    # above this one already describes once. Anything self-closing in
    # the five-to-eight range after the eyes is the face; the lockups
    # continue with `</g>` or `<text>`, neither of which is in the
    # alternation, so it cannot run past the end of the mark.
    shape = r'(?:<path [^/]*/>|<ellipse [^/]*/>)'
    block = re.compile(
        r'<defs><linearGradient id="sh[\w-]*".*?</defs>'
        r'\s*<path d="M[^"]*"[^/]*/>'
        r'\s*<g clip-?[Pp]ath="url\(#cp[^)]*\)">.*?</g>'
        r'\s*' + eye + eye + shape + r'{5,8}', re.S)
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

    # The native mark, between its markers. Counted like any other
    # instance, so a file that stops matching stops being reported as
    # updated rather than silently doing nothing.
    native_re = re.compile(
        r'(/\* MARK:BEGIN[^\n]*\*/\n).*?(/\* MARK:END \*/)', re.S)

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
        n = (len(block.findall(s)) + len(word_re.findall(s))
             + len(tld_re.findall(s)) + len(native_re.findall(s)))
        if not n:
            continue
        def sub(m, _f=f):
            p = pfx_re.search(m.group(0))
            b = svg(p.group(1) if p else "m")
            return _jsx(b) if _f.endswith((".tsx", ".jsx")) else b
        s = block.sub(sub, s)
        s = word_re.sub(_reword, s)
        s = native_re.sub(
            lambda m: m.group(1) + native_block() + m.group(2), s)
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
