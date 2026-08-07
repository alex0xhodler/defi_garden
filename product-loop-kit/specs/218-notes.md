# 218 — build notes

## Environment observation (not a deviation I made, flagging for the record)

Before I touched anything, `git log` on this branch already contained a
commit `9dd3faf421 wip(218): spec + verifier agent` (2026-08-03 21:27:48
UTC) that added `product-loop-kit/specs/218.md` (the spec I was told to
read) **and** the exact CSS fix block in `pool-detail-styles.css` /
`pool-detail-styles.min.css` that this brief specifies. When I made my own
edit (Edit tool, after reading the file fresh at the start of this run) and
then ran `npm run minify`, `git status`/`git diff` showed **zero** diff
against `HEAD` for both files — my edit and the regenerated min sheet are
byte-identical to what that commit already had in the tree. I did not run
`git commit` at any point in this session. I'm reporting this because the
brief says "Do NOT commit" and I want it on record that the CSS fix already
being at `HEAD` when I started is not something I did — it appears an
earlier automated pass (or a concurrent session sharing this container, per
the standing warning in the brief) already landed it before I began working.
Everything else described below (the new test, the `test_footer_occlusion.js`
control rewrite, the `package.json` registration, this notes file) is new
this run and left **uncommitted in the working tree**, per the brief.

## Files changed, one line each

- `pool-detail-styles.css` — added the item-218 fix block (`.app.pool-detail-view .app-footer { position: static; margin-top: auto; }` + `.app.pool-detail-view { padding-bottom: 0; }`) directly below the item-217 comment, with a new comment explaining the defect, why it isn't a 217 revert, and the flex-sticky-footer reasoning. (Already at `HEAD` — see observation above; my edit reproduced it byte-for-byte.)
- `pool-detail-styles.min.css` — regenerated via `npm run minify`; contains the fix (`grep` confirms `.app.pool-detail-view .app-footer{position:static;margin-top:auto}` and `.app.pool-detail-view{padding-bottom:0}` are present). (Same as above, already at `HEAD`.)
- `test_cta_at_rest_occlusion.js` — new file, backlog 218's gate: at-rest (`scrollY===0`) geometry + hit-test assertions at 360/768/1280 + 360 dark, plus a positive control. Registered at `PORT=8873`.
- `package.json` — inserted `node test_cta_at_rest_occlusion.js` into `test:serial` immediately after `node test_footer_occlusion.js`.
- `test_footer_occlusion.js` — rewrote case (6)'s positive-control injected CSS and its inline comment, and the file-top comment's case-(6) paragraph, to explain why the old control (`padding-bottom: 0 !important` alone) no longer reproduces occlusion now that the footer is in flow, and why the new control (`position: fixed !important` restored + `padding-bottom: 0 !important`) is the one that still can. Cases (1)-(5), (7)/(8) and every tolerance/assertion are untouched — confirmed by diff (only the case-(6) block and the file-top paragraph about it changed).

No other product files were touched. `style.css` has zero diff anywhere in this branch's history (`git diff --stat HEAD~1 HEAD -- style.css` empty, confirmed).

## Deviations from spec

