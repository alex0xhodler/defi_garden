# Item 232 — build notes

One data-derived depth section ("How this rate has behaved") on the 130-page Google head, per
`specs/232.md`. Built by a dispatched Sonnet 5 agent against a written brief; operator (Opus 5) did
the blindspot pass, the estate-scale controlled regen delta, and three defect call-backs.

## What shipped

- `rateBehaviourFor(rec)` — pure data builder over `rec.pools` filtered through `isQualifyingPool`
  (the same rail `yieldHeadlineFor` applies). Aggregates: pool count, chain count, low/high current
  APY, count + median of railed 30d means, incentive-paying count, IL-carrying count. Per-pool rows:
  protocol, current APY, 30d mean (or `—`), yield mix.
- `renderRateBehaviourHtml` / `renderRateBehaviourMarkdown` — the SAME `behaviour` object and the
  SAME `t(...)` calls feed both, so the HTML page and its `.md` twin cannot state different facts
  (item 212's fact-parity rule, applied structurally rather than by a comparison test).
- `renderRateBehaviourStyle(isHead)` — the three scoped `.tp-depth` rules, emitted only on head pages.
- Head gating: `opts.isHead` threaded into `renderTokenPage`/`renderTokenPageMarkdown`, defaulting to
  false. `main()` now calls `selectHeadTokens(pools)` ONCE (hoisted out of `if (args.sitemap)`), and
  that single Set feeds both the sitemap filter and all four render call sites.
- 10 new `tcpDepth*` translation keys, EN + KO.
- `test_token_depth_section.js` (499 lines, 27 assertions), registered in `package.json`'s `test:serial`.

## Territory notes that changed the build

All are in `specs/232.md` under `## Territory notes`.

**Territory note 1 was WRONG and is corrected there — the operator wrote it, the verifier falsified
it on attempt 2, and the correction matters more than the original claim did.** It asserted that the
CI fixture is projected through `generate-pools-snapshot.js`'s 13-field `FIELDS` whitelist, so
`sigma`/`mu`/`apyPct30D`/`count` "do not survive" and a section built on them would render blank in
production. In fact `generate-pools-snapshot.js` emits **two** artifacts: the committed
`data/pools-snapshot.json` (projected through `FIELDS` — this is the APP's snapshot) and the
`--seo-out` transient CI actually feeds the generators (`:305`), which is **raw and full-field** by
explicit design ("full fields preserved, a provable superset of every pool the 3 SEO generators
consume"). Measured on this item's own fixture: `sigma` and `mu` present on **15,600/15,600** pools,
`apyPct30D` on **12,560/15,600**.

The correction inverts the hazard: those fields are **live in production and unrailed**, so a future
depth item that renders them publishes unbounded numbers — the item-122/144 class — rather than
rendering blank. Restricting this section to `project`/`chain`/`apyBase`/`apyReward`/`apyMean30d`/
`ilRisk` was a **scope choice, not a protection**.

No measurement in this item rested on the false claim — the controlled delta and every test read
real rendered output — so nothing else here needs re-deriving. But it is a clean example of the
blindspot pass itself being the blind spot: the note was written from reading `FIELDS` and the CI
workflow, and never checked against the fixture sitting on disk, while the rest of the item checked
everything against real output.

The 30d-mean rail is REUSED, not re-derived: `mean30dSane()` (`generate-pool-pages.js:139`, item 144's
fix, itself a mirror of `PoolDetail.js:285`), lazy-`require()`d inside `rateBehaviourFor` because
`generate-pool-pages.js:55` requires this module back (load-time cycle otherwise).

## Operator verification — controlled regen delta (`playbooks/seo-surface-regen-delta.md`)

Not a tree-vs-HEAD diff. One shared live CI-shaped fixture (`generate-pools-snapshot.js --seo-out`,
15,663 pools fetched → 15,600 at the $1,000 floor), baseline regenerated from `origin/main` in an
isolated `git worktree`, this tree regenerated from the same fixture. 2,078 pages generated on both
sides.

| Measurement | Result |
|---|---|
| `sitemap-token-pages.xml` baseline vs new | **byte-identical** (`md5 20abce6f…`) |
| `sitemap-token-pages-ko.xml` baseline vs new | **byte-identical** (`md5 2c4d3284…`) |
| EN `.html` pages changed | **102** — set equals the sitemap head set EXACTLY |
| EN `.md` pages changed | **102** — set equals the head set EXACTLY |
| KO `.html` pages changed | **102** — set equals the head set EXACTLY |
| Tail pages changed | **0** of 1,976 (× 2 languages × 2 formats) |

Head count reads 102 token URLs + 28 hub/A–Z = the 130 `<loc>`s item 226 shipped. Selection is
provably untouched: depth added content, never membership.

**Prescan (spec acceptance criterion 6), run on both estates:** `prescanStaticPages({ pages })` over
the 4,158 generated `tokens/` + `ko/tokens/` HTML pages on each side. Baseline **14** suspects, new
**14** suspects, and the suspect sets are **identical** — 0 new suspects introduced.

The 14 are pre-existing `link-target-integrity` findings on `origin/main`, untouched by this diff.

**Exact command, so the figure is checkable** (the verifier flagged that it wasn't):
`prescanStaticPages({ pages })` where `pages` = every `*.html` under `<estate>/tokens` and
`<estate>/ko/tokens`, called from a script in the repo root with `<estate>` pointing at
`scratchpad/base` and then `scratchpad/new2`. **The verifier's independent reproduction got 0 and 0
rather than 14 and 14**, using a symlinked `ROOT` instead — `prescanStaticPages` resolves link
targets against the *module's* `__dirname`, not against wherever `opts.pages` lives, so the two
methods disagree on how many link targets resolve. Both methods agree on the only thing the criterion
asserts — **identical suspect sets, 0 new suspects** — and neither of us has established which
absolute count is the "true" one. Recorded as an open methodological discrepancy rather than papered
over; a future item touching the prescan should settle it.
Note the first attempt at this measurement was VACUOUS and is recorded as such: `prescanStaticPages`
takes no `root` option (it defaults to `listLeafPages()` under the repo `ROOT`), so passing one
silently scanned the *committed* estate and returned a meaningless `0`. The re-run passes an explicit
`opts.pages` list. The 14-on-both-sides result is also what proves the scan non-vacuous — a `0` here
would not have been evidence of health until the filter was shown able to return non-zero
(LEARNINGS 2026-07-27).

## Verifier attempt 1 — FAIL, and what it cost to fix (2026-08-05)

The verifier returned **FAIL** with three findings. All three were real; the first was a regression
we shipped red because neither the builder nor the operator ran the full suite.

**F1 — `translations.js` changed, `translations.min.js` never regenerated.**
`test_minified_assets.js` — an existing green test in `test:serial` — failed on the branch and passed
on `origin/main` (verifier confirmed by stash/unstash). Fixed with `npm run minify`; only
`translations.min.js` changed (every other minified asset md5-identical before/after, so nothing else
was stale on `main`). The 10 new keys were then checked to have survived minification not by grepping
names but by calling all 10 template functions in both languages from both the source and the
minified module and comparing all 20 outputs byte-for-byte.

**F1 uncovered a SECOND regression the verifier did not see, found by finally running the full lane.**
`node run-tests.js --lane=plain` came back RED on `test_run_tests.js`, with the plain lane silently
down from **52 files to 31**. Root cause: `run-tests.js` classifies lanes by a **static text scan**
for `require('./…')` — it cannot tell that a require is lazy. Territory note 2's lazy
`require('./generate-pool-pages.js')` (correct for the runtime cycle) added a text-level edge
`generate-token-pages.js → generate-pool-pages.js → audit-app.js`, and `audit-app.js` is the "browser"
marker — so this generator and everything transitively requiring it (`generate-llms.js`,
`test_llms_rails.js`, `test_token_pages.js`, `test_chain_pages.js`, `test_hub_pages.js`,
`test_sitemap_xml.js`, `test_i18n_pages.js`, `test_og_images.js`, …) flipped to the browser lane.
**A require edge in this repo has a blast radius well beyond the two files it connects** — recorded as
territory note 7.

Resolved by dropping the require and keeping `mean30dSane` local — which creates a **third copy** of a
predicate already mirrored in `PoolDetail.js:285` and `generate-pool-pages.js:139`. Reuse-by-require
and lane-integrity are in genuine tension here and lane-integrity won, but a bare third copy is
exactly the mirror RAZOR side 2 and item 212 forbid. So it ships with the mirror rule satisfied:

**`test_mean30d_mirror.js`** — tested set-equality against the original, both directions, over a
**derived population of 749**: 738 real pools from the committed `data/pools-snapshot.json` plus 11
crafted boundary cases (exactly `APY_SANITY_LIMIT`, just above, 0, negative, `null`, `undefined`,
`NaN`, `Infinity`, a string, item 144's `36452.38798`, and the key absent entirely). It also asserts
both modules read the SAME `APY_SANITY_LIMIT`, so a future edit to one rail cannot pass an agreement
test while the rails diverge underneath it, and asserts the population contains both `true` and
`false` cases so the population itself isn't vacuous. This required re-exporting the already-imported
`APY_SANITY_LIMIT` from `generate-pool-pages.js` (+6/−1, no new require edge, no behavior change) —
the only file outside the item's scope this diff touches, and it is why.

Non-vacuity on the mirror test: bound `<= APY_SANITY_LIMIT` → `<` went **RED naming the exact case**
(`exactly APY_SANITY_LIMIT: apyMean30d=1000 -> token-pages=false, pool-pages=true`); byte-identical
restore (`md5 041feee34d0e265348d3b98914c6b18f`) → GREEN.

**F2 — the class count was arithmetically wrong.** Corrected below; the error is left on the record.

**F3 — acceptance criterion 6 (prescan) had no evidence in the notes.** The operator had in fact run
it and added it at 10:06, after the verifier read the file — the verifier also ran it independently
and got the same 0-new-suspects result. The finding was fair at the time it was written.

**After the fixes:** `node run-tests.js --lane=plain` → **52/52 pass, 0 fail, 0 timeout** (operator's
own run, 34s), lane split intact at `plain=52, browser=0`, and the new mirror test correctly
classifies as `browser` (it requires the mirror's original by design) without re-laning anything.

**The estate delta was re-run against the FINAL code** (the mirror refactor touched the generator
after the first delta): sitemaps still byte-identical to baseline, still exactly 102 changed in each
of EN html / EN md / KO html / KO md, each set still equal to the head set exactly — and the rendered
output is **byte-identical to the earlier verified render**, which is what proves the refactor was
behavior-neutral rather than merely believed to be.

## Three defects the operator found in the rendered output (all fixed before verification)

The builder's own suite was green at 22/27 when these were found — they were only visible in the
rendered estate, which is why the delta is run at all.

1. **Subject-verb agreement keyed off the wrong count.** `tokens/aave.html` rendered, on live data:
   *"**1 of 8 pools blend in** incentive or reward APY."* Three EN strings pluralized their verb on
   `poolCount` (the denominator) when the subject is the numerator. Fixed to agree on
   `meanCount`/`rewardCount`/`ilCount`; the noun still agrees with `poolCount`, which is what it
   counts. `tcpDepthMixAllBase` was already correct (its subject genuinely is `poolCount`).
2. **Dead CSS on every tail page.** The three `.tp-depth` rules were emitted unconditionally, so all
   1,976 tail pages (× 2 languages) differed from baseline by three lines of CSS for a section they
   never render. Now gated on `isHead`. This is what makes the "0 tail pages changed" row above
   exactly true rather than approximately true.
3. **KO used an ambiguous particle pair found nowhere else in the catalog.** `USDC은(는) …` —
   `grep -c "은(는)" translations.js` was **1**, and that one was new. The house convention
   (`tcpTokenIntro`, `tcpSubLine`) avoids the problem structurally with a fixed noun+particle.
   Restructured to `${symbol} 풀은 여기 ${poolCount}개가 있고, …`; the count is now **0**, and no
   `을(를)`/`이(가)` pair exists either. Item 190's precedent — "nothing checked whether the Korean
   was Korean" — is why this was treated as a defect and not a nit.

## Non-vacuity (each rule neutered SEPARATELY, byte-identical restore proven by md5)

Baselines: `generate-token-pages.js` `9f5c072ff319ce969f68704f149c08cc`, `translations.js`
`0a31932606db65674369d75a46632d8c`.

| Mutation | Result | Restore |
|---|---|---|
| M1 — `renderRateBehaviourHtml` → `''` | RED, 17/27 (set-equality + rail + KO-particle groups) | md5 match → GREEN |
| M2 — `isHead` forced `true` | RED, 21/27 (set equality gains all 5 tail slugs; CSS-gating + tail sanity) | md5 match → GREEN |
| M3 — revert `tcpDepthMixIncentives` to the poolCount-keyed verb | RED (`numerator=1 but verb="blend"`) | md5 match → GREEN |
| M4 — reintroduce `은(는)` in KO | RED (ambiguous particle pair) | md5 match → GREEN |

M2 is the one that matters most: it proves the head gate is not dead-tested — without it, the
set-equality assertions would pass whether or not gating worked.

## Test design

Population-derived throughout: the head set is parsed from the generated `sitemap-token-pages.xml` at
test time and compared for **set equality in both directions** against the set of pages that actually
render the section (EN html, KO html, EN md, KO md). Never a hardcoded slug list. The rail assertion
uses item 144's real instance (`apyMean30d = 36452.38798`, 36× the rail) as a positive control, plus
an anomalous pool that must never appear at all — and asserts the section's pool count reads 2, not 3.

## Deviations from the brief

- The builder used its own synthetic fixture (15 head + 5 tail tokens) instead of the shared
  `test_fixtures/pools-sample.json`, which resolves to exactly ONE head token under the real head
  gate — too thin to exercise the distinctness assertion or the section's branch mix. Follows
  `test_markdown_twins.js`'s existing precedent. Accepted.
- The verb-agreement and particle assertions were added on the operator's call-back, not in the
  original brief.

## Class — open, with the number

**Instance of:** generated-estate depth.

The count below was WRONG in the first draft of these notes and the verifier caught it. It read
"~22% of the head URL set (29 of 130) remains undepthed" — but 130 and 29 are two **disjoint**
sitemaps (`sitemap-token-pages.xml` and `sitemap-chain-pages.xml`), so "29 of 130" asserts a subset
relation that does not exist. The spec's own "Instance of" line scopes the population as token +
head chain pages, i.e. **159**, not 130. Corrected, with the families kept separate:

| Head URL family | Count | Depthed by this item |
|---|---|---|
| Token detail pages (`/tokens/<slug>`) | 102 | **102 — all of them**, EN+KO, html+md |
| Chain detail pages (`/chains/<slug>`) | 28 | **0** |
| Hub + A–Z navigation URLs (token 28 + chain 1) | 29 | 0 — not depth candidates (index pages, no pool set of their own) |
| **Total head `<loc>`s across both sitemaps** | **159** | **102 (64%)** |

**Beware a genuine numeric coincidence here, since it is exactly the ambiguity that produced the
original error:** `sitemap-token-pages.xml` contains **130 `<loc>`s** (102 token detail + 27 A–Z + 1
hub — verified by grep), and the count of *all detail pages across both sitemaps* is **also 130**
(102 token + 28 chain). Same number, different sets. Every "130" below means the second one.

Scoped to the surfaces depth can actually apply to — the 130 detail pages — coverage is
**102/130 = 78.5%**, and the open remainder is exactly the **28 head chain pages**.
`generate-chain-pages.js` is untouched, so they carry the same zero-depth problem 226 flagged, and
**no test in this item would catch it** — the set-equality assertions are scoped to the token
sitemap. Ticketed as a follow-up for the next heartbeat rather than claimed closed here.

Nothing about "does Google index these" is claimed. That leg is human-owned via GSC (~08-23+, the 013
precedent), and no calendar window is opened for it.
