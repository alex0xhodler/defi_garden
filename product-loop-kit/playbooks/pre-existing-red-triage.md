# pre-existing-red-triage — playbook

**When:** you run the test suite for an unrelated item and a test fails that your diff did not cause —
or your notes are about to contain the phrase *"PRE-EXISTING, proven on a stashed baseline, not fixed
(scope creep)"*. Also: when `npm test` stops early and the files after the stopper never run.

**Answer in one line:** proving it's pre-existing is only HALF the job — a red on `main` is a **real
product regression the test correctly caught** (fix it, it is a product bug), a **stale test encoding an
IA/behavior the product deliberately moved away from** (retire/repoint the test), or a verdict that is
**not a function of the repository at all** (rule E — split the gate, never delete the measurement), and
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
   - **Decision rule E — external-data drift** (item 181): the assertion is evaluated against a
     **live third-party feed at read time** while the thing it judges is **committed bytes**, so the
     verdict is not a function of the repository at all. Tell it apart from A/B in one probe, and do it
     BEFORE reading any code: **re-run the same assertion twice, hours apart, on an unchanged tree, and
     compare the failing SET, not the count.** Same count with different members = drift. Item 181's
     four runs over 15h gave `{kvcm,ripe}` → `{ankravax,gitc,mchc,n3xt,wmetax,zeal,zro}` → 5 of those →
     `{cate,cnx,gitc,hahype,mchc,n3xt,wmetax,zro}`, with two members coming back *alive* and no commit
     in between. Second tell: the generator's own predicate, re-run on today's feed, **agrees** with the
     gate — they are only read at different instants.
     → The defect is the **gate's pass condition**, not the product and not a stale assertion. Split the
     verdict into what the repo decides (fatal at any count) and what the feed decides (bounded budget,
     always printed) — see Resolution E.
   - **Decision rule F — stale proxy metric** (item 185): the assertion does not measure the guarantee,
     it measures a **text artifact that correlates with it** — an occurrence count, a line number, a
     `grep -c`, a file-size number — and something unrelated moved the proxy. Tell it apart in one
     command: **enumerate the individual matches the count is built from and ask which ones are the
     thing.** `A6b` in `test_audit_prescan.js` asserted `reconcilePrescanFindings(` occurs exactly 3×
     (1 definition + 2 call sites); `grep -n` showed **5** — and two of the five were *comment prose*
     added by items 183 and 184. Nothing about the guarantee ("`textSurfaceFindings` is never
     reconciled") had changed, and A6b's four other assertions all still passed. The tell is that the
     failing assertion is the only *aggregate* one in a test whose specific assertions are green.
     → **Rule F is the most dangerous red to ignore**, because it fails in the permissive direction:
     once the threshold is stale, the *real* event it was written to catch (here, a genuine third call
     site) produces a failure message indistinguishable from today's noise. See Resolution F.
   - **Decision rule G — deleted-fixture control** (item 185): a positive control that injects nothing
     and instead **points at a committed artifact that another item deliberately deleted**. Distinct
     from D: nothing suppresses the value on the way to the screen — the input simply is not there any
     more, and the deletion was correct. Two tells: the control names a *path*
     (`staticPages: 'tokens/00.html'`) rather than a value, and the run returns an **empty** result
     (`got: []`) instead of a wrong one. Confirm with `ls` and one `grep` of LOG.md for the item that
     removed it (here: 148, "zero junk slugs remain"). → Resolution G.
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
- **E** → **do not delete the measurement and do not relax the number.** Re-express the one assertion as
  three classes, each with the fatality its cause deserves (item 181, `test_seo_cta_targets.js`):
  1. **contract** — everything decidable from the repo alone (malformed link, wrong/missing threshold
     param, a link whose param doesn't belong to the page it sits on): **fatal at any count > 0**. Take
     the opportunity to ADD the sub-checks the old single-class assertion never made; a split that
     doesn't grow the repo-decidable set is a relaxation wearing a refactor's clothes.
  2. **staleness** — the failure mode the drift explanation would otherwise excuse forever. Anchor it on
     a freshness signal the artifact carries *itself* (these pages render `Last updated <date>`, the same
     string as their `dateModified`), and fail when a dead artifact is older than one regen cadence plus
     one missed run. Drift cannot produce this; a broken regen can only produce this. Unparseable
     freshness on a dead artifact = fatal, never a pass.
  3. **drift** — bounded, always printed with the per-item numbers that let a reader see oscillation vs
     decay (best live value + signed distance from the threshold). The budget must be **derived from
     measurement and stated with its derivation** (181: worst observed 0.37% → budget 1.0%, ~2.7×
     headroom, while the regression class it must still catch was 79.5% — 80× the budget).
  Ship pure `classify()`/`verdict()` functions plus **self-checks on synthetic fixtures that run before
  any network call**, one per class, proving each can still go red without mutating a committed artifact.
  That is the only thing standing between "made the gate honest" and "made the red go away."
- **F** → **do not bump the number.** Re-deriving the constant is the same bug one commit later, and the
  next comment mentioning the symbol re-reds the gate. Move the measurement onto the thing itself:
  normalise the source before counting (strip line comments, block comments and string literals, then
  count real invocations), so prose about the symbol is structurally incapable of moving the number.
  Then re-prove the assertion still bites — a normalisation that over-strips is a vacuous green, which
  is strictly worse than the red you started with. **Both directions, in the test file, on a scratch
  COPY** of the source with the original's md5 asserted unchanged: adding a genuine call site must trip
  it; adding only a comment mentioning the symbol must not. If the proxy cannot be replaced by a direct
  measurement, say so in the notes and keep the proxy *with its derivation written next to it*, so the
  next reader can re-derive rather than guess.
- **G** → **make the control provision its own fixture.** A control anchored to a committed artifact is
  hostage to every future repair of that artifact; the fixture must be created at run time from a real
  page, mutated in exactly the one dimension under test, and removed in a `finally`. Constraints that
  are load-bearing, not stylistic: (1) put it where the harness can actually reach it — `audit-app.js`
  resolves both selection (`path.join(ROOT, s.url)`) and serving (`startServer`, with a
  `!filePath.startsWith(ROOT)` 403) against the repo root, so an `os.tmpdir()` fixture is unreachable
  by construction; (2) put it at the **same directory depth** as the page it copies, or its relative
  asset refs resolve somewhere else; (3) **never** inside a generated estate directory (`tokens/`,
  `chains/`) — re-adding junk to the SEO surface is the defect another item just spent itself removing;
  (4) assert the copied source's md5 is unchanged afterwards (184's method); (5) assert
  `git status --porcelain` is clean of the fixture after the run. And add the assertion whose absence
  made the rot silent: **assert the surface actually ran** (`surfacesCovered` contains it), not merely
  that findings came back the way you expected.
- In all of them: if the red sat in an `&&` chain, say in LOG.md how far the chain gets *after* your fix
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
- **Calling drift what is actually a regression, by looking at the count instead of the members.** Rule E
  is the most abusable rule here: it is the one that ends in "and that is fine." Earn it with two runs
  hours apart on an unchanged tree showing the failing SET churn — never with one run and an argument.
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
- **An input the harness drops silently turns every control into a coin flip.** `buildStaticSurfaces()`
  ends its explicit-override branch with `.filter((s) => fs.existsSync(path.join(ROOT, s.url)))` — an
  override naming a file that no longer exists is discarded with **no note of any kind**, and the run
  returns a well-formed result over zero surfaces. Item 185's criterion 2 surfaced as a FAIL only by
  luck, because it happened to assert the *presence* of a finding; the identical rot in any control
  written the other way round ("assert this page yields nothing") would have gone **green while testing
  nothing**. Before trusting any test that names an input by path, check the harness's drop behaviour
  for a missing input, and grep the file for sibling controls that assert absence — those are the ones
  already lying. The repair is two-sided: make the drop audible in the harness (stderr note, no
  behaviour change), and make the control assert its surface ran.
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

Decision rule **E** and its resolution added from item **181** (2026-07-30) — the class the previous four
rules had no slot for, and which three consecutive runs (175, 177, 180) each hand-baselined as
"pre-existing" without classifying. `test_seo_cta_targets.js` asserted *"zero generated pages whose CTA
returns 0 pools"* against a **live** DefiLlama read, over **committed** static pages baked ~once a day
(`sitemap-update.yml`, dispatched ~05:20 UTC, every run `success`). Both halves were correct and the gate
was still unsatisfiable: `generate-token-pages.js:986-991` wipes and re-mints every bake, so nothing
lingers, but the mint predicate is a hard `tvlUsd >= $100,000` with **zero margin**, and five of seven
dead pages sat within **7%** of that line (two within 1%, two already back above it hours later). **The
tell that generalises beyond this repo: compare failing sets across runs, not counts** — a stable count
with churning membership is drift, and no amount of code reading will show it to you. The two obvious
"fixes" were both rejected on documented grounds and are worth knowing before you re-derive them: mint
hysteresis cannot remove the window (only its frequency), makes the generator stateful, and shrinks
future SEO surface — the NEVER-list question item 148 sat blocked on for five runs; and baking more often
buys ~4× at the cost of a Vercel deployment per bake, which the 2026-07-13 standing decision exists to
prevent. Note what E does **not** license: the user-facing half (a reader clicking into an empty grid
while the pool is under the floor) stayed filed as item 133 / PR #332 leg C. Reclassifying a red as drift
excuses the *gate*, never the product.
