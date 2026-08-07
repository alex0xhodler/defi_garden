# Item 243 — build notes

## Blindspot check (spec §1)

Read `renderChainHubPage` (`generate-chain-pages.js:362-410`) in full before touching anything.
It renders the /chains hub index page: title/description (`tcpChainHubTitle`/`tcpChainHubDescription`,
which only cite `ranked.length`), and a flat list of `<a href=".../chains/<slug>">` links built
straight from `ranked` (chain name + slug only). It computes **no APY, no `bestApy`, no
`Math.max`, and calls neither `poolTotalApy` nor `buildAnswerAndFaq`** — confirmed by
`grep -n "Math.max\|bestApy\|buildAnswerAndFaq\|poolTotalApy" generate-chain-pages.js`, which
returns matches only inside `renderChainPage`/`renderChainPageMarkdown` (the two call sites the
spec already names) and the two `bestApy`-typed comments. **Verdict: no third call site.** The hub
page is out of scope, correctly, with nothing left silently unflagged.

## What shipped

- `generate-chain-pages.js` (+20/-6, `git diff c40e22e3f1 --stat`):
  - `headlinePoolFor`, `isRepresentativeRate` added to the existing `const { ... } = tp;`
    destructure (`:51-54`) — no new require, no local definition, per spec §Change 1.
  - `renderChainPage` (~`:169`): `const bestApy = Math.max(...rec.pools.map(poolTotalApy));`
    replaced with `const headlinePool = headlinePoolFor(rec.pools); const bestApy =
    poolTotalApy(headlinePool);`. `buildAnswerAndFaq(rec.chain, rec, bestApy, top, language)`
    (~`:210`) changed to pass `headlinePool` instead of `top`. `top = rec.pools[0]` (~`:184`) is
    untouched — still feeds `tcpChainIntro` with its own APY, per spec §Change 2.
  - `renderChainPageMarkdown` (~`:422`/`:428`): identical substitution.
  - Nothing else in the file touched: `rankTopChains`, `relatedChainsFor`, `topTokensOnChain`,
    `renderChainHubPage`, `renderChainSitemap`, the IO layer, every trust rail
    (`APY_SANITY_LIMIT`, `MIN_POOL_TVL`, `isQualifyingPool`, the zero-APY quality bar) are
    byte-unchanged.
- `test_chain_pages.js` (+159 lines, one new `243 —` section, mirroring 242's `test_token_pages.js`
  section at lines ~794-975): fixture sanity, population invariant, attribution invariant, twin
  parity, two positive controls (including the fallback case), unchanged-surface proof (table
  order, `rankTopChains` idempotence, and a sitemap-unaffected check). No mirror-proof test — the
  spec's acceptance criteria explicitly say none is needed for this item (`generate-chain-pages.js`
  only imports `headlinePoolFor`/`isRepresentativeRate`, it does not re-export them onward to a
  third file). No existing test in the file was edited.
- Nothing else touched: `app.js`, `translations.js`, `generate-token-pages.js`'s own logic (only
  its exports read), `generate-sitemap.js`, `generate-og-images.js`, and no
  `product-loop-kit/BACKLOG.md`/`LOG.md` edits (orchestrating session's territory).

## Deviations from the spec, and why

1. **Markdown twin: `top = rec.pools[0]` was REMOVED, not kept, in `renderChainPageMarkdown`.**
   The spec's §Change 3 says "`top` stays `rec.pools[0]` if the markdown file uses it elsewhere
   (introduction line); verify before editing." I verified: `renderChainPageMarkdown` has no intro
   line (unlike the HTML twin, the markdown output goes straight from the H1 to `${answer}`), and
   after switching `buildAnswerAndFaq`'s 4th argument to `headlinePool`, `top` had zero remaining
   uses in the function body. Declaring an unused local would be dead code with no reader. 242's
   own token-side markdown twin (`renderTokenPageMarkdown`) took the identical path — it never
   declares `top` at all (confirmed by reading `generate-token-pages.js:1059-1074`, which jumps
   straight from `appUrl` to `headlinePool`/`bestApy`/`floorStr`). This mirrors that precedent
   exactly rather than leaving an inconsistency between the two twins' code shape. The HTML
   twin's `top = rec.pools[0]` (`:184`) is untouched, per spec, since it genuinely feeds the intro
   line there.
2. **Attribution-invariant test asserts only the headline pool's PROJECT, not its chain** (242's
   token-page version of this test asserts both project and chain). On a chain-page record, every
   pool in `rec.pools` shares the SAME `chain` value by construction — that's what `rankTopChains`
   groups by (`byChain.set(chain, ...)` in `rankTopChains`, confirmed by reading the function). So
   `topPool.chain` (the value `buildAnswerAndFaq` renders) is identical no matter which pool is
   selected as headline; asserting it would be vacuously true and would not discriminate the
   defect class (a page naming the wrong PROJECT) from a correct render. Documented inline in
   `test_chain_pages.js` directly above the test. Project-name checking (including the
   "no OTHER pool's project leaks in" negative assertion, the same strengthening 242 added) is
   the actual discriminator on this surface.
