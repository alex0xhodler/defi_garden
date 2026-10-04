# SEO Plan: Bing AI Search + Google Search Console Optimization

**Branch**: `feature/seo-bing-ai-search-optimization`  
**Data sources**: Bing Webmaster AI Search Queries Report (2026-10-04) + Google Search Console Performance (2026-10-04)  
**Goal**: Fix the zero-click problem on Google, increase Bing AI citation share, and close the vocabulary gap between our page titles and actual search queries.

---

## Combined Data Analysis

### Source 1: Bing AI Search Grounding (where AI cites us)

| Query | Citations | Share | Existing Page | Gap |
|-------|-----------|-------|---------------|-----|
| best yield farms on polygon | 325 | 19.2% | `chains/polygon.html` | Title says "DeFi Yields" not "yield farms" |
| top yield farming projects on bsc | 131 | 18.5% | `chains/bsc.html` | Same generic title |
| best Avalanche staking pools 2025 | 25 | 28.7% | `chains/avalanche.html` | Title misses "staking pools" |
| defi earn explained | 22 | 36.1% | `guide/defi-yield-rates-explained.html` | Title says "yield", not "earn"; no FAQPage schema |
| how DeFi Earn works explained | 17 | 43.6% | same guide | Highest share query — weak title match |
| defi earning explained | 17 | 26.2% | same | Same |
| DeFi yield definition | 14 | 26.9% | same guide | No definition-format content, no FAQPage |
| DeFi earning definition and explanation | 12 | 25.5% | none | No page |
| defi yield meaning | 12 | 30.0% | same guide | Same |
| best staking pools for polkadot | 6 | 12.5% | `chains/polkadot.html` | Title misses "staking pools" |
| top staking pools for polkadot | 4 | 5.0% | same | Same |
| usdc yield | 3 | 10.3% | `tokens/usdc.html` | Exists, decent |
| crypto yield explained | 3 | 25.0% | guide page | Same gaps |

### Source 2: Google Search Console (the zero-click problem)

**Overall**: 1,363 impressions → **14 clicks** (1.03% CTR). The site is being indexed and shown but nobody clicks.

#### Top queries by impressions (all 0 clicks)

| Query | Impressions | Position | Our Page | Problem |
|-------|-------------|----------|----------|---------|
| sei tvl | 13 | 14.2 | chains/sei | Title says "DeFi Yields", not "TVL" |
| sui defi yield | 12 | 29.9 | chains/sui | Position 30 — buried |
| tron yield | 12 | 87.2 | chains/tron | Position 87 — invisible |
| polkadot tvl | 10 | 41.3 | chains/polkadot | Position 41 |
| eurc yield | 5 | 69.4 | tokens/eurc (via sitemap) | Position 69 |
| usdt yield | 3 | 74.0 | tokens/usdt | Position 74 |

#### Top pages by impressions

| Page | Impressions | Clicks | CTR | Avg Position |
|------|-------------|--------|-----|-------------|
| `/` (homepage) | 38 | 2 | 5.3% | 6.7 |
| `/chains` (hub) | 78 | 0 | 0% | **64.1** |
| `/chains/sui` | 36 | 0 | 0% | 20.4 |
| `/chains/robinhood-chain` | 31 | 0 | 0% | 7.9 |
| `/chains/polkadot` | 29 | 0 | 0% | 21.3 |
| `/chains/tron` | 22 | 0 | 0% | **69.7** |
| `/chains/ethereum` | 17 | 0 | 0% | **63.2** |
| `/tokens/eth` | 16 | 0 | 0% | **64.3** |
| `/chains/avalanche` | 10 | 0 | 0% | **50.0** |
| `/chains/solana` | 5 | 0 | 0% | **63.2** |
| `/chains/bsc` | 4 | 0 | 0% | 22.5 |

#### Key positive signals

- **Korean pages convert**: `/ko/chains/polkadot` = 2 clicks, 50% CTR at position 6. `/ko/chains/monad` = 1 click, 9% CTR. Korean SEO is working.
- **Trajectory is up**: from 0 impressions/day in July to 15-40/day in late September. Index is growing.
- **Google AI Features**: 21 impressions across token/chain pages — early AI Overview grounding.

### Diagnosis: Three Root Problems

1. **Vocabulary mismatch** (affects both engines): Users search "yield farms", "staking pools", "TVL" — our titles say "DeFi Yields". Google can't confidently rank us for queries our titles don't echo; Bing AI cites us but shares stay low.

2. **Zero-click SERP titles** (Google-specific): Even when we rank top-10, the titles `{Chain} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱` are generic and don't promise an answer. They look like a database, not a result worth clicking. The description ("191 live pools on Polygon above the $100K TVL floor") is data-oriented but doesn't address user intent ("best yield farms").

3. **Missing structured data for educational queries** (Bing AI): The guide page has no FAQPage schema. Bing AI Search heavily weights structured Q&A for citation extraction. We're getting 36-44% citation share on "defi earn/yield explained" queries without it — adding it should push significantly higher.

