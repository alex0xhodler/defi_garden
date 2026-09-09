# SEO & AIO Audit — defi.garden — September 9, 2026

**Audit period:** June 7 – September 6, 2026 (Google Search Console, 3 months)
**Bing data:** August 25 – September 7, 2026 (Bing Webmaster Tools, 2 weeks)
**Auditor:** Automated analysis of GSC exports + full codebase inspection

---

## Executive Summary

**The site is nearly invisible.** Over 3 months Google delivered **18 clicks** from **1,163 total impressions** (1.55% CTR). Bing delivered **4 clicks** from **120 impressions** in 2 weeks. Agent/AIO traffic is effectively **zero** despite an elaborate MCP/well-known infrastructure.

The fundamental problems are:

1. **The homepage and landing page are 100% JavaScript-rendered** — the `<body>` contains three empty `<div>` mount points and zero indexable content. Google's JS renderer handles this, but with significant delays and de-prioritization.
2. **The non-www → www redirect is a 307 (temporary)**, not a 301 — Google sees `defi.garden` and `www.defi.garden` as separate properties, splitting already-tiny link equity.
3. **The ~4,500 token pages have no search demand alignment** — titles target invented/obscure token names nobody searches for, while high-volume DeFi queries ("best USDC yield", "defi staking", "crypto savings") have zero dedicated pages.
4. **Zero content authority** — no blog, no guides, no educational content. The site is a data app with no text for Google to rank on informational queries.
5. **The agent infrastructure (MCP, llms.txt, ai-catalog) is technically correct but undiscoverable** — no AI search engine (Perplexity, ChatGPT Search, Google AI Overview) has a reason to cite the site because there's no authoritative content to reference.

---

## 1. Traffic Analysis

### 1.1 Google Search Console — Timeline

| Period | Avg Daily Impressions | Clicks | Avg Position | Notes |
|--------|----------------------|--------|-------------|-------|
| Jun 7–26 | **12.5** | 10 | 6.2 | Early visibility, decent positions |
| Jun 27 – Aug 18 | **0.5** | 0 | varies | **Near-total deindex/collapse** |
| Aug 19 – Aug 31 | **55.4** | 5 | 37.1 | Token pages start indexing at terrible positions |
| Sep 1–6 | **25.3** | 3 | 8.4 | Positions recover but impressions drop |

**Key observation:** The June traffic came from the homepage and dynamic `/?token=` URLs at reasonable positions (3–8). Something happened around June 26–27 that caused a near-total impression collapse lasting ~7 weeks. The August recovery coincides with the ~4,500 static token pages being indexed — but at positions 30–45 (page 3+), generating no clicks.

### 1.2 Google — Device Split

| Device | Clicks | Impressions | CTR | Avg Position |
|--------|--------|-------------|-----|-------------|
| Desktop | 9 | 889 | 1.01% | **31.9** |
| Mobile | 9 | 269 | 3.35% | **6.05** |
| Tablet | 0 | 5 | 0% | 6.8 |

**Critical:** Desktop average position is **31.9** (page 3–4) vs mobile at **6.05** (page 1). The 889 desktop impressions at position 31.9 generate almost no clicks. This strongly suggests Googlebot (mobile-first indexer) sees adequate content, but the desktop rendering/content evaluation produces worse signals. The JS-rendered homepage is the likely culprit — mobile Googlebot may handle it differently, or the pages being served are fundamentally different.

### 1.3 Google — Top Pages

| Page | Clicks | Impressions | Position |
|------|--------|-------------|----------|
| `https://defi.garden/` (non-www!) | 3 | 21 | 3.76 |
| `https://www.defi.garden/` | 2 | 36 | 6.83 |
| `/ko/chains/polkadot` | 2 | 3 | 5 |
| `/tokens/cc` | 1 | 97 | 4.75 |
| `/?token=ALPHAUSDCDELTAV2` | 1 | 17 | 4.53 |
| `/chains` (index) | 0 | **72** | **67.33** |
| `/chains/sui` | 0 | 21 | 24.38 |
| `/chains/tron` | 0 | 21 | 69.14 |
| `/tokens/zig` | 0 | 20 | 6.9 |
| `/chains/polkadot` | 0 | 20 | 20.75 |

