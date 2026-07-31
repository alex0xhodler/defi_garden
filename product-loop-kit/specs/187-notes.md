# 187 — build notes

Scope executed: the four in-scope legs assigned to this build (delete the
`@import` from `style.css`, regenerate `style.min.css`, write
`test_css_import_blocking.js` for A1/A3/A4/A5, wire it into `test:serial` +
confirm `run-tests.js` lane discovery). Bookkeeping (BACKLOG row, `187-pr.md`,
`LOG.md`) is explicitly NOT done here per the operator's instructions — this
build leaves everything staged-but-uncommitted for the operator to commit.

## 1. `style.css` — the fix

Removed exactly line 1 (`@import url('https://api.fontshare.com/v2/css?…')`)
and the blank line that followed it. No other line touched.

```
$ git diff --stat -- style.css
 style.css | 2 --
 1 file changed, 2 deletions(-)
```

The imported font (Satoshi) was referenced by zero `font-family` declarations
before the deletion (`grep -i satoshi *.css` returned only the `@import` line
itself) — confirmed again post-deletion: `grep -i satoshi style.css` now
returns nothing.

## 2. `style.min.css` — regenerated via the existing script

`node minify-assets.js` was run (never hand-edited). It regenerates ALL of
`JS_FILES`/`CSS_FILES` in `minify-assets.js`, so the full run also rewrote
`app.compiled.min.js`, `PoolDetail.compiled.min.js`, `planner.min.js`,
`translations.min.js`, `planner-styles.min.css`, `pool-detail-styles.min.css`
— but since none of their sources changed, minification is deterministic and
`git status --short` after the run shows only `style.min.css` modified:

```
$ git status --short
 M style.css
 M style.min.css
?? test_css_import_blocking.js
```

`git diff style.min.css` is a single-line change — the `@import` prefix is
gone from line 1, the rest of the 99,809-byte file is byte-identical:

```
-@import url(https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap);:root{--color-white:...
+:root{--color-white:...
```

## 3. `test_css_import_blocking.js` — new file (249 lines)

Drives real Chromium (`/opt/pw-browsers/chromium`, per `audit-app.js:111`'s
pattern) against a small local static server (house style — same shape as
`test_css_minified_render.js`/`test_smoke.js`; not `dev-server.js`, since every
existing browser-lane test builds its own minimal server rather than shelling
out to it, port `8865` — distinct from all 74 other `test_*` ports currently
in use, 8791-8864).

Implements:
- **A1** — `style.css` and `style.min.css` both asserted to contain zero
  `@import` lines at all (source read, no browser).
- **A5** — `style.css` asserted to contain no @import whose target URL is
  remote (`http:`, `https:`, or protocol-relative `//`); a relative `@import`
  is explicitly not banned per the spec. Failure message names the offending
  line number and full line text.
- **A3** — for both `/plan.html` and
  `/home.html?pool=747c1d2a-c668-4682-b9f9-296708a3dd90` (the real lido stETH
  id from `data/pools-snapshot.json`, same id `test_northstar_cta_fires.js`
  uses), with `api.fontshare.com` aborted via `context.route`: polls up to
  10s for the `style.min.css` `<link>`'s live `media` IDL property to settle
  to `'all'`, and separately for
  `getComputedStyle(document.documentElement).getPropertyValue('--color-background')`
  to be non-empty. Both assertions include a diagnostic of the last-observed
  `media` value on failure.
- **A4** — proved out-of-band (see §4 below), not encoded in the test file
  itself, exactly as the operator's instructions specified.

Fixture routing per the T5 territory note: `/data/pools-snapshot-meta.json` is
routed with a freshly-generated `generatedAt` (`new Date().toISOString()`,
`schemaVersion: 1`) so the snapshot-first path is exercised rather than
falling through to a blocked live fetch; `/data/pools-snapshot.json` is
routed with the real committed snapshot file verbatim so the meta→snapshot
chain actually resolves. `https://yields.llama.fi/pools` is separately
fixtured with the real pool id for the `?pool=` case, since reading app.js's
`fetchPoolsInBackground` shows `snapshotEligible = !urlParams.pool && …` —
`?pool=` deep links always skip the snapshot path and go live by design (spec
072/105), so the meta/snapshot routes are inert-but-harmless on that page and
the live route is what actually matters there.

## 4. A4 non-vacuity proof — RED demonstrated, then restored

Procedure (non-destructive, exactly as instructed):

