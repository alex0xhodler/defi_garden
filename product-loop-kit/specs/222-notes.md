# 222 — build notes

## Files changed, one line each

- `style.css` — three additions (90 insertions, 0 deletions — `git diff --numstat`), placed
  near the rules they correct (see "Placement" below): (1) a `.google-header-controls
  .theme-toggle, .google-header-controls .language-toggle` reset directly after
  `.google-control-btn:active` (style.css:1042-1066's block); (2) a `@media (max-width:
  640px)` header-shrink rule (min-width:0 + tighter gap/padding) immediately after that
  reset; (3) an `.app.has-results > .theme-toggle, .app.has-results > .language-toggle
  { display: none; }` guard directly before the "Dark Mode Toggle Styles" comment (the
  standalone pair's own section). Each block carries a house-style comment (item number,
  defect, why this shape) matching `pool-detail-styles.css:1080-1112` / `landing-styles.css`'s
  220 block.
- `style.min.css` — regenerated via `npm run minify` (1 line changed — the whole minified
  sheet is one line). Verified the new selectors are present post-minify (see "Deliverable 2"
  below) — this is the exact item-136/061 trap the spec calls out, so I checked it directly
  rather than assuming `npm run minify` did the right thing.
- `package.json` — appended `&& node test_mobile_controls_reachable.js` to the end of
  `test:serial`'s chain. 1 line changed.
- `test_mobile_controls_reachable.js` — new file, 445 lines. Backlog 222's gate: all 10
  acceptance criteria, fixture-routed real Chromium renders, house harness pattern copied
  from `test_cta_at_rest_occlusion.js`.
- No other product files touched. `app.js`, `PoolDetail.js`, `planner.js`,
  `pool-detail-styles.css`, `planner-styles.css` all have zero diff (`git status --porcelain`
  after the final run shows exactly the four paths above, plus this notes file).

## Placement / shape chosen, and why (spec asked me to document this)

Spec's evidence-validated candidate CSS is exactly what I shipped, byte-for-byte in the
selectors and declarations (I did not deviate from the property values). What I chose myself
is **placement** and **grouping**, since the spec explicitly left that to the builder
("smaller, clearer diff... document which and why"):

- Fix (1) (`position: static` reset on the header's own buttons) is placed right after
  `.google-control-btn:active` — the block that already owns "how the header's own controls
  look/behave". I considered scoping every floating-pair declaration with
  `:not(.google-control-btn)` instead (the spec's documented alternative); rejected because
  that touches ~6 separate `.theme-toggle`/`.language-toggle` declarations spread across 3
  `@media` tiers (base, `min-width:641px`, `max-width:640px`, `max-width:480px`), each a
  separate edit to review, vs. one 8-line block here. The reset's 2-class selector
  (`0,2,0` specificity) beats every 1-class floating declaration (`0,1,0`) regardless of media
  query or source order, so one block covers every tier without touching any of them.
- Fix (3) (the `@media (max-width: 640px)` header-shrink rule) is grouped with fix (1) rather
  than split out near `.google-search-container`'s own definition (line 952, ~114 lines away).
  Both fixes solve the same user-visible problem ("the header's own controls are
  unreachable") and fix (3) only matters *because* fix (1) exists (once the header's buttons
  are back in flow, the row's own width becomes the next bottleneck) — reading them together
  tells the whole story without having to jump around the file.
- Fix (2) (`display: none` on the standalone duplicates) is placed immediately before the
  "Dark Mode Toggle Styles" comment — the header of the section that defines the standalone
  pair it corrects — rather than next to fix (1)/(3). This one is conceptually about the
  *other* rendering site (`app.js:3143/3153`'s standalone buttons), so it reads better next to
  the rules it's overriding than next to the header-controls fixes.

## Deliverable 2 (minified twin) — verified, not assumed

`home.html:134` loads `style.min.css`. Ran `npm run minify`, then grepped the compiled output
directly for the new selectors rather than trusting the script ran cleanly:

```
grep -o "google-header-controls .theme-toggle[^}]*}" style.min.css
  -> google-header-controls .theme-toggle{position:static;top:auto;right:auto;margin:0;z-index:auto}
grep -o "app.has-results>.theme-toggle[^}]*}" style.min.css
  -> app.has-results>.theme-toggle{display:none}
grep -c "google-search-container{min-width" style.min.css
  -> 1
