# NORTH_STAR.md — owned by the human. Loops read this first, every run. Only the human edits it.

## Product
- What it is: DeFi Garden (www.defi.garden) — static, no-backend, no-build-step web app on the DefiLlama pools API. Two faces: the Garden Planner (default `/` — goal-first savings planner for cautious retail savers) and the analytics yield app (every parameterized URL — sacred SEO surface).
- Stack: React 18 UMD + babel-standalone (`React.createElement` only — never JSX), plain JS/CSS, no build step; Node 22 scripts for SEO generation; Vercel static hosting; Mixpanel via `analytics.js`.
- Repo conventions live in: CLAUDE.md

## Commands
<!-- Build loops and the verifier run these verbatim. -->
- Test: `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`
- Lint: none — no lint pipeline exists; do not invent one ad hoc
- Build: none — static site. Serve locally: `npm run dev` (http-server :8000)
- SEO regen (only after preset/persona/SEO-surface changes): `npm run sitemap && npm run generate:llms && node generate-stories.js` — commit the regenerated files, never hand-edit them

## North-star metric
- Metric: Viral loop closure
- Exact definition: weekly count of `plan_created` events preceded by `share_link_opened` for the same user — Mixpanel funnel `share_link_opened → plan_created` (7-day conversion window), project defigarden (4042048)
- Current baseline: **0** — 30d to 2026-07-09: `share_link_opened` 0, `share_link_created` 0, `plan_created` 5, `session_start` 132 (see `signals/2026-07-09.md`)
- Guardrail metrics (never trade these away): `error_occurred` rate; planner conversion (`plan_created` per planner session); parameterized analytics URLs (`?token=/?chain=/?pool=`) keep rendering pool cards — that's the SEO lifeline

## Signals
- Mode: analytics
- Sources: Mixpanel project defigarden (4042048), org Equitee — via Mixpanel MCP. **NOT YET WIRED for Claude Code** (backlog 001). Until 001 ships, the heartbeat runs signal-degraded: read the latest `signals/` snapshot, never invent numbers, state "signal not wired" in the report, and keep 001 top-ranked.

## Weekly theme
- Theme: Viral share loop, end to end — make share URLs actually get created and opened. Instrumentation truth first: share events currently report zero, and you can't optimize a loop that doesn't report.
- Week of: 2026-07-09

## Budgets
- Max build-loop attempts per item: 3 (then park with notes)
- Max parallel build loops: 2 (separate git worktrees)
- Max backlog items in flight: 5
- Weekly spend ceiling: $100 API-equivalent (ASSUMED — confirm) — if exceeded, loops stop and flag the human

## Risk policy (verifier must independently agree with the tier)
Autonomy level: (c) verifier PASS + tests green → merge to main, ANY tier (human directive 2026-07-10). The human reviews outcomes after the fact — via daily reports and specs/<id>-pr.md explainers — not as a pre-merge gate.
LOW (fast lane — short explainer in specs/<id>-pr.md):
- copy/text changes (EN + KO together via translations.js — one language alone is a verifier FAIL), styling, docs, tests, analytics instrumentation
- diff ≤ 150 lines, no new dependencies
HIGH (still auto-merges, but BEFORE merging: full explainer + 5-question quiz written to specs/<id>-pr.md, and top billing in the next report):
- trust rails: `APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly flags/demotion, degen ⅓ haircut (app.js, planner.js) — never weakened; only the human relaxes these
- `home.html` IA router (`__APP_MODE`) and any parameterized-URL behavior — `?token=/?chain=/?pool=` are sacred sitemap URLs
- hand-edits to generated SEO surface (`sitemap-*.xml`, `stories/`, `llms*.txt`) — changes go through the `generate-*.js` scripts only
- `vercel.json`, `.github/workflows/`, `package.json` dependencies, `.mcp.json` — config/infra
- new dependencies, anything user-facing beyond copy/styling
- when in doubt → HIGH. Misclassifying risk is itself a verifier FAIL.
NEVER auto-merged — BLOCKED for the human, no exceptions, regardless of verifier verdict:
- weakening trust rails (`APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly flags, degen haircut)
- anything requiring credentials, org-admin actions, or money
- deleting or de-indexing SEO surface
Until 003 (npm-test smoke gate) ships: any render-path merge gets flagged "needs human visual spot-check" in the log + next report (advisory, post-merge, not a gate).
OUT OF SCOPE — loops never modify, never run, never target:
- `telegram-bot/`, `whatsapp-bot/`, `workers/` — contain wallet/private-key/funds-moving code. Not the product surface. If a backlog idea requires touching these, mark it BLOCKED with a question for the human.

