# Item 242 — build notes

## What shipped

- `generate-token-pages.js` (+61/-4 net over its own prior form, measured `git diff
  d730a7dcc3 --stat`):
  - `REPRESENTATIVE_REL`, `REPRESENTATIVE_ABS_PP`, `representativenessRatio(pool)`,
    `isRepresentativeRate(pool)` MOVED here from `generate-spotlight.js` (right after
    `poolTotalApy`, their only dependency), doc comments preserved verbatim plus a one-line "moved
    here in 242" note. Exported from `module.exports`.
  - New `headlinePoolFor(pools)`: among `pools`, the highest-`poolTotalApy` pool that ALSO passes
    `isRepresentativeRate`; if none passes, the highest-`poolTotalApy` pool (documented fallback,
    with the 481/2,102-page measurement in the comment). Deterministic first-match tie-break
    (implemented via strict `>` comparisons only, so an equal-APY pool never displaces the earlier
    one). Empty array → `null`, no extra defensive branching. Exported.
  - `renderTokenPage` (`bestApy`/`buildAnswerAndFaq` call) and `renderTokenPageMarkdown`
    (identical) now derive `bestApy` and the pool passed to `buildAnswerAndFaq` from ONE
    `headlinePoolFor(rec.pools)` call each. `top = rec.pools[0]` is untouched and still feeds
    `tcpTokenIntro` with its own APY, per spec §Change 3.
- `generate-spotlight.js` (-13 net):
  - The `require('./generate-token-pages.js')` destructure (`:48`) now also pulls in
    `REPRESENTATIVE_REL, REPRESENTATIVE_ABS_PP, representativenessRatio, isRepresentativeRate`.
  - The four local definitions are deleted, replaced by a one-line "moved in 242" comment; every
    call site (`pickPool`'s gate, `rankCandidates`, `storySignals`) is untouched — it already
    referenced these names as free variables, so they now resolve to the imported bindings instead
    of local ones, with zero call-site edits.
  - `module.exports` still lists all four names (byte-identical import/export contract for
    `isRepresentativeRate`, `REPRESENTATIVE_REL`, `REPRESENTATIVE_ABS_PP` — see Deviation 1 below
    for `representativenessRatio`, which is a genuine addition, not a preservation).
- `test_token_pages.js` (+183 lines): new `242 —` sections — population invariant, attribution
  invariant, twin parity, two positive controls, unchanged-surface proof (table order +
  `rankTopTokens` idempotence), and the mirror-proof test with its honest MODULE_NOT_FOUND
  fallback. No existing test in the file was edited.
- Nothing else touched: `generate-chain-pages.js`, `app.js`, `translations.js`,
  `rankTopTokens`, the sitemap, `yieldHeadlineFor`, or any trust rail
  (`APY_SANITY_LIMIT`/`MIN_POOL_TVL`/anomaly exclusion).

## Deviations from the spec, and why

1. **`generate-spotlight.js` now exports `representativenessRatio`, which it never did before.**
   Reading the pre-242 `module.exports` (`:909-921` in the original), only `REPRESENTATIVE_REL,
   REPRESENTATIVE_ABS_PP, isRepresentativeRate, isFundableForever` were listed —
   `representativenessRatio` was used internally (`storySignals`'s `rateRepresentative` term) but
   never re-exported. The spec's mirror-proof acceptance criterion explicitly requires checking
   identity of "`isRepresentativeRate`/`representativenessRatio`/`REPRESENTATIVE_REL`/
   `REPRESENTATIVE_ABS_PP`" as a set of four, and §Change 1 says "generate-spotlight.js imports and
   **re-exports** them under the same names" for all four. I read this as the spec's own intent
   (list all four consistently) taking precedence over the accidental pre-existing omission of one
   of them, and added `representativenessRatio` to `generate-spotlight.js`'s `module.exports`. This
   is additive only — no existing importer that didn't previously use
   `require('./generate-spotlight.js').representativenessRatio` is affected, since that binding
   simply didn't exist to conflict with. Confirmed via `git diff d730a7dcc3` that this is the ONLY
   export-list change in the file beyond the deletion of the four local definitions.
2. **Non-vacuity mutation (c) surfaced a `SyntaxError`, not a value mismatch — used as-is.** The
   spec's mutation (c) ("break the spotlight re-export, e.g. redefine one name locally") was
   implemented as re-adding a local `function isRepresentativeRate(pool) {...}` alongside the
   `const isRepresentativeRate` from the destructured require. Node treats this as a
   redeclaration `SyntaxError` at `require()` time (`Identifier 'isRepresentativeRate' has already
   been declared`), which the mirror test's own error-handling correctly does NOT swallow (it only
   swallows `MODULE_NOT_FOUND` for `@napi-rs/canvas`) — the test's `try { require(...) } catch`
   block re-throws it, and since the whole assertion is wrapped in this file's `test()` harness
   (which itself is a try/catch), the failure surfaces as one red assertion with the SyntaxError
   message rather than a value-diff. This is still a clean, unambiguous RED and satisfies the
   criterion; I did not try to force the mutation into producing a same-shape value mismatch
   instead, since the spec only requires "mirror test red," not a specific failure mode.
3. **`@napi-rs/canvas` WAS installable in this session, contradicting the spec's stated "not
   installed in this checkout."** See "Environment note" below — this materially affects which
   branch of the mirror-proof test exercises in normal `node test_token_pages.js` runs (live
   require, not the source-level fallback). I verified the fallback branch separately (see
   Non-vacuity section) rather than leaving it unverified.
4. **Attribution-invariant test also asserts NO other pool's project leaks into the
   answer/FAQ text**, beyond just asserting the headline pool's own project/chain are present. The
   spec's criterion (c) only requires the headline pool's project/chain to be present; the extra
   negative assertion (`rec.pools.filter(p => p !== expectedPool...).forEach(other => assert
   text does NOT include other.project)`) is a stronger, still-in-scope check that directly rules
   out the exact defect class described in the spec's "attribution defect" section (a page naming
   the wrong pool). No known false-positive risk in the fixture (project names are unique
   per-pool strings with no substring overlap).

