# Spec 008 — build notes

Builder: Sonnet 5 (build-loop iteration). Territory: `planner.js` `sharePromptElement`,
`planner-styles.css` `.gp-share-prompt*`, `translations.js` `sharePromptHeadline` + new keys.
Files touched: exactly these three. No git operations performed (per dispatch envelope);
working-tree edits only.

## Territory findings (actual vs. hinted line numbers)

- `planner.js`: `sharePromptElement` was at lines 2566–2580 pre-edit (dispatch hint said
  "~2565–2580" — accurate). The demoted button ternary is at 2573–2579.
- `planner-styles.css`: `.gp-share-prompt` block was at lines 634–651 pre-edit (dispatch hint
  said "~580–601" — stale by ~54 lines, presumably from before items 005/007 added CSS above
  it; spec 008.md's own territory note said "~580–601" too, same staleness). Found via grep,
  not trusted from the hint.
- `translations.js`: `sharePromptHeadline` was at line 294 (EN) / 760 (KO) pre-edit. The
  dispatch envelope's top-level "Territory" section said "~476 / ~938" — that number doesn't
  match either the file's actual state or spec 008.md's own territory notes (which don't
  mention translations.js line numbers at all). Treated as stale; used grep for ground truth.
- Confirmed via read: items 005 (image-first share button, `doShare`) and 007 (arrival banner)
  are present and untouched by this change.

## One-line-at-360px reasoning

Container chain at 360px viewport (body has `margin:0; padding:0`, confirmed in style.css):
`.gp-main` padding is `var(--space-8) var(--space-16) var(--space-32)` → 16px horizontal each
side → content width 360 − 32 = **328px**. `.gp-bloom-checkout` is single-column at mobile
(`@media max-width:768px`) with no added padding, so it inherits the full 328px. `.gp-share-prompt`
padding after this change's tightening is `var(--space-12) var(--space-16)` → 16px horizontal
each side → text content width **296px**. (Note: this is narrower-padding-adjusted; before the
spacing tighten in change item 4, horizontal padding was `--space-20`/20px, giving 288px — the
tighten happened to buy back 8px of line width as a side effect.)

`--font-size-sm` = 12px, `--font-weight-medium` = 500, font stack is FKGroteskNeue/Geist/Inter
fallback (grotesque sans). Used ~6.5px/char average width for mixed-case EN body text at 12px
(conservative middle of the ~6–7px range such fonts typically render at this size/weight) and
~12px/Hangul-syllable + ~5px/space for KO (Hangul syllables render full-width regardless of the
Latin-oriented "proportional" stack).

- EN budget: 296px / 6.5px ≈ **45 chars** safe ceiling.
- KO budget: 296px / (~12px per syllable) ≈ **24 Hangul-syllable-equivalents** safe ceiling.

Chosen copy:
- EN `sharePromptHeadline`: "Send this garden to someone" — **27 characters**, ≈175.5px
  estimated width, ~120px / 41% headroom under the 296px container. This is the spec's own
  suggested example, used near-verbatim (see Deviations).
- KO `sharePromptHeadline`: "이 정원을 누군가에게 보내 보세요" — **18 characters incl. spaces**
  (14 Hangul syllables + 4 spaces), ≈188px estimated width (14×12 + 4×5), ~108px / 36%
  headroom.

Both leave enough margin that font-substitution variance (fallback stack not loading, e.g. in a
sandboxed test environment where the custom webfont fetch fails per this repo's own "Sandbox
note") would have to roughly double average char width before wrapping — very unlikely for a
grotesque sans at 12px. Old EN headline was 59 characters (definitely 2+ lines at this width);
old KO headline was 36 characters (also definitely wrapped).

Original EN also carried an em dash + "ready" framing ("Your plan is ready — send it to..."); KO
mirrored it. New copy drops the completion-announcement clause entirely rather than trying to
compress it, since the primary button ("📸 Share my garden") already carries the send/share verb
— repeating it in the headline was the main source of the length problem.

## Deviations / judgment calls

1. **Headline copy**: used the spec's own example ("Send this garden to someone") essentially
   verbatim rather than writing new copy — spec explicitly flagged this as pre-approved ("your
   own better copy welcome" = optional, not mandatory to deviate). Lowest-risk choice for a
   HIGH-tier, user-facing item.
2. **KO headline**: not a literal translation of the EN example — crafted a natural equivalent
   ("이 정원을 누군가에게 보내 보세요") that reuses the existing headline's verb ending
   (보내 보세요) for tonal continuity with copy that was already live, rather than inventing a
   new register.
3. **Spacing "one step"**: spec's example only illustrates one number changing
   ("space-16→space-12"). I read "tighten padding/gap by one step" as applying uniformly to
   *both* padding axes and the gap, since a partial tighten (e.g., only vertical padding) would
   leave the card visually lopsided and wouldn't clearly read as "one decision block." Applied:
   padding `16/20 → 12/16`, gap `12 → 8`. `margin-top` (external spacing vs. the checkout panel
   above) was left untouched — spec scopes the tighten to "internal padding/gap" only.
4. **Two new translation keys, not one**: the spec's copy example ("or copy the link") covers
   only the `doCopyLink` fallback branch. The `navigator.share` branch triggers the OS share
   sheet, not a copy — labeling it "copy the link" would be inaccurate. Added a parallel
   `shareTextLinkNative: "or share the link"` for that branch rather than reusing one string for
   both actions. Both keys added immediately after `sharePromptHeadline` in both language blocks,
   per the dispatch envelope's instruction.
5. **Element stayed a `<button>`, not `<a>`**: the class is named `gp-share-textlink` and is
   styled to look like a link, but the underlying element remains `<button type="button">`
   because both branches trigger JS (`navigator.share()` or clipboard write), not navigation. An
   anchor with no real `href` would be semantically worse. This matches how the class name reads
   ("text-*link*" as a style descriptor, not a DOM contract).
6. **Press feedback without shadow chrome**: the codebase's global "sink 1px into
   `--neuro-shadow-pressed`" press-physics convention assumes a background surface to inset into.
   `.gp-share-textlink` has no background (explicit "no button chrome" requirement), so an inset
   shadow would render as a stray box around bare text. Used `transform: translateY(1px)` alone
   on `:active` (no shadow token, no transition property — so nothing needed adding to the
   `prefers-reduced-motion` disable list, since there's no animated transition, just an instant
   state-triggered offset).
7. **Comment accuracy fix beyond the 4 numbered spec items**: the block comment directly above
   `.gp-share-prompt` (planner-styles.css) said "Two full-width buttons stack via the flex-column
   + 100%-width rules below" — now false, since there's one button and one non-full-width text
   link. Updated it in place since it's inside the exact block I was editing and left stale
   otherwise. This is a documentation-accuracy correction, not a functional/scope change.
8. **Left `shareLink` / `shareNative` / `shareLinkCopied` translation keys in place** even though
   `shareLink` and `shareNative` are now unused (superseded by `shareTextLinkCopy` /
   `shareTextLinkNative`; `shareLinkCopied` is still used, unchanged, for the "✓ Copied!" state
   per spec). Did not delete the two now-dead keys — removing them wasn't asked for by the
   spec's 4 numbered change items, and deleting translation keys carries a small risk of breaking
   an unseen call site. Flagging as an observation, not fixing: `shareLink`/`shareNative` are now
   orphaned in both `en` and `ko` blocks of `translations.js` and can be removed in a future pass
   if confirmed unused elsewhere.

## Waitlist-instrumentation observation (per spec's "Open questions" — note only, not fixed)

Confirmed: **the waitlist CTA has no analytics instrumentation at all**, at either point in the
funnel:
- The "Join the waitlist →" button (`gp-primary-cta` / `gp-primary-cta gp-checkout-cta`, two
  render sites in `planner.js`, both `onClick: function () { setWaitlistStep(1);
  setWaitlistStatus('idle'); setWaitlistOpen(true); }`) fires no `Analytics.track*` call on
  click — it only flips local React state to open the modal.
- `submitWaitlist()` (the actual Formspree POST on email submit) also fires no
  `Analytics.track*` call on success or failure.
- By contrast, `doShare`/`doCopyLink`/`doNativeShare` all call
  `Analytics.trackShareLinkCreated(...)` correctly.

Net effect: this item's acceptance criterion #2 (both demoted-link paths still fire
`share_link_created`) is verifiable and holds (see Handlers untouched, below), but the
competing "Join the waitlist" CTA that spec's Evidence section describes has zero click-through
or conversion visibility today. Per NORTH_STAR's guardrail metrics and the "no un-measurable
changes" experiment-discipline rule, this is a real gap for whatever backlog item next touches
waitlist conversion — but adding events is explicitly out of scope for 008 and was not done.

## Handlers untouched (acceptance criterion #2 trace)

`doShare`, `doCopyLink`, `doNativeShare` function bodies (planner.js ~1686–1815) were read but
not modified. Both demoted-link `onClick` props still point directly at `doNativeShare` /
`doCopyLink` (same function references as before, only the wrapping `<button>`'s `className` and
label text changed). `doCopyLink` calls `Analytics.trackShareLinkCreated({ method: 'copy', ... })`
unconditionally near the top of its body (before the clipboard write attempt); `doNativeShare`
calls `Analytics.trackShareLinkCreated({ method: 'native', ... })` unconditionally near the top
of its body (before calling `navigator.share`). Neither reads the calling element's class or
text, so this change cannot affect whether/how they fire.

## Verification run (read-only mount, per dispatch envelope)

```
node -c planner.js        → OK
node -c translations.js   → OK
node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
→ 190/190 assertions pass in test_planner.js, both parsing scripts ran clean, EXIT_CODE:0
```

Also spot-checked: no other file in the repo (`app.js`, `PoolDetail.js`, `home.html`,
`plan.html`, `stories/`) references `gp-share-btn`/`gp-share-prompt-btn` on the demoted link or
calls `t('shareLink')`/`t('shareNative')` outside this one call site — confirmed via recursive
grep (only stale files under `.worktrees/` and `.claude/worktrees/` from unrelated branches
reference the old pattern; those were not touched). CSS brace count in `planner-styles.css` is
balanced (581 open / 581 close) post-edit.
