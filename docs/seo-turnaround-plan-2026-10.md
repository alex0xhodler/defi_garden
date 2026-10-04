# SEO turnaround: red team of `seo-bing-ai-search-plan.md` + the plan that replaces it

**Date**: 2026-10-04 · **Inputs**: `docs/seo-bing-ai-search-plan.md` (GSC + Bing AI exports, 2026-10-04), `docs/audit/seo-aio-audit-2026-09-09.md`, the live repo at `d9ccd26afd2`, data from `data/pools-snapshot.json`, and search-industry sources from June to September 2026 (linked at the bottom).

---

## Verdict

**The current plan is a plan to fix titles, but the real problem is ranking.** 14 clicks from 1,363 impressions is not a click-through problem. Almost every page with impressions sits at **position 20–87**, and pages that low get close to zero clicks whatever the title says. Rewriting about 4,800 titles will not move a low-trust domain 30 positions.

**Three things actually cap traffic:**

1. **Thin pages in the index during a spam update.** 1,408 token pages list a single pool, and with the KO twins that is about 2,800 pages. All of them are `index,follow`, and none are in the sitemap. Another 619 pages list only 2–4 pools. Google's September 2026 spam update started Sep 24 and can take up to two weeks, so it runs until about Oct 8.
2. **The SEO pages are a thinner copy of DefiLlama.** The product pivoted to predictive underwriting on 2026-09-27. Yet DeFi Score and the 14-day forecast (7,461 pools scored) appear on **zero** token, chain, guide or home pages, and in no `llms.txt` entry. The one thing nobody else publishes is missing from every crawlable page.
3. **Zero earned authority.** The Sep 9 audit listed links, a monthly data report and pruning as P2 work. None of it shipped. In the same four weeks the repo shipped the Laso card, x402, referral gamification and two landing rebuilds. Rankings need the work that keeps getting skipped.

**One-line strategy:** stop being a thinner DefiLlama. Become the place that answers *"is this yield real, and will it hold?"* with a published, back-tested score, on fewer and stronger pages, and earn links with the data.

---

## What changed in search, June to September 2026 (only what bears on this site)

| Change | What it means here |
|---|---|
| **Spam updates on Jun 24–26, Aug 18–20 and Sep 24 (still rolling, up to 2 weeks).** It is a "normal" spam update covering all 16 policies, scaled content abuse included. | The Sep 9 audit's GSC timeline shows impressions **collapsing Jun 27** and **recovering Aug 19**. Both dates fall right after spam-update windows. That doesn't prove anything, but it suggests the site sits near the classifier line. In Glenn Gabe's August case studies, the sites hit domain-wide were **programmatic + YMYL + scaled** sites. That describes this site. |
| **AI Overviews cut organic clicks by 38%** where they appear (randomized field study, Jan–Feb 2026). Zero-click searches reached **68%** (SparkToro, Jan–Apr 2026). | "Best X yield" (a comparison query) and "what is DeFi yield" (a question query) are the query types most likely to trigger an AI Overview: **95%** and **86%** of the time, per Seer. Clicks for these queries are shrinking for everyone. |
| **Being cited in an AI Overview means about +120% clicks per impression** compared with not being cited (Seer, 2.43B impressions). | Being cited is now the main way to get those clicks. You get cited by having **data the answer needs and nobody else has**, not by matching synonyms. |
| **ChatGPT sends about 92% of AI referral traffic. Copilot is down 96% from its peak; Claude is up 64x** (Previsible, Nov 2024 to May 2026). | Bing AI "citation share" tells you whether you can be retrieved. It isn't a traffic source, so don't steer by it. Claude's growth matters for the MCP surface. |
| **GSC Generative AI report** (AI Overviews + AI Mode, impressions only, no query data): launched in the UK Jun 3, global in August. **Bing AI Performance** (beta) shows grounding queries. | Bing is the only place you get query-level AI data. Use it as a free keyword-research feed, not as a scoreboard. |
| Google has shown FAQ rich results only for authoritative government and health sites since 2023. | FAQPage schema will not change your Google results. |

---

## Red team: the current plan, claim by claim

