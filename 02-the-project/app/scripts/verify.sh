#!/usr/bin/env bash
#
# One command before a deploy.
#
# The alternative was twenty-five commands in a particular order —
# a type-check, sixteen check suites, fourteen audit scripts — and the
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
NEEDS_DB="tenancy notify-isolation intake intelligence autonomy killswitch buyers search qualification quiet migration vault visibility load agent-tasks team-changes commission-lifecycle job-runner lead-editing listing-agent"
# `billing` needs Postgres *and* the application — it posts a signed
# payment webhook at the real route — so it sits in the end-to-end block
# below rather than here. It was in this loop, which is why the first CI
# run to reach the gate failed on it: most of the suite passed against
# the database and the webhook section then reported the application
# unreachable, in a job that never starts one.
# `routing` needs the application running as well as Postgres — it posts a
# signed webhook — so it sits with check:whatsapp-inbound below rather
# than in the loop.

failed=(); skipped=(); ran=0

have_db() {
  local url="${DATABASE_URL:-}"
  # The laptop case: the value is in `.env` and this shell has not
  # sourced it. Read it out rather than only noting that it exists,
  # because the probe below needs the value and not its presence.
  if [ -z "$url" ] && [ -f .env ]; then
    url=$(sed -n 's/^DATABASE_URL=//p' .env | head -1 | tr -d "\"'")
  fi
  [ -n "$url" ] || return 1
  command -v pg_isready >/dev/null 2>&1 || return 0   # cannot tell; try it

  # Probe the database this run will actually use, not libpq's default.
  #
  # A bare `pg_isready` cost this project its entire CI history. With no
  # arguments libpq connects to a **local Unix socket**; on a CI runner
  # Postgres is a service container on TCP at the host and port
  # `DATABASE_URL` names, and there is no socket at all. So this gate
  # failed on every push ever made — first step, nothing tested, while
  # the steps either side of it connected to that same database over TCP
  # without complaint.
  #
  # It passed on a laptop for a reason unrelated to what it was asking:
  # a developer machine has a socket, so the probe answered "yes, some
  # Postgres is up" to the question "is *our* Postgres up". That is this
  # repository's oldest pattern — a check that cannot fail where it
  # matters, green for an accident of its environment.
  #
  # The query string goes because `?schema=public` is Prisma's parameter
  # and libpq rejects it outright — `invalid URI query parameter:
  # "schema"`, exit 3 — which would fail the probe for the wrong reason
  # and read identically to a database that is down.
  #
  # Proved in both directions before being trusted: exit 0 against the
  # live port, exit 2 against a port with nothing listening.
  pg_isready -q -d "${url%%\?*}" 2>/dev/null
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
    printf '%s!  No database. The suites that need one will not run.%s\n' "$yellow" "$off"
    printf '   Tenant isolation is one of them — this run does not\n'
    printf '   prove one brokerage cannot read another'"'"'s leads.\n\n'
  else
    printf '\n%s✗  Postgres is not accepting connections.%s\n\n' "$red" "$off"
    printf '   Most of the check suites need it, including the\n'
    printf '   tenant-isolation check. Start it:\n\n'
    printf '     pg_ctlcluster 16 main start\n     npx prisma migrate deploy\n\n'
    printf '   Or run only the suites that do not need a database, which\n'
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
for name in tenancy notify-isolation intake intelligence voice deals autonomy killswitch buyers agent-tasks team-changes commission-lifecycle job-runner lead-editing listing-agent search qualification quiet migration vault visibility bands sigv4 storage limits preflight load; do
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
  # The brokerage's own website, which is the one inbound channel that
  # needs nobody's agreement — and was the one that did not work. Every
  # post to the URL the settings screen printed answered 404 for the
  # life of the product, because `adapters` held only PROPERTY_FINDER.
  # Needs no secret of any kind, so unlike the two Meta suites it can
  # never be skipped for want of configuration.
  step "check:website-form" npm run --silent check:website-form
  # Listings going out, which is the other half and had no check at all.
  # A portal fetches the feed on a schedule; nothing recorded that it
  # had, so a portal that stopped collecting was invisible while the
  # route's own comment claimed the silence alarm was watching.
  step "check:listing-feed" npm run --silent check:listing-feed
  # The one route where row-level security is deliberately off — a
  # calendar client cannot sign in, so the tenant boundary is a
  # hand-written where clause rather than the database. Both halves of
  # it are asserted against a counter-example, including the one a
  # single-brokerage fixture cannot see.
  step "check:calendar-feed" npm run --silent check:calendar-feed
  # The Speak button. Almost none of that route is *reachable* without a
  # transcription provider — `transcriptionConfigured()` is checked
  # before the rate limit and before every validation — so the size
  # caps, the format allowlist and the iOS mp4 filename had never
  # executed anywhere. Needs a stand-in, like the Meta suite.
  voice_ready=1
  for v in TRANSCRIBE_API_KEY TRANSCRIBE_BASE_URL; do
    eval "val=\${$v:-}"
    if [ -z "$val" ] && [ -f .env ]; then
      val=$(sed -n "s/^$v=//p" .env | head -1 | tr -d "\"'")
    fi
    [ -z "$val" ] && { voice_ready=0; missing_voice="$v"; break; }
  done
  if [ "$voice_ready" -eq 0 ]; then
    skipped+=("check:voice-note ($missing_voice is not set)")
  else
    step "check:voice-note" npm run --silent check:voice-note
  fi
  # The other inbound front door, and the one whose failure is
  # unrecoverable. A Meta webhook carries only a `leadgen_id`; the
  # answers are fetched back with the Page token inside a retention
  # window, so a token that has stopped working is leads **lost**, not
  # delayed. It needs a third thing the WhatsApp check does not: the
  # application must be running against the suite's loopback stand-in,
  # because there is no payload to replay.
  #
  # `META_GRAPH_BASE` is read here as a proxy for that, and the proxy
  # holds for the reason it is set in `.env` — Next loads the same file,
  # so a value this shell can see is a value the server was started
  # with. Guarded rather than attempted, because the failure mode of
  # running it against a server pointed at the real Graph is a red gate
  # that blames the product for a configuration difference.
  meta_ready=1
  for v in META_APP_SECRET META_VERIFY_TOKEN META_GRAPH_BASE; do
    eval "val=\${$v:-}"
    if [ -z "$val" ] && [ -f .env ]; then
      val=$(sed -n "s/^$v=//p" .env | head -1 | tr -d "\"'")
    fi
    [ -z "$val" ] && { meta_ready=0; missing_meta="$v"; break; }
  done
  if [ "$meta_ready" -eq 0 ]; then
    skipped+=("check:meta-inbound ($missing_meta is not set)")
  else
    step "check:meta-inbound" npm run --silent check:meta-inbound
  fi
  step "check:routing" npm run --silent check:routing
  step "check:availability" npm run --silent check:availability
  # The register, and then the real nightly job over its own cron route.
  # A copy of the job's filter here would pass while `documents.expiry`
  # itself found nothing, which is the state this was written to end.
  step "browser:documents" npm run --silent browser:documents
  # The owner's brief. `vendors.brief` returned `listings` and
  # `lastReportedAt` from the day it was written and the component read
  # neither — two queries per page load producing data nobody saw, on
  # the one screen whose purpose is what to say when you ring an owner.
  step "browser:vendor-brief" npm run --silent browser:vendor-brief
  # Enforcement. The negative assertion is the one that matters: a
  # brokerage with no documents recorded is not stopped from working.
  step "check:blocking" npm run --silent check:blocking
  # Whether the company can take money, which is the other half of a
  # business the revenue screen only reports on. The invoice arithmetic
  # is database-only, but the payment webhook is posted at the real
  # route over HTTP — and it has to be, because the fault it just
  # caught lived in the route rather than in the arithmetic: a missing
  # `STRIPE_WEBHOOK_SECRET` made `createHmac` throw above the handler's
  # try, so the endpoint answered 500 to a correctly signed event. 500
  # is the one status the provider retries.
  step "check:billing" npm run --silent check:billing
  # What the brokerage earned, against the ledger it came from.
  #
  # Needs the application rather than just Postgres, deliberately: read
  # over HTTP it exercises the permission gate, the row-level security
  # scope and superjson on the wire in the arrangement that ships. The
  # assertion that matters is that every agent's share sums to the
  # received total **exactly** — shares of a fee added to the fee again
  # reports a year's earnings at twice its value, with no error
  # anywhere, in front of whoever is reading the number.
  step "check:revenue" npm run --silent check:revenue
  # The logo as a browser draws it. `consistency.py` reads the source
  # and fingerprints the potato; it cannot see that the wordmark beside
  # it is the wrong colour on every screen, which it was.
  step "browser:brand" npm run --silent browser:brand
  # The palette as a browser resolves it. `contrast.py` reads the
  # stylesheet and `consistency.py` compares the four places the colours
  # are declared; neither can see what a page paints. The last palette
  # move shipped `text-accent-type` to 42 call sites that generated no
  # CSS at all, and every source-reading check passed.
  step "browser:option1" npm run --silent browser:option1
  # The typography as a browser resolves it. A scale is exactly as easy
  # to get wrong silently as a palette was: `cn()` was deleting the new
  # size classes wherever a colour class followed, because tailwind-merge
  # assumes an unrecognised `text-<word>` is a colour. Fourteen call
  # sites rendered at the inherited 16px and every source-reading check
  # passed.
  step "browser:type" npm run --silent browser:type
  # Every screen opened in a real browser, and every link it renders
  # followed. Slow — around six minutes — and it is the only check that
  # sees what the screens actually do, which is where the two worst
  # faults in this codebase were hiding.
  step "browser:screens" npm run --silent browser:screens
fi

printf '\n%sAudits%s\n' "$bold" "$off"
# Counted rather than stated. The label read "14 audit scripts" while
# there were fifteen — a number in a string that nothing checked, which
# is the exact thing `counts.py` was written to stop.
#
# And then the count itself was wrong, one glob narrower than the thing
# it describes: `*.py` alone, while `run-all.sh` dispatches on the
# extension precisely because one audit is not Python. It reported "21
# audit scripts" for a run of 22, so the one that needs a browser — the
# only one that reads the site as a reader sees it — was missing from
# the number in the very line that ran it.
AUDIT_N=$(ls "$ROOT/04-audit-scripts"/*.py "$ROOT/04-audit-scripts"/*.mjs 2>/dev/null | wc -l | tr -d ' ')
step "$AUDIT_N audit scripts" bash "$ROOT/04-audit-scripts/run-all.sh"

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
