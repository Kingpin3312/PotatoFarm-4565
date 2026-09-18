#!/usr/bin/env python3
"""
Migration audit — does a migration quietly undo an earlier one?

## The failure this exists for

`prisma migrate dev` builds a shadow database from `schema.prisma`,
diffs it against the real one, and writes SQL to close the gap. Anything
the real database has that the schema file cannot express reads as
drift, and drift gets removed.

This project has eight such indexes. They are created with raw SQL in
`20260810090000_search_indexes` because Prisma's schema language cannot
express a `gin_trgm_ops` operator class:

    Lead_name_trgm, Lead_email_trgm, Lead_notes_trgm,
    Listing_title_trgm, Listing_reference_trgm,
    Vendor_name_trgm, ClientFact_body_trgm,
    Lead_org_status_stage_idx

**Two consecutive migrations generated a DROP for all eight**, minutes
apart, and the second did it after a note warning about the first had
been written into the repository. A note is not a control.

Nothing fails when they go. Every query still returns the right rows —
search simply stops using an index. Measured at 46-65ms on 5,000 leads
before, and a sequential scan after. It would surface months later as
"the app feels slow", with nothing in any log pointing here.

## The rule, and why it names no index

Listing the eight names would work today and go quiet the moment a ninth
is added — the exact way `mobile/_check.py` and the first version of
`palette.py` both failed. So the rule is structural instead:

    An index created by an earlier migration and dropped by a later one,
    with nothing re-creating it afterwards, is a failure.

That covers the eight, covers a ninth nobody has written yet, and covers
the same mistake made against a constraint or a trigger.

    python3 04-audit-scripts/migrations.py <repo-root>
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
MIGRATIONS = os.path.join(ROOT, "02-the-project/app/prisma/migrations")

# Drops that were investigated and are staying dropped, as (index,
# migration that dropped it). A ratchet in the spirit of
# `KNOWN_UNWRITTEN`: these two are excused, a third is a build failure.
#
# `lead_deleted_idx` and `listing_deleted_idx` covered (orgId, deletedAt)
# and were removed by the second migration in the chain. Checked rather
# than assumed:
#
#   * Nothing equivalent replaced them — confirmed against pg_indexes.
#   * **Every performance measurement this project has ever published was
#     taken after they were dropped.** The load test — 5,000 leads,
#     40,000 messages, pipeline first page at 4ms warm, search at
#     46-65ms — ran against exactly this index set.
#   * The access patterns are served by other orgId-leading composites
#     (Lead_orgId_status_idx, Lead_orgId_createdAt_idx and the rest),
#     which Postgres uses for the orgId prefix and then filters.
#
# So they are a lost optimisation nobody has measured a cost from, and
# re-adding them would be tuning against a number that does not exist.
# Recorded rather than restored, and recorded rather than deleted from
# the check, because the next one may not be benign.
KNOWN_DROPPED = {
    ("lead_deleted_idx", "20260809094139_auth_user_fields"),
    ("listing_deleted_idx", "20260809094139_auth_user_fields"),
}

CREATE = re.compile(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?'
                    r'(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?', re.I)
DROP = re.compile(r'DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?', re.I)


def strip_sql_comments(text):
    """`-- DropIndex` headers and any commented-out example SQL.

    A migration that *documents* a drop it deliberately did not perform
    is the correct outcome of this check, so the comment must not be
    read as the statement.
    """
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    return re.sub(r"^\s*--.*$", " ", text, flags=re.M)


def main():
    if not os.path.isdir(MIGRATIONS):
        print(f"no migrations directory at {MIGRATIONS} — nothing was checked")
        return 1

    names = sorted(
        d for d in os.listdir(MIGRATIONS)
        if os.path.isdir(os.path.join(MIGRATIONS, d))
    )

    # index name -> migration that most recently created it
    live = {}
    fails = []
    excused = []
    checked = 0

    for mig in names:
        path = os.path.join(MIGRATIONS, mig, "migration.sql")
        if not os.path.exists(path):
            continue
        sql = strip_sql_comments(open(path, encoding="utf-8").read())
        checked += 1

        # Drops are evaluated against what earlier migrations created,
        # before this migration's own creates are recorded — so a
        # drop-then-recreate inside one file is legitimate.
        recreated = {m.group(1) for m in CREATE.finditer(sql)}
        for m in DROP.finditer(sql):
            idx = m.group(1)
            if idx in live and idx not in recreated:
                if (idx, mig) in KNOWN_DROPPED:
                    excused.append((mig, idx))
                    continue
                fails.append((mig, idx, live[idx]))

        for m in CREATE.finditer(sql):
            live[m.group(1)] = mig

    print("Migration audit\n")
    print(f"  {checked} migration(s) read")
    print(f"  {len(live)} index(es) standing at the end of the chain\n")

    if fails:
        print(f"  {len(fails)} index(es) dropped and never re-created:\n")
        for mig, idx, born in fails:
            print(f"    x {idx}")
            print(f"        created by  {born}")
            print(f"        dropped by  {mig}")
        print()
        print("  If `migrate dev` wrote these, it is removing raw-SQL indexes it")
        print("  cannot see in schema.prisma. Delete the DROP statements from the")
        print("  generated migration and re-apply the ones already lost.")
        return 1

    if excused:
        print(f"  {len(excused)} known drop(s), investigated and staying dropped:")
        for mig, idx in excused:
            print(f"    - {idx}  ({mig})")
        print()
    print("  no migration undoes an index an earlier one created.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