| # | Plan claim | Verdict | Evidence |
|---|---|---|---|
| 1 | "Zero-click problem: titles don't promise an answer" | **Wrong for 10 of 11 pages listed** | `/chains` sits at position 64, `/chains/tron` at 70, `/chains/ethereum` at 63, `/tokens/eth` at 64. Only `/` (6.7) and `/chains/robinhood-chain` (7.9, 31 impressions, 0 clicks) are high enough for the title to matter. |
| 2 | "Titles move position 50–70 to 20–30" | **No mechanism** | Title relevance is a minor factor. A new domain with low trust and a thin page set doesn't jump 30+ positions on title wording. This is ungrounded, like the Sep 9 audit's targets (200 impressions/day by Oct 9; actual is 15–40). |
| 3 | New chain title: `Best {Chain} Yield Farms & Staking Pools — {N} Live Vaults Compared \| DeFi Garden 🌱` | **Promise and content don't match** | It is about 84 characters and gets cut off at about 60. "Vaults" is wrong; these are pools. "Staking pools" is not what the Polygon page lists (Aave lending). "Best" sits on top of a TVL-sorted table that opens with **WBTC at 0.01% APY**. Searchers bounce, and that hurts more than the title helps. |
| 4 | "Best yield farms on polygon": 325 Copilot citations | **The answer being cited is a trust bug** | The page's "highest honest Polygon yield" is **blackrock-buidl at 3.78%**. BUIDL is open to qualified purchasers only, so no retail reader can buy it. The trust rails filter anomalous APY but not *who can access* a pool. |
| 5 | Target: Bing AI share from 19% to 30%+ | **Vanity metric** | Copilot referrals are down 96%. Track the share as a leading indicator and nothing more. |
| 6 | FAQPage on the guide "should push share significantly higher" | **Cheap, but expect almost nothing** | No Google rich-result effect, and the Bing claim has no source. The **definition-first lede** is the part that matters. Keep both; it's a 30-minute job. |
| 7 | Hub page targeting "[chain] tvl" | **Drop it** | DefiLlama is the source of every TVL number, including yours. You can't outrank the source for its own number. |
| 8 | "Korean pages convert" | **3 clicks. Directional only** | The real point is less competition, so act on it cheaply (see Naver, LH5). |
| 9 | "Risk: Low" | **Wrong timing** | Rewriting about 4,800 page templates while a spam update rolls out makes the outcome impossible to read. Ship after about Oct 8, on a cohort first. |
| 10 | Not in the plan | **The real problems** | The pivot, the thin pages, links, inflated claims (below) and data bugs. |

---

## Trust bugs live on YMYL pages right now (fix before anything else)

These undercut the "honest numbers" position on pages Google treats as financial advice:

- **Wrong chain count on token pages.** `tokens/usdc.html` says "1,576 USDC pools **across 3 chains**", but those pools span **42 chains**. The cause is in `generate-token-pages.js:1603`: `chainCount` is computed from `rec.pools`, which is the displayed slice (8 rows), not the qualifying set. The same bug feeds the meta description on every token page.
- **"Best" picks that retail users can't buy.** BUIDL heads the Polygon page. The landing card's top pick is **USDY**, which isn't offered to US persons, and US is your largest impression market. USTB and USYC sit in the top score tier. You need an access flag (permissioned, KYC or geo-restricted) and a "best you can access" default.
- **A mock card printed in crawlable text.** `DEBIT METAL •••• 8453 … 🟢 100% PRINCIPAL INTACT` appears on **all 82 chain and all 2,311 EN token pages** (`generate-token-pages.js:474`). A principal-safety claim on a YMYL page is read by every crawler and LLM.
- **Card copy contradicts itself across the site.** Chain pages say "Card doesn't exist yet · Join the waitlist", while token and pool pages hand off to a live Laso card.
- **Inflated claims, still live.** `ai-info.html` still shows the "99.4%" score pill and "the first yield discovery interface…". The Sep 9 audit flagged both; neither was fixed.
- **Three different product stories.** The home `<title>` says "Yield Finder & Savings Planner", `llms.txt` describes the planner, and the product is now underwriting. Search engines and LLMs can't tell what the entity *is*.
- **⚠ "AAA / AA / A / BBB" labels** (57 AAA, 4,105 AA in the snapshot). This is credit-rating vocabulary, and you operate from the EU (NL), where issuing credit ratings is regulated. I'm not a lawyer. Get a 30-minute opinion or rename the bands (e.g. *Score 92 · Grade A+* or *Tier 1*) **before** they go onto hundreds of indexable pages. Renaming now costs a find-and-replace; later it's a cleanup across the whole site.

