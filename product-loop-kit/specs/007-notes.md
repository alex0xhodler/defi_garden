# 007 notes — the arrival moment (executed 2026-07-10)

## Verdict
The spec's Territory notes (007.md line 33) gave stale line numbers (`sharedPlan memo ~3286`,
etc.) — item 005 landed earlier today and shifted everything below its edits. Re-derived every
location by grep before touching anything. The central open question — does a share-link
recipient land in `'report'` or `'convo'` mode? — resolves to **`'convo'`, always, for a fresh
browser**, and the recipient reaches the `'bloom'` step (the fully-rendered, prefilled plan)
within one extra render, before a human could plausibly perceive two separate screens. That
finding is the reason the banner's CTA does nothing but dismiss (see "Design decision" below) and
is the reason the banner renders once, at the app root, rather than being duplicated into both
the report and convo branches.

## Territory findings (file:line, current state — after 005's edits, before mine)

### The mode question, answered
- `mode` is initialized at planner.js:3429 as `useState(savedPlan ? 'report' : 'convo')`. It does
  **not** depend on `sharedPlan` at all — only on `savedPlan` (planner.js:3424-3426:
  `(preset || freshFlag) ? null : loadSavedPlan()`, i.e. whatever is currently in this browser's
  `localStorage`).
- For a genuinely fresh browser (the scenario the spec's acceptance criteria actually test —
  "opening a URL produced by `encodePlanToUrl` in a fresh context"), `loadSavedPlan()`
  (planner.js:830-837) returns `null` because there is no `localStorage` entry yet. So
  `savedPlan` is `null`, and `mode` initializes to `'convo'`.
- `answers` (planner.js:3433-3438) is seeded directly from `sharedPlan` in the `useState` lazy
  initializer (`if (sharedPlan) return { goal: sharedPlan.goal, monthly: sharedPlan.monthly,
  years: sharedPlan.years, persona: sharedPlan.persona, ... }`) — synchronously, on the very
  first render, before any effect runs.
- `step` initializes to `'goal'` (`useState('goal')`), but the "shared plan fast-forward" effect
  (planner.js:3505-3515, `sharedPlayedRef`) fires on mount and its guard conditions
  (`answers.goal`, `answers.persona`, and — depending on archetype — `answers.years` OR
  `answers.capital`/`answers.monthly`) are **already satisfied** because `answers` was seeded
  from `sharedPlan` in the same render. It calls `setStep('bloom')` immediately — no staggered
  `setTimeout` sequence like the preset fast-forward (planner.js:3488-3502) uses. I confirmed
  `years` is never the blocking field: `encodePlanToUrl` (planner.js:848-867) is only ever called
  from inside `Bloom` (planner.js:1216) with `years: answers.years || 10` already defaulted
  before it reaches the URL (confirmed at the three call sites, planner.js:1750/1777/1800 —
  `doCopyLink`/`doNativeShare`/`doShare`'s `encodePlanToUrl(goal, monthly, years, ...)` where
  `years` is `Bloom`'s own prop, always `answers.years || 10` per the Planner-level call at
  planner.js:4058), so `decodePlanFromUrl` (planner.js:868-886) never produces a `sharedPlan`
  with a null `years` for a growth goal.
- Net: **`mode` stays `'convo'` for the entire session** unless the user later saves their own
  plan and explicitly clicks "My Garden" (`onShowGarden`, planner.js:4104), or already had one on
  load. A fresh share-link recipient never sees `mode === 'report'`.

