#!/usr/bin/env bash
#
# Restore a backup into a scratch database and prove it is usable.
#
# A backup nobody has restored is a hypothesis. This turns it into a
# fact, and it is designed to be run on a schedule rather than during
# the incident that needs it.
#
#   ./scripts/restore-drill.sh <dump-file> [scratch-db-name]
#
# ## The check that matters most is not "did rows come back"
#
# It is **whether row-level security came back with them.**
#
# Tenant isolation in this product is not application logic — it is
# Postgres policies plus a `potato_app` role that owns nothing and has
# no BYPASSRLS. A dump taken or restored the wrong way can bring every
# table and every row back perfectly while dropping the policies, or
# restore them under a superuser who bypasses them anyway. The result
# looks like a completely successful recovery and is a cross-tenant data
# breach the first time anyone signs in.
#
# `pg_dump` does include policies. The failure mode is human: restoring
# as the wrong role, into a database whose roles do not exist, or
# with `--no-owner --no-privileges` bolted on to make an error go away.
# So the drill asserts it rather than assuming it.
set -uo pipefail

DUMP="${1:-}"
SCRATCH="${2:-restore_drill_$(date +%s)}"
SUPER="${PGSUPERUSER:-postgres}"

bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'; off=$'\033[0m'
bad=0
ok() { # ok <label> <condition-exit> <detail>
  if [ "$2" -eq 0 ]; then printf '  %s✓%s %s%s\n' "$green" "$off" "$1" "${3:+  — $3}"
  else printf '  %s✗%s %s%s\n' "$red" "$off" "$1" "${3:+  — $3}"; bad=$((bad+1)); fi
}

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "usage: $0 <dump-file> [scratch-db-name]"
  echo "  produce one with:  pg_dump --format=custom --file=backup.dump \"\$DATABASE_URL_DIRECT\""
  exit 2
fi

printf '\n%sRestore drill%s\n\n' "$bold" "$off"
printf '  dump    %s (%s)\n' "$DUMP" "$(du -h "$DUMP" | cut -f1)"
printf '  into    %s\n\n' "$SCRATCH"

cleanup() { psql -U "$SUPER" -tAc "DROP DATABASE IF EXISTS \"$SCRATCH\";" >/dev/null 2>&1; }
trap cleanup EXIT

psql -U "$SUPER" -tAc "DROP DATABASE IF EXISTS \"$SCRATCH\";" >/dev/null 2>&1
psql -U "$SUPER" -tAc "CREATE DATABASE \"$SCRATCH\";" >/dev/null 2>&1
ok "scratch database created" $?

# Errors are surfaced, not hidden. A restore that emits warnings and
# exits 0 is the one that quietly dropped something.
RESTORE_LOG=$(mktemp)
pg_restore --no-owner --role="$SUPER" --dbname="$SCRATCH" --username="$SUPER" "$DUMP" \
  >"$RESTORE_LOG" 2>&1
RC=$?
# `grep -c` exits 1 when it finds nothing, so `|| echo 0` appended a
# second line and the count became "0\n0" — which is not an integer and
# broke the comparison below. `|| true` keeps the single value.
ERRS=$(grep -ci "error:" "$RESTORE_LOG" 2>/dev/null || true)
ERRS=${ERRS:-0}
ok "pg_restore completed" "$([ "$RC" -le 1 ] && echo 0 || echo 1)" "exit $RC, $ERRS error line(s)"
[ "$ERRS" -gt 0 ] && sed 's/^/      │ /' "$RESTORE_LOG" | grep -i "error:" | head -5
rm -f "$RESTORE_LOG"

q() { psql -U "$SUPER" -d "$SCRATCH" -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

TABLES=$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
ok "schema restored" "$([ "${TABLES:-0}" -gt 60 ] && echo 0 || echo 1)" "$TABLES tables"

ORGS=$(q "SELECT count(*) FROM \"Organisation\";")
LEADS=$(q "SELECT count(*) FROM \"Lead\";")
ok "data restored" "$([ "${ORGS:-0}" -gt 0 ] && echo 0 || echo 1)" "$ORGS org(s), $LEADS lead(s)"

# --- the tenant boundary, which is the whole point of the drill -------

RLS_ON=$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relrowsecurity;")
ok "row-level security is enabled on the restored tables" \
   "$([ "${RLS_ON:-0}" -gt 20 ] && echo 0 || echo 1)" \
   "$RLS_ON table(s) with RLS — a restore that loses this is a cross-tenant breach"

POLICIES=$(q "SELECT count(*) FROM pg_policies WHERE schemaname='public';")
ok "the policies themselves came back" \
   "$([ "${POLICIES:-0}" -gt 20 ] && echo 0 || echo 1)" "$POLICIES policy/policies"

FORCED=$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relforcerowsecurity;")
ok "FORCE ROW LEVEL SECURITY survived" \
   "$([ "${FORCED:-0}" -gt 0 ] && echo 0 || echo 1)" \
   "$FORCED table(s) — without FORCE, the owning role silently bypasses every policy"

APPROLE=$(q "SELECT count(*) FROM pg_roles WHERE rolname='potato_app';")
ok "the restricted application role exists" \
   "$([ "${APPROLE:-0}" -eq 1 ] && echo 0 || echo 1)" \
   "$([ "${APPROLE:-0}" -eq 1 ] && echo "potato_app present" || echo "potato_app MISSING — the app cannot connect, and creating it by hand risks granting too much")"

# Grants came back at all.
#
# **This assertion was added because the drill passed without it.** A
# dump taken with `--no-privileges` restored every table, every row and
# every policy, and the append-only check below still said yes — because
# "potato_app cannot UPDATE AuditLog" is trivially true when potato_app
# has been granted nothing whatsoever. The database was intact and the
# application could not read a single row from it.
#
# So the positive case is asserted first: the role can do its job.
CAN_READ=$(q "SELECT CASE WHEN has_table_privilege('potato_app','\"Lead\"','SELECT')
              THEN 1 ELSE 0 END;")
ok "the app role can actually read" \
   "$([ "${CAN_READ:-0}" -eq 1 ] && echo 0 || echo 1)" \
   "$([ "${CAN_READ:-0}" -eq 1 ] && echo "SELECT on Lead" \
      || echo "no grants restored — was the dump taken with --no-privileges?")"

# And only then the negative: the audit log must remain append-only, or
# the record an AML investigation depends on becomes editable.
AUDIT_REVOKED=$(q "SELECT CASE WHEN has_table_privilege('potato_app','\"AuditLog\"','UPDATE')
                   THEN 0 ELSE 1 END;")
ok "the audit log is still append-only for the app role" \
   "$([ "${AUDIT_REVOKED:-0}" -eq 1 ] && echo 0 || echo 1)" \
   "UPDATE/DELETE must stay revoked"

MIGRATIONS=$(q "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
ok "migration history intact" "$([ "${MIGRATIONS:-0}" -gt 0 ] && echo 0 || echo 1)" \
   "$MIGRATIONS applied — a restore without this makes the next deploy re-run everything"

printf '\n'
if [ "$bad" -eq 0 ]; then
  printf '%sthe backup restores to a working, still-isolated database.%s\n\n' "$green" "$off"
  exit 0
fi
printf '%s%s check(s) failed — this backup is not a recovery plan.%s\n\n' "$red" "$bad" "$off"
exit 1
