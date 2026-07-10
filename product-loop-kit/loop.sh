#!/usr/bin/env bash
# Ralph runner — Loop 2. One backlog item per iteration, fresh context every time.
# Usage: ./product-loop-kit/loop.sh [iterations]   (default 1)
# Watch your first ~10 runs. Failure patterns you spot are Loop 4's raw material.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root
ITERS="${1:-1}"
mkdir -p product-loop-kit/logs

# Self-heal before building: clear stale git lock (>10 min old), then sync with
# remote — the sitemap GitHub Action commits to main daily on GitHub's side.
if [ -f .git/index.lock ] && [ -n "$(find .git/index.lock -mmin +10 2>/dev/null)" ]; then
  rm -f .git/index.lock && echo "removed stale git lock"
fi
git pull --rebase --autostash origin main 2>&1 | tail -1

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
