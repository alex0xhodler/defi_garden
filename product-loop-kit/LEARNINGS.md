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

## 2026-07-28 · 082 · Planner `translations is not defined` hardening
Hypothesis: a `safeTranslations()` guard + lazy per-call re-check in `makeT`/`rootT` stops the funnel-top
`ReferenceError` recurring (first and only occurrence 2026-07-13, bare `/`, `planner.min.js` inside a
`useMemo`). → Result: **MOVED, weak-n.** `error_occurred` is **absent from the result set** every day
07-14 → 07-28 — 15 consecutive clean days (`query_id 064d8388`); last non-zero was 07-13, the event that
motivated the item.
Decision: kept, DONE. **The honest caveat matters more than the verdict:** the window carried ~82 sessions
and exactly ONE `plan_created` (07-19), so the planner was barely exercised. "No recurrence observed" is
what the data supports; "proven robust" is not.
Takeaway, and it generalises to every guardrail item at this traffic level: **a zero on an
absence-of-failure metric is only as strong as the number of chances the code had to fail.** Record the
exercise count alongside the zero (sessions, and the specific event that proves the path ran) or the verdict
reads far stronger than it is. This is the mirror image of the waitlist cohort's problem — there the
instrument was unvisited, here the *failure path* was unvisited.

## 2026-07-28 · 088.1 · Rate-track-record / steadiness note on pool detail
Hypothesis: surfacing 087's `historyPoints` + `apyStdev` as a calm track-record note gives the cautious
saver a reason to trust the pool and act on it. → Result: **INCONCLUSIVE at n≈0.** Over 30 days the surface
took `pool_view` **6** (`card_click` 5, `url_direct` 1) and `pool_click` **1** (pre-123,
`source=undefined`); north-star CTA clicks **0**, all-time (`be2a9cdb`).
Decision: kept, 088.1 DONE (parent 088 stays open for further surfacings). The note renders correctly and
degrades honestly across all three tiers (`test_kpi_track_record.js` 7/7 rendered).
Takeaway: pool-detail is now the north-star surface and it received **six views in a month**. Every
pool-detail persuasion item is in the same position the waitlist cohort was in — correct, unexercised, and
unmeasurable. Per the 2026-07-27 process takeaway, this and future pool-detail items should be
**traffic-gated (`pool_view{url_direct}` ≥ 30), not date-gated**; items 166/168 are the first two written
that way.

## 2026-07-28 · PRODUCT QUALITY · The numbers on a surface can be honest while its links lie
Not an experiment window; a product finding. **Yesterday's P0 (159) is fixed and verified on live prod** —
`llms.txt` now serves 0 APY figures above the 1000% rail (was 8, top 353,114.2%) and claims the true
`TVL ≥ $10M` floor. Auditing the *same file* one layer down found a second, independent defect underneath
it, live on prod, of a completely different class.

**What was found (item 166).** 32 links across `llms.txt`/`llms-full.txt` do not go where they claim:
15 pool rows resolve to the **bare homepage** (`generate-llms.js:606` is `pool.url || meta.baseUrl` and no
DefiLlama payload has a `url` field — so the fallback fires on 100% of rows, always); 17 `?search=` links
land on a query-less landing (`search` is in neither `ANALYTICS_PARAMS` nor `PLANNER_PARAMS`, and
`landing.js` reads only `lang`) even though the routed `?protocols=` param already exists; and 8 top-yield
rows are not pool-specific, which is why two distinct Base uniswap-v3 WETH-USDC pools (95.5%/$110.8M and
31.7%/$10.2M) render as two rows on one URL. `grep -c "?pool=" llms*.txt` → **0, 0**: the surface has never
linked to pool-detail, which the 2026-07-23 decision made the north-star surface.

**And item 168:** `grep -icE "planner|savings|goal|subscription|forever number" llms.txt` → **0**. The file
describes the product as a yield screener; the planner — the default face — is absent.

**Takeaways.**
1. **A rail is per-CLASS as well as per-surface.** The 07-27 lesson was "a rail is a property of a surface,
   not of a codebase." Today's refinement: fixing a surface's *numbers* says nothing about its *links*, its
   *positioning*, or any other claim it makes. When you find one defect class on a surface, audit the other
   classes on that same surface before you leave it — the file is already open and the second bug is cheaper
   to find now than ever again.