**Problem 1 — www/non-www split:** The bare domain `https://defi.garden/` and `https://www.defi.garden/` both appear as separate URLs. The non-www version has **better** position (3.76 vs 6.83) and more clicks per impression. The 307 redirect is not being treated as permanent by Google.

**Problem 2 — /chains index at position 67:** The chains directory page (`/chains`) has 72 impressions but sits at position 67. This is a hub page that should rank well — it has real content and links. Position 67 means Google sees it but considers it very low quality or relevance.

**Problem 3 — Obscure tokens get impressions, valuable tokens don't:** `/tokens/cc` (97 impressions) is an obscure token. Meanwhile USDC (`/tokens/usdc`) got 1 impression at position 57, and `/tokens/eth` got 12 impressions at position 78. The high-value pages are buried.

### 1.4 Google — Top Queries

**Zero queries have generated clicks.** The top queries by impressions:

| Query | Impressions | Position |
|-------|-------------|----------|
| tron yield | 11 | 87.7 |
| obol defillama | 9 | 8.8 |
| silows | 8 | 8.4 |
| sei tvl | 8 | 19.4 |
| sui defi yield | 8 | 31.8 |
| yield layer | 8 | 82.1 |
| eurc yield | 5 | 69.4 |
| polkadot tvl | 4 | 46.3 |
| usdt yield | 3 | 74.0 |

**The queries people are searching for** — "tron yield", "sui defi yield", "usdt yield", "eurc yield" — the site ranks at positions 30–90 for. These are the exact queries the token/chain pages should dominate, but they don't.

### 1.5 Google — Search Appearance

**Empty.** Zero rich results, zero FAQ appearances, zero Dataset appearances. Despite having FAQPage, BreadcrumbList, Dataset, and ItemList schema on every token page, **none of them are triggering rich results.** This suggests either the structured data isn't being parsed, the pages aren't being crawled frequently enough, or Google doesn't trust the site enough to grant rich features.

### 1.6 Google — Countries

| Country | Clicks | Impressions |
|---------|--------|-------------|
| United States | 4 | 386 |
| South Korea | 4 | 59 |
| Vietnam | 1 | 81 |
| India | 0 | 68 |
| United Kingdom | 0 | 36 |
| Philippines | 0 | 30 |

US dominates impressions but only 1% CTR. South Korea (where the KO pages are targeted) has the best engagement ratio.

### 1.7 Bing Webmaster Tools (Aug 25 – Sep 7)

| Date | Clicks | Impressions |
|------|--------|-------------|
| Aug 25 | 0 | 0 |
| Aug 26 | 0 | 2 |
| Aug 27 | 0 | 4 |
| Aug 28 | 0 | 14 |
| Aug 29 | 0 | 6 |
| Aug 30 | 1 | 4 |
| Aug 31 | 0 | 11 |
| Sep 1 | 0 | 18 |
| Sep 2 | 0 | 12 |
| Sep 3 | 1 | 13 |
| Sep 4 | 0 | 7 |
| Sep 5 | 1 | 10 |
| Sep 6 | 1 | 9 |
| Sep 7 | 0 | 10 |

**Total: 4 clicks, 120 impressions, 3.3% CTR.** Bing only started indexing the site ~2 weeks ago. Impressions are growing (0→18/day). CTR is actually higher than Google's. Bing's index is nascent — the site was likely only recently submitted to Bing Webmaster Tools.

---

## 2. Technical SEO Audit

### 2.1 [CRITICAL] Non-www → www Redirect is 307, Not 301

```
$ curl -sI "https://defi.garden/" 
HTTP/2 307 
location: https://www.defi.garden/
```

**Impact:** Google treats 307 as a temporary redirect and may continue to index both variants. The GSC data confirms this — both `https://defi.garden/` and `https://www.defi.garden/` appear as separate indexed URLs with separate impression/click counts.

**Fix:** Configure Vercel to use a 301 (permanent) redirect from `defi.garden` to `www.defi.garden`. This is a Vercel domain configuration issue — Vercel applies its own redirect for the non-www domain before `vercel.json` redirects fire.

**Location:** Vercel Dashboard → Project Settings → Domains
**Priority:** HIGH — this is actively fragmenting the site's already minimal authority.

### 2.2 [CRITICAL] Homepage Body is 100% JavaScript-Rendered

