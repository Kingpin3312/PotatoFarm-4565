#!/usr/bin/env python3
"""
Cross-surface consistency audit.

Every other check in this project looks at one surface at a time. This
one asks the question a client asks: **does it look like one company
made all of this?**

It compares the values that a person actually perceives — the size of
the mark, the width of the page, the height of the header, the corner
radii, the type steps — across the website, the CRM and the mobile app.
"""
import glob, os, re, sys
from collections import defaultdict

# ---------------------------------------------------------------------
# Paths, and why a missing one is now a failure.
#
# Every path in this file used to name a folder that does not exist —
# `potato-launch/`, `potato-crm/`, `potato-design-v4/`, `potato-logo/`.
# The repository has been `01-…` through `06-…` for a long time.
#
# Every read was guarded with `if not os.path.exists(path): continue`,
# so the script found nothing, compared nothing, and printed
# "0 INCONSISTENCY(S)" with an exit code of 0. It was the only green in
# the suite that meant *nothing had been looked at*.
#
# That is precisely the failure this product exists to catch: not an
# error, an absence. So the paths are corrected below, and a surface
# that cannot be found is a failure rather than a skip. A check that
# cannot find its inputs must say so.
# ---------------------------------------------------------------------
ROOT = sys.argv[1] if len(sys.argv) > 1 else "."

APP      = "02-the-project/app"
SITE     = "02-the-project/website"
DESIGN   = "03-brand/design-system"
LOGO     = "03-brand/logo"

def at(rel):
    return os.path.join(ROOT, rel)

SURFACES = {
    "website":   [at(f"{SITE}/assets/site.css")],
    "dashboard": [at(f"{DESIGN}/dashboard-v4.html")],
    "marketing": [at(f"{DESIGN}/homepage-v4.html")],
    "mobile":    [at(f"{APP}/preview-mobile.html")],
}

FAILS, NOTES = [], []

def require(path):
    """
    True if the file is there. Records a failure if it is not.

    `preview-mobile.html` is generated and git-ignored, so it is the one
    surface allowed to be absent — it is a note, not a failure.
    """
    if os.path.exists(path):
        return True
    if path.endswith("preview-mobile.html"):
        NOTES.append(f"{os.path.basename(path)} not generated — that surface was not checked")
    else:
        FAILS.append(f"surface missing: {os.path.relpath(path, ROOT)} — this check read nothing")
    return False

def read(paths):
    out = ""
    for p in paths:
        if not require(p): continue
        s = open(p).read()
        if p.endswith(".html"):
            for m in re.finditer(r'<style>(.*?)</style>', s, re.S):
                out += m.group(1) + "\n"
        else:
            out += s + "\n"
    return out

css = {k: read(v) for k, v in SURFACES.items()}

def grab(body, pattern, label):
    """First match, or None. Guards against a pattern with no capture
    group — one of these crashed the whole run, and a check that reports
    nothing is worse than one that reports wrongly."""
    m = re.search(pattern, body)
    if not m or not m.groups(): return None
    return m.group(1)

CHECKS = [
    ("brand mark size",   r'\.(?:top|brand|side \.brand)?\s*svg\{width:(\d+)px', "px"),
    ("page max-width",    r'\.wrap\{max-width:(\d+)px', "px"),
    ("header height",     r'(?:^nav|\.top)\{[^}]*height:(\d+)px', "px"),
    ("primary btn height",r'\.(?:btn|acts a|go)[^{]*\{[^}]*min-height:(\d+)px', "px"),
]

print("What a person actually perceives, per surface:\n")
rows = defaultdict(dict)
for name, pat, unit in CHECKS:
    for surf, body in css.items():
        rows[name][surf] = grab(body, pat, name)

for name in rows:
    vals = {s: v for s, v in rows[name].items() if v}
    if not vals: continue
    uniq = set(vals.values())
    flag = "  <-- INCONSISTENT" if len(uniq) > 1 else ""
    print(f"  {name:22} " + "  ".join(f"{s}:{v}" for s, v in vals.items()) + flag)
    if len(uniq) > 1:
        FAILS.append(f"{name} differs across surfaces: " +
                     ", ".join(f"{s}={v}" for s, v in vals.items()))

