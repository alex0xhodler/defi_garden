# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this product is

DeFi Garden (www.defi.garden) is a static, no-backend, no-build-step web app on the DefiLlama pools API, with two faces:

1. **Garden Planner** (the DEFAULT feature, bare `/` and `plan.html`) — a goal-first, conversational, generative-UI savings planner for the ICP below.
2. **Analytics app** (every parameterized URL: `/?token=`, `/?chain=`, `/?pool=`, etc.) — the original yield search/grid, reached from the planner via the header icon.

An inline IA router in `index.html` (`window.__APP_MODE`) decides which experience loads. **Existing parameterized URLs are sacred — thousands of sitemap URLs depend on them serving the analytics app unchanged.**

## ICP and product direction (decided 2026-06, harness this)

- **ICP**: the cautious retail saver who thinks in monthly deposits and life goals, NOT in APY/pools. Not the degen (they use DefiLlama directly), not the analyst (LlamaAI serves them at $490/yr). Trust is the conversion currency; the default view is the product; honest numbers beat exciting numbers.
- **Trust rails are the moat**: every displayed number derives from live DefiLlama pool data through sanity filters. `APY_SANITY_LIMIT = 1000%` (anomalous pools can NEVER enter a plan; in the analytics app they are demoted + ⚠-flagged + forced High risk). `DEFAULT_MIN_TVL = $10M` everywhere. The conversation layer is scripted/deterministic (a provider interface exists for a future LLM) — an LLM may narrate, never produce numbers.
- **Plan archetypes**: GROWTH (retirement, home — future-value, ≤10y horizons, bank comparison), TARGET (sneakers, iPhone — time-to-item), SUBSCRIPTION (Claude — "forever number" = capital whose yield pays the bill).
- **The flip (v3, decided)**: in-reach goals are YIELD-FUNDED, never "saved up for". Headline frame: *"Buy it outright and the money's gone. Garden it and you keep the money AND get the thing."* Capital-first is the default funding path; infeasible deadlines render truth-as-content (feasibility ladder, never fudged dates); subscription ladder uses the everyday-bills set (Spotify → Netflix → Claude Pro → Gym → Phone bill), forever numbers always from the live blended rate. Copy ban-list for in-reach goals: "save up", "afford", "budget".
- **Degen honesty**: the Degen LPs persona projects at a ⅓ haircut of headline APY and says so — farm rates decay.
- **Hook model (no dark patterns)**: trigger = monthly tending + rate-change deltas; action = one tap; variable reward = real rate movement ("you're 2 weeks ahead of plan"); investment = the saved plan (localStorage `garden-plan`), garden stages (seed→sprout→sapling→tree) from honest progress only. Virality = shareable plan URLs (all state in params) + share-card PNGs.
- Full specs: `docs/garden-planner-v2-spec.md` (planner v2 + IA swap) and `docs/garden-planner-v3-yield-funded.md` (yield-funded goals — the active direction).

## Architecture

- **No build step.** React 18 UMD; `app.js`/`PoolDetail.js` via babel-standalone; `planner.js` is a plain script. ALL components use `React.createElement` — never JSX.
- Files: `index.html` (router + analytics app shell) · `plan.html` + `planner.js` + `planner-styles.css` (planner) · `app.js` (analytics app) · `PoolDetail.js` · `translations.js` (en/ko, `t(key)`; planner section included) · `style.css` (design system) · `pool-detail-styles.css` · `analytics.js` · `stories/` + `generate-stories.js` (persona landing pages: tomoko/kevin/lucia — fictional composites, "education not advice") · `generate-sitemap.js`/`generate-llms.js` (SEO assets).
- Data: `https://yields.llama.fi/pools` fetched client-side. Pool deep link: `/?pool=<pool.pool>`.
- State conventions: theme = localStorage `theme` + `data-theme` attr; language = `?lang` + localStorage `defi-garden-lang`; saved plan = localStorage `garden-plan`.

## Design system (post-2026 redesign — keep it this way)

- Neumorphic, calm, skeuomorphic. Tokens only: `--neuro-shadow-raised/-flat/-pressed/-subtle` (soft: 4px offsets, low-opacity), `--neuro-radius-sm/-md/-lg` (10/14/16px squircles), `--neuro-bg-gradient`. Light source top-left. Accent colors (#3B82F6 family) are fixed.
- **Banned**: electric glow box-shadows, bounce easings, fake urgency, scale-pop hovers. Press physics: interactive controls sink 1px into `--neuro-shadow-pressed` on `:active` (global rule).
- `prefers-reduced-motion` respected for every animation. Must be flawless at 360/768/1280px and in dark mode.

## Hard rules

- All money/number formatting pinned to `en-US` (`formatUsd`/`formatNum`/`formatApy` in app.js; never bare `toLocaleString()`).
- Every user-facing string goes through `translations.js` — EN and natural KO updated together, always.
- Never weaken the trust rails (sanity limit, TVL floor, anomaly flags, degen haircut, focus rings).
- Surgical diffs over rewrites. Conventional commits.

## Development & verification

- Serve: `python3 -m http.server 8000` (any static server). No tests/lint pipeline; verification is Playwright-based E2E + critical screenshot review (a working Playwright install is typically at `/tmp/neuro-shots`).
- Verify both router paths after ANY change near `index.html`: bare `/` → planner, `/?token=USDC` → analytics app with pool cards.
- After changing presets/personas, re-run `node generate-stories.js` and commit regenerated `stories/`.
- Sandbox note: external font/analytics fetches fail locally (ignorable); page errors are not.

## Deployment

Static hosting (no server rewrites assumed). The sitemap suite + `stories/` + `plan.html` are SEO surface — regenerate via the `generate-*.js` scripts, don't hand-edit.
