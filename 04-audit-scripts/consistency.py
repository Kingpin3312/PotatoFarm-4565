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

SURFACES = {
    "website":   ["potato-launch/assets/site.css"],
    "dashboard": ["potato-design-v4/dashboard-v4.html"],
    "marketing": ["potato-design-v4/homepage-v4.html"],
    "mobile":    ["potato-crm/preview-mobile.html"],
}

def read(paths):
    out = ""
    for p in paths:
        if not os.path.exists(p): continue
        s = open(p).read()
        if p.endswith(".html"):
            for m in re.finditer(r'<style>(.*?)</style>', s, re.S):
                out += m.group(1) + "\n"
        else:
            out += s + "\n"
    return out

css = {k: read(v) for k, v in SURFACES.items()}
FAILS, NOTES = [], []

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
    ("potato-launch/index.html",                      r'PotatoFarm(\s*)<span class="tld"'),
    ("potato-crm/src/components/layout/shell.tsx",    r'PotatoFarm(\s*)<span'),
    ("potato-crm/mobile/components/wordmark.tsx",     r'PotatoFarm(\s*)<Text'),
    ("potato-crm/preview-mobile.html",                r'PotatoFarm(\s*)<i>'),
    ("potato-logo/lockup.svg",                        r'PotatoFarm(\s*)<tspan'),
    ("potato-design-v4/dashboard-v4.html",            r'PotatoFarm(\s*)<span'),
    ("potato-design-v4/homepage-v4.html",             r'PotatoFarm(\s*)<span'),
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
# So anything heading-shaped must resolve to --ink. The four state
# exceptions are named, so an exception is a decision rather than
# something that slipped through.
print("\nHierarchy colour (one ink for hierarchy):")
STATE_OK = {".delta", ".stat .d", ".allow-pct", ".tight", ".tabs a.on", ".b.hot", ".need.urgent"}
HEAD = re.compile(r'font-size:\s*(?:clamp\([^)]*\)|[\d.]+rem|var\(--(?:display|h1|h2|h3|stat|h2-sm)\)|\d\d+px)')
for label, path in (("website","potato-launch/assets/site.css"),
                    ("marketing","potato-design-v4/homepage-v4.html"),
                    ("dashboard","potato-design-v4/dashboard-v4.html"),
                    ("mobile","potato-crm/preview-mobile.html")):
    if not os.path.exists(path): continue
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
        if not c or c.group(1).startswith("--ink") or c.group(1) == "--on-accent":
            continue
        if sel in STATE_OK: continue
        if HEAD.search(decl) or re.match(r"^(h1|h2|h3)\b", sel):
            bad.append(f"{sel}={c.group(1)}")
    print(f"  {label:11} {'ok' if not bad else ', '.join(bad[:3])}")
    if bad:
        FAILS.append(f"{label}: heading-shaped rules not on --ink: {', '.join(bad[:3])}")

print("\nMark per surface:")
MARK_SURFACES = [
    "potato-launch/index.html",
    "potato-design-v4/homepage-v4.html",
    "potato-design-v4/dashboard-v4.html",
    "potato-crm/preview-mobile.html",
    "potato-crm/src/components/layout/shell.tsx",
    "potato-crm/mobile/components/wordmark.tsx",
    "potato-logo/lockup.svg",
]
POTATO = "M33,4 C42,4.5"   # the upright teardrop
for path in MARK_SURFACES:
    if not os.path.exists(path): continue
    body = open(path).read()
    has_potato = POTATO in body
    has_chip = bool(re.search(r'>PF</(?:i|span|Text)>', body))
    state = "potato" if (has_potato and not has_chip) else ("PF CHIP" if has_chip else "no mark")
    print(f"  {os.path.basename(path):26} {state}")
    if state != "potato":
        FAILS.append(f"{os.path.basename(path)}: mark is '{state}', not the potato")

print("\nWordmark structure:")
for path in ("potato-launch/assets/site.css",
             "potato-design-v4/homepage-v4.html",
             "potato-design-v4/dashboard-v4.html"):
    if not os.path.exists(path): continue
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
    if not os.path.exists(path): continue
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
