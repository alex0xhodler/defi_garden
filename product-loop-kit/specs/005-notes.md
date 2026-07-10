# 005 notes — one share hub at bloom, image-first, link always travels (executed 2026-07-10)

## Verdict
Confirmed both problems in the spec's evidence by reading the code, not just trusting the
screenshot description:
1. **Redundant surfaces.** Bloom rendered TWO independent share UIs simultaneously: the 004
   `sharePromptElement` card (one button: native-or-copy-link) inside `.gp-bloom-checkout`, AND
   `footElement`'s three-button `.gp-share-row` (image / copy / native) at the very bottom of
   the tree. Fixed by making the prompt card the only surface.
2. **The image never carried a URL.** `renderShareImage` (pre-edit) had exactly one completion
   behavior regardless of caller: draw the canvas, `toBlob`, build a hidden `<a download>`,
   click it, revoke the object URL, `resolve()` with no value. Nothing in `doShare` ever called
   `encodePlanToUrl`. "📸 Share my garden" has only ever meant "download a PNG with no link
   attached" — structurally incapable of producing a `share_link_opened` on the receiving end.

## Territory findings (file:line, pre-edit — before any of today's changes)
- `doShare`, pre-edit planner.js:1681-1744 (inside `function Bloom(props)`, planner.js:1216):
  builds an archetype-specific `shareHeadline`/`shareSubline`/`shareDrawChart`, then calls
  `renderShareImage({...})` with NO `url` property, `.then(() => setSharing(false))`.
- `renderShareImage`, pre-edit planner.js:2754-2888. Everything through line 2875 (canvas
  sizing ×2 scale, gradient background, rounded "card" with shadow, optional growth-curve
  chart, headline text-fit/wrap logic, subline, `defi.garden 🌱` wordmark, footer) is pure
  canvas drawing and untouched by this change. The ONLY thing that happens at completion
  (pre-edit lines 2876-2886): `c.toBlob(cb)` → `URL.createObjectURL(blob)` → build `<a
  download="my-defi-garden.png">` → `.click()` → revoke after 1s → `resolve()`. No native
  share, no clipboard, no return value passed to the caller.
- Two call sites, pre-edit: `doShare` (planner.js:1735) and `doWaitlistDownload`
  (planner.js:1597, the waitlist panel's "download card" button — spec explicitly OUT of
  scope: "waitlist/checkout panel changes"). Neither passed a URL or anything resembling one.
- `doCopyLink` planner.js:1746-1767 and `doNativeShare` planner.js:1769-1795 (pre-edit, now
  shifted but bodies byte-for-byte unchanged): both already call
  `encodePlanToUrl(goal, monthly, years, persona, props.capital, props.fundingMode,
  props.deadline)` and both already fire `Analytics.trackShareLinkCreated({method:...})`
  **unconditionally, at click time**, before attempting the clipboard write / before the OS
  share sheet resolves. This is the existing, already-shipped, NORTH_STAR-blessed
  ("share pipeline code-audited sound end-to-end", 2026-07-10 standing decision) precedent —
  see "Design decision: image's analytics gating is intentionally asymmetric" below for why I
  did NOT copy this exact firing behavior for the new image path.
- `Analytics.trackShareLinkCreated` (analytics.js:317-323, read-only, NOT modified):
  `this.track('share_link_created', { method: context.method || 'copy', goal, persona })` — no
  enum validation on `method`, so `'image'` requires zero analytics.js changes.
- Confirmed via grep there is no other consumer of `.gp-share-row` / `.gp-share-link` anywhere
  in the repo (planner.js and planner-styles.css were the only two files referencing them) —
  safe to delete both CSS rules as direct cleanup of the JSX removal, not a drive-by refactor.

## Change made
1. **`sharePromptElement`** (now planner.js:2560-2580) gained a PRIMARY button before the
   existing secondary one: `onClick: doShare, disabled: isSharing`, label cycles
   `t('sharePrepping')` ("Drawing…") while rendering → `'✓ ' + t('shareImageSaved')` (new key)
   after the non-native fallback path confirms the link copied → idle `'📸 ' + t('share')`
   ("Share my garden"). Reuses the exact `sharePrepping`/`share` keys the OLD footer button
   already used. Secondary button (native-or-copy-link) is verbatim unchanged from 004.
   No new CSS: `.gp-share-prompt` was already `display:flex; flex-direction:column`
   (planner-styles.css) and `.gp-share-prompt-btn{width:100%}` already applied
   unconditionally — a second full-width button just stacks below the first with the existing
   `gap: var(--space-12)`. Verified by reading the CSS, not assumed.
2. **`footElement`** (now planner.js:2347-2359) lost its `.gp-share-row` div (3 buttons)
   entirely. Kept `gp-disclaimer` and `gp-press-mention` ("As featured on Leviathan News",
   translations.js:282-283/742-743) verbatim, per the spec's explicit instruction to keep
   unrelated footer content.