# ---------------------------------------------------------------------
# The token VALUES, not the token names.
#
# Everything above compares surfaces by the name of the variable — every
# surface says `background:var(--ground)`, so every surface agrees. That
# is not the question. The question is what `--ground` resolves to, and
# the palette is declared four separate times: the app's tokens.css, the
# website's site.css, and inline in each of the two design-system
# reference pages. Four hand-maintained copies of the same twenty
# numbers.
#
# One had already drifted and nothing could see it. A stale
# `03-brand/design-system/tokens.css` carried ground `#F8F7F4` and
# accent `#FF6E00` against the product's `#F4F3F0` and the brand orange — a
# different orange, in the folder a designer opens first.
#
# So: compare the hexes. This is the check that makes "tokens.css is the
# only source of truth" enforceable rather than an instruction in a
# document.
# ---------------------------------------------------------------------
TOKEN_SOURCES = {
    "app":       at(f"{APP}/src/styles/tokens.css"),
    "website":   at(f"{SITE}/assets/site.css"),
    "marketing": at(f"{DESIGN}/homepage-v4.html"),
    "dashboard": at(f"{DESIGN}/dashboard-v4.html"),
}

# The ones a person perceives. Not every token — the leather/dark set is
# redefined per surface on purpose and comparing it would be noise.
SHARED_TOKENS = ("ground", "panel", "raised", "ink", "ink-2", "ink-3",
                 "rule", "accent", "accent-type", "accent-hover", "accent-edge")

print("\nPalette values (the same hex on every surface):")
declared = {}
for surf, path in TOKEN_SOURCES.items():
    if not require(path): continue
    body = open(path).read()
    # First declaration wins: the dark-mode block later in the file
    # redefines several of these deliberately.
    for tok in SHARED_TOKENS:
        m = re.search(rf'--{re.escape(tok)}:\s*(#[0-9A-Fa-f]{{6}})', body)
        if m: declared.setdefault(tok, {})[surf] = m.group(1).upper()

for tok in SHARED_TOKENS:
    vals = declared.get(tok, {})
    if len(vals) < 2: continue
    uniq = set(vals.values())
    if len(uniq) == 1:
        print(f"  --{tok:14} {next(iter(uniq))}")
    else:
        print(f"  --{tok:14} " + "  ".join(f"{s}:{v}" for s, v in vals.items()) + "  <-- DRIFT")
        FAILS.append(f"--{tok} differs between surfaces: " +
                     ", ".join(f"{s}={v}" for s, v in vals.items()))

# Grounds. The client's specific complaint.
print("\nGround per surface:")
for surf, body in css.items():
    m = re.search(r'body\{background:var\((--[\w-]+)\)', body) or \
        re.search(r'\.phone\{[^}]*background:var\((--[\w-]+)\)', body) or \
        re.search(r'body\{background:(#[0-9A-Fa-f]{6})', body)
    print(f"  {surf:12} {m.group(1) if m else '(not declared in this file)'}")

# Type scale drift.
print("\nType steps defined per surface:")
for surf, body in css.items():
    steps = sorted(set(re.findall(r'--(?:body|small|caption|micro|h1|h2|h3|display|stat):\s*([\d.]+rem)', body)))
    print(f"  {surf:12} {len(steps)} steps  {', '.join(steps[:8]) or '(inherits)'}")

