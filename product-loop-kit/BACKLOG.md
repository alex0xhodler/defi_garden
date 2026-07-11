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
| 013 | GSC fix: sitemap quality threshold in generate-sitemap.js (≥2 live pools + TVL floor per URL) | 8.0 | READY (heartbeat writes the spec) | HIGH | — | 0 | — |
| 014 | GSC fix: static token/chain landing pages, top-100 by TVL (generate-*.js pattern) — phase 1 | 7.8 | READY (heartbeat writes the spec) | HIGH | — | 0 | — |
| 015 | Fix apex/referral share URL in tweet flow (redirect hygiene) | 6.0 | READY (heartbeat writes the spec) | LOW | — | 0 | — |
| 016 | Re-brand empty-state buttons to neumorphic tokens | 7.2 | SHIPPED (PR #97, merged 2026-07-11) | LOW | specs/016.md | 1 | — |
| 017 | NL search: every advertised typing-example must parse (solana/base/kamino lenders/curve/convex) | 8.4 | superseded by 018 — fixtures passed, product failed | HIGH | specs/017.md | 1 | — |
| 018 | NL search actually works (behavior on live data, Playwright drives the real UI) | 9.0 | IN_REVIEW (verifier PASS 2026-07-11, PR open) | HIGH | specs/018.md | 3 | — |
| 019 | Pool-detail pages convert SEO landers toward the north star | 8.7 | READY | HIGH | specs/019.md | 0 | — |
