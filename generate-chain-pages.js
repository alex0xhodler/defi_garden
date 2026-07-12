#!/usr/bin/env node

/**
 * Static Chain Landing Page Generator for DeFi Garden (backlog 041)
 * Generates chains/<slug>.html for every chain with >=1 qualifying pool —
 * real, server-delivered title/description/canonical/content, so crawlers
 * see a genuine page instead of the JS shell every ?chain= URL renders
 * before its DefiLlama fetch completes (specs/010-diagnosis.md, "Crawled —
 * currently not indexed"). Direct extension of 014/021's proven /tokens/
 * pattern to chains (reports/2026-07-11-sota-growth.md, #041).
 *
 * REUSE (CLAUDE.md/NORTH_STAR "reuse before inventing", 2026-07-10): this
 * file requires generate-token-pages.js and reuses its exported pure
 * helpers/constants (formatting, escaping, the analytics bootstrap, the
 * slug function, and the trust-rail gate) instead of re-implementing them.
 * TRUST PRINCIPLE (unchanged): every number is computed at generation time
 * from live DefiLlama pool data through the SAME sanity rails as the app —
 * anomalous pools (total APY > APY_SANITY_LIMIT) may NEVER be displayed or
 * counted. Honest numbers, no hype.
 *
 * Usage:
 *   node generate-chain-pages.js                   # fetch live API, write chains/
 *   node generate-chain-pages.js --fixture f.json   # offline: read pools from disk
 *   node generate-chain-pages.js --limit 100 --out chains
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const tp = require('./generate-token-pages.js');

const {
  SITE_URL, APY_SANITY_LIMIT, MIN_POOL_TVL, MIN_QUALIFYING_POOLS, DEFAULT_LIMIT,
  isQualifyingPool, poolTotalApy, formatUsd, formatApy, escapeHtml,
  renderAnalyticsBootstrap, renderHubStyleBlock, tokenSlug: chainSlug,
  poolHrefFor, renderItemListJsonLd, renderDatasetJsonLd,
  buildAnswerAndFaq, renderAnswerBlockHtml, renderFaqBlockHtml, renderFaqJsonLd,
  todayGeneratedDate, renderLastUpdatedHtml,
  categoryLinksFor, renderLinkNavHtml, tokenSymbols, isValidToken
} = tp;

const YIELDS_API = 'https://yields.llama.fi/pools';
const POOLS_PER_PAGE = 8; // how many pools to list on each page

/**
 * Aggregate qualifying pools into ranked chain records.
 * Returns [{ chain, slug, totalTvl, qualifyingCount, tokens:[...], pools:[...] }]
 * sorted by totalTvl desc, filtered to chains with >= MIN_QUALIFYING_POOLS,
 * capped at limit. Anomalous / sub-floor pools never count or appear
 * (isQualifyingPool is the same trust-rail gate app.js/generate-token-pages.js use).
 */
function rankTopChains(pools, limit) {
  const cap = (limit == null ? DEFAULT_LIMIT : limit); // 0 = no cap
  const byChain = new Map(); // chain -> { totalTvl, qualifyingCount, pools:[], tokens:Set }

  pools.forEach(p => {
    if (!isQualifyingPool(p)) return; // trust rail + $100K floor, one gate
    const chain = (p.chain || '').toString().trim();
    if (!chain) return;
    if (!byChain.has(chain)) byChain.set(chain, { totalTvl: 0, qualifyingCount: 0, pools: [], tokens: new Set() });
    const rec = byChain.get(chain);
    rec.totalTvl += (p.tvlUsd || 0);
    rec.qualifyingCount += 1;
    rec.pools.push(p);
    if (p.symbol) rec.tokens.add(String(p.symbol).trim().toUpperCase());
  });

  const records = [];
  byChain.forEach((rec, chain) => {
    if (rec.qualifyingCount < MIN_QUALIFYING_POOLS) return;
    rec.pools.sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0));
    const shown = rec.pools.slice(0, POOLS_PER_PAGE); // top-N by TVL — what the page displays
    // Quality bar (030/032/033, chain-level): the DISPLAYED table must show
    // at least one VISIBLE non-zero yield. A chain whose top-8-by-TVL pools
    // are all "0.00%" (rounded or real) is thin/low-quality and dropped,
    // even if a real yield exists further down the ranking.
    if (!shown.some(p => formatApy(poolTotalApy(p)) !== '0.00%')) return;
    records.push({
      chain,
      slug: chainSlug(chain),
      totalTvl: rec.totalTvl,
      qualifyingCount: rec.qualifyingCount,
      tokens: Array.from(rec.tokens),
      pools: shown
    });
  });

  records.sort((a, b) => b.totalTvl - a.totalTvl);
  return (cap && cap > 0) ? records.slice(0, cap) : records;
}

