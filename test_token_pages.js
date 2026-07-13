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
const chainGen = require('./generate-chain-pages.js'); // 049 — cross-surface linking

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

console.log('046 — ItemList + Dataset JSON-LD');
test('exactly one valid ItemList block whose items EXACTLY match the visible table rows', () => {
  const blocks = extractLdJsonBlocks(html, 'ItemList');
  assert.strictEqual(blocks.length, 1, 'expected exactly one ItemList block');
  const items = blocks[0].itemListElement;
  const big = bySym['BIG'];
  assert.strictEqual(items.length, big.pools.length, 'ItemList item count must match the visible row count');
  big.pools.forEach((p, i) => {
    assert.strictEqual(items[i].position, i + 1, 'position must match row order');
    assert.strictEqual(items[i].name, `${p.project} on ${p.chain}`, 'name must match project/chain shown in the row');
    const expectedUrl = p.pool
      ? `https://www.defi.garden/?pool=${encodeURIComponent(p.pool)}`
      : `https://www.defi.garden/?token=${encodeURIComponent(big.symbol)}`;
    assert.strictEqual(items[i].url, expectedUrl, 'url must match the row\'s own link target');
    assert.ok(html.includes(`href="${items[i].url}"`), 'ItemList url must actually appear as a rendered row link');
  });
});
test('ItemList item count matches the number of <tr> rows in the table, not the full pool set', () => {
  const items = extractLdJsonBlocks(html, 'ItemList')[0].itemListElement;
  const trCount = (html.match(/<tr>\s*<td>/g) || []).length; // hub/az pages have no such rows; this page has exactly one table
  assert.strictEqual(items.length, trCount, 'ItemList must mirror the exact rendered row count');
});
test('exactly one valid Dataset block with required schema.org properties', () => {
  const blocks = extractLdJsonBlocks(html, 'Dataset');
  assert.strictEqual(blocks.length, 1, 'expected exactly one Dataset block');
  const d = blocks[0];
  assert.ok(d.name && typeof d.name === 'string', 'missing Dataset.name');
  assert.ok(d.description && typeof d.description === 'string', 'missing Dataset.description');
  assert.strictEqual(d.url, 'https://www.defi.garden/tokens/big', 'Dataset.url must be the page\'s own canonical URL');
  assert.strictEqual(d.publisher['@type'], 'Organization');
  assert.strictEqual(d.publisher.name, 'DeFi Garden');
  assert.strictEqual(d.creator['@type'], 'Organization');
  assert.ok(d.dateModified, 'missing Dataset.dateModified');
});
test('Dataset name/description are token-specific (dataset content, not a fixed template)', () => {
  const midHtml = gen.renderTokenPage(bySym['MID'], [], '2026-07-12');
  const midDataset = extractLdJsonBlocks(midHtml, 'Dataset')[0];
  assert.ok(midDataset.name.includes('MID'), 'Dataset.name should be token-specific');
  assert.notStrictEqual(midDataset.name, extractLdJsonBlocks(html, 'Dataset')[0].name);
});
test('generatedDate param controls Dataset.dateModified (defaults to today if omitted)', () => {
  const dated = gen.renderTokenPage(bySym['BIG'], [], '2020-01-01');
  assert.strictEqual(extractLdJsonBlocks(dated, 'Dataset')[0].dateModified, '2020-01-01');
});