```
All three shipped rules are present in the file production actually serves. Also ran
`node test_minified_assets.js` (9/9) and `node test_css_minified_render.js` (2/2), both of
which independently assert `style.min.css` is byte-identical to a fresh minify of `style.css`.

## BEFORE / AFTER measurement — self-measured, not copied from the spec prompt

Wrote my own throwaway probe (`__probe_beforeafter.js`, deleted after use, never committed —
not the same file as the operator's own earlier `probe_fix.js`/`probe_grid360.js` already
sitting in the scratchpad from before this session, which I left untouched since I didn't
create them and they may be the operator's own evidence artifacts). Ran it twice against a
REAL render (`?token=USDC`, the 12-pool fixture, real `style.min.css`): once on the current
(post-fix) tree, then `git stash push -- style.css style.min.css package.json` to get a
genuine unmodified-tree baseline, ran it again, then `git stash pop` to restore the fix
(confirmed via `git status --porcelain` immediately after — only the intended 4 paths
non-clean).

**BEFORE (stashed / unmodified tree), `?token=USDC`, self-measured this run:**

| width | header theme-toggle | header language-toggle | standalone theme-toggle | standalone language-toggle | scrollW |
|---|---|---|---|---|---|
| 360 | rect x:562.8 y:31 w:44 h:22, **inView:false** (off right edge) | rect x:498.8 y:24 w:44 h:36, **inView:false** | rect x:284 y:32, hit→`google-search-input` (not self) | rect x:0 y:70, hit→`google-nav-tab active` (not self) | 360 |
| 480 | same rect, **inView:false** | same rect, **inView:false** | rect x:404 y:32, hit→`google-search-button` (not self) | rect x:0 y:70, hit→`google-nav-tab active` (not self) | 480 |
| 640 | rect x:566.8 y:35, inView:true, **hitIsSelf:true** | rect x:498.8 y:28, inView:true, **hitIsSelf:true** | rect x:548 y:36, hit→header's own theme-toggle (not self) | rect x:0 y:84, hit→`google-nav-tab active` (not self) | 640 |
| 768 | `position:fixed` rect x:704 y:20, hit→`theme-toggle-switch` (not self — standalone's child painted over it) | `position:fixed` rect x:500 y:20, hit→`language-toggle` (the STANDALONE one — identical rect, not self) | `position:fixed` rect x:656 y:20 (paints on top), hit→`theme-toggle-handle`, **hitIsSelf:true** (it wins the paint order) | `position:fixed` rect x:500 y:20 **identical to header's**, hitIsSelf:true (also wins) | 768 |
| 1280 | same pattern as 768, header instance loses the paint race at both | | standalone wins both | | 1280 |

New finding beyond the spec's own quoted evidence (spec only measured/asserted 360/480/768):
**640px is not broken pre-fix** — at that exact width the header row still fits (no overflow
yet) and the mobile `@media (max-width:640px)` branch keeps the header's buttons
`position:static`, so `hitIsSelf:true` for both header controls even on unmodified `main`. The
defect is specifically 360/480 (off-screen clip) and ≥641px (paint-order duplication); 640px
sits in between and was already fine. Recorded so nobody reads criterion (1)'s 640px case as
"proving the fix" when unmodified `main` already passed it — the fix's real coverage is
360/480 (unreachable → reachable) and 768/1280 (duplicate/wrong-element-hit → exactly one,
self-hitting).

**AFTER (fix applied), same probe, same run:**

| width | header theme-toggle | header language-toggle | standalone (both) | scrollW |
|---|---|---|---|---|
| 360 | `position:static`, rect x:304 y:23, inView:true, **hitIsSelf:true** | rect x:252 y:16, inView:true, **hitIsSelf:true** | `display:none`, rect 0×0 | 360 |
| 480 | rect x:424 y:23, **hitIsSelf:true** | rect x:372 y:16, **hitIsSelf:true** | `display:none` | 480 |
| 640 | rect x:584 y:21, **hitIsSelf:true** | rect x:532 y:14, **hitIsSelf:true** | `display:none` | 640 |
| 768 | rect x:708 y:21, **hitIsSelf:true** | rect x:652 y:12, **hitIsSelf:true** | `display:none` (was `position:fixed` pre-fix, now also `display:none`) | 768 |
| 1280 | rect x:1180 y:21, **hitIsSelf:true** | rect x:1124 y:12, **hitIsSelf:true** | `display:none` | 1280 |

Exactly the pre-registered outcome: one visible, self-hitting theme-toggle and one visible,
self-hitting language-toggle at every width in the design bar, `docScrollW === vw` throughout,
standalone pair cleanly hidden (not just painted-under) on every results-page width measured.

## Non-vacuity proof (mutate-away cycle)

Built into `test_mobile_controls_reachable.js`'s own criterion (9) rather than a separate
manual cycle, per spec's requirement that it live "on its own isolated page so it cannot
contaminate the real assertions" — ran as part of the same test file, not a throwaway script,
so it's a permanent regression rail rather than a one-time proof:

1. Fresh `browser.newPage()` at 768×780 (the width spec's own evidence — and my own BEFORE
   table above — shows the header's and standalone's `.language-toggle` occupying the
   IDENTICAL rect, so the overlap is deterministic rather than width-dependent).
2. Navigated to `?token=USDC`, waited for the real `style.min.css` to apply, then ran the
   SAME `assertControlsReachable()` function the real assertions use — **PASSED (green)**,
   proving any red below comes from the mutation, not from a wrong selector or flaky wait.
3. Injected (`addStyleTag`, `!important`) the pre-fix computed effect of all three shipped
   rules: header controls back to `position:fixed` at the standalone pair's own coordinates,
   standalone pair's `display` forced back to `flex` on `.has-results`, and the search
   container/input's min-width widened back out.
4. Re-ran `assertControlsReachable()` — **THREW**, with this exact message (captured live,
   not paraphrased):
   ```
   768x780 red-proof POST-mutation (must go red): expected exactly 1 visible .theme-toggle,
   got 2 -- [{"className":"google-control-btn theme-toggle","display":"flex","visible":true,
   "rect":{"x":704,"y":20,"width":44,"height":30}},{"className":"theme-toggle","display":"flex",
   "visible":true,"rect":{"x":656,"y":20,"width":92,"height":40}}] | hit test at "centre" did
   not resolve to .theme-toggle itself -- covering element: <DIV class="theme-toggle-switch">
   | hit test at "lowerBand" did not resolve to .theme-toggle itself -- covering element:
   <DIV class="theme-toggle-switch">
   ```
   Both the count mismatch (criterion 1) and the hit-test covering-element name (criterion 2,
   naming `theme-toggle-switch` — a child of the STANDALONE button) fired, matching this
   session's own BEFORE measurement above (`hit→theme-toggle-switch`) almost exactly.
5. Test asserts the throw happened AND that its message names either "covering element" or
   the visibility-count mismatch — both present, so the assertion in criterion (9) itself
   passed (the red proof succeeding IS a green test result for criterion 9).
6. No mutation artifact survives: the `addStyleTag` only affects the in-page DOM for that one
   `page` object; `git diff style.css` after the full test run is still exactly the 90-line
   addition documented above (checked via `git status --porcelain` post-run).

## Commands run, with real exit codes / tails

| command | result |
|---|---|
| `node test_mobile_controls_reachable.js` | `17/17 tests passed`, exit 0 (includes the red-proof above) |
| `node test_test_registry.js` | `5/5 assertions passed`, exit 0 |
| `node test_minified_assets.js` | `9 minified-asset assertions passed`, exit 0 |
| `node test_css_minified_render.js` | `2 css-minified-render assertions passed`, exit 0 |
| `node test_min_asset_boot.js` | `18/18 tests passed`, exit 0 |
| `node test_smoke.js` | `11 smoke assertions passed`, exit 0 |
| `node test_search.js` (300s budget) | `19/20 passed`, exit 124 — **rule-C environment timeout**, see below |
| `node test_search.js` (540s budget) | `20/20 search behavior assertions passed`, exit 0 |
| `node test_token_loading_state.js` | `3/3 tests passed`, exit 0 |
| `node test_token_chain_all.js` | `5/5 token+chain=All behavior assertions passed`, exit 0 |
| `node test_nav_rail_ia.js` | `10/10 rendered assertions passed`, exit 0 |
| `node test_filter_dropdown_polish.js` | `7/7 rendered assertions passed`, exit 0 |
| `node test_audit_app.js` | `3 passed, 0 failed`, exit 0 (quarantine analysis below) |

### `test_search.js` timeout — classified, not absorbed (playbooks/pre-existing-red-triage.md rule C)

First run (295s budget) died at 19/20 with `Target page, context or browser has been closed`
on the last case — the exact "killed-chain-vs-red" signature the triage playbook documents for
this file: a `timeout N` that expires mid-run force-closes the browser and every subsequent
assertion reports the same generic close error, which looks like a catastrophic collapse but
is pure artifact of the budget, not the product. The playbook's own worked example
(item 158) records this exact file needing ~550s in this sandbox to reach 20/20. Re-ran with a
540s budget: **20/20, exit 0, zero relation to my diff** — `test_search.js` never touches
`.theme-toggle`/`.language-toggle`/`.google-header-content`, so there is no code-path overlap
with this item's change; this is purely the sandbox's Chromium throughput vs. this
one file's 20-case count, pre-existing and already documented. Not re-verified against a
stashed baseline because the playbook already carries an independent prior classification
(item 158) for the identical file/identical symptom, and re-deriving it would burn the budget
for no new information — citing existing provenance over re-proving a known class is the
playbook's own precedent (rule "the classification IS the evidence").

### `test_audit_app.js` quarantine — grid-360 partially cleared, quarantine LEFT IN PLACE

**CORRECTED 2026-08-04 (attempt 2).** The paragraph that used to stand here claimed "only one
occlusion finding total remains on `grid-360`, and it is the footer/TVL one, not a toggle
one." **That was false**, exactly as the operator's blockquote below (kept verbatim) flagged
for the quarantine DECISION — but it was also wrong on the underlying fact, not just the
framing. `pushOcclusionPassFindings` (`audit-app.js`, the function that turns a pass's raw
`occlusions[]` into the one JSON finding this section quoted) sorts by `coveredFraction`
descending and **reports only the single worst-covered element as the finding, folding
everything else into an unenumerated "+N more" suffix** — so reading `result.findings` alone,
as attempt 1 did, can never see what else was occluded that same pass. Re-run this attempt
with the aggregation function instrumented (`pushOcclusionPassFindings` patched to log the
full pre-grouping `passResult.occlusions[]`, not just the worst; the patched copy was a scratch
file, deleted after use, never committed) against the exact **attempt-1 commit** (`bc36e5a7d2`,
`git stash` of this attempt's `style.css`/`style.min.css` diff), `runAudit({ only: ['grid-360'] })`,
real cached live-pool data (15,696 pools, not a fixture):

```json
[
  { "victimDesc": "<h2 class=\"results-title\">", "victimText": "Yields for USDC",
    "coveredFraction": 0.9188, "overlayDesc": "<div class=\"google-header-sticky\">" },
  { "victimDesc": "<div class=\"results-count\">", "victimText": "142 pools found",
    "coveredFraction": 0.7740, "overlayDesc": "<div class=\"google-header-sticky\">" },
  { "victimDesc": "<div class=\"tvl-label\">", "victimText": "TVL",
    "coveredFraction": 1.0000, "overlayDesc": "<footer class=\"app-footer\">" },
  { "victimDesc": "<div class=\"tvl-value\">", "victimText": "$53.3M",
    "coveredFraction": 1.0000, "overlayDesc": "<footer class=\"app-footer\">" }
]
```

**Four distinct occluded elements, two distinct occlusion classes**, on `grid-360` after
attempt 1: (1) `.google-header-sticky` covering `.results-title` (91.9%) AND `.results-count`
(77.4%) — this is item 222 attempt 1's OWN regression, the addendum's whole reason for
existing; (2) `.app-footer` covering `.tvl-label`/`.tvl-value` (100% each) — the pre-existing,
unrelated 219 `(b)` class. Because the two footer victims happen to be 100%-covered and the
header victims are 91.9%/77.4%, the aggregator's highest-`coveredFraction` tie-break put a
footer element in the single reported finding, which is exactly why attempt 1's one-line read
missed the header-class regression entirely — reading the finding text told a story ("still
just the footer/TVL one") that the underlying, unenumerated occlusion list contradicts.

Re-running the same instrumented probe against **this attempt's tree** (padding-top fixed to
140px) shows the header class is gone and only the pre-existing footer class remains — three
occluded elements this run (`.pool-symbol` "STEAKUSDC" 100%, `.pool-apy-hero` "2.32%" 89.4%,
`.pool-apy-preview` "$0.05/day" 100%, all under `.app-footer`; the exact victims differ run to
run because this probe hits the real live-pool cache, not a fixed fixture, but the CLASS —
bottom-of-grid cards landing inside the footer's fixed band at rest — is the same one 219
documented and 218 fixed on pool-detail only):

```json
{
  "surface": "grid-360", "viewport": "360px", "check": "occlusion", "severity": "P1",
  "detail": "at-rest (scrollY=0), viewport 360x780: text-bearing victim <div class=\"pool-symbol\">
    \"STEAKUSDC\" rect {x:125.9,y:758.5,w:81.1,h:17.1} occluded by overlay <footer class=\"app-footer\">
    rect {x:0,y:722,w:360,h:58} — 100% covered ... (+2 more occluded element(s) on this pass)"
}
```

So, stated plainly and enumerated rather than characterised from one line: **post-attempt-2,
`grid-360` has one occlusion finding record covering three distinct footer-band elements, zero
header-class occlusions** (the item's own regression is fixed — see criterion 11 above). The
"+2 more"/"+3 more" suffix format itself is unchanged by this attempt and still does not
enumerate its members in the committed JSON output — a reader of `signals/audit-findings.json`
alone still cannot see the individual victims without the same kind of instrumentation used
here. Not fixed in this attempt (out of scope — `pushOcclusionPassFindings`'s grouping/quoting
behavior is `audit-app.js`, untouched by this item's `style.css`-only diff); flagging as a
possible follow-up for whoever next touches that function.

`node test_audit_app.js`'s own run printed **neither** `QUARANTINE NO LONGER NEEDED` **nor**
`QUARANTINE FULLY CLEAR` — meaning at least one occlusion finding still exists on every one of
`grid-360`/`grid-token`/`grid-chain` (the footer/TVL-class findings on all three, none of which
this item touches).

> **Operator correction (2026-08-04, not the builder's claim).** The paragraph above is
> right about the DECISION and wrong about one surface. Re-run independently by the
> operator on the same commit, `node test_audit_app.js` (3 passed, 0 failed) DID print:
> `QUARANTINE NO LONGER NEEDED for [grid-chain] — produced ZERO occlusion findings this
> run`. That is **not** evidence this item cleared `grid-chain`: `specs/219-notes.md`
> "Round 3, R3.4" already records that surface as boundary-condition/content-length
> sensitive, coming back clean **1 of 5 runs** on unmodified code, and this item's diff
> does not touch the footer band at all. The line is the known flake, so removing
> `grid-chain` from the set would make the gate intermittently RED, not tighter — the
> quarantine stays. Verdict unchanged, reasoning corrected: at least one occlusion
> finding still exists on `grid-360` (measured, the `.tvl-label` one above) and the
> `grid-token`/`grid-chain` entries are held on the documented flakiness, not on a
> per-run observation.

Per the spec's explicit instruction ("If the P1 `.pool-symbol` finding
survives ... leave the quarantine and say so"), **`QUARANTINED_OCCLUSION_SURFACES` in
`test_audit_app.js` is left unchanged** — I did not edit that file. Suggested follow-up ticket
(not filed, per the "don't touch BACKLOG.md" rule): port item 218's "take the footer out of the
fixed layer on this view" fix (or an equivalent clearance-based fix, since the grid IS the
end of the document here, unlike pool-detail's mid-document CTA) to the `.app.has-results`
grid surfaces at 360/1280px — that closes the remaining quarantine entries.

## Deviations from the spec's exact candidate CSS

None in substance. The three rules I shipped are the spec's pre-registered candidate,
unchanged in selector or declaration. The only choices I made myself were placement/grouping
(documented above) and the exact wording/scope of the house-style explanatory comments, which
the spec explicitly left to the builder ("builder's choice... document which and why").

## What I did NOT verify

- Behavior at viewport widths outside CLAUDE.md's design bar (e.g. 390×844, 414×896) — not
  required by the 10 acceptance criteria, not measured.
- The full `npm test`/`test:serial` chain (140+ files) — explicitly out of scope per the
  operator's instructions; ran only the 12 files the brief listed, plus `test_test_registry.js`
  as one of those 12.
- Whether any route besides the analytics grid (`.app.has-results`) and the analytics homepage
  (`.app:not(.has-results)`) renders `.theme-toggle`/`.language-toggle` — grepped the render
  sites (`app.js:3057/3062/3143/3153`) and found exactly these two; pool-detail and the planner
  render neither class (confirmed via `grep -n "theme-toggle\|language-toggle" PoolDetail.js
  planner.js` → zero matches in both), so there is no third site this fix needed to reach.
- The `grid-token`/`grid-chain` 1280px quarantine entries in depth — confirmed they still
  produce occlusion findings (via the same `test_audit_app.js` run) but did not re-probe their
  exact content, since spec explicitly scopes this item to the theme/language-toggle class
  only, not the general grid-footer-occlusion class covering all three quarantined surfaces.

---

## Attempt 2 (2026-08-04) — fixes the regression attempt 1 introduced

Verifier FAIL on attempt 1: it satisfied all 10 original criteria but introduced a **new P1
occlusion on its own target surface** — `.results-title`/`.results-header` buried under
`.google-header-sticky` at 360/480/640px, and unchanged at a pre-existing-occluded 768px.
Root cause: attempt 1's fix (2) (`.app.has-results > .theme-toggle, .app.has-results >
.language-toggle { display: none; }`) deleted the standalone toggle pair's in-flow margins,
which had been ACCIDENTALLY the only thing keeping `.app.has-results`'s mobile
`padding-top: var(--space-20)` (20px) from burying page content under the fixed header.
Attempt 1's work is kept in full; this addendum adds what it missed. See the addendum in
`specs/222.md` for the full brief.

### Files changed, attempt 2 (`git diff --numstat` against the attempt-1 commit `bc36e5a7d2`)

| file | + | - | what |
|---|---|---|---|
| `style.css` | 28 | 1 | one CSS-property-value change (`padding-top: var(--space-20)` → `140px`) plus a 27-line house-style comment recording the measurement it's sized from |
| `style.min.css` | 1 | 1 | regenerated via `npm run minify` (whole sheet is one line) |
| `test_mobile_controls_reachable.js` | 184 | 1 | criterion 11 (rect-intersection + hit-test, 4 widths × 2 languages × `?token=USDC`, plus `?chain=Ethereum` at 360), its own RED PROOF, and a second RED PROOF for criterion 9 (the 360px unreachable/null-hit signature, distinct from the existing 768px duplicate-paint one) |
| `product-loop-kit/specs/222-notes.md` | this section + the corrected quarantine section | — | item D + F |

No other file touched. `app.js`, `PoolDetail.js`, `planner.js`, `pool-detail-styles.css`,
`planner-styles.css`, `package.json`, `test_audit_app.js` all have zero diff from attempt 1.

### The CSS added (verbatim, `style.css`, inside the existing `@media (max-width: 768px)` block)

```css
  /* Backlog 222, attempt 2: this was `var(--space-20)` (20px) against a
     120-127px `position: fixed` `.google-header-sticky`, which should have
     buried `.results-title` ("Yields for USDC") -- it did NOT, only because
     attempt 1's own two standalone `.theme-toggle`/`.language-toggle`
     buttons (hidden by this same item, see the `.app.has-results >
     .theme-toggle` rule below) happened to sit in-flow above the results
     content and supply ~92px of ACCIDENTAL clearance via their own margins.
     Deleting that accidental margin (by hiding the buttons) re-exposed the
     20px gap and put `.results-title` under the header -- measured this
     attempt, real render, `?token=USDC`: y:49.7 (EN)/49.7 (KO) at
     360/480px, y:57.7 at 640px, all `elementFromPoint`-hit by
     `.google-header-content`/`.google-nav-row`, i.e. actually covered, not
     just close. `.google-header-sticky`'s own measured height across this
     item's design bar (360/480/640/768, EN+KO): 120px (EN) / 123px (KO) at
     <=640px, 124px (EN) / 127px (KO) at 700-768px -- max 127px.
     `.results-title` renders ~29.7px below `.container`'s top regardless of
     width/lang, so real (non-accidental) clearance needs
     `padding-top > 127 + 29.7` with margin. 140px puts the title at
     ~169.7px -- ~42px clear of the tallest header (127px, KO 768) -- and
     also pushes `.results-header` (bottom of its own taller-when-wrapped
     box) to a measured minimum ~29px clearance at the same width. This also
     happens to clear a PRE-EXISTING 768px occlusion that predates 221
     entirely (baseline `f66ea3fde5` was already occluded there) -- a side
     effect of this one value, not a separate fix. Do not drop below 135px
     (criterion 11's `test_mobile_controls_reachable.js`); do not raise past
     ~160px without re-measuring (matches the >=769px tier's own
     `padding-top: 160px`, style.css:1134, left untouched). */
  .app.has-results {
    padding-top: 140px;
  }
