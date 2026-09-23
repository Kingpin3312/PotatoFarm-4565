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
nothing to do with documentation. `it.each` tables expand at run time
(231 `it(` calls in source were 303 tests), so no static count is
honest either. **Test files** are counted, because vitest's `include`
rule is a glob and the count needs nothing to run.

## Numbers written as words

A count spelled out is still a count. This file matched digits only, so
"the twenty-four check suites" sat in `PROJECT_CONTEXT.md` against a
real 39, and "fifteen modules" and "Seven files" against 16 test files —
all of them read past, in the file that exists to catch exactly that.

Words are read for **the verification kit only** — check suites,
audits, audit scripts, test files, browser checks — and not for models, routers,
procedures or jobs. That was measured, not assumed: switched on for
every noun, it found five stale counts and eleven false ones, and the
false ones were all the same shape. "Five procedures have no screen",
"eleven routers written and never mounted", "seven procedures gated
with `can()`" — a number word before one of those nouns, in these
documents, is nearly always a *subset*, and a check that reads a subset
as a total is the conflation the Screens paragraph above refuses. A
spelled-out count of check suites has so far always meant all of them.

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
# `.py` *and* `.mjs`. The first audit that needed a browser could not be
# Python, and counting only Python meant the runner said 22 while this
# said 21 — a check about stale numbers, itself carrying one.
audit_scripts = len([f for f in os.listdir(audit_dir)
                     if f.endswith((".py", ".mjs")) and not f.startswith("_")]) \
    if os.path.isdir(audit_dir) else 0

# vitest's own `include`: ["src/**/*.test.ts"]. Kept as the same glob
# rather than a looser "anything named test", so a `.test.tsx` somebody
# adds without widening the config shows up here as a file vitest will
# not run — which is a finding, not a rounding error.
test_files = 0
for base, dirs, files in os.walk(os.path.join(APP, "src")):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    test_files += sum(1 for f in files if f.endswith(".test.ts"))

TRUTH = {
    "test files":    test_files,
    # Every `browser:` script is a check, and that is kept true rather
    # than filtered here: the screenshot walk was filed as
    # `browser:gallery`, asserts nothing and cannot fail, so it counted
    # as a check that always passes. It is `npm run gallery` now.
    "browser checks": len([s for s in scripts if s.startswith("browser:")]),
    "models":        len(re.findall(r"^model ", schema, re.M)),
    "enums":         len(re.findall(r"^enum ", schema, re.M)),
    "routers":       len(router_files),
    "procedures":    procedures,
    "jobs":          crons,
    "audit scripts": audit_scripts,
    "audits":        audit_scripts,
    "check suites":  len([s for s in scripts if s.startswith("check:")]),
}

# ---------------------------------------------------------------------
# The claims, as they are actually written.
#
# Grounded in the phrasings the documents use rather than invented — the
# same lesson as the acronym allowlist in `browser:type`, where a list
# written from imagination is how a check comes to pass by accident.
# ---------------------------------------------------------------------
_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven",
          "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
          "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
         "eighty", "ninety"]
WORDS = {w: i for i, w in enumerate(_UNITS)}
for t, tw in enumerate(_TENS):
    if not tw:
        continue
    WORDS[tw] = t * 10
    for u in range(1, 10):
        WORDS[f"{tw}-{_UNITS[u]}"] = t * 10 + u
        WORDS[f"{tw} {_UNITS[u]}"] = t * 10 + u

# Longest first, so "twenty-four" is not read as "twenty" and a stray
# "-four".
_WORD_RE = "|".join(sorted(map(re.escape, WORDS), key=len, reverse=True))
N = rf"(\d+|\b(?:{_WORD_RE}))"   # a numeral or a number word
D = r"(\d+)"                         # a numeral only — see the docstring


def as_int(token):
    token = token.lower()
    return int(token) if token.isdigit() else WORDS[token]


