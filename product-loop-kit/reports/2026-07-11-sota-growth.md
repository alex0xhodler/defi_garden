# 2026-07-11 — SOTA organic-growth research + next initiatives (operator-run, human-requested)

Human ask: "improve sitemaps and northstar, develop new initiatives to attract organic traffic and convert it efficiently, SOTA grade." Two-lens pass like the 07-11 SEO scan (021-026), but broader: 2026 SEO/GEO/AEO best practices (WebSearch) + a full code audit of the SEO/funnel machinery (Explore agent, cited by file:line) + the latest signals snapshot on disk (live Mixpanel unavailable this session — `mixpanel` MCP needs interactive OAuth, not available in this non-interactive session; `signals/2026-07-11.md` is the freshest number set).

## 2026 SOTA findings (WebSearch, sources at bottom)
1. **Zero-click/AI answer engines are now a first-class surface.** GEO/AEO: AI Overviews resolve up to 70% of DeFi-category queries; the Google-link vs AI-citation overlap has fallen below 20%. Winning requires structured, extractable content (direct-answer openers, FAQ/definition blocks) and machine-readable entity markup — AI systems weight JSON-LD/schema.org heavily as a citation signal even where it produces no visible SERP change.
2. **JSON-LD is the sole recommended structured-data format**; Product/BreadcrumbList/Organization/FAQPage all still index and drive rich-result eligibility (+35% CTR cited across sources). Google retired the FAQ *visual* rich-result on 2026-05-07, but `FAQPage` markup remains valid and is explicitly still consumed by AI answer engines for citation context — it just no longer expands in classic SERP.
3. **Programmatic-SEO orthodoxy for 2026**: hub-and-spoke / pillar-cluster internal linking, critical pages reachable within 3 clicks of the homepage, internal link topology read by LLM crawlers as a topical-authority signal (not just Googlebot).
4. **Thin content is a dataset problem**: a single-datapoint programmatic page is thin regardless of template quality; mitigation is per-page content depth + internal linking (already the basis of 023).
5. **CWV/crawl budget**: INP is 2026's most commonly failed metric on React SPAs; SSR/SSG for indexable content (already the architecture DeFi Garden chose via 014/021's static pages) remains the correct call vs. a CSR shell.
6. **DeFi-specific**: high-intent transactional queries (protocol comparison, risk/yield tradeoffs) convert best; semantic clustering across "yield farming / liquidity pools / impermanent loss / APY" reports ~4x organic reach vs. isolated pages.
7. **Fintech CRO**: interactive calculators in-context convert well (DeFi Garden already has this — the planner *is* the calculator); quantified, specific copy beats vague promises (matches existing trust-rail-driven honest-numbers positioning); referred users convert 3-5x paid and carry +25% LTV, but incentive design in this product's category (no custodial money, education-only) rules out cash referral bonuses — the existing share-a-working-link mechanic (024) is the correct shape, just unproven at volume yet.

