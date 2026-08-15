#!/usr/bin/env bash
#
# One command before a deploy.
#
# The alternative was twenty-five commands in a particular order —
# a type-check, eleven check suites, thirteen audit scripts — and the
# thing about a twenty-five-command ritual is that somebody eventually
# runs twenty-four of them, and it is never the same twenty-four.
#
#   npm run verify          # the gate
#   npm run verify --load   # plus the seeding load check (minutes)
#
# ---------------------------------------------------------------------
# Why this FAILS without a database rather than skipping
#
# Seven of the eleven suites need Postgres, and one of those seven is
# the tenant-isolation check — the thing that proves one brokerage
# cannot read another's leads, which is the entire security promise of
# this product.
#
# The tempting design is to skip those seven when there is no database
# so the command still passes on a laptop. That is exactly the failure
# this project is built to catch: **a check that reads nothing must not
# be able to look like a pass.** A green "verify" that silently did not
# test tenancy is worse than no command at all, because somebody would
# deploy on the strength of it.
#
# So: no database, no pass. For the laptop case where you genuinely only
# want the four that do not need one:
#
#   VERIFY_ALLOW_NO_DB=1 npm run verify
#
# which prints, loudly and in the summary, exactly which suites did not
# run. You can still see a green tick — you just cannot see one that
# doesn't say what it skipped.
# ---------------------------------------------------------------------
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
APP="$PWD"
ROOT="$APP/../.."

WITH_LOAD=0
for a in "$@"; do [ "$a" = "--load" ] && WITH_LOAD=1; done

bold=$'\033[1m'; red=$'\033[31m'; green=$'\033[32m'; yellow=$'\033[33m'; off=$'\033[0m'

# Suites that open a connection. Kept as a list rather than inferred,
# because inferring it from imports is the sort of cleverness that goes
# quietly wrong the day somebody adds a query to a pure check.
NEEDS_DB="tenancy intake intelligence autonomy buyers search load"
# `routing` needs the application running as well as Postgres — it posts a
# signed webhook — so it sits with check:whatsapp-inbound below rather
# than in the loop.

failed=(); skipped=(); ran=0

have_db() {
  [ -n "${DATABASE_URL:-}" ] || grep -q '^DATABASE_URL=' .env 2>/dev/null || return 1
  command -v pg_isready >/dev/null 2>&1 || return 0   # cannot tell; try it
  pg_isready -q 2>/dev/null
}

DB=0; have_db && DB=1

step() {                      # step <label> <command...>
  local label="$1"; shift
  printf '  %-22s' "$label"
  local out; out=$("$@" 2>&1); local code=$?
  if [ "$code" -eq 0 ]; then
    printf '%s✓%s\n' "$green" "$off"; ran=$((ran + 1))
  else
    printf '%s✗  exit %s%s\n' "$red" "$code" "$off"
    printf '%s\n' "$out" | tail -25 | sed 's/^/      │ /'
    failed+=("$label")
  fi
}

printf '\n%sPotatoFarm.io — verify%s\n' "$bold" "$off"
printf '%s\n' "──────────────────────────────────────────────────────────"

if [ "$DB" -eq 0 ]; then
  if [ "${VERIFY_ALLOW_NO_DB:-0}" = "1" ]; then
    printf '%s!  No database. Seven suites will not run.%s\n' "$yellow" "$off"
    printf '   Tenant isolation is one of them — this run does not\n'
    printf '   prove one brokerage cannot read another'"'"'s leads.\n\n'
  else
    printf '\n%s✗  Postgres is not accepting connections.%s\n\n' "$red" "$off"
    printf '   Seven of the eleven suites need it, including the\n'
    printf '   tenant-isolation check. Start it:\n\n'
    printf '     pg_ctlcluster 16 main start\n     npx prisma migrate deploy\n\n'
    printf '   Or run only the four that do not need a database, which\n'
    printf '   will say so in its summary:\n\n'
    printf '     VERIFY_ALLOW_NO_DB=1 npm run verify\n\n'
    exit 1
  fi
fi

printf '\n%sTypes%s\n' "$bold" "$off"
step "tsc --noEmit" npx tsc --noEmit

