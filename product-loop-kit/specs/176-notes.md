# 176 — build notes

Loop run 2026-07-29. Branch `claude/loop-176`, based on `origin/main` @ `50cb04240`.

## Pickup / in-flight check (build.md §1, 2026-07-26 rule)

`git ls-remote origin 'refs/heads/claude/loop-17*'` returned `loop-170/171/172/173/173-recovery/174/176-recovery/177`.
A `claude/loop-176-*` ref and an open PR titled "176: …" (#331) **do exist** — but they are a
**different item**. PR #331 is the rendered `apy-rail-breach` audit check, authored as 173, renumbered
by its own run to 176 after a heartbeat took 173-175 on `main`. `main` owns numbering
(#331's own words), and `main`'s BACKLOG row 176 is *this* item — the 8-red browser lane, written by
the 2026-07-29 heartbeat. So the in-flight check is a **false positive by ID collision**, not a
duplicate build: no one is building the browser-lane item.

**Consequence the human must resolve (flagged, not silently absorbed):** if PR #331 is ever applied,
its ledger patch renumbers its row to 176 and would collide with this item. #331 needs a fresh ID
(next free after this run) at apply time. Recorded here and in the PR body rather than renumbering
someone else's unmerged work from this session.

## Environment / baseline (measured, not assumed)

- Fresh `npm ci` on a clean checkout of `origin/main`; Playwright Chromium at `/opt/pw-browsers`.
- Trust-rail baseline hashes recorded before any edit:
  `app.js f94991532553faecbea028b9b2843586` · `planner.js a6642d890751f85f4b76e33b1ffe1729` ·
  `PoolDetail.js 0c5f51176ec9eb0a1e18c7f797aafd52` · `analytics.js f105daf442521442163c52455329aaa1` ·
  `translations.js 003df7d71278b3b77693bb86f428316b` · `home.html fb95b39b0f8ceff4d35c205def0d5d28` ·
  `plan.html e380a19492f4a55b6765174cb63e4a41`.
  `app.js:800 APY_SANITY_LIMIT = 1000` · `app.js:801 DEFAULT_MIN_TVL = 10000000` · `planner.js:19
  APY_SANITY_LIMIT = 1000` — quoted here so A8 can be re-checked against a recorded value.
- **Plain lane baseline, `node run-tests.js --lane=plain`: `pass=37 fail=1`.** The one red is
  `test_seo_cta_targets.js` — 3 of 2186 pages (`tokens/mchc`, `tokens/n3xt`, `tokens/zro`) whose
  primary CTA now resolves to 0 live pools at `minTvl=100000`. That is **live-data drift** since the
  last SEO regen (item 173/174 shipped it green; PR #332 recorded the same class at 2 pages on
  2026-07-29 morning, now 3), not a browser-lane red and not caused by this diff. Recorded, not fixed
  — it is a different red class (`pre-existing-red-triage.md`: "Don't fix the second red while fixing
  the first").

## Chain positions (playbook step 2)

`package.json`'s legacy `test:serial` `&&` chain is 103 files. The 8 reds sit at positions
**15, 30, 48, 50, 51, 52, 54, 67** — so on `test:serial` the earliest hides **88** files.
`npm test` (item 163's `run-tests.js`) runs every file regardless, so the modern gate does see all 8.

## Reproduction on `origin/main` (before any edit)

`node run-tests.js --only=…`, real Chromium, run in two batches of four:

```
TOTAL pass=0 fail=4   test_waitlist_{seo_entry,funnel,pitch,microcopy}.js
TOTAL pass=0 fail=4   test_{snapshot_first,analytics_fires,spotlight_attribution,footer_hub_links}.js
```

Verbatim failure text is in the verdict table below.

## Verdicts

### Class 1 — dead Mixpanel stub queue, rotted by the spec-096 host gate (4 files)

**Files:** `test_waitlist_seo_entry.js`, `test_waitlist_funnel.js`, `test_waitlist_pitch.js`,
`test_spotlight_attribution.js`. **Rule B (stale test).**

All four observe analytics by reading the `window.mixpanel` stub array. `analytics.js:91-102`:

```js
track(eventName, eventData = {}) {
  if (typeof mixpanel === 'undefined') return;
  // Suppress all tracking on non-production hosts (spec 096) — the single
  // choke point every track* helper and startSession() funnel through.
  if (!this.isProductionHost()) { … return; }
```

`PRODUCTION_HOSTS` (`analytics.js:14`) is `['defi.garden','www.defi.garden','yield.garden','www.yield.garden']`.
Every one of these tests serves the page from `localhost:<port>`, so `track()` returns **before**
`mixpanel.track(...)` — the stub queue is structurally guaranteed to be empty. The tests were not
observing a broken product; they were observing a choke point that spec 096 deliberately closed.

*Authorizing evidence*, `specs/096.md`: *"Non-allowlisted hosts (`localhost`, `127.0.0.1`,
`*.vercel.app` previews, `file:`): `track()` returns early — no event sent."* The decision is
evidence-driven (`signals/2026-07-14.md`: 13/13 localhost-polluted events) and has its own dedicated
gate tests — `test_analytics_host_gate.js:56,72-76` asserts localhost → **0** mixpanel calls, and
`test_analytics_host_gate_render.js` proves it on a real render. Fixing the *product* here would
mean re-polluting production analytics: the exact inversion the playbook's "do not fix the product
backwards" rule exists to prevent.

*Blast-radius check (mechanical, not argued):* `grep -ln "window.mixpanel" test_*.js` returns exactly
five files — these four, plus `test_analytics_host_gate_render.js`, which reads the queue **in order
to assert it stays empty**. That fifth file is correct as written and is deliberately left untouched;
it is the negative control for the very gate that rotted the other four.

*Two candidate repairs were proposed by independent investigations; the weaker one was rejected.*

- **Rejected:** wrap `Analytics.track` with a spy (`installTrackSpy`,
  `test_northstar_cta_fires.js:98-115`) and assert against `window.__events`. It works, and it is a
  genuine house pattern — but it **downgrades** every assertion in these four files from "Mixpanel
  received this event" to "the product called `track()`", and it requires rewriting every queue read.
  A2 forbids loosening an assertion when a non-loosening option exists.
- **Adopted:** neutralize *only* the environmental difference. `page.addInitScript` overrides
  `Analytics.isProductionHost = () => true` before navigation, so the event travels the **real** path
  — product → `track()` → gate → `mixpanel.track()` → stub queue — and every existing queue read and
  assertion stays byte-unchanged. Precedent already in the repo:
  `test_analytics_host_gate_render.js:74-89` uses this exact poll-and-patch shape.

This is the playbook's **rule C remedy applied to a rule B cause**: the *cause* is a deliberate
product change (the gate), but the *failure* is host-conditional, and rule C's instruction is to
neutralize the environment and **never weaken the assertion**. Verified by direct experiment before
the fix was written: with the host override in place, `?pitch=b` produced
`["track","waitlist_opened",{…,"source":"seo_token","pitch_variant":"b"}]` in the queue — proving the
product was correct and fully wired all along (`pitch_variant` lives at `planner.js:39-52`, `:2950`,
`:4018` and `analytics.js:415-434`; the `x_spotlight`/`src=` threading at `planner.js:1450-1451`,
`:1994`, `:4807-4808`).

`test_analytics_host_gate_render.js` deliberately does NOT get the override — it is the negative
control asserting that suppression really happens when the host is not forced. Untouched.

### Class 2 — archetype-aware checkout CTA, shipped by item 139 (1 file)

**File:** `test_waitlist_microcopy.js` (growth cases only; the subscription cases pass and stay).
**Rule B (stale test).**

`planner.js:2967` `var checkoutPoolPrimary = archetype !== 'subscription' && !!checkoutTopPool;` and
`:3016-3017` `checkoutPoolPrimary ? t('startGrowingCtaMicro') : t('ctaWaitlistMicro')`. On
`goal=retirement` (GROWTH) with a curated pool, the primary CTA at `:3004-3010` is a real
`<a href="/?pool=…">` — *"Start growing on `<project>` →"* — **not** the waitlist button. So the card
disclaimer is not missing from a waitlist CTA; there is no waitlist CTA in that slot any more.

*Authorizing evidence*, `specs/139.md`: *"TARGET/GROWTH archetypes: primary CTA becomes 'Start
growing on `<top pool's project>` →' … Waitlist demotes to a secondary text link"* — human-approved
2026-07-23 (`docs/strategy-2026-07-23-pretraffic-bets.md` §3, BET A). 139's own test
`test_plan_checkout_cta.js` (13 assertions) passes on this tree; it was re-run this session to
confirm rather than taken on trust. `test_waitlist_microcopy.js` was written by item 070 on
2026-07-13, ten days before 139 split the CTA, and 139 did not update it.

*The honesty check this verdict turns on (done, not assumed):* item 070's requirement is that a user
is told the card does not exist **before** joining the waitlist. On the growth path the waitlist is
reached through the secondary link `ctaWaitlistSecondary` (`planner.js:3019-3024`), whose modal
renders `waitlistBenefitsEarlyAccess` (`translations.js:578`): *"…Nothing's live yet. Join early
access and we'll email you the moment it is."* The disclosure survives on the path that leads to the
card. Had it not, this would have been rule **A** and the product would have been the thing to fix.

### A7 — the shared port 8798: investigated, ruled harmless, with evidence

`test_spotlight_attribution.js:28` and `test_waitlist_pitch.js:22` both hardcode `PORT = 8798`, and
item 170 lets the browser lane run up to 3 concurrent jobs — so this looked like a live flake source
in the merge gate. It is not. `run-tests.js` (`conflictKeysFor`/`extractPorts`, `:174-225`, and
`runQueue` `:372-440`) statically extracts each file's own `PORT` literal by regex and builds a
`port:<n>` conflict key; files sharing a key are never scheduled concurrently. Measured directly:

```
extractPorts('test_waitlist_pitch.js')        -> Set(1) {8798}
extractPorts('test_spotlight_attribution.js') -> Set(1) {8798}
conflictKeysFor(...) both -> { keys: {'port:8798'}, exclusive: false }
```

So the scheduler serializes them at any `--jobs` value. Left as-is deliberately: renumbering a port
is a change with no defect behind it, and the guard that makes it safe is itself covered by
`test_run_tests.js`. Recorded as dead-weight risk, not fixed (a port dedupe belongs with whoever next
touches the runner).

*Fix (test-only, repoint + re-home per the playbook):* the growth cases assert
`startGrowingCtaMicro` under the primary CTA, and the displaced honesty coverage is re-homed in the
same diff — a new case asserting the growth path still discloses "nothing's live yet" at the point
where it offers the waitlist. Repointing alone would silently shrink the gate. Both the repoint and
the re-home ship in EN **and** KO (`translations.js:562/1268` and `:578/1284`), read from
`translations.js` rather than re-typed as literals, so a future copy edit cannot desync the test.

### Class 3 — the 2026-07-15 landing pivot, second wave (2 files)

**Files:** `test_snapshot_first.js` scenario (f), `test_footer_hub_links.js` bare-`/` case.
**Rule B (stale test).** This is item 156's class, in the two files 156 did not reach.

`home.html:82` — `window.__APP_MODE = needsAnalytics ? 'analytics' : (needsPlanner ? 'planner' : 'landing')`.
Bare `/` mounts the search-first landing into `#landing-root`; `#planner-root` stays empty. Verified by
rendering it this run, not inferred from the router source.

- `test_snapshot_first.js:233-234` waits for `.gp-tagline h1` on bare `/`. That selector exists only in
  `planner.js`, so it can never appear there any more.
- `test_footer_hub_links.js:172` waits for `#planner-root [class*="gp-"]` on bare `/`. Here **only the
  readiness wait is stale** — the behaviour under test is still true: `.seo-hub-links` computes
  `display: flex` on bare `/` (CSS hides it only under `html[data-app-mode="analytics"]`,
  `style.css:2589`) and the `/tokens` anchor is visible and clickable.

*Authorizing evidence:* BACKLOG item **156** (SHIPPED 2026-07-27) fixed exactly this class for
`test_smoke.js` and `test_hub_pages.js`. The decisive tell is the playbook's strongest one — a sibling
test that contradicts the failing one: `test_landing.js:74` already asserts *"bare / must not mount the
planner above the landing"*. Two tests in the same suite cannot both be right; the one that agrees with
the shipped pivot wins.

*Fix (test-only, repoint + re-home):* (f) navigates to `/plan.html` — the route the planner moved to —
keeping the "no live call was made" assertion untouched, plus a new bare-`/` scenario so the file still
covers *both* router paths its own scenario name claims. `test_footer_hub_links.js` swaps its wait to
`[data-testid="landing-search"]` (156's explicit preference: `data-testid` over class-shape selectors,
so the new assertion is not the next stale one) and gains a `/plan.html` case so the planner route keeps
this coverage.

### Class 4 — blocked external hosts hang `waitUntil:'load'` (1 file)

**File:** `test_analytics_fires.js`. **Rule C (environment).**

*A wrong first reading, corrected — recorded because the correction is the useful part.* `tokens/big.html`
is genuinely absent from the 2,100-file `tokens/` directory (items 148/174 churned the slug set), which
makes "the test points at a page that no longer exists" an extremely plausible story. It is wrong.
`test_analytics_fires.js:35-38` synthesizes the page **in memory** from `test_fixtures/pools-sample.json`
via `gen.rankTopTokens`/`gen.renderTokenPage`, and the file's own HTTP handler (`:44`) intercepts
`urlPath === FIXTURE_PATH` before touching disk. The checkout's `tokens/` contents never enter this test.
Had the fix been written to the first reading, it would have "fixed" a test that was never broken that
way — and the real hang would have come back the next time an external host was added.

*Actual cause, measured by request tracing:* `:110` uses `waitUntil:'load'`, which waits for every
subresource. The generated page pulls `https://api.fontshare.com/…` (from `/style.css`'s **blocking**
`@import` — note `home.html` uses the async `media=print` trick, generated pages do not) and
`https://mp.defi.garden/lib.min.js` (the Mixpanel bootstrap `generate-token-pages.js` embeds in every
generated page). In this sandbox those hosts do not fail fast: each hangs ~13s
(`net::ERR_CONNECTION_RESET`; a direct `page.goto` to fontshare measured 12.8s), so sequentially they
blow the 15s budget. The file routes only `www.defi.garden/analytics.js` (fulfilled) and
`icons.llamao.fi` (aborted) at `:83-89`.

*Authorizing evidence:* NORTH_STAR standing decision 2026-07-12 (browser-originated HTTPS is blocked at
the proxy) and the playbook's rule-C entry, which prescribes exactly this remedy. ~40 sibling test files
already abort these hosts (`test_list_polish.js:90`, `test_landing_return.js:103`).

*Proof the product is fine:* the same logic pointed at the real on-disk `tokens/usdc.html`, with the
hanging hosts aborted, loaded in **201ms** with zero page errors and fired `Analytics.track` exactly once
with `path:"/tokens/usdc", page_type:"token_landing"`.

*Fix (test-only):* reuse the more robust in-repo pattern from `test_snapshot_first.js:107-109` — a
blanket abort of every request that is neither localhost nor the one host the test genuinely needs —
rather than a per-host allowlist that the next new external host defeats. The assertion (exactly one
`page_view`, `page_type=token_landing`, correct path) is untouched.

## Results

Each file re-run in real Chromium, with a RED/GREEN non-vacuity cycle proving the repair is what
carries it (revert → the original symptom returns → restore → green). Assertion counts never drop;
where they rise it is the mandatory re-homing (A3).

| file | result | scenarios / assertions before → after |
|---|---|---|
| `test_waitlist_seo_entry.js` | PASS 5/5 | 5 / 8 → 5 / 8 |
| `test_waitlist_funnel.js` | PASS 3/3 | 3 / 9 → 3 / 9 |
| `test_waitlist_pitch.js` | PASS 7/7 | 23 assertions → 23 |
| `test_spotlight_attribution.js` | PASS 3/3 | 6 → 6 |
| `test_waitlist_microcopy.js` | PASS 8/8 | 6 / 7 → **8 / 14** |
| `test_snapshot_first.js` | PASS 9/9 | 8 / 17 → **9 / 19** |
| `test_analytics_fires.js` | PASS 1/1 | 1 / 4 → 1 / 4 (rule-C env fix; no new assertion needed) |
| `test_footer_hub_links.js` | PASS 6/6 | 5 / 23 → **6 / 27** |

**Authoritative run — all eight together, executed by the operator rather than read off a builder's
transcript:**

```
node run-tests.js --only=<the eight>
TOTAL pass=8 fail=0 timeout=0 total=8
```

Durations: `snapshot_first` 11.2s (was FAIL 17.6s) · `analytics_fires` 1.8s (was FAIL 16.9s — the
subresource hang is gone, not merely tolerated) · `spotlight_attribution` 28.0s · `waitlist_seo_entry`
3.1s · `waitlist_funnel` 2.6s · `waitlist_pitch` 4.2s · `waitlist_microcopy` 4.8s · `footer_hub_links`
80.7s.

**Collateral-damage check** on the neighbours most exposed to these edits, also operator-run:
`test_analytics_host_gate.js` PASS · `test_analytics_host_gate_render.js` **PASS** ·
`test_landing.js` PASS · `test_hub_pages.js` PASS. The second is the load-bearing one — it is the
negative control asserting the host gate really does suppress events when it is *not* overridden. It
still passes, so the four overrides did not defeat the gate; they are scoped to the pages that
install them.

## The one place the plan was wrong, and what it cost

The class-3 brief told the builder to re-home `test_footer_hub_links.js`'s displaced coverage onto
`/plan.html`, by analogy with 156. The builder implemented it, found it RED, and — correctly —
**refused to adjust the expectation to match the observed output**, reporting it as a candidate
product bug instead. It surfaced two things:

1. On bare `/`, the static `.seo-hub-links` block is **occluded** by the landing's own
   `<footer class="app-footer">` (`landing.js:356-367`), which is `position:fixed; bottom:0;
   z-index:100` (`style.css:2515`). `style.css:2589` hides the static block under
   `html[data-app-mode="analytics"]` only, so in landing mode both exist and the static one is
   unreachable at every scroll offset.
2. `/plan.html` has **no hub links at all** — `grep -c seo-hub-links plan.html` = **0**. It is a
   separate 102-line static file, not served through `home.html`.

Finding 2 means my instruction was a **feature request wearing a test's clothes**: `/plan.html` never
carried that surface, so a test asserting it would have held the merge gate red over something nobody
ever promised. Deleted, and filed instead (see below).

Finding 1 reframes case (b) rather than breaking it. The landing's own footer carries the same
`/tokens` and `/chains` anchors — verified in `landing.js:362-366` — so the *behaviour* ("hub links
are visible and clickable on bare `/`") is still true; it is served by a different element. That is
the same rule-B repoint as everything else in this item, and the playbook's question — *which route
inherited the old behaviour?* — has a real answer. So case (b) now drives
`.app-footer .app-footer-hub-links a[href="/tokens"]` (visible → click → `/tokens`), and the crawler
surface 045 actually needs is re-homed as a **DOM-presence** assertion on `.seo-hub-links` — not
visibility, because in landing mode it is deliberately superseded. Two different truths, two
different assertions; collapsing them is how the case went stale in the first place. **No product
code was changed** to make this pass.

Both findings are filed as new backlog item **179** with this evidence. They are real, they are not
this item's to fix, and they were found only because a builder declined to make a red go away.

## A4 — was any of the 8 a real product bug?

No. All eight are rule B or rule C, and each verdict rests on the product being independently shown
**correct**, not merely on the test looking stale:

- classes 1: with the host gate neutralized the real events appear with the right shape
  (`waitlist_opened{source:"seo_token",pitch_variant:"b"}`) — the product was emitting correctly all along;
- class 2: the honest "nothing's live yet" disclosure still reaches the user on the growth path, checked
  through the secondary link into the modal, so item 070's honesty rail is intact;
- class 3: bare `/` renders the landing and `/plan.html` renders the planner, both verified by render;
- class 4: the page fires exactly one correct `page_view` in 201ms once the blocked hosts are aborted.

So nothing is being silenced, and no follow-up product ticket is owed. This is the outcome A4 permits,
reached by checking rather than by assuming.


## A8 — rails and scope, re-checked after every builder

`md5sum` of `app.js`, `planner.js`, `PoolDetail.js`, `analytics.js`, `translations.js`, `home.html`,
`plan.html` all match the pickup baseline recorded at the top of this file, byte for byte. `style.css`
and `landing.js` likewise unchanged (`git diff --stat` empty for both). **The diff is test-only.**
`APY_SANITY_LIMIT` and `DEFAULT_MIN_TVL` are untouched; no SEO surface is de-indexed or regenerated;
`telegram-bot/`, `whatsapp-bot/`, `workers/` are not in the diff. Nothing on the NEVER list is
approached — this item only changes files under `test_*.js` plus `product-loop-kit/` bookkeeping.

## A9 — honest final state of the lane

- **The 8 targeted files: 8/8 green**, operator-verified in one run.
- **Neighbours checked: 4/4 green**, including the host-gate negative control.
- **The full 64-file browser lane was NOT run.** At ~30s median per file it exceeds the 5-minute
  foreground timebox (NORTH_STAR standing decision 2026-07-11), and `test_footer_hub_links.js` alone
  takes 80s. Stated as unrun, not implied green.
- **Plain lane: 37 pass / 1 fail.** The single red is `test_seo_cta_targets.js` — 3 of 2,186 pages
  (`tokens/mchc`, `tokens/n3xt`, `tokens/zro`) whose primary CTA now resolves to 0 live pools at
  `minTvl=100000`. This is **live-data drift** since the last SEO regen, present before this diff (the
  same class was recorded at 2 pages earlier on 2026-07-29 in PR #332), and it is a different red
  class — the playbook's "don't fix the second red while fixing the first" applies. It clears on the
  next `npm run sitemap`-class regeneration; not touched here.
- **`test:serial` chain arithmetic:** the legacy `&&` chain's earliest stopper was position **15 of
  103** (`test_snapshot_first.js`), hiding 88 files. With all 8 repaired, the next stopper on that
  chain is `test_seo_cta_targets.js` at position **24**, for the data-drift reason above. `npm test`
  (the runner the merge gate actually uses) is unaffected by chain position and now reports these 8 as
  green.

## Follow-on filed

New BACKLOG item **179** (READY) carries the two genuine product findings this run surfaced but did
not fix: the occluded `.seo-hub-links` block in landing mode, and `/plan.html` having no hub-link
surface at all. Evidence is reproduced in the row so the next loop does not re-derive it.