---

## Plan (5 atomic commits)

### Commit 1: `feat(seo): rewrite chain page title/description templates for query vocabulary`

**File**: `generate-chain-pages.js`

**Changes to title template**:
```
Before: {Chain} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱
After:  Best {Chain} Yield Farms & Staking Pools — {N} Live Vaults Compared | DeFi Garden 🌱
```

**Changes to description template**:
```
Before: {N} live pools on {Chain} above the $100K TVL floor, up to {APY}% APY, across {T} tokens. Honest yields from DefiLlama data — no anomalous rates.
After:  Compare {N} live yield farms and staking pools on {Chain} — up to {APY}% APY, ${TVL} TVL. Updated daily from DefiLlama. $100K floor, no anomalous rates.
```

**Why this wording**:
- "Best" + "yield farms" + "staking pools" → matches the top Bing queries directly
- "TVL" in description → matches the "[chain] tvl" Google query cluster
- "Compared" → implies comparison value, invites click
- "Updated daily" → freshness signal for both crawlers and users
- Keeps trust language ("$100K floor, no anomalous rates")

**Also update**: `<h1>` tag to naturally include "yield farms and staking pools" phrasing so the body content matches the title signal.

**Regenerate**: `node generate-chain-pages.js` → commit all `chains/*.html` + `chains/*.md` + `ko/chains/*.html` + `ko/chains/*.md`.

**Verify**: Spot-check polygon, bsc, avalanche, polkadot, sui, tron, ethereum, solana titles.

---

### Commit 2: `feat(seo): rewrite head-token page titles for "[token] yield" queries`

**File**: `generate-token-pages.js`

**Changes to title template** (HEAD_TOKENS: USDC, USDT, ETH, WETH, DAI, SOL, WBTC, BTC, STETH, WSTETH):
```
Before: Best {TOKEN} Yield Rates Today — {N} Live Pools Compared | DeFi Garden 🌱
After:  {TOKEN} Yield: Best Rates Today — {N} Live Pools Compared | DeFi Garden 🌱
```

**Why**: Puts the exact bare query "{TOKEN} yield" at character position 0. Google truncates titles at ~60 chars; "USDC Yield:" as the opening ensures the query match is always visible in SERP. The "[token] yield" cluster ("sui defi yield", "tron yield", "eurc yield", "usdt yield") is the #2 query pattern on Google.

**Non-head tokens**: Leave as-is. The long tail is already working (many at position 2-5).

**Regenerate**: `node generate-token-pages.js` → commit changed `tokens/*.html` + `tokens/*.md` + `ko/tokens/*.html` + `ko/tokens/*.md`.

---

### Commit 3: `feat(seo): add FAQPage schema + definition lede to guide page`

**File**: `guide/defi-yield-rates-explained.html`

**What**:

1. **Add FAQPage JSON-LD** with questions matching exact Bing grounding queries:
   - "What does DeFi yield mean?" → covers "defi yield meaning", "defi yield definition"
   - "How does DeFi earning work?" → covers "defi earn explained", "how DeFi Earn works explained", "defi earning explained"
   - "What is crypto yield?" → covers "crypto yield explained"
   - "What is the difference between DeFi yield and traditional savings?" → educational differentiation

2. **Add definition-first opening paragraph** before the current h2 "Four Primary Sources". A 2-3 sentence plain-English definition that AI grounding can extract as an answer snippet. Currently the page jumps into mechanics without defining the term — the exact thing these queries seek.

3. **Update `<title>`**:
   ```
   Before: DeFi Yield Explained: APY, Lending Rates, TVL, and Risk Rails (2026 Guide)
   After:  DeFi Yield & Earn Explained: What It Means, How It Works, and Risk Rails (2026 Guide)
   ```

4. **Update `<meta description>`** to include "earn", "meaning", "definition" synonyms:
   ```
   Before: Learn how DeFi yield works: lending spreads, AMM fees, staking, APY vs APR math, $100K TVL trust rails, and the DeFi risk matrix. Education, not advice.
   After:  What does DeFi yield mean? Learn how DeFi earning works — lending spreads, AMM fees, staking, APY vs APR — with $100K TVL trust rails and a plain-English risk matrix. Education, not advice.
   ```

**Verify**: Validate JSON-LD at https://validator.schema.org. Confirm page renders correctly.

---

### Commit 4: `feat(seo): improve chains hub page for "[chain] tvl" queries`

**File**: `generate-chain-pages.js` (the hub/index template, if generated) or the static hub page

**Context**: `/chains` gets 78 impressions at position **64** — worst-positioned high-impression page. The "[chain] tvl" query cluster (sei, polkadot, monad, sui, berachain, apt, avax, eth) totals 40+ impressions and all point to chain pages or the hub.

**What**:
- Ensure the `/chains` hub page title includes "TVL" and "yield" vocabulary
- Add aggregate TVL numbers to the hub description
- If the hub lists chains, ensure each entry shows TVL prominently (this helps Google extract featured-snippet data)
- Cross-link between the hub and individual chain pages for internal link equity

