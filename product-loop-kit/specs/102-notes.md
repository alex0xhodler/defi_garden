# 102 — build-loop notes (2026-07-15)

## Outcome: BLOCKED at pickup-analysis (no product code written)

Picked 102 as the sole READY item. Wrote its spec from evidence (no spec existed), and in doing
the required blindspot/territory pass discovered the item's premise is unbuildable without a
NEVER-list violation. Escalated to the human instead of guessing.

## The conservative choice

The backlog row assumed 059's snapshot is a drop-in source for the SEO generators. Verified in
code + data that it is NOT:
- snapshot floor = $10M (`data/pools-snapshot.json` `minTvlUsd`), 719 pools / 330 tokens.
- `generate-token-pages.js` floor = $100K (line 60, human directive 2026-07-11).
- `generate-sitemap.js` URL-enumeration floor = $1000 (line 129).
- committed surface = 2,103 token pages + 86 chain pages.

Repointing → ~1,770+ pages/URLs de-indexed = NORTH_STAR NEVER-list ("deleting or de-indexing SEO
surface"). Did not build. Did not merge. Left the item BLOCKED with a two-option question (A: new
SEO-tier snapshot item / B: drop 102) for the human.

## Deviation from the ralph build path

- No `loop/<item-id>` product branch with code — there is no safe code to write. The only commit
  is bookkeeping (spec + this note + BACKLOG status + LOG). Per the harness NEVER-list handling,
  the PR is left OPEN, not merged.
- Verifier subagent NOT invoked: build.md §4 verifies a *diff against acceptance criteria*; there
  is no product diff to verify. The blocker is a documented factual conflict (measured numbers in
  102.md), not a judgment call.

## For the improve loop

The heartbeat promoted 102 as "BUILDABLE NOW" citing 058 §8, but 058 §8 predates 059's actual
$10M-rail implementation. Promotion should re-read the *shipped* artifact, not the pre-build study,
before tagging an item BUILDABLE — the study's aspiration and the implementation optimized
opposite axes (SEO long-tail coverage vs FE payload size).
