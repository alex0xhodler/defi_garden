# 014 build notes (phase 1)

## What shipped
- `generate-token-pages.js` — Node generator mirroring `generate-stories.js`/`generate-sitemap.js` (no build step, no new deps). Ranks tokens by aggregate qualifying TVL, applies 013's ≥2-qualifying-pool gate, emits self-canonical static `tokens/<slug>.html` with server-delivered title/description/canonical/content + a `?token=` deep link.
- `test_token_pages.js` + `test_fixtures/pools-sample.json` — 17 assertions on real emitted HTML, run offline. Added to `package.json` `test` chain; new `npm run tokens` script.
- `product-loop-kit/specs/014-sample-aaa.html` — one sample page (from the mock fixture) committed for review.

## Deviations / conservative choices
- **Offline fixture path added** (`--fixture` / `POOLS_FIXTURE`). generate-stories.js just fails without network; 014 needs to be verifiable where `yields.llama.fi` is 403-blocked (this sandbox, same wall as 013/018). Real pages come from a networked run.
- **Did NOT commit the generated `tokens/` prod output.** The only data available here is the mock fixture; shipping fake AAA/BBB pages to `tokens/` (Vercel would serve them at `/tokens/aaa`) would be junk in prod. Phase 2's networked run generates + commits the real 100 pages. One sample kept under `specs/` for review instead.
- **No sitemap / vercel.json / home.html / app-canonical changes** — deliberately out of scope (spec). The pages aren't wired into the sitemap or internal links, so nothing enters the index until phase 2. This also sidesteps, for now, the canonical-consolidation question (`/tokens/<slug>` self-canonical vs the existing `?token=<SYMBOL>` self-canonical from 011) — flagged as the phase-2 human decision.
- **Constants duplicated in-file** (`DEFAULT_MIN_TVL`, `APY_SANITY_LIMIT`) with "must stay in sync with app.js" comments — same pattern generate-sitemap.js already uses; no shared import exists between these scripts.
- Pages use a minimal inline `<style>` (no gradients, no app design tokens) — matching the `stories/` precedent of standalone static pages with their own lightweight CSS, not the app's neumorphic component system (which governs the app UI, not static SEO landers).

## Verification
- `node --check generate-token-pages.js` clean.
- `node test_token_pages.js` — 17/17 assertions pass (ranking desc, gate drops thin/sub-floor tokens, anomalous pool excluded from content AND gate, cap honored, slug safety, self-canonical, server-delivered title/description, app deep link, escaping).
- Ran the generator against the fixture offline → 3 pages written correctly; `specs/014-sample-aaa.html` is the committed result.
- Offline test chain (`test_planner`, `test_protocol_parsing`, `test_qualifier_fix`, `test_canonical`) exits 0. `test_smoke.js`/`test_search.js` in the npm chain need browser/live network and are not runnable in this sandbox (pre-existing limitation, not introduced here).
