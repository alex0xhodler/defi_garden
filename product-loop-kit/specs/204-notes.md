# Spec 204 — build notes

Implements specs/204.md exactly: tags the four visible estate->app render
sites `203` left untagged (`.tp-cta`/`.cp-cta` main CTAs and the two
`categoryLinksFor` nav call sites) with `seo_token`/`seo_chain`, via a new
exported `withSrc(url, src)` helper refactored out of `poolHrefFor`'s
existing tail. `appUrl`'s own definition, `renderItemListJsonLd`, and
`poolHrefFor`'s signature/semantics are byte-identical to before (THE TRAP,
spec §2, avoided). No regenerated HTML committed.

## What changed (file:line, current file state)

- **`generate-token-pages.js:592-602`** — new exported function `withSrc(url, src)`:
  ```js
  function withSrc(url, src) {
    if (!src) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}src=${encodeURIComponent(src)}`;
  }
  ```
  Extracted verbatim from `poolHrefFor`'s pre-204 tail — same falsy check,
  same separator arithmetic, same `encodeURIComponent`, zero behavioural
  change to the logic itself, just given a name and exported.
- **`generate-token-pages.js:613-616`** — `poolHrefFor` refactored to call
  `withSrc(url, src)` instead of duplicating the tail inline. Byte-identical
  behaviour (proven in the new test's criterion-5 assertions, see below).
- **`generate-token-pages.js:804`** (was spec's pre-diff line 789 — same
  comment-growth line drift 203-notes.md documented for its own diff):
  `categoryLinksFor(rec.pools, appUrl).map(c => ({ label: c.category, href: c.url }))`
  → `.map(c => ({ label: c.category, href: withSrc(c.url, 'seo_token') }))`.
- **`generate-token-pages.js:901`** (was spec's pre-diff line 886):
  `<a class="tp-cta" href="${appUrl}">` → `href="${withSrc(appUrl, 'seo_token')}"`.
- **`generate-token-pages.js:1104`** — `withSrc` added to `module.exports`
  (needed so `generate-chain-pages.js` and the new test file can both use it).
- **`generate-chain-pages.js:42`** — `withSrc` added to the destructured
  import from `generate-token-pages.js` (alongside the pre-existing
  `poolHrefFor`).
- **`generate-chain-pages.js:240`** (was spec's pre-diff line 236):
  `categoryLinksFor(rec.pools, appUrl).map(c => ({ label: c.category, href: c.url }))`
  → `.map(c => ({ label: c.category, href: withSrc(c.url, 'seo_chain') }))`.
- **`generate-chain-pages.js:333`** (was spec's pre-diff line 329):
  `<a class="cp-cta" href="${appUrl}">` → `href="${withSrc(appUrl, 'seo_chain')}"`.
- **`package.json:21`** — `test:serial` gained one step,
  `node test_seo_app_link_attribution.js`, inserted after `test_chain_pages.js`
  and before `test_seo_cta_targets.js` (see Deviation 1 below for exactly why
  there, not "right after `test_seo_src_attribution.js`" as the spec's text
  literally says).
- **New file `test_seo_app_link_attribution.js`** — covers acceptance
  criteria 1-6 and 8 (see "Non-vacuity" and "Suite" sections below).

`appUrl`'s definitions (`generate-token-pages.js:719`,
`generate-chain-pages.js:161`), `renderItemListJsonLd`, and `poolHrefFor`'s
signature are untouched — verified: `poolHrefFor(p, fallbackUrl, src)` still
takes exactly 3 params, still resolves `p.pool ? .../?pool=<id> : fallbackUrl`
first, and `renderItemListJsonLd` still calls `poolHrefFor(p, appUrl)` with
no 3rd argument (grep-verified, unchanged).

## Design choice: categoryLinksFor's signature is untouched

`categoryLinksFor(pools, baseAppUrl, cap)` itself was NOT given a 4th `src`
parameter. Instead, the tag is applied at each of the two render sites, in
the same `.map()` that already turns `categoryLinksFor`'s return shape
(`{category, url}`) into the nav's `{label, href}` shape — one extra
`withSrc(c.url, 'seo_token'|'seo_chain')` call, no new function surface.
Reasons:
1. `categoryLinksFor` is shared (spec §2 territory notes: "used by exactly
   the two page generators and their tests") and generator-agnostic — giving
   it a `src` param would make it aware of which caller invoked it, which
   `appUrl`'s "stay clean" precedent (the JSON-LD/fallback-branch trap)
   suggests is the wrong layer for this kind of caller-specific decision.
2. Acceptance criterion 2's exact wording — "the count of tagged category
   links equals the count `categoryLinksFor` returned (no link skipped, none
   double-tagged)" — is trivially and structurally guaranteed by mapping over
   the WHOLE returned array with `withSrc`, rather than something that needs
   separate verification.
3. Smaller diff: `categoryLinksFor`'s own definition (generate-token-pages.js:289)
   is untouched, so its existing tests (043/049 in test_token_pages.js) needed
   no signature-shape update — only the exact-href assertion at the render
   site changed shape (see Deviation/Residual 2 below, which is NOT this
   choice's fault — the same href-content change would have happened either
   way).

## Deviations from the spec

**Deviation 1 — package.json insertion point.** The spec's §3 step 4 says
the new test should be wired in "next to `test_seo_src_attribution.js`" and
the task brief said "right after `test_seo_src_attribution.js`". Checked
before editing: `test_seo_src_attribution.js` is **not actually present
anywhere in `package.json`'s `test:serial` chain** —
`grep -o "test_seo_src_attribution[a-zA-Z_.]*" package.json` returns zero
hits. This is a pre-existing gap: item 203 wrote and committed
`test_seo_src_attribution.js` but its own PR never added it to `test:serial`
(203-notes.md's own "Suite — pass counts" table lists it as run manually,
never says it edited package.json, and 203's own notes make no mention of a
package.json diff at all). Since there is no real anchor to insert "after",
and the task explicitly restricts me to the FOUR named files (this new test
file is not permitted to also add `test_seo_src_attribution.js` itself, nor
would that be in scope for 204), I inserted
`node test_seo_app_link_attribution.js` at the closest logically-equivalent
spot: immediately after `test_chain_pages.js` and before
`test_seo_cta_targets.js` — the tail of the generator-output test cluster,
where `test_seo_src_attribution.js` would sit if it were wired in. This is
the single line changed in package.json; verified with `git diff package.json`
(1 line changed, matches "the ONLY package.json edit allowed"). **Flagging
for the operator**: `test_seo_src_attribution.js` itself still never runs in
`npm test`/`test:serial`/CI — a real gap, pre-existing, not created or
compounded by this diff, left exactly as found per the task's explicit file
scope.

**Deviation 2 (documented residual, not fixed) — two pre-existing exact-match
assertions break.** `test_token_pages.js:558` and `test_chain_pages.js:500`
each assert an EXACT (`html.includes(...)`) category-nav href with **no**
`&src=` suffix:
```js
// test_token_pages.js:558
assert.ok(html.includes(`href="https://www.defi.garden/?token=BIG&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending"`), 'missing category link');
// test_chain_pages.js:500
assert.ok(html.includes(`href="https://www.defi.garden/?chain=Big&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending"`), 'missing Lending category link');
```
Tagging the category nav (acceptance criterion 2, mandatory — "every ... href
... ends with `&src=seo_token`/`&src=seo_chain`") makes these two exact
matches fail by construction: there is no way to satisfy criterion 2 without
this string changing. **Proven not pre-existing**: `git stash push --
generate-chain-pages.js generate-token-pages.js package.json`, re-ran both
files on the clean baseline (100/91 assertions passed, 0 failures — see
"Suite" table below for the exact baseline numbers), `git stash pop` restored
the diff, re-ran (99/90 assertions passed, exactly 1 failure each, the two
lines above). This is a genuine, deterministic regression caused by this
diff, not flaky/pre-existing.

203's own precedent for the ANALOGOUS pool-row href (203-notes.md,
"Real generator-output evidence") **did** update this same style of
exact-match assertion in `test_token_pages.js`/`test_chain_pages.js` when it
tagged the pool-row links. I did not do the same here because the task
brief's explicit, twice-stated file allowlist ("Verify with `git status
--short` that only `generate-token-pages.js`, `generate-chain-pages.js`,
`package.json`, and the new test file are modified/added") does not include
`test_token_pages.js`/`test_chain_pages.js`, and the same brief's hygiene
warning ("a previous run came within one push of shipping a scratch file")
signals the file scope is meant to be read strictly, not loosely. Rather than
silently widen scope to match 203's own precedent, I am leaving these two
assertions red and flagging the conflict explicitly: **the operator should
decide** whether to fold in a 2-line follow-up to
`test_token_pages.js`/`test_chain_pages.js` (exact same shape as 203's own
fix — replace the no-`src` exact match with a `+ '&src=seo_token'`/
`+ '&src=seo_chain'` exact match) in the same commit, or file it separately.
I did not make that edit myself under this task's constraints.

No other deviations. Everything else — `withSrc`'s extraction, the four
tagged sites, `appUrl`/`renderItemListJsonLd`/`poolHrefFor`'s signature all
untouched, no regenerated HTML, no other file touched — matches the spec
exactly.

## Non-vacuity / mutation evidence (criterion 6, all four sites, real output)

Procedure per site: `Edit` the ONE line back to its pre-204 form, run
`node test_seo_app_link_attribution.js`, record which named assertion(s) go
red, restore the line, confirm restored files are byte-identical to the
post-implementation state (`diff` against a backup taken right after
implementation — 0 lines both files), then move to the next site.

| site | reverted to | assertion that went red | other assertions affected |
|---|---|---|---|
| A — `generate-token-pages.js` `.tp-cta` href | `href="${appUrl}"` | **"token page .tp-cta href is exactly \<appUrl\>&src=seo_token"** (criterion 1) | none — 11/12 sync passed |
| B — `generate-token-pages.js` categoryLinksFor call | `.map(c => ({ label: c.category, href: c.url }))` | **"every token category-nav href ends with &src=seo_token; count equals categoryLinksFor()"** (criterion 2) — detail: `category href #0 does not end with &src=seo_token: https://www.defi.garden/?token=BIG&minTvl=100000&poolTypes=Lending` | none — 11/12 sync passed |
| C — `generate-chain-pages.js` `.cp-cta` href | `href="${appUrl}"` | **"chain page .cp-cta href is exactly \<appUrl\>&src=seo_chain"** (criterion 1) | none — 11/12 sync passed |
| D — `generate-chain-pages.js` categoryLinksFor call | `.map(c => ({ label: c.category, href: c.url }))` | **"every chain category-nav href ends with &src=seo_chain; count equals categoryLinksFor()"** (criterion 2) — detail: `category href #0 does not end with &src=seo_chain: https://www.defi.garden/?chain=Ethereum&minTvl=100000&poolTypes=Lending` | none — 11/12 sync passed |

