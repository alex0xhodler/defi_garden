# Spec 183 — build notes

Built 2026-07-30 on `claude/loop-183`. Operator: Fable-role session (planning, review, verification
judgment). Product code: dispatched Sonnet 5 build agent, two rounds (round 2 was operator review
feedback). Per the 2026-07-13 execution-model decision, the operator wrote no `audit-app.js` code.

## The headline: item 182 landed hours before this build and moved the ground under leg (a)

Recorded in full as Territory notes T1–T5 in `183.md`. Short version: 182 made
`PoolDetail.js`'s `renderProtocolCtaBlock()` ALWAYS render a `.cta-button-protocol` element — the real
"Start Earning on <project> ↗" CTA when any resolution tier produces a URL, an honest
"View this pool on DefiLlama ↗" fallback when none does. Two consequences:

1. **The `dead-cta` P1 this item exists to classify can no longer fire from URL resolution.** Verified,
   not assumed: a full `node audit-app.js` on this checkout returned **1 finding, 0 blocking, 29
   surfaces**, against the 1-blocking-P1 run recorded in `signals/2026-07-30.md` that motivated the item.
2. **The check went blind in the other direction.** The fallback reuses the same class, so a pool whose
   protocol URL resolves nowhere — where half the north star (`protocol_link`, `PoolDetail.js:517`) does
   not exist on the page at all — now audits clean.

So leg (a) as literally specified ("when `dead-cta` fires, record why the element was absent") would have
been a no-op on a finding that no longer occurs. It was built instead as: **read the CTA's shape, and
attach the provenance + classification to whichever finding that produces.** The classification decision
rule, its three kinds, the P1/P2 assignment, and the non-vacuity contract are all unchanged from the
spec; only the triggering finding changed.

## Deviations from the spec

### 1. Leg (a) attaches to a shape check, not to the old presence check (see above)
`dead-cta` is kept verbatim for a genuinely missing/invisible element (now with provenance appended to
`detail`); a new `degraded-cta` check fires when the DefiLlama fallback rendered instead of the real CTA.
Both carry the same provenance and the same kind. Without this, the item ships nothing.

### 2. The `environment` branch is proven by fixtures + mutation, NOT on a real rendered page
The spec asks for both branches "proven on real data" and allows a fixture "only if the real one is also
shown". The **`defect` branch's real instance was shown** — see the demonstration below. The
`environment` branch was not, and the reason is structural rather than lazy: reaching it requires the
page's fetch of `/data/protocol-urls.json` to fail **while the same file still exists on disk for the
scanner** (if the file is simply removed, the scanner's own read fails too and the finding correctly
routes to `undeterminable`, not `environment`). The audit's static server serves that exact path from the
same root the scanner reads, so the two cannot be decoupled in-sandbox without adding a test-only route
knob — scope this item explicitly forbids. Disclosed rather than papered over.

### 3. Wrap-around (`cycle++`) is not demonstrable on real data in one session
735 candidates at 2 rotated pools per run. Proven by unit test, and — after the round-1 defect below —
by a real-snapshot invariant test.

### 4. Full browser lane not run
Timeboxed (67 files). `run-tests.js --lane=plain` (39/39) plus the new file and
`test_audit_pool_prescan.js` standalone were run instead. Stated per the spec's own test-gate criterion.

### 5. Pre-existing falsy-zero quirk left alone
`opts.poolSample || env || DEFAULT` treats a numeric `0` as absent (same for `poolPrescanMax`). Found, not
fixed — out of scope. The new test works around it via `AUDIT_POOL_SAMPLE='0'` (a truthy string), which is
also how the real CLI already has to pass it.

## Operator review round 2 — one real defect caught before verification

