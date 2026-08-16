#!/usr/bin/env bash
#
# Run every audit against the thing it is actually meant to read.
#
# There are fourteen scripts and they do not take the same argument.
# Some want the application, some want the website, `claims.py` wants
# both in order, and `consistency.py` wants the repository root because
# its whole job is comparing surfaces to each other.
#
# Nobody remembers that. What happened instead is that the suite was run
# with one path passed to all fourteen, and the ones pointed at the
# wrong tree found nothing and exited 0 — `audit.py` checked a single
# generated preview file instead of ten pages, and `consistency.py`
# compared four surfaces it could not open and reported perfect
# consistency.
#
# **A check that reads nothing must not be able to look like a pass.**
# This script is how that stops happening: one command, correct
# arguments, and a summary that names anything non-zero.
#
#   ./04-audit-scripts/run-all.sh          # from the repository root
#   ./04-audit-scripts/run-all.sh -v       # with each script's full output
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ROOT="$PWD"
APP="02-the-project/app"
SITE="02-the-project/website"
DESIGN="03-brand/design-system"
S="04-audit-scripts"

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

# script : arguments
CHECKS=(
  "architecture.py|$APP"
  "crm-audit.py|$APP"
  "deep-audit.py|$APP"
  "reachability.py|$APP"
  "security.py|$APP"
  "ux-audit.py|$APP"
  "responsive.py|$SITE"
  "audit.py|$SITE"
  "contrast.py|$SITE"
  "site-deep.py|$SITE"
  "claims.py|$SITE $APP"
  "design-audit.py|$SITE $APP $DESIGN"
  "consistency.py|$ROOT"
  # Every contrast ratio written in a comment, against the colour beside
  # it. `contrast.py` computes ratios from the stylesheet and never reads
  # what the comments claim — which is how three files came to describe a
  # palette two generations old in prose while shipping the right hexes.
  "ratios.py|$ROOT"
)

pass=0; fail=0; failed=()

printf '\n%s\n' "Running ${#CHECKS[@]} audits"
printf '%s\n\n' "──────────────────────────────────────────────────────────"

for entry in "${CHECKS[@]}"; do
  script="${entry%%|*}"
  args="${entry#*|}"
  # shellcheck disable=SC2086
  out=$(python3 "$S/$script" $args 2>&1); code=$?

  if [ "$code" -eq 0 ]; then
    pass=$((pass + 1))
    # Warnings and notes do not fail a run, but they should be visible
    # rather than buried in output nobody prints.
    n=$(printf '%s' "$out" | grep -cE '^\s+(!|-) ' || true)
    printf '  \033[32m✓\033[0m %-18s %s\n' "$script" \
      "$([ "$n" -gt 0 ] && echo "($n advisory)" || echo "")"
  else
    fail=$((fail + 1)); failed+=("$script")
    printf '  \033[31m✗\033[0m %-18s exit %s\n' "$script" "$code"
    printf '%s\n' "$out" | grep -E '^\s+x ' | sed 's/^/      /'
  fi

  [ "$VERBOSE" -eq 1 ] && printf '%s\n' "$out" | sed 's/^/    │ /'
done

printf '\n%s\n' "──────────────────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s of %s passed.\033[0m\n\n' "$pass" "${#CHECKS[@]}"
  exit 0
fi
printf '\033[31m%s failed:\033[0m %s\n\n' "$fail" "${failed[*]}"
exit 1
