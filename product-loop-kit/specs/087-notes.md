# 087 — build notes (phase 0, 2026-07-14)

Built on branch `claude/inspiring-meitner-0c8dc9` (harness-pinned; 2026-07-13 decision — one
commit, code + tests + bookkeeping together; PR is the audit log). Product code written by a
dispatched Opus agent per the 2026-07-12/2026-07-13 execution-model split.

## What shipped (phase 0 only — phase 1 Turso/libSQL stays BLOCKED on human secrets)

- **`compute-kpis.js`** (new, 316 lines, zero new deps, Node-18): runs AFTER the 059 snapshot step.
  1. Appends a slim per-date history point `data/history/<YYYY-MM-DD>.json`
     (`{schemaVersion,date,generatedAt,count,pools:{id:[apyTotal,tvlUsd]}}`) ONLY when the slim data
     differs from the most-recent retained point; keeps the newest `HISTORY_RETENTION=30`, prunes older.
  2. Computes a derived, null-safe `kpis` object per pool from the retained window and writes it INTO
     `data/pools-snapshot.json` + every per-chain/per-token slice (so 088 reads one file), under an
     all-or-nothing freshness gate.
  - KPIs: `historyPoints`, `firstSeen`, `apyMomentum` (Δ latest−earliest apyTotal, pct-pts),
    `apyStdev` (population stdev of apyTotal), `tvlTrend` ((latest−earliest)/earliest). Deltas are
    **null when <2 points** (honest "no track record yet"); `tvlTrend` also null when earliest TVL is 0.
  - Pure exported core (no `new Date()` inside it — dates injected) → `test_compute_kpis.js`.
- **`generate-pools-snapshot.js`** (+17/−3): `normalizeSnapshotContent` now also strips any per-pool
  `,?"kpis":{…}` for its freshness compare. Without this the 059 generator would strip-then-rewrite
  the kpi-enriched snapshot every run (infinite daily churn = a daily Vercel deploy). All 9 existing
  `test_pools_snapshot.js` assertions unchanged.
- **`.github/workflows/sitemap-update.yml`** (+7): new "Compute KPIs + retain history" step right after
  the 059 snapshot step; `compute-kpis.js` added to the `push:` `paths:`. `git add data` already covers
  `data/history`, so history + enriched snapshot ride the existing daily commit — no extra deploy.
- **`package.json`** (+1/−1): `test_compute_kpis.js` added to the `test` chain after `test_pools_snapshot.js`.
- **`test_compute_kpis.js`** (new, 286 lines, 15 assertions): slim/stdev/kpis math, null-safety,
  appendHistory freshness + 30-file pruning, enrich end-to-end (snapshot + slices gain kpis, pools not
  reordered/dropped), idempotency, missing-snapshot no-op, and the **churn-trap regression** (a
  kpi-enriched snapshot does NOT trigger a 059 rewrite).

## Verification run in-session
- `node test_pools_snapshot.js` → 9/9 (059 intact). `node test_compute_kpis.js` → 15/15.
- Offline real-pipeline smoke (committed 717-pool snapshot as fixture, network unavailable this run):
  enrich run 1 wrote `history/<date>.json` + kpis (first-day nulls, historyPoints:1); run 2 idempotent
  (nothing written); 059 rerun after enrich → "No data change" (churn-trap confirmed on real data).

## Full `npm test` chain (in-sandbox, 2026-07-14)
Ran the full 42-test `npm test` chain. It halts at **`test_compiled_assets.js`** with
`Error: Cannot find module '@babel/core'` — a **pre-existing environment gap** (compile-app.js
requires `@babel/core`, which is not present in this sandbox's node_modules and is not even a declared
dep; CI installs it differently). This halt point sits BEFORE 087's inserted `test_compute_kpis.js` in
the chain and 087 touches **none** of the involved files (compile-app.js / test_compiled_assets.js /
app.js), so it is diff-independent — same disclosure pattern as prior LOG entries (077/084) for
pre-existing sandbox test-chain halts. 087's own relevant suites pass standalone: `test_pools_snapshot.js`
9/9 and `test_compute_kpis.js` 15/15. No NEW failure is introduced by this item.

## Deviations / conservative choices
- **Enriched `data/` artifacts NOT committed in this PR.** The pipeline is code + CI wiring + tests.
  Real enriched artifacts (with live numbers + the first history point) are produced by the
  post-merge CI run: merging to main pushes `compute-kpis.js` (now in the workflow `paths:`), which
  triggers `sitemap-update.yml` → live fetch → snapshot → compute-kpis → committed. This keeps the PR
  focused/reviewable (no ~415-file kpi churn from a possibly-stale local snapshot) and lets the first
  history point carry live data. 088 reads kpis once that run lands.
- `enrich` does NOT rewrite `pools-snapshot-meta.json` (059 owns it; `bytes` is normalized out of the
  059 freshness compare, so a stale meta never causes churn). Meta carries no pools, so 088 is unaffected.
- `appendHistory` takes an optional 4th `generatedAt` arg (default `<date>T00:00:00.000Z`) to fill the
  file envelope deterministically without `new Date()` in the pure core.
- Phase 1 (Turso/libSQL ingestion) untouched — NEVER-list (credentials), stays BLOCKED on the human.