### Where the shared plan's data flows
`urlParams` (planner.js:3405, memoized once with an **empty** dependency array — never
recomputed even if the URL changes later via `history.replaceState`) → `sharedPlan` memo
(planner.js:3411-3413, calls `decodePlanFromUrl`, planner.js:868-886) → `share_link_opened` fires
once (planner.js:3416-3422, unmodified by this change) → `answers` seeded from `sharedPlan`
(planner.js:3433-3438) → fast-forward effect sets `step = 'bloom'` (planner.js:3505-3515) →
`Planner`'s render picks the `else` (convo) branch at planner.js:3673 (`if (mode === 'report' &&
savedPlan)` is false, since `savedPlan` is null) → `Bloom` (planner.js:1216) mounts with
`goal/monthly/years/persona/capital/fundingMode/deadline` as props, all sourced from `answers`.

### Where a top-of-view banner actually renders
Because `mode` never becomes `'report'` for the target scenario, and because duplicating a banner
into both the `GardenReport` branch and the convo branch would double the surface area for no
benefit, I placed `ArrivalBanner` (new, planner.js:3320-3337) as a direct sibling between
`PlannerHeader` and `<main>` in `Planner`'s root return (planner.js:4097-4113, render line 4106)
— "top of the view" for whichever mode/step is currently showing underneath, computed once, no
branch duplication.

### The `plan_created` chain, traced end to end
1. Recipient opens a URL shaped like `.../plan.html?goal=retirement&pace=stable&monthly=500&years=10`
   (produced by `encodePlanToUrl`, planner.js:848-867).
2. `sharedPlan` decodes non-null (planner.js:3411-3413 / 868-886); `share_link_opened` fires once
   (planner.js:3416-3422) — **unchanged by this task**.
3. `savedPlan` is null → `mode` inits `'convo'` (planner.js:3424-3430).
4. `answers` seeded from `sharedPlan` (planner.js:3433-3438); fast-forward effect sets `step =
   'bloom'` within one render cycle (planner.js:3505-3515).
5. `Bloom` mounts (planner.js:1216) and computes `autoCurated`/`curated` from the `pools` prop
   (planner.js:1250-1290), which is `[]` until the async `POOLS_API` fetch in `Planner`
   (planner.js:~3468-3491, unmodified) resolves — this is the ONLY real-world delay in the
   whole chain, typically well under a second.
6. Once `curated.length > 0`, the persist effect (planner.js:1615-1659) runs:
   `firedPlanCreated` ref (planner.js:1615) guards a one-time
   `Analytics.trackPlanCreated({archetype, goal, monthly, years, persona})` call
   (planner.js:1622) — **unmodified by this task**, fires automatically, no user click required
   beyond having landed on `'bloom'` with pools loaded. `Analytics.trackPlanSaved` fires too, via
   the pre-existing `planSavedSignature` dedupe (planner.js:1626-1638). `savePlan(...)`
   (planner.js:1640-1659) persists to `localStorage`.
7. `Analytics.trackPlanCreated` (analytics.js:295-303) sends the `plan_created` Mixpanel event.

I verified this chain requires **zero code from this change** — it already fires correctly for a
share-link recipient purely because they reach `step === 'bloom'` automatically. This task's job
was to acknowledge the arrival, not to cause the conversion; the conversion was already wired.

### A quirk found, not touched
Once the persist effect (step 5-6 above) auto-saves the recipient's adopted plan mid-session,
`hasSavedPlan` (`!!loadSavedPlan()`, planner.js:4090) flips true and the "My Garden" header button
appears (planner.js:3295-3298, unmodified). If clicked, `onShowGarden` sets `mode = 'report'`
(planner.js:4104), but the content-branch guard at planner.js:3673 is `mode === 'report' &&
savedPlan` — and `savedPlan` is the **stale memo from mount** (planner.js:3424-3426, deps
`[preset, freshFlag]`, never recomputed), still `null` for this session. So the branch condition
is false and the view stays on the convo/bloom render rather than switching to `GardenReport`.
This is a pre-existing characteristic of the mode/savedPlan split (identical for ANY user who
saves mid-session, not share-specific), out of scope for 007, and I confirmed it doesn't cause
incorrect *banner* behavior: `showArrivalBanner`'s exclusion term `!(mode === 'report' &&
savedPlan)` stays `true` through this quirk too (since `savedPlan` stays null), so the banner's
visibility is unaffected. Flagging for the record, not fixing.

## Change made
1. **`ArrivalBanner`** (new function, planner.js:3320-3337) — a small component mirroring the
   existing `PlannerHeader`-adjacent pattern. Renders text (`t('arrivalBannerText')`) plus two
   buttons that call the **same** `onDismiss` prop: a primary `.gp-cta.gp-arrival-cta` labeled
   `t('arrivalBannerCta')`, and a small icon-only `.gp-arrival-dismiss` (✕, `aria-label:
   t('arrivalBannerDismiss')`) modeled directly on the existing `.gp-waitlist-close` pattern
   (planner-styles.css:2383-2405, read for reference, not modified).
2. **`arrivalDismissedState`** (new, planner.js:3465-3466) — a plain `useState(false)` next to
   the pre-existing `sharedIntroState` (planner.js:3459-3460), which already solves the identical
   problem for the older inline "Someone shared their garden" paragraph.
3. **`restart()`** (planner.js:3475-3486) gained one line, `setArrivalDismissed(true);`
   (planner.js:3480), immediately after the pre-existing `setShowSharedIntro(false);` — same
   justification, same place, same idiom (see "Design decision" below).
4. **`showArrivalBanner`** (new, planner.js:4091-4095) and its render (planner.js:4106), inserted
   between `PlannerHeader` and `<main>` in `Planner`'s return.
5. **Translations** — `arrivalBannerText` / `arrivalBannerCta` / `arrivalBannerDismiss`, EN
   (translations.js:204-206) and KO (translations.js:678-680), both inserted immediately after
   `checkoutNote` (203 / 677) and before `riskEdit` (207 / 681), per the anchor rule — verified
   005's `sharePromptHeadline` key (translations.js:294 EN / 760 KO, at the *end* of each block)
   is untouched, and that `en.planner`/`ko.planner` have equal key counts (292 each) after my
   edit, confirming no accidental key collisions or overwrites.
6. **CSS** — `.gp-arrival-banner/-text/-actions/-cta/-dismiss` (planner-styles.css:88-133,
   inserted between `.gp-main` and `.gp-tagline`) plus one line, `.gp-arrival-dismiss,`, added to
   the existing shared reduced-motion `transition: none` selector list (planner-styles.css:1708,
   inside the block starting at 1692).

## Design decision: the CTA and the dismiss button do the same thing
The spec asks for "a single CTA that moves them into/along their prefilled plan." Given the
territory finding above — a fresh recipient is *already* on the fast-forwarded `'bloom'` step,
with their full prefilled plan rendered directly beneath where the banner sits — there is no
separate "pre-plan" screen left to navigate them to. "Moving them into their plan" can only mean
getting the banner out of the way so they can see and use what's already rendered. I considered
inventing a differentiated CTA action (`scrollIntoView` on the checkout column, a fake "claimed"
flag) and rejected it: there is no "claimed" concept anywhere in the data model to attach a flag
to, and a scroll-to action would require threading a ref from `Bloom` up through `Planner` across
a component boundary for a screen that (per the CSS, `.gp-bloom-checkout` is "first-on-page on
mobile" and not clipped on desktop) is already visible without scrolling in the common case. Both
options add real surface area and risk for a "single CTA" the spec explicitly asked to keep
minimal. So both buttons call the same `onDismiss` prop — the primary button carries the
adoption-framed label (`t('arrivalBannerCta')`, "Make it mine"), the small ✕ is the neutral
escape hatch, matching the existing waitlist-modal convention of pairing a labeled primary action
with an unlabeled ✕ close.

## Deviations from spec and why
- **Banner placed at the `gp-app` root (sibling of `PlannerHeader` and `<main>`), not inside
  `<main>` or duplicated into both the report and convo render branches.** The spec's own
  Territory-notes instruction was to "place the banner in the real path" after investigating —
  the investigation showed the real path is always the convo branch for the target scenario, but
  a returning user who *also* opens someone else's share link (see next bullet) technically can
  reach the report branch with `sharedPlan` still truthy. A single root-level placement handles
  both without duplication and without needing to know which branch is active.
- **Added an exclusion term beyond the four scenarios the spec named verbatim** ("normal visits,
  presets, `?fresh=1`, returning users loading their own saved plan"). A returning user who has
  their OWN saved plan (so `savedPlan` is truthy, `mode` inits `'report'`) and *also* opens a
  friend's share link in the same browser session is not literally one of those four bullets, but
  is a direct logical member of "returning users loading their own saved plan" — because the
  report branch (planner.js:3673, `if (mode === 'report' && savedPlan)`) renders `plan:
  savedPlan` (their own data) and never reads `sharedPlan`/`answers` at all. Showing "someone sent
  you this garden" over the user's own unrelated report would be describing the wrong plan. Fixed
  via `showArrivalBanner = !!sharedPlan && !arrivalDismissed && !(mode === 'report' &&
  savedPlan)` (planner.js:4095) rather than the naive `!!sharedPlan && !arrivalDismissed`.
- **`restart()` now also dismisses the banner**, not named in the spec's four scenarios either.
  `canRestart` is `true` at `step === 'bloom'` (planner.js:4089) — exactly where every share-link
  recipient lands — so "Start Fresh" is a mainline, one-click-away action for the primary target
  user, not a deep edge case. Without this, `sharedPlan` (memoized once, never recomputed even
  though `restart()` strips the URL params via `history.replaceState`) would keep the banner
  alive after a user explicitly wiped their plan, directly contradicting the action they just
  took. I judged this a correctness requirement of "never show it to returning users / users who
  just started fresh," not scope creep — it's a one-line addition reusing the identical
  `setShowSharedIntro(false)`-adjacent pattern already established in the same function.
- **Known, accepted, un-fixed gap**: if a returning user (own saved plan) opens a friend's share
  link, then clicks "Tend"/"Edit" on their OWN report (`onTend`/`onEdit`,
  planner.js:3678-3687 — restores `answers` from `savedPlan`, sets `mode = 'convo'`), the banner
  can reappear over their now-editing-their-own-plan session, because `sharedPlan` is still
  truthy and `arrivalDismissed` may still be `false`. This requires three stacked conditions
  (own saved plan + also opened someone else's link + then edits their own plan) and I judged it
  narrow enough not to justify patching `onTend`/`onEdit` (which live inside the `GardenReport`
  render block, outside this change's touched surface) for a HIGH-risk item whose spec asks for
  the smallest change. Documented here rather than silently left for a future report to
  rediscover.

## Conservative choices
- Zero changes to `encodePlanToUrl`, `decodePlanFromUrl`, router/URL semantics, `Analytics.*`
  (no new events, no changed firing conditions for `share_link_opened` or `plan_created`), or any
  trust-rail surface (`APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly flags, degen haircut) — none
  of those files/functions appear in the diff at all.
