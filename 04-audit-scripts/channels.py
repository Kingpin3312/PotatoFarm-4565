#!/usr/bin/env python3
"""
Every channel type, accounted for on every surface that must decide
about it.

## Why this exists

Adding a channel type touches six places, and nothing made you visit
them. Meta lead ads was added correctly to the enum, the adapter, the
webhook route and the ingest — and missed in three:

  * `channels.connect` generated a `secretRef` for WhatsApp only, so a
    connected Facebook Page had its access token written nowhere and
    every lead died at the credential lookup.
  * `channels.list` computed `canSend` for WhatsApp only, so the one
    screen that could have contradicted "token stored" never asked.
  * the Meta webhook never called `markChannelHealthy`, so `lastSyncAt`
    stayed null — and `checkChannelSilence()` skips a null, which meant
    the file that gives Meta the shortest alarm window of any channel
    never once looked at a Meta channel.

Each was found separately, days apart, by writing a check for that one
symptom. CLAUDE.md's own rule: **a class of bug fixed one instance at a
time is not being fixed.** This is the class.

## What it asserts

1. Every `ChannelType` in the schema appears in `TYPES`, `IDENTIFIER`,
   and makes an explicit credential decision — `CREDENTIALLED` or the
   `NO_CREDENTIAL` list beside it. Silence is not a decision.
2. Every channel the silence alarm will judge has a threshold, and
   every threshold names a real channel type.
3. **Every route that calls `ingestEnquiry` also calls
   `markChannelHealthy`.** This is the assertion that catches the Meta
   case. A feed that delivers and does not say so is a feed the silence
   alarm cannot see, and its failure mode is a board that goes quiet
   while everybody assumes it is a slow week.
4. `lastSyncAt` has exactly one writer, so the rule above cannot be
   sidestepped by a second one somebody forgets to keep in step.
5. Every writer of a channel `lastError` is matched by something that
   clears it. An alarm nothing can close is one somebody switches off,
   and then the next real one is missed.
"""
import re
import sys
from pathlib import Path

app = Path(sys.argv[1] if len(sys.argv) > 1 else "02-the-project/app")
fails: list[str] = []
notes: list[str] = []
checked = 0


def read(rel: str) -> str:
    p = app / rel
    if not p.exists():
        fails.append(f"{rel} is missing — this audit cannot check what it cannot read")
        return ""
    return p.read_text(encoding="utf-8")


def strip_comments(src: str) -> str:
    """Prose is not a declaration.

    The palette audit learned this the expensive way: a file's own
    account of a value it rejected matched the check looking for that
    value. Every comparison below reads code only.
    """
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"//[^\n]*", " ", src)


schema = strip_comments(read("prisma/schema.prisma"))
channels = strip_comments(read("src/server/api/routers/channels.ts"))
health = strip_comments(read("src/server/lib/portals/health.ts"))

m = re.search(r"enum\s+ChannelType\s*\{([^}]*)\}", schema)
if not m:
    fails.append("no ChannelType enum found in the schema — nothing to check against")
    TYPES_ENUM: list[str] = []
else:
    TYPES_ENUM = re.findall(r"[A-Z][A-Z_]+", m.group(1))

if not TYPES_ENUM:
    fails.append("ChannelType is empty — a parse failure, not an empty product")


def block(src: str, name: str) -> str:
    """The text of one declaration, by brace or bracket matching.

    Opens at the first bracket **after the `=`**, not the first bracket
    after the name. The first version took whichever came first, so
    `const CREDENTIALLED: Partial<Record<(typeof TYPES)[number], ...>>`
    returned the type parameter `(typeof TYPES)` and every channel
    looked undeclared — the audit reporting six failures where the
    truth was four. A parser that finds the wrong text is a check that
    is wrong in the direction of alarm, which costs as much as one that
    is wrong in the direction of silence.
    """
    i = src.find(name)
    if i < 0:
        return ""
    eq = src.find("=", i)
    if eq < 0:
        return ""
    open_at = min((p for p in (src.find("{", eq), src.find("[", eq), src.find("(", eq)) if p > 0), default=-1)
    if open_at < 0:
        return ""
    pairs = {"{": "}", "[": "]", "(": ")"}
    close = pairs[src[open_at]]
    depth = 0
    for j in range(open_at, len(src)):
        if src[j] == src[open_at]:
            depth += 1
        elif src[j] == close:
            depth -= 1
            if depth == 0:
                return src[open_at:j + 1]
    return ""


surfaces = {
    "TYPES (the list a brokerage may connect)": block(channels, "const TYPES"),
    "IDENTIFIER (what the form asks for)": block(channels, "const IDENTIFIER"),
}
for label, text in surfaces.items():
    if not text:
        fails.append(f"could not find {label} in channels.ts — the audit is reading the wrong file")
        continue
    for t in TYPES_ENUM:
        checked += 1
        if t not in text:
            fails.append(f"{t} is a ChannelType and is missing from {label}")