3. **`doShare`** (now planner.js:1686-1764): one new line computes
   `shareUrl = encodePlanToUrl(...)` — identical call signature to `doCopyLink`/
   `doNativeShare`. Fires `Analytics.trackShareLinkCreated({method:'image',...})` **only**
   inside the `renderShareImage(...).then(function(result) {...})` callback, gated on
   `result.linkAttached === true` (see design-decision note below). Also flips new state
   `imageShareConfirm` (2.5s auto-reset, same shape as the existing 2s `copySuccess`) but only
   when `result.method === 'download'` — a successful native file-share needs no in-app
   banner because the OS share sheet already gave the user one (matches `doNativeShare`, which
   has never shown an in-app confirmation either).
4. **`renderShareImage`'s completion path ONLY** (planner.js:2893-2958 in final state).
   Everything above `c.toBlob(...)` — i.e. all canvas drawing — is byte-for-byte unchanged;
   verified with `diff`-by-eye against the pre-edit read. Extended the `c.toBlob` callback:
   - `!opts.url` → identical to the original 5 lines (now factored into a local
     `downloadImage()` closure for reuse), `resolve()` with no value. This is the exact path
     `doWaitlistDownload` still takes — confirmed unchanged by re-reading that call site after
     editing.
   - `opts.url` present + `navigator.share` + `navigator.canShare({files:[...]})` all truthy →
     build a `File` from the blob, `navigator.share({files, url, title, text})` wrapped in
     try/catch (see robustness fix below). Resolves `{linkAttached:true, method:'native'}` on
     success, `{linkAttached:false, method:'native'}` on cancel/reject/throw.
   - `opts.url` present, no file-share support → same download as the `!opts.url` path, THEN
     `navigator.clipboard.writeText(opts.url)` with the exact same `<textarea>` +
     `execCommand('copy')` fallback shape `doCopyLink` already uses (mirrored inline, not
     extracted into a shared helper — kept the diff local to the one function I was told to
     extend, per "extend the completion path, don't rewrite renderShareImage"). Resolves
     `{linkAttached:true, method:'download'}` if either clipboard mechanism succeeds,
     `{linkAttached:false, method:'download'}` only if both throw/reject.

## Design decision: image's analytics gating is intentionally asymmetric vs. copy/native
The task's own instructions (not just 005.md) say: *"fire Analytics.trackShareLinkCreated with
method 'image' when the image path completes with the URL attached (plus existing
'copy'/'native' paths unchanged)."* That is explicit, specific gating language for the new
method, paired with an explicit instruction to leave copy/native's firing behavior untouched.
So `doCopyLink`/`doNativeShare` keep firing unconditionally at click time (unchanged), while
`doShare` fires only when `result.linkAttached` is true.

