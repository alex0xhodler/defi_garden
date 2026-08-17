# Mixpanel External Analytics Audit: DeFi Garden

**Filter Applied:** Excluded internal / Netherlands (`NL`) / localhost development traffic  
**Analysis Window:** Last 30 Days (July 15 – August 14, 2026)  
**Total External Events:** 1,003  
**Total Genuine External Visitors (distinct_ids):** 205  

---

## 1. Executive Summary & Filtered Reality

> **The True Discovery Profile:** Stripping out internal developer and local Netherlands traffic reveals that DeFi Garden attracts **~200 genuine external visitors monthly**, predominantly from the **United States (69%)**, Western Europe (IT, GB, DE), and East Asia (KR, SG). Traffic lands almost exclusively via programmatic SEO hubs (`/tokens`, `/tokens/btc`, `/tokens/buidl`, `/search/USDC`) indexed by DuckDuckGo, Bing, Ecosia, and Perplexity AI.

---

## 2. External DREAM Funnel Breakdown

| Stage | Metric That Counts | Clean 30-Day External Data | Analysis |
|---|---|---|---|
| **Discovery** | Unique External Humans | **205 unique visitors** (69% US, 10% EU, 8% Asia) | Strong international organic footprint indexation, including citations in AI answer engines (Perplexity). |
| **Landing Surface** | Top Entry Points | **`/tokens` (45 views)**, `/search/USDC`, `/search/BTC`, `/tokens/buidl`, `/tokens/infinifiusdc` | 80%+ of external traffic enters via token-specific programmatic landing pages rather than the bare root `/`. |
| **Research & Intent** | Filter & Pool Clicks | **93 filter combinations, 6 pool deep-views** | Visitors look at WBTC-USDT (Uniswap), LBTC (Lombard), WETH-CBBTC (Aerodrome on Base), BUIDL (Blackrock), and SOL-JITOSOL (Kamino). |
| **Evaluation** | Waitlist Triggered | **16 waitlist modal opens** (triggered on `/tokens`) | Real external visitors from US, IT, and LT opened the waitlist modal. |
| **Activation** | Waitlist Submissions | **0 email submissions** | The conversion modal leaks 100% of interested users. |
| **Retention** | Multi-day Retained Users | **1 returning user out of 205 (0.5%)** | Almost purely single-session transactional search traffic. |

---

## 3. Top Geographies & Search Engine Referrals

### Geographic Distribution (External)
1. **United States (US):** 692 events (~160 unique users)
2. **Italy (IT):** 66 events
3. **Lithuania (LT):** 53 events
4. **Great Britain (GB):** 42 events
5. **Germany (DE):** 39 events
6. **South Korea (KR):** 39 events
7. **Portugal (PT):** 29 events
8. **Singapore (SG):** 14 events

### Organic Search & AI Referrers
- **AI Search Engines:** `perplexity.ai`
- **Search Engines:** DuckDuckGo, Bing, Ecosia, Google (direct)
- **Token Landing Anchors:** `/tokens/btc`, `/tokens/infinifiusdc`, `/tokens/buidl`, `/tokens/jitosol`

---

## 4. The 2 Critical Friction Points

1. **The Programmatic SEO → Waitlist Leak:**
   - Visitors land on `/tokens` or `/tokens/<token>`, see the "Join Waitlist" or "Garden" button, open the modal (`waitlist_opened`), but drop off without submitting.
   - **Fix:** The modal is likely presenting an abstract product pitch rather than an immediate utility payoff (e.g. *"Enter email to get weekly yield rate-cut alerts for BUIDL/USDC"* or an instant yield calculator).

2. **The Missing Bridge from Token Hub to Yield-Funded Planner:**
   - 45+ users land on `/tokens`, but the `/plan` app is hidden or separated. Integrating the "Deposit X USDC on Base to earn your $20/mo Claude/Codex subscription" widget directly into the `/tokens` header would capture high-intent developer traffic immediately.