2. **The checker's signal set is always drawn from the last bug (third instance: 148 → 159 → 166).** 160
   shipped a text-surface prescan specced from 159, so its four signals are all number-or-emptiness checks;
   it scored `suspectCount: 0` on the two files carrying 32 broken links. Ask, every time a check is added:
   *what class of defect could sit on this surface and still pass?* → item 169. Note that item 167, shipped
   the same day by a build run, is the same root cause one axis over — its blind spot was the *target*
   population (one hardcoded pool of 740), this one's is the *claim* class. Same question, different noun.
3. **A fallback that can never not fire is a bug, not a fallback.** `pool.url || meta.baseUrl` reads as
   defensive code and is in fact an unconditional branch: the left side does not exist in any payload shape.
   Grep-check for the field before trusting a `||` fallback — `grep -c '"url"' data/pools-snapshot.json`
   would have answered it in one command. Sibling of `dual-source-logic-divergence.md`.
4. **The most valuable place to look on a quiet tick is the surface you audited yesterday.** Three of the
   last four P0/P1s (148, 159, 166) were found on generated surfaces, by hand, on days the scanner reported
   nothing new — and 166 was found by re-opening the very file 159 had just fixed.

## 2026-07-28 · LOOP PROCESS · A heartbeat can be lapped by a build run mid-tick
Not an experiment. This tick opened on `fac2e30f2`, scored its findings, and wrote three specs numbered
166/167/168. By commit time `origin/main` had moved one commit ahead: a build run had shipped **its own new
item 167** (`audit-app.js` renders one hardcoded pool out of 740, PR #323), created from a finding it made
itself — so the heartbeat's 167 and 168 collided with a live, merged id.
Resolution: renumbered to 166 / 168 / 169 and re-applied every append on top of `origin/main` rather than
committing the stale copies of `BACKLOG.md` / `LOG.md` / `playbooks/product-audit.md` (which would have
silently reverted 167's rows).
**Takeaway (binds every future tick that writes ids):** the highest id in the working copy is not the
highest id in the repo. Before assigning ids, `git fetch origin main` and read ids from `origin/main`, not
from the checkout — and before committing, `git checkout origin/main -- <the shared append-only files>` and
re-apply, because `BACKLOG.md`, `LOG.md`, `LEARNINGS.md` and the playbooks are append-only files that two
loops write. This is the 2026-07-26 "two build runs built 148" failure in a new costume: the shared
bookkeeping files are the contended resource, and a heartbeat that never re-reads them will clobber whatever
shipped while it was thinking.

## 2026-07-29 · EXPERIMENTS · Four windows closed — three at n≈0, one real
Measured from `signals/2026-07-29.md` (prod-filtered Mixpanel, project 4042048).
- **094** (pool-row protocol/chain logos, shipped 07-15) → **INCONCLUSIVE at n≈0.** Prod `pool_view` 30d = 6,
  `pool_click` = 1. Kept.
- **114** ("Welcome back" saved-garden re-entry card, shipped 07-15) → **INCONCLUSIVE at n≈0.** Prod
  `plan_created` 30d = 3, all pre-window; no planner session since 07-19. Kept.
- **115** (honest `.ics` "tend your garden" reminder at bloom, shipped 07-15) → **INCONCLUSIVE at n≈0.**
  Prod `tend_reminder_added` 30d = **0** against 3 `plan_created`. Built, instrumented, three chances to
  fire in thirty days. Kept.
- **149** (`audit-app.js` self-heal + fail-loud in a fresh clone) → **MOVED. DONE.**

**The takeaway that matters is the asymmetry, not the four verdicts.** Three of these were product
experiments and all three closed unreadable; the one that closed with a real verdict (149) was an
*internal-tooling* item whose evidence is produced by the loop's own run rather than by users. At ~6
sessions/day, that will be true of every product experiment for the foreseeable future. Consequence for
spec-writing, applied not proposed: 173/174 were written with **traffic-gated** windows (hold until ≥30
`page_view` on the SEO surface) and a decision rule of *keep unconditionally, the metric read is
informational* — because a page that promises 33 pools and delivers 0 is broken at any traffic level, and
pretending a calendar window will adjudicate it is theatre.

## 2026-07-29 · PRODUCT · A link check has three levels, and we keep building level 1
`prescanStaticPages()` scanned 2,200 pages and returned 7 suspects, all `junk-slug`. **172's
`link-target-integrity` signal — shipped that same morning — scored 0 on the 2,200 pages carrying 1,749
dead CTAs** (item 173, found by hand hours later). Not a defect in 172: it was specced from 166, where a
broken link meant *an unrouted query param*, so it checks param membership. `?chain=Cardano` is perfectly
routed. It just returns nothing.

**148 → 159 → 166 → 173: four consecutive P0/P1s where the checker's signal set was drawn from the shape of
the previous bug.** The loop has now recorded "the next bug is in the class nobody has been bitten by yet"
three times without escaping it. The escape attempt is to stop enumerating instances and name the axis:

1. **Routed** — is the param one the router recognises? (`?search=` was not → 166. 172 automates this.)
2. **Resolvable** — does the value name a real entity: a pool id, a project slug, a preset key?
   (Checked by hand this tick across `llms*.txt`: 40 links, 0 misses. Nothing automates it.)
3. **Non-empty** — does the target, **under its own default filters**, return what the linking page claims?
   (Nothing checks it. All 1,749 of 173 live here.)

Level 3 is the only level that can catch a defect where **both surfaces are individually correct and the
contract between them is broken**. That is exactly 173: the page is right about its own $100K set, the app
is right about its $10M default, and the link between them is a lie. A checker that only ever validates one
surface against itself is structurally incapable of seeing this class — which is why four rounds of adding
signals has not helped. → item **175**, whose decision rule tests the *strategy*: if the next link-class bug
is again found by hand first, stop extending signals and redesign the checker.

**Generalised trap (sibling of `dual-source-logic-divergence.md`): whenever two artifacts in this repo are
built from the same data by different code paths, the bug is in the CONTRACT, not in either path.** The
$100K/$10M mismatch had been live since the SEO surface existed, survived items 133, 148, 154, 157, 159,
166, 167, 172 — every one of which touched either the generators or the checker — because each of them
audited one side.

## 2026-07-29 · SIGNAL HYGIENE · The prod filter is what makes the guardrail claim true
Ran the daily-trend query twice: once with `$current_url contains www.defi.garden`, once without.
Unfiltered, 07-15 shows `session_start` 40 and **`error_occurred` 3**. Filtered, 07-15 shows 5 and **0**.
The three errors are localhost/preview traffic — our own dev sessions.
A heartbeat that drops the prod filter reports a phantom error spike and breaks its own guardrail streak;
one that never runs the unfiltered control cannot tell a real prod-zero from a filter typo that silently
matches nothing. **Run both, record both, claim only the filtered one.** Now part of `product-audit.md`.

## 2026-07-29 · LOOP PROCESS · A stale branch is not a diff, and its verifier verdict does not transfer
Item 148 sat as PR #306 for 4 days awaiting one human answer. When the answer came ("merge"), the merge
returned `405 Pull Request has merge conflicts` — and the conflict was the *lucky* outcome, because
merging it would have silently reverted two items that shipped the same day:
- **173** — `main`'s `generate-token-pages.js` now emits `?token=…&minTvl=${MIN_POOL_TVL}`. The 07-26
  branch carries the pre-173 line. The merge would have re-broken 1,701 token-page CTAs hours after they
  were fixed and verified live on prod.
- **170** — the branch's `package.json` is the pre-lane flat test chain. The merge would have deleted the
  `plain`/`browser` lane runner and ~14 tests (`test_seo_cta_targets.js`, every `test_audit_*.js`) from
  the merge gate — including the test that guards 173.

Both are files the 148 diff touches only *incidentally*: it needed `isValidToken` in one and a test
registration in the other. A branch diff carries the WHOLE file, not the hunk you care about.

**Takeaway (binds every future ship off a branch older than ~1 day):** a PR's diff is computed against its
BASE, not against `main`. When the base has moved, "merge the PR" and "apply the change" are different
operations, and the verifier PASS earned against the old base **does not transfer** — it verified a repo
that no longer exists. Do not merge; **transplant**. Check out the current `main`, apply only the hunks the
spec called for, re-prove non-vacuity on the new checkout, regenerate any derived surface from scratch, and
re-verify. Then close the original PR as *superseded*, not merged.
**Detection, cheap and mandatory before any stale-branch merge:**
`git diff origin/main origin/<branch> -- <each hand-written file>` — every `-` line that is *newer* than
the branch is something the merge would revert. Here that surfaced two in seconds.
This is the third costume of one failure: 07-26 "two build runs built 148", 07-28 "a heartbeat can be
lapped mid-tick", and now "a branch can be lapped between authoring and merge". The contended resource is
always the same — `main` moves while work is in flight — and the fix is always the same: re-read `main`
immediately before writing, and re-derive rather than replay.
