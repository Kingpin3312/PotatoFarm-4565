#!/usr/bin/env python3
"""
Inventory audit — the numbers the documentation states about itself.

`ratios.py` exists because a comment carrying a contrast ratio is a
claim and nothing checked claims. This is the same argument applied to
the other kind of number this project keeps writing down: **how many
models, routers, procedures, jobs and checks there are.**

Three documents describe the current codebase, and when this was written
all three disagreed — with the code and with each other:

    PROJECT_CONTEXT.md   72 models · 26 routers · 128 procedures
    README.md            72 models · 23 routers · 106 procedures
    HANDOVER.md          34 models · 11 routers · 11 jobs

The real answer was 73, 27 and 147. HANDOVER.md is the one that matters,
because its job is orienting whoever picks the project up next, and it
was describing a codebase less than half the size of the real one under
a heading that says "The shape of it".

Nobody wrote a wrong number on purpose. They were right when typed, and
the code moved.

## What this deliberately does not check

**Screens.** The word means two different things in these documents —
the app's own pages, and the number of screens a browser check visits —
and `TYPOGRAPHY.md` says "25 screens" about the second while
`PROJECT_CONTEXT.md` says "37 screens" about the first. A check that
conflated them would be confidently wrong, which is worse than absent.

**Assertions.** Only `npm test` knows, and shelling out to a test runner
from an audit couples the two in a way that fails for reasons that have
nothing to do with documentation.

**Historical statements.** README.md says COMPLETION.md "described a
generation-older codebase (66 models, 20 routers)". That is true, and
must stay true. Lines carrying a historical cue are skipped, and
`<!-- counts: ignore -->` on the line is the explicit escape hatch.

    python3 04-audit-scripts/counts.py <repo-root>
"""
import json, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
APP = os.path.join(ROOT, "02-the-project", "app")
FAILS, NOTES = [], []


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


# ---------------------------------------------------------------------
# The truth, measured from source.
#
# Each of these is deliberately the dumbest expression that is correct.
# A clever count that drifts from what a person would get by looking is
# a second claim to keep in step, which is the problem this file exists
# to solve.
# ---------------------------------------------------------------------
schema = read(os.path.join(APP, "prisma", "schema.prisma"))

routers_dir = os.path.join(APP, "src", "server", "api", "routers")
router_files = sorted(f for f in os.listdir(routers_dir)) if os.path.isdir(routers_dir) else []

procedures = 0
for f in router_files:
    body = read(os.path.join(routers_dir, f))
    # A procedure definition is a two-space-indented key whose value is
    # one of the three builders. Nested `.input(...)` and helpers sit
    # deeper, and imports sit at column zero.
    procedures += len(re.findall(
        r"^ {2}[A-Za-z][A-Za-z0-9]*:\s*(?:orgProcedure|publicProcedure|requirePermission\()",
        body, re.M))

try:
    crons = len(json.loads(read(os.path.join(APP, "vercel.json"))).get("crons", []))
except (ValueError, TypeError):
    crons = 0

try:
    scripts = json.loads(read(os.path.join(APP, "package.json"))).get("scripts", {})
except (ValueError, TypeError):
    scripts = {}

audit_dir = os.path.join(ROOT, "04-audit-scripts")
audit_scripts = len([f for f in os.listdir(audit_dir) if f.endswith(".py")]) \
    if os.path.isdir(audit_dir) else 0

TRUTH = {
    "models":        len(re.findall(r"^model ", schema, re.M)),
    "enums":         len(re.findall(r"^enum ", schema, re.M)),
    "routers":       len(router_files),
    "procedures":    procedures,
    "jobs":          crons,
    "audit scripts": audit_scripts,
    "check suites":  len([s for s in scripts if s.startswith("check:")]),
}

# ---------------------------------------------------------------------
# The claims, as they are actually written.
#
# Grounded in the phrasings the documents use rather than invented — the
# same lesson as the acronym allowlist in `browser:type`, where a list
# written from imagination is how a check comes to pass by accident.
# ---------------------------------------------------------------------
PATTERNS = {
    "models":        r"(\d+)\s+(?:database\s+)?models\b",
    "enums":         r"(\d+)\s+enums\b",
    "routers":       r"(\d+)\s+(?:API\s+)?routers\b",
    "procedures":    r"(\d+)\s+procedures\b",
    "jobs":          r"(\d+)\s+scheduled\s+jobs\b",
    "audit scripts": r"(\d+)\s+audit\s+scripts\b",
    "check suites":  r"(\d+)\s+check\s+suites\b",
}

# A line that is talking about the past, not the present.
HISTORICAL = re.compile(
    r"described|generation-older|used to|previously|out of date|"
    r"was wrong|superseded|older codebase|at the time|back then",
    re.I)

# The documents whose job is to describe the codebase as it is now.
DOCS = [
    os.path.join(ROOT, "01-START-HERE", "PROJECT_CONTEXT.md"),
    os.path.join(ROOT, "README.md"),
    os.path.join(APP, "HANDOVER.md"),
]

for doc in DOCS:
    text = read(doc)
    if not text:
        NOTES.append(f"{os.path.relpath(doc, ROOT)} — not found, skipped")
        continue
    rel = os.path.relpath(doc, ROOT)
    for n, line in enumerate(text.splitlines(), 1):
        if "counts: ignore" in line or HISTORICAL.search(line):
            continue
        for noun, pat in PATTERNS.items():
            for claimed in re.findall(pat, line, re.I):
                actual = TRUTH[noun]
                if int(claimed) != actual:
                    FAILS.append(
                        f"{rel}:{n} claims {claimed} {noun}, but there are {actual}"
                        f"\n      {line.strip()[:96]}")

print("Inventory audit\n")
print("  measured from source:")
for k, v in TRUTH.items():
    print(f"    {k:<14} {v}")
print()

for note in NOTES:
    print(f"  · {note}")

if FAILS:
    print(f"\n  {len(FAILS)} stale number(s):\n")
    for f in FAILS:
        print(f"    ✗ {f}")
    print("\n  Fix the document, or mark the line `<!-- counts: ignore -->`")
    print("  if it is deliberately describing the past.\n")
    sys.exit(1)

print("  every stated count matches the code.\n")