## Experiment discipline (growth changes)
- Every growth item ships with instrumentation. No un-measurable changes.
- Format: hypothesis → change → metric to move → measurement window (default 14 days) → decision rule
- Minimum sample: traffic is ~130 sessions/30d — classic A/B is infeasible. Use pre/post comparison over 14-day windows; no claim about a funnel step on fewer than 30 events; below that, write "insufficient data" (ASSUMED — confirm)
- A bug at a funnel step outranks any experiment at that step. Broken beats persuasion.

## Standing decisions
<!-- The heartbeat asks questions when an answer would change what gets built.
     Answers accumulate here so no loop ever asks twice. Setup interview answers land here too. -->
- 2026-07-09 · north star = viral loop closure: `share_link_opened → plan_created` weekly closures (Q1)
- 2026-07-09 · signal = Mixpanel MCP wired into the repo; backlog 001 does the wiring; credentials are never committed to the repo (Q2)
- 2026-07-09 · autonomy starts at (b): LOW auto-merge + PR for the rest (Q3) — explicit user exception to the Nori "no changes to main" rule, for LOW loop items only
- 2026-07-09 · risk map confirmed as proposed; bots/workers fully out of scope — real-money code (Q4)
- 2026-07-09 · week-1 theme = pure viral-loop work (Q5); installer note: share instrumentation reports zero, so the truth-check (002) precedes share-UX polish inside the same theme
- 2026-07-09 · guardrails = error rate + planner conversion + analytics-URL integrity (default)
- 2026-07-09 · measurement window 14d instead of 7d — traffic-informed (ASSUMED — confirm)
- 2026-07-09 · no A/B at current traffic; pre/post with ≥30 events per claim (ASSUMED — confirm)
- 2026-07-09 · budgets 3 attempts / 2 parallel / 5 in flight (default); spend ceiling $100/wk (ASSUMED — confirm)
- 2026-07-09 · LOW diff cap 150 lines, no new deps (default)
- 2026-07-09 · every user-facing string via translations.js, EN + natural KO updated together; money/number formatting pinned to en-US — never bare toLocaleString() (CLAUDE.md)
- 2026-07-09 · conventional commits; loop branches `loop/<item-id>`; surgical diffs over rewrites (CLAUDE.md/Nori)
- 2026-07-09 · loops must not depend on `docs/outcome/` or `scripts/dashboard-server.js` — referenced in CLAUDE.md but absent from this checkout (installer flag)
- 2026-07-09 · Mixpanel coordinates: org Equitee (2885044), project defigarden (4042048)
- 2026-07-10 · tracking went live 2026-07-09 (human confirmed) — all baselines date from there; earlier zeros are absence of tracking, not absence of usage
- 2026-07-10 · plan_saved 2×-per-plan was a bug (effect re-fired on rate churn), not intended semantics (human confirmed) — fixed via planSavedSignature dedupe in planner.js; plan_saved now means "user-meaningful plan change"
- 2026-07-10 · share pipeline code-audited sound end-to-end (CTA→track→encode→router→decode→track); share zeros = no usage yet, not breakage
- 2026-07-10 · execution model (human directive): code changes are built by Sonnet 5 agents; Fable 5 only operates the loop-of-loops and judges (verifier/operator role) — the operator never writes product code directly
- 2026-07-10 · autonomy ratcheted to (c): verifier PASS → auto-merge ANY tier, human reviews after the fact (human directive). Operator flagged the trade: no pixel-level QA exists until 003 ships, and README's ratchet advice is 4 clean weeks — human accepted. NEVER list above still human-gated.
