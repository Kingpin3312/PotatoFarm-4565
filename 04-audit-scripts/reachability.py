#!/usr/bin/env python3
"""
Trigger audit.

Three times in this project a complete, tested, documented module has
turned out to have nothing that starts it:

  1. Billing could invoice a customer no code path could create.
  2. sendFile could send an attachment nothing could upload.
  3. deals/ could plan a transfer no accepted offer ever began.

`architecture.py` catches a module nothing *imports*. This catches the
subtler one: a module that is imported, called correctly, and whose
entry condition never occurs — the code equivalent of a light switch
wired to nothing.

The question it asks: **for every model that drives a workflow, what
writes the first row?**

## A warning about this script in particular

It produced **six false findings on its first run** and every one came
from a pattern I wrote from memory rather than from the code:


  - It named `tx`, `db` and `ctx.db` as receivers and missed
    `crossTenant("sweep").invoice.create`, then reported that invoicing
    could not start.
  - It matched `find\b`, which never matches `findMany` — so every read
    in the codebase went unseen and five models were reported as write-
    only.

Both were one character from correct and neither would have been obvious
in review. It did find one real bug underneath the noise —
`dealsWon` hardcoded to `0` in the leaderboard — but a nine-to-one ratio
of noise to signal is how a check stops being read.

**Verify before you fix.** That instruction is in CLAUDE.md for every
script here and it applies hardest to the newest one.
"""
import glob, os, re, sys

# ---------------------------------------------------------------------
# Skip anything that is not ours.
#
# Every recursive glob in this suite was written when `node_modules` did
# not exist, because nothing had ever been installed. The moment it did,
# the checks started reading dependencies: the contrast check failed six
# times on ag-Grid colours inside Prisma Studio's bundled stylesheet.
#
# A check that reports a dependency's CSS as a brand violation is a check
# nobody runs twice.
# ---------------------------------------------------------------------
_SKIP = ("node_modules", "/.next/", "/dist/", "/build/", "/__pycache__/", "/.git/")


def ours(paths):
    """Filter a glob result down to this project's own files."""
    return [p for p in paths if not any(s in p.replace(os.sep, "/") for s in _SKIP)]



ROOT = sys.argv[1] if len(sys.argv) > 1 else "potato-crm"
src = {p: open(p).read() for p in ours(glob.glob(f"{ROOT}/src/**/*.ts*", recursive=True))}
allsrc = "\n".join(src.values())
FAILS, NOTES = [], []

# Models whose existence starts a process. If nothing creates one, the
# process downstream of it is decoration.
DRIVERS = [
    ("Deal",         "deal progression, completion planning, commission"),
    ("Offer",        "the negotiation record"),
    ("Organisation", "every tenant — nothing else can exist without one"),
    ("Subscription", "all billing"),
    ("Attachment",   "sending a file"),
    ("Vendor",       "the weekly owner report"),
    ("Viewing",      "outcomes, feedback, vendor reports"),
    ("Invoice",      "getting paid"),
    ("ConversationCharge", "the conversation allowance and every overage line"),
    # Added after the board was found to have no columns for any
    # brokerage: `pipeline.board` selects leads by `stageId`, so with no
    # stage nothing appears and every lead is created invisible.
    ("PipelineStage", "the pipeline board — with no stages it has no columns at all"),
]

schema = open(f"{ROOT}/prisma/schema.prisma").read()

for model, drives in DRIVERS:
    if f"model {model} {{" not in schema:
        continue
    lower = model[0].lower() + model[1:]
    # A create anywhere — router, job, webhook or library.
    # Any receiver, not a list of them. The first version named tx, db
    # and ctx.db and missed `crossTenant("sweep").invoice.create` —
    # reporting that invoicing could not start when it demonstrably can.
    # Naming the callers you happen to remember is how a check lies.
    created = re.search(rf'\.{lower}\.(?:create|createMany|upsert)\b', allsrc)
    if not created:
        FAILS.append(f"nothing creates a {model} — {drives} cannot start")