/**
 * Related chains for internal linking (023/041 pattern): up to `n` other
 * ranked chains, chains sharing a token with `rec` first, then top-TVL
 * others. `all` arrives TVL-desc so ordering is preserved.
 */
function relatedChainsFor(rec, all, n) {
  const cap = n || 6;
  const myTokens = new Set(rec.tokens);
  const others = (all || []).filter(r => r.chain !== rec.chain);
  const coToken = others.filter(r => r.tokens.some(t => myTokens.has(t)));
  const coSet = new Set(coToken);
  const rest = others.filter(r => !coSet.has(r));
  return coToken.concat(rest).slice(0, cap).map(r => ({ chain: r.chain, slug: r.slug }));
}

/**
 * Top tokens present on this chain by aggregate on-chain TVL, restricted to
 * tokens with a real generated /tokens/<slug> page (049 — chain->token
 * cross-linking, symmetric to generate-token-pages.js's chainLinksFor).
 * Never links to an ungenerated slug. Deduped, sorted by on-chain TVL desc, capped.
 */
function topTokensOnChain(rec, generatedTokenSlugs, cap) {
  const limit = cap || 8;
  const byToken = new Map(); // symbol -> aggregate on-chain tvl
  (rec.pools || []).forEach(p => {
    tokenSymbols(p).forEach(sym => {
      if (!isValidToken(sym)) return;
      byToken.set(sym, (byToken.get(sym) || 0) + (p.tvlUsd || 0));
    });
  });
  return Array.from(byToken.entries())
    .map(([symbol, tvl]) => ({ symbol, slug: chainSlug(symbol), tvl }))
    .filter(t => generatedTokenSlugs && generatedTokenSlugs.has(t.slug))
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, limit)
    .map(({ symbol, slug }) => ({ symbol, slug }));
}