3. **A sitemap-unaffected check was added** to the unchanged-surface-proof block
   (`renderChainSitemap` called before/after on the identical fixture, asserted byte-identical),
   which 242's token-side section did not have an equivalent for. This directly targets the
   spec's acceptance criterion "the generated chain-page set... and the chain sitemap are
   byte-identical to `main`" — 242's own equivalent bullet was satisfied implicitly (no test
   exercises `renderTokenSitemap` in that section either), but since `generate-chain-pages.js`'s
   sitemap is explicitly named in this item's own acceptance criteria, I added the direct check
   rather than relying only on the `rankTopChains`-idempotence proof to imply it.

None of these change behavior — (1) and (2) are code-shape/test-shape choices following an
established precedent from 242; (3) is a strictly additional check.

## Non-vacuity — each sub-rule neutered separately, byte-identical restore proven

Pre-mutation baseline (the file WITH all 243 changes applied, captured via `cp` — not
`git checkout --`, since this branch carries an intra-session auto-checkpoint commit
(`49ffe0d590`, "wip(243): chain-page headline attribution — build agent in progress") that could
otherwise mask a non-restore, exactly the caution 242's own notes record for the same reason):
```
294a243406ef41abf02c2121f769fb5e  generate-chain-pages.js
```
backed up to `/tmp/.../scratchpad/generate-chain-pages.js.pre-mutation-backup`.

**(a) `headlinePoolFor` call reverted to the plain `Math.max` pool, HTML path only
(`renderChainPage`).** `node test_chain_pages.js`:
```
243 — headline pool selection ...
  ✗ population invariant: ... [PopaChain/en] answer block missing expected headline APY 20.00%:
    "The highest honest PopaChain yield right now is 50.00% on popa-proj2 (PopaChain), among 3
    pools above the $100K TVL floor. Rates are live from DefiLlama and exclude anomalous (>1000%
    APY) pools."
  ✗ attribution invariant: ... [PopaChain/en] answer block does not name the headline pool's
    project (popa-proj1): "The highest honest PopaChain yield right now is 50.00% on popa-proj2
    (PopaChain), ..."
243 — positive controls ...
  ✗ positive control: a 694.11% pool ... -> rendered answer must not headline the 694.11% rate
97 assertions passed   (exitCode 1 — RED, three assertions, as required)
```
Restored via the pre-mutation backup copy. `md5sum generate-chain-pages.js` →
`294a243406ef41abf02c2121f769fb5e` — **byte-identical**. `node test_chain_pages.js` afterward:
100/100 green again.

**(b) `buildAnswerAndFaq`'s 4th argument reverted from `headlinePool` to `top`, HTML path only
(`renderChainPage`).** `node test_chain_pages.js`:
```
243 — headline pool selection ...
  ✗ attribution invariant: ... [PopeChain/en] answer block does not name the headline pool's
    project (popE-good): "The highest honest PopeChain yield right now is 20.08% on popE-bad
    (PopeChain), ..."
243 — positive controls ...
  ✗ positive control: a 694.11% pool ... -> rendered answer must attribute to the representative
    pool, not the unrepresentative one
  ✗ positive control: a record where EVERY pool fails the gate -> fallback attribution must match
    the highest-APY pool, not the other one
97 assertions passed   (exitCode 1 — RED, three assertions, as required)
```
Restored via the pre-mutation backup copy. `md5sum` → `294a243406ef41abf02c2121f769fb5e` —
**byte-identical**. 100/100 green again.

**(c) Same two mutations (plain `Math.max` pool + `top` attribution) applied to the markdown path
(`renderChainPageMarkdown`) only, HTML path left correct.** `node test_chain_pages.js`:
```
243 — headline pool selection ...
  ✗ twin parity: ... [PopaChain/en] markdown twin's answer text does not match the expected
    buildAnswerAndFaq() output
99 assertions passed   (exitCode 1 — RED, one assertion, as required — population/attribution
    invariants stayed green here because they assert against the still-correct HTML path only,
    exactly isolating the twin-parity check as the one that catches a markdown-only regression)
```
Restored via the pre-mutation backup copy. `md5sum` → `294a243406ef41abf02c2121f769fb5e` —
**byte-identical** (same hash as the (a)/(b) restores, confirming all three mutations left the
file in the identical pre-mutation state once undone). 100/100 green again afterward.

## Verification runs (all within the 5-minute-per-command timebox; none killed by timeout)

Environment note: `node_modules/` did not exist at session start (same starting state 242's notes
describe) — `npm install` (network open, proxy reachable) pulled all declared dependencies
including `@napi-rs/canvas`, which `generate-chain-pages.js` transitively needs via
`generate-og-images.js`. Without it, `node test_chain_pages.js` cannot even load (confirmed: it
failed with `MODULE_NOT_FOUND: Cannot find module '@napi-rs/canvas'` before `npm install`).

```
node test_chain_pages.js        → 100/100 assertions passed, exit 0
node test_token_pages.js        → 109/109 assertions passed, exit 0
node test_token_chain_all.js    → 5/5 assertions passed, exit 0
node test_pool_twins.js         → 41/41 assertions passed, exit 0
node test_planner.js            → 208/208 assertions evaluated, exit 0
node test_protocol_parsing.js   → 9/9 passed, exit 0
node test_qualifier_fix.js      → 9/9 passed, exit 0
```
`test_token_pages.js` unaffected (109/109, same count as 242 shipped it at) proves no
cross-surface regression from touching `generate-chain-pages.js`'s destructure/call sites.

## Re-measured live impact (2026-08-06, `yields.llama.fi/pools` fetched fresh this session,
15,665 pools — script at `/tmp/.../scratchpad/measure_243.js`, NOT committed to the repo, runs the
real `rankTopChains(pools, 0)` against the live pool set)

