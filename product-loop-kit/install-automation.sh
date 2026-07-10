#!/usr/bin/env bash
# ONE-TIME setup: makes the loop system fully autonomous.
# After this runs, everything is: built -> verified -> auto-merged -> pushed -> Vercel deploys production.
# You never need a terminal again; Cowork messages you daily with what shipped and what to test.
set -uo pipefail
cd "$(dirname "$0")/.."   # repo root

echo "── 0/3 self-heal: stale lock + remote drift"
# Interactive ship: if no git process is actually running, any lock is a leftover — clear it.
if [ -f .git/index.lock ]; then
  if pgrep -x git >/dev/null 2>&1; then
    echo "a git process is genuinely running — close your editor's git operation and rerun"; exit 1
  fi
  rm -f .git/index.lock && echo "removed leftover git lock"
fi
git checkout main --quiet 2>/dev/null || true
git pull --rebase --autostash origin main || { echo "rebase conflict — tell Claude in Cowork, don't force anything"; exit 1; }

echo "── 1/3 commit + push pending approved loop work"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "feat: approved loop work — see product-loop-kit/LOG.md"
fi
git push origin main || { echo "push failed — check git credentials, then rerun"; exit 1; }

echo "── 2/3 install schedule (weekdays: heartbeat 08:00, build loops 09:00)"
REPO="$(pwd)"
CLAUDE_BIN="$(command -v claude || true)"
if [ -z "$CLAUDE_BIN" ]; then echo "claude CLI not on PATH — install/alias it, then rerun"; exit 1; fi
( crontab -l 2>/dev/null | grep -v 'product-loop-kit' ;
  echo "0 8 * * 1-5 cd $REPO && $CLAUDE_BIN -p \"\$(cat product-loop-kit/prompts/heartbeat.md)\" --permission-mode acceptEdits >> product-loop-kit/logs/heartbeat.log 2>&1" ;
  echo "0 9 * * 1-5 cd $REPO && ./product-loop-kit/loop.sh 3 >> product-loop-kit/logs/cron-build.log 2>&1" ;
  echo "*/15 * * * * cd $REPO && bash product-loop-kit/ship-tick.sh >> product-loop-kit/logs/ship.log 2>&1"
) | crontab -

echo "── 3/3 verify"
crontab -l | grep product-loop-kit
echo ""
echo "Done. Nothing else to run — ever. Builds auto-merge and push per NORTH_STAR policy;"
echo "Vercel deploys main to production; Cowork messages you what shipped and what to test."
echo "(Note: cron only fires while this Mac is awake.)"
