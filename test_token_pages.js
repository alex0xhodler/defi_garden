/* Unit tests for the static token-page generator (spec 014).
   Runs the generator's pure functions against a crafted fixture and asserts
   on the real emitted HTML. Run: node test_token_pages.js

   Eligibility (human directive 2026-07-11): a token earns a page if it has
   >=1 pool with TVL >= $100K that is NOT anomalous (>1000% APY). No minimum
   pool count, no cap by default. The anomaly exclusion is a trust rail. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gen = require('./generate-token-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Fixture branches:
// BIG    : 2 pools ($500M + $300M)              -> qualifies, rank #1
// MID    : 1 pool ($5M)                          -> qualifies (single pool ok)
// ANOM   : 1 real ($2M) + 1 anomalous ($900M @2100%) -> anomaly excluded, qualifies via the $2M pool
// USDC.E : 1 pool ($200K), dotted symbol         -> qualifies, slug-safe
// SMALL  : 1 pool ($150K), newer token           -> qualifies (above the $100K floor)
// DUST   : 1 pool ($50K)                          -> dropped (below the $100K floor)
const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const ranked = gen.rankTopTokens(pools); // no cap
const bySym = Object.fromEntries(ranked.map(r => [r.symbol, r]));

console.log('rankTopTokens — $100K floor, >=1 pool, no cap');
test('emits every token with >=1 qualifying pool; drops sub-$100K-only tokens', () => {
  assert.deepStrictEqual(ranked.map(r => r.symbol).sort(), ['ANOM', 'BIG', 'MID', 'SMALL', 'USDC.E']);
});
test('single-pool tokens are included (no >=2 minimum)', () => {
  assert.strictEqual(bySym['MID'].qualifyingCount, 1);
  assert.strictEqual(bySym['SMALL'].qualifyingCount, 1);
  assert.strictEqual(bySym['USDC.E'].qualifyingCount, 1);
});
test('newer/low-TVL token above the floor qualifies (SMALL @ $150K)', () => {
  assert.ok(bySym['SMALL']);
});
test('token whose only pool is below $100K is dropped (DUST @ $50K)', () => {
  assert.ok(!bySym['DUST']);
});
test('token with pools but ALL 0% yield is dropped (030 quality bar — ZERO)', () => {
  assert.ok(!bySym['ZERO'], 'an all-0%-APY token must not get an indexed page');
});
test('token whose best yield rounds to 0.00% is dropped (032 — TINY @ 0.003%)', () => {
  assert.ok(!bySym['TINY'], 'a token whose APY displays 0.00% must not get an indexed page');
});
test('token whose yield pool is beyond POOLS_PER_PAGE is dropped (033 — TRUNC)', () => {
  // TRUNC's top-8-by-TVL are all 0%; its 5% pool is #9 (not shown) -> displayed table all 0.00%
  assert.ok(!bySym['TRUNC'], 'a token whose displayed table is all 0.00% must not get an indexed page');
});
test('every generated token DISPLAYS >=1 visible non-zero yield (gate matches the shown table)', () => {
  ranked.forEach(r => assert.ok(r.pools.some(p => gen.formatApy(gen.poolTotalApy(p)) !== '0.00%'),
    r.symbol + ' shows all 0.00% APY in its rendered table'));
});
test('ranks by aggregate qualifying TVL desc', () => {
  assert.deepStrictEqual(ranked.map(r => r.symbol), ['BIG', 'MID', 'ANOM', 'USDC.E', 'SMALL']);
});

console.log('trust rail — anomaly exclusion (untouched)');
test('anomalous pool excluded from content AND count AND TVL (ANOM)', () => {
  assert.strictEqual(bySym['ANOM'].qualifyingCount, 1, 'anomalous pool must not be counted');
  assert.strictEqual(bySym['ANOM'].totalTvl, 2000000, 'anomalous $900M pool must not inflate TVL');
  assert.strictEqual(bySym['ANOM'].pools.length, 1);
});
test('no rendered pool anywhere is anomalous (>1000% total APY)', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok(gen.poolTotalApy(p) <= gen.APY_SANITY_LIMIT, r.symbol + ' has an anomalous pool');
  }));
});
test('every rendered pool clears the $100K floor', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok((p.tvlUsd || 0) >= gen.MIN_POOL_TVL, r.symbol + ' has a sub-floor pool');
  }));
});

console.log('cap handling');
test('no cap by default returns all eligible tokens', () => {
  assert.strictEqual(gen.rankTopTokens(pools).length, 5);
  assert.strictEqual(gen.rankTopTokens(pools, 0).length, 5);
});
test('explicit --limit caps to top-N by TVL (limit=1 -> BIG)', () => {
  const top1 = gen.rankTopTokens(pools, 1);
  assert.strictEqual(top1.length, 1);
  assert.strictEqual(top1[0].symbol, 'BIG');
});

console.log('tokenSlug — URL/filesystem safety');
test('dotted symbol slugs to safe form', () => {
  assert.strictEqual(gen.tokenSlug('USDC.E'), 'usdc-e');
  assert.strictEqual(bySym['USDC.E'].slug, 'usdc-e');
});
test('slug has no unsafe chars', () => {
  ranked.forEach(r => assert.ok(/^[a-z0-9-]+$/.test(r.slug), 'bad slug: ' + r.slug));
});

console.log('renderTokenPage — server-delivered SEO content');
const html = gen.renderTokenPage(bySym['BIG']);
test('self-canonical to /tokens/<slug> (not the ?token= app URL)', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'missing self-canonical');
});
test('server-delivered <title> present in raw HTML (no JS)', () => {
  assert.ok(/<title>BIG DeFi Yields[^<]*<\/title>/.test(html), 'missing title');
});
test('server-delivered meta description present', () => {
  assert.ok(/<meta name="description" content="[^"]+">/.test(html), 'missing description');
});
test('links into the live app at ?token=<SYMBOL>', () => {
  assert.ok(html.includes('https://www.defi.garden/?token=BIG'), 'missing app deep link');
});
test('each pool row links to its detail page (/?pool=<id>)', () => {
  const top = bySym['BIG'].pools[0];
  assert.ok(top.pool, 'fixture pool missing an id');
  assert.ok(html.includes(`href="https://www.defi.garden/?pool=${encodeURIComponent(top.pool)}"`),
    'pool row not linked to its detail page');
  assert.ok(html.includes('class="tp-pool-link"'), 'missing pool link class');
});
test('pool row falls back to the token app view when a pool has no id', () => {
  const noId = gen.renderTokenPage({ symbol: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7,
    pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0 }] });
  assert.ok(noId.includes('href="https://www.defi.garden/?token=X"'), 'missing fallback link');
});
test('renders >=1 real pool row with en-US formatted numbers', () => {
  assert.ok(/<td class="num">\d/.test(html), 'no formatted numeric cell');
  assert.ok(html.includes('%') && html.includes('$'), 'no APY/TVL');
});
test('indexable (robots index,follow)', () => {
  assert.ok(html.includes('content="index,follow"'), 'should be indexable');
});
test('reuses the app design system (links style.css) and uses neuro tokens, no hardcoded hex', () => {
  assert.ok(html.includes('<link rel="stylesheet" href="/style.css">'), 'must link the app style.css');
  assert.ok(html.includes('var(--neuro-shadow-raised)') && html.includes('var(--color-surface)'), 'must use neuro/color tokens');
  const styleBlock = html.match(/<style>[\s\S]*?<\/style>/)[0];
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleBlock), 'no hardcoded hex colors in the scoped style block');
});
test('single-pool page uses singular "pool" wording', () => {
  const midHtml = gen.renderTokenPage(bySym['MID']);
  assert.ok(/1 live pool above/.test(midHtml), 'expected singular "pool"');
});
test('HTML is escaped (malicious project name cannot inject markup)', () => {
  const evil = gen.renderTokenPage({ symbol: 'X', slug: 'x', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: '<script>alert(1)</script>', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0 }] });
  assert.ok(!evil.includes('<script>alert(1)</script>'), 'unescaped project name leaked into HTML');
  assert.ok(evil.includes('&lt;script&gt;'), 'expected escaped project name');
});

console.log('040 — BreadcrumbList JSON-LD');
function extractLdJsonBlocks(pageHtml, type) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(pageHtml))) {
    const parsed = JSON.parse(m[1]);
    if (!type || parsed['@type'] === type) blocks.push(parsed);
  }
  return blocks;
}
test('exactly one valid BreadcrumbList block with 3 items', () => {
  const blocks = extractLdJsonBlocks(html, 'BreadcrumbList');
  assert.strictEqual(blocks.length, 1, 'expected exactly one BreadcrumbList block');
  assert.strictEqual(blocks[0].itemListElement.length, 3, 'expected exactly 3 breadcrumb items');
});
test('breadcrumb items: Home (linked), Tokens (unlinked — no real hub page), <SYMBOL> (linked, self-canonical)', () => {
  const items = extractLdJsonBlocks(html, 'BreadcrumbList')[0].itemListElement;
  assert.strictEqual(items[0].position, 1);
  assert.strictEqual(items[0].name, 'Home');
  assert.strictEqual(items[0].item, 'https://www.defi.garden/');
  assert.strictEqual(items[1].position, 2);
  assert.strictEqual(items[1].name, 'Tokens');
  assert.ok(!('item' in items[1]), 'Tokens has no hub page in this repo — must not link a 404');
  assert.strictEqual(items[2].position, 3);
  assert.strictEqual(items[2].name, 'BIG');
  assert.strictEqual(items[2].item, 'https://www.defi.garden/tokens/big', 'must match the page\'s own canonical URL');
});
test('malicious symbol cannot break out of the ld+json script tag (BreadcrumbList block itself)', () => {
  // Isolates the JSON-LD block this diff adds. The pre-existing analytics
  // bootstrap (039, renderAnalyticsBootstrap) separately JSON.stringifies
  // rec.symbol into a *different* <script> without this escaping — a
  // pre-existing gap out of scope for 040 (no new computation, breadcrumb/
  // FAQ/Organization/WebSite only). Flagged in specs/040-notes.md.
  const evil = gen.renderTokenPage({ symbol: '</script><script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const blocks = extractLdJsonBlocks(evil, 'BreadcrumbList');
  assert.strictEqual(blocks.length, 1, 'BreadcrumbList block must still parse as valid JSON');
  assert.strictEqual(blocks[0].itemListElement[2].name, '</script><script>alert(1)</script>', 'JSON-LD name must still equal the raw symbol once parsed');
});

console.log('023 — content depth + internal linking');
test('renders a unique per-token intro from real data (top pool + totals)', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(/class="intro"/.test(big), 'no intro block');
  assert.ok(big.includes("BIG's largest live pool is aave-v3 on Ethereum"), 'intro not token-specific');
});
test('intro differs per token (dataset content, not a fixed template)', () => {
  const a = gen.renderTokenPage(bySym['BIG'], []);
  const b = gen.renderTokenPage(bySym['MID'], []);
  const introA = a.match(/<p class="intro">([^<]*)</)[1];
  const introB = b.match(/<p class="intro">([^<]*)</)[1];
  assert.notStrictEqual(introA, introB, 'intros are identical across tokens');
});
test('relatedFor prefers co-chain tokens, excludes self, is slug-linkable', () => {
  const rel = gen.relatedFor(bySym['BIG'], ranked);
  assert.ok(rel.length >= 1, 'no related tokens');
  assert.ok(!rel.some(r => r.symbol === 'BIG'), 'self appeared in related');
  // BIG shares Ethereum/Base with MID(Ethereum) and ANOM(Ethereum) -> co-chain first
  assert.strictEqual(rel[0].symbol, 'MID', 'expected a co-chain token first');
});
test('page renders a Related tokens nav with internal /tokens/ links', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(/class="related"/.test(big), 'no related nav');
  assert.ok(big.includes('href="https://www.defi.garden/tokens/mid"'), 'no internal token link');
});
test('no self-link inside the related nav (canonical self-ref is fine)', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  const nav = big.match(/<nav class="related"[\s\S]*?<\/nav>/)[0];
  assert.ok(!nav.includes('/tokens/big"'), 'related nav links back to its own page');
});
test('related nav omitted when there are no related tokens', () => {
  const solo = gen.renderTokenPage(bySym['BIG'], []);
  assert.ok(!/class="related"/.test(solo), 'related nav should be absent with no related tokens');
});

console.log('021 — token sitemap (renderTokenSitemap)');
test('emits a valid urlset with one <loc> per ranked token', () => {
  const xml = gen.renderTokenSitemap(ranked, '2026-07-11');
  assert.ok(xml.startsWith('<?xml'), 'missing xml decl');
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'missing urlset');
  const locs = (xml.match(/<loc>/g) || []).length;
  assert.strictEqual(locs, ranked.length, 'one loc per token');
});
test('sitemap URLs point at the static /tokens/<slug> pages', () => {
  const xml = gen.renderTokenSitemap(ranked, '2026-07-11');
  assert.ok(xml.includes('<loc>https://www.defi.garden/tokens/big</loc>'), 'missing token URL');
  assert.ok(xml.includes('<lastmod>2026-07-11</lastmod>'), 'missing lastmod');
});
test('empty ranked list still yields a well-formed (empty) urlset', () => {
  const xml = gen.renderTokenSitemap([], '2026-07-11');
  assert.ok(xml.includes('<urlset') && xml.includes('</urlset>'), 'not well-formed');
  assert.strictEqual((xml.match(/<loc>/g) || []).length, 0);
});

console.log('039 — analytics bootstrap (previously zero token pages fired a trackable event)');
test('renderAnalyticsBootstrap emits Mixpanel stub + analytics.js + trackPageView', () => {
  const html = gen.renderAnalyticsBootstrap('/tokens/usdc', { page_type: 'token_landing', token: 'USDC', pool_count: 3 });
  assert.ok(html.includes('mixpanel.init('), 'missing mixpanel.init');
  assert.ok(html.includes('<script defer src="https://www.defi.garden/analytics.js"></script>'), 'missing analytics.js script tag');
  assert.ok(html.includes('Analytics.trackPageView("/tokens/usdc"'), 'missing trackPageView call with correct path');
  assert.ok(html.includes('"page_type":"token_landing"') && html.includes('"token":"USDC"') && html.includes('"pool_count":3'), 'missing/incorrect properties');
});
test('mixpanel stub regex literal survives untouched (/^\\/\\//)', () => {
  const html = gen.renderAnalyticsBootstrap('/tokens/usdc', {});
  assert.ok(html.includes('.match(/^\\/\\//)'.replace(/\\\\/g, '\\')), 'regex literal corrupted');
});
test('every generated token page wires the analytics bootstrap with its own slug/symbol/count', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(big.includes('Analytics.trackPageView("/tokens/big"'), 'BIG page missing its trackPageView call');
  assert.ok(big.includes('"token":"BIG"'), 'BIG page missing token property');
  assert.ok(big.includes(`"pool_count":${bySym['BIG'].qualifyingCount}`), 'BIG page pool_count mismatch');
});
test('analytics bootstrap sits inside <head>, before </head>, after the scoped <style> block', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  const styleEnd = big.indexOf('</style>');
  const bootstrapIdx = big.indexOf('Analytics.trackPageView');
  const headEnd = big.indexOf('</head>');
  assert.ok(styleEnd < bootstrapIdx && bootstrapIdx < headEnd, 'analytics bootstrap misplaced relative to <style>/</head>');
});
test('pre-existing content (title/canonical/pool table/related nav) unchanged by this diff', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(big.includes('<title>BIG DeFi Yields'), 'title missing/changed');
  assert.ok(big.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'canonical missing/changed');
  assert.ok(/class="related"/.test(big), 'related nav missing');
});

console.log(`\n${passed} assertions passed`);
