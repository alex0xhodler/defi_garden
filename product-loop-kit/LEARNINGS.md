# LEARNINGS — validated results only. Numbers or it didn't happen.
# The heartbeat closes experiments here; scoring of future items leans on these.

<!-- Format:
## <date> · <item-id> · <title>
Hypothesis: … → Result: MOVED / DIDN'T / INCONCLUSIVE (before → after, n=…)
Decision: kept / reverted. Takeaway for future scoring: …
-->

## 2026-07-24 · 005 · One share hub at bloom — image-first, link always travels
Hypothesis: one image-first share hub at bloom (every path carries the plan URL) produces the first organic shares and makes each loop-closable. → Result: **INCONCLUSIVE** — window 07-10→07-24: `share_link_created` = 0 (never fired), `share_link_opened` = 1, `plan_created` = 2, planner sessions reaching bloom ≈ 1 real session (07-19). n far below the ≥30 rule.
Decision: kept (no revert — the spec's "0 shares = revert-candidate" rule presumed an exercised funnel; zero share-ORIGINATION traffic means the hypothesis was never tested, and the old redundant share card has no evidence in its favor either). Takeaway for future scoring: share-UX experiments are worthless without distribution — do not open another share-surface measurement window until 069 (or any distribution) actually lands traffic; gate such items on a traffic precondition instead of a calendar window.

## 2026-07-24 · 007 · Arrival moment for share-link recipients
Hypothesis: a warm explicit arrival state ("Someone sent you this garden — make it yours") converts opened share links into `plan_created` at a measurable rate. → Result: **INCONCLUSIVE** — window 07-10→07-24: `share_link_opened` = 1 (the sole possible arrival, 07-19), `plan_created` same-day = 1 (cannot attribute: same session cluster as the sender-side activity; n=1). No recipient cohort ever formed.
Decision: kept (funnel-readiness change; costless while dormant). Takeaway: same as 005 — recipient-side UX can only be measured after share origination exists; couple future arrival-UX windows to observed `share_link_opened` volume (≥30), not to ship date.

## 2026-07-24 · 008 · Checkout CTA hierarchy: one action per intent level
Hypothesis: collapsing the share card to ONE hero action (share image) with the link demoted increases share initiation without hurting waitlist clicks. → Result: **INCONCLUSIVE** — window 07-10→07-24: share initiations = 0, `waitlist_opened`/`waitlist_submitted` = 0 (events never fired), bloom reached in ≈1 real session. Neither side of the tradeoff was exercised.
Decision: kept. Takeaway: with a ~1-real-session/week funnel top, EVERY bloom-surface experiment closes data-starved; the 2026-07-23 pre-traffic mandate (quality > conversion experiments until traffic is measurable) is the right standing correction — score future bloom experiments near-zero until distribution lands.

## 2026-07-25 · 020 · SEO-lander → north-star funnel measurability
Hypothesis: real `results_count` on search_success + `pool_view` on `?pool=` landings makes the lander funnel measurable. → Result: **MOVED** (functional goal, verified live): results_count real since 07-12 (22/100 searches non-zero, values 1–34); `pool_view` fires (n=4 in final window, all card_click); `source` prop live via 123, rendered-verified firing on both entry paths.
Decision: kept, DONE. Takeaway: instrumentation items CAN close MOVED on functional verification even at zero traffic — the metric is "is it measurable", not "did traffic arrive".

## 2026-07-25 · 021 + 014 · Real static /tokens/ pages (phase 1+2)
Hypothesis: real server-delivered token pages + sitemap wiring earn organic indexing/traffic. → Result: build leg **MOVED** (2,075 pages live via daily CI, sitemap-token-pages.xml in the index, IndexNow submitting them); traffic leg **INCONCLUSIVE** — window closed with the FIRST-ever prod page_views on the surface (~9 events: /tokens/btc, hubs, /chains/*) = crawl trickle, not organic volume. GSC readout is human-owned through ~08-23 (standing decision).
Decision: kept, DONE. Takeaway: SEO surface experiments need GSC (or ≥30 page_views) to close a traffic claim; measure build-legs and traffic-legs separately.

## 2026-07-25 · 022 · IndexNow ping on sitemap changes
Hypothesis: IndexNow submission on regen accelerates Bing/Yandex indexing of fresh pages. → Result: **MOVED** (mechanism verified live): CI run 30147683111 (2026-07-25 06:34) log shows "Submitting 2102 URL(s) to IndexNow… responded 200". Indexing-speed effect itself unmeasurable without GSC/Bing tools (human window).
Decision: kept, DONE. Note: same log shows the GOOGLE sitemaps-ping step is dead (deprecated, 404) while echoing success → ticketed 141.

## 2026-07-25 · 039 · Instrument the static SEO surface
Hypothesis: analytics on /tokens/, /chains/, stories makes the SEO investment measurable. → Result: **MOVED**: after 044's guard fix, today's 14d read shows the surface's first-ever prod page_views (9 events across /tokens/btc, /tokens/infinifiusdc, both hubs, /chains/ethereum|aptos|plasma) — firing in prod, not just fixtures.
Decision: kept, DONE. Takeaway: 044's lesson held — "verifier-PASS on fixtures" ≠ "fires in prod"; only a prod event closes the loop.

## 2026-07-25 · 013 · Sitemap quality threshold
Hypothesis: dropping thin/empty URLs from the sitemap drains GSC not-indexed classes. → Result: **INCONCLUSIVE in-loop** — measured via GSC index-coverage classes, which are human-read through ~08-23 (026 parked, standing decision 2026-07-12); no Mixpanel-visible proxy exists.
Decision: kept, DONE (in-loop bookkeeping); GSC verdict lands with the human.

## 2026-07-25 · 018 · NL search actually works
Hypothesis: NL search finds pools on live data for advertised examples. → Result: functional leg holds (rendered Playwright green in today's suite); find-rate claim **INCONCLUSIVE** — window total search_success n=4 (07-12 ×1, 07-19 ×2, 07-23 ×1) vs the ≥30 rule.
Decision: kept, DONE. Takeaway: same as 005/007/008 — usage-rate claims stay unclosable until distribution lands; don't reopen a calendar window, gate on ≥30 searches.

## 2026-07-25 · 019 · Pool-detail converts SEO landers
Hypothesis: a projection + clear CTA on pool-detail converts `?pool=` SEO landers. → Result: **INCONCLUSIVE** — `pool_view{source=url_direct}` = 0 for the entire window (zero SEO landings ever observed); garden_cta clicks 0. The hypothesis was never exercised.
Decision: kept, DONE — operationally superseded by the 2026-07-23 north-star change + the 122–139 pool-detail audit program (same surface, fresher specs).

## 2026-07-25 · 024 · Share = unique working link that rebuilds the garden
Hypothesis: a one-tap "copy this garden" link converts recipients. → Result: **INCONCLUSIVE** — `share_link_created` = 0 in window (no origination; same zero-distribution class as 005/007/008, closed 07-24). Roundtrip mechanics remain code+render verified (test_share_mix_roundtrip).
Decision: kept, DONE. Takeaway already standing: no share-UX window until distribution (069) lands traffic.

## 2026-07-25 · 025 · Concrete prefilled projection on garden_cta
Hypothesis: "→ ~$X in 5y" on the CTA lifts garden_cta → plan_created. → Result: **INCONCLUSIVE** — garden_cta clicks = 0 in window (ctaVariant=concrete never exercised).
Decision: kept, DONE — the concrete-projection frame lives on in 129's projection-lead layout (shipped 07-25); any future read happens under the new north-star CTR query.