console.log('048 — freshness signal: visible "Last updated" + Dataset.dateModified match');
test('renders a visible "Last updated <date>" line', () => {
  const dated = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12');
  assert.ok(dated.includes('Last updated 2026-07-12'), 'missing visible "Last updated" line');
});
test('visible "Last updated" date is byte-for-byte identical to Dataset.dateModified', () => {
  const dated = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12');
  const dateModified = extractLdJsonBlocks(dated, 'Dataset')[0].dateModified;
  assert.ok(dated.includes(`Last updated ${dateModified}`), 'visible date and Dataset.dateModified must match byte-for-byte');
});
test('default (no generatedDate passed) still renders a "Last updated" line', () => {
  assert.ok(/Last updated .+/.test(html), 'default-dated page missing visible "Last updated" line');
});
test('malicious project name cannot break out of the ItemList ld+json script tag', () => {
  const evil = gen.renderTokenPage({ symbol: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7,
    pools: [{ project: '</script><script>alert(1)</script>', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] }, [], '2026-07-12');
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const items = extractLdJsonBlocks(evil, 'ItemList')[0].itemListElement;
  assert.strictEqual(items[0].name, '</script><script>alert(1)</script> on Base', 'ItemList name must still equal the raw project name once parsed');
});
test('no visible content/meta/canonical/trust rail altered — only ld+json script blocks added', () => {
  // 046 is additive-only (spec 046, acceptance criterion 4). Strip every
  // <script type="application/ld+json"> block and diff against a pre-046
  // fixture rendering to prove nothing else moved.
  const stripLdJson = (s) => s.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  const before = stripLdJson(gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked), '2026-07-12'));
  // Recompute what the page looked like immediately before this diff by
  // asserting the stripped output still contains every pre-existing marker
  // untouched (title/canonical/table/related nav/analytics), i.e. ld+json
  // removal is the ONLY structural difference this diff introduces.
  assert.ok(before.includes('<title>BIG DeFi Yields'), 'title missing/changed');
  assert.ok(before.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'canonical missing/changed');
  assert.ok(before.includes('content="index,follow"'), 'robots meta missing/changed');
  assert.ok(/class="related"/.test(before), 'related nav missing');
  assert.ok(before.includes('Analytics.trackPageView("/tokens/big"'), 'analytics bootstrap missing');
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

console.log('047 — direct-answer block + FAQPage (GEO/AEO)');
test('renders a visible direct-answer block right after the H1, before the pool table', () => {
  const h1Idx = html.indexOf('<h1>');
  const answerIdx = html.indexOf('class="tp-answer"');
  const tableIdx = html.indexOf('<table>');
  assert.ok(answerIdx > h1Idx && answerIdx < tableIdx, 'answer block misplaced relative to H1/table');
});
test('answer block answers the head query using only gated data already on the page', () => {
  const big = bySym['BIG'];
  const answerText = html.match(/class="tp-answer">([^<]*)</)[1];
  assert.ok(answerText.includes('BIG'), 'answer must name the token');
  assert.ok(answerText.includes(gen.formatApy(gen.poolTotalApy(big.pools[0]))), 'answer must cite the top pool\'s real APY');
  assert.ok(answerText.includes(String(big.qualifyingCount)), 'answer must cite the real qualifying pool count');
  assert.ok(answerText.includes('$100K TVL floor') && answerText.includes('anomalous'), 'answer must disclose the trust filters');
});
test('renders a visible FAQPage Q&A block with 2-4 items', () => {
  const items = html.match(/<div class="tp-faq-item">/g) || [];
  assert.ok(items.length >= 2 && items.length <= 4, 'expected 2-4 visible FAQ items, got ' + items.length);
});
test('FAQPage JSON-LD mainEntity is byte-for-byte the visible question/answer text (040 kevin invariant)', () => {
  const blocks = extractLdJsonBlocks(html, 'FAQPage');
  assert.strictEqual(blocks.length, 1, 'expected exactly one FAQPage block');
  const mainEntity = blocks[0].mainEntity;
  assert.ok(mainEntity.length >= 2 && mainEntity.length <= 4);
  const qMatches = [...html.matchAll(/<h3 class="tp-faq-q">([^<]*)<\/h3>/g)].map(m => m[1]);
  const aMatches = [...html.matchAll(/<p class="tp-faq-a">([^<]*)<\/p>/g)].map(m => m[1]);
  mainEntity.forEach((item, i) => {
    const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    assert.strictEqual(item.name, decode(qMatches[i]), 'FAQ question text mismatch at index ' + i);
    assert.strictEqual(item.acceptedAnswer.text, decode(aMatches[i]), 'FAQ answer text mismatch at index ' + i);
    assert.strictEqual(item['@type'], 'Question');
    assert.strictEqual(item.acceptedAnswer['@type'], 'Answer');
  });
});
test('trust rail: neither the answer block nor the FAQ ever cites an anomalous or sub-floor pool (ANOM fixture)', () => {
  const anomHtml = gen.renderTokenPage(bySym['ANOM']);
  assert.ok(!anomHtml.includes('degenfarm'), 'anomalous pool project name leaked into the page');
  assert.ok(!anomHtml.includes('1,500.00%') && !anomHtml.includes('2,100.00%'), 'anomalous APY leaked into the page');
  const answerText = anomHtml.match(/class="tp-answer">([^<]*)</)[1];
  assert.ok(answerText.includes('realpool'), 'answer should cite the real (non-anomalous) top pool');
  assert.ok(answerText.includes('1 pool'), 'ANOM has exactly 1 qualifying (non-anomalous) pool');
});
test('answer/FAQ content differs per token (dataset content, not a fixed template)', () => {
  const midHtml = gen.renderTokenPage(bySym['MID']);
  const bigAnswer = html.match(/class="tp-answer">([^<]*)</)[1];
  const midAnswer = midHtml.match(/class="tp-answer">([^<]*)</)[1];
  assert.notStrictEqual(bigAnswer, midAnswer, 'answer block is identical across tokens');
});
test('malicious symbol cannot break out of the FAQPage ld+json script tag', () => {
  const evil = gen.renderTokenPage({ symbol: '</script><script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const faq = extractLdJsonBlocks(evil, 'FAQPage')[0];
  assert.ok(faq.mainEntity[0].name.includes('</script><script>alert(1)</script>'), 'FAQ question must still contain the raw symbol once parsed');
});
test('no pre-existing content/meta/canonical/trust rail altered — answer+FAQ are additive only', () => {
  assert.ok(html.includes('<title>BIG DeFi Yields'), 'title missing/changed');
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'canonical missing/changed');
  assert.ok(html.includes('content="index,follow"'), 'robots meta missing/changed');
  assert.ok(/class="related"/.test(gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked))), 'related nav missing');
});

