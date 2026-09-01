#!/usr/bin/env bash
#
# Build the deployable copy of the marketing site.
#
#     ./02-the-project/website/package-site.sh
#
# ## Why this exists
#
# `potatofarm-site.zip` sat in the repository root for weeks holding a
# complete site on **#FF6B35 with black button labels** — the accent
# from five generations ago — while every source file and every loose
# asset measured correct. It was also missing ten files the live site
# had by then, including the favicon and all four product screenshots.
#
# It was untracked, so `git status` was clean. Nothing read inside it,
# so every audit was green. And it is the copy that gets handed to
# somebody or deployed, which is the whole reason a package exists —
# so it was simultaneously the most-used artefact and the only one
# nobody was checking.
#
# It went stale because it was built by hand, once. This script is the
# answer to that: rebuilding is one command, and `palette.py` now reads
# inside the archive and fails the build if its colours disagree with
# the live stylesheet.
#
# ## What it excludes, and why that is not arbitrary
#
# `og.mjs`, `shots.mjs` and `serve.mjs` generate assets and serve the
# site locally; they are development tools and shipping them would put
# a local web server into a public bundle. `DEPLOY.md` is the runbook
# for the person deploying, not a page.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$(cd "$HERE/../.." && pwd)/potatofarm-site.zip"

# Regenerate first, so the package can never contain a stale rendered
# asset. Both are skipped rather than failing the build when their
# dependencies are not running — an OG card from the previous palette
# is exactly what this script exists to prevent, so say so loudly.
if curl -sf -o /dev/null http://localhost:4321/assets/site.css; then
  ( cd "$HERE" && node og.mjs )
else
  echo "  ! serve.mjs is not running on :4321 — OG cards NOT regenerated."
  echo "    Start it and re-run, or the package may carry an old palette."
fi
if curl -sf -o /dev/null http://localhost:3000/sign-in; then
  ( cd "$HERE" && node shots.mjs )
else
  echo "  ! the app is not running on :3000 — screenshots NOT regenerated."
fi

rm -f "$OUT"
( cd "$HERE" && zip -q -r -X "$OUT" . \
    -x "*.mjs" -x "package-site.sh" -x "DEPLOY.md" \
    -x ".DS_Store" -x "__MACOSX/*" )

echo "  wrote $OUT ($(unzip -Z1 "$OUT" | wc -l | tr -d ' ') files)"
echo "  now run: python3 04-audit-scripts/palette.py ."
