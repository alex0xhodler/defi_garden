# 194 — build notes

## Change made

1. `generate-protocol-urls.js`: new `buildUnreachable(protocols, population, fullMapping)` —
   the sorted list of population keys whose upstream protocol entry exists (by
   `protocolUrlKey(protocol.name)` or its `protocol.slug` alias) but was skipped by
   `buildUrlMapping()`'s `isValidHttpsUrl()` gate. A key with no upstream protocol entry at
   all never enters the skipped set in the first place, so it can never appear here —
   exactly the "genuine coverage gap, not by-design" distinction spec §3(A) requires.
   `buildArtifact()` now returns `{ schemaVersion, generatedAt, urls, unreachable }`.
   `SCHEMA_VERSION` untouched (still `1`). Exported `buildUnreachable` alongside the
   existing exports.

2. `audit-app.js`:
   - `readBakedProtocolUrls(overridePath)` — gained an optional `overridePath` param
     (test-only, defaults to the real committed path when omitted — see "deviation" below)
     and now returns `unreachable: Set|null` alongside the unchanged `keys` shape. `null`
     when the artifact's `unreachable` field is absent or isn't an array of strings.
   - `classifyCtaKind()` gained `opts.upstreamUnreachable` (tri-state) and the new branch
     exactly as spec §3(B) orders it: `undeterminable` → `upstream-null` (no tier +
     `upstreamUnreachable === true`, strict) → `defect` (no tier, otherwise) → `environment`
     → `defect`.
   - `CTA_KIND_SEVERITY['upstream-null'] = 'P2'`. `ctaFindingSeverity()` untouched.
   - The pool driver (~line 3089 pre-edit, now ~3095) resolves `upstreamUnreachable` via
     `projectHasUrl(baked.unreachable, project)` — the same slugified+raw key shapes
     `projectHasUrl()` already uses for the `baked`/`static` tiers — and, in the `fallback`
     branch only (mirroring where the `environment` reconciliation clause is appended),
     appends the by-design clause worded exactly as spec §3(B) specifies.