# The wordmark, byte for byte.
#
# JSX collapses the whitespace around a newline or a comment into a real
# space, so a lockup written across several lines for readability
# renders "PotatoFarm .io". It is invisible in review and obvious on
# screen, and it shipped on one surface out of seven.
import glob as _g
WORDMARK = [
    (at(f"{SITE}/index.html"),                      r'PotatoFarm(\s*)<span class="tld"'),
    # The app's lockup moved out of the shell into one component, so
    # every screen — including the five public ones that had no logo at
    # all — renders the same markup. The shell no longer contains a
    # wordmark, so checking it here would check nothing.
    (at(f"{APP}/src/components/brand/logo.tsx"),      r'PotatoFarm(\s*)<span'),
    (at(f"{APP}/mobile/components/wordmark.tsx"),     r'PotatoFarm(\s*)<Text'),
    (at(f"{APP}/preview-mobile.html"),                r'PotatoFarm(\s*)<i>'),
    (at(f"{LOGO}/lockup.svg"),                        r'PotatoFarm(\s*)<tspan'),
    (at(f"{DESIGN}/dashboard-v4.html"),            r'PotatoFarm(\s*)<span'),
    (at(f"{DESIGN}/homepage-v4.html"),             r'PotatoFarm(\s*)<span'),
]
# The wordmark must be ONE inline element, not two flex children.
# Source whitespace was clean and the browser still drew a gap, because
# `.brand{display:flex}` made "PotatoFarm" and ".io" separate boxes.
# One mark, on every surface.
#
# The potato replaced a "PF" chip placeholder, and the replacement was
# applied surface by surface as each was touched. Three were still on
# the chip a week later — including the mobile app's own wordmark
# component, which nobody had opened since.
# Headings, titles and button labels share one hex.
#
# The rule underneath it: **colour carries state, not hierarchy.** A
# heading, a price or a step number is hierarchy — that is size, weight
# and space, never hue. A green delta or a warning percentage is state,
# and taking its colour away takes the meaning with it.
#
# So anything heading-shaped must resolve to --ink, **or** to
# --accent-type, which headings now take by brand decision (#FF6B35).
#
# The premise moved but the rule did not lose its job. What it enforces
# is that hierarchy uses ONE colour across every surface: it caught the
# website going orange while the two design-system pages stayed on ink,
# which is exactly the drift it exists for. Any other accent on a
# heading-shaped rule is still a failure, and the four state exceptions
# below are still named individually.
print("\nHierarchy colour (one ink for hierarchy):")
STATE_OK = {".delta", ".stat .d", ".allow-pct", ".tight", ".tabs a.on", ".b.hot", ".need.urgent",
            # The demo form's per-field error. State, not hierarchy, and
            # the clearest case in the set: it is red *and* it says
            # "Include the country code" — the colour is the second
            # signal, never the only one.
            #
            # It is listed here rather than fixed in HEAD because HEAD's
            # `[\d.]+rem` branch treats every rem font-size as
            # heading-shaped, and .dform-err is .8125rem — 13px, the
            # smallest caption in the scale. Tightening that regex would
            # quietly weaken a check that has caught real drift, so the
            # allowlist takes it, which is what the allowlist is for: an
            # exception that is a decision rather than something that
            # slipped through.
            ".dform-err"}
HEAD = re.compile(r'font-size:\s*(?:clamp\([^)]*\)|[\d.]+rem|var\(--(?:display|h1|h2|h3|stat|h2-sm)\)|\d\d+px)')
for label, path in (("website",at(f"{SITE}/assets/site.css")),
                    ("marketing",at(f"{DESIGN}/homepage-v4.html")),
                    ("dashboard",at(f"{DESIGN}/dashboard-v4.html")),
                    ("mobile",at(f"{APP}/preview-mobile.html"))):
    if not require(path): continue
    raw = open(path).read()
    sheet = ("\n".join(m.group(1) for m in re.finditer(r"<style>(.*?)</style>", raw, re.S))
             if path.endswith(".html") else raw)
    bad = []
    for m in re.finditer(r"([^{}]+)\{([^}]*)\}", sheet):
        sel = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S).strip().split("\n")[-1].strip()
        decl = m.group(2)
        c = re.search(r"(?<![\w-])color:\s*var\((--[\w-]+)\)", decl)
        # The whole neutral scale is fine — --ink-2 is body copy and
        # --ink-3 is a caption, and a font-size declaration does not
        # make them headings. The rule is about ACCENT colour on
        # hierarchy, not about every text rule in the sheet.
        # --accent-type is the brand's heading colour now. Everything
        # else accent-coloured on a heading is still drift.
        if (not c or c.group(1).startswith("--ink")
                or c.group(1) in ("--on-accent", "--accent-type")):
            continue
        if sel in STATE_OK: continue
        if HEAD.search(decl) or re.match(r"^(h1|h2|h3)\b", sel):
            bad.append(f"{sel}={c.group(1)}")
    print(f"  {label:11} {'ok' if not bad else ', '.join(bad[:3])}")
    if bad:
        FAILS.append(f"{label}: heading-shaped rules not on --ink: {', '.join(bad[:3])}")

