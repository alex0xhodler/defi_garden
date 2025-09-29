#!/usr/bin/env bash
set -euo pipefail

# Configuration
INKVEST_REMOTE_URL=${INKVEST_REMOTE_URL:-}
TELEGRAM_DIR=${TELEGRAM_DIR:-telegram-bot}
TEMP_REPO_DIR="/tmp/inkvest-split-$$"

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

if [ -z "$INKVEST_REMOTE_URL" ]; then
  echo "Error: set INKVEST_REMOTE_URL to the new empty GitHub repo URL" >&2
  exit 1
fi

echo "🚀 Starting repository split using git filter-branch..."
echo "📁 Source directory: $TELEGRAM_DIR"
echo "🔗 Target repository: $INKVEST_REMOTE_URL"

# Configure git
git config user.name "alex0xhodler"
git config user.email "alex@0xhodler.nl"

# Create a temporary clone
echo "📋 Creating temporary repository..."
rm -rf "$TEMP_REPO_DIR"
git clone "$REPO_ROOT" "$TEMP_REPO_DIR"
cd "$TEMP_REPO_DIR"

# Configure git in temp repo
git config user.name "alex0xhodler"
git config user.email "alex@0xhodler.nl"

# Use git filter-branch to extract only the telegram-bot directory
echo "🌳 Extracting $TELEGRAM_DIR history with git filter-branch..."
git filter-branch --force --prune-empty --subdirectory-filter "$TELEGRAM_DIR" -- --all

# Move everything from telegram-bot to root (if needed)
echo "📦 Restructuring files to repository root..."

# Add README for the new repository
cat > README.md << EOF
# Inkvest - DeFi Telegram Bot

A sophisticated Telegram bot for automated DeFi yield farming and portfolio management.

## Features

- 🔄 Auto-deploy funds to highest yielding protocols
- 💰 Real-time balance monitoring
- 📊 Portfolio management and tracking
- ⚡ Gasless transactions (sponsored gas)
- 🔐 Secure wallet management with encryption
- 🌾 Multi-protocol yield farming (Aave, Compound, Morpho, etc.)

## Quick Start

1. Install dependencies: \`npm install\`
2. Copy \`.env.example\` to \`.env\` and configure
3. Run in development: \`npm run dev\`
4. Run in production: \`npm start\`

## Documentation

See the various \`.md\` files in the repository for detailed documentation on:
- Bot integration templates
- Pool integration guides
- Production deployment
- Development setup

## Architecture

The bot is built with:
- **Grammy** for Telegram Bot API
- **TypeScript** for type safety
- **Viem** for Ethereum interactions
- **SQLite** for local data storage
- **PM2** for process management

Originally part of the [defi.garden](https://github.com/alex0xhodler/defi_garden) project.
EOF

git add README.md
git commit -m "docs: add repository README for inkvest bot

Added comprehensive README covering:
- Feature overview
- Quick start guide
- Architecture details
- Links to existing documentation"

# Set up remote and push
echo "🔗 Setting up remote and pushing to GitHub..."
git remote remove origin
git remote add origin "$INKVEST_REMOTE_URL"
git branch -M main
git push -u origin main --force

echo "✅ Successfully created inkvest repository!"

# Now clean up the original repository
echo "🧹 Cleaning up original repository..."
cd "$REPO_ROOT"

# Remove telegram-bot directory
git rm -r "$TELEGRAM_DIR"
git commit -m "chore: migrate telegram bot to separate inkvest repository

The inkvest telegram bot has been moved to its own repository:
$INKVEST_REMOTE_URL

This separation provides:
- Independent development workflows
- Separate CI/CD pipelines  
- Better security isolation
- Focused issue tracking
- Cleaner project structure

The bot maintains full git history in the new repository."

# Push the cleanup
if git remote get-url origin >/dev/null 2>&1; then
  git push origin main
fi

# Clean up temp directory
rm -rf "$TEMP_REPO_DIR"

# Target directory for local clone
PARENT_DIR=$(dirname "$REPO_ROOT")
INKVEST_TARGET_DIR="$PARENT_DIR/inkvest"

if [ ! -e "$INKVEST_TARGET_DIR" ]; then
  echo "📁 Creating local clone at $INKVEST_TARGET_DIR..."
  git clone "$INKVEST_REMOTE_URL" "$INKVEST_TARGET_DIR"
  cd "$INKVEST_TARGET_DIR"
  git config user.name "alex0xhodler"
  git config user.email "alex@0xhodler.nl"
fi

echo "----------------------------------------"
echo "✅ Repository split complete!"
echo "📁 Original repo: $REPO_ROOT (telegram-bot removed)"
echo "🔗 New inkvest repo: $INKVEST_REMOTE_URL"
echo "📂 Local inkvest clone: $INKVEST_TARGET_DIR"
echo ""
echo "🎉 Both repositories are ready for independent development!"
echo ""
echo "Next steps:"
echo "1. cd $INKVEST_TARGET_DIR"
echo "2. npm install"
echo "3. Copy .env file if needed"
echo "4. Test the bot: npm run dev"