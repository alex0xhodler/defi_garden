# Spec 009 — build notes

Builder: Sonnet 5 (build-loop iteration). Territory: `analytics.js` Garden Planner Analytics
section (~293–349), `planner.js` waitlist CTA `onClick`(s) + `submitWaitlist()`. Files touched:
exactly these two. No git operations performed (per dispatch envelope); working-tree edits only.

## Call sites (post-edit line numbers, verified by reading the file after editing)

### analytics.js

- `trackWaitlistOpened(context = {})` — lines 334–340. Fires `waitlist_opened` with
  `{ goal, persona, archetype }`, each `|| null`-guarded exactly like `trackPlanCreated`/
  `trackShareLinkOpened` immediately above it in the same section.
- `trackWaitlistSubmitted(context = {})` — lines 342–349. Fires `waitlist_submitted` with
  `{ goal, persona, archetype, success }`; `success: !!context.success` coerces to a strict
  boolean (spec's own wording: "success boolean") rather than defaulting truthy on omission.

### planner.js — open (`setWaitlistOpen(true)`) sites

Two call sites exist in source (both inside `Bloom(props)`; confirmed via
`grep 'setWaitlistOpen('` across the whole file returning exactly 2 `(true)` hits and 3 `(false)`
hits — no toggle or functional-update forms exist):

1. `ctaElement` (var declared line 2316, button `className: 'gp-primary-cta'`, label
   `t('ctaWaitlist')`). `onClick` body at 2320–2325 (opens at 2320, `Analytics.trackWaitlistOpened`
   call at line 2325).
2. `checkoutPanelElement` (var declared line 2527, button `className: 'gp-primary-cta
   gp-checkout-cta'`). `onClick` body at 2559–2564 (`Analytics.trackWaitlistOpened` call at line
   2564).

Both got identical 3-line additions via one `replace_all` Edit — the two handler bodies were
byte-for-byte identical pre-edit (confirmed by reading both before touching either), so there is
no risk of the two sites drifting out of sync with each other.

### planner.js — submit (`submitWaitlist()`, Formspree response) sites

`submitWaitlist(ev)` starts at line 1530. Its `fetch('https://formspree.io/f/xzdqygjn', ...)`
call (line 1556) is the only Formspree POST in the file. Three mutually-exclusive resolution
branches, each now ending in a `trackWaitlistSubmitted` call:

- `.then` / `res.ok` branch (success path) — line 1566, `success: true`.
- `.then` / `else` branch (Formspree responded, non-2xx) — line 1571, `success: false`.
- `.catch` branch (fetch threw — network/CORS failure) — line 1577, `success: false`.

## Once-per-open / once-per-submit reasoning

**Opened:** each `Analytics.trackWaitlistOpened` call is the last statement inside its `onClick`
handler, so it only runs when a user actually clicks that specific button (standard React
synthetic-event semantics: one invocation per click, no re-fire on re-render). It is deliberately
not hoisted into a `useEffect` watching `waitlistOpen` — the spec's own phrasing ("the
`setWaitlistOpen(true)` site(s)") points at the call sites directly. Since there are exactly two
source call sites and each fires only from its own handler, each click of either button fires the
event exactly once.

**Important finding — one of the two open sites is dead code.** Tracing render reachability
(`grep '\bctaElement\b'` returns only its own declaration at line 2316 — it is never referenced
again anywhere in the file), `ctaElement` is built but never inserted into the tree `Bloom`
actually returns. Both of `Bloom`'s `return` statements — the `archetype === 'subscription'`
branch (line 2598) and the growth/target fallback (line 2613) — put `checkoutPanelElement` (not
`ctaElement`) into `.gp-bloom-checkout` (lines 2602 and 2616 respectively). So today, only
`checkoutPanelElement`'s button can ever actually reach the DOM and fire `waitlist_opened`;
`ctaElement`'s copy of the handler is inert. **This is a pre-existing condition, not introduced by
this change** — confirmed by reading `ctaElement`'s definition (comment: "CTA element (shared) —
opens waitlist modal") against actual usage, which shows it was superseded by
`checkoutPanelElement` at some earlier point and never removed.

I instrumented `ctaElement`'s handler anyway rather than skip it, because: (a) the spec explicitly
anticipates this exact shape — "if multiple open paths exist, instrument each" — and there *are*
two call sites in source, live-reachability aside; (b) doing so is zero-risk, since dead code stays
dead and adds no behavior; (c) it costs nothing if `ctaElement` is ever wired back into the render
tree later — the tracking would already be there. I did **not** delete `ctaElement` or wire it into
the render tree myself — that would be a UI/structural change outside this item's binding scope
("NO UI... changes", "no scope creep, no second item"). Flagging as an observation for a future
backlog item, not fixing it here.

**Submitted:** `submitWaitlist()` only reaches the `fetch(...)` call (and therefore only ever
resolves into one of the three branches above) if `waitlistEmail.trim()` is non-empty (line 1532,
a pre-existing early-return guard, untouched by this change). That guard runs before any network
call, so there is nothing to report there — no Formspree response exists yet to describe. This is
consistent with the spec's own scoping ("`trackWaitlistSubmitted` ... from `submitWaitlist()`'s
Formspree response handling," not from the top of the function). Once the fetch is in flight, the
three branches (`res.ok`, `res` not ok, thrown/rejected) are mutually-exclusive promise-resolution
paths — exactly one executes per call to `submitWaitlist()` that reaches the network — so exactly
one `trackWaitlistSubmitted` fires per real submit attempt, with `success` matching whichever
branch ran.

## Deviations / judgment calls

1. **Two wrapper methods added to `analytics.js`**, matching `trackPlanCreated`'s exact shape
   (`context = {}` default param, `|| null` per-field fallback, single `this.track(eventName,
   {...})` call) — spec said "ONLY if the established pattern requires it." Every other Garden
   Planner event in this file goes through a named wrapper (no bare `Analytics.track(...)` call
   site exists anywhere in `planner.js`), so the pattern does require it.
2. **`success: !!context.success`** rather than `context.success !== undefined ?
   context.success : true` (the precedent set by `trackEngagement`, line 251 in the pre-edit
   file). Chose strict coercion over default-true because every call site here always passes an
   explicit `true`/`false` — there's no legitimate "omitted" case to default — and silently
   defaulting a missing value to `true` for a field literally named `success` seemed like the
   wrong failure mode if some future call site ever forgot to pass it.
3. **Analytics calls placed as the last statement in each branch/handler**, after the existing
   `setState` calls, rather than reordered to the top. This minimizes the diff (pure appends, no
   reordering of existing lines) and matches one of two existing orderings already in this file
   (`doShare()`'s `.then()` handler calls `Analytics.trackShareLinkCreated` after `setSharing(false)`;
   the other ordering — Analytics-call-before-action, used by `doCopyLink`/`doNativeShare` — applies
   when there's no async response to wait for, which doesn't fit here). State setters don't throw
   and don't affect what `Analytics.track` reports, so ordering has no behavioral effect either way.
4. **`ctaElement`'s dead-code status**: observed and documented above, not fixed. Out of scope for
   a 40-line-budget, instrumentation-only item; flagged for a future backlog item to either wire it
   up or delete it.

## Verification run (read-only mount, per dispatch envelope)

```
node -c analytics.js   → OK
node -c planner.js     → OK
node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js
→ 190/190 assertions pass in test_planner.js, both parsing scripts ran clean, EXIT_CODE:0
```

## Diff size

- `analytics.js`: +17 lines (two new wrapper methods), 0 removed.
- `planner.js`: +6 lines (two open sites, 3 lines each, applied via one `replace_all` Edit) + 9
  lines (three submit-response branches, 3 lines each) = +15 lines, 0 removed.
- Total: **+32 lines, -0, across 2 files** — under the 40-line budget. No file besides
  `analytics.js`/`planner.js` was touched; `translations.js` and all CSS files are untouched
  (verified: neither appears in either Edit call above).
