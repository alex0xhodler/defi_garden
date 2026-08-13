# 279 — build notes

## Root cause
Token pages led with one representative current rate, while comparative rate behaviour existed only on the curated Google head. The all-eligible-token generator therefore had no direct, citation-ready answer for steadier historical APY among already-railed candidates.

## Implementation
- The generator consumes DefiLlama's top-level `count` and `sigma` fields for already-railed displayed pools. Comparable history requires `count >= 30`.
- Public output is ordinal only. It exposes neither numeric Sharpe/sigma/count nor raw history, and x402 remains dark.
- Fewer than two comparable pools produces the same honest insufficient-history answer across EN/KO rather than an APY/TVL fallback labelled as stability.
- One shared rate-stability data object feeds visible HTML, the Markdown twin, and FAQ JSON-LD facts.
- Ranked rows retain TVL, current APY, protocol, chain, the excluded-risk copy, and source links carrying `src=seo_token`.

## Test evidence
- Item test: 8/8.
- Contract populations: token pages 109; token-route depth 27; Markdown twins 16; source-attribution checks 6; registry checks 5.
- Live generation used 15,607 pools and produced 2,069 token records with 795 sitemap heads. Two runs retained the same generated population.
- The pre-existing translation arity baseline remains 13 assertions with four known zero-argument entries.

## Browser evidence
Real generated pages showed AAVEUSDC ranked in EN at desktop and mobile widths and in KO; 0X0 showed the insufficient-history state.

## Review
Attempt 1 is IN_REVIEW. The reviewer returned AMEND because source attribution was missing from generated links; `src=seo_token` was added. That amendment has not yet been re-reviewed.

## Risk and outcome boundary
HIGH: the generated delta is very large because this is the expected estate-wide clean cutover. No traffic or citation outcome follows from generation; the retrieval/read/citation ladder remains gated. No `docs.md` exists in the affected area, so no Noridoc changed.
