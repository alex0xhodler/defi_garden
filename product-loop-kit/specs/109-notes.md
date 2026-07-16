# 109 — build notes / deviation log

## Deviation from spec 108's original prose: anomalous pools are KEPT, not dropped

Spec 108's first draft instructed the poller to "drop `apy > 1000` … anomalous NEVER stored" (old lines
59-60/79-80/84). **The build did the opposite — anomalous pools are KEPT with their real APY — and that
is the correct behavior.** Rationale:

- The shipped snapshot generator keeps anomalous pools: `generate-pools-snapshot.js:75-77` `isRailedIn`
  filters on TVL only (`tvlUsd >= DEFAULT_MIN_TVL`); the header comment (lines 18-22) states anomalous
  pools are KEPT and flagged client-side ("show flagged, never hide" — a trust-rail principle).
- `compute-kpis.js:21-24` builds history from that snapshot and never re-filters, so the file-history
  population already includes anomalous pools.
- Ticket 110 requires the DB path to be **byte-equivalent** to the file path. If the poller dropped
  anomalous pools, the D1 population would silently diverge from the snapshot/file-history, breaking that
  equivalence and dropping flagged pools from the KPI series entirely.

So keeping anomalous pools is what makes 109 consistent with the rails as actually shipped. Spec 108 has
been corrected in the same change; this note is the durable record so a future loop does not "fix" the
poller back to dropping them.

## Other decisions
- `apy = round(apyBase+apyReward, 4)` uses the exact `round()` from compute-kpis.js:50-54 (copied into
  poller-core.js) — required for 110 byte-equivalence.
- `schema.sql` adds `idx_ts` (beyond the spec's single `idx_pool_ts`) to support the retention
  range-delete; `IF NOT EXISTS` on table+indexes makes re-execution idempotent.
- `GET /history` fails CLOSED (503) when `READ_TOKEN` is unset — never serves data without a configured
  token; the guard runs before path routing so every path is authed.
- Cadence hourly (`crons = ["0 * * * *"]`); retention 90 days (`RETENTION_DAYS`, overridable via env).

## What is NOT verifiable in-sandbox
The Worker runtime + D1 binding cannot run here (no Cloudflare runtime). The pure trust-rail logic is
unit-tested offline (`test_poller.js` 21/21). The real end-to-end check is the human's `wrangler deploy`
(ticket 108) followed by the first cron write + a `GET /history` read.

## Verifier
PASS, HIGH tier, 5/5 (2026-07-16). Confirmed rail byte-equivalence with the snapshot, fail-closed auth,
non-vacuous tests, clean scope, no committed credentials. Flagged the spec-prose staleness (fixed here)
and the missing explainer (specs/109-pr.md, added).
