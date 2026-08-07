# 240 notes — one footer contract across the three money surfaces

## What changed (file:line)

- `translations.js`
  - EN root footer block (was `:139-142`, now `:139-143`): added `defillamaApi: "DefiLlama API"` and
    `footerSignOff: "Education, not advice."`; deleted `madeWith`. `poweredBy`/`browseTokens`/`browseChains`
    unchanged.
  - KO root footer block (was `:867-870`, now `:863-867`): `poweredBy` value changed from the terse
    `"제공:"` to the landing subtree's more natural `"데이터 제공:"`; added `defillamaApi: "DefiLlama API"`
    and `footerSignOff: "투자 조언이 아닙니다."`; deleted `madeWith`.
  - Deleted the five duplicate `landing.footerPoweredBy` / `footerDefillamaApi` / `footerMadeWith` /
    `footerBrowseTokens` / `footerBrowseChains` keys from **both** the EN `landing` subtree (was
    `:191-195`) and the KO `landing` subtree (was `:919-923`).
- `landing.js:183-190` — added `rootCopy = translations[language] || translations.en || {}` (mirrors the
  `plannerCopy` subtree-with-EN-fallback pattern one line above it). `landing.js:356-367` footer now reads
  `rootCopy.poweredBy` / `rootCopy.defillamaApi` / `rootCopy.footerSignOff` / `rootCopy.browseTokens` /
  `rootCopy.browseChains` instead of the deleted `copy.footer*` keys, with `'. '` as its own literal text
  node between the anchor and the sign-off (matches the spec's exact markup shape).
- `app.js:2981-2996` (pool-detail footer) and `app.js:3533-3549` (grid footer) — both rewritten to
  `t('poweredBy')`, `t('defillamaApi')`, `'. '`, `t('footerSignOff')`, `t('browseTokens')`,
  `t('browseChains')`. Byte-identical structure to each other and to `landing.js`'s footer markup.
- `planner.js:3909-3931` — **deviation-driven fix**, see below: the static `.seo-hub-links` crawler-footer
  KO-localization effect now reads `tr[lang].browseTokens` / `tr[lang].browseChains` (root) instead of the
  deleted `tr[lang].landing.footerBrowseTokens` / `footerBrowseChains`. Comment updated to explain why.
- `audit-app.js:967` — i18n untranslated-allowlist entry renamed from `'landing.footerDefillamaApi'` to
  `defillamaApi` (the brand-name key moved to root; a stale key-path entry would just go unused, but an
  unused entry is a silent trap for the next person reading the allowlist, so it was repointed instead of
  left dangling).
- `test_ko_landing_footer.js` — header comment gets a short "item 240 update" paragraph; `EXPECTED_KO_TEXT`
  / `EXPECTED_EN_TEXT` updated to the new sentences; added a `/디젠/` regex assertion alongside the existing
  literal `'Made with AI & Degen Love.'` substring check (both now prove the retired phrase is ABSENT, not
  present). Rig/port/fixture-routing untouched, as instructed.
- `test_footer_contract.js` (new) — Playwright, port `8877` (scanned `grep -h "^const PORT" test_*.js`,
  highest existing was `8876`). Drives `/`, `/?token=USDC`, `/?pool=usdc-base-aave` × `?lang=en`/`?lang=ko`
  and asserts, per language: (1) `footer.app-footer` normalized text identical across all three surfaces
  (population invariant — `Set` size === 1 over the three rendered texts, no hardcoded golden string), (2)
  a DefiLlama attribution anchor to `https://api-docs.defillama.com/` on all three, (3) `/tokens` +
  `/chains` hub links on all three, (4) rendered text matches neither `/degen/i` nor `/디젠/`. Plus one
  source-level leg reading `app.js`, `translations.js`, `landing.js`, `app.compiled.js`,
  `app.compiled.min.js`, `translations.min.js` off disk for zero `/degen love/i` matches.
- `package.json` — `test:serial` gets `&& node test_footer_contract.js` appended at the end.
- Regenerated committed twins: `app.compiled.js`, `app.compiled.min.js`, `planner.min.js`,
  `translations.min.js` (via `node compile-app.js && node minify-assets.js`, the `npm run compile` /
  `npm run minify` scripts). `style.min.css`, `planner-styles.min.css`, `pool-detail-styles.min.css`,
  `PoolDetail.compiled.js`, `PoolDetail.compiled.min.js` were also touched by the regen script but their
  content is unaffected by this change (`git diff --stat` shows no lines changed for the CSS/PoolDetail
  outputs — the minifier re-ran and produced byte-identical output, so they show clean in `git status`).

## Deviations from spec 240 and why

1. **`planner.js` fix (not in the spec's file list) — required, not optional.** The spec's own instruction
   (`"Before deleting, grep -rn each removed key across the repo... to be sure landing.js is the only live
   consumer"`) caught a real hazard: `planner.js:3928-3929` was ALSO a live consumer of
   `translations[lang].landing.footerBrowseTokens` / `.footerBrowseChains` — it uses those exact keys to
   re-key the static `.seo-hub-links` crawler footer's anchor text after the planner mounts (covered by
   `test_footer_hub_links.js` case A7, `/plan.html?lang=ko`). Deleting those two keys from the `landing`
   subtree as literally instructed would have silently broken KO localization of `/plan.html`'s hub links
   (the effect is wrapped in a `try/catch` that swallows errors, so it would NOT have thrown — it would
   just have quietly stopped working, exactly the kind of regression a i18n-parity-only test suite would
   miss). Verified first that `translations.landing.footerBrowseTokens`/`footerBrowseChains`'s EN/KO values
   were byte-identical duplicates of the root `browseTokens`/`browseChains` (they were, in both languages),
   then repointed `planner.js`'s effect at the root keys instead of leaving the landing-subtree duplicates
   in place. This satisfies the spec's literal "delete the five landing.footer* keys" instruction AND keeps
   `/plan.html?lang=ko`'s hub-link localization working, closing one more surface onto the single source of
   truth in the process (a strict improvement over what the spec asked for, not scope creep — same two
   values, same behavior, one fewer duplicate).
2. **`audit-app.js` allowlist repoint (not in the spec's file list) — required for a listed test to pass.**
   `defillamaApi`'s value ("DefiLlama API") is byte-identical in EN and KO by design (a brand name) — the
   `en-ko-parity` value-honesty rule in `audit-app.js`'s `prescanI18n()` would flag any top-level key whose
   KO value has no Hangul and isn't on `I18N_UNTRANSLATED_ALLOWLIST`. The existing allowlist entry was
   keyed `'landing.footerDefillamaApi'`, which no longer exists post-delete; without repointing it to the
   new root key `defillamaApi`, `test_audit_i18n_parity.js`'s "against the REAL translations.js: suspects
   === 0" assertion would go red. Repointed rather than left stale.
3. **KO `poweredBy` value change is a deviation from "smallest diff" in letter, but is explicitly directed
   by the spec** ("adopt the landing subtree's more natural value, replacing the terse '제공:'") — noted
   here only because it changes an EXISTING (not new) key's value, which is a slightly larger blast radius
   than adding new keys; grepped for other consumers of the root `poweredBy` key first (none besides the
   three footers) before making the change.
4. Did not touch `test_footer_hub_links.js`'s prose comments (lines ~46-48, ~53) that still say
   "footerBrowseTokens/footerBrowseChains" — those are comments only, not executable assertions, the file's
   actual behavior is unaffected by the key rename, and the task's "rig/port/fixture-routing untouched"
   discipline for test files argued against a drive-by comment edit in a file spec 240 didn't ask me to
   touch. Flagging here in case a future item wants it cleaned up.

## Conservative choices

- Kept `test_ko_landing_footer.js`'s rig (server, port `8867`, fixture pools, `IGNORABLE_ERROR_PATTERN`)
  byte-for-byte untouched — only the expected-text constants and the negative assertion changed, per spec.
- `test_footer_contract.js` deliberately asserts the cross-surface **population** invariant (`Set` size ===
  1 over the three surfaces' texts) rather than a single hardcoded golden string duplicated three times —
  per the repo's stated razor ("assert invariants over the population, the motivating instance is only a
  positive control") and per the spec's explicit instruction not to hardcode a golden string.
- Did not touch `stories/` (tomoko/kevin/lucia persona pages) — confirmed via `grep -ri "degen love"
  stories/` → zero hits already; the spec explicitly excludes them ("persona pages have deliberate voice").
- Did not touch any `tokens/`, `chains/`, `pools/` generated SEO pages or sitemap — confirmed
  `git status --short` shows zero changes under those paths after the regen, i.e. zero `<loc>` delta,
  satisfying the spec's "if generators embed footer copy: regen delta controlled... copy-only delta, zero
  `<loc>` changes" criterion by there being no delta there at all (those pages never embedded this footer).

## Non-vacuity mutation transcript

Baseline (working tree at the point mutation testing started), captured via md5sum:
```
$ md5sum translations.js translations.min.js app.compiled.js app.compiled.min.js app.js
ec21cc7f36f7631b6cd0d3f6627434eb  translations.js
5a5886bc0b0c84d6c67998f9fd209aaa  translations.min.js
788b87aae92eb13d75181a95e22ee4e2  app.compiled.js
c238a7f817c9e9f396f92e952f4897d0  app.compiled.min.js
7f828d017fa53a8adef6f8811be633a9  app.js
```

### (a) Reintroduce the EN sign-off in `translations.js`, regen, run `test_footer_contract.js`

Edit: `footerSignOff: "Education, not advice."` → `footerSignOff: "Made with AI & Degen Love."` (EN only).
Ran `node compile-app.js && node minify-assets.js`.

```
$ node test_footer_contract.js
  ✓ [en] footer.app-footer text is IDENTICAL across all three surfaces
  ✓ [en] every surface carries a DefiLlama attribution anchor to https://api-docs.defillama.com/
  ✓ [en] every surface carries the /tokens and /chains hub links
  ✗ [en] rendered footer text matches neither /degen/i nor /디젠/
    landing (/): footer text matches /degen/i: "Powered by DefiLlama API. Made with AI & Degen Love. Browse tokens · Browse chains"
  ✓ [ko] footer.app-footer text is IDENTICAL across all three surfaces
  ✓ [ko] every surface carries a DefiLlama attribution anchor to https://api-docs.defillama.com/
  ✓ [ko] every surface carries the /tokens and /chains hub links
  ✓ [ko] rendered footer text matches neither /degen/i nor /디젠/
  ✗ zero /degen love/i matches in source + compiled/minified twins
    "degen love" still present in: translations.js, translations.min.js
7 footer-contract assertions passed
$ echo $?
1
```
RED on both the render-side `/degen/i` leg (EN only, KO leg correctly stayed green — proves the assertion
is language-scoped, not a blanket false-positive) AND the source-level regen-proof leg, independently.

Restored `footerSignOff` to `"Education, not advice."`, re-ran `node compile-app.js && node
minify-assets.js`, verified byte-identical restore:
```
$ md5sum translations.js translations.min.js app.compiled.js app.compiled.min.js app.js > post_a.txt
$ diff pre_mutation_md5.txt post_a.txt && echo "MD5 MATCH - byte identical restore"
MD5 MATCH - byte identical restore
```
Re-ran `test_footer_contract.js`: all 9 assertions green, exit 0.

### (b) Break ONE surface only — drop the DefiLlama anchor from the grid footer in `app.js`

Edit: removed the `React.createElement('a', {href: 'https://api-docs.defillama.com/', ...}, t('defillamaApi'))`
node from the **grid-view** footer only (`app.js` line ~3537-3541), leaving `t('poweredBy')` and the
literal `'. '` + `t('footerSignOff')` in place — pool-detail and landing footers untouched. Regenerated.

```
$ node test_footer_contract.js
  ✗ [en] footer.app-footer text is IDENTICAL across all three surfaces
    expected one shared footer text across landing (/), grid (/?token=USDC), pool-detail (/?pool=usdc-base-aave); got:
  landing (/): "Powered by DefiLlama API. Education, not advice. Browse tokens · Browse chains"
  grid (/?token=USDC): "Powered by . Education, not advice. Browse tokens · Browse chains"
  pool-detail (/?pool=usdc-base-aave): "Powered by DefiLlama API. Education, not advice. Browse tokens · Browse chains"
  ✗ [en] every surface carries a DefiLlama attribution anchor to https://api-docs.defillama.com/
    grid (/?token=USDC): missing anchor to https://api-docs.defillama.com/
  ✓ [en] every surface carries the /tokens and /chains hub links
  ✓ [en] rendered footer text matches neither /degen/i nor /디젠/
  ✗ [ko] footer.app-footer text is IDENTICAL across all three surfaces
    ... (grid missing "DefiLlama API" in the KO string too)
  ✗ [ko] every surface carries a DefiLlama attribution anchor to https://api-docs.defillama.com/
    grid (/?token=USDC): missing anchor to https://api-docs.defillama.com/
  ✓ [ko] every surface carries the /tokens and /chains hub links
  ✓ [ko] rendered footer text matches neither /degen/i nor /디젠/
  ✓ zero /degen love/i matches in source + compiled/minified twins
5 footer-contract assertions passed
$ echo $?
1
```
Both the cross-surface-identity leg AND the attribution leg went RED, in BOTH languages, and independently
of each other and of legs 3/4 (hub links, degen-absence) which correctly stayed green — this is the
distinguishing proof that "three working assertions" ≠ "one working assertion and two dead ones".

Restored the anchor, re-ran regen, verified byte-identical restore:
```
$ md5sum app.js app.compiled.js app.compiled.min.js > post_b.txt
$ diff pre_mutation_b_md5.txt post_b.txt && echo "MD5 MATCH - byte identical restore"
MD5 MATCH - byte identical restore
```
Re-ran `test_footer_contract.js`: all 9 assertions green, exit 0 (final state, matches the transcript above).

## Test results (verbatim, this session)

All run against the post-mutation-restore, final working tree.

- `node test_footer_contract.js` — **9/9 PASS** (new file).
- `node test_ko_landing_footer.js` — **2/2 PASS**.
- `node test_footer_hub_links.js` — first run: 10/11, one failure
  (`bare / (landing): inline critical CSS hides static footer pre-swap` → `page.goto: Timeout 15000ms
  exceeded`). Re-ran immediately: **11/11 PASS**. Not stashed-and-verified as pre-existing because it is
  self-evidently a one-off sandbox/network flake unrelated to footer copy (a page-load timeout on an
  unrelated route, not an assertion failure) and it passed clean on immediate retry with no code changes in
  between.
- `node test_landing.js` — **5/5 PASS**.
- `node test_compiled_assets.js` — **4/4 PASS**.
- `node test_minified_assets.js` — **9/9 PASS**.
- `node test_min_asset_boot.js` — **18/18 PASS**.
- `node test_translations_fallback.js` — **8/8 PASS**.
- `node test_i18n_pages.js` — **19/19 PASS**.
- `node test_audit_i18n_parity.js` — **17/17 PASS** (includes the "against the REAL translations.js:
  suspects === 0" leg, confirming the `defillamaApi` allowlist repoint works, and the historical-bytes
  positive control confirmed reading `git show 648401297:translations.js` — a fixed historical commit, not
  the live file — so it is correctly unaffected by this change).
- `node test_test_registry.js` — **5/5 PASS** (confirms `test_footer_contract.js` is correctly registered
  in `test:serial`, no orphans/ghosts/duplicates).
- `node test_run_tests.js` — **26/26 PASS**.
- `node test_smoke.js` — **11/11 PASS**.

No pre-existing failures encountered that required the stash-and-verify procedure — the one flaky run above
resolved on retry without any tree changes, so a stash comparison would have added no information.

## Instance of / Class closed?

**Instance of**: brand-voice divergence across surfaces (the content half of the two-systems root cause),
per spec's own framing.

**Class closed — with numbers**:
- **3 of 3** named in-scope surfaces (`/` landing.js, `/?token=` grid view, `/?pool=<id>` pool-detail view)
  now render from the exact same footer markup shape and the exact same 5-key dictionary source, verified
  byte-for-byte identical at render time by `test_footer_contract.js`'s cross-surface-identity leg, in both
  languages, with a passing non-vacuity mutation on both the identity and attribution legs.
- **5 root dictionary keys** (`poweredBy`, `defillamaApi`, `footerSignOff`, `browseTokens`, `browseChains`)
  × **2 languages** = the single source of truth, symmetric EN/KO key sets (confirmed by
  `test_audit_i18n_parity.js`'s key-parity rule).
- **6 duplicate/dead keys retired** (`madeWith` + the 5 `landing.footer*` shadow keys) × 2 languages = 12
  leaf strings removed from the dictionary, `grep -ri "degen love"` now returns **zero** matches across
  `app.js`, `translations.js`, `landing.js`, their compiled/minified twins, `tokens/`, `chains/`,
  `pools/`, and `stories/`.
- **1 incidental surface fix**: `planner.js`'s static `/plan.html` crawler-footer KO localization (hub
  links only — it never carried the "Powered by / sign-off" text in the first place) was repointed onto
  the same root keys instead of the deleted landing-subtree duplicates, so it did not regress and is now
  also reading from the single source rather than a soon-to-be-stale copy.

**What is explicitly left uncovered, and why that's a defensible boundary, not an oversight**:
- **The planner's own mounted view** (`plan.html`'s React `Planner()` component, `/?planner` share URLs)
  has **no rendered "Powered by DefiLlama / sign-off" footer at all** — confirmed via `grep -n "app-footer\b"
  planner.js plan.html` → zero matches. It only carries the static `.seo-hub-links` crawler block (hub
  links, no attribution/sign-off line). This was never one of the three surfaces spec 240 named, and the
  spec explicitly marks "footer link additions" out of scope — so this is a real, current, and intentional
  gap: if the planner surface ever grows its own "Powered by DefiLlama" line, it will need to be pointed at
  this same root dictionary by hand: it does not inherit automatically.
- **`stories/` persona pages** (`tomoko.html`, `kevin.html`, `lucia.html`) — deliberately excluded per spec
  ("persona pages have deliberate voice"); independently confirmed already at zero "Degen Love" occurrences
  today, so there was nothing to close there, not something left open.

So: for the specific defect spec 240 names (the off-ICP "Degen Love" sign-off in the footer trust position
of the two money-decision surfaces, plus the resulting structural divergence from the landing footer) — the
class is **closed**, grep-zero on all three named surfaces, proven by a rendered cross-surface test with a
passing non-vacuity mutation on every leg. The narrower, currently-true statement "no surface in this repo
has any footer sign-off text" is also true today, but that is a property of what exists now (the planner
has none to unify), not a guarantee this change enforces going forward.