- Zero changes to `sharedPlanIntro` (the existing inline "Someone shared their garden — make it
  yours" paragraph, planner.js — still rendered via `showSharedIntro` inside the `Bloom` step
  bubble) even though it now sits close to the new banner and reads similarly. Consolidating the
  two wasn't asked for, touches render logic used in two places, and the redundancy is minor and
  cosmetic — flagging it rather than acting on it unasked.
- Reused `.gp-cta` (existing button styles, existing reduced-motion coverage) for the CTA instead
  of hand-rolling new button visuals; reused `.gp-animate-in` (existing entrance animation,
  existing reduced-motion coverage) for the banner's entrance instead of writing new keyframes.
  Only one genuinely new interactive element (`.gp-arrival-dismiss`) needed its own
  reduced-motion line, added to the existing shared list rather than a new media-query block.
- No exit/dismiss animation was added — dismissal is an instant unmount (conditional render
  returns `null`). This trivially satisfies "respects `prefers-reduced-motion`" (nothing animates
  on the way out) and avoids a transient "closing" state that would add complexity for no
  requested benefit.
- No new dependencies, no new files besides these two spec docs, no touches to `BACKLOG.md`,
  `LOG.md`, `telegram-bot/`, `whatsapp-bot/`, `workers/`, or any git operation.