3. Regenerated `data/protocol-urls.json` via a live fetch (`node generate-protocol-urls.js`):
   **476 keys** in `urls` (was 476 pre-change — no net key churn this run beyond the day's
   ordinary protocol-set drift), **20 unreachable** keys, 20,736 bytes. The 20 unreachable
   keys matched spec §2's measured list byte-for-byte: `arkonix, atoma, basalt-vault, btcd,
   canto-lending, cube, gmd-protocol, goose-finance, gremlix, guru-network-classic,
   hydt-protocol, k613, landx-finance, meme-dollar, sdai, tender-finance, tizi, tortuga,
   unblock-equity, uwu-lend`. `sdai` is in the list, as expected.

4. New test file `test_audit_upstream_unreachable.js`, registered in `package.json`'s
   `test:serial` chain immediately after `test_audit_cta_provenance.js` (before
   `test_audit_text_surfaces.js`). Covers criteria 5, 7, 8. Criteria 1–4 were added directly
   to `test_audit_cta_provenance.js` (its existing home for `classifyCtaKind`/
   `ctaFindingSeverity` pure-function coverage). Criterion 6 was already covered, unchanged,
   by the existing `test_protocol_url_keys.js` (schemaVersion/keys-shape assertions — I did
   not touch that file, and it stayed green against the regenerated artifact).

## EN/KO

No user-facing string was added anywhere in this change (the new `detail` clause is
audit-tool-internal console/finding text, never rendered to an end user). The EN+KO parity
rule is therefore vacuously satisfied — stating this explicitly per the task instructions
rather than leaving it implied.

## Deviations from the spec / conservative choices

- **Added a test-only `overridePath` param to `readBakedProtocolUrls()`, plus a threaded
  `ctx.protocolUrlsPath` / `opts.protocolUrlsPath` / `AUDIT_PROTOCOL_URLS_PATH` override in
  `runAudit()`.** The spec doesn't ask for this explicitly, but criterion 8 requires a REAL
  RENDERED run where the `unreachable` evidence is genuinely withheld, and the task's own
  rules forbid mutating committed files during a test run. `readBakedProtocolUrls()`'s path
  was previously hardcoded to `path.join(ROOT, 'data', 'protocol-urls.json')` with no
  injection point. I added the smallest possible override, following the exact
  `opts.X || process.env.AUDIT_X || default` convention already used throughout this file
  (`AUDIT_SNAPSHOT_PATH`, `AUDIT_ROTATION_STATE`, `AUDIT_STATIC_PAGES`, etc.) — this is
  literally what the spec's own instruction ("Study how the existing audit tests
  inject/override disk state ... and use the same pattern") asks for. The default behavior
  (no override) is byte-identical to before; every existing call site
  (`readBakedProtocolUrls()`, no args) is unaffected. Criterion 8's test uses this to point
  the classifier at a tmpdir copy of the real artifact with `unreachable` stripped, and
  never writes to the committed `data/protocol-urls.json`.
- **Reworded, did not delete, the `:57` "sdai shape" assertion**, per the spec's explicit
  instruction — it now asserts `defect` for "no disk-side tier, no upstream-unreachable
  evidence supplied" (a real, still-correct shape: a genuine coverage gap, or evidence not
  passed) with a comment explaining that sdai's REAL shape now lands on the new
  `194 criterion 1` test instead.
- **Added print-outs for `unreachableCount`** in `generate-protocol-urls.js`'s `main()`
  console logging (both the no-op and the write path) — not required by any acceptance
  criterion, but the task asked me to report the regenerated artifact's unreachable count,
  and threading it through the CLI's own log output seemed like the natural, minimal way to
  make that observable on every future run, not just this one.
- **Ports 8990/8991** for the two new rendered `runAudit()` invocations in
  `test_audit_upstream_unreachable.js` — grep-confirmed unclaimed against every `port:
  <number>` literal across `test_*.js` before picking them (checked list included 8000,
  8796, 8799, 8820–8825, 8901–8908, 8930–8936, 8940, 8951–8962, 8971, 8972, 9000).
- **Criterion 7/8 both scope `only: ['pool-detail']`** and use the `poolIds` bare-comma-string
  override (`buildPoolSurfaces()`'s `overrideRaw.split(',')` contract — the array form
  throws, confirmed by re-reading `test_audit_pool_prescan.js:199`'s working example before
  writing these). This keeps both real-Chromium tests to a single rendered surface each —
  fast, and it also means neither test's `poolIds`-override mode reads or writes the
  committed rotation-state file (`buildPoolSurfaces()`'s override branch returns
  `rotationState: null` unconditionally), so no risk of touching
  `product-loop-kit/signals/audit-rotation.json`.

## Test commands run, with real pass/fail counts

- `node test_protocol_url_keys.js` → **10/10 passed** (criterion 6 — schemaVersion stayed 1,
  `urls` shape/coverage assertions all green, unchanged file).
- `node test_audit_cta_provenance.js` → **35 passed, 0 failed** (criteria 1–4, plus every
  pre-existing assertion in the file, including the reworded `:57` case and the real-data
  `sdai` positive-control case).
- `node test_audit_upstream_unreachable.js` (new file) → **3 passed, 0 failed** (criteria
  5, 7, 8 — including the non-vacuity guard actually flipping the finding back to P1
  `defect` when the evidence is withheld).
- `node test_audit_app.js` → 3 passed, 0 failed.
- `node test_audit_runner.js` → 9 assertions passed.
- `node test_audit_number_boundary.js` → 9 passed, 0 failed.
- `node test_seo_surface_audit.js` → 8 passed, 0 failed.
- `node test_audit_prescan.js` → 48 passed, 0 failed.
- `node test_audit_pool_prescan.js` → 14 passed, 0 failed.
- `node test_audit_text_surfaces.js` → 49 passed, 0 failed.
- `node test_audit_pool_link_liveness.js` → 12 passed, 0 failed.
- `node test_audit_planner_surface.js` → 9 passed, 0 failed.
- `node test_audit_planner_flow.js` → 11 passed, 0 failed.
- `node test_audit_i18n_parity.js` → 13 passed, 0 failed.
- `node test_protocol_parsing.js` → 9/9 passed.
- `node test_protocol_cta_baked.js` → 7/7 assertions passed.
- `node test_protocol_cta_fallback.js` → 4/4 assertions passed.
- `node test_run_tests.js` → 26 assertions passed (confirms `run-tests.js`'s own
  `package.json test:serial` parsing/scheduling machinery still works after the new entry
  was added; this does NOT itself execute the full serial chain).

Every invocation above ran to completion well under the 5-minute timebox (`timeout 280`/
`timeout 300` wrappers were used throughout; none tripped).

## What was NOT run

- **The full `test:serial` chain / `npm test` (~100 files) was not run.** Per the task's own
  instruction ("The full ~100-file suite is not required — state what was run and what was
  not"), I ran every audit-family test (`test_audit_*.js`), every protocol-URL-adjacent test
  (`test_protocol_*.js`), and `test_run_tests.js` (the harness that parses `test:serial`
  itself) — the files with any plausible path to `classifyCtaKind`, `readBakedProtocolUrls`,
  `CTA_KIND_SEVERITY`, or the regenerated `data/protocol-urls.json`. Files with no
  relationship to any of the changed surfaces (e.g. `test_kpi_*.js`, `test_stories.js`,
  `test_sitemap_*.js`, `test_spotlight*.js`, the planner/translation-only suites) were not
  run individually — nothing in this change touches `PoolDetail.js`, `app.js`,
  `translations.js`, the router, or any SEO artifact, so I judged the risk of a regression in
  those files to be effectively zero and not worth the wall-clock cost of a full run in this
  session. This is a residual, stated plainly rather than implied: a full `npm test` run
  before merge would be the belt-and-suspenders confirmation.
- I did not run `node generate-sitemap.js`/`generate-llms.js`/`generate-stories.js` — nothing
  in this item touches presets, personas, or SEO-surface generation, so regeneration is not
  called for (and the task's DO-NOT list explicitly excludes touching any generated SEO
  artifact).

## Scope confirmation

`PoolDetail.js`, `app.js`, `translations.js`, `PROTOCOL_URLS`, every trust rail
(`APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly flags, degen haircut), the `__APP_MODE`
router, every parameterized-URL behavior, and every generated SEO artifact are untouched —
confirmed via `git status --porcelain`, which shows only: `audit-app.js`,
`data/protocol-urls.json`, `generate-protocol-urls.js`, `package.json`,
`test_audit_cta_provenance.js` (modified), plus the new `test_audit_upstream_unreachable.js`
and the pre-existing untracked `product-loop-kit/specs/194.md` (this item's own spec file,
present before I started, not created by me). No new dependency was added (`npm install`
only installed what `package.json` already declared).