# ---------------------------------------------------------------------
# The same question, asked of every model rather than a list of nine.
#
# `DRIVERS` above is hand-curated, and a hand-curated list is the thing
# that goes stale: `PipelineStage`, `Listing` and `Channel` were never
# added to it, and all three turned out to be read everywhere and
# written nowhere. The pipeline board selected by `stageId`, nothing had
# ever created a stage, and the empty state told a brokerage with
# thirteen leads that enquiries would "appear here" — while every one of
# them sat invisible with a null stage.
#
# So the scan is now the whole schema, and the curated list survives only
# to say *what breaks* for the models where that is worth spelling out.
#
# ## Why the known ones are notes rather than failures
#
# Sixteen models are in this state today. Turning them all red would
# make `npm run verify` fail every run until sixteen features exist,
# and a gate that is permanently red is a gate everybody learns to
# ignore — which is how the original list came to be missing three
# entries in the first place.
#
# Instead this ratchets: everything currently unwritten is listed below
# with what it costs, and anything *new* that becomes read-but-unwritten
# is a failure. Debt is visible and cannot grow silently. Fixing one and
# forgetting to delete its line here is also reported, so the list
# cannot quietly become fiction.
# ---------------------------------------------------------------------
KNOWN_UNWRITTEN = {
    # Written by NextAuth's PrismaAdapter, which is a dependency rather
    # than our source — a real writer this scan cannot see.
    "Session": "NextAuth PrismaAdapter",

    # Genuine gaps. Each is a feature that can be read and not created.
    "KycRecord": "AML files cannot be opened from the product",
    "Screening": "sanctions screening has no row to write",
    "QualificationProfile": "qualification answers cannot be stored",
    "CommissionPlan": "no commission plan can be defined",
    "CommissionSplit": "a split cannot be recorded",
    "WorkingHours": "sending hours cannot be configured",
    "AgentAvailability": "the diary cannot be told when an agent is free",
    "AssignmentRule": "round-robin routing cannot be set up",
    "TeamVisibility": "team scoping cannot be configured",
    "NotificationPrefs": "an agent cannot change what they are notified about",
    "Document": "no document can be filed",
    "PlanSubscription": "portal plan subscriptions cannot be created",
    "EmailAccount": "no mailbox can be connected",
    "Migration": "no import can be started",
}

_all_models = re.findall(r"^model (\w+)", schema, re.M)
_still_unwritten = set()
for _m in _all_models:
    _l = _m[0].lower() + _m[1:]
    _read = re.search(rf"\.{_l}\.(?:find\w*|count|aggregate|groupBy)\b", allsrc)
    _written = re.search(rf"\.{_l}\.(?:create|createMany|upsert)\b", allsrc)
    if not _read or _written:
        continue
    _still_unwritten.add(_m)
    if _m in KNOWN_UNWRITTEN:
        NOTES.append(f"{_m} is read but never written — {KNOWN_UNWRITTEN[_m]}")
    else:
        FAILS.append(
            f"nothing creates a {_m}, and it is read — a screen will show an "
            f"empty table nobody can fill. Fix it, or add it to "
            f"KNOWN_UNWRITTEN in reachability.py with what it costs."
        )

# A stale entry makes the list fiction, so the list checks itself. It
# fires for both reasons an entry stops applying: the model gained a
# writer, or it stopped being read. `Account` and `VerificationToken`
# were on here from the first draft and are neither — written by the
# adapter and never read by us — which this caught immediately.
for _m in sorted(set(KNOWN_UNWRITTEN) - _still_unwritten):
    NOTES.append(f"{_m} no longer needs a KNOWN_UNWRITTEN entry — remove it")