**`ROTATION_SEEN_CAP = 500` against a ~735-pool candidate population made the wrap branch dead code on
real data.** With `seen` capped below the population and drop-oldest eviction, `unseen.length` can never
reach 0, so `computeRotation()`'s `wrapped` branch, `cycle` ever incrementing, and the "tell coverage from
luck" signal the spec asks for were all unreachable in production — while passing a small-fixture unit
test. Fixed to `2000`, with the invariant stated at the constant ("MUST stay strictly greater than the
real rotation-candidate population") and a new test that reads the **real** `data/pools-snapshot.json` and
asserts `ROTATION_SEEN_CAP > realPoolCount`, so a future snapshot outgrowing the cap fails loudly instead
of silently killing the branch again.

**Second round-2 item: the `'absent'` provenance value.** `ctaProvenance.bakedProtocolUrls` starts
`'absent'`, and `'absent'` routes to the `environment` downgrade — so it had to be established that
`'absent'` cannot become the common path. The build agent's investigation found the reasoning holds for
the network (the fetch targets the audit's own local static server, is never `page.route`-intercepted, and
so always produces a `response`/`requestfailed` event) but found a genuine **measurement** race:
`waitForSelector('.pool-detail-view')` can resolve on first paint, before the mount effect has called
`fetch()`, which would misreport a timing artifact as "blocked". Closed the race rather than asserting it
away: a 2s `pollFor` settle-wait runs before classification, and only when the value is still `'absent'`
at that point.

## Real-data demonstration — the `defect` branch, live

```
AUDIT_POOL_IDS=13392973-be6e-4b2f-bce9-4f7dd53d1c3a node audit-app.js --only=pool-detail
→ exit 1 (blocking)
{ "surface": "pool-detail", "viewport": "1280px", "check": "degraded-cta", "severity": "P1",
  "detail": "DefiLlama fallback rendered instead of the protocol CTA (.cta-button-protocol) —
             provenance: project=\"sdai\", disk tiers=[none],
             this run's /data/protocol-urls.json fetch=ok, kind=defect" }
```
`sdai` is the spec's named live instance (1 pool, $55.5M) and the only one of 737 snapshot pools that
resolves in no tier — absent from `data/protocol-urls.json` (475 keys) and from the static
`PROTOCOL_URLS` literal alike. This is the finding the audit was blind to before this item: the page
renders, the CTA element is present and visible, and the north-star `protocol_link` emitter does not exist
on it.

## Rotation — measured, not argued

| run | code | rotated pool-detail ids |
|---|---|---|
| heartbeat 08:22 | pre-183 | `ae6b7add`, `2d1aa052` |
| operator baseline | pre-183 | `87c8ee0d`, `077b47b8` |
| build run 1 | 183 | `87c8ee0d`, `077b47b8` |
| build run 2 | 183 | `d9d6969d`, `54d5ccee` |
| operator run | 183 | `d56ab93e`, `4f5deb26` |
| `origin/main` re-run, same day | pre-183 | `87c8ee0d`, `077b47b8` — **repeats** |

The last row is the point: run the pre-183 code twice in one day and the date-derived seed hands back the
same pair, because nothing recorded that they had already been audited. The new rotation advanced through
three disjoint pairs, and the CLI now prints `cycle 0, seen 8/735 candidates, picked [...], wrapped=false`
so a reader can tell coverage from luck without a code read.

## Runtime

Pre-183 `audit-app.js` (checked out from `origin/main` and run in place): **105s**. Post-183: **105s**.
No material regression — the provenance work adds two page listeners and two small disk reads paid only
when a CTA is not the real one, and the settle-wait is paid only when the value is still `'absent'` at
classification time.

## Test tallies

- `node run-tests.js --lane=plain` → **39 pass / 0 fail**
- `node test_audit_cta_provenance.js` (new, browser lane) → **16 pass / 0 fail**
- `node test_audit_pool_prescan.js` (regression, standalone) → **14 pass / 0 fail**
- Mutation (non-vacuity), each restored with `md5sum` identical afterwards:
  - `classifyCtaKind`'s final `defect` branch forced to `environment` → 2 of 16 reddened
  - `computeRotation`'s `unseen` filter made to ignore `seenSet` → 2 reddened (disjointness + wrap)
  - `ROTATION_SEEN_CAP` reverted to 500 → exactly the new real-snapshot invariant test reddened

## Scope proof

`git diff --stat origin/main` touches `audit-app.js`, `test_audit_cta_provenance.js`, `package.json`
(the `test:serial` chain only — `run-tests.js`'s single source of truth for the file list; no dependency
changed), and the loop's own docs/state. Zero lines in `app.js`, `PoolDetail.js`, `planner.js`,
`translations.js`, `home.html`, any `*.compiled.js`/`*.min.js`, `tokens/`, `chains/`, `llms*.txt`,
`sitemap*.xml`, `data/`.

## Housekeeping

Two real `node audit-app.js` runs rewrote `product-loop-kit/signals/audit-findings.json` (the heartbeat's
artifact). It was restored to its committed state so this PR carries no heartbeat-signal churn; the next
heartbeat tick rewrites it normally. `product-loop-kit/signals/audit-rotation.json` IS committed — that is
the item's own state artifact, seeded by this session's real runs.

## Process note

The first build agent stalled ~25 minutes into exploration with zero edits and no completion signal; it
was stopped and relaunched with the already-established facts pre-supplied and an instruction to start
writing early. Second agent completed in ~20 minutes. Worth remembering: on a 2,500-line file, hand the
agent the measurements instead of letting it re-derive them.