---

## The plan

### Phase 0: Defend (this week, before about Oct 8)

**D1. Noindex the thin token pages.** Set `noindex,follow` on token pages with fewer than 3 qualifying pools: 1,408 EN plus their KO twins. Keep them live for users and drop them from `llms-full.txt`. For the 619 pages with 2–4 pools, noindex any that have had zero GSC impressions in 90 days. The indexable set shrinks from about 4,800 to roughly 1,000–1,800 pages. *Why now:* noindex lowers exposure during the rollout. Every scaled-content case from August was hit domain-wide, not page by page.

**D2. Fix the trust bugs above** in one commit each: the chain count, the access flag on "best" picks, removing the mock card text and unifying the card copy, and the `ai-info` claims.

**D3. Get the facts before deciding anything else.** Export from GSC: (a) daily impressions Sep 15 → today, and (b) the Page indexing report (indexed vs "Crawled – currently not indexed"). If impressions dropped after Sep 24, **you were hit**: prune harder (all pages with fewer than 5 pools) and pause Phase 1. If they held, go ahead.

**D4. Measure AI traffic.** Add an `ai_referrer` property in `analytics.js`, keyed on the referrer host (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com), plus `utm_source=chatgpt.com`, which ChatGPT already appends. Today you can't see the one AI channel that sends traffic.

### Phase 1: Low-hanging fruit (Oct 8–20, each ≤1 day)