| measure | number |
|---|---|
| chain pages generated (uncapped) | **87** |
| displayed pools across them (`rec.pools`) | **393** |
| displayed pools failing `isRepresentativeRate` | **47 (12.0%)** |
| displayed pools with no `apyMean30d` at all | **0** |
| pages whose headline APY string changed vs OLD `Math.max` | **6 (6.9%)** |
| pages on the fallback path (no representative pool displayed) | **1 (1.1%)** |
| **pages whose OLD headline/attribution named a MISMATCHED pool (the defect fixed)** | **53 (60.9%)** |

Reading these against 242's token-page numbers (2,102 pages / 25.0% failing / 4.9% headline
changed / 22.9% fallback / 20.0% mismatched attribution): the chain estate is far smaller (87
pages vs 2,102) because chains aggregate many more pools per page (mean ~4.5 displayed
pools/chain vs the token side's ~1.9), which structurally raises the odds that `rec.pools[0]`
(the TVL-largest pool, used for attribution) differs from whichever pool actually carries the
highest APY — hence the much higher **mismatched-attribution rate (60.9% vs 20.0%)** even though
the failing-representativeness rate (12.0%) and fallback rate (1.1%) are both lower than the
token side's. The core claim holds at a comparable-or-larger magnitude: roughly 6 in 10 chain
pages had their stated protocol corrected to match the rate actually being claimed, ~7% got a
corrected headline rate outright, and ~99% of chain pages have at least one representative pool
to headline honestly.

## Residual class left open (unchanged from spec, with today's numbers)

1. `app.js`'s analytics-grid sort modes — ranked on current APY, no representativeness check. Not
   touched by this item (different surface family, no generated-SEO-estate mirror pattern to
   reuse).
2. Token pages' documented fallback path (pages where no displayed pool is representative) —
   242's own residual, unchanged by this item. Re-measured for the chain estate's own equivalent
   above: **1 of 87 chain pages (1.1%)** hit the fallback, vs 242's measured **481 of 2,102 token
   pages (22.9%)** — the chain estate's much larger `rec.pools` sets per page make an
   all-pools-fail-the-gate page rare.
3. This item closes the class for chain pages (3 of 4 surfaces cumulative with 242: token pages +
   chain pages). No fourth-surface work (the analytics grid) is ticketed by this item — per the
   spec's own "Open questions", that is a fresh item per RAZOR's "smallest version" guidance,
   different surface family, different file.
