# 004 notes — surface the share CTA at the bloom moment (executed 2026-07-10)

## Verdict
Share affordance WAS buried: three buttons (`doShare`/`doCopyLink`/`doNativeShare`) rendered
only in `footElement`, the last block in the whole `.gp-bloom` tree — after hero, plan strip,
persona ladder, chart, make-it-yours sliders, engine room, ask box, and caveats. Confirmed by
reading render order in `planner.js`, not just the spec's territory note. Added a second,
prominent share prompt at the top of the bloom view; left the original footer row untouched.

## Territory findings (file:line, pre-edit)
- Handlers: `doShare` planner.js:1681 (share-image canvas), `doCopyLink` planner.js:1746,
  `doNativeShare` planner.js:1769 — all inside `function Bloom(props)` (planner.js:1216).
- Old (only) render site: `footElement` planner.js:2327-2349, buttons at 2331/2334/2337,
  wired up via `.gp-share-row` inside `.gp-bloom-foot` (planner-styles.css:956, :1382).
  `footElement` is appended as the last child of the top-level `gp-bloom` div in BOTH return
  branches (subscription: was line 2560; target/growth: was line 2732) — i.e. after
  everything else, confirmed by reading both `return e('div', { className: 'gp-bloom' }, ...)`
  statements end to end.
- Layout structural facts that drove the placement decision:
  - `.gp-bloom-layout` is a 2-col grid (`.gp-bloom-checkout` 300px sticky sidebar,
    `.gp-bloom-detail` 1fr main column) at ≥769px (planner-styles.css:424-443).
  - At ≤768px it collapses to 1 column with `.gp-bloom-checkout` explicitly FIRST
    (`grid-row: 1`, `position: static`) and `.gp-bloom-detail` second — an existing,
    intentional "mobile: single-col, checkout first" convention (planner-styles.css:580,
    comment already in the codebase, not something I introduced).
  - `.gp-bloom-checkout` is `position: sticky; top: var(--space-20)` on desktop
    (planner-styles.css:441-443) — it stays in viewport as the (much longer) detail column
    scrolls.
  - Net effect: the checkout column is the ONLY position in the tree that is simultaneously
    first-painted on mobile (360/768px) and permanently viewport-pinned on desktop (1280px).
    Placing the CTA near the hero headline instead would only win on desktop (hero is column-1
    top) — on mobile it sits behind the entire checkout panel, which fails "visible without
    hunting" harder than the footer did in spirit (still requires scrolling past a full card).

## Change made
- `planner.js`: new `sharePromptElement` (defined once, right after `checkoutPanelElement`,
  now at planner.js:2554-2563), rendered as a second child of the `.gp-bloom-checkout` wrapper
  in both return branches (now planner.js:2569 and :2583: `e('div', { className:
  'gp-bloom-checkout' }, checkoutPanelElement, sharePromptElement)`). One headline string +
  one button. Button logic: `navigator.share ? doNativeShare-button : doCopyLink-button` —
  exactly the "prefer native, else copy-link" rule from the task, and reuses the *existing*
  handlers verbatim (no new share mechanics, no new analytics event — same
  `share_link_created` fires via the same two functions).
- `planner-styles.css`: new block `.gp-share-prompt` / `.gp-share-prompt-text` /
  `.gp-share-prompt-btn` (planner-styles.css:580-600), inserted right after
  `.gp-checkout-note`, before the mobile media query. Tokens only
  (`--color-surface`, `--color-text`, `--neuro-radius-md`, `--neuro-shadow-flat`,
  `--space-*`, `--font-size-sm`, `--font-weight-medium`) — no hardcoded colors, so dark mode
  is automatic (same tokens already flip under `[data-theme="dark"]` in style.css).
  The button reuses the existing `.gp-share-btn` class (combined as
  `'gp-share-btn gp-share-prompt-btn'`) so it inherits the already-shipped hover/active/
  disabled press-physics (`:active { box-shadow: var(--neuro-shadow-pressed); transform:
  translateY(0); }`, planner-styles.css:1001) instead of redefining it.
  Entrance animation reuses the existing `.gp-animate-in` class (gpIn keyframe), which is
  already globally disabled under `@media (prefers-reduced-motion: reduce)`
  (planner-styles.css:1632-1636) — so reduced-motion compliance came for free by not
  inventing a new animation.
