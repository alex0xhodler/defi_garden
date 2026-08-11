# 227 — implementation notes

Built 2026-08-11, branch `claude/loop-227`. Deliverables per spec 227 exactly:
`edge/api-core.js` (new), `edge/agent-log.mjs` (modified), `edge/API.md` (new),
`edge/DEPLOY.md` (appended §7), `test_api_worker.js` (new, registered in
`package.json`'s `test:serial`). No product render path touched — see
`git diff --stat` at the end of this file.

## Correction received mid-build (address first — this drove the design)

The coordinator sent a mid-task correction after measuring `data/pools-snapshot.json`
directly (7,339 pools, `minTvlUsd: 100000`):

1. The snapshot root is the envelope object (`schemaVersion, generatedAt, source,
   minTvlUsd, count, pools`), not a bare array — confirmed, `data.pools` used
   throughout.
2. **The snapshot is already floored**: `generate-pools-snapshot.js`'s own
   `isRailedIn()` drops anything below `DEFAULT_MIN_TVL` (which equals `$100,000`,
   the same number as `APY_SANITY_LIMIT`'s sibling constant) BEFORE the file is
   written. Independently re-verified this session: `min tvlUsd = 100,010`,
   **0** pools below the floor. Spec 227's literal acceptance text ("derive ...
   from the snapshot... if the snapshot contains none of a kind, FAIL LOUDLY")
   was written before this was measured and would make the TVL-floor positive
   control permanently, structurally impossible to satisfy from natural data —
   not a real gap in the implementation, a fact about the fixture. Per the
   correction: the test does NOT fail loudly for this; instead it (a) asserts
   the fact (`snapshot.minTvlUsd === APP_JS_DEFAULT_MIN_TVL`) so the reason is
   visible and load-bearing rather than assumed, (b) derives the control by
   cloning a REAL pool from the population and perturbing ONLY its `tvlUsd`
   below the floor (never a hand-written fixture object — the clone starts from
   `POPULATION[0]`), and (c) is written to prefer a NATURAL sub-floor pool over
   the synthetic one if a future snapshot ever contains one (`test_api_worker.js`
   §C5's `if (expectedSubFloor.length > 0) { ... } else { ... }` branch), logging
   which path it took either way. See `test_api_worker.js` §C for the exact code.
3. The ANOMALY positive control IS natural — confirmed independently this
   session: **17** pools exceed `APY_SANITY_LIMIT`, max total APY **394,208.17%**.
   Used directly, at full population coverage (all 17, not a sample) — see §C4.
4. Total APY derivation confirmed at `app.js:1965/2066/2166/2524/2930/3694`:
   `(pool.apyBase || 0) + (pool.apyReward || 0)`, no `apy` field exists on these
   pool objects. `edge/api-core.js`'s `totalApy()` is exactly this expression,
   cited by those line numbers in its own header comment.

## Deviations from the spec's literal text, and why

1. **`forever-number` math: `require('../planner.js')` directly, not a
   hand-copied formula.** The spec's literal instruction was "Read
   planner.js:160-166 and mirror the semantics" (only `trust-rails.js` was
   explicitly mandated as a `require()`). I went further: confirmed
   `planner.js` already carries a UMD guard (`module.exports = api` when
   `module` exists) and is safely `require()`-able in plain Node with no
   React/DOM present (`node -e "require('./planner.js').foreverNumber(100,5)"`
   → `24000`, and `test_planner.js` already relies on exactly this). Calling
   the real function is a stronger fulfillment of the repo's "no mirror" rule
   (RAZOR / item 212) than a third hand-copied implementation of the same
   14-line formula would be — there is now exactly one implementation of
   `foreverNumber` in the whole repo. This is a read-only `require`;
   `planner.js` is never written to and does not appear in `git diff --stat`.
2. **`blendedRate()`'s weighting choice (TVL-weighted mean, not the plain
   median `planner.js`'s own `blendedApy()` uses for a rendered headline
   rate).** Spec 227 says only "derived from the railed pool set, never a
   hand-picked pool" — it does not pin a formula. I chose a TVL-weighted
   average total APY across the railed set: it answers "what rate does
   capital actually earn at scale", which is the right denominator for a
   forever-number an agent might cite as financeable, and avoids a single
   tiny high-APY pool skewing an unweighted mean. `planner.js`'s median-based
   `blendedApy()` serves a different job (a stable *displayed* headline rate,
   resistant to a single outlier pool) and was deliberately NOT reused here —
   reusing it would have been the "require it directly" move I made for
   `foreverNumber`, but the two functions solve different problems, so I did
   not force that reuse where the semantics genuinely differ. Documented in
   `edge/api-core.js`'s `blendedRate()` comment and `edge/API.md`.
3. **Extra transparency fields on `/api/pools/:id`: `belowMinTvl` +
   `belowMinTvlReason`.** Spec 227's Change section only requires the anomaly
   flag (`anomalous`/`reason`) on the single-pool route; it says nothing about
   the TVL floor there. I added the analogous pair for the floor: a pool
   requested directly by id that would NOT surface on `/api/pools` is now
   honestly labeled as such, rather than silently indistinguishable from a
   pool that would. This never hides or excludes anything (the pool is still
   returned either way, exactly as the spec requires for the anomaly case) —
   additive, not a rail change.
4. **No per-method enforcement beyond `OPTIONS`.** `GET`, `HEAD`, or any other
   method reaching `/api/*` is routed through the same read-only handler as
   `GET` (only `OPTIONS` is special-cased, for CORS preflight). Spec 227 does
   not ask for a 405 on non-GET methods and this is a read-only API with no
   side effects regardless of method, so adding method enforcement would be
   untested surface with no acceptance criterion behind it. Noted here rather
   than silently decided.
5. **`generatedAt` in `/api/health` is the one wall-clock read in an otherwise
   pure `edge/api-core.js`.** The module's only exported entry point,
   `handleApiRequest`, is a pure function of its three documented inputs
   (`pathname`, `searchParams`, `pools`) for every route EXCEPT this one field,
   which calls `new Date().toISOString()` at response-build time (there is no
   fourth input to thread a clock through, and the spec's signature is fixed).
   No other behavior in the module depends on wall-clock time;
   `test_api_worker.js` doesn't assert an exact value for it (nothing in the
   test does — it isn't the interesting part of the health check).
6. **Full-population coverage of `/api/pools`'s invariant is proven at the
   filter-predicate level (all 7,339 pools) plus route-level agreement on the
   `count` field, not by enumerating every filtered pool through paginated
   HTTP calls.** The v0 route (per spec 227's own route list) caps `limit` at
   200 and has no `offset`/cursor, while Ethereum alone contributes 3,089
   railed pools — true full enumeration through the public route alone is
   structurally impossible with the spec'd surface, not a testing shortcut I
   chose to skip. `test_api_worker.js` §C1 re-derives `isAnomalous`/`meetsFloor`
   independently (from `app.js`-parsed constants, not by importing
   `api-core.js`'s own copies — not a tautology) and checks agreement for
   literally every one of the 7,339 pools; §C2 checks `/api/pools`'s own
   `count` field (built from that same whole-population filter internally)
   against the independently-derived total; §C3 re-verifies every pool in a
   maximal (`limit=200`) page individually. This is full coverage of the RAIL
   LOGIC and of the route's agreement with it — not full enumeration of every
   filtered pool via HTTP, which the route's documented shape doesn't support.
7. **`OPTIONS` preflights are not agent-read-logged.** Spec 227 says "keep the
   existing agent-read logging behavior working for /api paths too" — read as
   "for real API traffic", not CORS preflight mechanics. `handleApi()` returns
   the 204 before ever calling `logAgentRead`. `GET`/other methods to `/api/*`
   (including the 503 case) ARE logged, exactly like the pre-existing
   pass-through path, and `test_api_worker.js` §H1/H4 assert this.
8. **`__resetPoolsMemoForTests` is a new named export on `edge/agent-log.mjs`.**
   Needed because Node's ESM loader caches a module by URL — `test_api_worker.js`
   and `test_agent_log.js` (and multiple scenarios within `test_api_worker.js`
   itself) all `import()` the SAME file, so the in-isolate pools memo (a
   deliberate, spec-required Worker-level cache) would otherwise leak between
   test scenarios that need different upstream-fetch outcomes (success vs.
   failure) run back-to-back in one process. This export is test-only plumbing,
   not a production code path — it does not affect `fetch()`'s default export
   or any behavior a real deployment exercises.

## Non-vacuity evidence (three separate red/green cycles)

All three run against `test_api_worker.js` unless noted. Full transcripts are
above in the build session; hashes and outcomes reproduced verbatim below.

### Cycle 1 — neuter the anomaly exclusion in `edge/api-core.js`

`buildPoolsList`'s filter changed from
`meetsFloor(p, effectiveMinTvl) && !isAnomalous(p)` to `meetsFloor(p, effectiveMinTvl)`
(anomaly check dropped).

- Before: `md5sum edge/api-core.js` → `ebc0a60fdab617f4c0d77edd4c90b771`
- Mutated: `md5sum edge/api-core.js` → `507413ea4cf5adbda31125ee0bb83013`
- `node test_api_worker.js` → **RED**, exit code 1:
  ```
  AssertionError [ERR_ASSERTION]: /api/pools count must equal the independently-derived whole-population railed count
  7339 !== 7322
      at eq (test_api_worker.js:44:33)
      at Object.<anonymous> (test_api_worker.js:158:1)
  ```
- Restored: `md5sum edge/api-core.js` → `ebc0a60fdab617f4c0d77edd4c90b771` (byte-identical to "before")
- `node test_api_worker.js` → **GREEN**: `test_api_worker.js: 609/609 assertions passed`

### Cycle 2 — neuter the TVL floor in `edge/api-core.js`

Same filter changed from `meetsFloor(p, effectiveMinTvl) && !isAnomalous(p)` to
`!isAnomalous(p)` (floor check dropped).

- Before: `md5sum edge/api-core.js` → `ebc0a60fdab617f4c0d77edd4c90b771`
- Mutated: `md5sum edge/api-core.js` → `f9c789209011cf965db7d7f5187afad0`
- `node test_api_worker.js` → **RED**, exit code 1 — caught by the derived
  sub-floor positive control (§C5), proving that control is load-bearing, not
  decorative:
  ```
  AssertionError [ERR_ASSERTION]: the floor-control pool must be ABSENT from its own scoped /api/pools query
      at ok (test_api_worker.js:43:33)
      at Object.<anonymous> (test_api_worker.js:226:1)
  ```
- Restored: `md5sum edge/api-core.js` → `ebc0a60fdab617f4c0d77edd4c90b771` (byte-identical to "before")
- `node test_api_worker.js` → **GREEN**: `test_api_worker.js: 609/609 assertions passed`

### Cycle 3 — break the mirror: change `APY_SANITY_LIMIT` in `trust-rails.js`

`var APY_SANITY_LIMIT = 1000;` → `var APY_SANITY_LIMIT = 999;` (app.js's own
copy at `app.js:800` deliberately left untouched, so the two constants
disagree — exactly the drift the mirror test exists to catch).

- Before: `md5sum trust-rails.js` → `60487050645511d3dd8a21d22331316e`
- Mutated: `md5sum trust-rails.js` → `57d58713337db06f0976b05befea4ab5`
- `node test_api_worker.js` → **RED**, exit code 1, at the mirror assertion
  itself (section B, before any population work even runs):
  ```
  AssertionError [ERR_ASSERTION]: api-core.js rails.apySanityLimit must equal app.js's APY_SANITY_LIMIT literal
  999 !== 1000
      at eq (test_api_worker.js:44:33)
      at Object.<anonymous> (test_api_worker.js:90:1)
  ```
- Restored: `md5sum trust-rails.js` → `60487050645511d3dd8a21d22331316e` (byte-identical to "before")
- `node test_api_worker.js` → **GREEN**: `test_api_worker.js: 609/609 assertions passed`

Three independent rules, three independent red/green cycles, three distinct
failure sites in the test (§C2's count check, §C5's derived floor control,
§B's mirror assertion) — "three working rules", not "one working rule and two
dead ones" per the acceptance criterion's own framing.

## Verification run, verbatim summary lines

- `node test_api_worker.js` (standalone): `test_api_worker.js: 609/609 assertions passed` (~0.3s)
- `node run-tests.js --lane=plain --timeout=120`: `TOTAL pass=54 fail=2 timeout=0 total=56` (~34-39s)
  - The 2 failures (`test_translations_number_format.js`, `test_vercelignore.js`)
    are **pre-existing**, confirmed by `git stash -u` (removing every 227 change,
    tracked AND untracked) and re-running each standalone: both fail identically
    with zero 227 changes present. Not touched, per instructions.
- `git diff --stat`: only `edge/DEPLOY.md`, `edge/agent-log.mjs`, `package.json`
  modified, plus new `edge/API.md`, `edge/api-core.js`, `test_api_worker.js`.
  `app.js`, `PoolDetail.js`, `planner.js`, `home.html`, `plan.html`, `style.css`,
  `translations.js` do not appear — confirmed untouched.

## What I could not do

Nothing in-scope was left undone. Out-of-scope items explicitly deferred by
spec 227 itself (not silently dropped, not attempted here): advertising the
API in `llms.txt`/site links (the endpoint isn't live until the human deploys
— publishing a URL that 404s would be a false claim on the agent surface),
any write path/auth/pricing/x402 (item 234), MCP tool exposure (item 228,
explicitly "build AFTER 227"). The actual Cloudflare deploy is human-owned
(credentials), exactly like item 224's — `edge/DEPLOY.md` §7 documents the
(unchanged) command and how to verify `/api/health` afterward.

## Verifier round 1 — findings and fixes

### BLOCKING: `/api/pools/<malformed-percent-id>` threw an unhandled `URIError`

**Finding.** `edge/api-core.js:492` called `decodeURIComponent(poolIdMatch[1])`
unguarded, and `handleApi` in `edge/agent-log.mjs` wrapped only `getPools()`
in try/catch — the `apiCore.handleApiRequest(...)` call itself was bare. The
verifier reproduced a thrown `URIError: URI malformed` for `GET
/api/pools/100%`, `GET /api/pools/%`, and `GET /api/pools/%E0%A4%A` against
the plain module, the real `edge/agent-log.mjs`, and the esbuild-bundled
Worker — an unhandled exception escaping `worker.fetch()` renders as a
Cloudflare 1101 error page with no JSON body and no `rails` object,
falsifying the spec's "every response, including 404/503, contains a
`rails` object" claim (this API's core differentiator) as well as
`edge/API.md`'s "This is the ONLY case where this API cannot answer at all"
(that claim named only the 503 case).

**Fix, at the weak-predicate altitude RAZOR.md calls for** ("no input to
`handleApiRequest` may produce anything other than `{status, body}` where
`body` carries a rails block" — not "reject the string `100%`"):

1. `edge/api-core.js` (the `POOL_ID_RE` branch of `handleApiRequest`):
   `decodeURIComponent` is now wrapped in try/catch; on a `URIError` it falls
   back to the raw, still-percent-encoded segment rather than throwing. That
   raw segment can never collide with a real DefiLlama pool id (those are
   plain UUID-shaped strings, never containing `%`), so it flows straight
   into `handlePoolById`'s existing 404-with-rails path — no new branch, no
   new response shape, the standard not-found response.
2. `edge/agent-log.mjs`'s `handleApi()`: defence in depth, independent of
   fix 1. The `apiCore.handleApiRequest(...)` call is now itself wrapped in
   try/catch; ANY throw from the handler (the known one, or an undiscovered
   future one) is converted to a `500` JSON body carrying
   `error: "internal_error"` and the same `rails` block every other response
   carries, logged as an agent read exactly like every other `/api` response,
   never re-thrown. The pre-existing pass-through path (everything that is
   NOT `/api` or `/api/*`) is untouched — verified by the existing `H5`
   Response-identity test, which still passes unchanged.
3. `edge/API.md:210-212`: corrected. The "ONLY case this API cannot answer
   at all" sentence now names both the 503 (upstream unavailable) and the
   new 500 (internal handler error, defense in depth) cases, and a new `500`
   subsection documents the shape. The top-of-file "Caching / CORS" summary
   was also corrected — it previously stated every `/api/*` response carries
   `Cache-Control: public, max-age=300` unconditionally, which stopped being
   true the moment 5xx responses became `no-store` (see the Cache-Control
   finding below); it now states the status-dependent rule.

**Non-vacuity — the decode guard specifically** (see the verification
section below for the full command sequence and output):

- Before (guard present): `md5sum edge/api-core.js` →
  `e46a321739c09a44625be0563985dd35`
- Mutated (guard removed, reverted to the bare
  `return handlePoolById(poolList, decodeURIComponent(poolIdMatch[1]));`):
  `md5sum edge/api-core.js` → `c5934aff04860caf7f1b5f2e58d49b35`
- `node test_api_worker.js` → **RED**, exit code 1, at the very first hostile
  segment in the new population:
  ```
  AssertionError [ERR_ASSERTION]: handleApiRequest(trailing-percent) must never throw (threw: URI malformed)
      at ok (test_api_worker.js:44:42)
      at Object.<anonymous> (test_api_worker.js:395:3)
  ```
- Restored: `md5sum edge/api-core.js` → `e46a321739c09a44625be0563985dd35`
  (byte-identical to "before")
- `node test_api_worker.js` → **GREEN**: `test_api_worker.js: 724/724
  assertions passed`

The `edge/agent-log.mjs` try/catch (fix 2) is exercised independently in
`test_api_worker.js` §H8: `apiCore.handleApiRequest` is monkey-patched at
runtime to throw a synthetic error (proving the same object reference is
shared between the test's `require()` and the Worker's `import` of the same
CJS file — Node caches a CJS module by resolved path regardless of which
loader touches it first), `worker.fetch()` is asserted to return a `500`
with a `rails` block and `Cache-Control: no-store` rather than throwing or
propagating, the original function is restored, and a follow-up request is
asserted to succeed normally again (proving the restore itself, not just the
try/catch, works).

### Non-blocking finding 1 — untrue comment on the pools memo

**Finding.** The comment above `poolsMemo` in `edge/agent-log.mjs` claimed
"a stale-but-present memo is preferred over hammering the upstream on every
failure." That is false: `getPools()`'s freshness check is a strict `< TTL`,
so once the 300s TTL elapses the stale memo is never read again regardless
of whether a fresh fetch succeeds — during a sustained upstream outage that
began after the last successful fetch, every request past the TTL hits
upstream itself and gets its own 503. There is no stale-serving fallback in
this file today.

**Fix.** Per the task's own preference ("prefer FIXING THE COMMENT — smallest
change, no behavior change — unless stale-serving is clearly better"): the
comment was corrected to describe the actual behavior (memo is left
untouched on failure but never re-served past its TTL; no stale-serving
fallback exists). No behavior changed — `getPools()`'s logic is byte-for-byte
what it was.

### Non-blocking finding 2 — 503/500 responses were publicly cacheable

**Finding.** `handleApi()` built its response headers once, before the
eventual status was known, hardcoding `Cache-Control: public,
max-age=300` — including on the 503 `upstream_unavailable` path. A CDN or
client honoring that header would keep serving "please try again shortly"
for 5 minutes after the actual outage ended.

**Fix.** `headersFor(status)` now branches: `status >= 500` →
`Cache-Control: no-store`; otherwise (2xx, 4xx) → the existing `public,
max-age=300`, unchanged. Both the 503 (upstream unavailable) and the new 500
(internal error, see above) paths now use this. `test_api_worker.js` asserts
`Cache-Control: no-store` on both the 503 case (`H4`) and the 500 case
(`H8`).

### Non-blocking finding 3 — `test_api_worker.js:510` printed `${passed}/${passed}`

**Finding.** The final summary line was structurally incapable of showing a
shortfall: `passed` was compared to itself.

**Fix.** A `total` counter now increments in `ok()`/`eq()` *before* the
underlying `assert` call (so an assertion that throws still counts toward
`total`, just not toward `passed`), and both the success path and the
`.catch` failure path print `${passed}/${total}` (the failure path is new —
previously it printed no count at all). On a clean run the two numbers are
still equal, by construction, since nothing failed — that was never the bug;
the bug was that the format could never have shown otherwise.

## VERIFICATION — round 1

- `node test_api_worker.js` → `test_api_worker.js: 724/724 assertions
  passed` (up from 609/609 pre-round-1; +115 assertions from the new hostile
  pool-id population tests §I/§H7/§H8 and the two new Cache-Control checks).
- `node run-tests.js --lane=plain --timeout=120` → `TOTAL pass=54 fail=2
  timeout=0 total=56`. The 2 failures (`test_translations_number_format.js`,
  `test_vercelignore.js`) are the same pre-existing failures the original
  build's notes documented as confirmed-on-main via `git stash -u`; nothing
  else touched, per the round-1 task's own instruction to ignore them.
- `git diff --stat -- app.js PoolDetail.js planner.js home.html plan.html
  style.css translations.js` → empty. No product render path touched.
- No new npm dependency: `package.json` unchanged this round.
- `npx esbuild edge/agent-log.mjs --bundle ...` sanity build was **skipped**:
  esbuild is not present in `node_modules/.bin` or anywhere else on this
  machine, and `npx` refuses to fetch it without network access — exactly
  the "skip if esbuild is not already available offline" case the task
  anticipated. Not attempted with a workaround (would have required adding
  a dependency, which is out of bounds).
- Files touched this round: `edge/api-core.js` (decode guard),
  `edge/agent-log.mjs` (defense-in-depth try/catch, status-dependent
  Cache-Control, corrected memo comment), `edge/API.md` (corrected 503/500
  claims and the caching summary), `test_api_worker.js` (hostile pool-id
  population tests via both `api-core.js` directly and the real Worker
  `fetch()`, the `apiCore.handleApiRequest`-throws defense-in-depth test,
  5xx `Cache-Control` assertions, and the passed/total print fix). Untouched:
  `product-loop-kit/BACKLOG.md`'s pending item-259 addition and
  `product-loop-kit/specs/227-pr.md` — both operator-owned, neither edited
  this round; `product-loop-kit/LOG.md` also untouched.
