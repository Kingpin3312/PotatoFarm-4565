#!/usr/bin/env python3
"""
A deleted row stays deleted.

Three models are soft-deleted — `Lead`, `Listing`, `Organisation`. Soft
deletion is the right choice here (the audit log has `REVOKE UPDATE,
DELETE`, and UAE AML law requires five-year retention that overrides an
erasure request), but it has a cost that hard deletion does not: **every
single read has to remember the filter**, and the ones that forget are
silent. Nothing errors. A deleted person simply reappears.

This found seven reads that had forgotten, and the two worst were not
screens:

  - `visa-nudge.ts` filtered `optedOutOfOutreach` and not `deletedAt`, so
    a lead the brokerage had removed still received an **outbound
    WhatsApp message** about their visa expiring. Consent was thought
    about carefully there and erasure was not, which is the more
    expensive half to miss: an opt-out is a preference, a deletion is
    usually a request to be forgotten.
  - its `sweep()` read every organisation with no filter, so a closed
    brokerage went on sending on behalf of an account that no longer
    exists.

The rest: a reply drafted to a deleted lead, incoming mail attaching
itself to one, a conversion report counting them, an enquiry landing on a
withdrawn property, and a re-import silently skipping the one listing
somebody had deleted in order to bring it back in properly.

## How this reads the code

A filter can be inline, or built into a `where` variable just above the
call, or assembled by a helper. The first version of this check saw only
the inline case and reported 21 sites, of which 11 were false — the
pipeline board builds `scope` with `deletedAt: null` two lines up. So it
looks in the enclosing procedure as well, and at the helpers a file
defines.

That is a heuristic, and a heuristic that guesses wrong in the direction
of alarm gets switched off. `ALLOWED` is how a deliberate one is
recorded, with its reason.
"""
import os
import re
import sys
import glob

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SRC = os.path.join(ROOT, "src")

# Reads that must see everything, and why.
ALLOWED = {
    "server/lib/privacy/export.ts":
        "a subject access request covers everything the brokerage holds "
        "about somebody, including what it deleted — an export that hides "
        "the deletion answers a different question than the one asked",
}

READS = ("findMany", "findFirst", "count", "aggregate", "groupBy")


def strip_comments(t):
    """Prose is not a filter.

    The first version of this check could not fail, and the reason is
    worth keeping: the fix it was written to protect carries a comment
    explaining *why* `deletedAt: null` is there — and that comment
    contains the word `deletedAt`. Deleting the filter left the sentence
    about the filter behind, the substring search still matched, and the
    check stayed green over a bug that sends WhatsApp messages to deleted
    people.

    `palette.py` learned the same lesson about a stylesheet that names
    every colour it rejected. Strip the prose from both sides of any
    comparison, not just the side you are suspicious of.
    """
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    t = re.sub(r"^[ \t]*//.*$", " ", t, flags=re.M)
    return t


def soft_deleted(schema):
    return {
        m.group(1)
        for m in re.finditer(r"model (\w+) \{(.*?)\n\}", schema, re.S)
        if re.search(r"^\s*deletedAt\s+DateTime\?", m.group(2), re.M)
    }


def enclosing(src, pos):
    """The procedure or function body the call sits in."""
    starts = [
        m.end()
        for m in re.finditer(
            r"\.(?:query|mutation)\(|^export (?:async )?function \w+"
            r"|^\s{2}\w+:\s*(?:requirePermission|orgProcedure|publicProcedure)",
            src[:pos],
            re.M,
        )
    ]
    return src[starts[-1]:pos] if starts else src[:pos]


def main():
    schema_path = os.path.join(ROOT, "prisma/schema.prisma")
    if not os.path.exists(schema_path):
        print(f"  no schema at {schema_path}")
        return 1
    soft = soft_deleted(open(schema_path).read())
    if not soft:
        print("  no soft-deleted models found — this run proved nothing")
        return 1

    bad, allowed_hits = [], 0
    files = glob.glob(f"{SRC}/**/*.ts", recursive=True) + glob.glob(f"{SRC}/**/*.tsx", recursive=True)
    for f in files:
        rel = os.path.relpath(f, SRC)
        s = strip_comments(open(f).read())
        # Helpers this file defines can carry the filter for every caller.
        helpers_have_it = "deletedAt" in s and re.search(r"^(?:function|const) \w+", s, re.M)
        for m in re.finditer(
            r"\.(\w+)\.(" + "|".join(READS) + r")\(\s*\{(.{0,700}?)\}\s*\)", s, re.S
        ):
            cap = m.group(1)[0].upper() + m.group(1)[1:]
            if cap not in soft:
                continue
            call = m.group(3)
            if "deletedAt" in call:
                continue
            if "deletedAt" in enclosing(s, m.start()):
                continue
            # A read by primary key returns the row asked for and no more.
            if re.search(r"where:\s*\{\s*id:", call):
                continue
            if rel in ALLOWED:
                allowed_hits += 1
                continue
            # A `where` assembled by a helper in this file, e.g. leadWhere().
            if helpers_have_it and re.search(r"where:\s*\w+\(", call):
                continue
            bad.append((rel, s[: m.start()].count("\n") + 1, cap, m.group(2)))

    print("Erasure\n")
    print(f"  {len(soft)} soft-deleted model(s): {', '.join(sorted(soft))}")
    print(f"  {len(files)} source file(s) read")
    if allowed_hits:
        print(f"  {allowed_hits} deliberate read(s) of deleted rows, named in ALLOWED")

    if not bad:
        print("\n  a deleted row stays deleted.\n")
        return 0

    print(f"\n  {len(bad)} read(s) of a soft-deleted model with no deletedAt filter:\n")
    for rel, line, model, op in bad:
        print(f"    x {rel}:{line}  {model}.{op}")
    print(
        "\n  Nothing errors when one of these is wrong — a deleted person "
        "simply\n  reappears, and the worst of them send messages. Add "
        "`deletedAt: null`,\n  or record the read in ALLOWED with the reason "
        "it must see everything.\n"
    )
    return 1


sys.exit(main())