printf '\n%sUnit tests%s\n' "$bold" "$off"
# Pure functions, no database, milliseconds. Deliberately before the
# check suites: if the window arithmetic or the money formatter is wrong,
# there is no point spending two minutes seeding Postgres to find out.
step "vitest" npm run --silent test

printf '\n%sChecks%s\n' "$bold" "$off"
for name in tenancy intake intelligence voice deals autonomy buyers search sigv4 storage load; do
  if [ "$name" = "load" ] && [ "$WITH_LOAD" -eq 0 ]; then
    skipped+=("check:load (use --load; it seeds a database)"); continue
  fi
  if [ "$DB" -eq 0 ] && [[ " $NEEDS_DB " == *" $name "* ]]; then
    skipped+=("check:$name (no database)"); continue
  fi
  step "check:$name" npm run --silent "check:$name"
done

# The one check that needs the application running, not just Postgres.
#
# It posts a signed WhatsApp webhook at the real route and asserts a
# lead, a conversation and a message come out the other side — the whole
# inbound path, which is the product's reason to exist and which failed
# silently for its entire life: `lead.upsert` was called with an invalid
# `update` clause, the route had already answered Meta with 200, and the
# rejection went to a console nobody reads.
#
# Probed rather than assumed, and named in the skip list when it does not
# run. A gate that quietly leaves out its most important check is the
# failure this file was written to stop.
printf '\n%sEnd to end%s\n' "$bold" "$off"
# `APP` is already this script's variable for the application directory
# (line 40), so the URL cannot borrow that name — the probe reported
# "no application at /home/user/.../app" and skipped the check on a
# machine where the server was running perfectly.
APP_URL="${APP_URL:-http://localhost:3000}"
# The shell environment *or* `.env`, because the check itself is run with
# `node --env-file-if-exists=.env`. Reading only the shell variable
# skipped it on every developer machine, where the secret is in the file
# — a guard that reports "not configured" about something that is.
has_secret=0
[ -n "${WHATSAPP_APP_SECRET:-}" ] && has_secret=1
[ "$has_secret" -eq 0 ] && [ -f .env ] && grep -Eq '^WHATSAPP_APP_SECRET=.*[^"[:space:]]' .env && has_secret=1

if [ "$has_secret" -eq 0 ]; then
  skipped+=("check:whatsapp-inbound (WHATSAPP_APP_SECRET is not set)")
elif ! curl -sf -o /dev/null --max-time 3 "$APP_URL/api/health" 2>/dev/null \
     && ! curl -s -o /dev/null --max-time 3 "$APP_URL" 2>/dev/null; then
  skipped+=("check:whatsapp-inbound (no application at $APP_URL — run npm run dev)")
else
  step "check:whatsapp-inbound" npm run --silent check:whatsapp-inbound
  step "check:routing" npm run --silent check:routing
  step "check:availability" npm run --silent check:availability
  # The register, and then the real nightly job over its own cron route.
  # A copy of the job's filter here would pass while `documents.expiry`
  # itself found nothing, which is the state this was written to end.
  step "browser:documents" npm run --silent browser:documents
  # Every screen opened in a real browser, and every link it renders
  # followed. Slow — around six minutes — and it is the only check that
  # sees what the screens actually do, which is where the two worst
  # faults in this codebase were hiding.
  step "browser:screens" npm run --silent browser:screens
fi

printf '\n%sAudits%s\n' "$bold" "$off"
step "13 audit scripts" bash "$ROOT/04-audit-scripts/run-all.sh"

printf '\n%s\n' "──────────────────────────────────────────────────────────"

if [ "${#skipped[@]}" -gt 0 ]; then
  printf '%s%s skipped:%s\n' "$yellow" "${#skipped[@]}" "$off"
  for s in "${skipped[@]}"; do printf '  - %s\n' "$s"; done
  printf '\n'
fi

if [ "${#failed[@]}" -gt 0 ]; then
  printf '%s%s FAILED:%s %s\n\n' "$red" "${#failed[@]}" "$off" "${failed[*]}"
  exit 1
fi

if [ "${#skipped[@]}" -gt 0 ]; then
  printf '%s%s passed, %s skipped.%s Not a full gate — read the list above.\n\n' \
    "$yellow" "$ran" "${#skipped[@]}" "$off"
  exit 0
fi

printf '%sAll %s passed.%s\n\n' "$green" "$ran" "$off"
