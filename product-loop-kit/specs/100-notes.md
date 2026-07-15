# 100 — build notes

Branch: `claude/inspiring-meitner-e6296h` (harness-pinned; per NORTH_STAR 2026-07-13/104,
everything — code + compiled artifacts + test + all bookkeeping — lands in ONE commit on this
branch, then PR + self-merge).

## What changed
- `app.js` — in `parseNaturalLanguageQuery`'s SECOND token-parse fallback (`if (!token && tokenCandidateText)`),
  expanded the `chainNames` exclusion array from the 8 long chain names to all 24 `chainAliases`
  keys (short + long). One code comment added noting the sync requirement with `chainAliases`
  (which is in TDZ at that point, so its keys can't be referenced directly). Nothing else in the
  function touched — the `t.length >= 3` gate, primary word-boundary loop, `wordsAfterChainIndicators`
  skip, and `qualifierWordsCheck` are all unchanged.
- `app.compiled.js` + `app.compiled.min.js` — regenerated via `npm run compile && npm run minify`
  (prod loads the min bundle via `home.html`). `moonbeam`/`cronos` present in both → fix reached prod bundle.
- `test_parser_chain_token.js` — new, follows the `test_qualifier_fix.js` / `extractParser` real-parser
  pattern (no inline parser copy). 6 asserts: 4 leak-fix cases + 2 regression cases. Wired to the end
  of the `npm test` chain in `package.json`.

## Conservative choices / deviations
- **Robust over minimal:** the spec's minimum was `eth`/`sol`/`arb` (the confirmed live offenders).
  I excluded ALL alias keys instead, so a future chain whose short alias is a substring of its long
  name can't re-introduce the class. Safe because this fallback is only reached when the primary
  word-boundary loop found no token, so any substring-of-a-chain-word pick it makes is by definition
  the bug — a legitimate whole-word token is caught earlier by the primary loop (proven by the
  `usdc on ethereum` / `top usdc yields` regression asserts).
- **Did NOT touch the `t.length >= 3` gate** (out of scope per spec) — `op`/2-char aliases don't leak.
- **Did NOT convert the fallback to word-boundary matching** — that would make it duplicate the primary
  loop and kill its substring purpose (catching a token embedded in a compound word). The exclusion-set
  fix preserves that purpose while closing the chain-alias hole.
- **Compiled artifacts:** `@babel/core`/`terser`/`clean-css` are not in the base sandbox image; installed
  the `package.json`-pinned versions with `--no-save` to run compile/minify. `package.json` deps unchanged.

## Mutation proof (test bites)
- Buggy app.js (chainNames reverted): `test_parser_chain_token.js` → 2/6, exit 1 (`on arbitrum`→ARB etc. fail;
  the 2 whole-word regression cases still pass).
- Fixed app.js: 6/6, exit 0. app.js byte-identical to fixed version after restore.

## Tests run (targeted, not the full chain — known unrelated sandbox failures elsewhere)
- `test_parser_chain_token.js` 6/6 · `test_qualifier_fix.js` 9/9 · `test_protocol_parsing.js` 9/9 ·
  `test_planner.js` pass · `test_compiled_assets.js` 4/4 · `test_minified_assets.js` 9/9.

## Risk tier: HIGH
User-facing behavior change on the analytics search path ("anything user-facing beyond copy/styling" +
"when in doubt → HIGH", NORTH_STAR risk policy). NOT on the NEVER list: no trust-rail weakening
(APY_SANITY_LIMIT / DEFAULT_MIN_TVL / anomaly / haircut untouched), no credentials/money, no SEO deletion,
no out-of-scope dirs. Does not alter `?token=`/`?chain=`/`?pool=` URL-param behavior (this is search-box
free-text parsing only) or the `home.html` router. HIGH → full explainer + 5-question quiz in specs/100-pr.md
before merge. Render-path merge without the 003 pixel gate → advisory "needs human visual spot-check" (the
change is pure query-parsing logic with no visual surface, but logging it per policy).
