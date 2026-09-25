#!/usr/bin/env python3
"""
Move every surface to the current brand palette, in one pass.

The palette is declared in more than one place — it has to be, because
the website has no build step, the design-system pages have to open
without one, and React Native has no custom properties. `consistency.py`
fails on drift between them, which catches the problem after the fact;
this is what makes them agree in the first place.

    python3 03-brand/repalette.py          # report what would change
    python3 03-brand/repalette.py --apply

Idempotent: running it twice changes nothing, which is how you can tell
it worked.

## Why it sets tokens by name, not hex by hex

The previous version mapped old hex to new hex, and that was right while
every move kept the same polarity. This one does not: the ground goes
from white to grey and the ink from black to near-white. `#FFFFFF` was
both the ground *and* the label on an accent button, and a hex map
cannot tell them apart — it would have painted every button label grey.
So each token is set by its own name, the darker band's overrides by
theirs, and the only literal replacements left are colours that live
outside a token (a shadow, a manifest, a meta tag, an email button).

## The palette — neon pink on grey

    --ground  #292C32   the brief's grey, the dominant background
    --accent  #FF1493   the brief's neon pink, everywhere, exactly

Everything else is derived from the grey, as the brief asks: a darker
step for the navigation band, lighter steps for panels and cards, subtle
rules, near-white ink and a muted light grey for secondary text. The one
tint of the pink (`--accent-soft`) is the pink mixed 14% into the ground,
for selected rows — a derivation, not a second colour.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

PINK = "#FF1493"
GREY = "#292C32"

# First declaration of each token in a file: the page's own palette.
TOKENS = {
    "ground": GREY,
    "panel": "#2F3238",
    "raised": "#33373E",
    "ink": "#F3F4F6",
    "ink-2": "#C9CCD2",
    "ink-3": "#A0A5AE",
    "rule": "#3D4148",
    "rule-strong": "#7D828C",
    "accent": PINK,
    "accent-type": PINK,
    "accent-hover": PINK,
    "accent-edge": PINK,
    "accent-deep": PINK,
    "accent-soft": "#472940",
    "on-accent": "#FFFFFF",
    "brand-navy": "#F3F4F6",
    "brand-navy-ink": "#F3F4F6",
    "brand-orange": PINK,
    "leather": "#25282D",
    "leather-deep": "#1F2126",
    "leather-ink": "#F3F4F6",
    "leather-ink-2": "#C9CCD2",
    "leather-ink-3": "#A0A5AE",
    "success": "#F3F4F6",
    "danger": PINK,
    "warning": PINK,
}

# Later declarations of the same token: the darker band (`.on-leather`),
# which redefines a few for its own ground.
LATER = {
    "rule": "#373A41",
}

CSS_TOKEN_FILES = [
    "02-the-project/app/src/styles/tokens.css",
    "02-the-project/website/assets/site.css",
    "02-the-project/app/preview-mobile.html",
    "03-brand/design-system/dashboard-v4.html",
    "03-brand/design-system/homepage-v4.html",
]

# The native palette, by key. `light` is the default theme and `dark`
# the darker band, mirroring the two sets above.
NATIVE = "02-the-project/app/mobile/lib/theme.ts"
NATIVE_KEYS = {
    "light": {
        "ground": GREY, "sunk": "#2F3238", "raised": "#33373E",
        "ink": "#F3F4F6", "ink2": "#C9CCD2", "ink3": "#A0A5AE", "rule": "#3D4148",
        "accent": PINK, "accentHover": PINK, "accentEdge": PINK, "accentType": PINK,
        "onAccent": "#FFFFFF", "brandNavy": "#F3F4F6", "tld": PINK,
        "leather": "#25282D", "leatherDeep": "#1F2126",
        "danger": PINK, "success": "#F3F4F6", "warning": PINK,
    },
    "dark": {
        "ground": "#1F2126", "sunk": "#25282D", "raised": "#25282D",
        "ink": "#F3F4F6", "ink2": "#C9CCD2", "ink3": "#A0A5AE", "rule": "#373A41",
        "accent": PINK, "accentHover": PINK, "accentEdge": PINK, "accentType": PINK,
        "onAccent": "#FFFFFF", "brandNavy": "#F3F4F6", "tld": PINK,
        "leather": "#25282D", "leatherDeep": "#1F2126",
        "danger": PINK, "success": "#F3F4F6", "warning": PINK,
    },
}

# Colour that lives outside a token.
LITERALS = [
    # The focus ring, in rgb() because it carries an alpha.
    ("rgb(255 90 0 / .40)", "rgb(255 20 147 / .45)"),
    # Shadows. They were a warm brown tint tuned for a white page, where a
    # grey shadow looks like dirt; on a grey page a shadow is black, and
    # it has to be stronger to read at all.
    ("rgb(43 30 23 / .05)", "rgb(0 0 0 / .20)"),
    ("rgb(43 30 23 / .06)", "rgb(0 0 0 / .26)"),
    ("rgb(43 30 23 / .07)", "rgb(0 0 0 / .26)"),
    ("rgb(43 30 23 / .13)", "rgb(0 0 0 / .34)"),
    ("rgb(43 30 23 / .18)", "rgb(0 0 0 / .40)"),
    # The browser chrome around the page, which must equal the ground.
    ('<meta name="theme-color" content="#FFFFFF">', f'<meta name="theme-color" content="{GREY}">'),
    ('"theme_color": "#FFFFFF"', f'"theme_color": "{GREY}"'),
    ('"background_color": "#FFFFFF"', f'"background_color": "{GREY}"'),
    ('themeColor: "#FFFFFF"', f'themeColor: "{GREY}"'),
    # The accent wherever it is written as a literal: the email button,
    # the `.io` in the logo lockups and the files that render them.
    ("#FF5A00", PINK),
]

LITERAL_FILES = [
    "02-the-project/app/src/styles/tokens.css",
    "02-the-project/app/src/styles/globals.css",
    "02-the-project/app/src/app/layout.tsx",
    "02-the-project/app/src/server/lib/mail.ts",
    "02-the-project/app/src/components/brand/logo.tsx",
    "02-the-project/app/public/site.webmanifest",
    "02-the-project/website/site.webmanifest",
    "02-the-project/website/assets/site.css",
    "02-the-project/app/preview-mobile.html",
    "02-the-project/app/mobile/components/wordmark.tsx",
    "03-brand/design-system/dashboard-v4.html",
    "03-brand/design-system/homepage-v4.html",
    "03-brand/logo/mark.py",
    "03-brand/logo/build.mjs",
] + [str(p.relative_to(ROOT)) for p in sorted((ROOT / "02-the-project/website").glob("*.html"))] \
  + [str(p.relative_to(ROOT)) for p in sorted((ROOT / "03-brand/logo").glob("*.svg"))]

TOKEN_RE = re.compile(
    r"(--(?P<name>[a-z0-9-]+):\s*)(?P<val>#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3})(?P<end>\s*;)"
    # A ratio in a trailing comment was measured against the old ground;
    # it goes with the value rather than surviving as a false claim.
    r"(?P<note>[ \t]*/\*[^\n]*?\d\.\d\d:1[^\n]*?\*/)?"
)


def set_tokens(text):
    seen, hits = set(), 0

    def sub(m):
        nonlocal hits
        name = m.group("name")
        if name not in TOKENS:
            return m.group(0)
        new = LATER.get(name, TOKENS[name]) if name in seen else TOKENS[name]
        seen.add(name)
        out = f"{m.group(1)}{new}{m.group('end')}"
        if out != m.group(0):
            hits += 1
        return out

    return TOKEN_RE.sub(sub, text), hits


def set_native(text):
    hits = 0
    for block, keys in NATIVE_KEYS.items():
        start = text.find(f"export const {block} = {{")
        end = text.find("} as const;", start)
        if start < 0 or end < 0:
            raise SystemExit(f"{NATIVE}: no `{block}` palette found")
        body = text[start:end]
        for key, val in keys.items():
            body, n = re.subn(rf'(\b{key}:\s*")#[0-9A-Fa-f]{{6}}(")', rf"\g<1>{val}\g<2>", body)
            if n == 0:
                raise SystemExit(f"{NATIVE}: `{block}.{key}` not found")
            hits += n
        text = text[:start] + body + text[end:]
    return text, hits


apply = "--apply" in sys.argv
changes = {}


def stage(rel, fn):
    p = ROOT / rel
    if not p.exists():
        raise SystemExit(f"MISSING {rel} — a target that cannot be found is a failure, not a skip")
    before = changes.get(rel, p.read_text())
    after, n = fn(before)
    if after != before:
        changes[rel] = after


for rel in CSS_TOKEN_FILES:
    stage(rel, set_tokens)
stage(NATIVE, set_native)


def literals(text):
    n = 0
    for old, new in LITERALS:
        n += text.count(old)
        text = text.replace(old, new)
    return text, n


for rel in LITERAL_FILES:
    stage(rel, literals)

for rel in sorted(changes):
    print(f"  {'wrote ' if apply else 'would '} {rel}")
    if apply:
        (ROOT / rel).write_text(changes[rel])
print(f"\n{len(changes)} file(s){'' if apply else ' — run with --apply'}")

# Survivors. The previous accent anywhere it could be declared is the
# failure this script exists to stop, so look rather than trust.
if apply:
    stale = []
    for rel in set(CSS_TOKEN_FILES + LITERAL_FILES + [NATIVE]):
        text = (ROOT / rel).read_text()
        code = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        for old in ("#FF5A00", "rgb(255 90 0", "43 30 23"):
            if old.lower() in code.lower():
                stale.append(f"{rel}  {old}")
    if stale:
        print("\nSTALE VALUES REMAIN:")
        for s in stale:
            print(f"  x {s}")
        sys.exit(1)
    print("No old accent survives in any target.")
