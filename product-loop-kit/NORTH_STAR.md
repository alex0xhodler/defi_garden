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
- Metric: Waitlist conversions — the card funnel (changed 2026-07-12 from viral-loop closure, via operator interview Q2: the business is the yield-funded subscription card and the waitlist is its funnel. OPERATOR INFERENCE from the human's answer — human: veto and revert this block if unintended)
- Exact definition: weekly count of `waitlist_submitted` events (instrumented by backlog 009), Mixpanel project defigarden (4042048)
- Input metric (the amplifier feeding the funnel, previous north star): viral loop closure — weekly `plan_created` preceded by `share_link_opened` for the same user (7-day conversion window)
- Current baseline: unknown — Mixpanel MCP unauthenticated in cloud sessions as of 2026-07-12; heartbeat backfills `waitlist_submitted` from the next live signal read or `signals/` snapshot, never invents numbers. Viral-closure baseline remains **0** (30d to 2026-07-09: `share_link_opened` 0, `plan_created` 5, `session_start` 132 — `signals/2026-07-09.md`)
- Guardrail metrics (never trade these away): `error_occurred` rate; planner conversion (`plan_created` per planner session); parameterized analytics URLs (`?token=/?chain=/?pool=`) keep rendering pool cards — that's the SEO lifeline

## Signals
- Mode: analytics
- Sources: Mixpanel project defigarden (4042048), org Equitee — via Mixpanel MCP. **NOT YET WIRED for Claude Code** (backlog 001). Until 001 ships, the heartbeat runs signal-degraded: read the latest `signals/` snapshot, never invent numbers, state "signal not wired" in the report, and keep 001 top-ranked.

## Weekly theme
- Theme: Distribution + card funnel — X protocol-spotlight engine (yields + example gardens, human posts via Canva video template) and waitlist conversion toward the card. SEO keeps compounding untouched in the background.
- Week of: 2026-07-12 (set by the human in the 2026-07-12 operator interview)

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
- 2026-07-10 · the garden IMAGE ("Share my garden") is the hero share artifact (human directive after prod review); every share path must carry the plan URL or it can't close the loop; exactly ONE share surface at bloom
* 2026-07-10 · execution runs on Claude Code cloud routines (claude.ai/code/routines): heartbeat routine (thinking model, Mixpanel connector) + build routine (sonnet-tier, ONE item per run), unrestricted branch pushes, Run-now for on-demand; Mac crons and Cowork in-chat builds retired
* 2026-07-10 · docs/outcome/ and scripts/dashboard-server.js are DELIBERATELY gitignored local-only tooling — loops and cloud clones must never depend on them
* 2026-07-10 · REUSE COMPONENTS, KEEP DESIGN TIDY (human directive): builders reuse existing components/classes before inventing new ones; any new UI uses the neumorphic token system only; gradient/off-brand one-offs are a verifier FAIL
- 2026-07-11 · ship path (human directive): every item ships as its own claude/loop-<id> branch + PR, merged by the run itself after verifier PASS + tests green — PRs are the audit log; never direct-push main
- 2026-07-11 · never wait unbounded on background jobs — timebox all test runs (5 min foreground cap), document and proceed
- 2026-07-11 · UX items: acceptance criteria must measure rendered product behavior (Playwright on the real UI), never only unit fixtures — 017's failure is the precedent
- 2026-07-11 · current focus (human): fix what makes the product feel bad/untrustworthy; convert token-search SEO landers toward the north star via pool-detail experience
- 2026-07-11 · token SEO surfaces are TWO DISTINCT things (human directive): `/tokens/<slug>` = static SEO landing page (real server-delivered content) and `?token=<SYMBOL>` = interactive app view. They must show DIFFERENT content and each self-canonical — do NOT consolidate one canonical into the other (they are not duplicates)
- 2026-07-11 · plan share = a UNIQUE WORKING LINK attached to the garden that reproduces the sender's exact setup one-tap on open (human directive, refines the 2026-07-10 image-hero decision for item 024): the link that rebuilds the garden is the primary artifact; an image may accompany but the working link is what closes the loop
- 2026-07-12 · operating model refined (human directive): the session/routine model is ALWAYS Fable — Fable does thinking, planning, redteaming, backlog writing, verification judgment, and interviews the human to co-decide low-hanging-fruit/high-upside product moves; product code is written ONLY by dispatched coding agents (Opus or Sonnet via the Agent tool's model override), whose sole job is implementing the plan Fable hands them. Extends the 2026-07-10 execution-model decision. Routine owners: set the cloud routine's model to Fable in claude.ai/code routine settings — a session can't change its own routine config.
- 2026-07-12 · distribution channel (human, interview Q1): X/Twitter protocol spotlights — posts spotlight a pool's yield + an example garden built on it, tagging the protocol; start with SMALL protocols keen to collaborate (Curve is the upper bound — in general aim lower); the human produces each video from a reusable Canva template, edited per pool so it stays unique — never slop. Loops build the per-spotlight data/copy/asset pack (live numbers through trust rails, a working example-garden share URL, tweet draft, template field values, share-card PNG); the Canva template itself + posting = human-owned.
- 2026-07-12 · business model (human, interview Q2): the yield-funded subscription CARD. Users deposit with us into the protocol (position always self-manageable), each position gets a DISPOSABLE CARD that pays a subscription from the yield (e.g. $23/mo yield → Claude sub); we pocket card fees. The waitlist is the card's funnel; the planner's SUBSCRIPTION archetype / forever-number flip is the product's front door. North-star metric switched accordingly (see metric section — flagged as operator inference, human may veto). Card copy stays honest: it's a waitlist for early access, the card does not exist yet — no fake availability.
- 2026-07-12 · GSC (human, interview Q3): NO connector for now — the human checks GSC manually over the next ~6 weeks (through ~2026-08-23); 026 stays parked, heartbeat must not nag about it before then.
- 2026-07-12 · Mixpanel MCP (human, interview Q4): should be ON — but cloud sessions see it unauthenticated (OAuth can't run non-interactively). Human action: authorize the Mixpanel connector in claude.ai connector settings + enable it on the heartbeat/build routines. Until visible in-session, heartbeats stay snapshot-based.
- 2026-07-12 · PSI (human, interview Q5): the API key shared 2026-07-12 is on the WRONG account — discarded, never committed, do not reuse; no PSI CI rail for now; og-image compression (057) parked for later. The one-off PSI read stands as the perf baseline: mobile 88/100, TBT 0ms, CLS 0.
- 2026-07-12 · sandbox network partially OPEN (human unblocked it; verified live in-session): curl/node/generators now reach yields.llama.fi (live pool data), unpkg, npm, googleapis — generate-stories.js/token/chain generators and PSI API calls run in-session. BUT browser-originated HTTPS is still blocked at the proxy connection level (Chromium CONNECT tunnels get reset regardless of CA trust — diagnosed 2026-07-12: NSS store was empty, CA installed, still reset with cert checks off → connection-level policy, not trust) — so Playwright tests keep the established fixture-routing pattern (test_search.js style) for external hosts; real browser behavior is measured via PSI against live prod instead. PSI works with the human's API key (held in-session/secrets only, NEVER committed). GSC still needs the 026 connector (human-owned).
- 2026-07-13 · ship path REVISED (human directive, supersedes 2026-07-11's branch+PR decision): Vercel's free-tier deployment/API quota (100/mo) got hit — the branch-push-then-merge-to-main pattern was paying for TWO deployments per item (one on the `claude/loop-<id>` branch push, one on the merge to main), and a separate post-verify docs/bookkeeping commit (BACKLOG.md SHIPPED status + LOG.md entry) was tripling it in practice — confirmed in git history: item 058 alone shipped as THREE separate merged PRs (#162 file, #163 study, #164 bookkeeping). New rule: build loops commit directly to `main`, ONE commit per item, no feature branch, no PR. That single commit carries the product code AND the bookkeeping (BACKLOG.md status change, `specs/<id>-notes.md`, `specs/<id>-pr.md` explainer, LOG.md entry) together — never split across two pushes. The verifier subagent step is unchanged (still judges the diff before it lands); only the git mechanics changed. Effective immediately; revisit once Vercel quota resets or the human upgrades the plan. Stale already-merged `claude/loop-*` branches (e.g. 058, 063 — confirmed content-identical to their squash-merge commits on main) are leftover clutter, not unmerged work; a session's git-remote credentials don't have branch-delete rights (403 on `git push --delete`), so cleanup needs the human or a GitHub-MCP-authorized path.
- 2026-07-13 · execution-model split REVISED (human directive, refines 2026-07-10/2026-07-12's Fable-only decision): thinking/planning/heartbeat/verification-judgment = Fable 5; build-loop EXECUTION (the coding agent actually implementing a spec) = Opus 4.7 (was "Opus or Sonnet, builder's choice"); lightweight subagent work (verifier checks, small greps/lookups, non-authoring tasks) = Sonnet 5. A running session cannot change its own model (2026-07-10 precedent) — routine owners must set this in claude.ai/code routine settings (heartbeat routine -> Fable 5; build routine -> Opus 4.7). This session ran as Sonnet 5 throughout item 064's build (routine was not yet reconfigured when the item was picked up) — flagging per the same precedent, not silently claiming compliance.