## Code-audit findings (Explore agent, cited file:line — full detail in the agent transcript)
- **`generate-sitemap.js`**: quality-gated (`SITEMAP_MIN_QUALIFYING_POOLS=2` @ $10M TVL, ≤1000% APY), daily CI (`sitemap-update.yml`, cron `0 2 * * *`), pings Google/Bing/IndexNow after regen. Healthy.
- **`generate-token-pages.js`**: 2,045 static `/tokens/<slug>` pages live (vs. 4,147 `?token=` shell URLs in `sitemap-tokens-all.xml` — most tokens still only exist as the thin app shell). Real content, canonical, OG, related-links. **Zero JSON-LD. Zero analytics.**
- **`generate-stories.js`**: 3 persona pages, rich OG/Twitter/hreflang metadata, **zero JSON-LD** despite one page (`kevin.html`) containing an actual FAQ block that's a textbook `FAQPage` candidate. **Zero analytics.**
- **Confirmed by direct grep** (not just the agent's report): `grep -l analytics.js tokens/*.html` → 0 of 2,045 files. `grep analytics.js stories/*.html` → 0 of 3 files. **None of DeFi Garden's static SEO surface — the pages 014/021/023/028 were built specifically to earn organic traffic — has ever been able to fire a single trackable event.** We cannot currently answer "is anyone landing on these pages at all," let alone whether they convert.
- **PoolDetail.js** renders a visual breadcrumb (`className: 'pool-breadcrumb'`) but as a plain div/span, not semantic markup or `BreadcrumbList` JSON-LD.
- Repo-wide grep for `ld+json`/`schema.org`: zero implementation hits (one doc-only reference in `.well-known/agent-skills/.../ai-visibility-audit.md`).
- Funnel reality check: several `analytics.js` calls are wired but **disabled at the call site** in `app.js` (`trackFilterChange` ×4, `trackFiltersReset`, `trackFilterCombination`, `trackNavigation` back-button — all literal `// Analytics disabled:` comments), and `app.js:1166-1167` carries a live `// TODO: Re-enable with proper safety checks` on search-input analytics. Cause not yet diagnosed — flagged, not fixed, pending investigation (could be a real prior incident, e.g. an infinite-loop or perf regression; re-enabling blind would repeat whatever caused the disable).
- `page_view` path taxonomy only covers `/`, `/search/<token>`, `/chain/<chain>` — no entry for `/tokens/<slug>` (moot until analytics loads there at all) or `?pool=`.

## Strategic read
The prior SEO push (011-014, 021, 023, 028-033) did the hard, correct architectural work — real static pages, sitemap quality gates, trust-rail-consistent content. But it shipped **totally unmeasured**: the static pages that carry the SEO bet have no instrumentation, so nobody — not the heartbeat, not this report, not the human — can tell whether that investment is working. This is the same *shape* of gap 020 closed for the in-app search funnel, one layer further upstream. Per NORTH_STAR's own principle ("a bug at a funnel step outranks any experiment at that step"), closing this is higher-leverage than any new content/schema work until it ships, because every subsequent SEO initiative is otherwise unverifiable by construction.

Second-order: even once measured, DeFi Garden currently has **no structured data at all** — a flat gap against both classic rich-results (+35% CTR, cited) and the emerging GEO/AEO surface the DeFi-specific research flagged as increasingly dominant for this exact content category (protocol/yield comparison queries). This is the next highest-leverage, lowest-risk lever: additive metadata only, doesn't touch trust rails, canonical logic, or ranking.

## New initiatives (ranked)
| # | Title | Score | Effort | Risk | Rationale |
|---|---|---|---|---|---|
| 039 | Instrument the static SEO surface (`/tokens/<slug>`, `stories/*.html`) — zero of 2,048 pages fire a single event today | 9.2 | S/M | HIGH | Foundational: makes the entire SEO investment measurable for the first time. Blocks honest evaluation of every future landing-page initiative, same logic that ranked 020 top. |
| 040 | JSON-LD structured data: `Organization`/`WebSite` (home), `BreadcrumbList` (token pages + pool-detail), `FAQPage` (stories `kevin.html`) | 8.0 | S/M | HIGH | Zero present anywhere; SOTA-cited +35% rich-result CTR + direct GEO/AEO citation signal for the DeFi-comparison query category. Additive-only, no trust-rail/ranking touch. |
| 041 | Extend the 014/021 static-landing-page pattern to chains (`/chains/<slug>`) — ~100 `sitemap-chain-*.xml` entries are still thin `?chain=` shells, the same "Crawled — not indexed" mechanism 014 fixed for tokens | 7.5 | L | HIGH | Directly closes the largest remaining category from the original GSC diagnosis (010) using an already-proven-safe pattern (5 successful ships: 014/021/023/028/029-033). Large effort — spec only this round. |
| 042 | Audit + selectively re-enable the disabled `app.js` analytics calls (`trackFilterChange` ×4, `trackFiltersReset`, `trackFilterCombination`, `trackNavigation`, search-input TODO) | 6.5 | S | MED→HIGH pending diagnosis | Real, code-verified gap, but the disable reason is unknown — needs git-blame/history investigation before re-enabling (could be a prior incident, not just an oversight). Flagged, not blindly promoted to READY. |
| 043 | Semantic content clustering: expand token-page intros/related-links into explicit protocol/category clusters (Lending, LP-DEX, Staking, Yield-Farming — `generate-sitemap.js` already has these categories) for topical-authority internal linking | 6.0 | M | HIGH | 2026 SOTA cites ~4x organic reach from semantic clustering vs. isolated pages; DeFi Garden already computes pool-type categories for the sitemap, just doesn't cluster token-page content by them yet. |

039 and 040 are spec'd (`specs/039.md`, `specs/040.md`). 041-043 are logged with rationale only — promote to spec'd/READY on a future pass; deliberately not overloading one session with specs nobody's reviewed yet.

## This session's build
Building **039** now — highest score, foundational, buildable offline via the established `--fixture` pattern since this sandbox has no network reachability to `yields.llama.fi`/`unpkg.com` this run (confirmed via direct `curl`, both return connection-refused). Note: this batch was drafted as 034-038 and renumbered to 039-043 after discovering mid-session that a concurrent build loop had already claimed ID 034 for an unrelated pool-detail fix (PR #130, merged to main while this research was in progress) — see LOG.md.

## Sources
- [Generative Engine Optimization (GEO): The 2026 Guide to AI Search Visibility](https://llmrefs.com/generative-engine-optimization)
- [Mastering generative engine optimization in 2026](https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142)
- [Google's Guide to Optimizing for Generative AI Features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Schema.org for SEO: Ready-to-Use JSON-LD Examples (2026)](https://www.incremys.com/en/resources/blog/schema-seo)
- [Structured Data SEO 2026: Rich Results Guide](https://www.digitalapplied.com/blog/structured-data-seo-2026-rich-results-guide)
- [JSON-LD for SEO in 2026](https://netstager.ae/blog/json-ld-for-modern-seo/)
- [Internal Linking Strategy Guide 2026](https://topicalmap.ai/blog/auto/internal-linking-strategy-guide-2026)
- [Programmatic SEO Internal Linking Strategies](https://www.seotakeoff.com/blog/programmatic-seo-internal-linking)
- [SEO técnico 2026: Core Web Vitals, JS rendering y crawl budget](https://delonetech.com/blog/seo-tecnico-2026-core-web-vitals-js-rendering-crawl-budget)
- [Single Page Application SEO: How to Make SPAs Crawlable in 2026](https://www.weweb.io/blog/seo-single-page-application-ultimate-guide)
- [Conversion Rate Optimization for Financial Services Websites](https://www.siteimprove.com/blog/conversion-rate-optimization-for-financial-services-websites/)
- [Fintech SaaS Landing Pages: 15 Best Examples (2026)](https://designrevision.com/blog/fintech-saas-landing-pages)
- [How Referral Marketing can be the Growth Driver for Fintechs](https://www.buyapowa.com/blog/referral-marketing-growth-fintech/)
- [DeFi Protocol SEO Strategy: Your 2026 Roadmap](https://www.austinheaton.com/blog/de-fi-protocol-seo-strategy)
- [SEO for DeFi: Complete Protocol Growth Guide 2026](https://flexe.io/blog/seo-defi/)