I considered making all three symmetric (fire 'image' unconditionally at click time, matching
the sibling functions, before even knowing if the canvas finishes or the share attempt
succeeds) for internal consistency. I rejected it: for the no-native-file-share fallback branch
specifically, the "share" IS the clipboard write — firing before attempting it would record
`method:'image'` (implying the link was carried) even on a total clipboard failure, which is
actively worse than the status quo for a metric whose entire purpose is to seed a
`share_link_opened` funnel that a doomed row can never satisfy. This also happens to be the
literal instruction. Flagging clearly because it means the three methods do NOT measure
identical things (copy/native = "user clicked"; image = "artifact + link actually left the
device"), and a from-the-metrics-alone read of weekly `share_link_created` by method should
account for that if/when someone analyzes it.

## Robustness fix found during self-review
Initial version of the native-file-share branch called `navigator.share({files,url,title,text})`
without a try/catch around the call itself (only `.then()/.catch()` on the returned promise).
`navigator.share()` can throw *synchronously* (not just reject) for some invalid/unshareable
payload combinations, per spec. Since the outer `new Promise` executor's `c.toBlob` callback
is invoked outside any try/catch that could reach it, an uncaught synchronous throw there would
mean `resolve`/`reject` are never called — the returned promise hangs forever, and since
`isSharing` gates `disabled` on that promise settling, the share button would get stuck
disabled ("Drawing…") until page reload. Added a try/catch around the `navigator.share(...)`
call itself (planner.js:2925-2936) so the promise always settles. `doNativeShare` (unmodified,
pre-existing) has this same unguarded-call shape and I did not touch it — it's out of scope,
and its failure mode there is "uncaught exception in an onClick handler" rather than "a
disabled button stuck forever," because nothing in `doNativeShare`'s call site awaits its
result to un-disable anything.

## Deviations from spec and why
- **Confirmation UI is a button-label toggle, not a new element.** Spec says show "'Image
  saved — link copied' style confirmation." I reused the exact toggle idiom `doCopyLink`
  already established (`copySuccess ? '✓ ' + t('shareLinkCopied') : ...`) rather than adding a
  toast/banner/new DOM node. Zero new CSS, zero new layout risk, same idiom a returning user
  has already seen on the secondary button.
- **No confirmation shown for the native-file-share success path.** Spec's example text
  ("Image saved — link copied") describes the fallback (no native file support) case
  specifically — a native share sheet completing is its own confirmation (the OS UI closing IS
  the feedback), matching how `doNativeShare` has never shown an in-app confirmation either. I
  did not invent one for consistency with existing product behavior.
- **`shareText` sent to `navigator.share` reuses the already-computed `shareHeadline`**, not a
  new, separate "one short line" string. It already IS one short line (e.g. "My retirement is
  buying itself — by Jan 2031 🤯"), and it's the same line printed on the shared image itself,
  so the OS share-sheet preview text and the image content agree. Minted no new copy for this.
- **`.gp-share-row` / `.gp-share-link` CSS rules deleted**, not just their JSX. The spec doesn't
  say to touch CSS, but leaving two fully-orphaned rules (confirmed via repo-wide grep — no
  other consumer) tied 1:1 to the exact JSX removed in this same change is the direct, correct
  cleanup of what I removed, not a drive-by refactor of unrelated code. Left the ≤400px
  `.gp-share-btn { width: 100% }` media-query rule alone even though it's now redundant
  (`.gp-share-prompt-btn` already forces 100% at all sizes) — redundant-but-harmless, and
  removing it carries a small non-zero risk for zero visible benefit.
- **Did not extract a shared "copy to clipboard with textarea fallback" helper** even though
  the logic now exists in two places (`doCopyLink` and `renderShareImage`'s new completion
  branch). Mirroring inline keeps the diff local to exactly the two places the task named
  (`doShare`'s call site and `renderShareImage`'s completion path) and avoids touching
  `doCopyLink`'s already-audited-sound body at all.

## Conservative choices
- Zero changes to `doCopyLink`, `doNativeShare`, `analytics.js`, `home.html`, router/URL
  semantics, waitlist/checkout panel behavior (`doWaitlistDownload`/`doWaitlistShare`
  untouched, confirmed by re-reading their call sites after editing), or any trust-rail
  surface. Confirmed by diff scope: only `planner.js`, `planner-styles.css`, `translations.js`
  touched.
- All canvas-drawing code in `renderShareImage` (everything before the `c.toBlob` call) is
  untouched — only its completion callback was extended, per the task's explicit instruction.
- No new dependencies. No new user-facing strings beyond the one confirmation key
  (`shareImageSaved`, EN+KO) — every button label reuses existing translation keys.
- No new CSS classes. Two comment-only updates in planner-styles.css (accuracy, not behavior).
- Diff size: ~9 lines translations.js (both langs), ~11 lines net in planner-styles.css (a
  -13-line dead-code removal + a 6-line comment rewrite), ~90 lines net in planner.js (mostly
  the new completion-path branching in `renderShareImage`, which is inherently the bulk of the
  actual feature).

## Verification
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` — all
  three exit 0, individually confirmed (not just via `&&` chaining). `test_planner.js`: 190/190
  assertions passed, zero `✗` markers. Re-run after every edit in this session, including after
  the post-self-review robustness fix; last run clean.
- `node -c planner.js` and `node -c translations.js` — both syntax-valid.
- `node -e "require('./translations.js')"` — loads cleanly; confirmed both new
  `planner.shareImageSaved` keys resolve to the expected EN/KO strings via the module export.
- Brace-balance check on `planner-styles.css` (567 open / 567 close) — sane after the deletion.
- grep-verified structurally: `doShare`/`doCopyLink`/`doNativeShare` each have exactly ONE
  `onClick` wiring in the whole file (all three inside `sharePromptElement`) — no orphan
  handlers. `gp-share-row`/`gp-share-link` have zero remaining references anywhere in the repo.
  `footElement` and `sharePromptElement` are each still referenced in both bloom return
  branches (subscription; target/growth) — neither branch lost its share surface.
- No new test file was written. This change adds no new pure/testable helper function — it's
  React markup + browser-only APIs (`canvas`, `Blob`, `File`, `navigator.share`,
  `navigator.clipboard`) that the existing plain-Node test harness cannot exercise (matches
  004's precedent and the architecture note that verification here is Playwright/E2E, not unit
  tests). No pure function in the `module.exports` surface was touched.
- **Not independently browser/screenshot-verified** — no browser tool was available in this
  environment. See the final summary for exactly what a human should eyeball on production,
  across both the native-share-capable path (mobile Safari/Chrome) and the fallback path
  (desktop browsers without file-share support), plus 360/768/1280px and dark mode.
