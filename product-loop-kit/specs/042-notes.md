# 042 — build notes

## What was done
Uncommented the 7 disabled `Analytics.*` calls in `app.js` (see spec for exact list). No logic changes — each call is byte-identical to its pre-disable form, only the `// Analytics disabled: ` prefix removed.

## Investigation (this session)
The checkout started as a shallow clone; unshallowed it (`git fetch --unshallow origin`) to trace the disable history, since the report explicitly required root-causing the disable before re-enabling.

Traced to three same-day commits from 2025-08-21:
- `a9b8550` disabled ALL `Analytics.track*` calls app-wide to fix a real `'Cannot read properties of undefined'` render crash.
- `adc8fd7` re-enabled the safe ones same day, explicitly kept two categories disabled by name: real-time search-input tracking and "complex filter combination tracking that caused crashes."
- `eff82dda` fixed a syntax slip from (2).

Confirmed via `git log -S"Analytics disabled" -- app.js` that these three commits are the entire disable history — nothing since has touched it.

## Why re-enabling is safe now
`app.js` has been substantially rewritten since Aug 2025. Checked every one of the 7 disabled call sites: each passes a freshly-built object literal (or string literals) to `Analytics.*`, never a possibly-undefined value. `analytics.js`'s helper functions (`serializeFilters`, `getFiltersActiveCount`, `calculateFilterEffectiveness`) only throw if their `filters` parameter itself is undefined/null — never for a missing field — so this specific crash class cannot recur at these call sites as they exist today.

## Deviation from spec: one call site is unreachable dead code
While live-verifying via Playwright, found that `handlePoolTypeToggle` (app.js:2241, contains the re-enabled `trackFilterChange('pool_type', ...)` call) is **never invoked anywhere in app.js**. The live pool-type UI (`.google-nav-tab` buttons, app.js:2549-2561) calls `setSelectedPoolTypes(...)` directly, bypassing this handler entirely. This is a pre-existing condition, not something introduced by this change or by the original 2025-08-21 disable — the handler function and its disabled call were simply orphaned at some point when the pool-type filter UI was rebuilt as nav tabs. Re-enabling the call is harmless (it can never fire since nothing calls the function) but doesn't restore any working instrumentation. Left as-is per spec's surgical-diff scope — fixing the dead-code wiring is a separate UI bug, out of scope for an analytics-instrumentation item. Flagging for a future backlog item if the human wants `filter_change(pool_type)` data restored.

The two stale `// TODO: Re-enable` comments (app.js:1166, 1869) for real-time keystroke-level search tracking were confirmed superseded by the already-shipped completion-based `trackSearchSuccess`/`trackSearchAbandonment` (app.js:1764, 1967, live per `signals/2026-07-11.md`). Left untouched — not a real gap, and touching them would be unrelated scope creep.

## Verification
- `node --check app.js` — clean syntax.
- `test_smoke.js`: fails identically on this branch and on unmodified `origin/main` (confirmed via a throwaway worktree) — pre-existing sandbox network block on `unpkg.com`/`yields.llama.fi` (403 via the proxy), not a regression from this diff. Its one non-network assertion (040's JSON-LD check) still passes.
- Wrote a scratch Playwright script (not committed — reused test_search.js's local-vendored-React + fixture-pools routing pattern to work around the same network block) that drove the real rendered UI and exercised 6 of the 7 re-enabled call sites end-to-end: TVL filter change, protocol filter change, filter combination (2 concurrent filters), filters reset, and pool-detail back navigation. All 6 fired the expected Mixpanel event with the expected payload shape, and zero page/console errors occurred across the whole session — the direct regression check for the original crash mode. The 7th (pool_type) is confirmed unreachable dead code as documented above, so it cannot be exercised via any UI path, live or otherwise.
- `test_search.js`: 20/20 green (exercises app.js's search/filter rendering broadly; would have caught a general render regression).
- `test_canonical.js`: 24/24 green (unrelated surface, confirms nothing else broke).
- `test_planner.js`: 190/190 green.
- `test_protocol_parsing.js` / `test_qualifier_fix.js`: ran clean (no assertion-count harness, output inspected manually).
- Diff: `app.js` only, 7 one-line changes (comment prefix removed) — well under the LOW-tier 150-line cap, no new dependencies.
