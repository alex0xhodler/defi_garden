# Product

<!-- impeccable:product-schema 1 -->
<!-- Every fact below is a confirmed human answer, none is inferred; dates cite the decision.
     Rewritten 2026-09-27 after the underwriting pivot (human-approved rewrite). The 2026-06
     retail-saver ICP and the 2026-08 "Quiet" design authority are superseded where noted. -->

## Platform

web

## Users

Primary (human 2026-09-27): **AI agents and humans, together.** Agents consume railed, scored yield data
(llms.txt, markdown twins, MCP/API) and cite what is curated, railed and explainable. Humans are people
already holding crypto (stablecoins, ETH, BTC) who want a trustworthy place to put it; the landing page
is the human shop window for the same data the agents read.

Not served: the degen chasing headline APY (uses DefiLlama directly). The 2026-06 cautious retail saver
remains the audience of the Garden Planner surface (`plan.html`), not of the landing page.

## Product Purpose

DeFi Garden (www.defi.garden) turns the raw DeFi yield firehose into a ranked, scored and forecast
shortlist that humans can act on and agents can cite. Every pool carries a DeFi Score (0–100, AAA–C, four
pillars: stability, sustainability, stickiness, liquidity) and a 14-day APY forecast (p10/p50/p90),
computed in CI from DefiLlama data (human pivot 2026-09-27).

Surfaces: the underwriting landing (bare `/`), the pool decision page (`?pool=`), the analytics grid
(every other parameterized URL), and the Garden Planner (`plan.html`).

Landing success (human 2026-09-27): the visitor **opens a pool** from the ranked list. Agent access
(MCP/API) is the clear secondary path. Longer-term north star (human 2026-08-04): pool-detail conversion
clicks and agent consumption.

## Positioning

Honest numbers beat exciting numbers, and predictions are only claimed with proof: forecasts are scored
publicly against what actually happened, alongside a naive "today's rate persists" baseline (human
2026-09-27: build the forecast track record). Trust rails a neighboring product does not enforce: APY
sanity limit 1000% (anomalous pools are flagged, demoted and never featured), $100K default TVL floor,
degen projections at a stated ⅓ haircut. Curated + railed + scored + explainable vs the raw firehose.

## Constraints

Durable, human-confirmed, future work must preserve:
- Trust rails are never weakened (NEVER-list, NORTH_STAR risk policy).
- Every number shown derives from CI-computed or live DefiLlama data; no hard-coded figures, no
  decorative values (a gauge needle always reads a real number).
- All money/number formatting pinned to en-US via the shared helpers; never bare `toLocaleString()`.
- Every user-facing string ships EN + natural Korean together (translations.js).
- Parameterized URLs (`?token=`, `?chain=`, `?pool=`) are sacred SEO surface — behavior unchanged.
- No dark patterns: no fake urgency, no fudged dates, honest empty states; "education, not advice".
- No build step: React 18 UMD, `React.createElement` only (no JSX), plain CSS; static hosting.
- Accessibility: visible focus rings, `prefers-reduced-motion` respected on every animation, and every
  graphical instrument has a text equivalent.
- Design authority (human 2026-09-27, replaces the 2026-08 "Quiet" mandate for the landing): the
  "night instrument panel" world, chosen through the impeccable direction round. Caps only on
  instrument placards; luminous colour, never blurred glow; no scale-pop hovers. The landing is
  dark-only (human 2026-09-27). DESIGN.md records the built world.

## Voice

Calm, precise, plain-spoken; sentence case outside instrument placards. No hype, no degen slang on money
surfaces (human 2026-08-05, item 240). Planner copy keeps its ban-list ("save up", "afford", "budget").
Korean is natural, never machine-literal.
