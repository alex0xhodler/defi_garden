# 213 — build notes

Branch `claude/loop-213`, base `20e338756` (`origin/main` advanced to `9ab9a2432` — a daily
`chore: update sitemap` regen — during the build; rebased before push). Operator: Opus 5 (pickup,
blindspot pass, architecture decisions, verification judgment); implementation by dispatched Sonnet 5
coding agents per the 2026-07-13 / 2026-08-03 execution-model directive.

## Pickup

Two rows read `READY` at pickup — **213 (7.0)** and 211 (6.0). 213 taken as the highest-scored.
`git ls-remote origin 'refs/heads/claude/loop-213' 'refs/heads/claude/loop-211'` returned **empty**
(nothing in flight), tree clean, spec `specs/213.md` already existed (no promotion, no spec-writing
needed). 213's stated dependency on **212** is satisfied: 212 merged as #369 with its follow-up #370.

## The spec's open question, answered with a measured number

The spec asks for the twin-population size **before** building leg 1, so the human can veto on
repo-churn grounds. Measured against the committed estate:

| quantity | measured |
|---|---|
| `tokens/` + `chains/` HTML files scanned | 2,159 |
| distinct `?pool=` deep-linked ids in the estate | **3,634** |
| of those, present in `data/pools-snapshot.json` (the $10M-floor, kpis-bearing file) | 427 |
| snapshot pool count / floor | 734 / $10,000,000 |

So ~88% of the deep-linked population lives **below** the snapshot's floor — consistent with the
spec's own "88.6% sub-$10M" figure, derived independently here. Those pools are covered by the CI SEO
transient (`$RUNNER_TEMP/seo-pools.json`, $1,000 floor), which is the same artifact the token/chain
generators already consume.

**The size number the spec asked for, measured not estimated.** A real local run
(`node generate-pool-pages.js`, snapshot tier only, no CI fixture) wrote **427 twins / 350,103 bytes /
820 bytes per file**. Projected across the full 3,634-id population at that mean:

> **≈ 2.98 MB of `.md` per full regen, across ~3,634 files.**

For scale, the estate this sits beside is already 2,159 committed HTML files. The daily regen rewrites
the token/chain HTML wholesale today, so the incremental commit churn is of the same kind, roughly a
third more files, and ~3 MB. **The operator's read: this is comfortably below the threshold where the
spec's fallback (twins only for pools deep-linked from pages that rank) would be worth its
complexity.** The full population ships. The human can still veto on churn grounds — the number is
here so that is an informed call rather than a guess, which is what the open question asked for.

## Architecture decisions the operator made before dispatching

**1. Data source is the snapshot first, the SEO transient second — and that is what makes parity structural.**
`data/pools-snapshot.json` is byte-for-byte the file the rendered pool-detail page reads
(`app.js:1123`/`:1260`, snapshot-first). It is also the **only** source carrying `kpis`, because
`compute-kpis.js` runs *after* `generate-pools-snapshot.js --seo-out` writes the transient. So the
generator prefers the snapshot record per id and falls back to the transient. The consequence is
exactly right rather than merely convenient: a pool the page has no kpis for is a pool the twin has no
kpis for, so 207's honest "no rate history" line appears in the twin in precisely the cases the page
shows it.

**2. Negotiation goes in `redirects`, not `rewrites`.** Item 212's follow-up (#370) established by live
curl that Vercel's pipeline is `redirects → filesystem → rewrites`, which killed 212's original
rewrite-based negotiation for every page that actually had a twin. 213 uses `redirects` from the
start, `permanent: false` (307, not 308 — the response varies by `Accept`).

**3. The twins are EN-only and add ZERO translation keys.** CLAUDE.md requires EN+KO to change
together; adding no keys satisfies that by construction. Every string is an existing key read through
`createTranslationFunction('en')`.

## Deviations from the spec

**1. The unknown-id fallthrough is a 404, not the HTML page. This is a platform limit, not a shortcut.**

The spec's criterion reads: *"An unknown/dead `?pool=` id falls through to the normal HTML (which has
the 072 dead-pool empty state), never to `llms.txt`."* Static Vercel config cannot express
"serve the twin if it exists, else serve the app":