**Verify**: Check that `/chains` has updated title/description matching TVL queries.

---

### Commit 5: `chore(seo): regenerate sitemaps and llms.txt`

**What**: Run `node generate-sitemap.js` and `node generate-llms.js` to pick up lastmod/title changes. Commit updated XML + llms.txt.

---

## What we're NOT doing (and why)

| Considered | Rejected because |
|-----------|-----------------|
| New standalone pages for each educational query | One guide page already gets 36-44% share — splitting authority hurts |
| Changing URLs | CLAUDE.md: "existing parameterized URLs are sacred" |
| Weakening trust rails | Never (sanity limit, TVL floor, anomaly flags) |
| Touching the planner | All queries are analytics/educational intent |
| Adding blog/article section | Premature — optimize existing pages first |
| Aggressive keyword stuffing | Trust is the moat; natural vocabulary only |

## Expected Impact

| Area | Current | Target | Mechanism |
|------|---------|--------|-----------|
| Chain pages Bing citation share | ~19% | 30%+ | Title vocabulary match |
| Educational Bing citation share | ~35% | 50%+ | FAQPage schema + definition lede |
| Google CTR (chain pages) | 0% | 3-5% | Compelling SERP titles |
| Google position (major chains) | 50-70 | 20-30 | Title/query alignment improves relevance score |
| Google position (`/chains` hub) | 64 | 30-40 | TVL vocabulary + internal linking |

## Risk Assessment

**Low.** All changes are title/description/schema/template-level. No functional code, no trust-rail changes, no URL changes. The generator pipeline is well-tested and the regeneration process is routine (already runs on daily sitemap cron).

---

## D3 Analysis: GSC Page Indexing Report (added 2026-10-04)

### Index Health Snapshot

| Status | Pages | % of total |
|--------|------:|----------:|
| **Indexed** | 4,597 | 25.3% |
| Crawled — not indexed | 5,547 | 30.5% |
| Soft 404 | 2,832 | 15.6% |
| Alternate w/ proper canonical | 1,961 | 10.8% |
| Discovered — not indexed | 1,671 | 9.2% |
| Google chose different canonical | 607 | 3.3% |
| Page with redirect | 619 | 3.4% |
| Excluded by noindex | 331 | 1.8% |
| Not found (404) | 14 | 0.1% |
| **Total known** | **18,185** | 100% |

### Spam Update Verdict: NOT HIT

Indexed count has **grown** from 3,191 → 4,597 (+44%) since Aug 15. No collapse after any spam update window:
- Jun 24–26 update: first data is Jul 10 at 3,274 indexed (baseline)
- Aug 18–20 update: indexed jumped from 3,191 → 4,058 (+867) — a **recovery**, not a hit
- Sep 24 update (still rolling): Sep 19 shows 4,597 indexed (+92 from Sep 15), stable

**Conclusion: safe to proceed with Phase 1 (LH title rewrites) after ~Oct 8.** The plan's "if impressions dropped, pause" gate is CLEAR.

### The 2,832 Soft 404 Problem — CONFIRMED

Token pages with exactly 1 qualifying pool: **1,408** EN × 2 (with KO) = **2,816**. Google's soft-404 count is **2,832**. Near-perfect match. Google is classifying 1-pool token pages as empty/thin.

Our commit 1 (`NOINDEX_POOL_THRESHOLD = 3`) would noindex **3,494** pages (1,747 tokens × 2 languages), covering all 2,832 soft 404s plus the 2-pool pages that are borderline. This validates the D1 decision.

### Crawl Budget Waste

**8,379 pages** (46% of all known URLs) are either soft-404 or crawled-not-indexed. These consume crawl budget without producing any ranking value. The noindex + regeneration will signal Google to stop recrawling them.

## Data Files (for reference)

- Bing AI: `/Users/0xhodler/Downloads/defi.garden_AISearchQueriesReport_10_4_2026.csv`
- GSC Queries: `/Users/0xhodler/Downloads/defi.garden-Performance-on-Search-2026-10-04/Queries.csv`
- GSC Pages: `/Users/0xhodler/Downloads/defi.garden-Performance-on-Search-2026-10-04/Pages.csv`
- GSC AI Features: `/Users/0xhodler/Downloads/defi.garden-Performance-on-Search-Generative-AI-Features-2026-10-04/Pages.csv`

## Appendix: Geographic & Device Notes

- **US dominates impressions** (456) but has worst CTR (0.66%) — the titles don't convince US searchers to click
- **South Korea is #1 for clicks** (5 clicks, 5.56% CTR) — ko/ pages are working; validates bilingual generation
- **Mobile leads clicks** (8/14 = 57%) at better positions (avg 7.0 vs desktop 29.7) — mobile SERP titles matter most
- **Desktop has 73% of impressions** but avg position 29.7 — buried on page 3; title optimization helps ranking