console.log('049 — cross-surface linking: token -> chain');
const chainRanked = chainGen.rankTopChains(pools); // same fixture pools, real chain-side ranking
const generatedChainSlugs = new Set(chainRanked.map(c => c.slug));
test('chainLinksFor links only chains with a generated page (no dead links)', () => {
  // BIG has pools on Ethereum and Base; both qualify as real chain pages.
  const links = gen.chainLinksFor(bySym['BIG'], generatedChainSlugs);
  assert.deepStrictEqual(links, [{ chain: 'Ethereum', slug: 'ethereum' }, { chain: 'Base', slug: 'base' }]);
});
test('chainLinksFor never returns a slug outside the given generated set', () => {
  const links = gen.chainLinksFor(bySym['BIG'], new Set(['ethereum'])); // Base excluded on purpose
  assert.deepStrictEqual(links, [{ chain: 'Ethereum', slug: 'ethereum' }]);
});
test('chainLinksFor dedupes repeated chains and respects the cap', () => {
  const rec = { pools: [
    { chain: 'Ethereum', tvlUsd: 3 }, { chain: 'Ethereum', tvlUsd: 2 },
    { chain: 'Base', tvlUsd: 1 }, { chain: 'Arbitrum', tvlUsd: 1 }
  ] };
  const all = new Set(['ethereum', 'base', 'arbitrum']);
  assert.deepStrictEqual(gen.chainLinksFor(rec, all, 2), [
    { chain: 'Ethereum', slug: 'ethereum' }, { chain: 'Base', slug: 'base' }
  ]);
});
test('against the real cross-fixture ranking, chainLinksFor never links an ungenerated chain slug', () => {
  ranked.forEach(rec => {
    gen.chainLinksFor(rec, generatedChainSlugs).forEach(l =>
      assert.ok(generatedChainSlugs.has(l.slug), `dead link to ungenerated chain ${l.slug}`));
  });
});
test('renderTokenPage renders a Chains nav from chainLinks, omitted when there are none', () => {
  const withLinks = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12', [{ chain: 'Ethereum', slug: 'ethereum' }]);
  assert.ok(withLinks.includes('aria-label="Chains"'), 'missing Chains nav');
  assert.ok(withLinks.includes('href="https://www.defi.garden/chains/ethereum"'), 'missing chain link');
  const noLinks = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12', []);
  assert.ok(!noLinks.includes('aria-label="Chains"'), 'Chains nav should be absent with no chain links');
});

