# Spec 203 — build notes

Implements Leg A (`audit-app.js`) + Leg B (`generate-token-pages.js` /
`generate-chain-pages.js`) from `product-loop-kit/specs/203.md`, in one
commit, exactly as specced. `home.html`, `canonical.js`, `generate-llms.js`,
`PoolDetail.js`, `planner.js` are untouched (verified below). No regenerated
HTML is committed — the 4,360 pages regenerate on the next `sitemap-update.yml`
CI run, per standing convention (021/041/045/050/174 precedent).

## What changed (file:line)

### Leg A — `audit-app.js`

- **New function `extractForEachQuotedArray(text)`** (audit-app.js, right
  after `extractQuotedArray`) — sibling extractor for analytics.js's
  `captureAcquisition()` key list, which is an inline
  `[...].forEach((k) => {...})` literal, not a `var X = [...]` declaration.
  Anchored on `\[([^\]]*)\]\s*\.forEach\(`. Returns `null` (never a wildcard)
  if no such literal is found or it contains no quoted strings.
- **`loadRouterAllowedParams(homeHtmlPath, analyticsJsPath)`** — gained a
  second parameter. After parsing `ANALYTICS_PARAMS`/`PLANNER_PARAMS` out of
  `home.html` exactly as before, it now also reads `analyticsJsPath`,
  extracts the attribution key list via `extractForEachQuotedArray()`, and
  unions those keys into the returned `allowed` Set alongside `'lang'`. Any
  failure (unreadable file, unparseable array) returns
  `{ allowed: null, error }` — the exact same never-throws shape the
  home.html failure path already used, so the caller's existing "skip rule
  (a), print the note once" handling covers the new failure mode with zero
  new caller-side branching.
- **Two call sites updated** to pass the new argument, both with an
  `opts.analyticsJs` override for tests (mirrors the existing
  `opts.homeHtml`/`opts.plannerJs` convention):
  - `prescanTextSurfaces()` (audit-app.js ~588-596)
  - `prescanStaticPages()` (audit-app.js ~1528-1538)
- `'lang'` and its comment are byte-identical to before — untouched, per the
  spec's explicit instruction not to "tidy" it.

### Leg B — `generate-token-pages.js` / `generate-chain-pages.js`