Each reversion flips exactly one named assertion red and nothing else — the
test is not vacuous at any of the four sites. After all four rounds,
`diff` against post-implementation backups of both files: 0 lines (fully
restored). Clean re-run after restoration: 14/14 passed, ~1.8s (see below).

## Suite — pass counts (real command output, this run)

All lanes timeboxed to 5 foreground minutes; none needed to be killed.

| lane | result | wall time |
|---|---|---|
| `node test_seo_app_link_attribution.js` (new) | **14 passed, 0 failed** (12 sync + 2 rendered/Chromium) | ~1.8-6s |
| `node test_token_pages.js` | **99 assertions passed, 1 failed** (Deviation 2) | ~1s |
| `node test_chain_pages.js` | **90 assertions passed, 1 failed** (Deviation 2) | ~1s |
| `node test_seo_src_attribution.js` | **6 passed, 0 failed** | ~1s |
| `node test_seo_cta_targets.js` | contract=0, stale=0, **drift=1/2139** (within budget 21.39), PASS | ~4s |
| `node test_seo_shared_source.js` | **20 assertions passed** | ~2s |
| `node test_llms_link_integrity.js` | **57 assertions passed** | <1s |
| `node test_canonical.js` | **All 24 assertions evaluated** (no failures reported) | <1s |
| `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` (NORTH_STAR) | **208 + 9 + 9 = 226 assertions, all PASS** (matches 203-notes.md's own baseline count exactly — byte-identical, this diff never touches planner.js) | <1s |

### Baseline comparison for the two red lanes (proving non-pre-existing)

```
$ git stash push -- generate-chain-pages.js generate-token-pages.js package.json
$ node test_token_pages.js   # baseline
100 assertions passed
$ node test_chain_pages.js   # baseline
91 assertions passed
$ git stash pop
$ node test_token_pages.js   # after this diff
99 assertions passed, 1 failed:
  ✗ renderTokenPage always renders a By category nav derived from on-page pools (no category hub page exists yet)
    missing category link
$ node test_chain_pages.js   # after this diff
90 assertions passed, 1 failed:
  ✗ renderChainPage always renders a By category nav derived from on-page pools (no category hub page exists yet)
    missing Lending category link
```
Confirmed: both lanes are 100% green on the clean baseline and both go red
by exactly 1 assertion after this diff, for the reason documented in
Deviation 2. Not flaky, not pre-existing, not caused by anything else in the
diff (isolated to the one exact-match line each).

`test_seo_cta_targets.js`'s `drift=1/2139` is the pre-existing drift-budget
mechanism (this scans the COMMITTED, unregenerated `tokens/**`/`chains/**`
HTML on disk, which this diff deliberately never touches — see "No estate
regenerated" below); its 1/2139 is within the pre-declared budget and would
read the same with or without this diff (spot-checked: it is about a stale
`$` figure vs a live pool, unrelated to `src`).

## No estate regenerated (criterion 7, "commit nothing generated")

```
$ git status --short
 M generate-chain-pages.js
 M generate-token-pages.js
 M package.json
?? test_seo_app_link_attribution.js
```
(`product-loop-kit/specs/204.md` was already untracked before this session
started — the spec document itself, not written by this build.) No
`tokens/**`, `chains/**`, `ko/**`, sitemap, or `llms*.txt` file appears.

```
$ git diff --stat -- home.html canonical.js generate-llms.js PoolDetail.js planner.js app.js translations.js
(empty)
```
Confirmed zero-line diff on every file the spec names as off-limits.

## Deliberately NOT fixed / out of scope (matches spec §5 "Not in scope")

- Hub/A-Z pages, estate-internal links, sitemaps, `llms*.txt`, JSON-LD — all
  untouched, per spec. Verified JSON-LD stays clean (criterion 4, new test).
- A per-CTA taxonomy (`seo_token_cta` vs `seo_token_category`) — explicitly
  out of scope per spec §5, not built.
- The `.gitignore` guard for `_audit_probe_*.html` — explicitly filed as a
  separate concern in spec §5, not smuggled in here.
- `test_seo_src_attribution.js`'s absence from `test:serial` (Deviation 1) —
  a pre-existing 203 gap, noticed, not fixed (out of this item's declared
  file scope).
- The two broken exact-match assertions in `test_token_pages.js`/
  `test_chain_pages.js` (Deviation 2) — noticed, proven non-pre-existing,
  documented in full, deliberately not fixed under this item's declared file
  scope. Flagged for the operator's judgment call.

## Follow-up: the three pre-existing assertions the tag broke (operator-directed)

Deviation 2 above flagged two broken exact-match assertions and left them red
for the operator's judgment call. A third assertion — the sibling `LP/DEX`
check on the same `test_chain_pages.js` line block — has the identical shape
and was broken by the same construction but wasn't separately called out by
name in Deviation 2's text (it's the second `assert.ok` in the same test
body). The operator directed a follow-up, scoped to exactly these three
assertions, in `test_token_pages.js` and `test_chain_pages.js` only — no
generator, no `package.json`, no spec files.

**Position determined from real generator output, not assumed.** Before
editing, ran `gen.withSrc('https://www.defi.garden/?token=BIG&minTvl=100000&poolTypes=Lending', 'seo_token')`
and the chain/`LP%2FDEX` equivalent directly against the checked-out
`generate-token-pages.js`. Both confirm `withSrc` always appends
`&src=<value>` as the last segment of the URL — after `poolTypes=`, not
before it or interleaved — because the category-nav render sites
(`generate-token-pages.js:804`, `generate-chain-pages.js:240`) call
`withSrc(c.url, 'seo_token'|'seo_chain')` on `categoryLinksFor`'s already-built
URL (which already ends in `&poolTypes=<cat>`), so the tag can only land at
the tail.

### The three assertions changed

1. **`test_token_pages.js:558`** (token category-nav Lending link)
   - Before: `` href="https://www.defi.garden/?token=BIG&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending" ``
   - After: `` href="https://www.defi.garden/?token=BIG&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending&src=seo_token" ``
2. **`test_chain_pages.js:500`** (chain category-nav Lending link)
   - Before: `` href="https://www.defi.garden/?chain=Big&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending" ``
   - After: `` href="https://www.defi.garden/?chain=Big&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending&src=seo_chain" ``
3. **`test_chain_pages.js:501`** (chain category-nav LP/DEX link)
   - Before: `` href="https://www.defi.garden/?chain=Big&minTvl=${gen.MIN_POOL_TVL}&poolTypes=${encodeURIComponent('LP/DEX')}" ``
   - After: `` href="https://www.defi.garden/?chain=Big&minTvl=${gen.MIN_POOL_TVL}&poolTypes=${encodeURIComponent('LP/DEX')}&src=seo_chain" ``

Each edit also gained a `// 204:` comment, in the style of the pre-existing
`// 173:` comment directly above it, noting that the category link now
carries the estate's arrival tag.

### Why this is strictly stronger, not a weakening

All three remain exact whole-string matches to the closing quote via
`html.includes(...)` — same assertion mechanism as before, same specificity
class (no regex, no `includes()` of a shortened prefix, nothing deleted).
The new expected string is the OLD expected string plus the literal
`&src=seo_token` / `&src=seo_chain` suffix that acceptance criterion 2 of
spec 204 mandates every category-nav href carry. A test that now demands
"this exact href, including its attribution tag" asserts a strict superset
of what "this exact href" asserted before — it is impossible to satisfy the
new string without also satisfying the old string's content up to the point
the tag was appended, and the new string additionally pins down the tag's
presence, value, and position (immediately trailing, no interior
double-tagging). This is the same shape of change 203 made to the analogous
pool-row href assertions in these same two files (203-notes.md, "REPLACED
(not weakened)") — item 203's own precedent for exactly this kind of
generator-output test update.

### Re-run counts after the fix

| lane | result |
|---|---|
| `node test_token_pages.js` | **100 passed, 0 failed** |
| `node test_chain_pages.js` | **91 passed, 0 failed** |
| `node test_seo_app_link_attribution.js` | **14 passed, 0 failed** |
| `node test_seo_src_attribution.js` | **6 passed, 0 failed** |

All four lanes green, each well under the 5-minute timebox (all completed in
a few seconds; none required killing).

`git status --short` confirms only `test_token_pages.js` and
`test_chain_pages.js` were modified for this follow-up — no generator, no
`package.json`, no spec files touched.

## Bookkeeping

Per the task brief, `BACKLOG.md`, `LOG.md`, and `specs/204-pr.md` are owned
by the operator and were NOT touched by this build — only this notes file.
