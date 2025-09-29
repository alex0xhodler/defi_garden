#!/usr/bin/env bash
set -euo pipefail

# Inputs:
#   INKVEST_REMOTE_URL   required, e.g. git@github.com:yourorg/inkvest.git
#   INKVEST_TARGET_DIR   optional, where to place the new repo (default: ../inkvest)
#   TELEGRAM_DIR         optional, defaults to telegram-bot

INKVEST_REMOTE_URL=${INKVEST_REMOTE_URL:-}
TELEGRAM_DIR=${TELEGRAM_DIR:-telegram-bot}

# Resolve repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$REPO_ROOT" ]; then
  echo "Error: run this script inside a git repository (defi-garden-neumorphic)" >&2
  exit 1
fi
cd "$REPO_ROOT"

# Sanity checks
if [ ! -d "$TELEGRAM_DIR" ]; then
  echo "Error: folder '$TELEGRAM_DIR' not found at $REPO_ROOT" >&2
  exit 1
fi

# Require clean working tree
if ! git diff-index --quiet HEAD --; then
  echo "Error: uncommitted changes present. Commit or stash before running." >&2
  exit 1
fi

# Ensure git subtree is available
git subtree >/dev/null 2>&1
SUBTREE_EXIT_CODE=$?
if [ $SUBTREE_EXIT_CODE -ne 129 ] && [ $SUBTREE_EXIT_CODE -ne 0 ]; then
  echo "Error: git subtree not available. Install a Git version with subtree support." >&2
  exit 1
fi

# Detect default branch
DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | awk -F/ '{print $2}')
if [ -z "$DEFAULT_BRANCH" ]; then
  if git show-ref --verify --quiet refs/heads/main; then
    DEFAULT_BRANCH=main
  elif git show-ref --verify --quiet refs/heads/master; then
    DEFAULT_BRANCH=master
  else
    DEFAULT_BRANCH=$(git branch --show-current)
  fi
fi
if [ -z "$DEFAULT_BRANCH" ]; then
  echo "Error: could not determine default branch" >&2
  exit 1
fi

echo "🔍 Detected default branch: $DEFAULT_BRANCH"

# Configure local author
git config user.name "alex0xhodler"
git config user.email "alex@0xhodler.nl"
echo "✅ Configured git author as pepem00n"

# Update to latest on default branch (if remote exists)
echo "🔄 Switching to $DEFAULT_BRANCH and updating..."
git checkout "$DEFAULT_BRANCH"
if git remote get-url origin >/dev/null 2>&1; then
  git pull --ff-only || true
fi

# Create fresh subtree split branch
echo "🌳 Creating subtree split for $TELEGRAM_DIR..."
if git show-ref --verify --quiet refs/heads/inkvest-split; then
  git branch -D inkvest-split
fi
git subtree split --prefix="$TELEGRAM_DIR" -b inkvest-split

# Target directory for the new repo
if [ -z "${INKVEST_TARGET_DIR:-}" ]; then
  PARENT_DIR=$(dirname "$REPO_ROOT")
  INKVEST_TARGET_DIR="$PARENT_DIR/inkvest"
fi
if [ -e "$INKVEST_TARGET_DIR" ]; then
  echo "Error: target dir '$INKVEST_TARGET_DIR' already exists. Set INKVEST_TARGET_DIR to a new path." >&2
  exit 1
fi

echo "📁 Creating new repository at: $INKVEST_TARGET_DIR"

# Materialize new repository from the split branch
mkdir -p "$INKVEST_TARGET_DIR"
cd "$INKVEST_TARGET_DIR"
git init
git checkout -b main
git config user.name "alex0xhodler"
git config user.email "alex@0xhodler.nl"
git remote add source "$REPO_ROOT"
git fetch source inkvest-split
git reset --hard FETCH_HEAD
git remote remove source

echo "✅ New repository created with complete git history"

# Push new repo to provided remote
if [ -z "$INKVEST_REMOTE_URL" ]; then
  echo "Error: set INKVEST_REMOTE_URL to the new empty GitHub repo URL (ssh or https)" >&2
  exit 1
fi
echo "🚀 Pushing to remote: $INKVEST_REMOTE_URL"
git remote add origin "$INKVEST_REMOTE_URL"
git push -u origin main

# Remove telegram-bot from original repo and push
echo "🧹 Cleaning up original repository..."
cd "$REPO_ROOT"
git rm -r "$TELEGRAM_DIR"
git commit -m "chore: split inkvest (telegram-bot) into separate repository

The telegram bot code has been moved to its own repository at:
$INKVEST_REMOTE_URL

This separation allows for:
- Independent development cycles
- Separate CI/CD pipelines
- Better security isolation
- Focused issue tracking"

if git remote get-url origin >/dev/null 2>&1; then
  git push origin "$DEFAULT_BRANCH"
fi

# Clean up temporary branch
git branch -D inkvest-split

echo "----------------------------------------"
echo "✅ Split complete!"
echo "📁 New repo path: $INKVEST_TARGET_DIR"
echo "🔗 Pushed to: $INKVEST_REMOTE_URL (branch: main)"
echo "🌿 Original repo updated on branch: $DEFAULT_BRANCH"
echo "🧹 Temporary branch cleaned up"
echo ""
echo "Next steps:"
echo "1. Verify the new inkvest repo is working: cd $INKVEST_TARGET_DIR"
echo "2. Update any CI/CD configurations"
echo "3. Update documentation links if needed"