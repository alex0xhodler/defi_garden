# Browser-driven discovery — hook-model retention loop (2026-07-15)

First **forward** discovery pass (drive the real product, walk the hook-model rubric) rather than the usual backward-looking sweep over `reports/`+`specs/`. Prompted by the operator question: *why does the loop wait to be told where to go, with no ideas from browser testing / e2e per the hook model?* Answer in short: the loop's idea-sourcing is a closed, backward-looking set gated on analytics that read zero, and Playwright here is verification-only, never exploratory. This pass fixes that for one run.

## Method
- `npm run dev` + Chromium (`playwright-core` against `/opt/pw-browsers/chromium-1194`), 390×844 mobile viewport.
- Drove `/` (landing) and `/plan.html` (planner), subscription archetype, to bloom → save → reload → report mode. Screenshots + DOM probes in `scratchpad/shots/` (`full-findings.json`, `planner-findings.json`, `full-findings.json`).
- Cross-checked every rendered finding against the source (grep + `sed`), and verified pure helpers against the real 725-pool snapshot in Node.

## What the product actually is now (IA drift worth noting)
`CLAUDE.md` says the Garden Planner is the **default** at bare `/`. It no longer is: item #237 made bare `/` a **search-first landing** (`landing.js`), and there are now **three** router modes (`home.html` `__APP_MODE`): `landing` (bare `/`), `planner` (`/plan.html` or planner params), `analytics` (analytics params). The planner is reached via a "Plant a garden" link. Not a bug — but `CLAUDE.md`'s "planner is the default" line is stale (human-owned doc; flagged, not edited).

## Hook-model rubric — rendered results
`CLAUDE.md` model: trigger · action · variable reward · investment.

| Leg | Built? | Evidence |
|---|---|---|
| **Investment** (saved plan) | ✅ | `garden-plan` persists (826-byte plan); `planner.js:22,1855–1870`. |
| **Action** (one tap) | ✅ | one-tap plan creation. |
| **Variable reward** (rate movement) | ✅ **but siloed** | Report mode renders on `/plan.html` when a saved plan exists: "Still on track — your rates are holding steady", garden stage, forever-number, "Next: Amazon Prime at ≈$6,500" ladder. `planner.js:3872`, `reportStats:378`, `gardenStage:3241`, `translations.js:398–399`. **Not surfaced on the real default entry (`/` landing): browser run `landingReturn.showsSavedGarden=false`.** |
| **Trigger** (monthly tending + rate deltas) | ❌ **entirely absent** | Rendered bloom `trigger=false`; rendered report `trigger_reminderAffordance=false`; grep for `Notification`/`serviceWorker`/`remind`/`calendar`/`every month` → nothing. The variable reward is only ever seen if the user spontaneously returns. |

## Items promoted from this run
- **114** (score 7.2, HIGH) — "Welcome back" saved-garden re-entry card on the search-first landing. Reconnects investment→variable-reward at the real front door. `specs/114.md`.
- **115** (score 7.5, HIGH) — Honest "tend your garden" monthly calendar (`.ics`) reminder at bloom + report. Builds the missing **trigger** leg — client-side, no dependency, no permission prompt, no dark pattern. `specs/115.md`.

Both are north-star relevant (retention feeds the waitlist/card funnel and the `share_link_opened → plan_created` viral loop), fully **loop-buildable overnight**: no human keystone, no credentials, no new deps, no trust-rail/NEVER-list surface → auto-mergeable after verifier PASS. Acceptance for both = rendered product behavior via Playwright, seeding `garden-plan` directly and reusing the house `page.route` pool-fixture pattern (`test_smoke.js`).

## Testability note for future planner UX items
In-sandbox the planner's 15-min snapshot-freshness gate fails against the committed (aged) `data/pools-snapshot-meta.json`, so it falls through to a live `yields.llama.fi/pools` fetch that the proxy resets (empty pools → blank persona APYs — a **sandbox artifact, not a prod bug**, confirmed: `curatePools`/`effectiveApy` return 4.98/10.57/14.14% against the real snapshot in Node). The house Playwright pattern already handles this: stub `**/data/pools-snapshot*` with stale meta + route `https://yields.llama.fi/pools` → `test_fixtures/pools-sample.json`. Both 114/115 specs reference it; no separate harness item needed.

## Candidate follow-ups (not filed — avoid backlog bloat)
- Re-share an "ahead of plan" garden from report mode (direct viral-loop closure).
- Web Notifications opt-in as a second trigger (permission-heavy; design carefully).
- Rate-change *delta since last visit* copy in report mode.
