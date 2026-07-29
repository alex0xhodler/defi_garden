# product-audit — playbook

**When:** the heartbeat has no measurable funnel signal (traffic below the minimum-sample rule — the
current pre-traffic reality). Optimizing an unmeasurable metric is premature; instead FIND the product
issues a human would find by driving the app. This is what the human has been doing manually — codify it
so the loop does it.

**Answer in one line:** drive the real rendered surfaces, scan each for the bug classes below, and ticket
every finding into the backlog exactly like a metric-derived opportunity.

## How to drive it (sandbox-aware)
External HTTPS (yields.llama.fi) is connection-blocked in-sandbox, so use the house pattern: Playwright
against a local server with `page.route` fixtures (test_search.js / test_landing.js style), AND/OR render
against the committed `data/pools-snapshot.json` (real data — that's how 122's −900T would have been
caught: it was IN the snapshot). Rotate a subset of surfaces per tick — don't re-audit everything every
run; log which surfaces you covered.

**Fixture traps that fabricate findings (learned 2026-07-25 — three false alarms in one tick):**
- **Snapshot staleness gate.** The committed snapshot is usually older than `SNAPSHOT_MAX_AGE_MS`
  (app.js:1086), so serving it verbatim silently falls through to the LIVE fetch path and the page renders
  0 results — which looks exactly like a dead-end product bug. To exercise the snapshot-first path, route
  `/data/pools-snapshot-meta.json` with `generatedAt: new Date().toISOString()`. To exercise the LIVE path,
  serve `yields.llama.fi/pools` in the LIVE shape `{status:'success', data:[…]}` (add `apy` per pool) —
  the snapshot shape (`{pools:[…]}`) makes the live loader read `data.data` → undefined → false "0 results".
- **Async meta reads.** The 012 noindex (and other effect-injected state) lands seconds after "load" —
  babel-standalone compile + data fetch first. A single read at ~4s false-negatives; POLL up to ~10s
  before claiming noindex/empty-state didn't fire.
- **Money-format regex.** House style abbreviates TVL as `$11.2K` / `$273.3M` — a `\$\d+\.\d` scan flags
  these as 1-decimal violations. Exclude a trailing `[KMBT]` before flagging; the real 126-class bug is
  `$0.1` with NO suffix.
- **A crashed scanner is not a clean scanner (learned 2026-07-26).** A fresh clone has no `node_modules`,
  so `node audit-app.js` dies with `MODULE_NOT_FOUND: playwright` and writes NO findings file — leaving
  yesterday's `signals/audit-findings.json` on disk to be mis-read as today's clean run. **Before recording
  "audit clean", confirm `surfacesCovered` is non-empty and its `generatedAt` is from THIS tick.** Re-run
  with `NODE_PATH=/opt/node22/lib/node_modules` (playwright is installed globally) or `npm install` first.
  → ticketed **149** (make the script self-heal and fail loudly).

## Surfaces to drive
- `/` — planner hero (default funnel top)
- `?token=<common>` (e.g. USDC) — grid renders pool cards
- `?token=<obscure/all-sub-$10M>` — the dead-end class (item 133)
- `?chain=<X>`
- `?pool=<live id>` — **pool detail = the current north-star surface** (audit this every tick)
- `?pool=<dead id>` — 072 dead-pool empty state
- `/tokens/<slug>`, `/chains/<slug>` — static SEO pages. Drive a **sample**, not just `usdc`/`ethereum`:
  the junk lives in the tail of the 2,079-page set, never in the flagship page (item 154)

