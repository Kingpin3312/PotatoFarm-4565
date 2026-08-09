#!/usr/bin/env python3
"""Static checks for the mobile package."""
import re, glob, os

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
import json
theme = files.get("lib/theme.ts", "")
web = ""
for cand in ("../src/styles/tokens.css", "../../potato-launch/assets/site.css"):
    if os.path.exists(cand):
        web = open(cand).read(); break
if theme and web:
    pairs = {"#FDFBF7":"ground","#F7F2EA":"panel","#1F1815":"ink",
             "#E86A17":"accent","#A84A16":"accent-type","#B8500F":"accent-edge",
             "#4A3428":"leather","#2B1E17":"leather-deep"}
    for hexv, name in pairs.items():
        if hexv.lower() in theme.lower() and hexv.lower() not in web.lower():
            issues.append(("theme.ts", f"{name} {hexv} is in the app palette but not the web tokens"))

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
