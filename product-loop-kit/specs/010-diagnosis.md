# 010 — GSC indexing diagnosis (operator-run, 2026-07-10)

## Verdict
All six GSC failure classes trace to one architecture fact: 20,831 sitemap URLs serve ONE byte-identical HTML shell whose static `<head>` claims `canonical → https://www.defi.garden/`, planner title, and planner description; the real per-URL canonical/title/content appear only after client-side JS runs AND a multi-MB DefiLlama API call completes. To a non-rendering crawl, every analytics URL is a duplicate of the homepage that admits it; to a rendering crawl on a slow/failed API fetch, it's an empty page (soft 404); across repeated crawls the canonical flip-flops (static→root, rendered→self), producing the duplicate-canonical classes. Google is behaving exactly as designed.

## Evidence
- Raw fetch of `https://www.defi.garden/?token=ALEPH` (2026-07-10): `canonical: https://www.defi.garden/` · title "DeFi Garden 🌱 | Plan Your DeFi Savings by Goal" · planner meta-description · `og:url: https://www.defi.garden/`. Identical shell for every token/chain/pool URL (single home.html; vercel.json rewrites / → /home; no per-URL server logic possible).
- home.html:15 static `<link rel="canonical" href="https://www.defi.garden/">`; home.html:~66-80 rewrites canonical/title **in JS** only when `needsAnalytics`.
- Sitemap scale: 20,831 `<loc>` URLs total (tokens-all 4,147 · combos 1,300 · chains 96 · categories ~2k · main 12 · plus per-chain files).
- GSC totals (~39k affected) exceed today's sitemap (20.8k) → historical/retired URLs still in Google's memory (old combos, delisted tokens, `?lang` variants).
- planner.js tweet URL uses apex `https://defi.garden/referral=<handle>` → guaranteed redirect (apex→www) + junk path: feeds "Page with redirect".
- Sandbox cannot reach yields.llama.fi (allowlist) — dead-token % not computed here; generate-sitemap.js emits 4,147 tokens, and any token delisted from the live API since generation renders an empty result page while remaining a 200.

## Class → mechanism
| GSC class | Count | Mechanism | Confidence |
|---|---|---|---|
| Alternate page with proper canonical | 1,955 | Google TRUSTED the static canonical→root on non-rendered crawls | High |
| Duplicate, Google chose different canonical | 521 | Rendered crawls saw JS self-canonical, conflicting with static root-canonical | High |
| Soft 404 | 3,568 | Rendered empty states: dead/delisted tokens, or API fetch not completing in render budget → "no pools" DOM | High |
| Crawled — currently not indexed | 22,877 | 20k+ near-identical thin shells + canonical confusion → quality/dedupe skip | High |
| Discovered — currently not indexed | 10,585 | Crawl-budget rationing on a 20k-URL programmatic sitemap with weak quality signals | High |
| Page with redirect | 534 | apex→www / http→https / legacy URLs (incl. the tweet-URL pattern) | Medium |

## Ranked fixes
| # | Fix | Files | GSC classes hit | Effort | Risk |
|---|---|---|---|---|---|
| 011 | **Stop the canonical lie**: remove static canonical from home.html head; router JS ALWAYS sets it (self-canonical for analytics URLs incl. full param set minus junk params; root for planner mode). Also set og:url + title consistently in both modes | home.html | Alternate-canonical, Duplicate-canonical, feeds Crawled-not-indexed recovery | S | HIGH (SEO surface) |
| 012 | **Honest empty states**: when the analytics app renders zero pools for the query, inject `<meta name="robots" content="noindex">` client-side AND render a real content block (why empty + top alternatives) instead of a bare empty state | app.js (+translations) | Soft 404 | S/M | HIGH |
| 013 | **Sitemap quality threshold**: generate-sitemap.js emits only tokens/combos with ≥2 live pools AND meaningful TVL today; stale URLs age out via the daily Action | generate-sitemap.js (generated files regenerate) | Discovered-not-indexed, Soft-404 inflow | M | HIGH (SEO surface, script-only) |
| 014 | **Static token/chain landing pages** for top-N by TVL via the generate-*.js pattern (stories/ precedent): real server-delivered title/canonical/content + link into the app. Phase 1: top 100 | new generate script + generated pages | Crawled-not-indexed (the big one) | L (phased) | HIGH |
| 015 | Fix apex/`referral=` share URL → `https://www.defi.garden/?...` proper params | planner.js | Page-with-redirect (partial) | S | LOW |

## Needs the human
- GSC URL-sample exports per class would confirm the historical-URL share (not blocking).
- After 011-013 ship: hit "Validate fix" in GSC on the canonical + soft-404 classes; validation cycles run 2-6 weeks — do not expect the counts to move this week.

## Process note
First diagnosis agent (sonnet, a8eb1bbec) died to an API error after ~45 tool calls / ~$0 output — operator re-ran diagnosis directly with 3 probes. Improve-loop material: cap diagnosis agents' fetch budgets; prefer operator-run diagnosis when 3-5 probes suffice.
