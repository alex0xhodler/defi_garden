# Product

<!-- impeccable:product-schema 1 -->
<!-- Authored by the loop operator from dated human decisions in product-loop-kit/NORTH_STAR.md and
     CLAUDE.md — every fact below is a confirmed human answer, none is inferred. Sources cited inline. -->

## Platform

web

## Users

Primary: the cautious retail saver who thinks in monthly deposits and life goals — retirement, a home,
sneakers, an iPhone, a Claude subscription — NOT in APY or pools (ICP decision 2026-06). Explicitly not
served: the degen (uses DefiLlama directly) and the analyst (LlamaAI at $490/yr). They arrive from
search or a shared plan link, often on mobile, wanting a trustworthy answer more than an exciting one.

Secondary audience (human strategy pivot 2026-08-04): AI agents consuming railed yield data — llms.txt,
markdown twins, a coming read-only API and MCP server. Agents cite what is curated, railed, and
explainable.

## Product Purpose

DeFi Garden (www.defi.garden) finds live DeFi yields with clarity and plans goal-based "gardens" funded
by yield. Two faces: the Garden Planner (default `/` — goal-first, conversational savings planner) and
the analytics yield app (every parameterized URL — search grid + pool detail, the SEO estate). The flip
that defines the product: in-reach goals are YIELD-FUNDED, never "saved up for" — you keep the money
AND get the thing. Success (dual north star, human 2026-08-04): pool-detail conversion clicks
("Garden this pool" + "Start Earning on <protocol>") and agent consumption.

## Positioning

Honest numbers beat exciting numbers. Every displayed figure derives from live DefiLlama pool data
through trust rails a neighboring product does not enforce: APY sanity limit 1000% (anomalous pools are
flagged, demoted, and can never enter a plan), $10M default TVL floor, degen projections at a stated ⅓
haircut. Curated + railed + explainable vs the raw firehose. Trust is the conversion currency; the
default view is the product.

## Constraints

Durable, human-confirmed, future work must preserve:
- Trust rails are never weakened (NEVER-list, NORTH_STAR risk policy).
- All money/number formatting pinned to en-US via the shared helpers; never bare `toLocaleString()`.
- Every user-facing string ships EN + natural Korean together (translations.js).
- Parameterized URLs (`?token=`, `?chain=`, `?pool=`) are sacred SEO surface — behavior unchanged.
- No dark patterns: no fake urgency, no fudged dates, honest empty states; "education, not advice".
- No build step: React 18 UMD, `React.createElement` only (no JSX), plain CSS; static hosting.
- Accessibility: visible focus rings, `prefers-reduced-motion` respected on every animation.
- Design authority (human 2026-08-04 Q2b + 2026-08-05): the "Quiet" clean-minimal system — neumorphism
  stripped; quality bar is SOTA-grade restraint (see product-loop-kit/specs/225-round3-brief.md); banned:
  glow shadows, scale-pop hovers, terminal mono-caps skin on labels. Design changes ship in small
  screenshot-first increments, each human-approved before the next.

## Voice

Calm, honest, plain-spoken; sentence case. Copy ban-list for in-reach goals: "save up", "afford",
"budget" (the yield-funded flip). No degen slang on money surfaces (human 2026-08-05, item 240). Korean
is natural, never machine-literal.
