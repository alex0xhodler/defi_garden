# BACKLOG — written by the heartbeat, culled by the human, consumed by build loops.
# Statuses: READY → IN_PROGRESS → IN_REVIEW → SHIPPED (measuring) → DONE
#           PARKED (3 strikes) · BLOCKED (question for the human) · CULLED (human said no)

| ID | Title | Score | Status | Risk | Spec | Attempts | Measure until |
|----|-------|-------|--------|------|------|----------|---------------|
| 001 | Wire Mixpanel MCP into the repo (.mcp.json) | 9.0 | DONE (shipped 2026-07-10, OAuth done) | HIGH | specs/001.md | 1 | — |
| 002 | Share-loop instrumentation truth check (sound; plan_saved double-fire fixed) | 8.7 | DONE | LOW | specs/002.md | 1 | — |
| 003 | npm test smoke gate (Playwright, both router paths) | 7.0 | DONE (auto-merged 2026-07-10) | HIGH | specs/003.md | 1 | — |
| 004 | Surface the share CTA at the bloom moment | 8.0 | DONE (superseded by 005) | HIGH | specs/004.md | 1 | — |
| 005 | One share hub at bloom — image-first, link always travels | 8.5 | SHIPPED (measuring) | HIGH | specs/005.md | 1 | 2026-07-24 |
| 007 | Arrival moment for share-link recipients | 8.2 | SHIPPED (measuring) | HIGH | specs/007.md | 1 | 2026-07-24 |
| 008 | Checkout CTA hierarchy: one action per intent level | 8.3 | SHIPPED (measuring) | HIGH | specs/008.md | 1 | 2026-07-24 |
| 009 | Waitlist funnel instrumentation (waitlist_opened/waitlist_submitted) | 7.5 | SHIPPED | LOW | specs/009.md | 1 | — |
| 010 | GSC indexing crisis — diagnosis | 8.8 | DONE (specs/010-diagnosis.md) | LOW | specs/010.md | 2 | — |
| 011 | GSC fix: canonical truth from the router, both modes | 8.8 | SHIPPED (GSC validation 2-6 wks) | HIGH | specs/011.md | 1 | — |
| 012 | GSC fix: honest empty states — noindex + alternatives | 8.6 | SHIPPED (GSC validation 2-6 wks) | HIGH | specs/012.md | 1 | — |
| 013 | GSC fix: sitemap quality threshold in generate-sitemap.js (≥2 live pools + TVL floor per URL) | 8.0 | SHIPPED (built+verified before 020's gate landed; measured via GSC indexing classes, not the Mixpanel funnel 020 fixes — gate doesn't apply retroactively; real sitemap counts land on next sitemap-update.yml CI run) | HIGH | specs/013.md | 1 | 2026-07-25 |
| 014 | GSC fix: static token/chain landing pages, top-100 by TVL (generate-*.js pattern) — phase 1 | 7.8 | SHIPPED (PR #107, merged 2026-07-11) — phase 1: generator + offline-verified logic + sample; phase 2 (networked real pages + sitemap wiring + canonical consolidation) pending | HIGH | specs/014.md | 1 | 2026-07-25 |
| 015 | Fix apex/referral share URL in tweet flow (redirect hygiene) | 6.0 | SHIPPED (PR #106, merged 2026-07-11) | LOW | specs/015.md | 1 | — |
| 016 | Re-brand empty-state buttons to neumorphic tokens | 7.2 | SHIPPED (PR #97, merged 2026-07-11) | LOW | specs/016.md | 1 | — |
| 017 | NL search: every advertised typing-example must parse (solana/base/kamino lenders/curve/convex) | 8.4 | superseded by 018 — fixtures passed, product failed | HIGH | specs/017.md | 1 | — |
| 018 | NL search actually works (behavior on live data, Playwright drives the real UI) | 9.0 | SHIPPED (measuring; 14d: 50 success / 4 abandon — but results_count hardcoded 0, so "success" = parse, not results-shown; honest read blocked on 020) | HIGH | specs/018.md | 3 | 2026-07-25 |
| 019 | Pool-detail pages convert SEO landers toward the north star | 8.7 | SHIPPED (measuring; 14d: garden_cta=0, pool_view=0 — CTR has no denominator until 020 instruments `?pool=` landings) | HIGH | specs/019.md | 3 | 2026-07-25 |
| 020 | Make the SEO-lander → north-star funnel measurable (real results_count on search_success + pool_view on `?pool=` landings) | 8.5 | SHIPPED (PR #104 merged 2026-07-11) | LOW | specs/020.md | 1 | 2026-07-25 |
| 021 | 014 phase 2 — networked generate real /tokens/ pages + sitemap-token-pages.xml + internal links + canonical consolidation (`?token=` → `/tokens/<slug>`); makes the 014 static pages actually earn traffic (2026 SEO: indexing = indexable+canonical+internally-linked; orphan pages don't index) | 8.2 | READY (heartbeat writes the spec; evidence reports/2026-07-11-seo-2026.md) | HIGH | — | 0 | — |
| 024 | North-star truth-check: does the shared garden IMAGE carry + open the plan URL end-to-end in the wild? (standing decision: every share path must carry the plan URL). If share_link_opened still ~0 post-005/007/008, find where the loop breaks (image share may strip URL on some platforms) | 7.8 | READY (heartbeat writes the spec; measurement-gated) | HIGH | — | 0 | — |
| 023 | Token-page content depth + internal linking — thin-content mitigation (2026 SEO: thin = dataset problem): short unique per-token intro + related-token/related-chain cross-links so pages aren't bare tables | 7.2 | READY (heartbeat writes the spec; evidence reports/2026-07-11-seo-2026.md) | HIGH | — | 0 | — |
| 025 | North-star: review garden_cta (019) → plan_created CTR now 020 gives it a denominator; if low, test a more concrete prefilled projection on the CTA | 7.0 | READY (measurement-gated — read next heartbeat) | LOW | — | 0 | — |
| 022 | IndexNow ping on token-page / sitemap changes (Bing/Yandex fast indexing; Google not official) — cheap freshness win for newly generated /tokens/ pages | 6.5 | READY (heartbeat writes the spec; evidence reports/2026-07-11-seo-2026.md) | LOW | — | 0 | — |
| 026 | SEO ops: wire a periodic GSC Index Coverage read into the heartbeat (2026 source-of-truth) to measure whether 011–014 actually drain the not-indexed classes over the 2-6wk validation cycles | 6.5 | READY (heartbeat writes the spec) | LOW | — | 0 | — |