1. Backed up the FIXED tree's `style.css` and `style.min.css` to the
   scratchpad (`style.css.fixed.bak`, `style.min.css.fixed.bak`).
2. Re-added the `@import` line to `style.min.css` ONLY (the file the page
   actually loads) — `style.css` was left in its fixed (no-`@import`) state.
3. Ran `node test_css_import_blocking.js`. Verbatim output:

```
network: api.fontshare.com BLOCKED (page.route abort) on every page under test
  ✓ A1: style.css contains no @import
  ✗ A1: style.min.css contains no @import
    style.min.css still contains @import — line 1: "@import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap');:root{--color-white:rgba(255, 255, 255, 1); ... [rest of the single-line minified file, 99KB, elided here] ..."
  ✓ A5: style.css contains no @import of a remote URL (http:/https:/protocol-relative //)
  ✗ A3: /plan.html — style.min.css link settles to media="all" with fontshare blocked
    style.min.css link.media never settled to "all" within 10s (last observed: "print") — the design system stayed print-only
  ✗ A3: /plan.html — --color-background resolves (fontshare blocked)
    --color-background never resolved to a non-empty value within 10s (link.media was "print") — the 545-rule design system never applied
  ✗ A3: /home.html?pool=747c1d2a-c668-4682-b9f9-296708a3dd90 — style.min.css link settles to media="all" with fontshare blocked
    style.min.css link.media never settled to "all" within 10s (last observed: "print") — the design system stayed print-only
  ✗ A3: /home.html?pool=747c1d2a-c668-4682-b9f9-296708a3dd90 — --color-background resolves (fontshare blocked)
    --color-background never resolved to a non-empty value within 10s (link.media was "print") — the 545-rule design system never applied

2 css-import-blocking assertions passed
EXIT CODE: 1
```

(The A1/style.min.css failure message dumps the whole 99KB minified file
because the entire sheet is one line — that's an artifact of `findImportLines`
reporting the full matched line text, not a bug; it's truncated with `...` in
this excerpt but was verbatim/untruncated in the actual captured output.)

2 of 7 assertions passed (the two that only read `style.css`, which was left
correctly fixed in this scratch scenario), 5 failed, overall exit code 1 —
non-vacuous: the test genuinely distinguishes the broken state from the fixed
state, on exactly the file the browser loads.

4. Restored both files from the scratchpad backups
   (`cp style.css.fixed.bak style.css`, `cp style.min.css.fixed.bak
   style.min.css`). Verified via `md5sum` that the restored `style.min.css`
   is byte-identical to the fixed-tree backup, and re-ran the test to confirm
   it's green again (7/7 passed, exit 0) — see §5.

## 5. Test run — green on the real fixed tree (post-restore)

```
$ node test_css_import_blocking.js
network: api.fontshare.com BLOCKED (page.route abort) on every page under test
  ✓ A1: style.css contains no @import
  ✓ A1: style.min.css contains no @import
  ✓ A5: style.css contains no @import of a remote URL (http:/https:/protocol-relative //)
  ✓ A3: /plan.html — style.min.css link settles to media="all" with fontshare blocked
  ✓ A3: /plan.html — --color-background resolves (fontshare blocked)
  ✓ A3: /home.html?pool=747c1d2a-c668-4682-b9f9-296708a3dd90 — style.min.css link settles to media="all" with fontshare blocked
  ✓ A3: /home.html?pool=747c1d2a-c668-4682-b9f9-296708a3dd90 — --color-background resolves (fontshare blocked)

7 css-import-blocking assertions passed
EXIT: 0
```

## 6. T3 check — existing tests that reference `style.min.css`

Grepped `test_minified_assets.js`, `test_css_minified_render.js`,
`test_pool_logo.js`, `test_footer_hub_links.js`, `test_filter_dropdown_polish.js`,
`test_list_polish.js` for `@import` and `fontshare` before regenerating.

**Finding: none of the six asserts the `@import` line's presence, nor a
byte-count/hash of `style.min.css`.** Specifically:

