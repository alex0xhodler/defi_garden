# 110 notes — KPI read-from-DB (compute-kpis.js) · build 2026-07-21

Spec: `product-loop-kit/specs/108.md` §"110 — BUILD read-from-DB". Branch: `claude/nice-bell-pniwyn`.

## What shipped
- `compute-kpis.js`: new pure `reshapeDbRows(rows)` + async `fetchDbHistory(endpoint, token, days)`;
  `enrich()` gained an optional `historyOverride` 3rd arg (single line changed: `const history = (historyOverride != null) ? historyOverride : readHistory(dataDir)`); `main()` is now async and prefers the D1 `/history` endpoint when `HISTORY_ENDPOINT` is set, honest fallback to files otherwise. New exports.
- `.github/workflows/sitemap-update.yml`: `env: HISTORY_ENDPOINT/HISTORY_TOKEN` (from secrets) on the KPI step only.
- `test_kpi_db_source.js` (new, 7 assertions) wired into `npm test` after `test_compute_kpis.js`.
- `package.json` test chain updated.

## Deviations / conservative choices (data for the improve loop)
1. **Intraday collapsed to DAILY buckets (deliberate).** The spec lists "intraday granularity" as a
   benefit of the DB leg, but `reshapeDbRows` groups rows by UTC calendar day (latest row per pool per
   day wins). Rationale: the load-bearing acceptance criterion is *byte-identical KPI fields DB-path vs
   file-path on the same data*. Keeping one point-per-day makes daily-cadence DB data provably
   byte-equivalent to the file path and introduces ZERO change to live KPI values. The >30-day window
   benefit (days=90 vs 30-file retention) is realised now; widening to true intraday points is a safe,
   separately-verifiable follow-up once the DB path is proven live (it would change KPI values — more
   points → Sharpe activates sooner / different stdev — so it should not ride in silently on this ticket).
2. **Local file append/retention kept as-is.** `appendHistory` still writes today's `data/history/<date>.json`
   regardless of source (keeps the file fallback fresh; daily commit cadence untouched). Worker-side
   `DELETE WHERE ts < …` (shipped in 109) owns DB retention; file retention stays as the fallback's own
   30-day prune. Spec §110 explicitly says keep files "as the fallback initially".
3. **15s AbortController timeout** on the fetch so a hung endpoint can never stall the daily CI job
   (NORTH_STAR: never wait unbounded). Timeout/any error → honest log + file fallback, CI never fails.
4. **No-op until 108.** `HISTORY_ENDPOINT` unset (current prod — keystone 108 not provisioned) →
   `historyOverride` stays null → file path → byte-identical to today. Confirmed by running
   `node compute-kpis.js` with no env: zero D1 log lines, zero `data/` changes.

## Trust rails / scope
- No trust-rail code touched. Rails ($10M TVL floor, keep-anomalous) are enforced at WRITE time in the
  poller (109, unchanged). compute-kpis never filters/reorders/drops — it only adds `kpis` (unchanged).
- No request-path backend: the browser FE never calls the Worker. The only new `fetch` is in
  `compute-kpis.js`, which runs in CI Node, not the client. (grep: no client-side Worker fetch added.)
- Attribution untouched.

## Tests
- `node test_kpi_db_source.js` → 7 assertions, exit 0 (shape, intraday collapse, guards, apy-round+tvl-coerce, **byte-equivalence DB-vs-file**, fetchDbHistory happy-path via localhost stub asserting `Bearer`+`?days=90`, fail-closed-on-401 rejects).
- `node test_compute_kpis.js` → 20 assertions, exit 0 (no regression; existing 2-arg `enrich` callers unaffected).

## Risk tier
HIGH — touches `.github/workflows/` (config/infra, NORTH_STAR risk map). Not on the NEVER list (no
trust-rail weakening, no credentials handled in-repo — secrets are GitHub-side, provisioned by the human
under keystone 108; no SEO deletion; no out-of-scope dirs).