# The reverse: a model created and never read is a table nobody looks at.
for model, _ in DRIVERS:
    if f"model {model} {{" not in schema: continue
    lower = model[0].lower() + model[1:]
    if re.search(rf'\.{lower}\.(?:create|upsert)\b', allsrc) and not re.search(
            # `find\b` never matches `findMany` — the boundary was in the
            # wrong place and every read in the codebase went unseen.
            # Six false findings from one script, all from this one
            # character. A new check earns trust by being wrong in
            # public first.
            rf'\.{lower}\.(?:find\w*|count|aggregate|groupBy)\b', allsrc):
        NOTES.append(f"{model} is created and never read back")

# The same gap one level up: a router procedure no screen calls.
#
# The billing engine was complete server-side — seats, allowance,
# overage, invoices, card collection — and **no screen called any of
# it**. A trial converts when a card is attached and there was nowhere
# to attach one.
#
# Most procedures legitimately have no UI yet; that is a note. The
# revenue path is not, because a billing procedure nothing calls means
# nobody can pay.
screens = "\n".join(open(p2).read() for p2 in
                    ours(glob.glob(f"{ROOT}/src/app/**/*.tsx", recursive=True)))
routers = glob.glob(f"{ROOT}/src/server/api/routers/*.ts")

REVENUE = {"billing"}
for rf in routers:
    router = os.path.basename(rf)[:-3]
    body = open(rf).read()
    procs = re.findall(r'^\s{2}(\w+):\s*(?:requirePermission|orgProcedure|publicProcedure)',
                       body, re.M)
    # A procedure gated on `audit:read` is ours, not the customer's —
    # billing.trials is our view of which trials are dying, and it
    # correctly has no customer screen. Marking it by its permission is
    # better than exempting it by name, which would rot the moment
    # somebody adds a second internal query.
    internal = set(re.findall(r'^\s{2}(\w+):\s*requirePermission\("audit:read"\)', body, re.M))
    uncalled = [pr for pr in procs
                if pr not in internal and f"api.{router}.{pr}" not in screens]
    if not uncalled:
        continue
    if router in REVENUE:
        FAILS.append(f"no screen calls {router}.{', '.join(uncalled)} — "
                     f"the revenue path is unreachable from the app")
    else:
        NOTES.append(f"{router}: {len(uncalled)} of {len(procs)} procedures have no screen "
                     f"({', '.join(uncalled[:4])}{'…' if len(uncalled) > 4 else ''})")


# Screens calling a procedure with an argument it does not accept.
#
# Caught the leads screen passing `leadIds` to `leads.assign`, which
# takes a single `leadId` — a runtime validation error nobody would see
# until an agent tried to reassign a batch. Invisible to every other
# check here, because both the screen and the router are individually
# correct.
print("\nArgument shapes:")
router_inputs = {}
for rf in routers:
    rname = os.path.basename(rf)[:-3]
    rbody = open(rf).read()
    for m in re.finditer(r'^  (\w+): (?:require\w+\([^)]*\)|orgProcedure|publicProcedure)'
                         r'\s*\n\s*\.input\(z\.object\(\{(.*?)\}\)\)', rbody, re.M | re.S):
        keys = set(re.findall(r'(\w+)\s*:\s*z\.', m.group(2)))
        router_inputs[f"{rname}.{m.group(1)}"] = keys

bad = 0
for sf in ours(glob.glob(f"{ROOT}/src/app/**/*.tsx", recursive=True)):
    body = open(sf).read()
    # Bind the variable to its procedure first, then find that
    # variable's own calls. The first version searched forward from the
    # useMutation() and matched whichever `.mutate` came next in source
    # order — which in a component with three mutations is somebody
    # else's arguments. Three false failures from one heuristic.
    bindings = dict(re.findall(
        r'const\s+(\w+)\s*=\s*api\.(\w+\.\w+)\.use\w+\(', body))
    for var, key in bindings.items():
        expected = router_inputs.get(key)
        if not expected:
            continue
        for call in re.finditer(rf'\b{re.escape(var)}\.(?:mutate|mutateAsync)\(\s*\{{([^}}]*)\}}',
                                body):
            # `word:` finds object keys, and also finds the tail of a
            # ternary — `x ?? null : null` reads as a key called `null`.
            # These are the only words that can appear immediately before
            # a colon without being a key, so excluding them is exact
            # rather than a guess.
            LITERALS = {"null", "undefined", "true", "false"}
            passed = set(re.findall(r'(\w+)\s*:', call.group(1))) - LITERALS
            unknown = passed - expected
            if unknown:
                bad += 1
                FAILS.append(f"{os.path.basename(sf)} calls {key} with "
                             f"{', '.join(sorted(unknown))} — not in its input")
