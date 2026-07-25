# 134 — build notes

## What shipped
Docs-only STUDY: `docs/discovery-data-layer-134.md` — a decision doc recommending **option (b)
(keep live DefiLlama fallback for below-floor discovery)** over option (a) (serve a lower-floored
discovery dataset), with the concrete follow-up build for item 133.

## Deviations from spec
None. Spec 134 asked for a docs recommendation covering the floor map, the (a)/(b) tradeoff on
payload/latency + trust-framing + the 108 no-backend-read-path, the 133 dead-end path with file:line,
one recommendation, and a follow-up item. All delivered.

## Conservative choices
- Recommended (b), the option that changes no served floor and reverses no architectural tenet.
  Option (a3) (lower the poller/snapshot floor or read D1 FE-side) was explicitly flagged as a
  human-keystone reversal of 108 and NOT recommended — a loop should not infer its way into a
  backend read path.
- Did not build the 133 fix. 134 is a study; the human approves the follow-up.
- `src/poller.js` / `workers/` read-only (poller is in `src/`, but treated read-only — out-of-scope
  for edits per NORTH_STAR).

## Territory notes (architecture map, verified against current tree)
Every fast source floors at $10M by trust-rail design; the only sub-$10M data the pipeline computes
is the $1000-floored CI transient, which is ephemeral/uncommitted/never served.
- Snapshot floor $10M: `generate-pools-snapshot.js:52,76,218`. Committed `data/pools-snapshot.json`
  (736 rows, 327KB on disk / ~65KB gzip) + per-chain/token slices in `data/pools/{chain,token}/`.
- Poller floor $10M: `src/poller-core.js:19,48`. Writes D1 `pool_history` (`schema.sql:10-16`); FE
  never reads D1 (`wrangler.toml:4-5`, `src/poller.js:11`).
- CI transient floor $1000: `generate-pools-snapshot.js:306` (bare literal, full raw fields), written
  to `$RUNNER_TEMP/seo-pools.json` (`.github/workflows/sitemap-update.yml:72`), consumed by 4 SEO
  generators via `--fixture`/`POOLS_FIXTURE` (workflow:87/93/99/110). Not committed, not served.
- FE read path: `app.js:1085-1150`; eligibility `app.js:1133`; default minTvl `app.js:847`; live
  fallback `app.js:1088-1100`; escape hatch (minTvl-keyed only) `app.js:1158-1175`.
- 133 dead-end: `?token=X` with only sub-$10M pools → instant empty state at `app.js:2343-2344`
  (no live fetch), noindex `app.js:2390-2404`, alternatives re-floor at $10M `app.js:2359`. The
  escape hatch early-returns while `minTvl >= DEFAULT_MIN_TVL` (`app.js:1159`), so it never fires on
  an empty-token result.

## Measurement (payload)
Committed snapshot re-measured locally: 736 rows, 327,520 bytes on disk, 65,609 bytes gzip.
Live/projection numbers from `docs/feasibility-data-layer.md` §4a (2026-07-14). A served
$1000-floored 13-field discovery dataset ≈ 1.29 MB gzip — ~20× the current hot-path payload,
the core reason (a) loses.

## Verification
- Baseline test subset (`node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`)
  green before and after (docs-only change touches no runtime code).
- Verifier subagent judged the diff against spec 134 acceptance criteria.
