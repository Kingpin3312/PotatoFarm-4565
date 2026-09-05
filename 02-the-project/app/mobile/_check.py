#!/usr/bin/env python3
"""Static checks for the mobile package."""
import re, glob, os, sys

issues = []
files = {p: open(p).read() for p in glob.glob("lib/*.ts") + glob.glob("app/**/*.tsx", recursive=True)}

def strip(src):
    """Comments are not code. Every false positive these scripts have
    produced across this project came from matching text that was
    explaining something rather than doing it."""
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    return re.sub(r'//.*$', '', src, flags=re.M)

files = {p: strip(s) for p, s in files.items()}

for p, s in files.items():
    b = os.path.basename(p)
    for m in re.finditer(r'import \{([^}]+)\} from "([^"]+)"', s):
        # `import { type Item }` — strip the `type` keyword or the
        # search looks for the literal string "type Item", which never
        # appears again and reports a used import as unused.
        for raw in m.group(1).split(","):
            name = raw.strip().split(" as ")[-1].strip()
            if name.startswith("type "): name = name[5:].strip()
            if name and not re.search(rf'\b{re.escape(name)}\b', s[m.end():]):
                issues.append((b, f"imports {name} and never uses it"))

    # `let x` that is never reassigned. Compound assignment (+=, -=) and
    # ++/-- all count as reassignment — the first version of this check
    # missed `+=` and reported a false positive, which is exactly the
    # class of mistake these scripts keep making.
    for m in re.finditer(r'\blet (\w+)\b', s):
        n = m.group(1); after = s[m.end():]
        reassigned = (re.search(rf'\b{n}\s*(?:[-+*/|&^]|\?\?|\|\||&&)?=[^=]', after)
                      or re.search(rf'\b{n}\s*(?:\+\+|--)', after))
        if not reassigned:
            issues.append((b, f"`let {n}` never reassigned — use const"))

    for m in re.finditer(r'export (?:async )?function \w+\([^)]*\)\s*:\s*Promise<(\w+)\[\]>', s):
        t = m.group(1)
        if f"export type {t}" not in s and f"export interface {t}" not in s:
            issues.append((b, f"returns {t}[] but {t} is not exported"))

    if "indexOf(item)" in s:
        issues.append((b, "indexOf inside a loop over the same array"))

# A Record<X["kind"], ...> must cover every member of X. Two parallel
# action unions had already drifted here, leaving conversation.send —
# the most common queued action — with no conflict policy at all.
union = {}
for p2, s2 in files.items():
    for m in re.finditer(r'export type (\w+) =(.*?);', s2, re.S):
        union[m.group(1)] = set(re.findall(r'kind:\s*"([\w.]+)"', m.group(2)))
for p2, s2 in files.items():
    for m in re.finditer(r'Record<(\w+)\["kind"\][^>]*>\s*=\s*\{(.*?)\n\}', s2, re.S):
        want = union.get(m.group(1), set())
        have = set(re.findall(r'"([\w.]+)":', m.group(2)))
        for k in sorted(want - have):
            issues.append((os.path.basename(p2), f"Record on {m.group(1)} is missing '{k}'"))

decls = {}
for p, s in files.items():
    for m in re.finditer(r'export const (\w+)', s):
        decls.setdefault(m.group(1), []).append(os.path.basename(p))
for name, where in decls.items():
    if len(where) > 1:
        issues.append(("(across)", f"{name} declared in {', '.join(where)}"))

# The native palette is duplicated from the web tokens because React
# Native has no CSS custom properties. Duplication is fine; drift is not.
#
# ## This check could not fail, and the drift it exists for happened
#
# It used to compare a hardcoded list of eight colours — #FDFBF7,
# #F7F2EA, #1F1815, #A84A16, #B8500F, #4A3428, #2B1E17 — and flag one
# only if it appeared in the app palette and not in the web tokens.
# Every value in that list was from a palette two generations old, so by
# the time it mattered not one of them was in `theme.ts` and the loop
# could never fire. Meanwhile the file it was watching sat on the old
# four-step orange ramp *and* the old logo gradient, months after the
# web had moved. A check pinned to specific values goes quiet the moment
# those values are superseded — which is exactly when drift starts.
#
# So it compares the whole palette now: every colour the native theme
# declares must be a colour the web tokens declare. That cannot go stale,
# because it names no colours at all.
theme = files.get("lib/theme.ts", "")
web = ""
HERE = os.path.dirname(os.path.abspath(__file__))
for cand in (os.path.join(HERE, "../src/styles/tokens.css"),):
    if os.path.exists(cand):
        web = open(cand).read(); break
if theme and not web:
    # Say so rather than passing. A comparison that read nothing is not
    # agreement, and reporting it as agreement is how this check spent
    # its whole life green.
    issues.append(("theme.ts", "tokens.css could not be read — the palettes were NOT compared"))
if theme and web:
    # Prose is not a declared colour. Both files argue at length about
    # which oranges were rejected, naming them.
    def declared(s):
        s = re.sub(r"/\*.*?\*/", " ", s, flags=re.S)
        return re.sub(r"^\s*//.*$", " ", s, flags=re.M)
    # Both sides, and the web side is the one that matters. Stripping
    # comments from the native theme alone left this check unable to
    # fail a second time: `tokens.css` names every superseded orange in
    # its prose — "this used to be a four-step ramp — #E86A2C, #CF5A22,
    # #B94E1F" — so putting #CF5A22 back into the app palette matched
    # that sentence and passed. The history is worth keeping; it is just
    # not a declaration.
    code = declared(theme)
    web_src = declared(web)
    # The mark's brown. It belongs to the logo artwork rather than to the
    # interface tokens, so it is in `mark.py` and legitimately not in
    # tokens.css. `palette.py` carries the same single exception.
    ALLOWED = {"#3b2416"}
    web_hex = {h.lower() for h in re.findall(r"#[0-9A-Fa-f]{6}", web_src)}
    for h in sorted({h.lower() for h in re.findall(r"#[0-9A-Fa-f]{6}", code)}):
        if h in web_hex or h in ALLOWED:
            continue
        issues.append(("theme.ts", f"{h.upper()} is in the app palette and not in the web tokens"))

# Tap targets. An agent using this with one thumb in a car is the primary
# case, so anything below 44 is a defect rather than a preference.
for p2, s2 in files.items():
    if not p2.endswith(".tsx"): continue
    for m in re.finditer(r'min(?:Height|Width):\s*(\d+)', s2):
        v = int(m.group(1))
        if 0 < v < 44:
            issues.append((os.path.basename(p2), f"tap target {v}pt — below the 44pt minimum"))

print(f"{len(issues)} issue(s)")
for f, m in sorted(set(issues)): print(f"  {f:20} {m}")

# Exit non-zero, so this can be wired into CI and mean something. It
# printed its findings and exited 0 for its whole life, which is the
# second half of the same defect as the palette list above: a check that
# reports a problem and then tells the caller everything is fine.
sys.exit(1 if issues else 0)
