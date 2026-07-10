#!/usr/bin/env bash
# Ship tick — runs every 15 min via cron. Ships operator-approved work with zero human action.
# The Cowork operator drops product-loop-kit/.ship-queue after verifier-PASSing agent work;
# this script commits + pushes it (Vercel then deploys main to production).
set -uo pipefail
cd "$(dirname "$0")/.."

[ -f product-loop-kit/.ship-queue ] || exit 0

# Leftover lock with no live git process = crash artifact; a live git process = try next tick.
if pgrep -x git >/dev/null 2>&1; then exit 0; fi
rm -f .git/index.lock 2>/dev/null

git checkout main --quiet 2>/dev/null || true
git pull --rebase --autostash origin main >/dev/null 2>&1 || exit 0   # conflicts: leave for the human loop

git add -A
if ! git diff --cached --quiet; then
  git commit -m "feat: approved loop work — $(head -1 product-loop-kit/.ship-queue) (see product-loop-kit/LOG.md)" --quiet
fi

# Push covers both fresh commits and a previously-committed-but-unpushed state.
if git push origin main --quiet 2>/dev/null; then
  rm -f product-loop-kit/.ship-queue
  echo "$(date '+%F %H:%M') shipped: $(git log --oneline -1)"
fi