## Environment note (read before trusting the "not installed" premise elsewhere)

The spec and `CLAUDE.md`'s "Repo facts you must respect" both state `@napi-rs/canvas` is not
installed in this checkout. At the start of this build, `node_modules/` did not exist AT ALL (not
just the canvas package) — `npm install` was required just to run `require('./translations.js')`-
adjacent generator files with their real dependency tree. Running `npm install` (network open,
proxy reachable) pulled all six declared `dependencies` successfully, **including**
`@napi-rs/canvas` (prebuilt native binary resolved fine through the proxy). This is a materially
different starting state than the spec assumed.

This matters beyond package presence: `generate-chain-pages.js` requires `generate-og-images.js`
(`:36`, unconditional top-level) which itself hard-requires `@napi-rs/canvas` (`:28`). Since
`test_token_pages.js` requires `generate-chain-pages.js` at ITS own top level (`:13`, pre-existing,
unrelated to 242), **`node test_token_pages.js` cannot even load without `@napi-rs/canvas`
present** — confirmed by `git stash`-ing all 242 changes and re-running `node test_token_pages.js`
on the untouched `main`-equivalent tree: identical `MODULE_NOT_FOUND` crash (see below). So in a
checkout that genuinely lacks the package, none of `test_token_pages.js` /
`test_chain_pages.js` / `test_token_chain_all.js` / `test_pool_twins.js` can run at all — this is
a pre-existing condition of the repo, not something item 242 introduced or could fix within its
scope (the spec's own architecture rationale is specifically about avoiding a NEW dependency on
canvas from `generate-token-pages.js`, which this change does not create).

Given the verification section explicitly requires these test files to be run and their real
output recorded, I left `@napi-rs/canvas` installed for this session (rather than artificially
removing it and being unable to produce the required test output at all) and instead separately
proved the mirror test's `MODULE_NOT_FOUND` fallback branch works correctly, in isolation, with
the package hidden — see "Non-vacuity" below. `node test_spotlight.js` / `test_spotlight_packs.js`
therefore also ran their REAL suites (not the "verify baseline failure on main" path the spec
anticipated) and passed in full — see "Verification runs" below.

## Non-vacuity — each sub-rule neutered separately, byte-identical restore proven

Baseline (before any mutation), recorded via `md5sum`:
```
840d6b6139acc689d81e485acc115405  generate-token-pages.js
1b7bcd411742345208976086987abb58  generate-spotlight.js
```

