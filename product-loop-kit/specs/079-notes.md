# 079 — implementation notes

## What was done
- `translations.js`: added flat key `tcpWaitlistPitchHub` (no-arg generic honest pitch),
  EN + KO, placed with the other tcp waitlist keys (after `tcpWaitlistPitchChain`).
  EN: "A card that spends your DeFi yield — never your principal. Join the waitlist…".
  KO mirror added. `npm run minify` regenerated → only `translations.min.js` drifted.
- `generate-token-pages.js`:
  - `renderHubStyleBlock()` now appends `renderWaitlistCtaStyle('hub')`.
  - `renderTokenHubPage` inserts the CTA block (source `seo_tokens_hub`) after the A–Z
    hub-card, before the trailing trust `<p class="note">`.
  - `renderTokenAzPage` inserts the same block, source `seo_tokens_az`.
- `generate-chain-pages.js`: `renderChainHubPage` inserts the block, source
  `seo_chains_hub`. Both helpers were already imported (lines 41/46) — no import change
  needed.
- Regenerated the 58 committed spine files LIVE (yields.llama.fi reachable via node):
  tokens/index.html, tokens/az/*.html (27), chains/index.html + the three KO mirror sets.
  Copied ONLY those 58; leaf pages left on their older snapshot on purpose.
- Tests: extended `test_hub_pages.js` (CTA presence, exactly-one-block guard, per-surface
  source, EN+KO copy, placement before trust note) and `test_waitlist_seo_entry.js`
  (real served tokens/index.html → visible CTA → click → plan.html modal +
  waitlist_opened source=seo_tokens_hub).

## Deviations / conservative choices
- Sitemap files (sitemap-{token,chain}-pages{,-ko}.xml) were written to the repo root by
  the generators (their default sitemap output path, independent of --out). They only
  drifted by lastmod date (2026-07-13 → -14). Spec says NO sitemap changes, so I restored
  all four with `git checkout`.
- Leaf pages (tp/cp prefixes) are byte-identical: my edits touch only the hub/az/chain-hub
  renderers and `renderHubStyleBlock` (hub-only); `renderTokenPage`/`renderChainPage` and
  the `renderWaitlistCtaHtml`/`renderWaitlistCtaStyle` helpers themselves were not changed.
- `og/` unchanged after the scratch run (verified: 0 og/ entries in git status).
- Hub honesty micro-line assertion in test uses the HTML-escaped form
  (`Card doesn&#39;t exist yet`) since escapeHtml encodes the apostrophe.

## Verification (58-file proof)
- `grep -l hub-waitlist <58 files>` → 58
- exactly one `class="hub-waitlist"` per file (loop check, no BAD output)
- sources: tokens/index → seo_tokens_hub (1), ko mirror (1); chains/index → seo_chains_hub
  (1), ko mirror (1); all 54 az files → seo_tokens_az
- KO files carry `대기자 명단` / `카드는 아직 없어요`

## Test chain result
Ran all 32 suites individually with a 300s (5-min) per-suite timebox.

PASS (30): test_planner (208), test_protocol_parsing, test_qualifier_fix,
test_compiled_assets (4), test_minified_assets (9), test_css_minified_render (2),
test_smoke (8, 96s), test_canonical (24), test_token_pages (88), test_chain_pages (79),
test_sitemap_xml (25), test_hub_pages (42 — extended), test_indexnow (10),
test_stories (21), test_i18n_pages (19), test_og_images (18), test_og_outroot (4),
test_cache_headers (7), test_spotlight (38), test_spotlight_packs (11),
test_spotlight_url (3, 40s), test_spotlight_attribution (3, 27s),
test_growth_capital_projection (2, 28s), test_waitlist_seo_entry (5 — extended),
test_waitlist_funnel (3), test_waitlist_pitch (7), test_hero_copy (4),
test_waitlist_microcopy (6), test_rate_volatility (5, 55s), test_dead_pool (5).

PRE-EXISTING failures (NOT caused by this change — reproduced identically on the
clean tree with my changes stashed):
- test_search: TIMEOUT at 300s (19/20 passed before kill). Playwright suite; each
  case pays the mp.defi.garden goto timeout in-sandbox (documented in
  test_waitlist_seo_entry.js's own header). On the stashed clean tree it also
  hangs (Terminated). Does not touch any surface this change modifies.
- test_analytics_fires: FAIL — `page.goto` 15s timeout navigating to /tokens/big
  (a LEAF page, waitUntil:'load'), i.e. the same external-resource-hang class.
  Reproduced identically on the stashed clean tree. /tokens/big is a leaf page
  this change does not modify.

My two extended suites (test_hub_pages 42 assertions, test_waitlist_seo_entry 5
assertions incl. the new hub click-through) both pass. Everything I touched is green.

## Verifier disclosures (operator addendum, post-PASS)
- Data drift beyond the CTA in the 58 regenerated files includes hub META DESCRIPTIONS
  (e.g. "2043 tokens" → "2046 tokens") and pool counts/APYs — implied by the live-regen
  instruction and reconciled by the daily CI, recorded here explicitly.
- Verifier incident (self-disclosed, fully recovered): a `git checkout --` during its
  first mutation-restore momentarily replaced the uncommitted tokens/index.html with the
  HEAD version; recovered byte-identical from the git blob persisted by the builder's
  stash run, final tree verified identical via sha256 of status + full diff. Operator
  re-spot-checked the file before shipping.
- Ops note: the verifier agent froze mid-run on a swallowed Bash tool result (25+ min on
  an instant grep, transcript stale, no child processes) — recovered via TaskStop +
  SendMessage resume with context intact. Same harness-hang class as the stale-remote
  container issues LOG'd on 07-13; watch for it in future runs.
- test_search was accepted on the builder's stash-proof + the verifier's own clean-tree
  reproduction of the failure class (300s sandbox hang, documented since 077) rather
  than a second full re-run — truncation disclosed in the verdict.