- `translations.js`: one new key, `sharePromptHeadline`, added to both `en.planner` (line 291)
  and `ko.planner` (line 751), directly after the existing `shareFooter` key (same cluster as
  the other share strings). EN: "Your plan is ready — send it to someone who'd want one too."
  KO (natural, not machine-literal): "계획이 완성됐어요 — 이런 계획이 필요할 누군가에게 보내
  보세요." No other new strings — the button label reuses existing `shareNative` /
  `shareLink` / `shareLinkCopied` keys verbatim, so the new prompt speaks the same vocabulary
  as the pre-existing footer buttons.

## Deviations from spec and why
- Spec's acceptance line reads "visible without scrolling/hunting." Read literally that's
  unverifiable for arbitrary viewport heights (only widths are specified, and I have no
  screenshot tool per the task's own environment note — "reason it through in CSS"). I
  optimized for the strongest available structural proxy: DOM-first + sticky, per the territory
  findings above. I did not attempt to also guarantee a pixel-level "above the fold" claim.
  Flagging this so the verifier checks it against real viewport heights, not just my reasoning.
- I left the original `footElement` share row completely unchanged. The spec doesn't say to
  remove it, and touching it would (a) grow the diff, (b) risk the one thing that's already
  proven not-broken (002-notes.md: "share pipeline code-audited sound end-to-end"). Users who
  scroll to the bottom still have the full 3-button row (image/copy/native); the new prompt is
  additive, not a replacement.
- Did not add a "once per plan"/dismiss-and-remember flag. Spec says "prompted once per plan at
  the bloom/report moment" — I read that as "appears when the plan reaches bloom" (which it
  inherently does, once per bloom render), not as "needs new dismissal-state plumbing." Adding
  localStorage-backed dismiss tracking would be a new mechanic the spec explicitly rules out
  ("no new share mechanics") and pure scope creep for a hypothesis that hasn't been validated
  yet. If the verifier disagrees, that's a cheap follow-up, not a redo.
- Did not add a new button-label translation key — reused `shareNative`/`shareLink`/
  `shareLinkCopied`. Smaller diff, and keeps the vocabulary between the new prompt and the
  pre-existing footer buttons identical.
- No modal/interstitial. A modal at the bloom moment would be the more "aggressive" reading of
  "emotional peak," but the task explicitly bans fake urgency / dark patterns and asks for
  "calm." An inline, always-present card in the sticky sidebar is calm and non-blocking; a
  modal popping up unprompted is closer to the pattern this product explicitly avoids
  elsewhere (waitlist modal is opt-in via click, never auto-opened).

## Conservative choices
- Zero changes to `doShare`/`doCopyLink`/`doNativeShare` internals, zero changes to
  `analytics.js`, `home.html`, router/URL semantics, or any trust-rail surface — confirmed by
  diff scope (only planner.js, planner-styles.css, translations.js touched).
- No new dependencies. No new CSS animation — reused `gp-animate-in` verbatim.
- Diff size: ~2 lines translations.js, ~15 lines planner.js (new element + 2 one-line call-site
  edits), ~22 lines planner-styles.css. Well under the 150-line budget.

## Verification
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` — all
  three exit 0 (190 assertions in test_planner.js, all passing; the other two are scripted
  output checks, both completed without error). Re-run after every edit in this session.
- Not independently screenshot-verified (no browser tool used, per task instructions to reason
  through CSS instead). Listed exact URLs/viewports for human/verifier visual check in the
  final summary.
