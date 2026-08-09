#!/usr/bin/env python3
"""
Resolved contrast audit.

Every other colour check in this project measured tokens I chose by
hand. This one reads the stylesheet, finds rules that set **both** a
background and a text colour, resolves the tokens, and measures what
actually renders.

It exists because a palette swap remapped `color:var(--white)` to
`color:var(--raised)` — mechanically correct, and it produced white text
on a cream panel that no token-level check could see.
"""
import glob, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "potato-launch"
FAILS, WARNS = [], []

def lum(h):
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c*2 for c in h)
    c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    c = [x/12.92 if x <= .03928 else ((x+.055)/1.055)**2.4 for x in c]
    return .2126*c[0] + .7152*c[1] + .0722*c[2]

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return round((max(la, lb)+.05)/(min(la, lb)+.05), 2)


def selector(raw):
    """The actual selector, not the comment above it."""
    raw = re.sub(r'/\*.*?\*/', '', raw, flags=re.S)      # drop comments
    raw = raw.strip().split("\n")[-1]                     # last line only
    return " ".join(raw.split())[:52] or "(unknown)"

css = "\n".join(open(p).read() for p in glob.glob(f"{ROOT}/**/*.css", recursive=True))
for p in glob.glob(f"{ROOT}/*.html"):
    if "preview" in os.path.basename(p): continue
    for m in re.finditer(r'<style>(.*?)</style>', open(p).read(), re.S):
        css += "\n" + m.group(1)

# Resolve tokens, following var() chains — `--warning: var(--accent-type)`
# is common and a single pass would leave it unresolved.
# Only the :root block. A theme class redefines the same names for its
# own ground — collapsing both into one dictionary made `--panel` and
# `--ink` resolve to the same leather value and reported a false 1.0:1.
#
# Themes are measured separately below, because the same rule can be
# correct on one ground and wrong on another and both need checking.
def scope(name):
    i = css.find(name + "{")
    if i < 0: return ""
    d = 0
    for j in range(i, len(css)):
        if css[j] == "{": d += 1
        elif css[j] == "}":
            d -= 1
            if d == 0: return css[i:j+1]
    return ""

root = scope(":root")
tokens = dict(re.findall(r'(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;', root))
alias  = dict(re.findall(r'(--[\w-]+)\s*:\s*var\((--[\w-]+)\)\s*;', root))
for _ in range(4):
    for k, v in list(alias.items()):
        if v in tokens: tokens[k] = tokens[v]

def resolve(v):
    v = v.strip()
    m = re.fullmatch(r'var\((--[\w-]+)\)', v)
    if m: return tokens.get(m.group(1))
    return v if re.fullmatch(r'#[0-9a-fA-F]{3,6}', v) else None

# Rules that set both. Semi-transparent and gradient values are skipped —
# they cannot be measured without compositing, and guessing is worse
# than saying nothing.
pairs = 0
for rule in re.finditer(r'([^{}]+)\{([^{}]+)\}', css):
    sel, body = rule.group(1).strip(), rule.group(2)
    bg = re.search(r'(?<![\w-])background(?:-color)?:\s*([^;]+)', body)
    fg = re.search(r'(?<![\w-])color:\s*([^;]+)', body)
    if not (bg and fg): continue
    b, f = resolve(bg.group(1)), resolve(fg.group(1))
    if not b or not f: continue
    pairs += 1
    r = ratio(f, b)
    # 3:1 is the floor for large text; anything at 4.5 or above is fine
    # for everything. Between the two is a warning, below 3 a failure.
    name = selector(sel)
    if r < 3.0:
        FAILS.append(f"{name}  {f} on {b}  {r}:1")
    elif r < 4.5:
        WARNS.append(f"{name}  {f} on {b}  {r}:1 — only large text")

# Pass two: rules that set a colour and NOTHING else.
#
# Pass one only measures rules declaring both a background and a colour,
# which is why it missed `.brand{color:var(--raised)}` — a white
# wordmark on a cream nav, invisible, with the background inherited from
# an ancestor.
#
# Resolving real ancestry would need a DOM. What it does instead is
# measure every colour-only rule against the **page ground**, which is
# what the overwhelming majority of text actually sits on. Selectors
# scoped to a dark theme are skipped, because there the ground is
# different and pass one covers the explicit cases.
ground = tokens.get("--ground")

# Which containers are dark, derived rather than listed.
#
# `aside.side{background:var(--leather-deep)}` makes `.side` a dark
# container, so `.side a` and `.me b` inside it are correct even though
# they measure badly against the page ground. The first version hard-
# coded a list of class names and produced three false failures on the
# dashboard sidebar the moment it met a layout it had not been told
# about.
dark_containers = set()
for rule in re.finditer(r'([^{}]+)\{([^{}]+)\}', css):
    bg = re.search(r'(?<![\w-])background(?:-color)?:\s*([^;]+)', rule.group(2))
    if not bg: continue
    c = resolve(bg.group(1))
    if c and lum(c) < 0.18:
        for part in rule.group(1).split(","):
            sel_c = selector(part)
            # Classes AND element selectors. `footer{background:leather}`
            # makes footer a dark scope, and the first version only
            # looked for classes — so every rule inside the footer was
            # measured against the page ground and reported as failing.
            cls = re.findall(r'\.[\w-]+', sel_c)
            if cls:
                dark_containers.add(cls[-1])
            else:
                el = re.match(r'^([a-z]+)\s*$', sel_c)
                if el: dark_containers.add(el.group(1))

# No hardcoded selector list. `^nav` and `^footer` were on this list
# because they were dark in the navy palette — and the exemption
# survived the palette change and hid an invisible "Log in" link for a
# day. Dark scopes are derived from the stylesheet below instead.
dark_scoped = re.compile(r'\.(on-leather|on-dark|theme-leather|theme-navy)\b')
if ground:
    for rule in re.finditer(r'([^{}]+)\{([^{}]+)\}', css):
        sel, body = rule.group(1).strip(), rule.group(2)
        if re.search(r'(?<![\w-])background', body): continue      # pass one has it
        fg = re.search(r'(?<![\w-])color:\s*([^;]+)', body)
        if not fg: continue
        clean = selector(sel)
        if dark_scoped.search(clean): continue
        # Anything inside a container we know is dark.
        if any(c in clean for c in dark_containers): continue
        f = resolve(fg.group(1))
        if not f: continue
        r = ratio(f, ground)
        if r < 3.0:
            name = selector(sel)
            FAILS.append(f"{name}  {f} on the page ground {ground}  {r}:1")


if __name__ == "__main__":
    print(f"{pairs} resolvable background+colour pairs in {ROOT}\n")
    print(f"{'='*62}\n{len(FAILS)} FAILURE(S)\n{'='*62}")
    for x in FAILS: print(f"  x {x}")
    print(f"\n{'='*62}\n{len(WARNS)} WARNING(S)\n{'='*62}")
    for x in WARNS: print(f"  ! {x}")
    sys.exit(1 if FAILS else 0)
