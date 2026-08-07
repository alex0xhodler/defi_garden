# 154 build notes

Implemented exactly the spec's Design A/B/C. Summary of what changed, deviations made
and why, exact commands run, and things noticed but deliberately left alone.

## Files changed

- `audit-app.js` — +184/-11 lines (git diff --stat). Added:
  - Header doc: three new env vars documented (`AUDIT_STATIC_PAGES`, `AUDIT_STATIC_SAMPLE`,
    `AUDIT_STATIC_SEED`), and the file-summary sentence updated to mention the rotating
    static sample (backlog 154).
  - `DEFAULT_STATIC_SAMPLE` (6), `MAX_STATIC_SAMPLE` (12), `JUNK_SLUG_NUMERIC`,
    `JUNK_SLUG_DATE`, `ZERO_YIELD_CLAIM` constants.
  - `defaultStaticSeed()` (UTC date, `YYYY-MM-DD`), `hashSeed()` (FNV-1a, deterministic,
    no dependency, no `Math.random`), `listLeafPages(dir)` (enumerates
    `tokens/*.html`/`chains/*.html`, excludes `index.html`; `tokens/az/*` is excluded for
    free since `readdirSync` lists `az` as a directory entry, not a `.html` file),
    `sampleBySeed(list, count, seed)` (stride-pick from a hash-derived start index),
    `slugFromRel(rel)`, and `buildStaticSurfaces(opts)` (the Design-A surface builder:
    anchor always first and named `static-page` unchanged; rotating sample named
    `static-page:<slug>`; `AUDIT_STATIC_PAGES`/`opts.staticPages` override replaces both
    entirely and is used verbatim).
  - The `kind === 'static'` branch in `main()` now also runs the three new checks
    (`junk-slug`/`zero-yield-claim`/`empty-table`, all P1) against the rendered page,
    reusing the existing `auditText`/`finding`/`page.locator` mechanics — no new fixture
    plumbing.
  - `runAudit()` now builds the static surfaces via `buildStaticSurfaces(opts)` instead of
    the old one-line anchor-only `find(...)`.
- `test_audit_app.js` — +15/-2 lines. Case 1 ("clean run") is now scoped via
  `only: APP_SURFACES_PLUS_ANCHOR` (the 9 app surfaces + the anchor `static-page`) per
  Design C, so the pre-existing real junk pages on disk (`tokens/00.html`,
  `tokens/01.html`, `tokens/8oct2026.html`) don't leak into that assertion as a
  false "regression" — they're documented true positives, asserted as such in the new
  test file instead. No check was weakened or deleted; the predicate/severity is
  untouched.
- `test_seo_surface_audit.js` — new file, 138 lines. Five tests, one per acceptance
  criterion (1–5), all real Chromium renders, no mocked DOM.
- `package.json` — one line changed: appended `&& node test_seo_surface_audit.js` to the
  `test` script, right after `test_audit_runner.js` (unchanged position/wiring for the
  existing test).
- `product-loop-kit/signals/audit-findings.json` — changed as a side effect of locally
  running `test_audit_app.js` (its last line always re-runs a scoped clean audit to
  "restore a clean signals file"; this is pre-existing behavior, not something I
  introduced). Spec acceptance criterion 7 explicitly allows `product-loop-kit/**` in the
  diff, so this is in scope.

Nothing under `tokens/`, `chains/`, `ko/`, any sitemap, or any product file
(`app.js`/`PoolDetail.js`/`planner.js`/`home.html`/`plan.html`/`style.css`/
`translations.js`) was touched. No dependency was added (`package.json`'s
`dependencies`/`devDependencies` are untouched — only the `test` script string changed).

## Deviations from the spec, and why