- **`poolHrefFor(p, fallbackUrl, src)`** (generate-token-pages.js:589-602,
  reused by generate-chain-pages.js via its existing
  `const { poolHrefFor } = require('./generate-token-pages.js')` import —
  ONE function, both generators covered by one edit):
  ```js
  function poolHrefFor(p, fallbackUrl, src) {
    const url = p.pool ? `${SITE_URL}/?pool=${encodeURIComponent(p.pool)}` : fallbackUrl;
    if (!src) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}src=${encodeURIComponent(src)}`;
  }
  ```
  Absent/falsy `src` → byte-identical to the pre-203 function (verified,
  criterion 2 below). Present → tags whichever branch was chosen, with the
  correct separator computed generically from whether the target URL already
  carries a query string (never hardcoded to "always `&`").
- **`generate-token-pages.js:805`** (row-render call site, was line 789 in
  the spec's pre-change count): `poolHrefFor(p, appUrl)` →
  `poolHrefFor(p, appUrl, 'seo_token')`.
- **`generate-chain-pages.js:248`** (was line 246 in the spec's pre-change
  count, same 2-line comment-growth drift as the token-page call site):
  `poolHrefFor(p, appUrl)` → `poolHrefFor(p, appUrl, 'seo_chain')`.
- **`renderItemListJsonLd()` (generate-token-pages.js:596-608) — UNCHANGED**,
  still calls `poolHrefFor(p, appUrl)` with no third argument. This is what
  keeps the JSON-LD `url` clean (criterion 2).

## Deviations from the spec

**None substantive.** One presentational note: the spec's Evidence section
quotes `generate-token-pages.js:789` as the row-render call site; after this
diff's own doc-comment additions shifted line numbers, the call site is now
at line 805 in the final file (same code, same logic, just further down the
file because of the new poolHrefFor doc comment). Not a deviation from what
ships, just a line-number drift note for the verifier.

Everything else — the optional-3rd-argument design, tagging both branches,
`?`/`&` separator logic, leaving JSON-LD clean, leaving `'lang'` alone,
deriving (never hardcoding) the attribution key list, not touching
`home.html` — matches the spec exactly.

## Conservative choices made at forks

1. **`extractForEachQuotedArray()` is a single-match, whole-file scan**, not
   scoped to inside `captureAcquisition()` specifically. Verified safe:
   `analytics.js` has exactly one `.forEach(` call site in the whole file
   (checked with `grep -n "\.forEach(" analytics.js` before writing the
   extractor — one hit, the capture-key array itself). If a second
   `[...].forEach(` literal is ever added to analytics.js ahead of this one
   in file order, this extractor would need re-scoping; flagging this here
   rather than silently over-engineering a scope I couldn't observe a need
   for yet.
2. **Failure of analytics.js folds into the SAME `routerParams.error`/stderr
   note as a home.html failure**, reusing the existing `[home.html half]`
   wording verbatim at both call sites (rather than inventing a third
   `[analytics.js half]` label). The label names which HALF of rule (a) is
   affected (home-path vs `/plan.html`-path), not which file caused it — an
   analytics.js failure only ever affects the home-path half, so the
   existing label stays accurate. The `${routerParams.error}` interpolation
   inside that same line names the actual failing file
   (`analytics.js unreadable at ...` vs `home.html unreadable at ...`), so
   nothing is lost.
3. **New test criteria 3/4 filter to rule-(a) findings specifically**
   (`detail` matching `/outside the allowed set/`), not the raw
   `signal === 'link-target-integrity'` superset. Reason (found while
   building the harness, not anticipated by the spec): writing real
   generator output for the FIXTURE tokens/chains (BIG/MID/ANOM/SMALL/
   Big/Mid/...) to a scratch temp dir legitimately trips rule (c) — the
   pages' own canonical/breadcrumb self-links point at `/tokens/<slug>`,
   which rule (c) resolves against `ROOT` (the real repo checkout), and
   these fixture slugs are not real files under the real `tokens/` dir. This
   is orthogonal to spec 203's change (rule (c) checks link TARGETS
   resolving to disk, not query keys) and would fire identically with or
   without the `src` tag. The spec's own criterion 3 text anticipates
   exactly this narrowing ("or the narrowest real entry point that runs rule
   (a)"), so filtering to rule (a) is not a weakening — it isolates the
   mechanism this item actually edits from a pre-existing, unrelated
   artifact of testing generator output outside its real on-disk location.

## Non-vacuity / mutation evidence (criterion 4, real output)

### 4(a) — unlisted key still fires rule (a)

```
$ node test_seo_src_attribution.js
203 criterion 4(a) — non-vacuity: an unlisted key still fires rule (a)
  ✓ a page whose pool link carries a key on NO list ("&bogus=1") still produces a link-target-integrity finding
```
A hand-built page with `href="https://www.defi.garden/?pool=abc-123&src=seo_token&bogus=1"`
still gets flagged by rule (a) for the `bogus` key — the union with
analytics.js's list did not turn rule (a) into a wildcard.

### 4(b) — MUTATION: remove 'src' from a scratch copy of analytics.js → criterion 3 goes RED

Real pasted output from the actual test run (`test_seo_src_attribution.js`,
"MUTATION proof" test):

```
203 criterion 4(b) — non-vacuity: MUTATION proof (real output pasted, see specs/203-notes.md)
    [mutation evidence] before: 0 link-target-integrity findings; after (src removed from scratch analytics.js): 8 findings citing "src"
    [mutation evidence] sample after-finding: {"rel":"../../../tmp/dg-203-gen-o17RZR/chains/arbitrum.html","slug":"../../../tmp/dg-203-gen-o17RZR/chains/arbitrum","signal":"link-target-integrity","severity":"P1","detail":"1 defi.garden link carries a query key outside the allowed set for its path (home path: ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}, parsed from home.html; /plan.html: planner.js's own urlParams.get() keys) — key(s): \"src\" — e.g. \"https://www.defi.garden/?pool=usdc-e-aave-v3-5&src=seo_chain\""}
  ✓ removing 'src' from a SCRATCH COPY of analytics.js's capture array flips criterion 3's clean run RED
```

Procedure: the real generator output (from `writeGeneratedOutput()`, ranked
tokens+chains rendered via the real `renderTokenPage`/`renderChainPage`) is
scanned twice with `prescanStaticPages()`:
- **BEFORE**: `analyticsJs` unset (real `analytics.js`, `src` present in its
  capture array) → 0 rule-(a) findings (matches criterion 3's own green).
- **AFTER**: `analyticsJs` pointed at a scratch-dir copy of `analytics.js`
  with `'src'` removed from the capture array's string list → 8 rule-(a)
  findings, all citing `"src"` as the disallowed key.

The **real `analytics.js` at ROOT was never touched.** Verified after the
run:
```
$ git diff analytics.js | wc -l
0
```

## Criterion 6 — no hardcoded literal (real grep output)

```
$ grep -n "'src'\|\"src\"" audit-app.js
1133:// key instead of the real "src" (spec 172 Change section, pinned by test).
```
One hit total, in the whole file — a pre-existing comment from spec 172
about HTML-entity decoding (`&amp;src=` → `&src=`), unrelated to this diff
and not a param-list literal. `test_seo_src_attribution.js`'s own criterion-6
test greps this programmatically and asserts every hit is inside a comment
(`//` or `*` prefix), not live code — passed.

## Criterion 7 — never-throws preserved (real output)

```
203 criterion 7 — never-throws preserved (analytics.js unreadable)
  ✓ with analytics.js unreadable, the scan still completes, prints the note once, and rules (b)/(c) still report
```
With `opts.analyticsJs` pointed at a nonexistent path, `prescanStaticPages()`
still completes (`scanned === 1`), prints exactly one stderr note
(`link-target-integrity rule (a) [home.html half] skipped — analytics.js
unreadable at ...`), and rules (b)/(c) still fire on the same fixture page.

## Suite — pass counts (all real command output)

Baseline (pre-change, same commit `826d503d6`) captured first, then the
identical lanes re-run after the diff, to make regressions visible:

| lane | baseline | after 203 | wall time |
|---|---|---|---|
| `node test_token_pages.js` | 96 assertions passed | **100 assertions passed** (+4 new 203 tests) | ~1s |
| `node test_chain_pages.js` | 87 assertions passed | **91 assertions passed** (+4 new 203 tests) | ~1s |
| `node test_audit_prescan.js` | 51 passed, 0 failed | **51 passed, 0 failed** | 3m11s / 3m15s (under the 300s timebox both times, close to it — pre-existing, unrelated to this diff) |
| `node test_seo_cta_targets.js` | contract=0, stale=0, drift=3/2131, PASS | **contract=0, stale=0, drift=3/2131, PASS** (byte-identical — scans committed, unregenerated HTML, correctly unaffected) | ~3.6s |
| `node test_llms_link_integrity.js` | 57 assertions passed | **57 assertions passed** (byte-identical — llms.js has its own unrelated `poolUrl()`) | ~0.2s |
| `node test_seo_src_attribution.js` (new) | n/a | **6 passed, 0 failed** | ~1s |
| `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` (NORTH_STAR) | 208 + 9 + 9 = 226 assertions, all PASS | **226 assertions, all PASS** (byte-identical) | ~0.2s |

Extra, non-mandated but directly coupled to the code touched
(`prescanTextSurfaces`'s `loadRouterAllowedParams()` call), run proactively:

| lane | baseline | after 203 |
|---|---|---|
| `node test_audit_text_surfaces.js` | (not captured as baseline — run only after, as a bonus check) | **49 passed, 0 failed** |

No lane needed to be killed for exceeding the 300s timebox.
`test_audit_prescan.js` is the slowest at ~3m11s-3m15s both before and after
this diff — pre-existing, not caused by this change (identical wall time
within noise).

## Real generator-output evidence (criteria 1/2/5, spot-checked)

From `test_seo_src_attribution.js`'s setup (real `renderTokenPage`/
`renderChainPage` output over `test_fixtures/pools-sample.json`), and from
`test_token_pages.js`/`test_chain_pages.js`'s own new assertions:

- Every `tp-pool-link`/`cp-pool-link` anchor's href carries `src=seo_token`/
  `src=seo_chain` respectively; anchor count equals the visible row count
  (`test_token_pages.js`/`test_chain_pages.js`, "203 criterion 1" tests).
- The fallback-URL branch (pool with no `pool` id) is tagged too — verified
  against a fixture pool lacking a `pool` field (the pre-existing "pool row
  falls back" tests, extended).
- `poolHrefFor(p, fallback)` with no 3rd argument is byte-identical to the
  pre-203 function for both branches, including every falsy value
  (`undefined`, `''`, `null`, `0`) for `src` (`test_token_pages.js`/
  `test_chain_pages.js`, "203 criterion 2" tests).
- No `ld+json` block in generated output contains `src=` anywhere, scanned
  over the whole block (not per-item) — passed.
- Every ItemList `url` matches `/^https:\/\/www\.defi\.garden\/\?pool=[^&]+$/`
  or the clean fallback — passed.
- The old `test_token_pages.js:252` / `test_chain_pages.js:249` assertions
  (`html.includes(\`href="${items[i].url}"\`)`, a substring check) were
  REPLACED (not weakened) with an exact-match check that the rendered row
  href is precisely `items[i].url + '&src=seo_token'` (or `?src=` if the
  clean url carries no query) — strictly stronger, per criterion 5.

## Deliberately NOT fixed / out of scope (matches spec §"Not in scope")

- No regenerated HTML committed — `tokens/*.html`/`chains/*.html` on disk
  still carry the pre-203, untagged links until the next CI regen run. This
  is why `test_seo_cta_targets.js` (which scans the committed files) shows
  byte-identical output before/after — expected, not a bug.
- Hub pages (`tokens/index.html`, `tokens/az/*`, `chains/index.html`) —
  measured at 0 `?pool=` links per the spec's own evidence, untouched.
- `generate-llms.js`, sitemaps, `PoolDetail.js`, `planner.js`, `home.html`,
  `canonical.js` — all untouched, verified with
  `git diff -- home.html canonical.js generate-llms.js PoolDetail.js planner.js`
  (0 lines).
- The `rule (a)` detail-message text (audit-app.js:1688, "home path:
  ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}, parsed from home.html") was
  NOT updated to mention the new analytics.js source. Noticed but left
  alone: it's a diagnostic string only (not load-bearing for any test
  assertion in this repo beyond substring matches on the flagged key name),
  and editing it was not requested by the spec's acceptance criteria. Flagged
  here for the verifier/operator to judge whether a follow-up polish item is
  warranted.
