#!/usr/bin/env bash
# Ralph runner — Loop 2. One backlog item per iteration, fresh context every time.
# Usage: ./product-loop-kit/loop.sh [iterations]   (default 1)
# Watch your first ~10 runs. Failure patterns you spot are Loop 4's raw material.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root
ITERS="${1:-1}"
mkdir -p product-loop-kit/logs

# Self-heal before building: clear leftover git lock (no live git process = leftover),
# then sync with remote — the sitemap GitHub Action commits to main daily.
if [ -f .git/index.lock ] && ! pgrep -x git >/dev/null 2>&1; then
  rm -f .git/index.lock && echo "removed leftover git lock"
fi
git pull --rebase --autostash origin main 2>&1 | tail -1

# Ship queue: the Cowork operator drops this marker after verifier-PASSing agent work
# in the working tree. Commit + push it before building so approved work always ships
# on the next tick even if the human never opens a terminal.
if [ -f product-loop-kit/.ship-queue ]; then
  git add -A
  if ! git diff --cached --quiet; then
    git commit -m "feat: approved loop work — $(head -1 product-loop-kit/.ship-queue) (see product-loop-kit/LOG.md)"
    git push origin main && rm -f product-loop-kit/.ship-queue && echo "ship-queue: pushed approved work"
  else
    rm -f product-loop-kit/.ship-queue
  fi
fi

for i in $(seq 1 "$ITERS"); do
  echo "════ build loop $i/$ITERS · $(date '+%F %H:%M') ════"
  claude -p "$(cat product-loop-kit/prompts/build.md)" \
    --permission-mode acceptEdits \
    2>&1 | tee -a "product-loop-kit/logs/build-$(date +%F).log"
  echo "════ iteration $i done — check LOG.md / PRs ════"
  if [ "$i" -lt "$ITERS" ]; then
    echo "next iteration in 15s — Ctrl+C to stop"
    sleep 15
  fi
done

# Ship: push merges to main → Vercel deploys production automatically
git push origin main 2>&1 | tail -1 || echo "push failed — will retry on next run"
