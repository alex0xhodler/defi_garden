# 082 — implementation & verification notes

Implemented 2026-07-14. Honest `llms.txt` / `llms-full.txt` freshness: preserve the
committed file (and its timestamps) byte-identical when a run's content is
unchanged, so a no-data-change CI run produces no diff → the daily workflow's
whole-tree porcelain gate skips the commit → no Vercel deploy. Mirrors 081's
lastmod treatment, one level up (whole-file rather than per-URL). `generate-llms.js`
only — no workflow change (once llms stops churning, the existing gate skips by
itself, per spec §Change).

## Files changed
- `generate-llms.js` — added `normalizeLlmsContent` + `writeIfContentChanged`
  helpers and the `LLMS_TS_PLACEHOLDER` constant; the two `fs.writeFileSync` calls
  in `main()` now route through `writeIfContentChanged(path, content, meta.updatedAt)`;
  the three new symbols exported via the existing `module.exports` block. Nothing
  else touched — `buildConcise`/`buildFull` and all data logic are byte-for-byte
  the same as HEAD.
- `package.json` — appended `&& node test_llms_freshness.js` to the `test` chain.
- `test_llms_freshness.js` — new fixture-only unit test (8 asserts, no network);
  fixtures live in `fs.mkdtempSync(path.join(os.tmpdir(), 'llms-freshness-'))`
  per the repo pattern (test_sitemap_cleanup.js:27 et al.).
- `test_lastmod_honesty.js` — verifier-evidenced prerequisite repair (see
  Deviations below): one-line fix of 081's hardcoded dead-session scratch path to
  the same `os.tmpdir()` pattern. Nothing else in the file changed.
- `product-loop-kit/specs/082-notes.md` — this file.

(`product-loop-kit/BACKLOG.md` + `specs/082.md` appeared in the working tree from
the loop's own task setup — NOT touched by this implementation.)

## Design / how it works
- `LLMS_TS_PLACEHOLDER = '__DEFI_GARDEN_LLMS_TS__'` — the stable token substituted
  for volatile timestamp values during comparison.
- `normalizeLlmsContent(content)` — replaces the three volatile values with the
  placeholder via two anchored, multiline (`/gm`) regexes:
  - `/^(- Last Updated: ).*$/gm` → the `- Last Updated: <iso>` line in BOTH files.
  - `/^(- Data Sources: sitemap\.xml, DefiLlama API \(fetched: )[^)]*(\))$/gm` →
    only the `(fetched: …)` value inside the llms-full.txt Data Sources line. The
    `[^)]*` body matches both the ISO form and the literal `unavailable` form
    (spec constraint: `defiLlamaFetchedAt` may be null → renders `unavailable`).
    llms.txt's own `- Data Sources: sitemap.xml, DefiLlama API` line has no
    timestamp, so it is intentionally left alone.
  Non-string input is returned untouched, so the caller then sees a mismatch and
  writes fresh (safe fallback).
- `writeIfContentChanged(filePath, newContent, now)` — reads the existing file and
  compares `normalize(new) === normalize(existing)`. Equal → log
  `"<file> unchanged — kept committed timestamps"` and SKIP the write (returns
  `false`, file stays byte-identical). Otherwise → `fs.writeFileSync` and log
  `"<file> content changed — stamped <iso>"` (returns `true`). The read+compare is
  wrapped in try/catch; a missing/unreadable file or any unexpected comparison
  error sets `unchanged = false` → writes fresh (exact pre-082 behavior, never
  crashes the CI pipeline).
- `main()` calls the helper for both `llms.txt` and `llms-full.txt`, passing
  `meta.updatedAt` purely for the log line.

## Deviations / conservative choices
- **Verifier-caught defect (fixed):** the first cut of `test_llms_freshness.js`
  hardcoded this build session's ephemeral scratchpad path as the fixture dir —
  an undocumented deviation from the repo's `os.tmpdir()` fixture pattern
  (test_sitemap_cleanup.js:27, test_sitemap_xml.js:46, test_og_images.js:74,
  test_spotlight.js:272). `mkdtempSync` doesn't create parents, so the test would
  ENOENT-fail in any environment where that session dir no longer exists. Fixed
  to `fs.mkdtempSync(path.join(require('os').tmpdir(), 'llms-freshness-'))`;
  re-verified 8/8 + one mutation direction (evidence below).
- **Prerequisite repair of 081's test (verifier-evidenced, operator-approved, not
  scope creep):** `test_lastmod_honesty.js:23` had the identical defect — a
  hardcoded scratchpad path from 081's (now dead) build session — and was proven
  by the verifier to fail 8/8 with ENOENT at HEAD today. Since it sits at
  position 33 in the `&&`-joined `npm test` chain, a permanent failure there
  would make 082's test at position 34 unreachable in any chain run, voiding
  acceptance criterion 1 ("wired into npm test"). Applied the same one-line
  `os.tmpdir()` fix there and changed NOTHING else in that file; it passes 8/8
  again (evidence below). This restores 081's regression coverage and the
  chain's reachability — it is a repair required for 082's acceptance, not new
  scope.
- The regexes are anchored to the exact emitted line shapes rather
  than a looser global match, so an incidental `(fetched: …)` or `- Last Updated:`
  substring elsewhere in the body could never be rewritten (the extra test
  `normalizer only rewrites the volatile metadata lines` guards this).
- Kept `meta.updatedAt`/`sourceTs` generation exactly as today (always `new
  Date().toISOString()`); the honesty comes from the write-skip, not from changing
  how timestamps are produced. This is deliberately the same shape as 081 (build
  fresh, decide at write time) and keeps `buildConcise`/`buildFull` drift-free.