**(a) `headlinePoolFor` → plain `Math.max` pool (representativeness gate removed entirely).**
Mutated `headlinePoolFor` to ignore `isRepresentativeRate` and just return the pool with the
highest `poolTotalApy`. `node test_token_pages.js`:
```
242 — headline pool selection: the representativeness gate + attribution parity
  ✗ population invariant: ... [POPA] a representative pool exists among rec.pools but the
    headline pool is NOT representative
242 — positive controls ...
  ✗ positive control: a 694.11% pool ... -> the unrepresentative pool is NOT the headline
    the unrepresentative 694.11% pool must not be the headline
    + actual - expected
    + 'popE-bad'
    - 'popE-good'
107 assertions passed   (exitCode 1 — RED, as required)
```
Restored via a pre-mutation backup copy (`cp` to scratch, not `git checkout --`, since this
branch carries an auto-checkpoint commit that could otherwise mask a non-restore — see below).
`md5sum generate-token-pages.js` → `840d6b6139acc689d81e485acc115405` — **byte-identical**.
`node test_token_pages.js` afterward: 109/109 green again.

**(b) `buildAnswerAndFaq`'s 4th argument reverted from `headlinePool` to `top` (in
`renderTokenPage` only, per the spec's wording).** `node test_token_pages.js`:
```
242 — headline pool selection ...
  ✗ attribution invariant: ... [POPE/en] answer block does not name the headline pool's
    project (popE-good): "The highest honest POPE yield right now is 20.08% on popE-bad
    (Ethereum), ..."
242 — positive controls ...
  ✗ positive control: a 694.11% pool ... rendered answer must attribute to the representative
    pool, not the unrepresentative one
  ✗ positive control: a record where EVERY pool fails the gate ... fallback attribution must
    match the highest-APY pool, not the other one
106 assertions passed   (exitCode 1 — RED, three assertions, as required)
```
Restored via pre-mutation backup copy. `md5sum` → `840d6b6139acc689d81e485acc115405` —
**byte-identical** (same hash as the (a) restore, confirming both mutations left the file in the
identical pre-mutation state once undone). 109/109 green again afterward.

**(c) Spotlight re-export broken** by re-adding a local `function isRepresentativeRate(pool) {...}`
in `generate-spotlight.js` alongside the imported `const` of the same name. `node
test_token_pages.js`:
```
242 — mirror proof ...
  ✗ generate-spotlight.js's isRepresentativeRate/... : Identifier 'isRepresentativeRate' has
    already been declared
108 assertions passed   (exitCode 1 — RED, as required; see Deviation 2 for why this is a
    SyntaxError rather than a value mismatch)
```
Restored via pre-mutation backup copy. `md5sum generate-spotlight.js` →
`1b7bcd411742345208976086987abb58` — **byte-identical** to the pre-mutation baseline.
109/109 green again afterward.

