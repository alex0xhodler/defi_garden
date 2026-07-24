# 127 — build notes

## Decision: DROP (not rework)
Backlog said "drop/rework the raw-Sharpe line". Chose DROP. Rationale (also in spec §Decision):
- A qualitative rework needs an invented `apySharpe` threshold to decide what reads as "steady" — the note renders under BOTH the steady and the volatile "Tracked" track-record variant, so a threshold-free qualitative sentence would falsely assert steadiness for low-Sharpe pools (dishonest / trust-rail risk). Inventing an unvalidated band is a larger, arguably-HIGH-tier change.
- The kept first sentence (`rateTrackRecordSteady`, "Steady so far… easier to plan a garden around") already delivers the rate-stability message in ICP language for steady pools; the Sharpe line was redundant jargon.
- `apySharpe`'s real jobs (risk-adjusted sort 117.2 in app.js, planner tie-break in planner.js) are untouched — only the pool-detail display line is removed.

## Deviations from spec
None. Implemented exactly the 4 edits in specs/127.md.

## Conservative choices
- Removed the `rateSharpeNote` key from BOTH EN and KO (symmetric — no one-language edit), not just PoolDetail.js's call site, to avoid leaving a dead translation key. Grep-confirmed the only non-generated references were the two definitions + the deleted call site.
- Did NOT touch `pool-detail-styles.css` — the removed annotation had no own CSS class (it was an inline `marginTop:6px` child of `.rate-track-record-note`), so no style change was needed.
- Regenerated all three affected generated assets via `npm run compile && npm run minify` (never hand-edited generated files).

## Verification (build agent + independently re-run by the operator session)
- `node -c PoolDetail.js && node -c translations.js` → SYNTAX_OK
- `node test_kpi_sharpe_annotation.js` → 4/4 (flipped to assert the annotation is ABSENT while the first sentence + parent note still render, EN + KO)
- `node test_kpi_track_record.js` → 7/7 (sibling first-sentence note unbroken)
- `node test_northstar_cta_fires.js` → 7/7 (pool-detail render no-regression)
- `grep -c "Rate-stability score" / "rateSharpeNote"` across source + generated → all 0

## Execution model
Product code written by a dispatched Opus build agent (2026-07-13 execution-model decision — the routine model version is a routine-owner setting, not session-changeable). Operator session (spec/verification/ship) independently re-ran the tests above.
