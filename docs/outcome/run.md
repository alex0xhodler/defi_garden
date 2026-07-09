# DeFi Garden — Run Playbook

**Status:** mutable — rewritten by `/outcome-update` as levers get proven/refuted. `goal.md` stays fixed; this file doesn't.

## Lever portfolio (seeded 2026-07-09 from the existing backlog)

These are the growth moves already in flight via the existing ideation/approval system (`ai-growth-generator.js` → `stories/growth-proposals.json` → dashboard approve → `docs/pending-task-*.md`). Each one that gets approved through the dashboard should get a `superdense hypothesis record` + `experiment open` at approval time (wired in `scripts/dashboard-server.js`).

**Open in `stories/growth-proposals.json` (not yet approved):**
- `protocol-exploit-impact-tracker` — real-time exploit impact on protocol trust scores
- `chain-migration-cost-analyzer` — cross-chain migration cost vs. yield-gain calculator

**Already approved, specced in `docs/pending-task-*.md` (implementation status varies — check each for a feature branch):**
- `base-chain-apy-movers` — "Base Boost" real-time APY movers dashboard
- `blended-stablecoin-yield-calculator` — multi-chain stablecoin yield blending
- `defi-concentration-risk-index` — LP concentration/smart-contract risk scoring
- `defi-protocol-trust-score` — protocol trust score (already shipped per the redteam log's Objection 4 — static JSON pattern)
- `defi-sector-yield-index` — blue-chip DeFi yield index
- `first-home-down-payment-garden` — persona story (Kevin, SOL-USDC vs WETH-USDC)
- `impermanent-loss-risk-analyzer` — IL risk vs. stable-return comparator
- `multi-chain-yield-opportunity-cost-calculator` — cross-chain opportunity-cost calculator
- `risk-adjusted-savings-planner` — trust-score-weighted savings projections
- `yield-emission-sustainability-score` — tokenomics/emission sustainability scorecard
- `yield-stability-rank` — APY volatility-based stability ranking

## Selection policy

Until at least one full reward cycle has run (see `docs/outcome/gate.md` + `reward_sync_mixpanel.py`'s daily cadence), there is no proven/refuted data yet — `ai-growth-generator.js` continues to propose using its existing heuristics. Once reward data exists for a lever, `/outcome-update` should:
1. Promote levers whose approved proposals correlate with a measurable lift in `plan_saved`/`share_link_opened` rates in the following observation window.
2. Flag (not silently drop) levers that shipped but showed no measurable movement — these still get one retry with a sharper hypothesis before being retired.
3. Never promote a lever whose implementation required weakening a `goal.md` guardrail, even if it "worked."

## Reward-preflight

Before recording a reward snapshot, `reward_sync_mixpanel.py` must confirm the relevant experiment is still open (`superdense experiment list --status open`) and that at least one full day has passed since the linked artifact (`feature/<action>` branch) was pushed — same-day snapshots are too noisy to attribute.