/** Render a single chain's static landing page as an HTML string. */
function renderChainPage(rec, related, generatedDate, tokenLinks) {
  const chainName = escapeHtml(rec.chain);
  const pageUrl = `${SITE_URL}/chains/${rec.slug}`;
  const appUrl = `${SITE_URL}/?chain=${encodeURIComponent(rec.chain)}`;
  const genDate = generatedDate || todayGeneratedDate();
  const bestApy = Math.max(...rec.pools.map(poolTotalApy));
  const tokenCount = rec.tokens.length;
  const title = `${chainName} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱`;
  const poolWord = rec.qualifyingCount === 1 ? 'pool' : 'pools';
  const tokenWord = tokenCount === 1 ? 'token' : 'tokens';
  const description =
    `${rec.qualifyingCount} live ${poolWord} on ${chainName} above the $100K TVL floor, up to ` +
    `${formatApy(bestApy)} APY, across ${tokenCount} ${tokenWord}. ` +
    `Honest yields from DefiLlama data — no anomalous rates.`;

  // Unique per-chain intro from real data (023-style content depth).
  const top = rec.pools[0];
  const intro =
    `${chainName}'s largest live pool is ${escapeHtml(top.project || '—')} (${escapeHtml(top.symbol || '—')}) ` +
    `at ${formatApy(poolTotalApy(top))} (${formatUsd(top.tvlUsd)} TVL). ` +
    `${rec.qualifyingCount} ${poolWord} across ${tokenCount} ${tokenWord} clear ` +
    `DeFi Garden's $100K TVL floor, ${formatUsd(rec.totalTvl)} in total.`;

  // BreadcrumbList (040 pattern): Home and the current page are real,
  // linkable URLs. "Chains" has no `item` — there is no /chains hub page in
  // this repo (no rewrite in vercel.json, no generated index), mirroring
  // the token pages' unlinked "Tokens" crumb.
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Chains' },
      { '@type': 'ListItem', position: 3, name: rec.chain, item: pageUrl }
    ]
  }).replace(/</g, '\\u003c');

  // ItemList + Dataset (046): the ItemList mirrors the visible pool table
  // exactly (same pools/order/links via poolHrefFor, no new computation) —
  // Google requires structured data to reflect visible content.
  const itemListJsonLd = renderItemListJsonLd(rec.pools, appUrl);
  const datasetJsonLd = renderDatasetJsonLd(
    `${rec.chain} DeFi Yields Dataset`,
    `Live DefiLlama yield data for ${rec.chain} pools on DeFi Garden, filtered by a $100K TVL floor and anomalous-APY exclusion.`,
    pageUrl,
    genDate
  );

  // Direct-answer + FAQ (047, GEO/AEO): built from the SAME gated `rec` the
  // table/intro above already use — never touches raw pool data, so an
  // anomalous/sub-floor pool structurally cannot reach the answer or FAQ.
  const { answer, faq } = buildAnswerAndFaq(rec.chain, rec, bestApy, top, poolWord);
  const answerBlock = renderAnswerBlockHtml(answer, 'cp-answer');
  const faqBlock = renderFaqBlockHtml(faq, 'cp-faq');
  const faqJsonLd = renderFaqJsonLd(faq);

  const relatedLinks = (related || []).map(r =>
    `<a href="${SITE_URL}/chains/${r.slug}">${escapeHtml(r.chain)}</a>`).join('\n        ');
  const relatedBlock = relatedLinks
    ? `    <nav class="related" aria-label="Related chains">
      <h2>Related chains</h2>
      <div class="related-links">
        ${relatedLinks}
      </div>
    </nav>\n`
    : '';

  // Cross-surface internal linking (049): top tokens present on this chain
  // (only ones with a real generated page) + the pool-type categories in
  // this chain's own table, linked to the live app view for that category.
  const tokenNavItems = (tokenLinks || []).map(t => ({ label: t.symbol, href: `${SITE_URL}/tokens/${t.slug}` }));
  const tokenLinksBlock = renderLinkNavHtml(tokenNavItems, `Top tokens on ${rec.chain}`, `Top tokens on ${rec.chain}`, 'xlink-tokens');
  const categoryItems = categoryLinksFor(rec.pools, appUrl).map(c => ({ label: c.category, href: c.url }));
  const categoryBlock = renderLinkNavHtml(categoryItems, 'Pool categories', 'By category', 'xlink-category');

  const rows = rec.pools.map(p => {
    // Each pool links to its detail page (the app matches pool.pool ===
    // urlParams.pool). Falls back to this chain's app view if no id. Shared
    // with the ItemList JSON-LD above via poolHrefFor so they can't drift.
    const poolHref = poolHrefFor(p, appUrl);
    return `        <tr>
          <td>${escapeHtml(p.symbol || '—')}</td>
          <td><a class="cp-pool-link" href="${poolHref}">${escapeHtml(p.project || '—')} &rarr;</a></td>
          <td class="num">${formatApy(poolTotalApy(p))}</td>
          <td class="num">${formatUsd(p.tvlUsd)}</td>
        </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">
    <script type="application/ld+json">${breadcrumbJsonLd}</script>
    <script type="application/ld+json">${itemListJsonLd}</script>
    <script type="application/ld+json">${datasetJsonLd}</script>
    <script type="application/ld+json">${faqJsonLd}</script>
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
    <!-- Reuse the app's design system: style.css defines the neumorphic tokens
         (--color-*, --neuro-*) + the brand gradient body. The scoped block below
         styles this page with those tokens only — no hardcoded colors/gradients. -->
    <link rel="stylesheet" href="/style.css">
    <style>
      .cp-wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px; }
      .cp-wrap h1 { font-size: 1.7rem; margin: 0 0 4px; color: var(--color-text); }
      .cp-wrap .sub { color: var(--color-text-secondary); margin: 0 0 16px; }
      .cp-wrap .intro { color: var(--color-text); margin: 4px 0 22px; line-height: 1.6; }
      .cp-card { background: var(--color-surface); border-radius: var(--neuro-radius-lg); box-shadow: var(--neuro-shadow-raised); padding: 8px 18px; margin: 20px 0; }
      .cp-card table { width: 100%; border-collapse: collapse; }
      .cp-card th, .cp-card td { text-align: left; padding: 13px 8px; border-bottom: 1px solid var(--color-border); color: var(--color-text); }
      .cp-card th { color: var(--color-text-secondary); font-weight: 600; }
      .cp-card td.num, .cp-card th.num { text-align: right; }
      .cp-card tr:last-child td { border-bottom: none; }
      .cp-card tbody tr { transition: background .15s ease; }
      .cp-card tbody tr:hover { background: var(--color-background); }
      .cp-pool-link { color: var(--color-primary); text-decoration: none; font-weight: 500; }
      .cp-pool-link:hover { text-decoration: underline; }
      .cp-pool-link:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--neuro-radius-sm); }
      @media (prefers-reduced-motion: reduce) { .cp-card tbody tr { transition: none; } }
      .cp-cta { display: inline-block; margin: 8px 0 4px; padding: 14px 24px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-raised); text-decoration: none; font-weight: 600; transition: box-shadow .2s ease, transform .2s ease; }
      .cp-cta:hover { box-shadow: var(--neuro-shadow-flat); transform: translateY(-2px); }
      .cp-cta:active { box-shadow: var(--neuro-shadow-pressed); transform: translateY(1px); }
      .cp-cta:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .related { margin: 30px 0 8px; }
      .related h2 { font-size: 1rem; margin-bottom: 12px; color: var(--color-text); }
      .related-links a { display: inline-block; margin: 0 8px 8px 0; padding: 8px 14px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-subtle); text-decoration: none; font-size: .9rem; transition: box-shadow .2s ease; }
      .related-links a:hover { box-shadow: var(--neuro-shadow-flat); }
      .related-links a:active { box-shadow: var(--neuro-shadow-pressed); }
      .related-links a:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .cp-wrap .note { color: var(--color-text-secondary); font-size: .9rem; }
      .cp-answer { color: var(--color-text); margin: 10px 0 18px; line-height: 1.6; font-weight: 500; }
      .cp-faq { margin: 30px 0 8px; }
      .cp-faq h2 { font-size: 1rem; margin-bottom: 12px; color: var(--color-text); }
      .cp-faq-item { background: var(--color-surface); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-subtle); padding: 14px 18px; margin: 0 0 12px; }
      .cp-faq-q { font-size: .95rem; margin: 0 0 6px; color: var(--color-text); }
      .cp-faq-a { font-size: .9rem; margin: 0; color: var(--color-text-secondary); line-height: 1.55; }
      .scroll { overflow-x: auto; }
      @media (prefers-reduced-motion: reduce) { .cp-cta, .related-links a { transition: none; } }
    </style>
${renderAnalyticsBootstrap(`/chains/${rec.slug}`, { page_type: 'chain_landing', chain: rec.chain, pool_count: rec.qualifyingCount })}
</head>
<body>
  <main class="cp-wrap">
    <h1>${chainName} DeFi Yields</h1>
${answerBlock}    <p class="sub">${escapeHtml(String(rec.qualifyingCount))} live ${poolWord} above the $100K TVL floor · ranked by TVL</p>
    <p class="intro">${intro}</p>
    <a class="cp-cta" href="${appUrl}">See live pools on ${chainName} &rarr;</a>
    <div class="cp-card">
    <div class="scroll">
    <table>
      <thead>
        <tr><th>Token</th><th>Protocol</th><th class="num">APY</th><th class="num">TVL</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    </div>
    </div>
${faqBlock}${relatedBlock}${tokenLinksBlock}${categoryBlock}    <p class="note">Yields are live from DefiLlama and pass DeFi Garden's trust filters (≥ $100K TVL, anomalous rates excluded). Not financial advice — education only.</p>
${renderLastUpdatedHtml(genDate)}    <p class="note"><a href="${SITE_URL}/">DeFi Garden 🌱</a> — plan your DeFi savings by goal.</p>
  </main>
</body>
</html>
`;
}

/** Render the /chains hub (index) page: all chains linked directly — the
 * chain surface (dozens, not thousands) fits under the ~100-link-per-
 * template guidance without an A–Z tier (045 — de-orphan the SEO surface
 * so every /chains/<slug> page is <=3 clicks from `/`). */
function renderChainHubPage(ranked) {
  const pageUrl = `${SITE_URL}/chains`;
  const title = `Every Chain's Live DeFi Yields | DeFi Garden 🌱`;
  const description =
    `${ranked.length} chains with live, trust-filtered DeFi yield data, ranked by TVL. ` +
    `Honest yields from DefiLlama, no anomalous rates.`;
  const links = (ranked || []).map(r =>
    `<a href="${SITE_URL}/chains/${r.slug}">${escapeHtml(r.chain)}</a>`).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
    <link rel="stylesheet" href="/style.css">${renderHubStyleBlock()}
${renderAnalyticsBootstrap('/chains', { page_type: 'chain_hub', chain_count: ranked.length })}
</head>
<body>
  <main class="hub-wrap">
    <h1>All Chain Yield Pages</h1>
    <p class="sub">${ranked.length} chains with live, trust-filtered yield data</p>
    <p class="intro">Every DeFi Garden chain page in one place — live pools ranked by TVL, filtered through our $100K floor and anomaly rails.</p>
    <a class="hub-cta" href="${SITE_URL}/">&larr; Back to DeFi Garden</a>
    <div class="hub-card">
      <h2>All chains</h2>
      <div class="hub-links">
        ${links}
      </div>
    </div>
    <p class="note">Yields are live from DefiLlama and pass DeFi Garden's trust filters (&ge; $100K TVL, anomalous rates excluded). Not financial advice &mdash; education only.</p>
  </main>
</body>
</html>
`;
}

/** Render a sitemap (urlset) of all generated /chains/<slug> URLs, plus any
 * `extraLocs` (045: the /chains hub page). */
function renderChainSitemap(ranked, lastmod, extraLocs) {
  const lastmodTag = lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '';
  const extra = (extraLocs || []).map(loc =>
    `  <url>\n    <loc>${loc}</loc>\n${lastmodTag}    <changefreq>daily</changefreq>\n  </url>`);
  const urls = (ranked || []).map(rec =>
    `  <url>\n    <loc>${SITE_URL}/chains/${rec.slug}</loc>\n${lastmodTag}    <changefreq>daily</changefreq>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${extra.concat(urls).join('\n')}\n</urlset>\n`;
}

// --- IO layer (only runs as a script) --------------------------------------
function fetchPoolData() {
  return new Promise((resolve, reject) => {
    https.get(YIELDS_API, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (e) { reject(new Error('parse failed: ' + e.message)); }
      });
    }).on('error', (e) => reject(new Error('API request failed: ' + e.message)));
  });
}

function parseArgs(argv) {
  const args = { fixture: process.env.POOLS_FIXTURE || null, out: 'chains', limit: DEFAULT_LIMIT, sitemap: 'sitemap-chain-pages.xml' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10) || DEFAULT_LIMIT;
    else if (argv[i] === '--sitemap') args.sitemap = argv[++i];
    else if (argv[i] === '--no-sitemap') args.sitemap = null;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pools;
  if (args.fixture) {
    console.log('📄 Loading pools from fixture:', args.fixture);
    const raw = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
    pools = raw.data || raw;
  } else {
    console.log('📡 Fetching pools from DefiLlama...');
    pools = await fetchPoolData();
  }
  console.log(`✅ ${pools.length} pools`);

  const ranked = rankTopChains(pools, args.limit);
  console.log(`🏆 ${ranked.length} chains (>= ${MIN_QUALIFYING_POOLS} qualifying pool each)`);

  const outDir = path.resolve(args.out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Clean stale pages first so chains dropped by the gate / renamed slugs
  // don't linger from a previous run (mirrors 031's token-page cleanup).
  if (outDir !== process.cwd()) {
    fs.readdirSync(outDir).forEach(f => {
      if (f.endsWith('.html')) fs.rmSync(path.join(outDir, f));
    });
  }
  // One generation date for the whole run (048): every page's visible "Last
  // updated" line + dateModified schema agree, even across a long-running batch.
  const genDate = todayGeneratedDate();

  // Cross-surface linking (049): which /tokens/<slug> pages will actually
  // exist, computed from this SAME `pools` fetch (already in scope via `tp`)
  // so token/chain eligibility can never drift within one run.
  const generatedTokenSlugs = new Set(tp.rankTopTokens(pools, 0).map(t => t.slug));

  ranked.forEach(rec => {
    const tokenLinks = topTokensOnChain(rec, generatedTokenSlugs);
    fs.writeFileSync(path.join(outDir, `${rec.slug}.html`), renderChainPage(rec, relatedChainsFor(rec, ranked), genDate, tokenLinks));
  });
  console.log(`📝 Wrote ${ranked.length} pages to ${args.out}/`);

  // Hub page (045): de-orphan the surface — home.html links to /chains,
  // which links every chain directly (dozens fit under the ~100-link cap).
  fs.writeFileSync(path.join(outDir, 'index.html'), renderChainHubPage(ranked));
  console.log('🧭 Wrote chains hub page');

  if (args.sitemap) {
    const lastmod = new Date().toISOString().slice(0, 10);
    const hubUrls = [`${SITE_URL}/chains`];
    fs.writeFileSync(path.resolve(args.sitemap), renderChainSitemap(ranked, lastmod, hubUrls));
    console.log(`🗺️  Wrote ${args.sitemap} (${ranked.length + hubUrls.length} URLs)`);
  }
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = {
  rankTopChains, renderChainPage, relatedChainsFor, renderChainSitemap, renderChainHubPage, chainSlug,
  topTokensOnChain,
  POOLS_PER_PAGE, MIN_POOL_TVL, APY_SANITY_LIMIT, MIN_QUALIFYING_POOLS, DEFAULT_LIMIT, SITE_URL
};