**Fallback-branch proof (source-level, MODULE_NOT_FOUND path).** Because `@napi-rs/canvas` is
present in this session (see Environment note), the mirror test's honest fallback branch never
naturally executes inside `node test_token_pages.js`'s own process (that file cannot even load
without canvas, via its own unrelated `generate-chain-pages.js` require). To verify the fallback
branch's logic is correct and reachable on its own terms, `node_modules/@napi-rs/canvas` was
moved aside and a standalone script (`/tmp/.../scratchpad/isolated_mirror_check.js`, requiring
ONLY `generate-token-pages.js` + `generate-spotlight.js` directly, bypassing
`test_token_pages.js`'s unrelated `generate-chain-pages.js` require) ran the exact same
try/require/catch + source-level-assertion logic:
```
[mirror proof ran in: source-level proof (@napi-rs/canvas not installed in this checkout)]
PASS (source-level fallback branch)
```
`@napi-rs/canvas` was then moved back (`mv` reverse of the same operation — the package directory
itself, not a reinstall, so it is the exact same on-disk bytes) and `node -e
"require('./generate-spotlight.js')"` confirmed it loads again before continuing.

**Note on `git checkout --` vs. backup-copy restores.** This branch (`claude/loop-242`) carries an
auto-checkpoint commit (`ba42df1f`, "wip(242): local checkpoint") that was created by the harness
mid-session and already contained this build's in-progress edits — not something this build
committed itself. Because of that, `git checkout -- <file>` would restore to whatever the LAST
checkpoint captured, not necessarily this build's current working state, so every restore above
used an explicit pre-mutation `cp` backup + `md5sum` verification instead of relying on git.

## Verification runs (all within the 5-minute-per-command timebox)

All commands below ran to completion; none were killed by the 300s timeout.
```
node test_token_pages.js        → 109/109 assertions passed, exit 0
node test_chain_pages.js        → 91/91 assertions passed, exit 0
node test_token_chain_all.js    → 5/5 assertions passed, exit 0
node test_pool_twins.js         → 41/41 assertions passed, exit 0
node test_planner.js            → 208/208 assertions evaluated, exit 0
node test_protocol_parsing.js   → 9/9 passed, exit 0
node test_qualifier_fix.js      → 9/9 passed, exit 0
node test_spotlight.js          → 60/60 assertions passed, exit 0   (real suite ran — see Environment note)
node test_spotlight_packs.js    → 11/11 assertions passed, exit 0   (real suite ran — see Environment note)
```
Baseline check (pre-existing, unrelated to 242): `git stash` (all 242 changes) then
`node test_token_pages.js` on the resulting tree crashed identically with `MODULE_NOT_FOUND:
Cannot find module '@napi-rs/canvas'` (via `generate-chain-pages.js` → `generate-og-images.js`),
proving this specific failure mode is NOT introduced by item 242 — it exists whenever
`@napi-rs/canvas` is absent, before or after this diff. `git stash pop` restored the working tree.

Additionally spot-checked (not required by the spec, run for extra confidence, all passed):
`test_markdown_twins.js` (16/16), `test_spotlight_url.js` (3/3), `test_spotlight_attribution.js`
(3/3), `test_og_images.js` (18/18), `test_hub_pages.js` (42/42), `test_token_slug_validity.js`
(66/66). `test_pool_twin_parity.js` was also run out of caution; 24/36 passed with 2 pre-existing
`console.error` 404s for `data/pools-snapshot-meta.json` in its Playwright-driven legs — a sandbox
data-file gap unrelated to `generate-token-pages.js`/`generate-spotlight.js` (that test never
touches `headlinePoolFor`/`isRepresentativeRate`); not investigated further as it is out of this
item's required list and out of its file scope.

## Re-measured live impact (2026-08-06, `yields.llama.fi/pools` fetched fresh this session,
15,671 pools — script at `/tmp/.../scratchpad/measure_242.js`, NOT committed to the repo)

| measure | spec's number (2026-08-06 earlier fetch, 15,679 pools) | re-measured this session (15,671 pools) |
|---|---|---|
| token pages generated (uncapped) | 2,097 | **2,102** |
| displayed pools (`rec.pools` total) | 3,925 | **3,931** |
| displayed pools failing `isRepresentativeRate` | 975 (24.8%) | **983 (25.0%)** |
| displayed pools with no `apyMean30d` | 0 | **0** |
| pages whose headline APY string changed vs OLD `Math.max` | 103 (4.9%) | **103 (4.9%)** |
| pages on the unchecked fallback path (no representative pool displayed) | 481 (22.9%) | **481 (22.9%)** |
| pages whose old headline/attribution named mismatched pools (the defect fixed) | 415 (19.8%) | **421 (20.0%)** |

The small deltas (2,097→2,102 pages, etc.) are expected — the live pool set moves continuously;
this is a fresh independent fetch, not a replay of the spec's numbers. The core claims hold at
essentially the same magnitude: ~5% of pages get a corrected headline rate, ~23% remain on the
honest documented fallback, and ~20% of pages had their stated protocol/chain corrected to match
the rate actually being claimed.

## Residual class left open (unchanged from spec, with today's number)

`generate-chain-pages.js:169`/`:210` and `:422`/`:428` repeat the identical `Math.max` +
`rec.pools[0]`-attribution pattern on the chain estate, untouched by this item (scope: token pages
only, per spec §Change). Ticketed as item 243 by the spec itself, not re-opened here. The 481-page
(22.9%, re-measured) fallback class — pages where no displayed pool is representative — is also
explicitly left open per the spec's own "Open questions": today's unchecked-max, correctly
attributed, is the documented smallest-honest-option fallback, not silently dropped.
