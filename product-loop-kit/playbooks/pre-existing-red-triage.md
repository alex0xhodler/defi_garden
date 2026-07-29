# pre-existing-red-triage — playbook

**When:** you run the test suite for an unrelated item and a test fails that your diff did not cause —
or your notes are about to contain the phrase *"PRE-EXISTING, proven on a stashed baseline, not fixed
(scope creep)"*. Also: when `npm test` stops early and the files after the stopper never run.

**Answer in one line:** proving it's pre-existing is only HALF the job — a red on `main` is either a
**real product regression the test correctly caught** (fix it, it is a product bug) or a **stale test
encoding an IA/behavior the product deliberately moved away from** (retire/repoint the test), and
leaving it unclassified silently blinds every `&&`-chained test after it for months.

## Steps

1. **Prove it's not yours** (the part loops already do well): `git stash push <your files>` → re-run the
   single test → confirm byte-identical failure → `git stash pop`. Record verbatim.
2. **Find the chain position.** `package.json`'s `test` is one `&&` chain. `grep -o 'node test_[a-z_]*\.js' package.json | nl`
   gives each file's position; anything AFTER the first red never runs in a plain `npm test`. Record
   *how many* tests the red is hiding — that number is the item's real score, not the size of the fix.
3. **Classify the red — read the assertion, not the test name:**
   - Does the assertion describe what the product is *supposed* to do today? Check the spec/LOG for a
     shipped pivot that changed it (`grep -i "drift\|pivot\|no longer" product-loop-kit/LOG.md`).
   - **Decision rule A — product regression** (the assertion is still correct, the product drifted
     away from it) → this is a **product bug**; fix the product, not the test.
   - **Decision rule B — stale test** (the product deliberately changed and the assertion encodes the
     old behavior) → the fix is to retire or repoint the *test*, in its own item, and say so out loud;
     do NOT "fix" the product back.
   - **Decision rule C — environment** (fails only in the sandbox: blocked HTTPS, missing fixture
     routing) → fixture-route it (NORTH_STAR 2026-07-12 pattern); never weaken the assertion.
   - **Decision rule D — rotted positive control** (a test that injects a bad value and asserts a
     detector *catches* it, now red because a rail shipped that suppresses the injected value before
     it ever renders). Tell it apart from A/B in one probe: inject the same magnitude into 3-4
     candidate fields, one render each, and see which reach `document.body.innerText` (item 155's
     probe: `apyMean30d` → 0 findings, `apyBase`/`apyReward` → 7 each, `tvlUsd` → 0 because
     `formatUsd`'s K/M/B/T suffix is deliberately skipped). Zero findings on the *old* field +
     non-zero on a *new* one = the detector is alive and only the injection point rotted.
     → **Repoint** the control at a still-ungated field, and **convert the old injection into a
     negative control** asserting zero findings — that turns the rail that broke your test into the
     thing the test now protects. Deleting the case throws away both.
4. **Check whether the red also hides a live product defect.** A freshness/wiring gate that is red is
   often a symptom, not the bug: `test_minified_assets.js` failing meant prod was actually *serving the
   raw bundles* (~159 KB extra on the north-star surface), not merely that a test was unhappy.
5. **Promote it** with the chain-position number as the evidence (item 147 is the precedent: 11 loops
   had each proven it pre-existing and moved on; none had classified it).

## Resolution

- **A** → fix in product code, keep the test as-is; the test just proved its worth.
- **B** → separate item, test-only diff, and record in the notes which shipped item made it stale so the
  next reader doesn't "fix" the product backwards. **Repoint, and re-home the coverage the pivot
  displaced** — a pivot moves a behavior to a different route, it rarely deletes it. Repointing the
  assertion at the new surface alone silently *shrinks* the gate. Ask "which route inherited the old
  behavior?" and add a case for it in the same diff: item 156 repointed bare `/` at the landing **and**
  added `/plan.html` so the planner render path kept its three-viewport coverage. Prefer `data-testid`
  hooks over class-shape selectors when you repoint, so the new assertion isn't the next stale one.
- **C** → fixture-route, same-item is fine if it's the test you're already touching.
- In all three: if the red sat in an `&&` chain, say in LOG.md how far the chain gets *after* your fix
  and which file is the next stopper — the next loop inherits the fact instead of rediscovering it.

## Traps

- **"Pre-existing" is a provenance claim, not a triage verdict.** Eleven consecutive notes files said
  "pre-existing" about the same two assertions; none said "…and it is a real regression."
- **A wrong classification outlives an unclassified red, because it stops the questions.** Item 142
  recorded `test_smoke.js` as rule **C** — *"sandbox render-timeouts CONFIRMED pre-existing at HEAD"* —
  and it read as settled for four more loops; it was rule **B** all along. A browser test that times out
  looks like the sandbox no matter which rule it is, so never classify one from the exit code. **Read the
  same run's log for two tells before saying "sandbox":** (1) the test's own network banner —
  `test_smoke.js` prints `network: yields.llama.fi reachable — serving live snapshot captured via curl`
  vs `BLOCKED — serving DefiLlama-shaped fixture`; (2) whether *sibling browser cases in the same run*
  passed. In item 156's reproduction the banner said reachable and `/?token=USDC` rendered pool cards at
  all three viewports while only the bare-`/` cases timed out — a blocked sandbox cannot fail one route
  and pass another in the same browser. Environment reds are indiscriminate; stale-assertion reds are
  surgical.
- **A red gate you can't see past looks like a green suite.** `npm test` exiting 1 at file 6 of 90 reads
  the same as file 90 failing — always report the *position*.
- **A test asserting the old IA will look like a product bug.** `test_smoke.js` *used to* assert that
  bare `/` renders the planner; the search-first-landing pivot (LOG 2026-07-15, item #237/114) made that
  false on purpose, and `test_landing.js` already asserted the correct current behavior — which is
  exactly how item 156 classified it. Check for a sibling test that contradicts the failing one — that's
  the strongest stale-test tell. (Fixed in 156; kept here as the worked example.)
- **Don't fix the second red while fixing the first.** One item, one red class; record the rest.
- **A source edit does NOT reach the rendered page.** `home.html` (lines ~330-357) loads
  `PoolDetail.compiled.min.js` + `app.compiled.min.js`, not the raw `text/babel` source (backlog
  052/053). Any rendered test, audit run, or mutation-kill proof that edits `app.js`/`PoolDetail.js`
  and re-renders without `npm run compile && npm run minify` is measuring the OLD bundle — and a
  mutation that "fails to kill" for that reason reads exactly like a test that was vacuous. Rebuild,
  then `git checkout --` all three files (source + `.compiled.js` + `.compiled.min.js`) and confirm
  `git diff --stat` is empty.
- **A green test file that nothing runs is not a gate.** Check the failing/repaired file is actually
  in `package.json`'s `test` chain (`grep -c test_<name> package.json`) — 155's red control survived
  two loop runs because `test_audit_app.js` was never wired in.
- **Rule-C tell: a Playwright wait that times out while the behaviour it waits for already happened.**
  `page.waitForURL()`, `waitForNavigation()` and `goto()` all default to `waitUntil: 'load'`, and `load`
  requires *every* subresource to settle. On any route that pulls proxy-blocked hosts the event never
  fires, so the wait times out even though the navigation completed instantly. Diagnose in one probe
  before touching the assertion: after the action, `page.waitForTimeout(...)` then print
  `page.url()` + `await page.evaluate(() => document.readyState)` + the still-outstanding requests
  (track `page.on('request'/'requestfinished'/'requestfailed')` into a Map). **`readyState === 'interactive'`
  with a correct URL = rule C, the product is fine.** Item 158's probe: URL already
  `/?token=USDC` with 9 pool cards rendered, `readyState` still `interactive` 12 s later, 10
  `icons.llamao.fi` icons + `mp.defi.garden` + `api.fontshare.com` outstanding. Fix = abort the
  decorative host (`route.abort()`, so the requests never delay `load` at all) **and** drop the wait to
  `waitUntil: 'commit'`; never relax the assertion that follows it.
- **A "fixture" the app never reads is not isolation — check the fixture is actually in force.**
  Snapshot-first loading (item 059) means routing `yields.llama.fi/pools` alone does nothing: the app
  serves `data/pools-snapshot.json` and your fixture is dead code, so the test silently asserts against
  whatever the last CI bake committed. `test_landing.js` did this unnoticed for weeks — 2 fixture pools
  declared, 148 snapshot pools actually rendered. Route `**/data/pools-snapshot*` with a deliberately
  **stale** `generatedAt` (`2020-01-01`) so `tryLoadSnapshot()`'s age check (`app.js:1119`, 6 h) rejects
  it and falls through to the routed live fetch. Verify by counting rendered `.pool-card`s against the
  fixture length — if the count is a big round live-looking number, your fixture isn't in force.
- **Chromium's "Failed to load resource" text never contains the URL.** An ignorable-error filter
  matched only against `msg.text()` cannot classify a single network error. Always test
  `msg.location().url` as well (`test_smoke.js:117-122`).
- **Don't confuse "the chain was killed" with "the chain went red."** A `timeout N npm test` that
  expires mid-file force-closes the browser, and every remaining assertion in that file reports
  `Target page, context or browser has been closed`. That cascade looks like a catastrophic failure and
  is pure artifact. Before ticketing it, re-run that one file standalone with a bigger budget: item
  158's apparent `test_search.js` collapse (2/20, then 18/20) was `20/20 exit 0` given 550 s. Report the
  timebox as the cause, and never report a killed chain as a red.

- **An empty analytics stub queue on `localhost` is not evidence of anything.** Spec 096's host gate
  (`analytics.js:96`; `PRODUCTION_HOSTS` at `:14`) makes `Analytics.track()` return **before**
  `mixpanel.track()` on any non-allowlisted host, so a test that observes analytics by reading
  `window.mixpanel` is structurally guaranteed to read empty off-prod — whatever the product does.
  Four files failed this way at once (item 176) and every failure message read like a missing event
  (`pitch_variant … got undefined`, `no plan_created track call found`). One grep sizes the class:
  `grep -ln "window.mixpanel" test_*.js`. **Two repairs exist and they are not equivalent** — prefer
  the second:
  - wrap `Analytics.track` with a spy and assert on the wrapper. Works, but silently *downgrades*
    every assertion from "Mixpanel received it" to "the product called track()".
  - override **only** the host check — `page.addInitScript(() => { … Analytics.isProductionHost =
    () => true; })` before navigation (shape: `test_analytics_host_gate_render.js:74-89`). The event
    then travels the real path into the same stub queue, so existing queue reads and assertions stay
    byte-unchanged. This is the **rule-C remedy applied to a rule-B cause**: neutralise the
    environment, never weaken the assertion.
  Leave `test_analytics_host_gate_render.js` alone — it reads the queue *to assert it stays empty*,
  and is the negative control for the very gate that rotted the others. Every page/context needs its
  own override; a second `newPage()` silently re-arms the gate.
- **A path in a URL is not proof the test reads that file.** `test_analytics_fires.js` navigates to
  `/tokens/big` while `tokens/big.html` does not exist in the checkout — an irresistible story
  (items 148/174 did churn the slug set) and completely wrong: `:35-38` synthesises the page in
  memory from `test_fixtures/pools-sample.json` and `:44` serves it from the test's own handler.
  Before blaming data churn for a `goto` timeout, check whether the test's own server intercepts the
  path. The real cause was the blocked-subresource trap above — and fixing the invented cause would
  have left the hang to return with the next external host.
- **Repointing has a precondition: the target route must already own the behaviour.** 156's
  repoint-and-re-home rule tempts you to move a displaced assertion onto the obvious sibling route,
  but if that route never had the behaviour, the "re-homed" test is a **feature request wearing a
  test's clothes**, and it holds the merge gate red over something nobody ever promised. Item 176
  briefed a `/plan.html` hub-links case on the strength of the pattern alone; `grep -c seo-hub-links
  plan.html` = **0** — that surface never existed there. Check the target renders the behaviour
  *before* writing the case; if it doesn't, delete the case and file the gap as a backlog item.
  Corollary that saved the same file: when the old element is superseded rather than removed, ask
  which element inherited the job. On bare `/` the static `.seo-hub-links` block is occluded by the
  landing's own `.app-footer` (`landing.js:356-367`), which carries the same `/tokens` + `/chains`
  anchors — so the *user-facing* assertion repoints onto the app footer, while the crawler-surface
  assertion (045) repoints onto **presence in the DOM**, not visibility. Two different truths, two
  different assertions; collapsing them into one is how the case got stale in the first place.
- **The in-flight check is ID-based, so a renumbering PR makes it lie.** `build.md` §1 says an
  existing `claude/loop-<id>` branch or open PR means "skip this item". Item 176 had both — belonging
  to an entirely different item that had renumbered *itself* to 176 after a heartbeat took its
  original number on `main`. Confirm the claimant is the same *work*, not merely the same integer:
  read the PR title/body before skipping. `main` owns numbering; an unmerged branch's self-assigned
  id is a proposal, and it is the one that must move.

## Provenance

Distilled from item **147** (2026-07-26, LOG.md) — `test_minified_assets.js` red on `main` since ~item
122, recorded as pre-existing by loops 117.2/125/128/130/137/138/139/140/143/144/146 and classified for
the first time here: rule **A** (`home.html`/`plan.html` had drifted back to raw `translations.js`/
`planner.js` despite backlog 053 wiring them to the minified bundles) plus rule **B** for the next
stopper (`test_smoke.js`'s bare-`/`-is-planner assertions, stale since the 2026-07-15 landing pivot).

Item **156** (2026-07-27) closed the rule-**B** half this playbook had already named as the next stopper,
and supplied the two additions above (mis-classification trap, repoint-and-re-home resolution). Chain
arithmetic from step 2, worth keeping as the worked example: `test_smoke.js` is file **9 of 90** in
`package.json`'s `&&` chain, so its red hid **81** test files from every plain `npm test` — the fix's
score came from that number, not from the 20-line diff. Its own next stopper is file **10**,
`test_landing.js` (red on `main` for an unrelated harness reason — the landing search itself was probed
working), ticketed separately rather than absorbed.

Rule **D**, the compiled-bundle trap and the unwired-gate trap added from item **155** (2026-07-26) —
`test_audit_app.js`'s number-sanity positive control (the only automated proof that the 122
absurd-number detector works on a real render) went red when item 144's `mean30dSane` rail stopped the
injected value from rendering; two prior loops recorded it as "pre-existing, out of scope" without
classifying it, and the file was not in `npm test`, so nothing surfaced it.

Rule-**C** diagnosis technique, the dead-fixture trap, the URL-vs-text error-matching trap and the
killed-chain-vs-red trap added from item **158** (2026-07-27) — `test_landing.js`, file **10 of 91**,
inherited by name from 156's notes. Three separate harness defects in one file, none of them a product
bug; the chain is now confirmed clear through position **12** (`test_search.js` 20/20 at a 550 s budget),
with positions 13-91 still unobserved because the real-Chromium suite is slower than the 5-minute
foreground timebox.

The host-gate trap, the served-fixture-path trap, the repoint-precondition rule and the ID-collision
note added from item **176** (2026-07-29) — the first run to triage the browser lane as a *set* rather
than one red at a time: **8 files red on `main`, 4 distinct causes, 0 product bugs**. The distribution
is the lesson. Three of the four causes were a shipped, authorized product change that never updated
its witnesses (096's host gate → 4 files; 139's archetype-aware checkout CTA → 1; the 07-15 landing
pivot → 2, the same class 156 fixed in two *other* files), and the fourth was pure sandbox environment
(blocked hosts hanging `waitUntil:'load'` → 1). Every one had been provable in minutes; none had been
classified, and the lane had been reporting nothing useful since item 170 made it runnable the day
before. **A shipped item that changes behaviour owes its witnesses an update in the same diff** — all
three product-change causes here are the same omission, and the cost lands on whoever next reads the
gate. The item's own two genuine findings (occluded static hub links in landing mode; `/plan.html`
carrying no hub-link surface) were surfaced by a builder refusing to adjust a red expectation to match
observed output — the discipline that keeps "make it green" from eating a real defect.