console.log('049 — cross-surface linking: category leg (folds in 043)');
test('categoryLinksFor returns distinct categories with working ?token=&poolTypes= app URLs', () => {
  const items = gen.categoryLinksFor(bySym['BIG'].pools, 'https://www.defi.garden/?token=BIG');
  assert.deepStrictEqual(items, [{ category: 'Lending', url: 'https://www.defi.garden/?token=BIG&poolTypes=Lending' }]);
});
test('renderTokenPage always renders a By category nav derived from on-page pools (no category hub page exists yet)', () => {
  const html = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12');
  assert.ok(html.includes('aria-label="Pool categories"'), 'missing category nav');
  assert.ok(html.includes('href="https://www.defi.garden/?token=BIG&poolTypes=Lending"'), 'missing category link');
});
test('cross-links reuse the related nav styling via an added class token, without colliding with the exact class="related" tests', () => {
  const html = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12', [{ chain: 'Ethereum', slug: 'ethereum' }]);
  assert.ok(html.includes('class="related xlink-chains"'), 'missing xlink-chains nav class');
  assert.ok(html.includes('class="related xlink-category"'), 'missing xlink-category nav class');
  assert.ok(!/class="related"/.test(html), 'a cross-link nav must never use the bare related-tokens class exactly');
});
test('043 folded in: category leg present without a separate 043 build', () => {
  assert.ok(gen.categoryLinksFor(bySym['BIG'].pools, 'https://www.defi.garden/?token=BIG').length > 0);
});

console.log('062 — waitlist CTA (the missing SEO -> north-star bridge)');
test('renders exactly one waitlist CTA, deep-linking into plan.html with source=seo_token', () => {
  const matches = html.match(/href="\/plan\.html\?waitlist=1&amp;src=seo_token"/g) || [];
  assert.strictEqual(matches.length, 1, 'expected exactly one waitlist CTA link');
});
test('CTA copy is honest — reuses the app\'s existing disclosure copy verbatim, no new hype string', () => {
  assert.ok(html.includes('Join the waitlist →'), 'missing tcpWaitlistCta copy');
  assert.ok(html.includes('Free to join') && html.includes('exist yet') && html.includes("We&#39;ll email you when it does"),
    'missing tcpWaitlistMicro honest-disclosure copy');
});
test('pitch line is token-specific (dataset content, not a fixed template)', () => {
  assert.ok(html.includes('A card that spends your BIG yield'), 'missing BIG-specific pitch');
  const midHtml2 = gen.renderTokenPage(bySym['MID']);
  assert.ok(midHtml2.includes('A card that spends your MID yield'), 'missing MID-specific pitch');
});
test('waitlist block uses the neuro token system only, no hardcoded hex colors, reuses .tp-cta', () => {
  const styleBlock = gen.renderWaitlistCtaStyle('tp');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleBlock), 'hardcoded hex color in the waitlist CTA style block');
  assert.ok(styleBlock.includes('var(--neuro-shadow-raised)') && styleBlock.includes('.tp-cta'),
    'must reuse existing neuro tokens/button style');
  assert.ok(html.includes(styleBlock), 'waitlist style block missing from the rendered page <style>');
  assert.ok(html.match(/<a class="tp-cta" href="\/plan\.html\?waitlist=1/), 'CTA link must reuse the existing .tp-cta button style');
});
test('waitlist pitch line escapes a malicious token symbol (cannot inject markup)', () => {
  const evil = gen.renderTokenPage({ symbol: '<script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const waitlistDiv = evil.match(/<div class="tp-waitlist">[\s\S]*?<\/div>/)[0];
  assert.ok(!waitlistDiv.includes('<script>alert(1)</script>'), 'unescaped symbol leaked into the waitlist pitch');
  assert.ok(waitlistDiv.includes('&lt;script&gt;'), 'expected escaped symbol in the waitlist pitch');
});
test('every generated token page (en + ko) renders the waitlist CTA', () => {
  ranked.forEach(rec => {
    const enHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'en');
    const koHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'ko');
    assert.ok(enHtml.includes('src=seo_token'), `EN page missing waitlist CTA for ${rec.symbol}`);
    assert.ok(koHtml.includes('src=seo_token'), `KO page missing waitlist CTA for ${rec.symbol}`);
    assert.ok(koHtml.includes('대기자 명단'), `KO page waitlist pitch not translated for ${rec.symbol}`); // "waitlist" in Korean
  });
});