- `test_minified_assets.js` asserts `style.min.css` is byte-identical to a
  *fresh* minify of `style.css` (i.e. "the minifier's output matches its
  input", not "the file contains X bytes/hash Y") — this assertion is
  regeneration-proof by construction and needed no change.
- `test_pool_logo.js`, `test_footer_hub_links.js`, `test_filter_dropdown_polish.js`
  only mention `fontshare` inside their `IGNORABLE_ERROR_PATTERN` regexes
  (console-noise allowlists, per the spec's T4 note) — they never assert on
  `style.css`'s content.
- `test_list_polish.js` is the interesting case: it explicitly documents (in a
  comment) that `style.css` `@import`s fontshare and that this is
  render-blocking when the sheet is served `media="all"`, and it **works
  around** the bug rather than asserting it — it rewrites the served HTML to
  `media="all"` directly (bypassing the print/onload swap entirely) and routes
  `https://api.fontshare.com/**` to an empty 200 response so the `@import`
  resolves harmlessly. This is a workaround, not an assertion of the bug, and
  it continues to pass unmodified after the `@import` is removed (the
  fontshare route simply becomes a no-op since no such request is made
  anymore). No change was needed and none was made.

No assertion was edited. If any had asserted the bug, this file would say so
explicitly per the instructions — none did.

## 7. Wiring into `test:serial` / `run-tests.js`

`package.json`'s `test:serial` step list: inserted
`&& node test_css_import_blocking.js` immediately after
`&& node test_css_minified_render.js` (both are CSS-render gates, both are
browser-lane).

Confirmed lane discovery via `node run-tests.js --list --lane=browser`:

```
test_css_minified_render.js	browser
test_css_import_blocking.js	browser
...
TOTAL files=108 plain=39 browser=69 listed=69
```

`run-tests.js` classifies it `browser` automatically (it transitively requires
`playwright` directly in its own source — no manual lane registration exists
or was needed).

## 8. Test counts — before / after

**Before (baseline, captured on the pre-edit tree, `node run-tests.js
--lane=plain`):**
```
TOTAL pass=39 fail=0 timeout=0 total=39
```

**After (post-fix tree, same command):**
```
TOTAL pass=39 fail=0 timeout=0 total=39
```

No regression in the plain lane — expected, since the fix only touches CSS
files and this test's file count (39) is unchanged (the new test is
browser-lane, so `--lane=plain` never includes it).

**Individually-run VERIFY tests (all green, each under the 5-minute foreground
timebox):**
- `node test_css_import_blocking.js` — 7/7 passed, exit 0.
- `node test_minified_assets.js` — 9/9 passed, exit 0.
- `node test_css_minified_render.js` — 2/2 passed, exit 0.
- `node test_smoke.js` — 11/11 passed, exit 0 (ran ~120-200s, moved to
  background by the harness past the 120s default but completed successfully
  well inside 5 minutes).
- `node test_northstar_cta_fires.js` — 7/7 passed, exit 0.

**Deviation — full browser lane NOT run in this build.** The operator's VERIFY
section names a specific list of tests plus `node run-tests.js --lane=plain`;
it does not ask for the full `--lane=browser` (69 files, many real-Chromium,
would routinely need the browser lane's own 600s-per-file default timeout and
is documented elsewhere — spec 163-notes.md — as taking far longer than 5
minutes in aggregate). Running all 69 browser-lane files serially was judged
out of the achievable timebox for this build and was not attempted; the five
specific browser-lane tests named in VERIFY were run individually and are all
green, and `run-tests.js --list` confirms correct lane placement/ordering for
the new file. This is a conservative choice, documented rather than silently
skipped, per the instructions ("if something can't finish, document it and
move on").

## 9. A8 — translations.js

No `translations.js` change: `git diff --stat -- translations.js` is empty.
No user-facing string was added or removed by this fix (it only deletes a
CSS `@import` and adds a test file), so CLAUDE.md's "EN+KO updated together"
rule is satisfied vacuously — stating this explicitly rather than leaving it
unsaid, per A8.

## 10. Out-of-scope files — confirmed untouched

`git diff --stat -- app.js planner.js PoolDetail.js home.html plan.html
generate-stories.js generate-sitemap.js generate-llms.js` is empty. No new
dependency was added (`package.json`'s `dependencies`/`devDependencies` are
unchanged; only the `scripts.test:serial` string was edited).

## 11. Final working-tree state (staged-but-uncommitted, per instructions)

```
$ git status --short
 M package.json
 M style.css
 M style.min.css
?? test_css_import_blocking.js
```

(`product-loop-kit/signals/audit-findings.json` and
`product-loop-kit/signals/audit-rotation.json` were already modified before
this build started — pre-existing, untouched by this work.)

No commit, push, or PR was made. `BACKLOG.md`/`LOG.md` were not touched, per
the operator's explicit instructions overriding the spec's own "same commit"
bookkeeping request — the operator commits.
