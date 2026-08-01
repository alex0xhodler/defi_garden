# 202 — build notes

`src` added to `Analytics.captureAcquisition()`'s param list, identical treatment to `ref`
(200-char cap, omitted when absent, inside the existing try/catch). One file touched for the
product change: `analytics.js`.

## Deviations from the spec, and why

- **Bookkeeping (acceptance criterion 9) intentionally NOT done here.** The spec's own
  acceptance criteria list `BACKLOG.md` row 202, `specs/202-pr.md`, and `LOG.md` as
  same-commit bookkeeping. The build-agent task that dispatched this session explicitly
  scoped this session to `analytics.js` / `test_analytics_acquisition.js` /
  `test_analytics_src_attribution.js` (new) / `package.json` (test:serial only) /
  `specs/202-notes.md` (this file), and explicitly forbade touching `BACKLOG.md`, `LOG.md`,
  `202-pr.md`, or `signals/*.json` — "the operator owns those." I followed the dispatching
  task's scope, not the spec's criterion 9 literally. No commit was made either way (also
  per the dispatching task).
- **`product-loop-kit/specs/202.md` was untracked in git** (`git status` shows it `??`) when
  this session started — I did not create or modify it, just read it per instructions.
- Everything else matches the spec as written: one product-file change (`analytics.js`),
  the exact `ref`-identical treatment, the comment explaining the internal-link/`ref`
  distinction, `planner.js`'s `source` threading untouched (verified below), both required
  test files, non-vacuity probe, and the deferred-leg documentation.
