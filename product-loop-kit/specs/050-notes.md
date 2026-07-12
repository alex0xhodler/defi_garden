# Spec 050 — build notes

## URL scheme decision (spec's open question, resolved without asking)
Went with the spec's SOTA-recommended **subdirectory** scheme (`/ko/tokens/<slug>`,
`/ko/chains/<slug>`), not the `?lang=ko` fallback the spec offered as the
no-routing-change default. Reasoning: `?lang=ko` cannot work for these pages
at all — they're pre-generated static HTML files (the entire point of
014/021/041), and a query string can't select different static content on
Vercel; `/tokens/1inch.html?lang=ko` and the bare URL are byte-identical
responses. So the fallback wasn't actually an option here, only a real
subdirectory path could produce genuinely distinct, crawlable Korean content.

Checked whether the subdirectory needs a `vercel.json` change (the spec's
stated HIGH-router-adjacent trigger): it doesn't. `cleanUrls: true` is a
blanket, unscoped policy — it already resolves `/tokens/az/<letter>` to
`tokens/az/<letter>.html` with zero explicit rewrite rules, and the same
generic mechanism resolves `/ko/tokens/<slug>` for free. `vercel.json` is
untouched by this diff.

## Pluralization redesign (deviation from spec's literal template)
The spec's evidence section didn't anticipate this, but Korean nouns don't
inflect for plural the way English does ("pool" vs "pools"). Pre-computing
an English `poolWord`/`chainWord`/`tokenWord` string in the generator (the
existing en-only pattern) and interpolating it into a Korean sentence would
have leaked English words into the ko pages. Fixed by redesigning the
`tcp*` translation keys to take raw counts and do pluralization internally,
per language (`count === 1 ? 'pool' : 'pools'` for en, just `풀` for ko,
since Korean doesn't need the branch at all).

## `$100K` / `1000%` stay literal in Korean copy
First pass localized the "$100K TVL floor" mention into Korean numeral
notation (`$10만`, i.e. 10×10,000). Caught in self-review: CLAUDE.md pins
"all money/number formatting to en-US" with no exception carved out for
prose mentions of the fixed trust-rail constants, and the spec explicitly
says "Numbers stay en-US-formatted per CLAUDE.md." Reverted to keeping
`$100K` / `1000%` as literal en-US text embedded in the Korean sentences —
this is normal in Korean crypto/DeFi writing (mixing `$`-prefixed figures
and acronyms like APY/TVL into Korean prose is already how the rest of the
page does it) and removes any ambiguity for the trust-rail invariant.

## Bug found + fixed: `koOutDir` path collapse
Original `path.resolve('ko', args.out)` silently collapses to just
`args.out` whenever `--out` is an absolute path (`path.resolve` discards
earlier segments once it hits an absolute one) — this would have written
the Korean pages on top of the English ones instead of into a sibling `ko/`
directory. Caught by generating into `/tmp/gen-test/tokens` during manual
verification (the CI workflow always calls with the relative `--out tokens`,
so this wouldn't have surfaced there, but it's exactly the kind of
silent-in-CI, broken-elsewhere bug that erodes trust in the generator).
Fixed in both `generate-token-pages.js` and `generate-chain-pages.js` via
`path.join(path.dirname(outDir), 'ko', path.basename(outDir))` — always a
sibling of `outDir`, never a `resolve()` collapse.

## English leakage found + fixed during self-review
Two shared helpers hardcoded English copy that the per-page translation
pass missed on the first draft:
- `renderFaqBlockHtml`'s "Frequently asked questions" `<h2>`/aria-label was
  a string literal, not routed through `t()`. Added a `lang` param.
- `renderItemListJsonLd`'s `ItemList.name` field built `"${project} on
  ${chain}"` — an English preposition baked into JSON-LD content. Added a
  `tcpItemListName` key (en: `"X on Y"`, ko: `"Y의 X"`, matching the
  existing intro sentence's phrasing) and a `lang` param.

`test_i18n_pages.js`'s `assertNoEnglishLeak` check (a literal-phrase
denylist against known template strings) is what caught both — kept as a
permanent regression test, not just manual verification.

## Not committed in this PR: real `ko/tokens/`, `ko/chains/` HTML output
Same pattern as 021/041/045: `yields.llama.fi` is network-blocked in this
sandbox, so the generators only ran here against the offline test fixtures
(`test_fixtures/pools-sample.json`, `pools-chain-sample.json`) for
verification — output inspected manually and asserted in
`test_i18n_pages.js`. The real ~2,100 Korean pages + `sitemap-token-pages-ko.xml`
/ `sitemap-chain-pages-ko.xml` land automatically on the next
`sitemap-update.yml` CI run (it already regenerates `tokens/`/`chains/` on
every push touching these generators, and `main()` now writes the ko output
unconditionally in the same pass — no separate CI step was needed). The
workflow's commit step was extended to `git add` the new `ko/`,
`sitemap-token-pages-ko.xml`, `sitemap-chain-pages-ko.xml` paths.

## Scope held
- No changes to `vercel.json`, the `__APP_MODE` router, or any `?token=/?chain=/?pool=`
  behavior.
- No changes to `stories/*.html` or the app shell (`home.html`, `plan.html`,
  `app.js`, `planner.js`) — out of scope per spec ("translating the app
  shell further (already done)").
- `test_smoke.js` fails in this sandbox exactly as it did before this diff
  (network-blocked `yields.llama.fi` fetch — documented precedent in
  BACKLOG item 040's row) — not a regression from this change; every other
  test in the `npm test` chain, including the 12 new `test_i18n_pages.js`
  assertions, passes.
