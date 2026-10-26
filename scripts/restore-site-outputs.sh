#!/usr/bin/env bash
# Copy the generated site outputs (scripts/site-outputs.txt) from a checkout of
# the published site repo into this working tree.
#   CI:     scripts/restore-site-outputs.sh "$RUNNER_TEMP/site"
#   Local:  scripts/restore-site-outputs.sh   (shallow-clones the site repo first)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC="$(mktemp -d)/site"
  git clone --quiet --depth 1 https://github.com/alex0xhodler/defi_garden-site.git "$SRC"
fi
cd "$SRC"
shopt -s nullglob
grep -vE '^\s*(#|$)' "$ROOT/scripts/site-outputs.txt" | while read -r pattern; do
  for p in $pattern; do
    [ -e "$p" ] || continue
    mkdir -p "$ROOT/$(dirname "$p")"
    rsync -a --delete "$p" "$ROOT/$(dirname "$p")/"
  done
done
echo "Restored generated site outputs from $SRC"
