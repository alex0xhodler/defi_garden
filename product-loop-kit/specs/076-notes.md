# 076 — implementation notes

## What changed

### `generate-token-pages.js` (main())
Moved `const outDir = path.resolve(args.out)` above the `generateOgImages` call
and changed the call's last argument from `process.cwd()` to `path.dirname(outDir)`.
- Old: line ~926 `generateOgImages(ranked, 'tokens', rec => rec.symbol, process.cwd())`
  with `const outDir = path.resolve(args.out)` on line ~929 (after the call).
- New: `outDir` resolved first; call is now
  `generateOgImages(ranked, 'tokens', rec => rec.symbol, path.dirname(outDir))`.
- Added a 5-line comment above the call explaining the og/ sibling convention and
  the CI-path (dirname === cwd) invariance. The lazy `require('./generate-og-images.js')`
  was left in place (require-cycle note in the spec honored).

### `generate-chain-pages.js` (main())
Same reorder + argument swap:
- Old: line ~448 `generateOgImages(ranked, 'chains', rec => rec.chain, process.cwd())`
  with `const outDir = path.resolve(args.out)` on line ~451.
- New: `outDir` resolved first; call is
  `generateOgImages(ranked, 'chains', rec => rec.chain, path.dirname(outDir))`,
  with the same explanatory comment. `generateOgImages` is top-required here
  (unchanged).

### `test_og_outroot.js` (new)
Fixture-driven, no network. Runs each generator as a child process
(`node generate-<kind>-pages.js --fixture <fixture> --out <dir> --no-sitemap`)
via `execFileSync`, always from a **temp** cwd (a harness guard asserts
`cwd !== repo root` so a run can never touch committed og/ files).
- AC1/AC2 (scratch isolation, chains + tokens): temp cwd holds a decoy
  `og/<kind>/decoy.png`; `--out <scratch>/<kind>` points at a separate scratch
  dir. Asserts (a) OG PNGs appear under `<scratch>/og/<kind>/`, (b) the temp
  cwd's `og/<kind>` dir listing is unchanged and decoy bytes are identical.
- AC3 (production invariance, chains + tokens): from a repo-shaped temp cwd,
  runs `--out <kind>` (bare, CI's exact shape) and asserts OG PNGs land under
  `<cwd>/og/<kind>/`.

### `package.json`
Added `&& node test_og_outroot.js` to the `test` script, immediately after
`node test_og_images.js` (consistent with the existing chain).

## Deviations from spec
None. The spec's "move only `const outDir = path.resolve(args.out)`" was
followed; the added comment near the call is the spec-sanctioned minimal
amendment ("if a comment near the call would become misleading, minimally
amend it") — the old comment said nothing about outRoot, so the addition
documents the new sibling behavior rather than misleading.

## Test results (each timeboxed 5 min, all EXIT=0)
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`
  → test_planner: "All 208 assertions evaluated." EXIT=0; test_protocol_parsing EXIT=0;
  test_qualifier_fix EXIT=0 (both exit non-zero only on failure).
- `node test_og_images.js` → "18 assertions passed" EXIT=0
- `node test_token_pages.js` → "88 assertions passed" EXIT=0
- `node test_chain_pages.js` → "79 assertions passed" EXIT=0
- `node test_og_outroot.js` → "4 assertions passed" EXIT=0

(`npm install` was run first — node_modules was empty; 67 packages added in 3s,
0 vulnerabilities. No new deps added by me.)

## Final `git status --porcelain`
```
 M generate-chain-pages.js
 M generate-token-pages.js
 M package.json
 M product-loop-kit/BACKLOG.md
?? product-loop-kit/specs/076.md
?? test_og_outroot.js
```
`product-loop-kit/BACKLOG.md` (a single `+1` line) and the untracked
`product-loop-kit/specs/076.md` are the operator's pre-existing spec-promotion
changes, not touched by this work. No files under og/, tokens/, chains/, ko/,
stories/, sitemap*, or the bot/worker dirs were dirtied. (076-notes.md itself
will also appear once written.)
```
```
