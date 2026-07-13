/* Unit tests for the static chain-page generator (spec 041).
   Runs the generator's pure functions against a crafted fixture and asserts
   on the real emitted HTML. Run: node test_chain_pages.js

   Eligibility (mirrors 014's amended rule, reused via isQualifyingPool):
   a chain earns a page if it has >=1 pool with TVL >= $100K that is NOT
   anomalous (>1000% APY). No minimum pool count, no cap by default. The
   anomaly exclusion is a trust rail (shared with generate-token-pages.js). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gen = require('./generate-chain-pages.js');
const tp = require('./generate-token-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Fixture branches (test_fixtures/pools-chain-sample.json):
// Big         : 3 pools (500M/300M/100M), 3 distinct tokens -> qualifies, rank #1
// Mid         : 1 pool ($5M)                                -> qualifies (single pool ok), rank #2
// Multi Chain : 1 pool ($3M), space in name                 -> qualifies, slug safety, rank #3, shares token AAA with Big
// Anom        : 1 real ($2M) + 1 anomalous ($900M @2100%)   -> anomaly excluded, qualifies via the $2M pool, rank #4
// Dust        : 1 pool ($50K)                                -> dropped (below $100K floor, no entry at all)
// Zero        : 2 pools ($50M+$30M), all 0% APY              -> dropped (quality bar, all shown are 0.00%)
// Tiny        : 1 pool ($2.72M @ 0.003%, rounds to 0.00%)    -> dropped (032-style rounding gate)
// Trunc       : 8 zero-APY pools (13-20M) + 1 real-yield pool ($200K, ranked #9) -> dropped (033-style truncation)
const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-chain-sample.json'), 'utf8'));
const ranked = gen.rankTopChains(pools); // no cap
const byChain = Object.fromEntries(ranked.map(r => [r.chain, r]));
const tokenRanked = tp.rankTopTokens(pools); // same fixture pools, real token-side ranking (049)
const generatedTokenSlugs = new Set(tokenRanked.map(t => t.slug));

console.log('rankTopChains — $100K floor, >=1 pool, no cap');
test('emits every chain with >=1 qualifying pool; drops sub-floor/thin chains', () => {
  assert.deepStrictEqual(ranked.map(r => r.chain).sort(), ['Anom', 'Big', 'Mid', 'Multi Chain']);
});
test('single-pool chains are included (no >=2 minimum)', () => {
  assert.strictEqual(byChain['Mid'].qualifyingCount, 1);
  assert.strictEqual(byChain['Multi Chain'].qualifyingCount, 1);
});
test('chain with pools but ALL 0% yield is dropped (quality bar — Zero)', () => {
  assert.ok(!byChain['Zero'], 'an all-0%-APY chain must not get an indexed page');
});
test('chain whose only pool rounds to 0.00% is dropped (Tiny, 0.003% APY)', () => {
  assert.ok(!byChain['Tiny'], 'a chain whose APY displays 0.00% must not get an indexed page');
});
test('chain whose real-yield pool is beyond POOLS_PER_PAGE is dropped (Trunc, truncation)', () => {
  assert.ok(!byChain['Trunc'], 'a chain whose displayed table is all 0.00% must not get an indexed page');
});
test('chain whose only pool is below the $100K floor gets no entry at all (Dust)', () => {
  assert.ok(!byChain['Dust'], 'a sub-floor-only chain must not appear in rankTopChains output');
});
test('every generated chain DISPLAYS >=1 visible non-zero yield (gate matches the shown table)', () => {
  ranked.forEach(r => assert.ok(r.pools.some(p => tp.formatApy(tp.poolTotalApy(p)) !== '0.00%'),
    r.chain + ' shows all 0.00% APY in its rendered table'));
});
test('ranks by aggregate qualifying TVL desc', () => {
  assert.deepStrictEqual(ranked.map(r => r.chain), ['Big', 'Mid', 'Multi Chain', 'Anom']);
});

console.log('trust rail — anomaly exclusion (reused via isQualifyingPool, untouched)');
test('anomalous pool excluded from content AND count AND TVL (Anom)', () => {
  assert.strictEqual(byChain['Anom'].qualifyingCount, 1, 'anomalous pool must not be counted');
  assert.strictEqual(byChain['Anom'].totalTvl, 2000000, 'anomalous $900M pool must not inflate TVL');
  assert.strictEqual(byChain['Anom'].pools.length, 1);
  assert.ok(!byChain['Anom'].tokens.includes('FFF'), 'anomalous pool\'s token must not enter the chain\'s token diversity count');
});
test('no rendered pool anywhere is anomalous (>1000% total APY)', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok(tp.poolTotalApy(p) <= gen.APY_SANITY_LIMIT, r.chain + ' has an anomalous pool');
  }));
});
test('every rendered pool clears the $100K floor', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok((p.tvlUsd || 0) >= gen.MIN_POOL_TVL, r.chain + ' has a sub-floor pool');
  }));
});

console.log('cap handling');
test('no cap by default returns all eligible chains', () => {
  assert.strictEqual(gen.rankTopChains(pools).length, 4);
  assert.strictEqual(gen.rankTopChains(pools, 0).length, 4);
});
test('explicit --limit caps to top-N by TVL (limit=1 -> Big)', () => {
  const top1 = gen.rankTopChains(pools, 1);
  assert.strictEqual(top1.length, 1);
  assert.strictEqual(top1[0].chain, 'Big');
});

console.log('chainSlug (reused tokenSlug) — URL/filesystem safety');
test('chain name with a space slugs to a dash-safe form', () => {
  assert.strictEqual(byChain['Multi Chain'].slug, 'multi-chain');
});
test('slug has no unsafe chars for every ranked chain', () => {
  ranked.forEach(r => assert.ok(/^[a-z0-9-]+$/.test(r.slug), 'bad slug: ' + r.slug));
});

console.log('renderChainPage — server-delivered SEO content');
const html = gen.renderChainPage(byChain['Big']);
test('self-canonical to /chains/<slug> (not the ?chain= app URL)', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/chains/big">'), 'missing self-canonical');
});
test('server-delivered <title> present in raw HTML (no JS)', () => {
  assert.ok(/<title>Big DeFi Yields[^<]*<\/title>/.test(html), 'missing title');
});
test('server-delivered meta description present', () => {
  assert.ok(/<meta name="description" content="[^"]+">/.test(html), 'missing description');
});
test('links into the live app at ?chain=<Chain>', () => {
  assert.ok(html.includes('https://www.defi.garden/?chain=Big'), 'missing app deep link');
});
test('each pool row links to its detail page (/?pool=<id>) and shows its token', () => {
  const top = byChain['Big'].pools[0];
  assert.ok(top.pool, 'fixture pool missing an id');
  assert.ok(html.includes(`href="https://www.defi.garden/?pool=${encodeURIComponent(top.pool)}"`),
    'pool row not linked to its detail page');
  assert.ok(html.includes('class="cp-pool-link"'), 'missing pool link class');
  assert.ok(html.includes('<td>AAA</td>'), 'missing token column value');
});
test('pool row falls back to the chain app view when a pool has no id', () => {
  const noId = gen.renderChainPage({ chain: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7, tokens: ['Y'],
    pools: [{ symbol: 'Y', project: 'aave', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0 }] });
  assert.ok(noId.includes('href="https://www.defi.garden/?chain=X"'), 'missing fallback link');
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
  const midHtml = gen.renderChainPage(byChain['Mid']);
  assert.ok(/1 live pool above/.test(midHtml), 'expected singular "pool"');
});
test('HTML is escaped (malicious project name cannot inject markup)', () => {
  const evil = gen.renderChainPage({ chain: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7, tokens: ['Y'],
    pools: [{ symbol: 'Y', project: '<script>alert(1)</script>', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0 }] });
  assert.ok(!evil.includes('<script>alert(1)</script>'), 'unescaped project name leaked into HTML');
  assert.ok(evil.includes('&lt;script&gt;'), 'expected escaped project name');
});
test('content differs from a bare re-render of the ?chain= app view (written intro is chain-specific)', () => {
  assert.ok(/class="intro"/.test(html), 'no intro block');
  assert.ok(html.includes("Big's largest live pool is aave-v3"), 'intro not chain-specific');
});

console.log('BreadcrumbList JSON-LD (040 pattern)');
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
test('breadcrumb items: Home (linked), Chains (unlinked — no real hub page), <Chain> (linked, self-canonical)', () => {
  const items = extractLdJsonBlocks(html, 'BreadcrumbList')[0].itemListElement;
  assert.strictEqual(items[0].position, 1);
  assert.strictEqual(items[0].name, 'Home');
  assert.strictEqual(items[0].item, 'https://www.defi.garden/');
  assert.strictEqual(items[1].position, 2);
  assert.strictEqual(items[1].name, 'Chains');
  assert.ok(!('item' in items[1]), 'Chains has no hub page in this repo — must not link a 404');
  assert.strictEqual(items[2].position, 3);
  assert.strictEqual(items[2].name, 'Big');
  assert.strictEqual(items[2].item, 'https://www.defi.garden/chains/big', 'must match the page\'s own canonical URL');
});
test('malicious chain name cannot break out of the ld+json script tag', () => {
  const evil = gen.renderChainPage({ chain: '</script><script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, tokens: ['Y'], pools: [{ symbol: 'Y', project: 'aave', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const blocks = extractLdJsonBlocks(evil, 'BreadcrumbList');
  assert.strictEqual(blocks.length, 1, 'BreadcrumbList block must still parse as valid JSON');
  assert.strictEqual(blocks[0].itemListElement[2].name, '</script><script>alert(1)</script>', 'JSON-LD name must still equal the raw chain name once parsed');
});

console.log('046 — ItemList + Dataset JSON-LD');
test('exactly one valid ItemList block whose items EXACTLY match the visible table rows', () => {
  const blocks = extractLdJsonBlocks(html, 'ItemList');
  assert.strictEqual(blocks.length, 1, 'expected exactly one ItemList block');
  const items = blocks[0].itemListElement;
  const big = byChain['Big'];
  assert.strictEqual(items.length, big.pools.length, 'ItemList item count must match the visible row count');
  big.pools.forEach((p, i) => {
    assert.strictEqual(items[i].position, i + 1, 'position must match row order');
    assert.strictEqual(items[i].name, `${p.project} on ${p.chain}`, 'name must match project/chain shown in the row');
    const expectedUrl = p.pool
      ? `https://www.defi.garden/?pool=${encodeURIComponent(p.pool)}`
      : `https://www.defi.garden/?chain=${encodeURIComponent(big.chain)}`;
    assert.strictEqual(items[i].url, expectedUrl, 'url must match the row\'s own link target');
    assert.ok(html.includes(`href="${items[i].url}"`), 'ItemList url must actually appear as a rendered row link');
  });
});
test('exactly one valid Dataset block with required schema.org properties', () => {
  const blocks = extractLdJsonBlocks(html, 'Dataset');
  assert.strictEqual(blocks.length, 1, 'expected exactly one Dataset block');
  const d = blocks[0];
  assert.ok(d.name && typeof d.name === 'string', 'missing Dataset.name');
  assert.ok(d.description && typeof d.description === 'string', 'missing Dataset.description');
  assert.strictEqual(d.url, 'https://www.defi.garden/chains/big', 'Dataset.url must be the page\'s own canonical URL');
  assert.strictEqual(d.publisher['@type'], 'Organization');
  assert.strictEqual(d.publisher.name, 'DeFi Garden');
  assert.strictEqual(d.creator['@type'], 'Organization');
  assert.ok(d.dateModified, 'missing Dataset.dateModified');
});
test('Dataset name/description are chain-specific (dataset content, not a fixed template)', () => {
  const midHtml = gen.renderChainPage(byChain['Mid'], [], '2026-07-12');
  const midDataset = extractLdJsonBlocks(midHtml, 'Dataset')[0];
  assert.ok(midDataset.name.includes('Mid'), 'Dataset.name should be chain-specific');
  assert.notStrictEqual(midDataset.name, extractLdJsonBlocks(html, 'Dataset')[0].name);
});
test('generatedDate param controls Dataset.dateModified (defaults to today if omitted)', () => {
  const dated = gen.renderChainPage(byChain['Big'], [], '2020-01-01');
  assert.strictEqual(extractLdJsonBlocks(dated, 'Dataset')[0].dateModified, '2020-01-01');
});

console.log('048 — freshness signal: visible "Last updated" + Dataset.dateModified match');
test('renders a visible "Last updated <date>" line', () => {
  const dated = gen.renderChainPage(byChain['Big'], [], '2026-07-12');
  assert.ok(dated.includes('Last updated 2026-07-12'), 'missing visible "Last updated" line');
});
test('visible "Last updated" date is byte-for-byte identical to Dataset.dateModified', () => {
  const dated = gen.renderChainPage(byChain['Big'], [], '2026-07-12');
  const dateModified = extractLdJsonBlocks(dated, 'Dataset')[0].dateModified;
  assert.ok(dated.includes(`Last updated ${dateModified}`), 'visible date and Dataset.dateModified must match byte-for-byte');
});
test('default (no generatedDate passed) still renders a "Last updated" line', () => {
  assert.ok(/Last updated .+/.test(html), 'default-dated page missing visible "Last updated" line');
});
test('malicious project name cannot break out of the ItemList ld+json script tag', () => {
  const evil = gen.renderChainPage({ chain: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7, tokens: ['Y'],
    pools: [{ symbol: 'Y', project: '</script><script>alert(1)</script>', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] }, [], '2026-07-12');
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const items = extractLdJsonBlocks(evil, 'ItemList')[0].itemListElement;
  assert.strictEqual(items[0].name, '</script><script>alert(1)</script> on X', 'ItemList name must still equal the raw project name once parsed');
});
test('no visible content/meta/canonical/trust rail altered — only ld+json script blocks added', () => {
  const stripLdJson = (s) => s.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  const before = stripLdJson(gen.renderChainPage(byChain['Big'], gen.relatedChainsFor(byChain['Big'], ranked), '2026-07-12'));
  assert.ok(before.includes('<title>Big DeFi Yields'), 'title missing/changed');
  assert.ok(before.includes('<link rel="canonical" href="https://www.defi.garden/chains/big">'), 'canonical missing/changed');
  assert.ok(before.includes('content="index,follow"'), 'robots meta missing/changed');
  assert.ok(/class="related"/.test(before), 'related nav missing');
  assert.ok(before.includes('Analytics.trackPageView("/chains/big"'), 'analytics bootstrap missing');
});

console.log('related chains — internal linking');
test('relatedChainsFor prefers co-token chains, excludes self, is slug-linkable', () => {
  const rel = gen.relatedChainsFor(byChain['Big'], ranked);
  assert.ok(rel.length >= 1, 'no related chains');
  assert.ok(!rel.some(r => r.chain === 'Big'), 'self appeared in related');
  // Big shares token AAA with "Multi Chain" -> co-token first, ahead of Mid/Anom by TVL alone
  assert.strictEqual(rel[0].chain, 'Multi Chain', 'expected the co-token chain first');
});
test('page renders a Related chains nav with internal /chains/ links', () => {
  const big = gen.renderChainPage(byChain['Big'], gen.relatedChainsFor(byChain['Big'], ranked));
  assert.ok(/class="related"/.test(big), 'no related nav');
  assert.ok(big.includes('href="https://www.defi.garden/chains/multi-chain"'), 'no internal chain link');
});
test('no self-link inside the related nav', () => {
  const big = gen.renderChainPage(byChain['Big'], gen.relatedChainsFor(byChain['Big'], ranked));
  const nav = big.match(/<nav class="related"[\s\S]*?<\/nav>/)[0];
  assert.ok(!nav.includes('/chains/big"'), 'related nav links back to its own page');
});
test('related nav omitted when there are no related chains', () => {
  const solo = gen.renderChainPage(byChain['Big'], []);
  assert.ok(!/class="related"/.test(solo), 'related nav should be absent with no related chains');
});

console.log('renderChainSitemap');
test('emits a valid urlset with one <loc> per ranked chain', () => {
  const xml = gen.renderChainSitemap(ranked, '2026-07-12');
  assert.ok(xml.startsWith('<?xml'), 'missing xml decl');
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'missing urlset');
  const locs = (xml.match(/<loc>/g) || []).length;
  assert.strictEqual(locs, ranked.length, 'one loc per chain');
});
test('sitemap URLs point at the static /chains/<slug> pages', () => {
  const xml = gen.renderChainSitemap(ranked, '2026-07-12');
  assert.ok(xml.includes('<loc>https://www.defi.garden/chains/big</loc>'), 'missing chain URL');
  assert.ok(xml.includes('<lastmod>2026-07-12</lastmod>'), 'missing lastmod');
});
test('empty ranked list still yields a well-formed (empty) urlset', () => {
  const xml = gen.renderChainSitemap([], '2026-07-12');
  assert.ok(xml.includes('<urlset') && xml.includes('</urlset>'), 'not well-formed');
  assert.strictEqual((xml.match(/<loc>/g) || []).length, 0);
});

console.log('analytics bootstrap (reused from generate-token-pages.js, 039 pattern)');
test('every generated chain page wires the analytics bootstrap with its own slug/chain/count', () => {
  const big = gen.renderChainPage(byChain['Big'], gen.relatedChainsFor(byChain['Big'], ranked));
  assert.ok(big.includes('Analytics.trackPageView("/chains/big"'), 'Big page missing its trackPageView call');
  assert.ok(big.includes('"page_type":"chain_landing"'), 'Big page missing page_type property');
  assert.ok(big.includes('"chain":"Big"'), 'Big page missing chain property');
  assert.ok(big.includes(`"pool_count":${byChain['Big'].qualifyingCount}`), 'Big page pool_count mismatch');
});
test('analytics bootstrap sits inside <head>, before </head>, after the scoped <style> block', () => {
  const big = gen.renderChainPage(byChain['Big'], gen.relatedChainsFor(byChain['Big'], ranked));
  const styleEnd = big.indexOf('</style>');
  const bootstrapIdx = big.indexOf('Analytics.trackPageView');
  const headEnd = big.indexOf('</head>');
  assert.ok(styleEnd < bootstrapIdx && bootstrapIdx < headEnd, 'analytics bootstrap misplaced relative to <style>/</head>');
});

console.log('047 — direct-answer block + FAQPage (GEO/AEO)');
test('renders a visible direct-answer block right after the H1, before the pool table', () => {
  const h1Idx = html.indexOf('<h1>');
  const answerIdx = html.indexOf('class="cp-answer"');
  const tableIdx = html.indexOf('<table>');
  assert.ok(answerIdx > h1Idx && answerIdx < tableIdx, 'answer block misplaced relative to H1/table');
});
test('answer block answers the head query using only gated data already on the page', () => {
  const big = byChain['Big'];
  const answerText = html.match(/class="cp-answer">([^<]*)</)[1];
  assert.ok(answerText.includes('Big'), 'answer must name the chain');
  assert.ok(answerText.includes(tp.formatApy(tp.poolTotalApy(big.pools[0]))), 'answer must cite the top pool\'s real APY');
  assert.ok(answerText.includes(String(big.qualifyingCount)), 'answer must cite the real qualifying pool count');
  assert.ok(answerText.includes('$100K TVL floor') && answerText.includes('anomalous'), 'answer must disclose the trust filters');
});
test('renders a visible FAQPage Q&A block with 2-4 items', () => {
  const items = html.match(/<div class="cp-faq-item">/g) || [];
  assert.ok(items.length >= 2 && items.length <= 4, 'expected 2-4 visible FAQ items, got ' + items.length);
});
test('FAQPage JSON-LD mainEntity is byte-for-byte the visible question/answer text (040 kevin invariant)', () => {
  const blocks = extractLdJsonBlocks(html, 'FAQPage');
  assert.strictEqual(blocks.length, 1, 'expected exactly one FAQPage block');
  const mainEntity = blocks[0].mainEntity;
  assert.ok(mainEntity.length >= 2 && mainEntity.length <= 4);
  const qMatches = [...html.matchAll(/<h3 class="cp-faq-q">([^<]*)<\/h3>/g)].map(m => m[1]);
  const aMatches = [...html.matchAll(/<p class="cp-faq-a">([^<]*)<\/p>/g)].map(m => m[1]);
  mainEntity.forEach((item, i) => {
    const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    assert.strictEqual(item.name, decode(qMatches[i]), 'FAQ question text mismatch at index ' + i);
    assert.strictEqual(item.acceptedAnswer.text, decode(aMatches[i]), 'FAQ answer text mismatch at index ' + i);
    assert.strictEqual(item['@type'], 'Question');
    assert.strictEqual(item.acceptedAnswer['@type'], 'Answer');
  });
});
test('trust rail: neither the answer block nor the FAQ ever cites an anomalous or sub-floor pool (Anom fixture)', () => {
  const anomHtml = gen.renderChainPage(byChain['Anom']);
  assert.ok(!anomHtml.includes('degenfarm'), 'anomalous pool project name leaked into the page');
  assert.ok(!anomHtml.includes('1,500.00%') && !anomHtml.includes('2,100.00%'), 'anomalous APY leaked into the page');
  const answerText = anomHtml.match(/class="cp-answer">([^<]*)</)[1];
  assert.ok(answerText.includes('realpool'), 'answer should cite the real (non-anomalous) top pool');
  assert.ok(answerText.includes('1 pool'), 'Anom has exactly 1 qualifying (non-anomalous) pool');
});
test('answer/FAQ content differs per chain (dataset content, not a fixed template)', () => {
  const midHtml = gen.renderChainPage(byChain['Mid']);
  const bigAnswer = html.match(/class="cp-answer">([^<]*)</)[1];
  const midAnswer = midHtml.match(/class="cp-answer">([^<]*)</)[1];
  assert.notStrictEqual(bigAnswer, midAnswer, 'answer block is identical across chains');
});
test('malicious chain name cannot break out of the FAQPage ld+json script tag', () => {
  const evil = gen.renderChainPage({ chain: '</script><script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, tokens: ['Y'], pools: [{ symbol: 'Y', project: 'aave', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const faq = extractLdJsonBlocks(evil, 'FAQPage')[0];
  assert.ok(faq.mainEntity[0].name.includes('</script><script>alert(1)</script>'), 'FAQ question must still contain the raw chain name once parsed');
});
test('no pre-existing content/meta/canonical/trust rail altered — answer+FAQ are additive only', () => {
  assert.ok(html.includes('<title>Big DeFi Yields'), 'title missing/changed');
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/chains/big">'), 'canonical missing/changed');
  assert.ok(html.includes('content="index,follow"'), 'robots meta missing/changed');
  assert.ok(/class="related"/.test(gen.renderChainPage(byChain['Big'], gen.relatedChainsFor(byChain['Big'], ranked))), 'related nav missing');
});

console.log('049 — cross-surface linking: chain -> token');
test('topTokensOnChain links only tokens with a generated page, ranked by on-chain TVL desc (no dead links)', () => {
  // Big's displayed table: AAA (500M), BBB (300M), CCC (100M).
  const links = gen.topTokensOnChain(byChain['Big'], new Set(['aaa', 'bbb']));
  assert.deepStrictEqual(links, [{ symbol: 'AAA', slug: 'aaa' }, { symbol: 'BBB', slug: 'bbb' }]);
});
test('topTokensOnChain excludes a slug outside the given generated set', () => {
  const links = gen.topTokensOnChain(byChain['Big'], new Set(['aaa'])); // BBB/CCC excluded on purpose
  assert.deepStrictEqual(links, [{ symbol: 'AAA', slug: 'aaa' }]);
});
test('topTokensOnChain respects the cap', () => {
  const links = gen.topTokensOnChain(byChain['Big'], new Set(['aaa', 'bbb', 'ccc']), 2);
  assert.deepStrictEqual(links.map(l => l.symbol), ['AAA', 'BBB']);
});
test('against the real cross-fixture ranking, topTokensOnChain never links an ungenerated token slug', () => {
  ranked.forEach(rec => {
    gen.topTokensOnChain(rec, generatedTokenSlugs).forEach(l =>
      assert.ok(generatedTokenSlugs.has(l.slug), `dead link to ungenerated token ${l.slug}`));
  });
});
test('renderChainPage renders a Top tokens nav from tokenLinks, omitted when there are none', () => {
  const withLinks = gen.renderChainPage(byChain['Big'], [], '2026-07-12', [{ symbol: 'AAA', slug: 'aaa' }]);
  assert.ok(withLinks.includes('aria-label="Top tokens on Big"'), 'missing token nav');
  assert.ok(withLinks.includes('href="https://www.defi.garden/tokens/aaa"'), 'missing token link');
  const noLinks = gen.renderChainPage(byChain['Big'], [], '2026-07-12', []);
  assert.ok(!noLinks.includes('aria-label="Top tokens on Big"'), 'token nav should be absent with no token links');
});

console.log('049 — cross-surface linking: category leg (folds in 043)');
test('renderChainPage always renders a By category nav derived from on-page pools (no category hub page exists yet)', () => {
  const html = gen.renderChainPage(byChain['Big'], [], '2026-07-12');
  assert.ok(html.includes('aria-label="Pool categories"'), 'missing category nav');
  assert.ok(html.includes('href="https://www.defi.garden/?chain=Big&poolTypes=Lending"'), 'missing Lending category link');
  assert.ok(html.includes(`href="https://www.defi.garden/?chain=Big&poolTypes=${encodeURIComponent('LP/DEX')}"`), 'missing LP/DEX category link');
});
test('cross-links reuse the related nav styling via an added class token, without colliding with the exact class="related" tests', () => {
  const html = gen.renderChainPage(byChain['Big'], [], '2026-07-12', [{ symbol: 'AAA', slug: 'aaa' }]);
  assert.ok(html.includes('class="related xlink-tokens"'), 'missing xlink-tokens nav class');
  assert.ok(html.includes('class="related xlink-category"'), 'missing xlink-category nav class');
  assert.ok(!/class="related"/.test(html), 'a cross-link nav must never use the bare related-chains class exactly');
});

console.log('062 — waitlist CTA (the missing SEO -> north-star bridge)');
test('renders exactly one waitlist CTA, deep-linking into plan.html with source=seo_chain', () => {
  const matches = html.match(/href="\/plan\.html\?waitlist=1&amp;src=seo_chain"/g) || [];
  assert.strictEqual(matches.length, 1, 'expected exactly one waitlist CTA link');
});
test('CTA copy is honest — reuses the app\'s existing disclosure copy verbatim, no new hype string', () => {
  assert.ok(html.includes('Join the waitlist →'), 'missing tcpWaitlistCta copy');
  assert.ok(html.includes('Free to join') && html.includes('exist yet') && html.includes("We&#39;ll email you when it does"),
    'missing tcpWaitlistMicro honest-disclosure copy');
});
test('pitch line is chain-specific (dataset content, not a fixed template)', () => {
  assert.ok(html.includes('A card that spends the yield from your Big positions'), 'missing Big-specific pitch');
  const midHtml = gen.renderChainPage(byChain['Mid'], [], '2026-07-12');
  assert.ok(midHtml.includes('A card that spends the yield from your Mid positions'), 'missing Mid-specific pitch');
});
test('waitlist block uses the neuro token system only, no hardcoded hex colors, reuses .cp-cta', () => {
  const styleBlock = tp.renderWaitlistCtaStyle('cp');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleBlock), 'hardcoded hex color in the waitlist CTA style block');
  assert.ok(styleBlock.includes('var(--neuro-shadow-raised)') && styleBlock.includes('.cp-cta'),
    'must reuse existing neuro tokens/button style');
  assert.ok(html.includes(styleBlock), 'waitlist style block missing from the rendered page <style>');
  assert.ok(html.match(/<a class="cp-cta" href="\/plan\.html\?waitlist=1/), 'CTA link must reuse the existing .cp-cta button style');
});
test('every generated chain page (en + ko) renders the waitlist CTA', () => {
  ranked.forEach(rec => {
    const enHtml = gen.renderChainPage(rec, [], '2026-07-12', [], 'en');
    const koHtml = gen.renderChainPage(rec, [], '2026-07-12', [], 'ko');
    assert.ok(enHtml.includes('src=seo_chain'), `EN page missing waitlist CTA for ${rec.chain}`);
    assert.ok(koHtml.includes('src=seo_chain'), `KO page missing waitlist CTA for ${rec.chain}`);
    assert.ok(koHtml.includes('대기자 명단'), `KO page waitlist pitch not translated for ${rec.chain}`); // "waitlist" in Korean
  });
});

console.log(`\n${passed} assertions passed`);