1. **Added an `opts.staticOnly` flag to `runAudit()` — not one of the spec's three named
   env overrides.** Reason: each static SEO leaf page carries `<script defer
   src="https://www.defi.garden/analytics.js">` — an ABSOLUTE production URL (unlike
   `home.html`'s relative `analytics.js` tag, which the local test server serves
   instantly). The sandbox proxy can't resolve that absolute URL, and because the tag is
   `defer` it holds up `domcontentloaded` for ~10s per static page before giving up
   (this is the CLAUDE.md-documented "external font/analytics fetches fail locally —
   ignorable" cost, not something new). The determinism acceptance test (criterion 5)
   needs multiple `runAudit()` calls, and running the full 9-app-surface set each time
   would have made that test alone take several minutes. `staticOnly: true` restricts a
   run to just the static-page surfaces (anchor + rotation), skipping the app surfaces
   entirely — additive, changes nothing when omitted, and is exercised only by the new
   test. Documented in a code comment at its one call site in `audit-app.js`.
2. **`test_audit_app.js` case 1 scoped via `only:`, not via `AUDIT_STATIC_PAGES`.** The
   hard constraints offered either mechanism ("via runAudit's `only:` option and/or
   AUDIT_STATIC_PAGES"). `only:` was simpler here since the existing test already knows
   the exact app-surface names it wants and just needed to add the anchor's name
   (`static-page`) to that list — no override string to construct/maintain.
3. **Token:chain sample ratio for arbitrary `AUDIT_STATIC_SAMPLE` values.** The spec only
   pins down the default (6 → 4 token + 2 chain). I generalized as `tokenCount =
   Math.ceil(sampleSize * 2/3)`, `chainCount = sampleSize - tokenCount`, which reproduces
   4/2 exactly at the default and keeps roughly the same 2:1 ratio at other sizes (e.g.
   12 → 8/4). Not spec'd explicitly; flagged here in case the intended ratio at
   non-default sizes was meant to be something else.
4. **Anchor's own leaf excluded from the rotation candidate pool.** Not explicitly
   asked for, but without it there was a ~1-in-2000 chance the rotation could
   re-pick `tokens/usdc.html` and produce a redundant `static-page:tokens/usdc`
   surface alongside the anchor. Filtered `tokenLeaves`/`chainLeaves` to exclude the
   anchor's relative path before sampling. Low-risk, conservative addition.
5. **`AUDIT_STATIC_PAGES` override naming for entries after the first.** The spec says
   the override "replaces the rotation entirely (anchor included) and is used verbatim"
   but doesn't pin down surface names for a multi-page override. I named the first
   override entry `static-page` (preserving the anchor-name invariant) and any further
   entries `static-page:<slug>` (matching the sampled-page naming convention). This
   only matters for test ergonomics (`only:` filtering) — verified working for both the
   single-page positive/negative-control cases and the two-page false-positive-guard
   case.

## Real digit-leading tickers verified present in this checkout (used for criterion 4)

```
$ grep -n '<h1' tokens/0x0.html tokens/1inch.html tokens/3crv.html
tokens/0x0.html:90:    <h1>0X0 DeFi Yields</h1>
tokens/1inch.html:90:    <h1>1INCH DeFi Yields</h1>
tokens/3crv.html:90:    <h1>3CRV DeFi Yields</h1>
```
`tokens/1w.html`, `4w.html`, `13w.html`, `50eigen.html` also exist on disk (confirmed via
`ls tokens | grep -iE ...`) but weren't all wired into the rendered test — two
(`0x0`, `1inch`) were enough to exercise the false-positive guard without adding more
~10s-per-page render cost than needed. The junk-slug predicate itself (identical to
148's) structurally cannot match any of them (no wildcard-letter branch in either
regex), so this isn't a coverage gap for the predicate's correctness — just a choice not
to render every example.

## Real junk pages verified present in this checkout (used for criterion 2 / Design C)

```
$ grep -n '<h1' tokens/usdc.html tokens/00.html tokens/01.html tokens/8oct2026.html
tokens/usdc.html:90:    <h1>USDC DeFi Yields</h1>
tokens/00.html:90:    <h1>00 DeFi Yields</h1>
tokens/01.html:90:    <h1>01 DeFi Yields</h1>
tokens/8oct2026.html:90:    <h1>8OCT2026 DeFi Yields</h1>
```

## Commands run, verbatim output

1. Baseline (BEFORE any of my changes), to characterize what was already broken:
   ```
   $ time node test_audit_app.js
     ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes signals JSON
     ✗ positive control: injected −900T renders into pool-detail → P0 number-sanity finding
       expected a P0 number-sanity finding for pool-detail; got: []
   test_audit_app.js: 1 passed, 1 failed
   real 0m26.714s
   ```
   Re-ran a second time to rule out a flake — identical result (`real 0m22.506s`). This
   is a **pre-existing failure unrelated to spec 154** (case 2 is about a
   pool-detail 30d-mean-APY number-sanity positive control, not static pages — nothing
   in the 154 diff touches `pool-detail`'s kind branch, `PoolDetail.js`, or
   `scanNumbers`). Left untouched per the hard constraint against touching
   `PoolDetail.js`/`app.js`. **The verifier should double check whether this was already
   failing on `main` before this branch existed** — I did not check out `main` to
   confirm since I'm not supposed to switch branches, but the failure reproduces
   identically before I made any edit on `claude/loop-154`, so it isn't something this
   item's diff caused.

2. After implementing, `test_audit_app.js` (case 1, now scoped):
   ```
   $ time node test_audit_app.js
     ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes signals JSON
     ✗ positive control: injected −900T renders into pool-detail → P0 number-sanity finding
       expected a P0 number-sanity finding for pool-detail; got: []
   test_audit_app.js: 1 passed, 1 failed
   real 0m23.418s
   ```
   Case 1 (the case this item's Design C addresses) passes. Case 2's failure is the same
   pre-existing one from step 1, unchanged.

3. `test_audit_runner.js` (unmodified, verifying nothing regressed):
   ```
   $ time node test_audit_runner.js
   9 assertions passed.
   PASS test_audit_runner (9 assertions)
   real 0m0.650s
   ```
   (First baseline run before any edits: `real 0m2.039s`, also 9/9 passed.)

4. New test, full run (acceptance criteria 1–5), twice to check for flakiness:
   ```
   $ time node test_seo_surface_audit.js
     ✓ criterion 1: default run covers static-page + >=1 static-page:<slug>, writes findings JSON
     ✓ criterion 2 (positive control): tokens/00.html real render -> junk-slug P1 quoting the rendered <h1>
     ✓ criterion 3 (negative control): tokens/usdc.html yields no junk-slug/zero-yield-claim/empty-table
     ✓ criterion 4 (false-positive guard): digit-LEADING real tickers (0X0, 1INCH) do not trip junk-slug
     ✓ criterion 5: same AUDIT_STATIC_SEED selects the same sample; a different seed selects a different one
   test_seo_surface_audit.js: 5 passed, 0 failed
   real 1m44.382s   (second run: 1m42.842s, run together with test_audit_runner.js after it)
   ```
   Both runs: 5/5 passed, well inside the 5-minute foreground timebox. All seven
   `runAudit()` calls in the file are dispatched concurrently via `Promise.all` (distinct
   ports 8901–8907, distinct outPath files) specifically to stay inside that timebox —
   each static page's absolute-URL `analytics.js` fetch costs ~10s serially, and running
   them concurrently instead of sequentially was the difference between ~1m45s and an
   estimated ~4+ minutes.
5. `node -e` ad-hoc probes used during development (not part of the delivered test
   suite) confirmed, before the real test file was written:
   - `AUDIT_STATIC_PAGES`-equivalent override at `tokens/00.html` → exactly one
     `junk-slug` P1 finding, detail `rendered <h1> is junk: "00 DeFi Yields"`.
   - `tokens/usdc.html` alone → zero findings.
   - `tokens/0x0.html,tokens/1inch.html` → zero findings (`surfacesCovered`:
     `['static-page', 'static-page:tokens/1inch']`).
   - `staticSeed:'seed-A'` run twice → identical rotated sample
     (`['static-page:tokens/ryu', 'static-page:tokens/ceur']` both times, full-surface
     mode; `staticOnly`+`staticSample:1` mode also verified consistent). `staticSeed:
     'seed-B'` → a different sample (`['static-page:tokens/geth', 'static-page:tokens/tsg']`).

## Things noticed but deliberately NOT fixed

- **`test_audit_app.js` case 2 (positive control for pool-detail number-sanity) is
  currently broken** — see command output above. Out of scope for 154 (owned by
  whatever last touched `PoolDetail.js`'s 30d-mean-APY render or `scanNumbers`), and
  fixing it would require touching `PoolDetail.js`, which is explicitly forbidden by
  this item's hard constraints. Flagging for the verifier/operator to triage separately.
- **`test_audit_app.js` itself is not wired into `npm test`** (only `test_audit_runner.js`
  was, and still is). This was already true before my change — I did not add it, since
  the spec's acceptance criterion 6 only requires `test_audit_runner.js` to "stay wired"
  and the *new* rendered test to be wired in, which is what I did. Not a regression, just
  noting it in case it looks like an oversight.
- **Junk pages `tokens/00.html`, `tokens/01.html`, `tokens/8oct2026.html` are still on
  disk** and will still be flagged by any real (unscoped) `node audit-app.js` run,
  including the CLI's own exit code (non-zero on any P0/P1). This is the explicit,
  intended outcome of this item per the spec's "Open questions" section — 148/#306 is
  the actual fix, human-gated, and out of scope here. Not fixed, by design.
- Did not attempt to reduce the ~10s-per-static-page analytics.js-timeout cost (e.g. by
  adding a route for `https://www.defi.garden/**`) — that would be a legitimate speed-up
  but touches the scanner's fixture-routing beyond what Design A/B asked for, and risks
  masking a real console/page error class on those pages if `www.defi.garden` ever
  starts resolving to something unexpected in a different sandbox. Left alone; documented
  the cost instead (see `test_seo_surface_audit.js`'s header comment) so a future change
  has the context.

## What the verifier should double-check

1. That `test_audit_app.js` case 2's failure really does predate this branch (I verified
   it reproduces identically before any of my edits landed, but did not diff against
   `origin/main` directly since I'm not supposed to switch branches).
2. The token:chain sample-ratio generalization for non-default `AUDIT_STATIC_SAMPLE`
   values (deviation 3 above) — spec only pins the default 4:2 split.
3. That concurrent `Promise.all`-dispatched `runAudit()` calls in
   `test_seo_surface_audit.js` don't flake under different sandbox load/CPU conditions
   than what I observed here (ran twice locally, both 5/5 clean, ~1m43-1m45s).

---

## Operator addendum (2026-07-26, post-verification)

**Real unassisted run, after verifier PASS:** `node audit-app.js` → exit 0, `status: OK`, **16 surfaces**
(was 10), 0 findings. Static leg covered: `static-page` (anchor) + `static-page:tokens/xhype`,
`tokens/cyb3rwr3n`, `tokens/liquidbtc`, `tokens/slisbnb`, `chains/zigchain`, `chains/kusama`. The
committed `signals/audit-findings.json` is that run's artifact.

**Honest limitation — do not oversell this item.** Today's seed sampled 4 token pages out of 2,079, so it
did not land on any of the ~7 known junk pages, and 0 findings is the *correct* output for the pages it
actually rendered. Per-day probability of hitting at least one junk page at the default sample is roughly
`1 − (1 − 7/2079)^4 ≈ 1.3%`. So this item removes the *structural* blindness (the scanner can now see a
bad page at all, and the three checks are proven to fire on real renders) but the *sampling rate* is weak
for finding a specific known-bad page. The class it reliably catches is a systemic one — a defect
affecting a large share of pages shows up fast; seven needles in 2,079 do not.

**Follow-up candidate (documented evidence for a future promotion, NOT built here — one item per run):**
make the rotation earn its samples instead of spreading them uniformly — e.g. persist which slugs have
been audited and prefer never-audited ones, and/or run a cheap non-rendered prescan over all
`tokens/*.html`/`chains/*.html` (`<h1>` lead token + "up to 0.00% APY" + row count are all greppable) and
promote only the *suspicious* pages into the rendered sample. That turns 1.3%/day into same-day coverage
of the whole set at roughly the current render budget. Ticket-worthy separately.

**Second follow-up candidate:** `test_audit_app.js` case 2 (the pool-detail −900T number-sanity positive
control) is red on clean `origin/main` — reproduced independently by both the operator and the verifier in
separate `origin/main` worktrees. Hypothesis worth checking first: items 144/145 added rails that now
null/suppress the injected `apyMean30d`, so the control no longer injects anything renderable and the test
asserts a premise that no longer holds. A positive control that cannot fail is worse than no test.