if not bad:
    print(f"  every call matches its procedure's input ({len(router_inputs)} checked)")


# Screens reading a field the procedure never returns.
#
# The mirror of the argument-shape check above, and it caught a real
# one: the import screen read `detectedSource`, `columns`, `rows` and
# `willSkip` from `migration.inspect`, which returns issue counts. Four
# blanks and an empty table, invisible until somebody uploaded a file.
#
# Only checks procedures whose return is a single object literal — a
# conservative match, because a false positive here would train people
# to ignore the whole script.
print("\nReturn shapes:")
returns = {}
for rf in routers:
    rname = os.path.basename(rf)[:-3]
    rbody = open(rf).read()
    names = [m.group(1) for m in re.finditer(r"^  (\w+): (?:require|orgProc|publicProc)",
                                             rbody, re.M)]
    for i, n in enumerate(names):
        a = rbody.index(f"  {n}: ")
        b = rbody.index(f"  {names[i+1]}: ") if i + 1 < len(names) else len(rbody)
        blk = rbody[a:b]
        # The last `return {` in the procedure, to its closing brace.
        hits = list(re.finditer(r"return \{", blk))
        if len(hits) != 1:
            continue
        tail = blk[hits[0].end():]
        depth, end = 1, None
        for k, ch in enumerate(tail):
            if ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0: end = k; break
        if end is None:
            continue
        body = tail[:end]
        # Spread means the shape is wider than what is written here.
        if "..." in body:
            continue
        # Both forms. `{ rating, reasons, reviewDueAt: due }` is three
        # keys, and matching only `name:` sees one — which produced
        # three false failures on the first run.
        keys = set(re.findall(r"(?:^|[{,]|\n)\s*(\w+)\s*:", body))
        keys |= set(re.findall(r"(?:^|[{,])\s*(\w+)\s*(?=[,}\n])", body))
        keys -= {"return", "true", "false", "null", "const", "await"}
        if keys:
            returns[f"{rname}.{n}"] = keys

bad = 0
for sf in ours(glob.glob(f"{ROOT}/src/app/**/*.tsx", recursive=True)):
    body = open(sf).read()
    binds = dict(re.findall(
        r"const\s+(\w+)\s*=\s*api\.(\w+\.\w+)\.use\w+\(", body))
    for var, key in binds.items():
        known = returns.get(key)
        if not known:
            continue
        for m in re.finditer(rf"\b{re.escape(var)}\.data(?:\?)?\.(\w+)", body):
            if m.group(1) not in known:
                bad += 1
                FAILS.append(f"{os.path.basename(sf)} reads .{m.group(1)} from "
                             f"{key}, which returns {', '.join(sorted(known))}")
if not bad:
    print(f"  every field read matches its procedure's return "
          f"({len(returns)} checked)")

if __name__ == "__main__":
    print(f"{len(DRIVERS)} workflow drivers checked\n")
    print(f"{'='*58}\n{len(FAILS)} FAILURE(S)\n{'='*58}")
    for f in FAILS: print(f"  x {f}")
    print(f"\n{'='*58}\n{len(NOTES)} NOTE(S)\n{'='*58}")
    for n in NOTES: print(f"  ! {n}")
    sys.exit(1 if FAILS else 0)