PATTERNS = {
    # "296 assertions in 15 files" and "16 test files". The bare "N
    # files" is not matched: it is used about every kind of file.
    "test files":    rf"(?:{N}\s+test\s+files\b|assertions\s+in\s+{N}\s+files\b)",
    # PROJECT_CONTEXT.md said "eighteen browser checks" against a real 22.
    "browser checks": rf"{N}\s+browser\s+(?:checks|suites)\b",
    "models":        rf"{D}\s+(?:database\s+)?models\b",
    "enums":         rf"{D}\s+enums\b",
    "routers":       rf"{D}\s+(?:API\s+)?routers\b",
    "procedures":    rf"{D}\s+procedures\b",
    # "scheduled jobs" *and* "cron jobs" — two documents said "24 cron
    # jobs" against a real 25 and this pattern did not see them, which
    # is the same failure the file exists to prevent, in the file
    # itself.
    "jobs":          rf"{D}\s+(?:scheduled|cron)\s+jobs\b",
    "audit scripts": rf"{N}\s+audit\s+scripts\b",
    # "21 audits", which CLAUDE.md wrote twice and this file did not
    # look for — so the count went stale the moment a twenty-second was
    # added, in exactly the way the pattern above it exists to prevent.
    # The two nouns share a truth because they are the same number:
    # every script in `04-audit-scripts/` is an audit, whatever the
    # sentence around it calls them.
    "audits":        rf"{N}\s+audits\b",
    "check suites":  rf"{N}\s+check\s+suites\b",
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
    # A runbook is the worst place for a stale count, because it is read
    # under time pressure by somebody who cannot check it. `DEPLOY.md`
    # tells the reader the plan they must buy from the cron count, and
    # that number has already moved once (24 → 25) while three documents
    # went on saying the old one.
    os.path.join(APP, "DEPLOY.md"),
    # The first file a new agent reads, and the one that tells it how big
    # the codebase is before it has looked. A wrong number here is
    # believed for the whole session.
    os.path.join(APP, "CLAUDE.md"),
    # **The CI workflow, which is not a document and carries counts
    # anyway.** Its header explained itself with "twenty-four check
    # suites and fifteen audit scripts", and a step comment said "233
    # unit assertions, 24 check suites and the 15 audit scripts" — every
    # one of them stale, in the one file whose entire purpose is that
    # nothing goes unchecked by hand.
    #
    # This list held only `.md` files because a count was assumed to be
    # a thing documents do. A number is a claim wherever it is written,
    # and a comment in YAML is read by exactly the people who are about
    # to trust it.
    os.path.join(ROOT, ".github", "workflows", "verify.yml"),
]

for doc in DOCS:
    text = read(doc)
    if not text:
        NOTES.append(f"{os.path.relpath(doc, ROOT)} — not found, skipped")
        continue
    rel = os.path.relpath(doc, ROOT)
    lines = text.splitlines()

    def skip(line):
        # `counts: ignore` works in an HTML comment or a `#` one — the
        # marker is the phrase, not the syntax around it, so the same
        # escape hatch reaches a workflow file as a markdown one.
        return "counts: ignore" in line or bool(HISTORICAL.search(line))

    for n, line in enumerate(lines, 1):
        if skip(line):
            continue

        # A claim can straddle a line break, and one did. HANDOVER.md
        # wrapped as "…24 check suites, 15" / "audit scripts, all browser
        # suites…", so the number was on one line and the noun on the
        # next, and this check read straight past it — the stale count
        # sat in the first paragraph of the handover document, which is
        # the one place a wrong number does the most damage.
        #
        # Only joined when the line ends in a digit, so the usual case
        # does no extra work, and matches found in the pair are deduped
        # against the ones found in the line alone.
        targets = [line]
        if n < len(lines) and re.search(r"\d[\s]*$", line) and not skip(lines[n]):
            targets.append(line + " " + lines[n])

        seen = set()
        for target in targets:
            for noun, pat in PATTERNS.items():
                for m in re.finditer(pat, target, re.I):
                    claimed = next(g for g in m.groups() if g)
                    if (noun, claimed.lower()) in seen:
                        continue
                    seen.add((noun, claimed.lower()))
                    actual = TRUTH[noun]
                    if as_int(claimed) != actual:
                        FAILS.append(
                            f"{rel}:{n} claims {claimed} {noun}, but there are {actual}"
                            f"\n      {target.strip()[:96]}")

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