## Bug-class checklist (smell → check → the finding it came from)
1. **Number sanity.** Scan rendered text for `NaN`/`Infinity`/`undefined`/`null`; absurd magnitude (a
   rate/score with `|value| > ~1e4` is almost always a divide-by-near-zero — see
   `analytics-regression-triage.md`); money not en-US 2dp (`$0.1` not `$0.10`, missing thousands
   separators); unformatted APY/TVL. → caught **122** (−900,719,925,474,097.9), **126** (`$0.1`), 032/033
   (all-0.00%).
   **AND: percentages are absurd RELATIVE TO THE TRUST RAIL, not to 1e11.** A magnitude scan tuned to the
   122 class (`ABSURD_MAGNITUDE = 1e11`, `audit-app.js:55`) cannot see an out-of-rail *rate*: `36,452.4%`
   is only 3.6e4 and sails straight through, yet it is 36× `APY_SANITY_LIMIT` (1000%) and reads as
   broken to any human. Decision rule: **any rendered `%` figure > `APY_SANITY_LIMIT` on a pool that is
   NOT anomaly-flagged is a finding** — the rail defines what the product itself calls not-credible, so
   showing it unflagged is a contradiction. Corollary when auditing a *derived* numeric field: find EVERY
   render site of that field (`grep` the raw property name) and check each has a bound — the trust rails
   are enforced per-field, so `totalApy` being railed says nothing about `apyMean30d`. → caught **144**
   (`apyMean30d = 36452.38798` on balancer-v2 WSTETH-AAVE rendering as a trusted "30d Mean APY" card + in
   the 071 note's prose, on a pool whose `totalApy = 0.24` keeps it un-flagged).
2. **Dead-end as primary content.** The page's MAIN region is an empty / error / "no results" / "$0.00" /
   all-0% state for a VALID query. → **133** ($10M dead-end on small tokens), token pages all-0%.
3. **Loading flash.** Render with delayed/empty data first; the pre-load view must NOT claim "no results"
   (must show a loading state). → **132** (empty-state ternary gated on `filteredPools.length>0`, not
   `loading`).
4. **Console / page errors.** Zero `pageerror` / `console.error` on every driven surface — `error_occurred`
   is a guardrail; catch it BEFORE users do. → 044, 082.
5. **Raw i18n keys / missing KO.** No `t('…')`-shaped or camelCase keys leaking; EN and KO both render
   (toggle `?lang=ko`). → recurring hard-rule (EN+KO together). **AND: check KO money figures for
   currency-unit truth** — a KO string can render perfect Korean while relabeling a raw USD number as
   `원` (Won) with no conversion, which is a number-sanity bug wearing an i18n costume; compare the KO
   figure against the EN `$` figure for the same value and flag any unit swap without conversion. →
   caught **137** (`formatKoreanCurrency` stamping 원 onto USD across every pool-detail money string).
6. **Dead CTAs / broken links.** Every primary CTA + link resolves (no dead clicks); the two north-star
   CTAs ("Garden this pool", "Start Earning") fire their events. → 029 (dead pool rows).
7. **Responsive / dark.** No horizontal body scroll at 360px; dark mode renders; focus rings present. →
   recurring design-system rule (360/768/1280 + dark). **AND: assert the primary CTA's bounding box is
   fully inside the viewport/visible ancestor at 360px** — an ancestor with `overflow:hidden` can clip a
   min-width child invisible while `document.body.scrollWidth` stays clean, so a scrollWidth-only check
   passes on a page whose main CTA is gone. → caught **136** (pool-detail `.pool-action-card` min-width
   300px inside a 240px mobile flex parent, clipped by `.pool-hero-card` overflow:hidden; body scrollWidth
   352 ≤ 360 the whole time).
8. **Honest labels (JUDGMENT — flag, don't auto-fix).** Category/type matches the data (SUSDS on
   sky-lending ≠ "Yield Farming"). Surface for human review. → 130.
9. **URL provenance: is that weird URL ours? (learned 2026-07-26 — the check `audit-app.js` cannot do.)**
   The scanner only drives surfaces we hand it, so it can never find a surface we should not be generating
   at all. Once per tick, read the prod `page_view`-by-`$current_url` breakdown and pick out every URL whose
   parameters look like garbage (`?token=22OCT2026`, `?token=20`, `?token=20)`). For each, answer **"did we
   generate this, or did a crawler invent it?"** — `grep` the literal value in the generated surface
   (`sitemap-*.xml`, `tokens/`, `chains/`, `llms*.txt`) and, if it is ours, walk back to the generator
   function that minted it. Do NOT assume crawler-invention: on 2026-07-23 the odd `?chain=robinhood` URLs
   genuinely were crawler-invented and that (correct) verdict made the whole class feel safe, so the
   2026-07-26 batch was nearly waved through — they turned out to be ours. The generator bug class is
   **string-splitting a compound symbol**: `PT-SUSDE-22OCT2026`.split(`/[-_\/\s]/`) yields the expiry date
   as a "token", and a permissive validity regex (`^[A-Z0-9][A-Z0-9.\-_]{1,14}$`) waves it through into a
   real page + sitemap entry + OG image + IndexNow submission, ×2 languages. → caught **148**.
   Decision rule: **any generated URL whose slug is a pure number or a date fragment is a finding** — no
   human searches it, and it is thin by construction. Corollary: when auditing any surface built by
   splitting a data field, check the *validity predicate*, not the output list — the junk set is
   data-dependent and churns daily (8 date fragments in today's snapshot; only 2 of them committed).

10. **Link-target integrity: does that URL go where the line says it goes? (learned 2026-07-28, item 166 —
   the class that hid *underneath* a fixed P0.)** Check 6 covers dead CTAs on **rendered** surfaces; this is
   its counterpart for **generated text** surfaces (`llms.txt`, `llms-full.txt`, and any future machine-
   readable artifact), where a link is a plain string nobody clicks in testing. Three sub-checks, each of
   which caught a live prod defect on 2026-07-28:
   - **(a) Is the query param actually routed?** Extract every `?<key>=` the surface emits and assert
     membership in `ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}`, read out of `home.html:77-78` — never a
     hardcoded second copy of those lists. 17 links used `?search=`, which is in neither list, so the IA
     router resolved `__APP_MODE = 'landing'` and `landing.js:52` (which reads only `lang`) dropped the
     query: the reader asked for `lido` and got an empty search box. The correct param, `?protocols=`,
     already existed.
   - **(b) Does a row about a SPECIFIC thing link to the bare origin?** 15 pool rows rendered
     `- uniswap-v3 · WETH-USDC — 95.55% APY, $110,825,218 TVL — https://www.defi.garden`. Root cause is the
     trap below.
   - **(c) Do two rows claiming DIFFERENT figures share one URL?** Two distinct Base uniswap-v3 WETH-USDC
     pools (95.5%/$110.8M and 31.7%/$10.2M) pointed at the same `?token=&chain=` grid URL — reading as
     contradictory claims about one page. A URL that cannot address the row's subject is the smell.
   **Decision rule:** any row that names a specific pool/protocol must link to a URL that *addresses* it —
   for pools that means `/?pool=<id>`, the north-star surface (2026-07-23), and `grep -c "?pool="` over the
   generated surfaces is the one-command version of this whole check. It returned **0** on both files.
   **The trap worth internalising: `pool.url || meta.baseUrl` is not a fallback, it is an unconditional
   branch** — no DefiLlama payload has a `url` field, in either the snapshot or the live shape, so the right
   side fired on 100% of rows for the life of the surface while reading as defensive code. Before trusting
   any `||` fallback on payload data, prove the left side exists: `grep -c '"url"' data/pools-snapshot.json`.
   Sibling of `dual-source-logic-divergence.md`.

## Severity → score (so audit findings compete with metric opportunities)
- **P0** broken number / page error / astronomical value on a live surface (trust-breaker) → 9+.
- **P1** dead-end for a valid query / loading flash / dead CTA → 7–8.
- **P2** format / label / responsive polish → 5–6.
Ticket each as a normal backlog row (rows-only, spec at build time); a rendered-Playwright repro in the
row is the strongest evidence.

## Automatability
Checks 1–7 are mechanized: **`audit-app.js` shipped (item 142, 2026-07-25)** — a read-only Playwright
scanner over the surface rotation emitting `signals/audit-findings.json` for the heartbeat to ticket.
Known blind spot (144): its number-sanity check is magnitude-only (`ABSURD_MAGNITUDE = 1e11`), so
out-of-rail **percentages** — the 144 class — pass clean. Candidate extension: a rail-relative percent
check per the decision rule in class 1 above.

**Generated-surface sampling (item 154, 2026-07-26).** The static-SEO leg used to be ONE hand-picked page
(`/tokens/usdc.html` — the best page in the set) out of 2,079 token + 88 chain pages, which is why the
scanner scored 10 surfaces / 0 findings on the same day a human found item 148 by hand. It now drives an
anchor page **plus a deterministic rotating sample** (`AUDIT_STATIC_SAMPLE`, default 6; seeded by UTC date
via `AUDIT_STATIC_SEED`, so a same-day re-run reproduces a finding and the next day covers a different
slice), and the `kind:'static'` branch flags three page-level classes: `junk-slug` (rendered `<h1>` lead
token pure-numeric or date-shaped — the 148 class), `zero-yield-claim` (`"up to 0.00% APY"` — item 032's
gate leaking, the PT/fixed-yield class), and `empty-table` (zero `.tp-pool-link`/`.cp-pool-link` rows —
soft-404). Use `AUDIT_STATIC_PAGES=<rel,paths>` to pin exact pages when reproducing.

That narrows check 9 but does not close it. The scanner can now see **a bad page that exists on disk**;
it still cannot see **a URL class that was never generated into the repo** (crawler-walked app URLs like
`?token=22OCT2026`). Split the class accordingly: on-disk junk → `audit-app.js`; live-URL provenance →
the Mixpanel URL breakdown, every tick. Check 8 stays human judgment.
A tick where `audit-app.js` returns 0 findings is still NOT a tick with nothing to look at — 2026-07-26
scored 0 findings across 10 surfaces and still produced 148 from the URL-provenance check.

**Trap (154):** when a scanner starts reporting a class that is genuinely live, an existing "clean run"
acceptance test will go red on TRUE positives. Scope that test to the surfaces it was written about
(`runAudit({only: [...]})`) — never downgrade a severity or filter the finding away to restore green. The
scanner's honesty is the product.

**Prescan-before-render (item 157, 2026-07-27).** 154's rotation samples the 2,176-page static-SEO set
*uniformly* — a specific known-bad page is found with p ≈ (sample size / page count) per day, ~1.3% at the
default. `prescanStaticPages()` closes that gap the CHEAP way: a pure `fs` + regex pass over **every**
leaf page (no Playwright, no network, seconds not minutes) reusing the exact same predicates the rendered
checks already use (`JUNK_SLUG_NUMERIC`/`JUNK_SLUG_DATE`/`ZERO_YIELD_CLAIM`), plus two prescan-only text
checks (`broken-number-literal`: bare `NaN`/`Infinity`/`undefined`/`null`; `absurd-magnitude`: a `$…T`/`…Q`
magnitude in visible text — tightened with a `(^|[^A-Za-z0-9])` prefix guard so it does NOT false-positive
on in-word digit sequences like `tokens/a0t.html`'s "A0T" containing "0T"). `buildStaticSurfaces()` then
promotes up to `AUDIT_STATIC_PRESCAN_MAX` (default 4, clamped to the sample size) of the suspects it finds
into the rendered sample AHEAD of the uniform rotation — same-day coverage of the whole set at roughly the
same render budget, since promoted pages replace uniform picks rather than adding to them. When there are
more suspects than the cap, which ones get promoted is chosen by the same seeded `sampleBySeed()` the
rotation already uses (keyed `seed + ':prescan'`), so the backlog of suspects gets worked through over
successive days instead of re-rendering the same few. A prescan-enabled run also emits one **aggregate**
`static-prescan:<signal>` finding per signal with ≥1 suspect (≤10 example slugs, a systemic defect must not
emit one finding per page) — `runAudit()`'s result gains a `prescan: {scanned, suspectCount, bySignal,
promoted}` field. Kill switch: `AUDIT_STATIC_PRESCAN=0` / `opts.prescan === false`; already off whenever
`AUDIT_STATIC_PAGES` pins exact pages (that override stays verbatim, unchanged from 154).
**General lesson: for any large generated surface, prescan the cheap way (fs+regex, no render) BEFORE
spending the expensive render budget, and aim the render at what the prescan flagged as suspicious** — the
uniform-sample-and-hope pattern this replaces is the default failure mode for auditing anything at scale.

**The same blind spot exists on the APP surfaces, not just the generated ones (item 167, 2026-07-28).**
154/157 fixed target-selection for the 2,176-page static set and stopped there — so for two more weeks the
scanner rendered **five** pool-detail surfaces a day (`pool-detail`, `-360`, `-dark`, `-ko`, plus the
dead-pool control) all pointing at **one hardcoded pool**, `PREFERRED_POOL_ID` = Lido stETH
(`audit-app.js:88-91`, resolved at `:1065-1068`), out of **740** pools in `data/pools-snapshot.json`.
That is 0.14% coverage of the north-star surface, on the single most blue-chip row in the dataset.
The proof that it mattered: **every** pool-detail bug in this backlog's history was hand-found on a
non-flagship pool — 122 (−900T stability score, balancer-v2), 144 and 145 (both pool
`201e5f6e-cf75-4d0e-b07f-d58da3cee23a`), 165 (zeebu ZBU's $49-quintillion projection). Not one is Lido
stETH, so the scanner could not have caught any of them — not because `number-sanity` (P0) is wrong, but
because it was never aimed at a pool that could trip it. As of 2026-07-28 that snapshot still carried a
live true positive the scanner had never rendered: `201e5f6e-…` with `apyMean30d` = 30,282.55%, 30× the
rail. Fix = 157's prescan-then-promote pattern applied to the snapshot (`prescanPools()` +
`buildPoolSurfaces()`, `AUDIT_POOL_*` switches, a `poolPrescan` block in the findings JSON).

**Decision rule, and it generalises past this scanner:** for every surface an audit drives, ask *"what
population is this one target drawn from, and what fraction of it can this selection ever reach?"* If the
answer is "one hand-picked member of a set of N", the clean run is vacuous for the other N−1 — LEARNINGS
2026-07-27 takeaway 2 ("a filter that returns zero is not evidence of health until you have proven it can
return non-zero") applied to *targets* rather than to *predicates*. A hardcoded id chosen for being
reliably good is the strongest possible guarantee the check never fires. Prescan the population cheaply
(no render), promote the suspects, rotate the rest by seed.

**Text surfaces are covered for numbers, not for claims (item 160 shipped 2026-07-27; gap found
2026-07-28).** `prescanTextSurfaces()` now reads `llms.txt`/`llms-full.txt` with four signals —
`apy-rail-breach`, `broken-number-literal`, `tvl-floor-claim`, `empty-surface`. All four are
number-or-emptiness checks, because 160 was specced from 159, which was a number bug. It returned
`suspectCount: 0` on the same tick that hand-found **32 mis-targeted links on those exact two files**
(check 10 above) and the total absence of the planner from the surface (item 168). → ticketed **169**
(add `link-target-integrity`).
**The generalisable rule, now on its third instance (148 → 159 → 166): a checker's signal set is always
drawn from the last bug someone was bitten by, so the next bug is in whatever class no one has been bitten
by yet.** Whenever you add a check, ask explicitly: *what could sit on this surface and still pass?* And
treat "the scanner is clean" as scoped to the classes it implements — write it that way in the report. Note
that item 167 above is the same rule applied to *targets* (one hardcoded pool out of 740) while this is the
same rule applied to *claim classes*; the shared question is "what can this check never reach?"
**Corollary for the heartbeat's surface rotation: the cheapest place to find the next defect is the surface
you audited yesterday**, one class over. Three of the last four P0/P1s (148, 159, 166) were hand-found on
generated surfaces on days the scanner reported nothing new, and 166 was found by re-opening the file 159
had just fixed.

**Check 10 has an HTML half, and it is 1,000× bigger than the text half (item 172, 2026-07-29).**
169 gave `prescanTextSurfaces()` a `link-target-integrity` signal over **2** files. The generated **HTML**
surface — 2,094 `tokens/*.html` + 89 `chains/*.html` — emits **~41,300** same-origin links, **4,989** of
them `/?pool=<id>`, the exact hop an SEO lander must make to reach the north-star CTAs. `PRESCAN_SIGNALS`
had no link signal at all. Three sub-rules port cleanly to HTML, and the porting is where the traps live:
- **The allowed-param set depends on the link's PATH, not just the router.** `?key=` membership in
  `ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}` is the right rule only for links to `/`, where the IA
  router arbitrates mode. A `/plan.html?…` link is the planner *by path*, so router membership says
  nothing — the live surface emits `/plan.html?waitlist=1&src=seo_token` (item 062) and neither key is in
  either router array. Single-source that half from `planner.js`'s own `urlParams.get('<key>')` call sites
  rather than allow-listing the two keys, or the check rots the moment a third one appears. Links to a
  fixed page (`/tokens/…`, `/chains/…`) have inert queries — skip them.
- **Decode HTML entities before parsing a query string.** `href="/plan.html?waitlist=1&amp;src=x"` is
  *correct* HTML. Splitting the raw attribute on `&` invents a phantom key `amp;src` — 2,183 fake findings
  on this repo, measured. `&amp;` → `&` first, always.
- **Do not validate `?pool=<id>` liveness against `data/pools-snapshot.json`.** The snapshot is the
  ≥$10M-floored 745-pool set; token pages use a $100K floor over the full ~16,000-pool feed. Validating
  one against the other reports **4,233 of 4,989** links dead — all false. Measured against a live
  DefiLlama fetch the same day, the true number is **15** (0.3%, 14 pages), and it self-heals on the next
  daily CI regen. Liveness is an *online* check; the offline prescan checks shape and on-disk existence
  only. Generalised rule: **validate a generated link against the population its generator drew from, not
  against whatever dataset is nearest to hand.**
- The third sub-rule with no text-surface equivalent: **does the internal target exist on disk?**
  (`/tokens/x` → `tokens/x.html` / `tokens/x/index.html`). Live risk class, because 030/032/033 drop a
  page when its quality gate stops passing and 031 deletes stale pages, while 023's related-token
  cross-links were minted when the neighbour still qualified. Measured 0 broken of ~41,300 today — which
  is exactly why it needs a positive control before anyone calls it green.

11. **Cross-surface contract: does the target return what the linking page CLAIMS? (learned 2026-07-29,
   item 173 — the class four rounds of link-checking could not see.)** Class 10 asks whether a link is
   *shaped* right. This asks whether it *delivers*. It is the level nobody checks, and it is where the
   biggest finding on this repo lived: **1,749 of 2,200 indexed SEO pages (79.5%) had a primary CTA that
   landed on an empty grid** — `chains/cardano.html` naming "33 pools" above a "See live pools on Cardano →"
   button that returned 0.
   **A link check has three levels. Run all three; they fail differently:**
   - **(1) Routed** — is the query key in `ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}`? (class 10a; 166.)
   - **(2) Resolvable** — does the value name a real entity (project slug, preset key)? Validate against
     *the population the generator drew from*, never the nearest dataset — see class 10's 4,233-false-
     positive trap for `?pool=` ids.
   - **(3) Non-empty** — simulate the target's OWN default filters and assert the result is non-zero, and
     where the page states a count, that it *matches*. For this repo: the substring symbol match
     (`app.js:835`), exact chain match, and the `minTvl` rule at `app.js:927` (explicit param wins; absent
     → `DEFAULT_MIN_TVL`). Cardano at the default → 0; with `&minTvl=100000` → 33, the page's exact claim.
   **The root-cause smell, and the reason level 3 is structurally invisible to the other two: BOTH SURFACES
   ARE INDIVIDUALLY CORRECT AND THE CONTRACT BETWEEN THEM IS BROKEN.** `generate-token-pages.js:60`
   (`MIN_POOL_TVL = 100000`) is right about its own page; `app.js:801` (`DEFAULT_MIN_TVL = 10000000`) is
   right about the app; the link between them is a lie. 100×. A checker that validates one surface against
   itself can never see it — which is why 148 → 159 → 166 → 173 all slipped through, each one auditing one
   side. **Decision rule: whenever two artifacts here are built from the same data by different code paths,
   audit the CONTRACT — diff the filters/floors/predicates each path applies, and check every link that
   crosses between them.** Sibling of `dual-source-logic-divergence.md`.
   Cheapest first move, ~15 lines of node: for every generated page, extract the primary CTA, evaluate it
   against a live feed, count the zeros. That is how 173 was found.
   **FIXING one (added 2026-07-29 after 173 shipped — the diagnosis above is only half the playbook):**
   - **Make the link carry the contract, don't move either floor.** The fix is to append the *linking
     page's own* parameter (`&minTvl=${MIN_POOL_TVL}`) — read from the existing exported constant, never a
     re-typed literal (the 159 rule). Changing `DEFAULT_MIN_TVL` instead would be a trust-rail edit and is
     on the NEVER list. One injection site is usually enough: check whether the derived links
     (`categoryLinksFor()`'s `&poolTypes=` variants, `poolHrefFor()`'s fallback) are built *from* the base
     URL — if so they inherit it, and adding a second site creates a new drift surface.
   - **TRAP — the fix may silently change the DATA PATH, not just the filter.** `app.js:1140`'s
     `snapshotEligible` requires `minTvl >= DEFAULT_MIN_TVL`, so a link carrying a *lower* floor skips
     `data/pools-snapshot.json` (which only holds ≥$10M pools) and forces `loadLive()`. Here that is
     load-bearing — the snapshot *could never* have served the page's set — but it costs the instant first
     paint. Always ask: after this change, which source does the landing read from? Answer it in the
     rendered app, not from the URL string.
   - **TRAP — a param in `canonical.js`'s `CANONICAL_PARAMS` mints a new canonical URL.** `minTvl` is on
     that list, so every fixed link now points at a self-canonical variant that is *not* in the sitemap.
     Not a de-indexing (no page removed, no `noindex`), but flag it — do not "fix" it by editing
     `canonical.js`, which is sacred parameterized-URL behaviour.
   - **TRAP — pre-existing tests hardcode the OLD href string.** `test_token_pages.js`/`test_chain_pages.js`
     each asserted an exact CTA URL. Expect them to go red; update them to interpolate the constant rather
     than typing the number a second time. Budget for this — it is not scope creep, it is the fix.
   - **Prove it red on the PRE-change output.** Run the new checker against the committed pages *before*
     regenerating and record the transcript; then regenerate and re-run. 173: 2,200/2,200 dead → 0/2,217.
     Assert BOTH conditions (carries the floor AND returns ≥1) — the first alone would pass a link that is
     correctly shaped and still empty, which is the whole bug class.
   - **A regen diff always carries churn — separate it from your change before claiming anything.** 173's
     regen dropped 24 token pages and added 41. Re-run the generator's own ranking function against the
     live feed for every dropped slug to prove each genuinely fell below the floor; that is what
     distinguishes ordinary daily churn from code-caused de-indexing (the NEVER-list bright line).
     Full recipe: `seo-surface-regen-delta.md`.

12. **Trust-claim provenance: does the page describe the filter it actually applied? (learned 2026-07-29,
   item 174 — 159's defect at 1,100× the page count.)** 159 caught `llms.txt` claiming `TVL ≥ $10k` while
   the product filtered at $10M. **Nobody re-ran that check on the other 2,200 pages**, all of which said,
   under the FAQ heading *"Are these rates safe?"*: *"Every rate shown passes DeFi Garden's trust filters —
   a $100K minimum TVL."*
   - **Grep every generated surface for every rail claim after fixing one of them.** A rail claim is any
     rendered sentence naming a TVL floor, an APY limit, or "trust filter". Fixing the instance that bit you
     and stopping is how a 2-file fix leaves 2,200 pages broken.
   - **A claim scoped to the page ("pools on this page clear $100K") is honest; a claim scoped to the
     product ("DeFi Garden's trust filters are $100K") is false** if the product's constant differs. Read
     the sentence's subject, not just its number.
   - **Follow the claim into every DERIVED number on the page.** 1,713 pages carried a forever-number
     (*"park $3.4K and it could run a $20/mo Claude Pro subscription, forever"*) blended from pools below
     the product's floor — the SUBSCRIPTION archetype's trust-critical output, computed off pools the
     product refuses to display. Same page, same generator, worse consequence than the copy itself.
   - **And check the table the claim sits above:** 916 rows across 462 pages listed a pool at `0.00%` APY
     under a "DeFi Yields" heading (the 032/033 class).

13. **Signal hygiene: run the prod filter AND the unfiltered control, claim only the filtered one
   (learned 2026-07-29).** The same daily-trend query, unfiltered, showed `session_start` 40 and
   **`error_occurred` 3** on 07-15; with `$current_url contains www.defi.garden` it showed 5 and **0**. The
   difference is our own localhost/preview sessions. A tick that drops the filter reports a phantom error
   spike and breaks its own guardrail streak; a tick that never runs the unfiltered control cannot
   distinguish a true prod-zero from a filter typo silently matching nothing. Record both numbers in the
   snapshot; make the guardrail claim from the filtered one only.

**Provenance:** the human's manual audits 2026-07-23 (pool-detail audit → 122/126/127…; the $10M
dead-end + loading flash → 132/133) and the observation that a signal-driven heartbeat finds NONE of these
pre-traffic. Classes 11-13 added 2026-07-29 from items 173/174 — the tick that found 1,749 dead CTAs
by checking, for the first time, whether a link DELIVERS rather than whether it PARSES. Seeded from every mechanically-detectable bug caught this session. Item 157's prescan
promotion traces to 154's own honest follow-up note (`specs/154-notes.md:235-248`).