| # | Move | Why it's worth it |
|---|---|---|
| LH1 | Rewrite the title and description for the **two pages already in the top 10**: `/` and `/chains/robinhood-chain` | The only pages where CTR work pays off today. |
| LH2 | Rewrite chain and head-token titles to **≤60 characters, honest, dated**, e.g. `Best Polygon Yields (Oct 2026), Ranked by Risk \| DeFi Garden`. Drop the 🌱 because it costs characters. **Only together with LH3.** | Matches the vocabulary of "best X yield" queries without overpromising. The month and year are honest because the data refreshes daily. |
| LH3 | Put a **"Top 5 by DeFi Score: pools you can actually access"** table above the TVL table on chain and token pages | This is what makes "best" true, and it's the first time the pivot shows up in the SEO pages. |
| LH4 | On the guide: add a 40–60-word **definition-first answer block**, the "earn / earning" vocabulary in an H2, and FAQPage markup (for Bing) | Captures the "defi earn explained" cluster (36–44% share already) with one page and no new ones. |
| LH5 | Register **Naver Search Advisor**, submit the KO sitemaps, and confirm KO sitemaps are in Bing | Korea is the only group that clicks (50% CTR at position 6). Naver is a top-two engine there. One hour of work. |
| LH6 | **Weekly Bing grounding-query loop**: for each query that cites you but where you rank below #3 on Bing, move the phrase higher on the page and add 2–3 internal links from your top-5 Bing pages | A documented tactic for raising citations, driven by the only AI query data you get. |
| LH7 | Fix the `robots.txt` content signal: `Content-Signal: search=yes, ai-input=yes, ai-train=no` (`use=` isn't a defined key) | Explicitly allows grounding and answer use, which is what you want. |
| LH8 | Make `llms.txt`, the home `<title>` and `ai-info` tell the **underwriting** story with verifiable facts only | One consistent entity: "DeFi Garden scores DeFi yields and forecasts them 14 days out." |

### Phase 2: The big wins (Oct 20 to December)

**W1. Static scored pool pages for the top ~300 pools.** *(the main source of new traffic)*
Use human-readable slugs, e.g. `/pools/aave-v3-usdc-base` (canonical; the `/?pool=` app URL stays untouched). Each page shows: live APY, 30-day mean, base vs reward split, **DeFi Score with its breakdown**, the **14-day forecast band (p10/p50/p90)**, the APY history as a static SVG, what produces the yield, **who can access it**, withdrawal notes, the risks, and the CTAs. Only pools with **TVL ≥ $10M and ≥30 days of history** qualify; everything else gets `noindex`.
- *Target queries:* "[protocol] [token] apy / rate / yield" ("aave usdc rate base", "maple usdc yield"). These are specific, have clear intent, and DefiLlama's own page answers them with a JS chart and no text.
- *Why it wins:* you'd be the only page with a forecast band and a scored breakdown, the kind of unique data that gets pages cited. It's built to compare, which is what AI answers pull from. And it **is** the north-star conversion page.
- *Repoint internal links:* the static pages currently link to `/?pool=…&src=seo_chain`. Those are JS-rendered URLs with a tracking parameter, so link value leaks out of the static pages into the app. Point them to the static pool pages.
- *Kill switch:* ship 100 pages first. If fewer than 40% have any impressions 30 days later, stop expanding and fix quality before going further.

**W2. A public forecast scorecard, `/forecast-accuracy`, rebuilt weekly in CI.** *(the trust asset)*
You have daily history since 2026-09-05 and the stored forecasts. Publish the mean error for last month's 14-day forecasts, the share of outcomes that landed inside p10–p90, and **the biggest misses, named**. This turns "our score" into "a score with a public track record". It makes "honest numbers beat exciting numbers" something you can prove, and it's the strongest answer to the "AAA" risk. Nobody else in this space publishes their misses.

**W3. A monthly "State of DeFi Yield" data report and one weekly stat.** *(the link engine)*
Cover the median stablecoin yield, the share of headline APY that is reward emissions, how many pools broke their forecast band, and the top movers, each with one chart. Pitch the chart, not the site, to crypto data desks and newsletters (The Defiant, Blockworks, Bankless-style newsletters), your DAO networks (Gearbox, Accountable) and r/defi. **Without links, positions 50–80 stay put; this is the only thing in the plan that fixes that.** Target: **10 referring domains by Nov 30.** It needs about 2 hours a week of your time for outreach, and no agent can do that part for you.

**W4. Protocol pages, e.g. `/protocols/aave-v3` ("Is Aave safe? DeFi Score across N pools").** These go after W2 and the rating-label decision. "Is X safe" has the most volume and the highest YMYL stakes in crypto search. Publish them only once the methodology and the scorecard exist.

**W5. Make the score available to agents.** A `get_pool_score` MCP tool that returns score, breakdown, forecast band and access flag. List it in the MCP registries. Claude referrals are up 64x, and this is the agent version of W1 for about a day's work.

---

## Calendar

| Week | Ship | Exit check |
|---|---|---|
| Oct 5–8 | D1–D4 | GSC export read; you know whether the spam update hit you |
| Oct 9–20 | LH1–LH8 | Titles changed on a cohort (chains first, then head tokens) and the date logged |
| Oct 20–Nov 3 | W1 (first 100 pools) + W2 v1 | Pages indexed; scorecard live |
| Nov 3–30 | W3 report #1 + outreach; W1 → 300 pages if the kill switch passes | 10 referring domains; ≥40% of W1 pages with impressions |
| Dec | W4 (if the rating labels are cleared), W5, report #2 | See the scoreboard below |

## Scoreboard (replaces the "Expected Impact" table)

These are targets, not predictions. Today's baseline is about 14 clicks per quarter, so anyone promising more is guessing.

| Metric | Today | Dec 1 | Feb 1 |
|---|---|---|---|
| Indexed pages with ≥1 impression / total indexed | unknown (D3) | >50% | >70% |
| Organic clicks / week (Google + Bing) | ~1 | 25 | 100 |
| Referring domains | ~0 | 10 | 25 |
| Pool-page CTA clicks from organic and AI referrals (north star) | unmeasured (D4) | baseline | 2× baseline |
| Bing grounding queries citing you | 13 clusters | tracked weekly | trend only |

---

## Revised commit plan (replaces the 5 commits)

1. `fix(seo): noindex token pages with <3 qualifying pools; drop from llms-full`
2. `fix(tokens): chainCount from qualifying set, not display slice`
3. `fix(seo): access flag for permissioned pools; never headline them as "best"`
4. `fix(seo): remove mock card text from crawlable HTML; one card story on chain pages`
5. `fix(ai-info): remove unsourced claims (99.4%, "first…")`
6. `feat(analytics): ai_referrer property`
7. `feat(guide): definition-first lede + earn vocabulary + FAQPage`
8. *(after ~Oct 8)* `feat(seo): ≤60-char dated titles + "Top 5 by DeFi Score" table on chain/head-token pages`
9. `feat(seo): static scored pool pages (top 100, gated) + repoint internal links + sitemap`
10. `feat(seo): /forecast-accuracy weekly scorecard`
11. `chore(seo): llms.txt + home title tell the underwriting story`

Every generator change still means regenerating and committing the static files (see CLAUDE.md), plus EN and KO together.

---

## Red-teaming this plan

- **W1 is programmatic content too.** Mitigations: a hard gate (300 pages, not 7,461), unique data on every page, a published methodology, and the kill switch. If D3 shows a hit, W1 waits.
- **The scorecard may make the forecasts look bad.** That's the point. A published miss is more credible than an unpublished hit, and if the forecasts are bad you need to know before you scale them.
- **The rating labels may need legal work** that delays W4. W1 to W3 don't depend on it if the bands are renamed.
- **W3 depends on your time.** If outreach doesn't happen, nothing in Phase 2 moves rankings. Decide that honestly before starting.

## Decisions that are yours

1. OK to noindex 2,800–4,000 thin token pages (EN+KO)? Recommended: yes.
2. Rename the AAA–BBB bands, or get a legal read first? Recommended: rename now; it's cheap.
3. Commit 2 hours a week to W3 outreach through December? If not, cut W3 and lower the Feb targets by half.

## Don't build

- **Don't** rewrite titles while the spam update is rolling out, and don't ship them without the content (LH3) that makes them true.
- **Don't** fight DefiLlama for "[chain] tvl".
- **Don't** make a page per synonym ("defi earn", "defi earning", "defi yield meaning"). One guide, one answer block.
- **Don't** generate pages for all 7,461 scored pools. That is exactly what the August case studies looked like.
- **Don't** add more agent manifests (x402, acp, ai-catalog, oauth). That infrastructure already exceeds demand, and the claims in it cost more trust than they earn.
- **Don't** publish self-promotional "best DeFi yield platforms" listicles. They lift AI recommendations a little, but on a YMYL site during spam updates the downside wins.
- **Don't** put more card or waitlist UI on SEO pages until the card story is the same everywhere.

---

## Sources

- [Google Search Status Dashboard: ranking incident history (2026)](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history)
- [Launchcodex: Google's September 2026 spam update](https://launchcodex.com/blog/seo-geo-ai/google-september-2026-spam-update/)
- [Glenn Gabe (GSQI): August 2026 spam update case studies](https://gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/)
- [Search Engine Journal: AI Overviews cut organic clicks 38% (field study)](https://www.searchenginejournal.com/ai-overviews-cut-organic-clicks-38-field-study-finds/573145/)
- [Search Engine Land: zero-click searches reach 68% in early 2026 (SparkToro)](https://searchengineland.com/google-zero-click-searches-2026-study-479717)
- [Seer Interactive: AIO impact on Google CTR, 2026 update](https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update)
- [Previsible: 2026 AI traffic report](https://previsible.com/seo-strategy/ai-traffic-report-july-2026/)
- [Neil Patel: GSC generative AI report](https://neilpatel.com/blog/gsc-ai-search-data-generative-ai-report/)
- [Position Digital: AI SEO news (Aug–Sep 2026)](https://www.position.digital/blog/ai-seo-news/)
- [Edward Sturm: using Bing's AI Performance report for citations](https://edwardsturm.com/articles/bing-webmaster-tools-ai-performance-report-grounding-queries-get-more-llm-citations/)
- [Arc Intermedia: September 2026 organic & AI visibility roundup](https://www.arcintermedia.com/shoptalk/organic-ai-visibility-news-september-2026-roundup/)

---

## Addendum, 2026-10-04 evening: red team of the D3 coverage verdict

**Verdict on the verdict:** the noindex decision holds up. "You were not hit / Phase 1 is green" does not. Five of the note's eight conclusions are wrong or unsupported, and the most useful thing in the data was missed: **your own internal links create most of the URLs Google is refusing to index.**

| # | D3 claim | Verdict | Why |
|---|---|---|---|
| 1 | "NOT hit: indexed count grew 44% through all three spam updates" | **Unsupported for September** | The last data point is **Sep 19**, five days *before* the Sep 24 update began. Spam updates also demote pages in the rankings; they rarely remove them from the index, so an index count can't show a hit. The real test is the **Performance** report (daily impressions and average position), not the page indexing report. |
| 2 | "Aug 18 +867 = recovery, not a hit" | **Plausible** | It matches the Sep 9 audit's impression timeline (collapse Jun 27, recovery Aug 19). Being close to the spam classifier's threshold is a reason to prune, not to relax. |
| 3 | "2,832 soft 404s = the 2,816 one-pool pages" | **Likely, not yet verified** | Confirm with the Soft 404 example URLs (N5). Also: soft-404 pages are **already out of the index**, so noindexing them won't shrink the index. The gain is removing a "this site has thousands of empty pages" quality signal. Google treats them as empty because the pages *say* they're empty: "1 pool… There is not enough qualifying APY history". |
| 4 | "Alternate with canonical 1,961 = KO→EN hreflang, expected" | **Wrong** | KO pages declare themselves as their own canonical (checked: `/ko/chains/polkadot` and `/ko/tokens/usdc` point to themselves). hreflang pairs don't end up in this bucket. The likely source: the static pages link to **11,698 unique app URLs carrying `&src=seo_chain` / `&src=seo_token`**. `canonical.js` drops `src`, so every tracked link becomes an "alternate with proper canonical" by design. |
| 5 | "5,547 crawled – not indexed = old `?token=`/`?chain=` JS shells" | **Half right, wrong cause** | They aren't old. The same internal links create them every day: **6,484 unique `?pool=`** and **5,009 unique `?token=`** URLs linked from the static pages. Pool URLs have no static equivalent, so Google gets a JS-only app shell. `?token=` URLs duplicate `/tokens/<slug>`, which is the likely source of the **607 "Google chose different canonical"**. |
| 6 | "8,379 pages (46%) = wasted crawl budget" | **Wrong framing** | Crawl budget doesn't limit a site of about 18k URLs. The number the note missed: **4,597 indexed pages produced about 1,363 impressions in about 3 months**, so most indexed pages get **zero** impressions. You're indexed but not ranking. That's an authority and content-depth problem (W1–W3), not a crawling problem. |
| 7 | "Phase 1 green, proceed with titles after Oct 8" | **Not yet** | The gate is: Performance flat or up through the end of the rollout. Read it Oct 9–10 (N6), then decide. |
| 8 | "Regenerate all static pages locally and commit the output" | **Don't** | `sitemap-update.yml` regenerates `tokens/` and `chains/` with live data on **every push to `main` that touches the generators**, and daily at 02:00 UTC. A local commit of about 4,600 files on the feature branch would ship stale local data and conflict with the daily bot commits. Merge the branch and let CI rebuild. |

**Status check:** the 7 commits on `feature/seo-bing-ai-search-optimization` change only the generators. **None of it is live yet.** `tokens/aztec.html` and `ko/tokens/aztec.html` still serve `index,follow`. Still open from D2: the **access flag for pools retail can't buy** (BUIDL, USDY, USTB, USYC), and the conflicting card copy on chain pages (waitlist vs Laso), unless `b82742fe` already covered it.

## Updated next steps (in order)

**N1. Ship the branch (today or tomorrow).** Open the PR, merge, let CI regenerate, then check production:
```bash
for u in tokens/aztec ko/tokens/aztec tokens/usdc ko/tokens/usdc; do
  printf "%-18s " "$u"; curl -s "https://www.defi.garden/$u" | grep -oE 'name="robots" content="[^"]*"|across [0-9,]+ chains' | tr '\n' ' '; echo
done
# expect: aztec -> noindex,follow (EN + KO); usdc -> index,follow + "across 4x chains", not "3 chains"
```
EN and KO pairs share one `qualifyingCount`, so they switch to noindex together and hreflang never points from an indexable page to a noindexed one. Spot-check one pair anyway.

**N2. Stop creating duplicate URLs: move `src=` out of the query string (1 commit, the most valuable new fix).** Change internal links from `/?pool=X&src=seo_chain` to `/?pool=X#src=seo_chain`. Crawlers ignore the part after `#`, and `analytics.js` can read `location.hash` (update `test_seo_src_attribution.js` to match). Users keep the same URLs, so the "parameterized URLs are sacred" rule isn't touched. Expect the 1,961 "alternate" bucket to shrink over 4–8 weeks of recrawling.

**N3. Link static pages to static pages.** When a token has an indexable `/tokens/<slug>`, link to that instead of `/?token=<SYM>` (5,009 links today). The app stays one click further on. Expect "Google chose different canonical" (607) to shrink, and the static pages to collect the internal links they currently give away.

**N4. Move W1 (static scored pool pages) up.** The data now supports it: Google crawled about 5,500 pool and app URLs and declined to index them. Interest in crawling pool pages is there; indexable content isn't. When W1 ships, point the `?pool=` links at `/pools/<slug>`.

**N5. Check the guesses against URL examples (30 minutes, your part).** In GSC → Pages, open each of *Soft 404*, *Crawled – currently not indexed*, *Alternate page with proper canonical tag* and *Google chose different canonical than user*, export, then:
```bash
python3 - "$@" <<'EOF2'
import csv, re, sys, collections
def kind(u):
    u = u.replace('https://www.defi.garden', '').replace('https://defi.garden', '')
    if 'src=' in u:  return 'app ?…&src= (internal tracked link)'
    m = re.match(r'/\?(pool|token|chain)=', u)
    if m:            return f'app ?{m.group(1)}='
    m = re.match(r'(/ko)?/(tokens|chains|pools|guide|for|stories)/', u)
    if m:            return f"{m.group(1) or ''}/{m.group(2)}/*"
    if u.endswith('.md'): return '.md twin'
    return 'other: ' + u[:40]
for f in sys.argv[1:]:
    rows = list(csv.reader(open(f, encoding='utf-8-sig')))[1:]
    c = collections.Counter(kind(r[0]) for r in rows if r)
    print(f'\n{f} ({len(rows)} examples)'); [print(f'  {n:5d}  {k}') for k, n in c.most_common()]
EOF2
```
Run it as `python3 classify.py soft404.csv crawled.csv alternate.csv diffcanon.csv`. That turns claims 3–5 into facts before you ship N2 and N3.

**N6. The real spam check, Oct 9–10.** In GSC → Performance, compare daily impressions and average position for **Sep 17–23 vs Oct 3–9**.
- **Flat or up:** go ahead with LH1–LH3 (titles plus the "Top 5 by DeFi Score" table), chain pages first.
- **Down more than 30%:** raise `NOINDEX_POOL_THRESHOLD` to 5 and hold the title changes.

**N7. Add one metric to the scoreboard:** indexed pages with at least 1 impression in 28 days, divided by total indexed (Pages export ÷ 4,597). This is the number that tells you whether you have a ranking problem or an indexing problem. Today the data says ranking.

**Expected changes in GSC over the next 2–8 weeks, so nobody misreads them:**
- Soft 404s should move into "Excluded by 'noindex' tag". That is the intended outcome, not a regression.
- The indexed count may *drop* by up to about 680 (the 2-pool pages that were indexed). That is also intended.
- The *alternate* and *different canonical* buckets should shrink once N2 and N3 ship.

### Don't build (additions)
- **Don't** return 410 for, or delete, the one-pool pages. They're useful to the people who reach them; noindex is enough.
- **Don't** add noindexed pages to any sitemap to "help" recrawling. Mixed signals.
- **Don't** treat a falling indexed count after N1 as bad news. The number that matters is pages with impressions.
- **Don't** strip attribution altogether in N2. Move it to the URL fragment; you still need to know which SEO pages convert.