None that change behavior. The CSS block is character-for-character what spec 218.md's "Fix" section specifies. The only thing I added beyond the two-line rule is the comment (explicitly required by the brief) — I wrote a longer comment than the playbook's one-liner because the brief asked for three specific explanations (what it fixes, why it isn't a 217 revert, why `margin-top: auto` adds no new layout mode); all three are in the comment.

## Measured geometry

### At rest (`scrollY = 0`), STETH fixture pool `747c1d2a-…`, real minified sheets — `test_cta_at_rest_occlusion.js`

| viewport | garden_cta rect (x, y, w, h) | .app-footer rect (x, y, w, h) | intersect? |
|---|---|---|---|
| 360x780 | 72, 703.28, 216, 47 | 18.97, 2186.52, 322.06, 58 | no |
| 768x900 | 72, 590.78, 624, 47 | 222.97, 1960.44, 322.06, 58 | no |
| 1280x900 | 325.36, 309.89, 842.64, 47 | 462.16, 1687.55, 355.69, 69 | no |
| 360x780 dark | 72, 703.28, 216, 47 | 18.97, 2186.52, 322.06, 58 | no |

With the fix in place, `.app-footer` is in document flow **after** the pool-detail content, so at `scrollY=0` its rect sits far below the viewport (y≈2186/1960/1688) — it is nowhere near the CTA. This is the "after" state.

Hit test (case 5), all four rows above: `elementFromPoint` at the CTA's centre and at 75%-height both resolved to the anchor (or a descendant via `closest`), never the footer — asserted programmatically in the test, not eyeballed.

### Positive control (case 6), fix mutated away in-page, isolated page, 360x780

With `.app.pool-detail-view .app-footer{position:fixed !important;bottom:0;left:0;right:0}` re-applied, the at-rest measurement/hit-test **did** report occlusion/footer-hit — the check goes red when the defect is reproduced. (I did not print the exact re-occluded rect numbers to stdout in this test's control path — only pass/fail — because the assertion is boolean-driven by design; the geometry itself is not printed for this case. Not verified: the exact pixel rect during the control run. What is verified: `occluded=true` or `footerHit=true`, checked directly in the test and confirmed passing.)

### `test_footer_occlusion.js` — bottom-of-scroll geometry (cases (1)-(4), unmodified) + rewritten control (6)

| viewport | .pool-detail-container.bottom | .app-footer.top |
|---|---|---|
| 360 | 682.52 | 721.52 |
| 768 | 797.44 | 842.44 |
| 1280 | 785.55 | 830.55 |
| 360 dark | 682.52 | 721.52 |

Case (5) (CTA scrollable clear of the footer at 360px): `targetScrollY=0` (i.e. the CTA is already clear at rest with the fix in place — `maxScrollY=1465`), cta rect y=703.28 h=47, footer rect y=2186.52 — no intersection.

Case (6), rewritten control: with **both** `position: fixed !important` restored on the footer **and** `padding-bottom: 0 !important` re-applied to `.app.pool-detail-view`, occlusion **was** reported (test passed, i.e. the control correctly went red on the reproduced pre-217/pre-218 state).

## Visual before/after check

Rendered `home.html?pool=747c1d2a-c668-4682-b9f9-296708a3dd90` at 360x780, dark, `scrollY=0`, real minified sheets, fixture pool. Screenshots saved (not committed) at:
- `/tmp/claude-0/-home-user-defi-garden/c0f1a27e-3824-5d89-b894-9f9012911b80/scratchpad/218-after.png` — fix as committed.
- `/tmp/claude-0/-home-user-defi-garden/c0f1a27e-3824-5d89-b894-9f9012911b80/scratchpad/218-before.png` — same page, `position: fixed` re-injected on `.app.pool-detail-view .app-footer` in an isolated page (fix mutated away).

What differs, described from actually looking at both images: in the "after" image the blue "Garden this pool →" button renders fully, with clear space below it and no footer bar visible in the 780px-tall viewport at rest (the footer has moved down the document, out of the initial viewport, because it's now in flow after taller-than-viewport content). In the "before" image, an opaque dark footer bar ("Powered by DefiLlama API. Made with AI & Degen Love. / Browse tokens · Browse chains") is fixed across the bottom of the same viewport and visibly overlaps/clips the CTA button — only a thin sliver of blue is visible at the very bottom edge, with the button's label and most of its body buried under the footer. This is the click-interception defect described in spec 218, seen directly, not inferred.

## Test output (verbatim pass/fail lines)

- `node test_cta_at_rest_occlusion.js` → `test_cta_at_rest_occlusion.js: 12/12 tests passed`
- `node test_footer_occlusion.js` → `test_footer_occlusion.js: 8/8 tests passed`
- `node test_northstar_cta_fires.js` → `test_northstar_cta_fires.js: 7/7 tests passed`
- `node test_mobile_cta_clip.js` → `test_mobile_cta_clip.js: 4/4 tests passed`
- `node test_earnings_dedup.js` → `test_earnings_dedup.js: 8/8 tests passed`
- `node test_repeat_cta.js` → `test_repeat_cta.js: 5/5 tests passed`
- `node test_footer_hub_links.js` → `11 footer-hub-link assertions passed`
- `node test_landing.js` → `5 landing assertions passed`
- `node test_css_minified_render.js` → `2 css-minified-render assertions passed`
- `node test_minified_assets.js` → `9 minified-asset assertions passed`
- `node test_test_registry.js` → `5/5 assertions passed`
- `node test_smoke.js` → `11 smoke assertions passed` (see Timebox note below)

## Timebox note

`node test_smoke.js` was first run under a wrapping 120s allowance and got cut off mid-run (one assertion — the pool-detail BreadcrumbList JSON-LD check — was in flight when the harness's own call-level timeout landed, producing a single `✗ ... page.goto: Target page, context or browser has been closed` line with `10 smoke assertions passed` printed instead of 11). I re-ran it with a 280s allowance and it completed cleanly: `11 smoke assertions passed`, exit code 0, no failures. This was call-orchestration truncation, not a product-code failure — recorded per the brief's instruction to report a kill/move-on rather than silently retry-and-hide. No other command in this list ran anywhere near 5 minutes.

## Baseline check

Nothing in the list above came back red on this branch, so no `origin/main`/stash baseline comparison was needed for any of them. I did not run `test_pool_twin_parity.js` or `test_min_asset_boot.js` (LOG.md 2026-08-03 lists both as already red on `main` in this sandbox, and the brief says they are not required).

## What I did not verify

- The exact pixel geometry during the positive-control runs (both tests' case (6)) beyond the boolean pass/fail the assertions check — the tests are written to assert booleans there, not print rects, so I did not capture the reproduced-occlusion numbers separately.
- Whether the pre-existing `wip(218)` commit's `product-loop-kit/specs/218.md` matches what the operator intended byte-for-byte beyond what I read this session — I only read it, did not diff it against any other source.
- Behavior at viewport widths outside the four required by CLAUDE.md's design bar (e.g. 390x844, 414x896 cited in spec 218's Evidence table) — not asked for by the acceptance criteria, not measured this run.
- Any effect on pools other than the STETH fixture pool and the human's previously-cited `8276be38-…` pool — not re-measured this run; the fix is content-agnostic by construction (removes the overlay entirely) but I did not re-run against a second real pool id to double-check.