## Verification
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` — all
  three exit 0 (verified both via the `&&` chain and individually). `test_planner.js`: 190/190
  assertions, zero `✗` markers.
- `node -e "require('./translations.js')"` — loads cleanly; directly enumerated
  `en.planner`/`ko.planner` and confirmed exactly `arrivalBannerText`, `arrivalBannerCta`,
  `arrivalBannerDismiss` are present in both, with the intended copy, and that `sharePromptHeadline`
  (005's key) is untouched.
- `node -e "require('./planner.js')"` — loads cleanly (36 API keys exposed, matching the
  pre-existing `module.exports` surface — I did not add anything to it), which also proves no
  `SyntaxError` in the new `ArrivalBanner` function or the modified `Planner` body (a syntax error
  anywhere in the file would have made this throw, and would have failed `test_planner.js` too).
- Brace-balance check on `planner-styles.css`: 577 open / 577 close, matched.
- `grep`-verified: no duplicate keys introduced, `sharePromptHeadline` (005) untouched, all five
  new `gp-arrival-*` CSS selectors present exactly once each.
- **Not independently browser/screenshot-verified** — consistent with 005's precedent, no
  browser automation was available/appropriate in this environment (bash mount is read-only and
  isolated from the host; this task's own environment facts explicitly exclude
  `npm test`/`test_smoke.js`/Playwright). See the final summary for exact URLs and scenarios for
  human visual spot-check across 360/768/1280px, dark mode, and reduced motion.
