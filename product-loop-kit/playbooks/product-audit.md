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
2. **Dead-end as primary content.** The page's MAIN region is an empty / error / "no results" / "$0.00" /
   all-0% state for a VALID query. → **133** ($10M dead-end on small tokens), token pages all-0%.
3. **Loading flash.** Render with delayed/empty data first; the pre-load view must NOT claim "no results"
   (must show a loading state). → **132** (empty-state ternary gated on `filteredPools.length>0`, not
   `loading`).
4. **Console / page errors.** Zero `pageerror` / `console.error` on every driven surface — `error_occurred`
   is a guardrail; catch it BEFORE users do. → 044, 082.
5. **Raw i18n keys / missing KO.** No `t('…')`-shaped or camelCase keys leaking; EN and KO both render
   (toggle `?lang=ko`). → recurring hard-rule (EN+KO together).
6. **Dead CTAs / broken links.** Every primary CTA + link resolves (no dead clicks); the two north-star
   CTAs ("Garden this pool", "Start Earning") fire their events. → 029 (dead pool rows).
7. **Responsive / dark.** No horizontal body scroll at 360px; dark mode renders; focus rings present. →
   recurring design-system rule (360/768/1280 + dark).
8. **Honest labels (JUDGMENT — flag, don't auto-fix).** Category/type matches the data (SUSDS on
   sky-lending ≠ "Yield Farming"). Surface for human review. → 130.

## Severity → score (so audit findings compete with metric opportunities)
- **P0** broken number / page error / astronomical value on a live surface (trust-breaker) → 9+.
- **P1** dead-end for a valid query / loading flash / dead CTA → 7–8.
- **P2** format / label / responsive polish → 5–6.
Ticket each as a normal backlog row (rows-only, spec at build time); a rendered-Playwright repro in the
row is the strongest evidence.

## Automatability
Checks 1–6 are deterministic and mechanizable — a `audit-app.js` Playwright scanner could render each
surface and emit a findings JSON the heartbeat tickets, so regressions like −900T / `$0.1` can never ship
unnoticed again. Until that exists, this checklist is the manual-but-repeatable version. (Candidate build.)

**Provenance:** the human's manual audits 2026-07-23 (pool-detail audit → 122/126/127…; the $10M
dead-end + loading flash → 132/133) and the observation that a signal-driven heartbeat finds NONE of these
pre-traffic. Seeded from every mechanically-detectable bug caught this session.
