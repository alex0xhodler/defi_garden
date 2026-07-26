# Spec 146 build notes — post-waitlist share path archetype fix

## Summary of change

- `planner.js` `mixStats()` (root cause): the `GOALS` fallback now only resolves an id
  when `g.isMonthly === true` (was: any goal with a numeric `target`). This is the fix
  that stops `iphone`'s one-time `$1,100` item price from being read as `$1,100/mo`.
- `planner.js` mix-seed `useEffect` (~1684): gated on `archetype === 'subscription'`.
  TARGET/GROWTH plans no longer seed `selectedSubs`, so `currentMixStats` stays empty
  for them instead of carrying a bogus bundle from first render.
- `planner.js`: extracted `buildShareCopy()` from `doShare()`'s archetype branch
  (headline/subline/rowLabel/featured/drawChart). `doShare()` now calls it — same
  code, only moved, output byte-identical (see AC verification below).
- `planner.js` `doWaitlistShare()` / `doWaitlistDownload()`: archetype-branched.
  TARGET/GROWTH now calls `buildShareCopy()` (the fix). SUBSCRIPTION keeps its
  original `selectedSubs`-derived bundle logic **verbatim** (see Deviation #1 below —
  this is NOT what item 3 of the spec literally asked for, and the reason is
  load-bearing).
- `planner.js` `doWaitlistDownload()`: now passes `url: encodePlanToUrl(...)` and
  `shareText: headline` (same argument list `doShare` uses), and fires
  `Analytics.trackShareLinkCreated({ method: 'waitlist_card', ... })` when the link
  attaches.
- `planner.js` waitlist email `msgSummary`: branches by archetype. Subscription
  keeps the "covers X (~$Y/mo) for ~$Z, risk R" string verbatim (raw-id fallback
  fixed to `goalLabel(t, id)`). TARGET/GROWTH gets an honest plain-English summary
  (`"<goal> plan: ~$X capital, risk R"` or `"...~$X/mo for N yrs, risk R"`). Left
  untranslated per spec item 6 (operator-only Formspree payload, not user-facing UI).
- `translations.js`: added ONE new key pair, `shareTweetGeneric` (EN + KO) — wraps
  the archetype-correct headline for the TARGET/GROWTH tweet, since `shareTweet` is
  hardcoded subscription phrasing ("My yield pays for X — forever").
- `package.json`: appended `node test_waitlist_share_archetype.js` to the `test` script.
- Regenerated `planner.min.js` / `translations.min.js` via `npm run minify`.
- New file: `test_waitlist_share_archetype.js` (Playwright, real rendered UI).

## Deviations from the spec, and why (data, not failures)

### Deviation #1 — SUBSCRIPTION does NOT route through `buildShareCopy()` (item 3, partial)

Spec item 3 says: "lift the archetype branch inside `doShare()` into a single helper
... and call it from **doShare, doWaitlistDownload and doWaitlistShare**." My first
implementation did exactly that — all three call sites called `buildShareCopy()`
unconditionally.

