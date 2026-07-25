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

## Surfaces to drive
- `/` — planner hero (default funnel top)
- `?token=<common>` (e.g. USDC) — grid renders pool cards
- `?token=<obscure/all-sub-$10M>` — the dead-end class (item 133)
- `?chain=<X>`
- `?pool=<live id>` — **pool detail = the current north-star surface** (audit this every tick)
- `?pool=<dead id>` — 072 dead-pool empty state
- `/tokens/<slug>`, `/chains/<slug>` — static SEO pages

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
check per the decision rule in class 1 above. Check 8 stays human judgment.

**Provenance:** the human's manual audits 2026-07-23 (pool-detail audit → 122/126/127…; the $10M
dead-end + loading flash → 132/133) and the observation that a signal-driven heartbeat finds NONE of these
pre-traffic. Seeded from every mechanically-detectable bug caught this session.