```html
<body>
    <div id="root"></div>
    <div id="planner-root"></div>
    <div id="landing-root"></div>
    <footer class="seo-hub-links">
      <a href="/tokens">Browse tokens</a>
      <a href="/chains">Browse chains</a>
      <a href="/agents">AI Agents & MCP</a>
    </footer>
</body>
```

The entire landing page content — search box, subscription cards, yield data, CTAs — is injected by `landing.js` into `<div id="landing-root">`. Googlebot's JS renderer will eventually see it, but:

- JS-rendered pages enter a deferred rendering queue (can take days to weeks)
- First-pass indexing sees only 3 anchor links and no content
- Google's "mobile-first index" screenshots a JS-rendered version, but the deferred queue deprioritizes the page
- **AI search engines (Perplexity, ChatGPT Search) typically do NOT execute JavaScript** — they see an empty page

The only crawlable content in the raw HTML is the three links in `.seo-hub-links`.

**Fix:** Server-side render (or pre-render) critical landing page content as static HTML in the `<body>`. At minimum, add a `<noscript>` block or a static HTML section that contains the key value proposition, subscription examples, and internal links. Token/chain pages are already static HTML — the homepage needs the same treatment.

**Priority:** CRITICAL — this is the #1 reason the homepage can't rank and AI engines can't cite the site.

### 2.3 [HIGH] Token/Chain Pages — Titles Not Aligned to Search Demand

Current title pattern:
```
USDC DeFi Yields — Live Pools by TVL | DeFi Garden 🌱
```

This is decent for USDC, but the same pattern applied to 2,300+ obscure tokens like `CC`, `SILOWS`, `HXXI` generates pages nobody searches for. The GSC query data shows people search for:

- "USDC yield" / "USDT yield" / "ETH staking yield"
- "[chain] TVL" / "[chain] yield" / "[chain] defi"
- "best defi yield" / "defi savings" / "crypto yield farming"

**Problems:**
1. No pages target informational queries like "best USDC yield on Base" or "how to earn yield on stablecoins"
2. The 2,300 obscure token pages dilute crawl budget — Google crawls them but ranks them poorly because nobody searches for these tokens
3. Chain pages should target "[chain] yield" and "[chain] TVL" queries directly

**Fix:** 
- Prioritize crawl budget: add `priority` hints in sitemaps, with top-50 tokens/chains at 0.8 and the long tail at 0.3
- Consider `noindex` on tokens with zero search volume (sub-$1M TVL, no CoinGecko listing)
- Add dedicated content pages for high-volume queries

### 2.4 [HIGH] /chains Index at Position 67 Despite 72 Impressions

The `/chains` directory page is getting impressions but ranking at position 67. Inspecting the page:

```html
<title>Every Chain's Live DeFi Yields | DeFi Garden 🌱</title>
<meta name="description" content="85 chains with live, trust-filtered DeFi yield data, ranked by TVL.">
```

The title doesn't contain the word "chain" prominently. People searching "ethereum defi" or "solana yield" should find this page, but position 67 means Google doesn't trust it.

**Root cause:** Thin content (likely just a list of links), no unique editorial content, no backlinks, site is new with no domain authority.

### 2.5 [MEDIUM] Structured Data Not Generating Rich Results

Every token page has:
- `BreadcrumbList` ✓
- `ItemList` ✓
- `Dataset` ✓
- `FAQPage` ✓

Yet Search Appearance is empty. Possible causes:
1. Pages not crawled frequently enough for Google to process the schema
2. Domain too new / not trusted enough for rich results
3. `FAQPage` may not qualify — Google has significantly restricted FAQ rich results to authoritative sites since 2023
4. `Dataset` schema rarely surfaces in regular search

**Fix:** Remove `FAQPage` schema — Google now restricts FAQ rich results to government and health authority sites. It won't hurt, but it's dead weight that may trigger "spammy structured data" signals on a new domain. Keep `BreadcrumbList` and `ItemList` — these have the best chance of surfacing.

### 2.6 [MEDIUM] Sitemap Structure — Correct but Priorities Flat