**The orchestrator caught a real bug in that approach before I finished** (see its
message mid-build): `doShare()`'s subscription-capital branch derives its bundle
from `coveredBundle(subCapital, apy, goal)` — i.e. "every ladder rung the parked
capital's yield can already cover," walked from an anchored, price-sorted ladder.
The **pre-146** `doWaitlistShare`/`doWaitlistDownload` derived their bundle from
`selectedSubs` — i.e. "exactly what the user toggled on in the mix UI." These are
different data sources that happen to coincide ONLY when the mix is untouched
(`selectedSubs === [goal]`, the default/first-arrival state) **and** the parked
capital doesn't happen to also cover cheaper rungs beyond the anchor. The moment a
user manually toggles an extra service into the mix (e.g. adds Spotify without the
capital yet covering Spotify's forever number too), `coveredBundle` and
`selectedSubs` diverge — `coveredBundle` would still show "Claude Pro" alone while
the user's actual pick was "Claude Pro + Spotify."

Routing SUBSCRIPTION through `buildShareCopy()` would have been a **real, silent
regression** on an already-correct path, directly violating AC3's "SUBSCRIPTION path
is unchanged." I verified this concretely (not just reasoned about it) — see the
AC3b test below.

**Resolution (the conservative choice)**: `doWaitlistShare`/`doWaitlistDownload` now
branch explicitly — `archetype === 'subscription'` keeps the original
`selectedSubs`-based computation **byte-for-byte** (only the raw-id fallback bug,
item 5, is fixed inside it); every other archetype calls `buildShareCopy()`. This
satisfies the REUSE directive for the part of the code that was actually broken
(TARGET/GROWTH — the entire point of this spec) while giving the strongest possible
guarantee that the already-correct SUBSCRIPTION path is untouched, for **any** mix
state, not just the one input the AC3 test happens to exercise.

I added a second test case, `AC3b`, that manually toggles Spotify into the mix
before opening the waitlist and asserts the card/tweet reflect the full
`["Claude Pro", "Spotify"]` selection — the exact scenario the orchestrator flagged.
It passes post-fix, and I additionally ran it (see "AC6 verification" below) against
a truly unmodified `planner.js`/`translations.js` (via `git stash`) with a neutered
`clickDownload` helper (see Deviation #2) to confirm the toggled-mix output is
byte-identical pre/post — not merely "the test happens to pass."

### Deviation #2 — none functionally, but a test-harness note

`clickDownload()` in the new test waits for `window.__copiedUrl !== null` after
clicking Download. Pre-fix, `doWaitlistDownload` never attaches a URL at all (that's
the AC5 bug), so this wait **times out** on baseline runs (`page.waitForFunction:
Timeout 30000ms exceeded` / `5000ms exceeded` depending on Playwright's own
action-timeout vs. the explicit one). That's expected and is itself evidence of the
bug — but it makes the *content* of AC1/AC3/AC3b hard to observe on baseline within
the test's normal flow. For the two isolated baseline-content proofs described below
I used a throwaway copy of the test file with `clickDownload` changed to
`await page.waitForTimeout(800)` instead of waiting on `copiedUrl`, so the canvas
strings could still be read even though no URL was ever attached. That temp file was
never committed (created under `git stash`, deleted immediately after each probe;
confirmed absent via `git status` afterward).

### Deviation #3 — capital chosen so SUBSCRIPTION math is provably stable, not "coincidentally passing"

For AC3's base case (`goal=claude`, no mix toggle) I reused the same
`?capital=5000&fm=capital` URL pattern `test_subscription_mix_seed.js` already uses.
I initially worried the exact capital value mattered for byte-identical output, but
traced the code and found: `planner.js`'s existing (pre-146, untouched) `useEffect`
at ~1708 — "Keep slideCapital in sync with the LIVE-APY coverage the mix implies" —
**always** resyncs `slideCapital` to `currentMixStats.neededCapital` whenever
`archetype === 'subscription' && isCapitalPath`, regardless of what capital was
passed in the URL. So for an untouched single-anchor mix, `subCapital` is *forced*
equal to the anchor's own forever-number (rounded to the nearest $100) — this holds
for any starting `?capital=`, not just the value I picked. Confirmed empirically
(the exact figures below match the formula). No spec deviation here, just recording
the reasoning so the "why does this exact number work" question doesn't need
re-deriving later.

## Judgment calls (conservative choice at each)

1. **buildShareCopy() scope**: extracted exactly what `doShare()` had (4-branch
   archetype switch), no new branches invented, no signature beyond the 5 fields the
   spec named (`headline, subline, rowLabel, featured, drawChart`).
2. **SUBSCRIPTION reuse vs. correctness** (Deviation #1): chose correctness
   (byte-identical, provable for any mix state) over the more literal "one helper,
   three call sites" reading. This is the single largest judgment call in this diff;
   flagged clearly above and empirically verified.
3. **New translation key**: added exactly one pair (`shareTweetGeneric`), matching
   the spec's "at most ONE new key pair is expected." Wraps the already-computed,
   already-translated headline rather than inventing new interpolation logic.
4. **msgSummary wording for TARGET/GROWTH**: spec said "honest plain-English
   summary... goal label + capital or monthly×years + risk," left untranslated. I
   wrote `"<goal label> plan: ~$X capital, risk <R>"` / `"...~$X/mo for N yrs, risk
   <R>"` — literal, minimal, not translated (per spec), not asserted by any AC (it's
   an operator-only Formspree payload) so I kept it simple rather than
   over-engineering copy nobody but the operator reads.
5. **Raw-id fallback fix (item 5)**: applied everywhere `: id` literal fallbacks
   remained (the `msgSummary` mix-label loop, the `doWaitlistShare`/
   `doWaitlistDownload` subscription-branch mix-label loops) — changed to
   `goalLabel(t, id)`. Low-risk: for ids already in `SUBSCRIPTION_LADDER` (spotify,
   claude, netflix, etc.) this is a no-op: they always resolved via `found.labelKey`
   already. It only changes behavior for subscription-archetype GOALS ids that are
   NOT in `SUBSCRIPTION_LADDER` (`rent`, `phonebill`) — previously leaked raw
   `"rent"`/`"phonebill"`, now resolve to their translated labels. No AC exercises
   this directly (out of the two test goals, claude/iphone, neither hits this path)
   — a small honest bonus fix within scope, not asserted.
6. **AC5 clipboard vs. native-share**: `renderShareImage`'s `opts.url` path prefers
   `navigator.share` with files when available, falling back to clipboard-copy. I
   stubbed `navigator.share` away (`Object.defineProperty(navigator, 'share', { get:
   () => undefined })`) in the test's `addInitScript`, same pattern
   `test_share_mix_roundtrip.js` already uses, to force the deterministic
   clipboard-copy branch in headless Chromium rather than depend on whatever
   `navigator.share`/`canShare` happen to report in this sandbox's Chromium build.

## AC6 — TDD proof (verbatim baseline vs. post-fix)

### mixStats root cause (AC4), isolated Node run against unmodified planner.js

```
$ delete require.cache[...]; const gp = require('./planner.js');
gp.mixStats(['iphone'], 8)
  => { count: 1, combinedMonthly: 1100, neededCapital: 165000, ids: ['iphone'] }   // WRONG (pre-fix)
```

Post-fix: `{ count: 0, combinedMonthly: 0, neededCapital: 0, ids: [] }` — matches AC4 exactly.

### Full test file run against unmodified planner.js/translations.js (`git stash`)

Command: `git stash push -- planner.js translations.js planner.min.js translations.min.js
package.json && node test_waitlist_share_archetype.js` (then `git stash pop`)

```
network: unpkg.com BLOCKED (using local vendored React/Babel), yields.llama.fi BLOCKED (using fixture pool), formspree.io ROUTED 200
  ✗ AC4: mixStats(["iphone"]) no longer misreads the one-time item price as a monthly cost; mixStats(["claude"]) unchanged
    iphone count should be 0, got {"count":1,"combinedMonthly":1100,"neededCapital":165000,"ids":["iphone"]}

1 !== 0

  ✗ AC1: TARGET (iphone) download card is archetype-correct — translated label, no raw id, no subscription "/mo covered forever" subline, no $1,100-family monthly figure
    page.waitForFunction: Timeout 30000ms exceeded.
  ✗ AC2: TARGET (iphone) "Share on X" tweet text is archetype-appropriate, no raw id
    expected translated goal label "iPhone" in tweet text, got: My yield pays for iphone — forever 🌱 Join me on DeFi Garden:
  ✗ AC5: TARGET (iphone) download card carries the plan link (clipboard) with goal + funding params
    expected a plan URL to leave the device (clipboard write) — got null
  ✗ AC3: SUBSCRIPTION (claude) download card + tweet are byte-identical to the pre-change baseline
    page.waitForFunction: Timeout 30000ms exceeded.
  ✗ AC3b: SUBSCRIPTION with Spotify manually toggled into the mix — card + tweet reflect the FULL selected mix
    [browser closed after the 120s outer shell timeout — same root cause: clickDownload
     waits on window.__copiedUrl, which pre-fix is never set because doWaitlistDownload
     passes no url at all (this is exactly the AC5 bug)]
```

This confirms: AC4/AC1/AC2/AC5 fail on baseline for the expected reasons (raw id
leak, `$1,100`-as-monthly, no link attached). AC3/AC3b *time out* rather than fail
with a content mismatch — because `clickDownload`'s wait-for-clipboard step never
resolves pre-fix (no url ever attached), not because the card/tweet content itself
differs. To isolate AC3/AC3b's *content* claim from the AC5 timeout, I ran an
additional probe (throwaway copy of the test with `clickDownload`'s wait changed to
a flat `800ms` timeout instead of waiting on `copiedUrl`) against the same stashed
baseline:

```
$ git stash push -- planner.js translations.js planner.min.js translations.min.js
$ node ac3_probe_TEMP.js    # (clickDownload neutered, see Deviation #2)
  ✗ AC4: ... (same failure as above)
  ✗ AC1: ... got: 🌱 iphone | 🌱 My yield covers | iphone — forever | ≈$155,000 working at 8.5% · $1,100/mo covered forever | ...
  ✗ AC2: ... got: My yield pays for iphone — forever 🌱 Join me on DeFi Garden:
  ✗ AC5: ... got null
  ✓ AC3: SUBSCRIPTION (claude) download card + tweet are byte-identical to the pre-change baseline
  ✓ AC3b: SUBSCRIPTION with Spotify manually toggled into the mix — card + tweet reflect the FULL selected mix
$ git stash pop
```

This proves the SUBSCRIPTION content claim (AC3 + the toggled-mix AC3b) is **already
true on baseline** — my fix must reproduce it exactly, which it does (below). It also
independently confirms AC1/AC2/AC4/AC5 fail on baseline with the exact defect
signatures the spec's Evidence section describes (`$1,100/mo`, raw `iphone`, no URL).

### Post-fix: full run, unmodified

Command: `node test_waitlist_share_archetype.js`

```
network: unpkg.com BLOCKED (using local vendored React/Babel), yields.llama.fi BLOCKED (using fixture pool), formspree.io ROUTED 200
  ✓ AC4: mixStats(["iphone"]) no longer misreads the one-time item price as a monthly cost; mixStats(["claude"]) unchanged
  ✓ AC1: TARGET (iphone) download card is archetype-correct — translated label, no raw id, no subscription "/mo covered forever" subline, no $1,100-family monthly figure
  ✓ AC2: TARGET (iphone) "Share on X" tweet text is archetype-appropriate, no raw id
  ✓ AC5: TARGET (iphone) download card carries the plan link (clipboard) with goal + funding params
  ✓ AC3: SUBSCRIPTION (claude) download card + tweet are byte-identical to the pre-change baseline
  ✓ AC3b: SUBSCRIPTION with Spotify manually toggled into the mix — card + tweet reflect the FULL selected mix (not just what capital covers)

6 waitlist-share-archetype assertions passed
```

All 6 green, including the orchestrator-requested AC3b (toggled-mix) case, and its
baseline-probe pair above proves it is byte-identical to what pre-146 code already
produced for that scenario.

## Exact commands run

```
npm install                                    # node_modules was missing
node test_waitlist_share_archetype.js          # TDD baseline (failing, pre-edit)
# ... implemented planner.js / translations.js changes ...
npm run minify                                 # regenerate planner.min.js / translations.min.js
node test_waitlist_share_archetype.js          # green, first pass (before orchestrator's AC3 concern)
# ... orchestrator flagged the coveredBundle-vs-selectedSubs risk ...
# ... reworked doWaitlistShare/doWaitlistDownload per Deviation #1 ...
node test_waitlist_share_archetype.js          # green again
# added AC3b (toggled-mix) test case
git stash push -- planner.js translations.js planner.min.js translations.min.js  # + probe run, see AC6 above
git stash pop
node test_waitlist_share_archetype.js          # final green run, 6/6

# Regression subset (spec's Tests criterion, run individually):
node test_planner.js                           # PASS (208 assertions)
node test_subscription_mix_seed.js             # PASS (4/4)
node test_share_mix_roundtrip.js               # PASS (5/5)
node test_waitlist_funnel.js                   # FAIL — proven pre-existing (see below)
node test_plan_checkout_cta.js                 # PASS (13/13)
node test_report_share.js                      # PASS (8/8)
node test_translations_fallback.js             # PASS (8/8)
node test_minified_assets.js                   # PARTIAL FAIL — proven pre-existing (see below)

npm test                                       # attempted, halted early — see below
```

## Pre-existing failures (proven, not caused by this change)

1. **`test_waitlist_funnel.js`** — all 3 cases fail with `expected exactly 1
   waitlist_email_entered, got 0` / `got undefined`. Ran the identical test against
   a `git stash`ed unmodified `planner.js`/`translations.js`: **identical failure**,
   byte-for-byte same error messages. Not related to spec 146 (this test exercises
   the SEO-entry quick-waitlist path, `?waitlist=1&src=seo_token`, which I never
   touched — my changes are all inside `Bloom`'s checkout-waitlist functions).
   Left unfixed: out of scope for spec 146, and touching an unrelated, already-red
   test risks masking whatever pre-existing sandbox/timing issue is causing it.

2. **`test_minified_assets.js`** — 2 of 9 assertions fail: `home.html does not load
   translations.min.js` and `plan.html still loads raw planner.js`. Ran against a
   `git stash`ed unmodified tree: **identical failure**. This is a structural
   statement about `home.html`/`plan.html`'s own `<script>` tags (they load
   `translations.js`/`planner.js` unminified in some places, per current repo
   convention — confirmed by inspection: `plan.html` loads `translations.min.js`
   but `planner.js` raw with a comment "edit planner.js, never planner.min.js";
   `home.html` loads `translations.js` raw). Nothing in spec 146's Change section
   asks me to touch `home.html`/`plan.html`'s script tags, and doing so is
   explicitly the kind of drive-by refactor the build rules prohibit. Left unfixed.

3. **`npm test` (full chain)**: the script is a single `&&`-chained command; because
   `test_minified_assets.js` (item 2 above) already fails on unmodified `main`, the
   full chain halts there on EVERY run regardless of this change, well before
   reaching `test_waitlist_share_archetype.js` at the end of the list. I ran it
   under the 5-minute timebox (`timeout 295 npm test`) — it exits at
   `test_minified_assets.js` in ~2 minutes (not itself timing out), confirming the
   halt is the pre-existing failure, not a timebox truncation. I could not observe
   `npm test`'s tail (my new test + everything after `test_minified_assets.js` in
   the chain) via the aggregate script for this reason; I instead ran every test the
   spec's "Tests" criterion names individually (see command list above), plus my new
   test file individually (6/6 green), which together cover everything the AC asks
   for.

## Found but deliberately NOT fixed

- The two `test_minified_assets.js` / `home.html`+`plan.html` asset-reference
  mismatches above — pre-existing, unrelated, explicitly out of this spec's Change
  section, would be a drive-by refactor.
- `test_waitlist_funnel.js`'s 3 failures — pre-existing, unrelated surface (SEO
  quick-waitlist entry, not the `Bloom` checkout-waitlist this spec touches).
- The raw-id-fallback bug for `rent`/`phonebill` inside the subscription-branch mix
  loops was fixed as a side effect of item 5 (see Judgment call #5) rather than left
  — noting it here only because it's a *behavior change* nobody explicitly asked to
  verify; no AC exercises it, and it strictly improves honesty (translated label
  instead of a raw internal id), consistent with the spec's "only removes fabricated
  figures" risk-tier note.

## i18n / trust-rail checklist

- New key `shareTweetGeneric` exists in both `en` and `ko` (`translations.js:598`,
  `:1284` approx.) — verified via `node -c translations.js` + the EN/KO pair shown
  above.
- All money in the touched code goes through `formatUsd`/`formatUsdRounded`/
  `formatApy` — no bare `toLocaleString()` introduced.
- No trust rail touched: `APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly
  flags/demotion, degen haircut are all untouched — confirmed by `git diff` (no
  matches on those identifiers).
- No SEO surface, no `home.html`/`plan.html` router/script changes, nothing under
  `telegram-bot/`, `whatsapp-bot/`, `workers/`.

## Risk tier

Agree with the spec's self-assessed **HIGH** (user-facing share output + a shared
helper `mixStats` used by the subscription bloom + logic extracted out of `doShare`).
Confirmed no NEVER-list item is touched.