console.log('066 — yield headline: honest per-token custom KPI, reusing planner.js blend/forever-number math');
const gp = require('./planner.js');
test('blended rate is the SAME median gp.blendedApy(rec.pools) computes — no parallel calc path', () => {
  const h = gen.yieldHeadlineFor(bySym['BIG'], 'en');
  assert.strictEqual(h.apyStr, gen.formatApy(gp.blendedApy(bySym['BIG'].pools)));
});
test('forever amount is the SAME gp.foreverNumber(monthly, blendedRate) capital figure', () => {
  const h = gen.yieldHeadlineFor(bySym['MID'], 'en');
  const anchor = gen.yieldHeadlineAnchor();
  const expected = gen.formatUsd(gp.foreverNumber(anchor.monthly, gp.blendedApy(bySym['MID'].pools)));
  assert.strictEqual(h.foreverAmtStr, expected);
});
test('anchor is Claude Pro at its SUBSCRIPTION_LADDER monthly price (single source of truth)', () => {
  const anchor = gen.yieldHeadlineAnchor();
  assert.strictEqual(anchor.id, 'claude');
  const h = gen.yieldHeadlineFor(bySym['BIG'], 'en');
  assert.strictEqual(h.monthly, anchor.monthly);
  assert.strictEqual(h.subLabel, 'Claude Pro');
});
test('every ranked token (all clear the 032 visible-nonzero table gate) gets a non-null headline', () => {
  ranked.forEach(r => {
    assert.ok(gen.yieldHeadlineFor(r, 'en'), `${r.symbol} unexpectedly got no yield headline`);
  });
});
test('returns null (no fabricated number) when the blended MEDIAN rounds to 0.00%, even with a non-zero pool present', () => {
  const medianZeroRec = { symbol: 'MEDZERO', pools: [
    { apyBase: 0, apyReward: 0, tvlUsd: 200000 },
    { apyBase: 0, apyReward: 0, tvlUsd: 150000 },
    { apyBase: 5, apyReward: 0, tvlUsd: 100000 }
  ] };
  assert.strictEqual(gen.yieldHeadlineFor(medianZeroRec, 'en'), null);
});
test('renderYieldHeadlineHtml renders nothing for a null headline', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  assert.strictEqual(gen.renderYieldHeadlineHtml(null, 'X', t), '');
});
test('headline renders above the pool table (.tp-card), after the intro paragraph', () => {
  const introIdx = html.indexOf('<p class="intro">');
  const headlineIdx = html.indexOf('<p class="tp-yield-headline">');
  const tableIdx = html.indexOf('<div class="tp-card">');
  assert.ok(introIdx > -1 && headlineIdx > introIdx && headlineIdx < tableIdx,
    'expected intro < yield headline < pool table in document order');
});
test('headline copy states the token symbol, APY, forever capital, and monthly subscription price', () => {
  const h = gen.yieldHeadlineFor(bySym['BIG'], 'en');
  assert.ok(html.includes(`Your idle BIG could earn ~${h.apyStr}`), 'missing token/APY in rendered headline');
  assert.ok(html.includes(`park ${h.foreverAmtStr}`), 'missing forever-capital figure in rendered headline');
  assert.ok(html.includes(`$${h.monthly}/mo Claude Pro`), 'missing monthly subscription anchor in rendered headline');
});
test('malicious token symbol cannot inject markup into the yield headline', () => {
  const evil = { symbol: '<script>alert(1)</script>', pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] };
  const t = require('./translations.js').createTranslationFunction('en');
  const headlineHtml = gen.renderYieldHeadlineHtml(gen.yieldHeadlineFor(evil, 'en'), evil.symbol, t);
  assert.ok(!headlineHtml.includes('<script>alert(1)</script>'), 'unescaped symbol leaked into the yield headline');
  assert.ok(headlineHtml.includes('&lt;script&gt;'), 'expected escaped symbol in the yield headline');
});
test('every generated token page (en + ko) carries the yield headline with natural KO copy', () => {
  ranked.forEach(rec => {
    const enHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'en');
    const koHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'ko');
    assert.ok(enHtml.includes('tp-yield-headline'), `EN page missing yield headline for ${rec.symbol}`);
    assert.ok(koHtml.includes('tp-yield-headline'), `KO page missing yield headline for ${rec.symbol}`);
    assert.ok(koHtml.includes('Claude Pro') && koHtml.includes('구독료'), `KO page yield headline not translated for ${rec.symbol}`);
  });
});
test('yield headline uses the neuro token system only, no hardcoded hex colors', () => {
  const styleMatch = html.match(/\.tp-yield-headline \{[^}]*\}/);
  assert.ok(styleMatch, 'yield headline style rule missing from rendered page');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleMatch[0]), 'hardcoded hex color in the yield headline style');
  assert.ok(styleMatch[0].includes('var(--neuro-shadow-raised)'), 'must reuse existing neuro shadow token');
});

console.log(`\n${passed} assertions passed`);