The sitemap index references 5 sub-sitemaps with ~10,000 URLs total. All token pages have the same `changefreq=daily` and no priority differentiation. Google mostly ignores `priority`, but the flat structure means the crawl budget is spread evenly across 4,500+ pages when it should be concentrated on the 50–100 pages that could actually rank.

### 2.7 [LOW] robots.txt — Production Version Differs from Repo

The live `robots.txt` at `https://www.defi.garden/robots.txt` is 127 lines (includes a legal preamble about content signals) vs the repo's 66-line version. This means either:
- Vercel/Cloudflare is injecting content, or
- A deployment transforms the file

The SEO-relevant directives appear the same, but the discrepancy should be investigated.

### 2.8 [LOW] .md Files — noindex Header Applied

```json
{ "key": "X-Robots-Tag", "value": "noindex" }
```

Applied to all `.md` files via vercel.json. This is **correct** — the markdown files are agent-facing, not search-facing. However, verify that `llms.txt` (which is not `.md`) is also not accidentally noindexed. Based on the header config, it isn't — it's served with `text/markdown` content type but no noindex. This is fine; it's a content negotiation response.

---

## 3. On-Page SEO Audit

### 3.1 Homepage (`/`)

| Element | Current | Issue | Recommendation |
|---------|---------|-------|----------------|
| `<title>` | "DeFi Garden 🌱 \| Find your next yield" | Generic, emoji may not render in SERPs | "DeFi Yield Finder — Compare Live Rates Across 50+ Protocols \| DeFi Garden" |
| `<meta description>` | "Search live DeFi yields across every chain…" | Passive, no numbers | "Compare 7,300+ live DeFi yields across Ethereum, Solana, Base & 30+ chains. $100K TVL floor. Free forever." |
| `<h1>` | None (JS-rendered) | **No H1 in raw HTML** | Add static H1 |
| Body content | Empty (3 divs) | Zero crawlable content | Pre-render key sections |
| Internal links | 3 (`/tokens`, `/chains`, `/agents`) | Minimal | Add top-token and top-chain links |

### 3.2 Plan Page (`/plan.html`)

| Element | Current | Issue | Recommendation |
|---------|---------|-------|----------------|
| `<title>` | "Garden Planner 🌱 \| Plan Your DeFi Savings by Goal — DeFi Garden" | 71 chars, too long, starts with brand name | "DeFi Savings Planner — Goal-Based Yield Calculator \| DeFi Garden" |
| `<meta description>` | Good — 198 chars, too long | Truncated in SERPs | Trim to 155 chars |
| Body content | Also JS-rendered | Same problem as homepage | Pre-render goal cards |

### 3.3 Token Pages (Static HTML — Good!)

These are the site's strongest SEO asset. Each page has:
- ✅ Unique title with token name
- ✅ Unique meta description with pool counts and APY
- ✅ Canonical URL
- ✅ hreflang (EN + KO)
- ✅ Structured data (BreadcrumbList, ItemList, Dataset, FAQPage)
- ✅ Static HTML content (not JS-rendered)
- ✅ OG image per token

**Issue:** The titles all follow the same pattern, which may trigger "boilerplate" detection when 2,300+ pages have the same structure. Consider adding chain names or yield ranges to differentiate.

### 3.4 Chain Pages (Static HTML — Good!)

Same quality as token pages. 85 chain pages with proper canonicals, hreflang, and structured data.

### 3.5 `for/` Landing Pages

Well-structured subscription landing pages (`/for/claude`, `/for/spotify`, etc.) with:
- ✅ Product schema
- ✅ Unique content per subscription
- ✅ Proper canonicals

**Issue:** These target "pay for [subscription] with DeFi yield" — an extremely niche query nobody searches for yet. They won't rank until the domain has authority on broader DeFi terms first.

---

## 4. AIO (AI Overview / Agentic) Audit

### 4.1 Agent Infrastructure Assessment

The site has an **unusually comprehensive** agent-facing infrastructure:

| Asset | Status | Notes |
|-------|--------|-------|
| `llms.txt` | ✅ Present, 7KB, well-structured | Good content with links, tool descriptions |
| `llms-full.txt` | ✅ Present, 207KB | Comprehensive |
| `ai-info.md` | ✅ Present, authoritative guide | Well-written for AI consumption |
| `.well-known/ai-catalog.json` | ✅ Present | AIR spec compliant |
| `.well-known/mcp/server-card.json` | ✅ Present | MCP server card |
| `.well-known/acp.json` | ✅ Present | Agentic Commerce Protocol |
| `robots.txt` LLM directives | ✅ Present | GPTBot, ClaudeBot, PerplexityBot allowed |
| Content-Signal header | ✅ `search=yes, ai-train=no, use=reference` | Present on all responses |
| Link header | ✅ Comprehensive | 11 rel types in every response |
| Content negotiation | ✅ `Accept: text/markdown` → llms.txt | Working |
| MCP endpoint | ✅ `https://www.defi.garden/mcp` | Streamable HTTP |
| WebMCP (navigator.modelContext) | ✅ In home.html | Client-side agent tools |

**Verdict:** The agent infrastructure is **technically exceptional** — probably in the top 0.1% of websites. It's also **completely wasted** right now because:

### 4.2 Why Agent Traffic is Zero

1. **No search engine cites the site.** AI search engines (Perplexity, ChatGPT Search, Google AI Overviews) cite pages they find through their own search index. DeFi Garden doesn't rank for any DeFi queries, so it's never in the candidate set for citation.

2. **The homepage is empty to non-JS crawlers.** PerplexityBot and ChatGPT-User typically fetch HTML without executing JavaScript. They see an empty page. They have no reason to cite it.

3. **No inbound links from AI-relevant sources.** The site has no mentions on GitHub, no blog posts, no StackOverflow answers, no Reddit discussions, no Twitter/X threads with links. AI engines can't cite what they don't know exists.

4. **The MCP server requires active integration.** Users/agents need to manually configure the MCP endpoint. There's no directory listing (MCP registries are nascent), and no documentation on external sites pointing to it.

5. **`ai-info.md` contains inflated claims.** The "4.9/5 user satisfaction" and "99.4% noise filtration" benchmark claims with no source will be ignored or penalized by AI engines that evaluate credibility. Lines like *"DeFi Garden is the first yield discovery interface…"* read as marketing, not reference material.

### 4.3 AI Overview (AIO) Eligibility

For Google AI Overviews specifically:
- The site needs to rank in the **top 10** for a query to be considered as an AIO source
- Currently ranking top-10 for zero high-volume queries
- The token pages rank top-10 for some obscure token names, but these queries don't trigger AIO

### 4.4 Recommendations for AIO Visibility

1. **Create authoritative, citable content** — a guide titled "DeFi Yield Rates Explained: How APY Works Across Chains" would be citable by AI engines answering "what is DeFi yield" queries
2. **Remove inflated claims from ai-info.md** — replace with verifiable facts and methodology descriptions
3. **Get the site ranking first** — AIO/agent traffic follows search visibility, not the other way around
4. **Submit to AI-specific directories** — MCP registries, AI tool directories, agent skill marketplaces

---

## 5. Content Strategy Gap Analysis

### 5.1 The Fundamental Problem

The site has **4,500+ data pages** and **zero content pages**. This is like having a dictionary with no articles explaining how to use the words.

The queries where DeFi Garden could realistically compete:

| Query Cluster | Monthly Volume (est.) | Current Pages | Gap |
|---------------|----------------------|---------------|-----|
| "[token] yield" (USDC, USDT, ETH) | 1,000–5,000 | Token pages (position 50+) | Need better titles + content |
| "[chain] defi yield" | 500–2,000 | Chain pages (position 20–70) | Need editorial content |
| "best defi yields" / "defi yield farming" | 5,000–20,000 | **None** | Need a dedicated guide/comparison page |
| "crypto savings account" / "defi savings" | 2,000–8,000 | **None** | Perfect for planner landing page |
| "how to earn yield on USDC" | 1,000–3,000 | **None** | Educational content opportunity |
| "defi yield calculator" | 500–1,500 | Plan page (not ranking) | Needs static content + better title |
| "[subscription] free with crypto" | <100 | /for/* pages | Too niche to invest in now |

### 5.2 Quick-Win Content Pages Needed

1. **`/guide/best-defi-yields`** — "Best DeFi Yields Today: Live Rates Across 50+ Protocols" — curated comparison with editorial commentary
2. **`/guide/usdc-yield`** — "Where to Earn Yield on USDC in 2026" — deep dive on the most-searched token
3. **`/guide/defi-savings`** — "DeFi Savings: How to Use Yield to Fund Your Goals" — links to the planner
4. **`/guide/defi-yield-explained`** — "DeFi Yield Explained: APY, TVL, and Risk" — foundational content for AI citation

---

## 6. Prioritized Fix List

### P0 — Do This Week (Blocking Issues)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **Fix 307 → 301 redirect** (non-www to www) | Consolidates all link equity | 5 min (Vercel dashboard) |
| 2 | **Add static HTML to homepage body** | Makes homepage indexable by all crawlers + AI engines | 2–4 hours |
| 3 | **Rewrite homepage title** | Current title is generic and emoji-laden | 5 min |

### P1 — Do This Month (Growth Blockers)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 4 | Create 2–3 editorial guide pages (static HTML) | First chance to rank for informational queries | 1–2 days |
| 5 | Improve token page titles for top-50 tokens | Better query match for "[token] yield" queries | 2 hours |
| 6 | Add static HTML to plan.html body | Makes planner discoverable | 2 hours |
| 7 | Remove FAQPage schema (Google restricted it) | Cleaner structured data signals | 1 hour |
| 8 | Add sitemap priority differentiation | Focus crawl budget on rankable pages | 30 min |

### P2 — Do This Quarter (Authority Building)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 9 | Build backlinks (GitHub repos, DeFi directories, tool lists) | Domain authority | Ongoing |
| 10 | Create a /blog with monthly "DeFi Yield Report" | Topical authority + freshness signals | 1 day/month |
| 11 | Submit to AI tool directories and MCP registries | Agent discovery | 2 hours |
| 12 | Clean up ai-info.md inflated claims | AI engine credibility | 1 hour |
| 13 | Consider noindex on zero-traffic long-tail token pages | Crawl budget optimization | 2 hours |

---

## 7. Appendix: Raw Data Highlights

### Google — Impression Timeline (Daily)
```
Jun 07-26: ████████████ (~12/day, 10 clicks)
Jun 27-Aug 18: ▌ (~0.5/day, 0 clicks) ← COLLAPSE
Aug 19-31: ████████████████████████████ (~55/day, 5 clicks, pos 37+)
Sep 01-06: ████████████ (~25/day, 3 clicks, pos 8.4)
```

### Bing — Impression Timeline (Daily)
```
Aug 25-27: ▌█ (0-4/day)
Aug 28-Sep 07: ████████ (~10/day, 4 clicks total)
```

### Top-Performing URLs (by clicks)
1. `https://defi.garden/` — 3 clicks, 21 impressions, pos 3.76
2. `https://www.defi.garden/` — 2 clicks, 36 impressions, pos 6.83
3. `/ko/chains/polkadot` — 2 clicks, 3 impressions, pos 5
4. `/tokens/cc` — 1 click, 97 impressions, pos 4.75
5. `/?token=ALPHAUSDCDELTAV2` — 1 click, 17 impressions, pos 4.53

### Highest-Impression URLs (zero clicks)
1. `/chains` — 72 impressions, pos 67.33
2. `/tokens/cc` — 97 impressions, pos 4.75 (1 click)
3. `/?token=LIMUSD` — 24 impressions, pos 6.54
4. `/chains/sui` — 21 impressions, pos 24.38
5. `/chains/tron` — 21 impressions, pos 69.14

---

## 8. Key Metrics to Track

| Metric | Current (Sep 9) | 30-Day Target | 90-Day Target |
|--------|-----------------|---------------|---------------|
| Google Daily Impressions | ~25 | 200 | 1,000 |
| Google Daily Clicks | ~0.5 | 10 | 50 |
| Google Avg Position (all) | 20.2 | 15 | 10 |
| Pages in Google Index | ~500 (est.) | 2,000 | 4,000 |
| Rich Results | 0 | 5+ BreadcrumbList | 50+ |
| AI Engine Citations | 0 | 1 | 10 |
| Bing Daily Impressions | ~10 | 50 | 200 |

---

*This audit was generated from Google Search Console export (Jun 7 – Sep 6, 2026), Bing Webmaster Tools export (Aug 25 – Sep 7, 2026), and full codebase analysis of the defi-garden-neumorphic repository at commit `cf6bcf7a59c`.*