- **Risk tier caveat, flagged honestly per the spec's own footnote:** `git diff --stat` totals
  40+6+2 = 48 changed lines across the three touched files, plus the new rendered test file
  `test_analytics_src_attribution.js` at 231 lines (all new, not in the diff --stat above
  since it's untracked). Combined "changed + new" surface is ~279 lines, over the spec's
  cited 150-line LOW-tier cap once the new rendered test file is counted — exactly the
  "two rendered test files could carry this past it" scenario the spec's Risk tier section
  flags as HIGH, not LOW, if the verifier totals it that way. Recording this for the
  verifier to make the actual call, as the spec asks.

## Environment setup required

`node_modules/` was absent at session start (`playwright` etc. not installed) — ran
`npm install` (network via the pre-configured proxy) before any Playwright-based test could
run. `/opt/pw-browsers/chromium` was already present and used as the `executablePath`
fallback, matching every existing rendered test in this repo.

## Commands run, with real output counts

```
$ node test_analytics_acquisition.js
test_analytics_acquisition.js: 23/23 assertions passed

$ node test_analytics_src_attribution.js
  ✓ /plan.html?waitlist=1&src=seo_token: a track call carries src=seo_token, waitlist_opened source unchanged
  ✓ /plan.html?waitlist=1 (no src param): no event carries a src key
  ✓ /?pool=<id>&src=seo_token: pool_view carries src=seo_token
  ✓ /?pool=<id> (no src param): no event carries a src key
  ✓ no unexpected page errors across any case
test_analytics_src_attribution.js: 5/5 tests passed

$ node test_analytics_fires.js
  ✓ generated /tokens/<slug> page issues one page_view track call (page_type=token_landing, correct path) on real load
1 analytics-fires assertions passed

$ node test_spotlight_attribution.js
network: unpkg.com BLOCKED (using local vendored React/Babel), yields.llama.fi BLOCKED (using fixture pool)
  ✓ a spotlight share link (src=x_spotlight) fires plan_created with source=x_spotlight
  ✓ clicking the Bloom checkout CTA opens the waitlist modal and fires waitlist_opened with source=x_spotlight
  ✓ a plain share link with no ?src= carries source=null on plan_created (no regression)
3/3 spotlight-attribution assertions passed

$ node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
All 208 assertions evaluated.                    # test_planner.js
9/9 passed                                        # test_protocol_parsing.js
9/9 passed                                        # test_qualifier_fix.js
(exit 0, combined via &&)
```

All five commands ran under `timeout 300`/`timeout 290`, comfortably inside the 5-minute
foreground timebox (longest was the rendered test at well under a minute). Nothing UNRUN.

## Non-vacuity probe

`md5sum analytics.js` before the probe: `3966e6e5a9608c7079ca93958b564d6d` (this is the
POST-change hash — the file already had `'src'` added at this point, since the probe is
"delete it, prove tests go red, put it back").

Deleted `'src'` from the `captureAcquisition()` param list (leaving everything else — the
identical file the spec describes as the un-fixed baseline), then re-ran both test files:

```
$ node test_analytics_acquisition.js
AssertionError [ERR_ASSERTION]: src captured from a seo_token landing URL
+ actual - expected
+ undefined
- 'seo_token'
    at test_analytics_acquisition.js:52
(script halts here — assert.strictEqual throws on the first failure, an existing property
 of this pure-Node rig's `eq` helper, not something introduced by this change)

$ node test_analytics_src_attribution.js
  ✗ /plan.html?waitlist=1&src=seo_token: a track call carries src=seo_token, waitlist_opened source unchanged
    no track call carries src=seo_token — got [["session_start",null],["waitlist_opened",null]]
  ✓ /plan.html?waitlist=1 (no src param): no event carries a src key
  ✗ /?pool=<id>&src=seo_token: pool_view carries src=seo_token
    expected pool_view src=seo_token, got undefined
  ✓ /?pool=<id> (no src param): no event carries a src key
  ✓ no unexpected page errors across any case
test_analytics_src_attribution.js: 3/5 tests passed (exit 1)
```

`test_analytics_acquisition.js`'s rig halts the whole script on the first `assert`
failure (pre-existing behavior of its `eq`/`ok` helpers, unrelated to this change), so a
single run only surfaces the first red assertion by name. To confirm ALL THREE new
src-related assertions in that file go red (not just the first), I ran a throwaway,
non-invasive diagnostic script
(`/tmp/.../scratchpad/probe_unit_assertions.js` — not part of the deliverable, never
touched the committed test file) that exercises each of the three new assertions
independently, catch-and-continue, against the same probed `analytics.js`:

```
  RED : src captured from a seo_token landing URL
  RED : src value capped at 200 chars, same treatment as ref
  RED : every event carries src, spread by getBaseContext from captured acquisition
```

**Red by name, full list:**
- `test_analytics_acquisition.js`: "src captured from a seo_token landing URL"
- `test_analytics_acquisition.js`: "src value capped at 200 chars, same treatment as ref"
- `test_analytics_acquisition.js`: "every event carries src, spread by getBaseContext from captured acquisition"
- `test_analytics_src_attribution.js`: "/plan.html?waitlist=1&src=seo_token: a track call carries src=seo_token, waitlist_opened source unchanged"
- `test_analytics_src_attribution.js`: "/?pool=<id>&src=seo_token: pool_view carries src=seo_token"

Every OTHER assertion in both files (including both no-`?src=`-control cases, and the
non-regression `waitlist_opened.source` check embedded in the first red test above — it's
the `src` half of that assertion that goes red, not the pre-existing `source` half) stayed
green during the probe, which is exactly the expected shape: deleting `'src'` should turn
red only the assertions that depend on it, nothing else.

Restored `analytics.js` by re-adding `'src'` to the exact same spot in the list. Post-restore:

```
$ md5sum analytics.js
3966e6e5a9608c7079ca93958b564d6d  analytics.js   # IDENTICAL to the pre-probe hash
```

Confirmed via `diff` against a saved pre-probe copy: no output (byte-identical). Both test
files re-run green after restore (23/23 and 5/5, shown above under "Commands run").

## Scope check

`git status --short` after all work: only `analytics.js`, `package.json`,
`test_analytics_acquisition.js` modified, plus the new `test_analytics_src_attribution.js`.
`planner.js`, `PoolDetail.js`, `app.js`, `translations.js`, `home.html`, `plan.html`,
`canonical.js`, every generated SEO artifact, and every `product-loop-kit/signals/*.json`
file are untouched (not listed by `git status`). No new dependency was added to
`package.json` — the only edit there is the one `test:serial` chain insertion. Confirmed
`analytics.js` is absent from `minify-assets.js`'s `JS_FILES` array and from
`compile-app.js` (both greps return no match for `analytics.js` in either file), so no
regenerated `.min.`/`.compiled.` asset is implied by this change.

## Deferred follow-up (leg 2 — do not build, filed for the operator)

**Adding `src=seo_token` / `src=seo_chain` to the static estate's `?pool=` deep links.**
Both generators funnel every `?pool=` link (visible row AND the matching ItemList JSON-LD,
kept byte-identical to each other by design, spec 046) through ONE shared helper:

- `generate-token-pages.js:589-591` — `poolHrefFor(p, fallbackUrl)`:
  ```js
  function poolHrefFor(p, fallbackUrl) {
    return p.pool ? `${SITE_URL}/?pool=${encodeURIComponent(p.pool)}` : fallbackUrl;
  }
  ```
  This is the single place to add a `&src=` param — it currently carries no attribution tag
  at all.
- Call sites that would need a `surface` argument threaded in (to pick `seo_token` vs
  `seo_chain`): `generate-token-pages.js:605` (inside `renderItemListJsonLd`, JSON-LD),
  `generate-token-pages.js:789` (visible row link), `generate-chain-pages.js:246` (visible
  row link), and indirectly `generate-chain-pages.js:195` (calls the shared
  `renderItemListJsonLd`, which itself calls `poolHrefFor`).
- `poolHrefFor` and `renderItemListJsonLd` are exported once
  (`generate-token-pages.js:1073`) and imported once by `generate-chain-pages.js:42`
  (`const tp = require('./generate-token-pages.js')` at `generate-chain-pages.js:30`) — a
  single shared module, not a fork, so the leg-2 fix is genuinely one function with a new
  parameter, not eight separate edits.

Out of scope here per the spec: it regenerates ~4,360 HTML files (2,093 + 87 EN token/chain
pages + the same again in KO), is HIGH-tier SEO surface, and deserves its own item with its
own diff and its own generated-artifact review. Criterion 4 in spec 202 (the rendered
`/?pool=<id>&src=seo_token` → `pool_view` proof) exists specifically so this leg 2 change,
once filed, is a pure generator-templating change with the emitter already proven correct.

## Correction, added by the operator before merge (verifier-caught)

The "Deviations from the spec" section above says criterion 9's bookkeeping
(`BACKLOG.md` row, `LOG.md` entry, `202-pr.md`) was intentionally skipped. That
describes the **build agent's** scope, not the shipped artifact: the operator
wrote all three and they are in the SAME commit as the code, per the 2026-07-13
one-commit rule. Criterion 9 is met by the commit, and the verifier flagged the
notes as describing a deviation that did not land — recorded here rather than
edited away, because the original sentence was true of the agent's session.

Also recorded here, not glossed: the verifier assigned **HIGH** independently,
overruling the spec's LOW guess on size alone (279 changed lines counting tests
vs the 150-line cap, item 198's counting precedent). The spec had pre-registered
that exact possibility; the guess was wrong, the diff was not. Its own mutation —
different in kind from the builder's — broke the absent-key guard so absence
emitted the literal string `"undefined"`, and both no-`src` CONTROL assertions
went red by name in the rendered file (plus the unit rig's absence assertion),
with `analytics.js` restored to md5 `3966e6e5a9608c7079ca93958b564d6d`.
