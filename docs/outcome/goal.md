# DeFi Garden — Outcome Goal

**Status:** protected. Changes here require Alex's explicit sign-off (do not rewrite via `/outcome-run` or `/outcome-update` — those only touch `run.md`/`gate.md`).

## North-star metric

**Planner conversion and share-URL virality.** The Garden Planner (`plan.html`/`planner.js`, the default experience at bare `/`) is the product's core hook: a user states a goal, gets a plan, saves it (`localStorage` key `garden-plan`), and can generate a shareable URL that carries the whole plan state in its params. A shipped growth move is a *good* move if it measurably increases:
- `plan_created` → `plan_saved` conversion rate (did the plan actually get kept, not just generated)
- `share_link_created` rate (did the user find it worth sharing)
- `share_link_opened` rate (did a shared link actually pull in a new visitor — the virality loop)

These four events are tracked in Mixpanel (see `analytics.js`); the reward-sync job in the hermes profile (`~/.hermes/profiles/ollama-local/scripts/reward_sync_mixpanel.py`) pulls them daily and feeds `superdense reward record`.

Analytics app search/pool/filter events (the parameterized-URL experience) are tracked but are **not** the north-star — they're the acquisition surface (SEO), not the conversion the outcome loop optimizes for.

## Audience

The ICP as decided in `CLAUDE.md` (2026-06): **the cautious retail saver** who thinks in monthly deposits and life goals, not APY/pools. Not the degen (uses DefiLlama directly), not the analyst (LlamaAI serves them). Trust is the conversion currency.

## Guardrails

A shipped growth move must never violate the trust rails already documented in `CLAUDE.md`:
- `APY_SANITY_LIMIT = 1000%` — anomalous pools can never enter a plan
- `DEFAULT_MIN_TVL = $10M` everywhere
- No dark patterns in the hook model (trigger/action/reward/investment loop)
- Copy ban-list for in-reach goals: "save up", "afford", "budget"

**These guardrails are documentation only.** Superdense does not enforce them — real enforcement is existing code in `app.js`'s sanity-filter logic. A hypothesis that would require weakening a trust rail should be rejected at proposal-review time (the existing dashboard approve/reject step), not caught later by this outcome loop.

## Target surfaces

- `plan.html` / `planner.js` (primary — where the north-star events fire)
- Growth proposals approved via `scripts/dashboard-server.js`'s `/api/approve` and shipped to `feature/<action>` branches — each approved proposal gets a hypothesis recorded here (see `docs/outcome/run.md`)

## Analytics access

Mixpanel. Client-side project token lives in `index.html`/`plan.html`'s init snippet. Query/Export API access (for `reward_sync_mixpanel.py`) uses a Service Account (`~/gbrain/.env`, key `MIXPANEL_SERVICE_ACCOUNT_SECRET`) — never committed to this repo.