print("\nMark per surface:")
MARK_SURFACES = [
    at(f"{SITE}/index.html"),
    at(f"{DESIGN}/homepage-v4.html"),
    at(f"{DESIGN}/dashboard-v4.html"),
    at(f"{APP}/preview-mobile.html"),
    at(f"{APP}/src/components/brand/logo.tsx"),
    at(f"{APP}/mobile/components/wordmark.tsx"),
    at(f"{LOGO}/lockup.svg"),
]
# The first eleven characters of the body path, which is generated from
# one definition and pasted into seven surfaces. Changing the mark means
# changing this line — deliberately, so a redraw cannot land on six
# surfaces and miss the seventh, which is exactly what this caught when
# the new artwork went in.
# The first path point of the mark, which is the cheapest reliable
# fingerprint for "this is the current potato". It has moved twice now —
# the tapered second artwork began "M31.8,3.2", and the rounder third
# begins here.
#
# When it moves again, this line moves with it, and that is the point:
# the check exists so a surface that gets missed fails the build rather
# than quietly becoming a second logo. It earned that this time —
# `mark.py --apply` reported success while leaving ten files on the old
# mark, and this is what caught them.
POTATO = "M32.6,3.0"   # the rounder potato, third artwork
for path in MARK_SURFACES:
    if not require(path): continue
    body = open(path).read()
    has_potato = POTATO in body
    has_chip = bool(re.search(r'>PF</(?:i|span|Text)>', body))
    state = "potato" if (has_potato and not has_chip) else ("PF CHIP" if has_chip else "no mark")
    print(f"  {os.path.basename(path):26} {state}")
    if state != "potato":
        FAILS.append(f"{os.path.basename(path)}: mark is '{state}', not the potato")

print("\nWordmark structure:")
for path in (at(f"{SITE}/assets/site.css"),
             at(f"{DESIGN}/homepage-v4.html"),
             at(f"{DESIGN}/dashboard-v4.html")):
    if not require(path): continue
    body = open(path).read()
    m = re.search(r'\.brand\{([^}]*)\}', body)
    if not m: continue
    is_flex = "display:flex" in m.group(1)
    has_word = ".brand .word{" in body or ".word{" in body
    state = "ok" if (not is_flex or has_word) else "FLEX WITHOUT .word WRAPPER"
    print(f"  {os.path.basename(path):26} {state}")
    if state != "ok":
        FAILS.append(f"{os.path.basename(path)}: .brand is display:flex and the wordmark is "
                     f"not wrapped — the name and .io become separate flex items and render "
                     f"with a gap")

print("\nWordmark spacing:")
for path, pat in WORDMARK:
    if not require(path): continue
    m = re.search(pat, open(path).read(), re.S)
    if not m: continue
    ws = m.group(1)
    print(f"  {os.path.basename(path):26} {'clean' if ws == '' else repr(ws)}")
    if ws != "":
        FAILS.append(f"{os.path.basename(path)}: whitespace between PotatoFarm and .io "
                     f"— renders as \"PotatoFarm .io\"")


if __name__ == "__main__":
    print(f"\n{'='*62}\n{len(FAILS)} INCONSISTENCY(S)\n{'='*62}")
    for f in FAILS: print(f"  x {f}")
    sys.exit(1 if FAILS else 0)