# 1. An explicit credential decision, either way.
credentialled = block(channels, "CREDENTIALLED")
no_credential = block(channels, "NO_CREDENTIAL")
if not credentialled:
    fails.append("CREDENTIALLED not found in channels.ts — it was inside connect(), which is how it drifted from list()")
else:
    for t in TYPES_ENUM:
        checked += 1
        if t not in credentialled and t not in no_credential:
            fails.append(
                f"{t} makes no credential decision — add it to CREDENTIALLED if it holds a token, "
                f"or to NO_CREDENTIAL if it does not. Being absent from both is how META_LEAD_ADS "
                f"was accepted with an access token that went nowhere."
            )

# 2. The silence alarm judges every channel it is given, and only real ones.
silence = block(health, "SILENCE_HOURS")
# Types the sweep deliberately never looks at, read from the query that
# excludes them: `where: { active: true, type: { not: "WHATSAPP" } }`.
# Parsed by pattern rather than by `block()`, which opens at an `=` and
# there is none here — the first attempt found nothing and reported a
# missing threshold for a channel excluded on purpose.
excluded = " ".join(re.findall(r'not:\s*"([A-Z_]+)"', health))
if not silence:
    fails.append("SILENCE_HOURS not found in portals/health.ts")
else:
    for t in TYPES_ENUM:
        checked += 1
        if t in silence:
            continue
        if t in excluded or f'"{t}"' in excluded:
            continue
        fails.append(
            f"{t} has no silence threshold and is not excluded from the sweep — "
            f"a feed of this type going quiet would be noticed by nobody"
        )
    for named in re.findall(r"([A-Z][A-Z_]{3,}):", silence):
        checked += 1
        if named not in TYPES_ENUM:
            fails.append(f"SILENCE_HOURS names {named}, which is not a ChannelType — a threshold guarding nothing")

# 3. THE ONE THAT WOULD HAVE CAUGHT META. A route that ingests must report.
routes = sorted((app / "src/app/api/webhooks").rglob("route.ts"))
ingesting = []
for r in routes:
    src = strip_comments(r.read_text(encoding="utf-8"))
    if "ingestEnquiry(" not in src:
        continue
    ingesting.append(r)
    checked += 1
    if "markChannelHealthy(" not in src:
        fails.append(
            f"{r.relative_to(app)} ingests enquiries and never calls markChannelHealthy — "
            f"lastSyncAt stays null, checkChannelSilence() skips the channel for ever, "
            f"and a feed that stops delivering is invisible"
        )
if not ingesting:
    fails.append("no webhook route calls ingestEnquiry — the audit is looking in the wrong place")

# 4. One writer for lastSyncAt, so rule 3 cannot be sidestepped.
writers = []
for p in sorted((app / "src").rglob("*.ts")):
    if "lastSyncAt:" not in strip_comments(p.read_text(encoding="utf-8")):
        continue
    src = strip_comments(p.read_text(encoding="utf-8"))
    # Reading it in a `select` is not writing it.
    for match in re.finditer(r"lastSyncAt:\s*([^\s,}]+)", src):
        if match.group(1) not in ("true", "false"):
            writers.append(str(p.relative_to(app)))
            break
checked += 1
if len(set(writers)) > 1:
    fails.append(
        "lastSyncAt is written in more than one place — " + ", ".join(sorted(set(writers))) +
        ". One writer, so 'a delivery is recorded' cannot be true in one route and false in another."
    )
elif not writers:
    fails.append("nothing writes lastSyncAt — the silence alarm has no input at all")

# 5. Every alarm can be closed.
ingest_src = strip_comments(read("src/server/lib/portals/ingest.ts"))
checked += 1
if "lastError: null" not in ingest_src:
    fails.append("markChannelHealthy does not clear lastError — a delivery arriving is the proof the fault is over")
checked += 1
if "lastError: null" not in channels:
    fails.append(
        "nothing in channels.ts clears lastError — the runbook tells whoever reads it to reconnect "
        "in Settings → Channels, and doing that has to close the incident it asked for"
    )

print(f"{len(TYPES_ENUM)} channel type(s): {', '.join(TYPES_ENUM)}")
print(f"{len(ingesting)} ingesting webhook route(s)")
print(f"{checked} assertion(s)")

if notes:
    print("\nNotes:")
    for n in notes:
        print(f"  ! {n}")

print()
if fails:
    print(f"{len(fails)} FAILURE(S)")
    for f in fails:
        print(f"  x {f}")
    sys.exit(1)
print("0 failure(s) — every channel type is accounted for on every surface")
