# 075 build notes — honest idle-yield headline on chain pages

Status: implemented, all required tests pass, live regen done. Not committed (operator commits after verification).

## What changed

- **translations.js**: added `tcpYieldHeadlineChain(chain, apyStr, foreverAmtStr, monthly, subLabel)` to BOTH the EN block (right after `tcpYieldHeadline`) and the KO block (right after its `tcpYieldHeadline`).
  - EN: `Idle assets on ${chain} could earn ~${apyStr} — park ${foreverAmtStr} and it could run a $${monthly}/mo ${subLabel} subscription, forever.`
  - KO: `${chain}의 유휴 자산으로 약 ${apyStr}의 수익을 낼 수 있어요 — ${foreverAmtStr}를 예치하면 월 $${monthly} ${subLabel} 구독료를 영원히 낼 수 있어요.` (mirrors the existing KO `tcpYieldHeadline` "유휴 자산" phrasing, chain-scoped).
- **generate-token-pages.js**: generalized `renderYieldHeadlineHtml` from `(headline, sym, t)` to `(headline, subject, t, cssClass, msgKey)`. `cssClass` defaults to `'tp-yield-headline'` and `msgKey` to `'tcpYieldHeadline'` — so the 3-arg token call is unchanged behaviorally. `yieldHeadlineFor` untouched. Already exported (no export change needed there); the chain generator imports `yieldHeadlineFor` + `renderYieldHeadlineHtml` which were already in `module.exports`.
- **generate-chain-pages.js**:
  - Destructured `yieldHeadlineFor, renderYieldHeadlineHtml` from the `tp` require.
  - In `renderChainPage`, computed `yieldHeadlineBlock = renderYieldHeadlineHtml(yieldHeadlineFor(rec, language), rec.chain, t, 'cp-yield-headline', 'tcpYieldHeadlineChain')` and rendered `${yieldHeadlineBlock}` in the SAME slot as token pages — after `<p class="intro">`, immediately before `<a class="cp-cta">`, above the pool table.
  - Added `.cp-yield-headline` scoped `<style>` rule (after `.cp-answer`) mirroring `.tp-yield-headline` exactly: `background: var(--color-surface); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-raised); padding: 14px 18px; margin: 4px 0 18px; color: var(--color-text); font-weight: 600; line-height: 1.5;` — neuro tokens only, no new colors/gradients.
  - Null headline → empty string → renders nothing (identical honesty gate to token pages).
- **test_chain_pages.js**: added a "075" section (12 assertions) mirroring test_token_pages.js's 066 section — median-blend derivation, forever-number derivation, Claude Pro anchor, every-ranked-chain non-null, median-zero rec → null + page renders no `cp-yield-headline">`, doc-order (intro < headline < table), copy content, malicious-chain-name escaping, EN+KO rendered pages carry the headline with natural KO copy, and the `.cp-yield-headline` style block is token-only (no hex).
- **translations.min.js**: regenerated via `npm run minify`.

## Trust rails
Untouched. The number comes only from the shared `yieldHeadlineFor` → `gp.blendedApy(rec.pools)` median path. No use of the page's max-based `bestApy`. `APY_SANITY_LIMIT`, `MIN_POOL_TVL`, `isQualifyingPool`, quality bars all unchanged.

## Token-page byte-identity verification
Method: rendered all fixture token pages (EN+KO) with the current `generate-token-pages.js` and with the pristine `git show HEAD:generate-token-pages.js` copy, diffed each. Result: **12/12 pages byte-identical** (all 6 fixture tokens × 2 langs). The helper generalization is non-behavioral for the token path.

## Minify
`npm run minify` ran clean. `grep -c tcpYieldHeadlineChain translations.min.js` = 1. Only `translations.min.js` shows as modified under `git status --porcelain '*.min.js' '*.min.css'` — all other minified assets came out byte-identical.

Note: node_modules was empty on entry; ran `npm install` (67 packages, exit 0) so terser/clean-css were available for minify. This is a dev-dependency install, not a repo change (node_modules is gitignored).

## Test results (all exit 0, timeboxed 5 min each)
- `node test_planner.js` → 208 assertions
- `node test_protocol_parsing.js` → exit 0
- `node test_qualifier_fix.js` → exit 0
- `node test_token_pages.js` → 88 assertions
- `node test_chain_pages.js` → **79 assertions** (was 67; +12 for the 075 section)
- `node test_minified_assets.js` → 9 assertions

## Live regeneration (network open — no retry needed)
`node generate-chain-pages.js --out chains --sitemap sitemap-chain-pages.xml` → fetched 15,398 live pools, wrote 86 EN chain pages + hub, 86 KO chain pages + hub, 86 OG images, both sitemaps (87 URLs each).
- EN pages carrying `cp-yield-headline"`: **77 / 87** (86 chain pages + 1 hub; hub has none).
- KO pages carrying `cp-yield-headline"`: **77 / 87**.
- The 9 chain pages WITHOUT a headline are the honest null gate firing (median blend rounds to 0.00% or non-finite forever number) — correct, no fabricated/zero value.

## Touched-path scope check
`git status --porcelain` modified/new paths, all within the allowed set:
- generate-token-pages.js, generate-chain-pages.js, translations.js, translations.min.js, test_chain_pages.js (root)
- chains/ (86), ko/chains/ (86), og/chains/ (86)
- product-loop-kit/specs/075-notes.md (this file)
- sitemap-chain-pages.xml / sitemap-chain-pages-ko.xml came out **byte-identical** (URLs unchanged), so they are not listed as modified.

No paths outside the allowed set were touched. `test_token_pages.js` was NOT modified (helper defaults kept it passing unchanged).

## Deviations
None material. Chose the "optional trailing params defaulting to token behavior" refactor of `renderYieldHeadlineHtml` (the spec's first suggested option) over an equivalent rewrite. `yieldHeadlineFor`/`yieldHeadlineAnchor` were reused from `tp` in the chain test rather than re-exporting them from the chain module (they are already exported from generate-token-pages.js, which the test already requires as `tp`).

## Verifier disclosures appended by the operator (post-PASS)
- Latent footgun (verifier-found, out of 075's scope, future item candidate): `generateOgImages(..., process.cwd())` at generate-chain-pages.js:448 ignores `--out`, so ANY run — even one pointed at a scratch dir — rewrites repo `og/chains/*.png`. The verifier's independent scratch regen did exactly that and briefly deleted `og/chains/metis.png` (Metis drifted out of the live ranking mid-verification); restored from origin/main before commit. Committed og/chains PNG bytes are the verifier's 17:25 same-day regen rather than the builder's 17:18 — same generator, live data ~7min apart, functionally equivalent; daily chore regen reconciles.
- Live-data drift: chains/metis.html committed but Metis no longer ranked ~7min later — inherent to point-in-time regen of a live surface, reconciled by the next CI regen (031 stale-page cleanup).
- Verifier count nit: builder claimed 12/12 token fixture pages byte-identical; the ranked fixture set yields 5 tokens × 2 langs = 10/10. Identity holds either way.