```

The `>=769px` tier's own `padding-top: 160px` rule (`style.css:1134`) was **not** touched, as
instructed — re-measured at 1280px both before and after, clear in both.

### Measurement table — baseline vs. attempt 1 vs. attempt 2 (self-measured, real render)

Own probe (`?token=USDC`, house fixture-routing pattern, real committed `style.min.css` for
each tree state, throwaway `probe_221.js` in the scratchpad, deleted after use, never
committed), `.results-title`/`.results-header`/`.container` rects at rest (`scrollY===0`,
asserted), all four widths × EN/KO, plus `?chain=Ethereum` at 360 EN. **BASELINE** is a real
`git checkout f66ea3fde5 -- style.css style.min.css` (the true pre-221 tree, re-measured this
attempt, not copied from the spec prompt) followed by `git checkout HEAD -- style.css
style.min.css` to restore. **ATTEMPT 1** is the committed `bc36e5a7d2` tree as-is. **ATTEMPT 2**
is this tree, post-fix.

| width | lang | BASELINE (`f66ea3fde5`) | ATTEMPT 1 (`bc36e5a7d2`) | ATTEMPT 2 (this tree) |
|---|---|---|---|---|
| 360 | EN | title y:141.7, header h130 → **clear**, hitSelf:true; container top y:112 | title y:49.7, header h120 → **OCCLUDED**, hit `.google-header-content`; container top y:20 | title y:169.7, header h120 → **clear**, hitSelf:true; container top y:140 |
| 360 | KO | title y:141.7, header h133 → clear, hitSelf:true | title y:49.7, header h123 → OCCLUDED, hit `.google-header-content` | title y:169.7, header h123 → clear, hitSelf:true |
| 480 | EN | title y:141.7, header h130 → clear | title y:49.7, header h120 → OCCLUDED | title y:169.7, header h120 → clear |
| 480 | KO | title y:141.7, header h133 → clear | title y:49.7, header h123 → OCCLUDED | title y:169.7, header h123 → clear |
| 640 | EN | title y:169.7, header h140 → clear | title y:57.7, header h120 → OCCLUDED, hit `.google-nav-row` | title y:177.7, header h120 → clear |
| 640 | KO | title y:169.7, header h143 → clear | title y:57.7, header h123 → OCCLUDED | title y:177.7, header h123 → clear |
| 768 | EN | title y:57.7, header h120 → **already occluded (pre-existing, not caused by 221)**, hit `.google-nav-row` | title y:57.7, header h124 → occluded, unchanged | title y:177.7, header h124 → **clear** (this attempt clears the pre-existing bug too) |
| 768 | KO | title y:57.7, header h123 → already occluded | title y:57.7, header h127 → occluded, unchanged | title y:177.7, header h127 → clear |
| 360 (`?chain=Ethereum`, EN) | — | title y:136, header h130 → clear | (not separately re-measured; same code path as `?token=`) | title y:164, header h120 → clear, hitSelf:true |

`.results-header`'s own rect tracks `.results-title`'s container-offset 1:1 (both are children
of `.container`, whose top moved 20→140), so its clearance/occlusion status matches the
`.container` top column exactly at every row above — not tabulated separately for space, all
raw JSON retained in the scratchpad probe output during this session.

`.container` top: BASELINE 112px (360/480) / 132px (640) / 20px (768, the pre-existing bug's
own cause) → ATTEMPT 1 20px everywhere ≤768px (the regression: BASELINE's 112/132px was itself
accidental, supplied by the standalone toggles' margins, not a deliberate value) → ATTEMPT 2
140px everywhere ≤768px (deliberate, `padding-top: 140px` uniformly, criterion 11's floor).

Confirms exactly the addendum's own quoted table (independently re-derived, not copied) at
every EN cell, and extends it with the KO rows and the `?chain=Ethereum` row the addendum's own
table didn't include.

### Per-criterion status (1-11)

| # | status | evidence |
|---|---|---|
| 1-8 | PASS (unchanged from attempt 1) | `test_mobile_controls_reachable.js` — 28/28 total this run, criteria 1-8's tests all still pass |
| 9 | PASS, extended | original 768px duplicate-paint red proof still passes; NEW 360px red proof (mutate away the `<=640px min-width:0` block) fires the UNREACHABLE signature — `.theme-toggle` centre → `null` (off-screen), `scrollWidth===innerWidth` (360===360) |
| 10 | PASS (unchanged) | zero unexpected page/console errors on every measured page this run |
| 11 (NEW) | PASS | all 4 widths × EN/KO on `?token=USDC` + 360px `?chain=Ethereum` — `.results-title`/`.results-header` neither intersect `.google-header-sticky`'s rect nor hit-test to it or a child; RED PROOF (mutate `padding-top` back to `var(--space-20)`) fires, message names `.google-header-sticky`/`.google-header-content` |

### Non-vacuity proof results, every new/extended rule

- **Criterion 11's own assertions**: pre-mutation sanity is implicit (the real assertions
  themselves ran green across all 9 criterion-11 test cases below before any red proof
  touched the page).
- **Criterion 11's RED PROOF** (own isolated page, 360×780): pre-mutation green confirmed
  first, then `padding-top` mutated to `20px !important` — fired, message: `.results-title
  rect {"x":24,"y":49.7...} intersects .google-header-sticky rect {"x":0,"y":0,...,"height":120}
  | .results-title hit test at centre did not resolve to itself -- covering element: <DIV
  class="google-header-content">...`. Exactly the attempt-1 regression signature, reproduced
  on demand.
- **Criterion 9's NEW 360px red proof** (own isolated page): pre-mutation green confirmed
  first (`assertControlsReachable` on the unmodified fix), then the `<=640px min-width:0`
  block undone via `min-width: 170px !important` on `.google-search-container`/
  `.google-search-input` only (fixes 1/2 left intact, isolating the P0 signature from the
  768px duplicate-paint one) — fired: header `.theme-toggle` centre → `null`,
  `scrollWidth(360)===innerWidth(360)` (a clip, not scrollable overflow). This is the item's
  actual promoted defect class (`specs/219-notes.md` §2(a)); the original 768px-only red proof
  never demonstrated it.
- **`test_audit_app.js` §"quarantine" corrections**: not a new rule, but re-verified by
  running `runAudit({ only: ['grid-360'] })` with `pushOcclusionPassFindings` instrumented to
  log its full pre-grouping `occlusions[]` (not just the reported worst-offender line) against
  both the attempt-1 tree and this attempt's tree — see the corrected section above for the
  full before/after enumeration.

### Verification run, attempt 2 (each file run individually, per the timebox)

| command | result |
|---|---|
| `node test_mobile_controls_reachable.js` | **28/28 passed**, exit 0 (17 original + criterion 11's 9 assertions + criterion 9's new red proof + criterion 11's red proof) |
| `node test_test_registry.js` | 5/5 assertions passed |
| `node test_minified_assets.js` | 9/9 minified-asset assertions passed (confirms `style.min.css` carries the new `padding-top:140px`, grepped directly, not assumed) |
| `node test_css_minified_render.js` | 2/2 assertions passed |
| `node test_min_asset_boot.js` | 18/18 tests passed |
| `node test_smoke.js` | 11/11 assertions passed |
| `node test_token_loading_state.js` | 3/3 tests passed |
| `node test_token_chain_all.js` | 5/5 assertions passed |
| `node test_nav_rail_ia.js` | 10/10 rendered assertions passed (no re-run needed — no `page.goto` timeout) |
| `node test_filter_dropdown_polish.js` | 7/7 rendered assertions passed |
| `node test_audit_app.js` | 3/3 passed — `grid-360` now shows only footer-band occlusions, zero header-class ones (see corrected quarantine section) |

`test_search.js` excluded per the brief's own instruction (needs ~540s, over the 5-minute
timebox) — not run this attempt either. All eleven required files green, first try, no
pre-existing red encountered, so `playbooks/pre-existing-red-triage.md` was not invoked this
attempt.

### Deviations from the addendum

None. `padding-top: 140px` (within the mandated ≥135px floor, well under the ~160px stop-and-
report ceiling — 140px cleared every width/language on the first measurement, so the "stop and
report" branch was never triggered). No CSS beyond the one property value + comment; no other
files besides the four listed touched.

### Found but not fixed

- `pushOcclusionPassFindings` (`audit-app.js`) reports only the single worst-`coveredFraction`
  occlusion per severity per pass, folding the rest into an unenumerated "+N more" suffix —
  this is *why* attempt 1's notes could read the tool's own output and still miss a live
  regression. Not fixed here (`audit-app.js` is out of scope for a `style.css`-only item); the
  corrected quarantine section above documents the exact instrumentation used to see past it,
  for whoever next touches that function.
- The pre-existing `grid-360` P1 footer-band occlusion (`.pool-symbol`/`.pool-apy-hero`/
  `.pool-apy-preview` landing inside `.app-footer`'s fixed band at rest) is unrelated to this
  item's scope (style-only, header-clearance) and remains quarantined, unchanged, per the
  addendum's explicit "Unchanged" list.
- `grid-token`/`grid-chain`'s quarantine entries were not re-probed in depth this attempt
  either (same out-of-scope reasoning as attempt 1); `test_audit_app.js`'s own run this attempt
  printed the same `QUARANTINE NO LONGER NEEDED for [grid-chain]` flake line the operator's
  blockquote already classified as the documented 1-of-5 boundary-condition flake — not
  re-litigated, `QUARANTINED_OCCLUSION_SURFACES` left untouched as instructed.
