# BACKLOG — written by the heartbeat, culled by the human, consumed by build loops.
# Statuses: READY → IN_PROGRESS → IN_REVIEW → SHIPPED (measuring) → DONE
#           PARKED (3 strikes) · BLOCKED (question for the human) · CULLED (human said no)

| ID | Title | Score | Status | Risk | Spec | Attempts | Measure until |
|----|-------|-------|--------|------|------|----------|---------------|
| 001 | Wire Mixpanel MCP into the repo (.mcp.json) | 9.0 | DONE (shipped 2026-07-10, OAuth completed by human — heartbeats read live) | HIGH | specs/001.md | 1 | — |
| 002 | Share-loop instrumentation truth check (sound; plan_saved double-fire fixed) | 8.7 | DONE | LOW | specs/002.md | 1 | — |
| 003 | `npm test` smoke gate (Playwright, both router paths) | 7.0 | DONE (auto-merged 2026-07-10 by the 09:49 loop) | HIGH | specs/003.md | 1 | — |
| 004 | Surface the share CTA at the bloom moment | 8.0 | SHIPPED (measuring; human review: placement OK but redundant → superseded by 005) | HIGH | specs/004.md | 1 | 2026-07-24 |
| 005 | One share hub at bloom — image-first ("Share my garden" = hero), link always travels; remove footer duplicate | 8.5 | SHIPPED (live 2026-07-10, commit bce752d) | HIGH | specs/005.md | 1 | 2026-07-24 |
| 008 | Checkout CTA hierarchy: one action per intent level — share hero button, link demoted to text link, tighter card | 8.3 | IN_REVIEW (verifier PASS — queued, ship-tick pushes within 15 min) | HIGH | specs/008.md | 1 | 2026-07-24 |
| 009 | Waitlist CTA has ZERO instrumentation — instrument the monetization funnel | 7.5 | IN_REVIEW (verifier PASS — queued with 008) | LOW | specs/009.md | 1 | — |
| 010 | GSC indexing crisis — diagnosis | 8.8 | DONE (specs/010-diagnosis.md: canonical lie + thin shells + dead tokens; fixes = 011-015) | LOW | specs/010.md | 2 | — |
| 011 | GSC fix: stop the canonical lie — router owns canonical/og:url both modes, lang-stripped, stable param order | 8.8 | IN_REVIEW (verifier PASS — queued; GSC validation 2-6 wks post-ship) | HIGH | specs/011.md | 1 | — |
| 012 | GSC fix: honest empty states — client noindex on zero-pool queries + real alternatives block | 8.6 | IN_REVIEW (verifier PASS — queued; GSC validation 2-6 wks post-ship) | HIGH | specs/012.md | 1 | — |
| 013 | GSC fix: sitemap quality threshold in generate-sitemap.js (≥2 live pools + TVL floor per URL) | 8.0 | READY (spec TBD by next heartbeat) | HIGH | — | 0 | — |
| 014 | GSC fix: static token/chain landing pages, top-100 by TVL (generate-*.js pattern) — phase 1 | 7.8 | READY (spec TBD) | HIGH | — | 0 | — |
| 015 | Fix apex/referral share URL in tweet flow (redirect hygiene) | 6.0 | READY (spec TBD) | LOW | — | 0 | — |
| 007 | Arrival moment: greet share-link recipients, explicit adoption path (funnel step 2) | 8.2 | SHIPPED (live 2026-07-10, commit bce752d) | HIGH | specs/007.md | 1 | 2026-07-24 |
