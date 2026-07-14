# 095 — implementation notes

## Files changed
- `style.css` (edit surface) + `style.min.css` (regenerated from source, see below).
- New test: `test_list_polish.js`.

## Exact lines changed in `style.css` (all inside the `.pools-list` scope)
1. `.pools-list .pool-card` (line 2023): `min-height: auto` → `min-height: 84px`. Everything
   else (incl. `align-items: center`) unchanged, so short content still vertically centers.
2. `.pools-list .pool-apy-section` (line ~2044): `align-items: flex-start` → `flex-end`;
   added `text-align: right`. Right-aligns the APY numeric column.
3. `.pools-list .pool-tvl-section` (line ~2051): `align-items: flex-start` → `flex-end`;
   added `text-align: right`. Right-aligns the TVL numeric column.
4. New rule (with a 095+092 comment) right after the apy-section rule:
   ```css
   .pools-list .pool-apy-section:has(.pool-apy-tag) .pool-apy-hero {
     color: var(--color-text-secondary);
     opacity: 0.75;
   }
   ```
   Calms the 0-yield hero. Trust rail intact — the `0.00%`/`0%` number stays in the DOM,
   only its visual loudness drops (secondary color + opacity 0.75 ≥ 0.7, legible in dark).

No tabular-nums rule was added: `.pool-apy-hero` / `.tvl-value` / `.pool-apy-preview` already
carry `font-variant-numeric: tabular-nums` globally (style.css ~3111–3129); the list inherits
it. Criterion 2 is satisfied-and-preserved, verified by computed style (assertion C).

## `style.min.css` regenerated (required — the app loads the min file)
`home.html` links `style.min.css`, not `style.css` (async pattern, backlog 053; source is the
edit surface, CI minifies). Without regenerating, none of the changes reach the running app.
Regenerated deterministically with the repo's own clean-css transform (same as `minify-assets.js`
`transformCss`); only the single minified line changed (`git diff --stat` = 1 insertion/1 deletion).
Only `style.min.css` was regenerated (JS/other CSS min files left untouched) to keep the diff surgical.

## The `:has()` decision
Used exactly as the spec mandates: `.pools-list .pool-apy-section:has(.pool-apy-tag) .pool-apy-hero`.
`.pool-apy-tag` is rendered by the shared `renderPoolCard` (app.js ~2592) only when
`hasNoSupplyYield(pool)` is true, so `:has()` keys the calm styling off the same honest signal 092
already surfaces — no JS/markup change, grid view untouched. Chrome 141 (the harness browser) supports
`:has()` in stylesheets (verified `CSS.supports('selector(:has(*))') === true`).

## Test approach (`test_list_polish.js`)
Cloned `test_list_default.js` verbatim: `startServer`, `routeFixtures` (vendored
react/react-dom/babel from node_modules, stale `**/data/pools-snapshot*` stub → forces the FE
freshness gate to fall back to the live fixture, `https://yields.llama.fi/pools` → fixture),
`IGNORABLE_ERROR_PATTERN`, `CHROMIUM_EXECUTABLE`, pass/total `test()` harness, pageerror/console.error
collection. Distinct `PORT = 8795`.

Fixture includes a 0-yield USDC pool (`usdc-base-collateral`, apyBase 0, apyReward 0) so the
`?token=USDC` list renders a "No supply yield" row next to two yielding rows.

Assertions are on the REAL rendered DOM via `page.evaluate`/`getComputedStyle` (never source strings):
- A/B: `.pool-apy-section` and `.pool-tvl-section` computed `alignItems === 'flex-end'`.
- C: `.pool-apy-hero` and `.tvl-value` computed `fontVariantNumeric` contains `tabular-nums`.
- D: every `.pools-list .pool-card` `offsetHeight >= 84`.
- E: the tag-row hero computed `opacity === '0.75'` (primary — a literal, theme-independent), its
  computed `color` equals a probe span's resolved `var(--color-text-secondary)` (rgb-to-rgb), and the
  hero text still contains a `0` digit (number preserved).
- F: regression guard — clicking Grid View makes the `.pool-card` parent `pools-grid`.
Screenshots at 1280 (light), 768, 360, and 1280-dark are captured into the scratchpad (screenshot
writes wrapped in try/catch — a failed write logs but never fails the test).

## Deviation / discovery: the async-CSS `media="print"` gate (test-only harness fix)
`home.html` ships `style.min.css` as `<link media="print" onload="this.media='all'">` (non-render-
blocking async CSS, backlog 053). This produced a subtle, fully-diagnosed failure worth recording:

- If the test lets the sheet stay `media="print"` and then flips it to `all` **after** React has already
  rendered the pool cards, the `:root` custom props resolve fine, **but** the already-rendered 0-yield
  hero does NOT pick up the `:has()` rule (computed opacity stayed `1`, color stayed black), while a
  freshly-injected identical `.pool-apy-section > .pool-apy-hero + .pool-apy-tag` node styles correctly
  (`rgb(71,85,105)`, opacity 0.75). This is a Chrome `:has()` style-invalidation gap when the sheet
  becomes active on a subtree whose `:has()` anchor condition already existed at a prior style pass.
- This is NOT a product bug and NOT a `:has()` limitation. In production the `onload` swap to
  `media="all"` fires early — before the async pool-data fetch resolves and cards render — so the sheet
  (incl. the 095 rule) is active when each card is created, and `:has()` evaluates correctly at creation.

Faithful fix (test harness only, no product change): the test server rewrites home.html's link to
`media="all"` (its post-`onload` state) so the sheet is active before cards render, mirroring the
production ordering. Because `media="all"` makes the sheet render-blocking and style.css line 1
`@import`s a fontshare stylesheet (unreachable in the sandbox), the test also routes
`https://api.fontshare.com/**` → empty CSS so `load` fires. A small `ensureCssApplied` gate then waits
until `--color-text-secondary` resolves (neuro theme tokens are in) before reading computed styles.

## Non-issue verified: 360px clipping is pre-existing (not 095)
At 360px the APY hero pill visually clips at the card's right edge. Confirmed pre-existing by stashing
the 095 changes and re-screenshotting the baseline — identical clipping, and `document.body.scrollWidth
=== clientWidth === 360` (no page-level horizontal scroll) in both. Cause is the 090 list layout
(`.pools-list .pool-left-section { min-width: 250px }` inside the flex-row `.pool-header-new` that the
`@media (max-width: 768px)` block keeps as a row). The 095 changes are fully neutralized at ≤768px (the
media query re-centers the cells with `align-items: center; text-align: center`), so they cannot and do
not affect the narrow-width horizontal layout. Fixing the pre-existing 360 clip would be out-of-scope
for 095's four specified changes.
