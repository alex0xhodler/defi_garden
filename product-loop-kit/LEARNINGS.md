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

## 2026-07-26 · 041 · Static `/chains/<slug>` landing pages
Hypothesis: real server-delivered chain pages (mirroring 014/021's token pattern) earn organic indexing/traffic that thin `?chain=` shells never could. → Result: build leg **MOVED** (86 real `/chains/<slug>` pages generated by daily CI, `sitemap-chain-pages.xml` wired into the index — verified at ship and still live); traffic leg **INCONCLUSIVE** — window 07-12→07-26 produced 4 prod page_views across `/chains/ethereum|aptos|plasma|linea` (7d read `becb8e74`), vs the ≥30 rule.
Decision: kept, DONE. Takeaway: identical to 021 — chain pages inherit the token-page verdict; the surface exists and is being crawled, but the traffic claim needs GSC (human, ~08-23) or ≥30 page_views. Do not reopen a calendar window on it.

## 2026-07-26 · 048 · Freshness signals on generated pages
Hypothesis: visible "Last updated" + `dateModified`/`datePublished` schema counteracts 2026 AI-recency bias and lifts citation/indexing of the generated surface. → Result: build leg **MOVED** (freshness stamps present and rendered — re-verified this tick on `/chains/plasma`, `/tokens/usdc` and both hubs during the 07-25 audit sweep; grep-confirmed 0 signals before the change); effect leg **INCONCLUSIVE** — the effect is only observable in GSC/AI-citation data, which no in-loop source exposes.
Decision: kept, DONE. Takeaway: freshness/schema items are unmeasurable in-loop by construction — score them on cost, not on expected measurable lift, and close them on functional verification alone (the 020 precedent).

## 2026-07-26 · 049 · Cross-surface internal linking (token↔chain↔category)
Hypothesis: a hub-and-spoke topical graph stops the generated pages being orphans (2026 SEO: orphan pages don't index) and spreads crawl equity. → Result: build leg **MOVED** (cross-links live; the crawl trickle is now demonstrably reaching non-hub leaf pages — `/chains/linea` and `/tokens/infinifiusdc` both recorded prod page_views this window without being linked from the top-60 hub tier); traffic leg **INCONCLUSIVE** at n=7 page_views/7d.
Decision: kept, DONE, and supersedes 043 (its category-cross-linking leg) — 043 marked SUPERSEDED, no separate window. Takeaway: leaf-page crawl arrival is the earliest observable proof an internal-linking change worked; it lands long before traffic does, so measure it as the build leg's success criterion.

## 2026-07-26 · 061 · Waitlist reframe to the card value prop
Hypothesis: reframing waitlist copy to the yield-funded subscription card (deposit → position → disposable card pays the sub) lifts `waitlist_opened → waitlist_submitted`. → Result: **INCONCLUSIVE** — window 07-12→07-26 (`8fa2615d`): `waitlist_opened` = 0, `waitlist_submitted` = 0, `waitlist_email_entered` = 0, `waitlist_submit_attempt` = 0. None of these events has EVER fired in prod; neither side of the funnel was exercised.
Decision: kept (honest copy, costless while dormant). Takeaway: the waitlist funnel is in exactly the state the share funnel was in on 07-24 — instrumented, correct, and completely unvisited. Per the 005/007/008 standing takeaway, gate every future waitlist-copy window on a traffic precondition (≥30 `waitlist_opened`), never on a ship date; and note that 063's drop-off instrumentation cannot pay off until that precondition is met.

## 2026-07-26 · LOOP PROCESS · Two build runs built item 148 the same day — the picker is blind to open PRs
Not an experiment window; a process finding, recorded here because it cost a full duplicate build and the fix is a rule change, not a code change.

**What happened.** A build run at 10:17 UTC built item 148 (junk token slugs), verified it, and opened **PR #306**, correctly leaving it BLOCKED for the human on the NEVER-list question. A second build run at ~12:05 UTC read `BACKLOG.md` on `main`, saw 148 still `READY` with `Attempts 0`, and built it again end-to-end — its own build agent, its own verifier, its own PR-ready commit — before discovering #306 at the `git push` step (the push was rejected because `claude/loop-148` already existed remotely). ~250k subagent tokens spent re-deriving a conclusion that already existed. The second run discarded its branch rather than opening a competing PR.

**Root cause, and why it will recur.** The 2026-07-13 docs-in-first-commit rule (reaffirmed 2026-07-13 for both ship modes) puts the `BACKLOG.md` status change in the SAME commit as the product code — which is right for atomicity, but it means the status change lands on `main` only when the PR MERGES. For an item that ships and merges in the same run, that gap is seconds. For an item that ends **BLOCKED with the PR left open** — exactly what the NEVER-list rule mandates — the gap is however long the human takes to answer. Throughout that gap, `main`'s BACKLOG advertises the item as `READY`, and `prompts/build.md` step 1 ("take the highest-scored item with status READY") sends the next run straight back into it. The two runs even reached the same verdict independently, which is reassuring about the judgment and damning about the cost.

**Both implementations were sound; they differed in ship shape.** #306 committed the full 5,596-file live regen (junk removal + ordinary daily TVL churn, 19 real tickers out / 11 in). The second run kept a 33-file surgical diff — predicate + test + the 7 orphaned artifacts + their sitemap `<url>` blocks — on the argument that a full regen buries a 20-line fix (item 145's lesson) and that `sitemap-update.yml`'s push trigger regenerates on merge anyway. Both are defensible; #306 was first, so it is the one that stands.

**Takeaway (bind the next build run).** Before picking a READY item, check for an open PR whose branch is `claude/loop-<id>` — an open PR is a status that `BACKLOG.md` on `main` structurally cannot show. Treat "open PR exists for this id" as equivalent to `IN_REVIEW`/`BLOCKED` and skip to the next item. Cheapest check: `git ls-remote origin 'refs/heads/claude/loop-<id>'` before starting, or list open PRs. The alternative fix — splitting the status change into a separate pre-PR commit on `main` — is rejected: it re-opens the two-deployments-per-item problem the 2026-07-13 Vercel-quota decision exists to close.

## 2026-07-27 · 062 / 063 / 066 / 068 / 075 / 079 · the waitlist-funnel cohort (six windows, one verdict)
All six shipped 2026-07-13/14 and were measured on the same instrument: the 009 waitlist funnel over 07-13→07-27 (`query_id 9fe39c5b`).
Hypotheses, in one line each: **062** a waitlist CTA on the 2,131 static SEO pages converts crawl-arriving readers · **063** step-by-step drop-off instrumentation shows where the waitlist funnel leaks · **066** an honest per-token "what your idle stack earns" headline strengthens the card pitch · **068** outcome-framed hero copy lifts the top of the waitlist funnel · **075** the same headline extended to chain pages · **079** the CTA on the 58 hub/az spine pages.
→ Result: **INCONCLUSIVE, all six.** `waitlist_opened`, `waitlist_email_entered`, `waitlist_submit_attempt`, `waitlist_submitted`, `waitlist_cta_click` and `share_link_created` are **all absent from the result set** over the full 14-day window — not low, never fired. Prod `page_view` in the same window = 48.
Decision: all kept, all DONE. Build legs verified functional at ship; not one of the six hypotheses was ever exercised.
**Takeaway, and it is now the third cohort to say it** (share funnel 07-24, waitlist reframe 07-26, this): *stop opening calendar windows on the waitlist funnel.* The instrument is correct and the surface is unvisited; a 14-day timer measures nothing but the passage of time and costs a heartbeat's attention to close. Gate the next waitlist item on a **traffic precondition** — ≥30 `waitlist_opened` events — not a date. Six windows closing on one identical zero is the strongest evidence yet that the loop's measurement discipline is being spent where there is nothing to measure.

## 2026-07-27 · 064 · X-spotlight → waitlist attribution
Hypothesis: tagging spotlight arrivals (`src=x_spotlight` + `ref`) makes per-post distribution measurable. → Result: **INCONCLUSIVE, but with a clean NEGATIVE that is worth more than the window** — prod `page_view` broken down by `src` over 07-13→07-27 (`d649acd9`) returns a **single row: `undefined` = 48**. Zero tagged arrivals of any kind.
Decision: kept, DONE. The attribution leg is built, correct and **unexercised** — this is not a broken instrument, it is an unposted campaign. The 069 spotlight packs (3 committed, ready-to-post since 07-13) have not been posted.
Takeaway: `src` breakdown is now the loop's **cheapest true test of whether distribution has started at all** — one query, unambiguous, no sample-size caveat. Run it every tick before scoring any distribution item; while it returns only `undefined`, every distribution hypothesis is untestable by construction and should be scored as blocked-on-human, not as a live experiment.

## 2026-07-27 · PRODUCT QUALITY · A trust rail enforced in the app was never applied to the surface that speaks for it
Not an experiment window; a product finding, recorded here because the *class* generalises and the loop should have caught it months earlier.
**What was found.** `https://www.defi.garden/llms.txt` — live, fetched by curl — publishes `- BSC · zeebu · ZBU — 353114.2% APY, $576,877 TVL` under "Live highest APY opportunities". `generate-llms.js` contains **zero occurrences of `SANITY`** and uses a `$10k` TVL floor against the product's `$10M`, then sorts APY-descending. The surface is, by construction, a ranked list of the dataset's worst anomalies. → item 159.
**Why the loop missed it for so long.** Every rail check the loop has ever run — including this tick's first attempt — targeted the *app* and the *snapshot*. `llms.txt` is a text file: not a page, not in the audit scanner's surface list, not covered by any test. It was never *decided* to be out of scope; it simply never entered anyone's field of view. → item 160.
**How it actually surfaced** (worth copying): a schema mismatch, not a hunch. The data-layer scan was written as `pools.filter(p => p.apy > 1000)` and returned 0. That looked like a clean rail — but `data/pools-snapshot.json` **has no `apy` field** (keys: `apyBase`, `apyReward`, `apyMean30d`), so the check was passing vacuously on every pool. Re-deriving total APY as `apyBase + apyReward` gave the real answer (max 39.91%, rail genuinely holding), and asking *"who else reads `pool.apy`, then?"* led straight to `generate-llms.js:236/462/576` and the live breach.
**Takeaways.**
1. **A rail is a property of a surface, not of a codebase.** `APY_SANITY_LIMIT` being defined in `app.js` and `planner.js` says nothing about `generate-*.js`. When a rail matters, enumerate every emitter of the railed value and check each one; "the rail exists" is not evidence any given surface applies it.
2. **A filter that returns zero is not evidence of health until you have proven it can return non-zero.** Run every rail check against a known-bad value first. This tick's vacuous check would have reported "0 pools over the limit" forever.
3. **Dual-source schema divergence is real here:** the live `/pools` payload carries `apy`; the committed snapshot does not. Code that reads `pool.apy` works on one source and silently yields `undefined` on the other. Any fixture must match the shape of the source the code under test actually reads.