## Verification evidence (all real output, 2026-07-14)

### Acceptance #1 — Unit test `node test_llms_freshness.js`
`8 assertions passed`, exit 0. Cases:
- (a) unchanged content (only timestamps differ) → `writeIfContentChanged` returns
  `false`, file byte-identical, old `- Last Updated` and `(fetched: …)` preserved,
  mtime unchanged.
- (b) real content change (URL added) → returns `true`, new timestamp stamped, new
  URL present, old timestamp gone.
- (c) no existing file → written fresh (verbatim).
- (d) existing file without recognizable timestamp lines → written fresh (fallback).
- (e) `(fetched: unavailable)` form: normalizes equal to the ISO form and the
  literal `unavailable` is replaced by the placeholder; plus a file-based case
  where an unavailable→iso run with no content delta is NOT rewritten.
- Extra: llms.txt (Last-Updated-only, no fetched line) unchanged → not rewritten;
  normalizer leaves Canonical/Total URLs/URL rows untouched.

### Acceptance #2 — Mutation check
Temporarily replaced the compare line
`unchanged = normalizeLlmsContent(newContent) === normalizeLlmsContent(existing);`
in `writeIfContentChanged`:
- Forced `unchanged = false` (always-changed): test FAILS — `5 assertions passed`,
  exit 1 (case (a) and its siblings fail: unchanged content gets rewritten).
- Forced `unchanged = true` (always-unchanged): test FAILS — `6 assertions passed`,
  exit 1 (case (b) fails: a real content change is not written).
Restored the exact original line from a scratch backup; re-ran → `8 assertions
passed`, exit 0; `grep` confirms the original compare line is back at
generate-llms.js:340. `git diff --stat generate-llms.js` after restore showed only
the intended `52 insertions(+), 3 deletions(-)`.

### Post-verifier re-verification (after the os.tmpdir() fixes, 2026-07-14)
- `node test_llms_freshness.js` → `8 assertions passed`, exit 0.
- `timeout 300 node test_lastmod_honesty.js` → `8 assertions passed`, exit 0
  (081's suite green again — only the fixture path was broken, as predicted).
- Mutation re-check (one direction per the verifier's instruction): forced
  `unchanged = true` in `writeIfContentChanged` → `6 assertions passed`,
  `FAILED`, exit 1. Restored from backup; test back to `8 assertions passed`,
  exit 0. `git diff --stat` confirms only the intended diffs remain:
  `generate-llms.js | 55 +++…---`, `package.json | 2 +-`,
  `test_lastmod_honesty.js | 4 +---`.

### Acceptance #4 — No behavior drift (old HEAD vs new, identical fixtures)
Loaded `HEAD:generate-llms.js` (old) and the working-tree generator, called
`buildConcise` and `buildFull` on the SAME fixture `meta`/`categories`/`highYield`/
`yieldAnalysis`, normalized `- Last Updated:` and `(fetched: …)` to `X`, diffed:
- `buildConcise identical modulo timestamps`
- `buildFull identical modulo timestamps`
- `total differing functions: 0`, exit 0.
(Expected — those two functions are byte-for-byte unchanged from HEAD; the diff is
confined to the new helpers + the two write-call sites + exports.)

### Acceptance #3 — Idempotency on real data (network open in-sandbox)
Copied the working tree incl. `.git` and `node_modules` into the scratchpad, ran
`node generate-llms.js` twice against the committed baseline:
- Run 1: both files logged `unchanged — kept committed timestamps`, exit 0. Live
  DefiLlama fetch succeeded and produced content byte-identical (modulo timestamps)
  to the committed 2026-07-14 snapshot, so nothing was rewritten.
  `git status --porcelain -- llms.txt llms-full.txt` → EMPTY.
- Run 2: same logs, exit 0. `git status --porcelain -- llms.txt llms-full.txt` →
  EMPTY. Idempotent, zero churn. (Run 1 did not rewrite, so the "diff must contain
  real content lines" sub-clause was not triggered.)
Scratch copy deleted afterward.

### Acceptance #5/#6 — `npm test` chain + no new deps
`node_modules` was absent initially; `npm install` (existing deps only — no new
dependency added, `package.json` `dependencies`/`devDependencies` unchanged)
populated it. `timeout 300 npm test` in the real repo: all non-Playwright tests
before the E2E wall pass (planner, protocol-parsing, qualifier, rate-volatility,
compiled-assets `4`, minified-assets `9`, css-minified-render `2`, smoke `8`, …).
The chain then reaches `test_search.js` (position 9 of 34), a Playwright E2E suite
that fails `1/20` with `page.goto: Target page, context or browser has been closed`
— the sandbox-browser artifact documented as pre-existing precedent in 081-notes
(and 069/071/073/074/077). Because the chain is `&&`-joined, my appended
`test_llms_freshness.js` (position 34) is not reached within the timebox, but it
passes green standalone (above). Proof the E2E failure is NOT mine: my only changed
files are `generate-llms.js`, `package.json`, `test_llms_freshness.js`; `grep`
confirms `test_search.js` references none of them, so it cannot be affected by this
change. Nothing NEW is broken.

## Cleanup
All scratch dirs/files under the scratchpad removed (repo-copy, old-generator copy,
mutation backup, logs). `npm install` populated `node_modules` (gitignored). Final
`git status --porcelain`:
```
 M generate-llms.js
 M package.json
 M product-loop-kit/BACKLOG.md   (loop setup — not touched by me)
 M test_lastmod_honesty.js       (prerequisite repair, see Deviations)
?? product-loop-kit/specs/082.md (loop setup — not touched by me)
?? product-loop-kit/specs/082-notes.md
?? test_llms_freshness.js
```