- A `redirect` cannot test file existence. It fires or it doesn't.
- The rewrite-based fallback *does* fire only on a filesystem miss (rewrites run after the filesystem —
  212's finding, used in the other direction) — but the request path is then `/pools/<id>.md`, which
  matches the existing `/(.*)\.md` header rule and would serve **HTML under
  `Content-Type: text/markdown`**. That is a confidently-wrong content type, which is the exact failure
  mode 212 exists to remove. Rejected.
- An edge/serverless function could do it, and would break the no-build-step static architecture the
  spec explicitly protects.

What shipped instead, and what it actually buys:

- The redirect's `has` constrains the `pool` value to a **UUID shape**. A malformed / non-UUID id
  therefore never redirects and **does** fall through to the normal HTML app — that half of the
  criterion holds literally.
- A UUID-shaped id with **no** twin returns **404**. This is item 212's shipped-and-verifier-passed
  precedent verbatim: a 404 is an honest "no document here", versus a confidently-wrong body.
- The criterion's load-bearing half — **never `llms.txt`, never the generic index, never another
  pool's twin** — holds absolutely, and is asserted by test rather than argued.

Recorded as a partial pass, not claimed as a pass.

**2. `pools/*.md` output is NOT committed in this PR — same parity reasoning as 212.**

The estate HTML is written by `sitemap-update.yml` from one live DefiLlama fetch. Generating twins here
would pair them with HTML from a *different* fetch, so the committed twin's APY would disagree with the
committed HTML on day one — failing the spec's own fact-parity criterion the moment it landed. Parity
is structural only when both come out of the same CI run. `generate-pool-pages.js` is in the
workflow's `push.paths`, so **merging this PR is itself the trigger**.

**Honest cost, stated rather than buried:** between merge and that CI run completing,
`Accept: text/markdown` on `/?pool=<uuid>` returns **404** rather than markdown. Same trade 212 took,
for the same reason, and the window is one CI run.

## Baseline — and a wrong baseline caught before it became a wrong claim

**Corrected result: `origin/main` @ `20e338756` plain lane = `pass=44 fail=0 timeout=0`. There is no
pre-existing red in this lane.** Branch = `pass=45 fail=0` (+1 = `test_pool_twins.js`;
`test_pool_twin_parity.js` is browser-lane and was run separately).

The first baseline this run took said something different, and the way it was wrong is worth recording
because it would have shipped as a false claim:

```
node run-tests.js --lane=plain   →   pass=38  fail=1  total=39
FAIL  test_seo_cta_targets.js — 34 stale failure(s) (dead CTA + generation date > 2 days old)
```

That worktree was created with `git worktree add … origin/main`, and **the local `origin/main`
remote-tracking ref was stale** — it still pointed at `9ab9a2432` (2026-07-31) while main's real tip
was `20e338756` (2026-08-03, 212's follow-up). So the "baseline" was a 3-day-old tree whose
`tokens/*.html` were genuinely 3 days past `test_seo_cta_targets.js`'s 2-day freshness budget. **The
red was manufactured by the stale checkout, not pre-existing on main.**

Caught by a discrepancy that had no innocent explanation: the same test **passed on the branch and
failed on the "baseline"**, which a diff adding a new generator cannot cause. Chasing that
inconsistency instead of writing it down surfaced the stale ref (`git merge-base --is-ancestor` showed
the supposed baseline was an *ancestor* of the branch base, i.e. older, not newer). After
`git fetch origin main`, `origin/main` == `20e338756` == this branch's base, so **no rebase was
needed** either.

Two things this cost nothing to learn: a baseline worktree is only a baseline if the ref was fetched in
the same run, and "the branch is greener than main" deserves the same suspicion as the reverse.

## Test results

| gate | result |
|---|---|
| `origin/main` @ `20e338756` plain lane (baseline) | 44 pass / 0 fail / 0 timeout |
| branch plain lane | **45 pass / 0 fail / 0 timeout** |
| `test_pool_twins.js` (new, plain) | **36/36** |
| `test_pool_twin_parity.js` (new, browser — real Chromium, 12 real snapshot pools) | **36/36, zero page errors** |
| `test_markdown_negotiation.js` (extended) | **91/91** (was 76) |
| `test_smoke.js` — both router paths @ 360/768/1280 | **11/11** |
| `test_test_registry.js` | 5/5 (no orphans/ghosts/duplicates) |

Lane classification verified via `node run-tests.js --list`: `test_pool_twins.js` → `plain`,
`test_pool_twin_parity.js` → `browser`.

**Timebox honesty:** the full ~73-file browser lane was **NOT** run and is **NOT** claimed green (5-min
foreground cap, standing decision 2026-07-11). The two browser-lane gates that this diff could plausibly
affect were each run individually and are reported above: `test_pool_twin_parity.js` (this item's own
rendered acceptance) and `test_smoke.js` (the both-router-paths guardrail). No render-path product file
is touched by this diff — `app.js`, `PoolDetail.js`, `planner.js`, `home.html` and `translations.js` are
all byte-untouched — which is why that scoping is defensible rather than merely convenient.

**Live-edge verification is NOT claimed.** 212's follow-up established that for `vercel.json` the
equivalent of "drive the real UI" is "curl the real edge", and a config that passed 63 offline
assertions was dead in production. `test_markdown_negotiation.js` simulates the real pipeline
(redirects → filesystem off the actual repo tree honouring `cleanUrls` → rewrites) and this item's rule
was added to that simulation — but the only proof that counts lands post-merge, after CI generates the
twins. **The first thing to check after the next `sitemap-update.yml` run:**

```
curl -sI -H 'Accept: text/markdown' 'https://www.defi.garden/?pool=<a live uuid>'   # expect 307 → /pools/<uuid>.md
curl -s  -H 'Accept: text/markdown' 'https://www.defi.garden/pools/<uuid>.md'       # expect real markdown, not HTML
curl -sI -H 'Accept: text/markdown' 'https://www.defi.garden/?pool=notauuid'        # expect the HTML app, never llms.txt
```

**The pre-merge shortcut was tried and does not exist.** The obvious way to close 212's "curl the real
edge" gap *before* merging is the PR's Vercel preview URL. All three probes above were run against
`defi-garden-git-claude-loop-213-…vercel.app` and every one returned `HTTP 302 →
vercel.com/sso-api?url=…&nonce=…` — deployment protection answers every path and every `Accept`, so the
preview teaches nothing about our own rules. **Not reported as a pass; it did not run.**

What the green Vercel check on the PR *does* prove is narrow but real: the config passed Vercel's schema
validation and the build succeeded. That is precisely the gate that rejected 212's first deploy over the
16-entry `has`/`missing` cap, so it is worth having — but it is not evidence that a routing rule fires,
and it is not reported as such. Written up as step **6b** in
`playbooks/mode-enumeration-staleness.md`.

## Verifier: PASS, tier HIGH (attempt 1), and what it proved rather than read

9/11 criteria fully met, 2 partial — both the disclosed platform-forced deviations. Tier HIGH assigned
independently; NEVER list re-derived by the verifier itself on all four counts.

It did not take the rails on trust. **Eight separate rail removals in a scratch copy, every one turning
`test_pool_twins.js` red**: the anomaly forced-High gate, the ⚠ line, the projection gate for anomalous
pools, the degen ⅓ haircut (2 assertions), the haircut *disclosure*, tier-1's `rateVolatilityNote` (2
assertions), `APY_SANITY_LIMIT` in `mean30dSane` (the 427-twin sweep), and the `showConcreteCta` gate.
No test stayed green under any removal. It also proved the parity test is load-bearing by mutating the
mirrored `getRiskAssessment` TVL band 10M → 100M and watching it go red with a real diagnostic
("DOLA-SUSDE: risk-level parity failed — twin Medium vs rendered Low"). It re-derived the 79/348/0 tier
counts from its own generator run, re-ran both lanes, and confirmed the stale-ref baseline correction.
All 9 mutations restored byte-exact (sha256 verified).

### Verifier advisories — two fixed here, the rest recorded

**Fixed in this item** (both are mirror-vs-original divergences, which is the exact defect class this
item exists to prevent, so neither was left as a follow-up):

1. **Tier-2 gate was missing `historyPoints >= 1`.** `PoolDetail.js:746` requires it; the twin gated only
   on the presence of a `kpis` object. For a record with kpis but `historyPoints < 1` the page renders
   **no** rate note at all, while the twin rendered `rateTrackRecordNew`. Unreachable in today's snapshot
   (min `historyPoints` = 2), reachable in principle.
2. **`(pool.tvlUsd || 0) < 1000000` vs the page's `pool.tvlUsd < 1000000`.** A record with missing
   `tvlUsd` scored "Low liquidity" (+40) in the twin and "High liquidity" (+0) on the page, because
   `undefined < 1000000` is `false`. **This one is reachable in production** — it is impossible in the
   snapshot but the CI `seo-pools.json` tier, which supplies ~3,207 of the ~3,634 twins, is raw
   DefiLlama records with no such guarantee. That is why it was fixed rather than filed.

   **This one took two passes, and the first pass is the instructive part.** The initial fix removed
   `|| 0` from the `< 1000000` branch but left it on the `< 10000000` branch one line down — which does
   not close the divergence, it *moves* it: with `tvlUsd` undefined the page falls all the way through
   to "High liquidity" (+0) while the twin then landed on "Medium liquidity" (+20). Caught by reading
   the diff against `PoolDetail.js:307-315` rather than trusting the "fixed" report. Both branches now
   read `pool.tvlUsd` bare. Proven directly: rendering a record with `tvlUsd: undefined` yields
   "High liquidity" and not "Medium liquidity". A follow-up audit of every other field read in
   `getRiskAssessment`/`getPoolTypeShared` found no further defaulting divergences (`pool.project`'s
   `(x || '')` vs the page's `x?.` differ in syntax only — reviewed and left alone, because mirroring
   means matching behaviour, not tidying it).

**Recorded, not fixed:**

3. **The "found, not fixed" disclosure above was incomplete** (verifier's catch, and a fair one): the
   degen-haircut and anomaly branches ALSO have zero live witnesses — 0 of 427 twins carry either, same
   as tier 3. Both are fixture-tested and mutation-proven, and both get live witnesses once CI's
   sub-$10M tier lands. Corrected here rather than left reading as fuller coverage than it is.
4. `test_pool_twins.js`'s CTA check asserts `links.length >= 2` plus exactly one garden link, without
   asserting the protocol/DefiLlama CTA by label. The verifier hand-checked that second link on a real
   twin. Tightening it is a cheap future improvement.
5. Byte measurements differ ~1.2% between runs (350,103 B / 820 B mean vs 354,320 B / 830 B mean) —
   live snapshot data moves between runs. Conclusion (≈3 MB) unaffected.

## A process note worth keeping

The test agent received a mid-task correction from the operator about the three-tier rate note and
**flagged it as a likely prompt injection** rather than acting on it — then verified the claim directly
against the file, found all three tiers already present (the fix had landed by then), and wrote the
correct assertions anyway. The skepticism was misapplied to a genuine message, but the *procedure* was
right: it checked the territory instead of trusting the instruction, and the outcome was correct either
way. Recorded because the alternative failure mode — an agent that acts on any authoritative-sounding
mid-task instruction — is the more dangerous one.

## A real fidelity bug the build found, and fixed, mid-item

The build agent's first cut implemented the rate note as **two** branches — kpis present → the
track-record family, kpis absent → 207's `rateHistoryUnavailable`. It flagged the simplification in its
own report rather than burying it, which is the only reason it got caught.

`PoolDetail.js:715-805` is a **mutually-exclusive THREE-tier chain**, and its own comment says so
("exactly one of the three renders"). The missing tier is the first one and it is the honest one — item
071's `rateVolatilityNote`, shown when

```
mean30dSane && currentTotalApy > 0 && apyMean30d > 0 &&
max(currentTotalApy, apyMean30d) / min(currentTotalApy, apyMean30d) >= 1.5
```

**Measured blast radius before the fix: 104 of 734 snapshot pools (14.2%), of which 79 of the 427
pools that actually get a twin today — 18.5% of shipped twins.** Not an edge case. The
example is the twin the build agent itself pasted into its report as evidence of success: SOL-USDC /
orca-dex, **21.24% current vs a 41.52% 30-day mean** (ratio 1.95). The page tells that pool's visitor
"this pool's rate moves a lot"; the twin was telling an agent "we've been tracking this pool's rate for
21 days" — the steadiness framing, on the pool where the page deliberately withholds it.

Worth stating plainly because it is the whole thesis of the item: a twin that *drifts* from the page is
worse than no twin, and the drift here ran in the dishonest direction, in a format where nobody looks.
Fixed by mirroring the full three-tier gate, with mutual exclusivity asserted by test rather than
assumed.

Post-fix tier distribution, counted independently by the operator over a real 427-twin run (the build
agent reported the same three numbers from its own run):

| tier | note | twins |
|---|---|---|
| 1 | `rateVolatilityNote` (071) | 79 |
| 2 | track-record family (088.1) | 348 |
| 3 | `rateHistoryUnavailable` (207) | 0 |
| | **sum / total** | **427 / 427** |

Zero files carry more than one tier and zero carry none — exhaustive and mutually exclusive, verified
by sweeping all 427 files, not by reading the code.

## Found, not fixed

**Tier 3 has no live witness in the offline population.** All 427 locally-resolvable twins come from
`data/pools-snapshot.json`, and every pool in it has `kpis` — so 207's honest no-history line renders in
**0** real twins today, and its spec criterion is proven only against a constructed fixture record
driven through the real generator. That is honest coverage, not equivalent coverage. The line will
render for real once CI's `seo-pools.json` tier lands the ~3,207 sub-$10M pools, none of which carry
kpis. Stated here rather than left to look like full live coverage.

**`exposure` / `ilRisk` omit-when-absent is fixture-only for the same reason** — every snapshot pool
carries both fields, so that branch is exercised by construction, not by live data (build agent's
finding, confirmed).

**The protocol CTA label uses the raw project slug** (`Start Earning on orca-dex`), mirroring the page,
which passes `pool.project` too. Consistent with the page rather than prettier than it — deliberately
not "improved" here, since divergence from the page is the one thing this item must not introduce.
