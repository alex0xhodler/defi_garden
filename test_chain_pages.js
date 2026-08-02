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
const os = require('os');
const gen = require('./generate-chain-pages.js');
const tp = require('./generate-token-pages.js');

// --- 174 scratch-run harness (mirrors test_token_pages.js's helper) ---------
// Spec 174's own acceptance test is "the verifier changes MIN_POOL_TVL in a
// scratch run and observes the copy change with it." This writes patched
// COPIES of the two generators (source text, relative requires rewritten to
// absolute paths so the copies still resolve sibling modules from a scratch
// temp dir) with MIN_POOL_TVL literally edited, `require()`s those copies
// fresh, and renders real pages — catching any template that still carries a
// hardcoded floor literal instead of interpolating the constant.
function rewriteRequiresToAbsolute(src, dir, overrides) {
  return src.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, relPath) => {
    const abs = (overrides && overrides[relPath]) || path.join(dir, relPath);
    return `require(${q}${abs.replace(/\\/g, '/')}${q})`;
  });
}
function loadScratchGenerators(newFloor) {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-174-scratch-'));
  const tokenSrc = fs.readFileSync(path.join(__dirname, 'generate-token-pages.js'), 'utf8');
  const patchedMarker = `const MIN_POOL_TVL = ${newFloor};`;
  const patchedTokenSrc = rewriteRequiresToAbsolute(
    tokenSrc.replace('const MIN_POOL_TVL = 100000;', patchedMarker), __dirname);
  assert.ok(patchedTokenSrc.includes(patchedMarker), 'failed to patch MIN_POOL_TVL in the scratch token generator');
  const tokenScratchPath = path.join(scratchDir, 'generate-token-pages.js');
  fs.writeFileSync(tokenScratchPath, patchedTokenSrc);

  const chainSrc = fs.readFileSync(path.join(__dirname, 'generate-chain-pages.js'), 'utf8');
  const patchedChainSrc = rewriteRequiresToAbsolute(chainSrc, __dirname,
    { './generate-token-pages.js': tokenScratchPath.replace(/\\/g, '/') });
  const chainScratchPath = path.join(scratchDir, 'generate-chain-pages.js');
  fs.writeFileSync(chainScratchPath, patchedChainSrc);

  return { tokenGen: require(tokenScratchPath), chainGen: require(chainScratchPath), scratchDir };
}
function cleanupScratch(scratchDir) {
  Object.keys(require.cache).forEach(k => { if (k.startsWith(scratchDir)) delete require.cache[k]; });
  fs.rmSync(scratchDir, { recursive: true, force: true });
}

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
test('each pool row links to its detail page (/?pool=<id>&src=seo_chain — 203) and shows its token', () => {
  const top = byChain['Big'].pools[0];
  assert.ok(top.pool, 'fixture pool missing an id');
  assert.ok(html.includes(`href="https://www.defi.garden/?pool=${encodeURIComponent(top.pool)}&src=seo_chain"`),
    'pool row not linked to its detail page with the seo_chain attribution tag');
  assert.ok(html.includes('class="cp-pool-link"'), 'missing pool link class');
  assert.ok(html.includes('<td>AAA</td>'), 'missing token column value');
});
test('pool row falls back to the chain app view (tagged src=seo_chain — 203) when a pool has no id', () => {
  const noId = gen.renderChainPage({ chain: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7, tokens: ['Y'],
    pools: [{ symbol: 'Y', project: 'aave', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0 }] });
  // 173: the fallback link is the same appUrl the primary CTA uses, so it now
  // carries the generator's own &minTvl= floor too. 203: the fallback branch
  // is tagged exactly like the ?pool= branch — a row that falls back to the
  // chain app view is the same attribution question, must not go untagged.
  assert.ok(noId.includes(`href="https://www.defi.garden/?chain=X&minTvl=${gen.MIN_POOL_TVL}&src=seo_chain"`), 'missing tagged fallback link');
});
test('203 criterion 1: every cp-pool-link href carries src=seo_chain, and the count equals the visible row count', () => {
  const anchors = html.match(/<a class="cp-pool-link" href="[^"]*"/g) || [];
  assert.strictEqual(anchors.length, byChain['Big'].pools.length, 'cp-pool-link anchor count must equal the visible row count');
  assert.ok(anchors.length > 0, 'fixture wiring check: expected >=1 cp-pool-link anchor');
  anchors.forEach((a) => assert.ok(/[?&]src=seo_chain"$/.test(a), `every cp-pool-link href must carry src=seo_chain; got: ${a}`));
});
test('203 criterion 2: poolHrefFor(p, fallback) with NO third argument is byte-identical to the pre-203 function, both branches (shared with token pages, re-verified via the chain-page import)', () => {
  const withId = { pool: 'abc-123' };
  assert.strictEqual(tp.poolHrefFor(withId, 'https://www.defi.garden/?chain=X&minTvl=100000'),
    'https://www.defi.garden/?pool=abc-123', 'pool-branch output must be byte-identical with no src arg');
  const noId = {};
  assert.strictEqual(tp.poolHrefFor(noId, 'https://www.defi.garden/?chain=X&minTvl=100000'),
    'https://www.defi.garden/?chain=X&minTvl=100000', 'fallback-branch output must be byte-identical with no src arg');
  [undefined, '', null, 0].forEach((falsySrc) => {
    assert.strictEqual(tp.poolHrefFor(withId, 'https://www.defi.garden/?chain=X&minTvl=100000', falsySrc),
      'https://www.defi.garden/?pool=abc-123', `falsy src (${JSON.stringify(falsySrc)}) must not tag the url`);
  });
});
test('203 criterion 2: no ld+json block anywhere in generated output contains "src=" — JSON-LD stays clean', () => {
  const ldJsonScripts = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  assert.ok(ldJsonScripts.length > 0, 'fixture wiring check: expected >=1 ld+json block');
  ldJsonScripts.forEach((block) => assert.ok(!/src=/.test(block), `ld+json block must never carry src=; got: ${block}`));
});
test('203 criterion 2: every ItemList url matches the clean pattern (no src, no other tracking param)', () => {
  const items = extractLdJsonBlocks(html, 'ItemList')[0].itemListElement;
  items.forEach((it) => assert.ok(/^https:\/\/www\.defi\.garden\/\?pool=[^&]+$/.test(it.url) || it.url === `https://www.defi.garden/?chain=${encodeURIComponent(byChain['Big'].chain)}`,
    `ItemList url must be clean (no src); got: ${it.url}`));
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
    assert.strictEqual(items[i].url, expectedUrl, 'url must match the row\'s own link target (clean, no src)');
    // 203 criterion 5 (replaces the old "href includes the clean url" check,
    // strictly stronger): the ItemList url must be clean AND the rendered
    // row href must be EXACTLY that clean url + the src attribution tag.
    const sep = items[i].url.includes('?') ? '&' : '?';
    const expectedRowHref = `${items[i].url}${sep}src=seo_chain`;
    assert.ok(html.includes(`href="${expectedRowHref}"`),
      `rendered row href must be exactly the clean ItemList url + src=seo_chain; expected href="${expectedRowHref}"`);
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
  // 173: categoryLinksFor builds off appUrl, which now carries the generator's
  // own &minTvl= floor — so the category link inherits it too (single
  // injection site, no re-typed literal).
  // 204: the category link is a visible estate->app render site, so it now
  // carries the estate's arrival tag (&src=seo_chain) via withSrc.
  assert.ok(html.includes(`href="https://www.defi.garden/?chain=Big&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending&src=seo_chain"`), 'missing Lending category link');
  assert.ok(html.includes(`href="https://www.defi.garden/?chain=Big&minTvl=${gen.MIN_POOL_TVL}&poolTypes=${encodeURIComponent('LP/DEX')}&src=seo_chain"`), 'missing LP/DEX category link');
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
test('waitlist pitch line escapes a malicious chain name (cannot inject markup)', () => {
  const evil = gen.renderChainPage({ chain: '<script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, tokens: ['Y'], pools: [{ symbol: 'Y', project: 'aave', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const waitlistDiv = evil.match(/<div class="cp-waitlist">[\s\S]*?<\/div>/)[0];
  assert.ok(!waitlistDiv.includes('<script>alert(1)</script>'), 'unescaped chain name leaked into the waitlist pitch');
  assert.ok(waitlistDiv.includes('&lt;script&gt;'), 'expected escaped chain name in the waitlist pitch');
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

console.log('075 — yield headline: honest per-chain custom KPI, reusing the token generator\'s shared blend/forever-number helper');
const gp = require('./planner.js');
test('blended rate is the SAME median gp.blendedApy(rec.pools) computes — no parallel calc path, not bestApy', () => {
  const h = tp.yieldHeadlineFor(byChain['Big'], 'en');
  assert.strictEqual(h.apyStr, tp.formatApy(gp.blendedApy(byChain['Big'].pools)));
});
test('forever amount is the SAME gp.foreverNumber(monthly, blendedRate) capital figure', () => {
  const h = tp.yieldHeadlineFor(byChain['Mid'], 'en');
  const anchor = tp.yieldHeadlineAnchor();
  const expected = tp.formatUsd(gp.foreverNumber(anchor.monthly, gp.blendedApy(byChain['Mid'].pools)));
  assert.strictEqual(h.foreverAmtStr, expected);
});
test('anchor is Claude Pro at its SUBSCRIPTION_LADDER monthly price (single source of truth)', () => {
  const anchor = tp.yieldHeadlineAnchor();
  assert.strictEqual(anchor.id, 'claude');
  const h = tp.yieldHeadlineFor(byChain['Big'], 'en');
  assert.strictEqual(h.monthly, anchor.monthly);
  assert.strictEqual(h.subLabel, 'Claude Pro');
});
test('every ranked chain (all clear the 032 visible-nonzero table gate) gets a non-null headline', () => {
  ranked.forEach(r => {
    assert.ok(tp.yieldHeadlineFor(r, 'en'), `${r.chain} unexpectedly got no yield headline`);
  });
});
test('174: returns null (no fabricated number) when every rail-passing pool is visibly zero', () => {
  const allZeroRec = { chain: 'AllZero174', slug: 'allzero174', qualifyingCount: 2, totalTvl: 350000, tokens: ['Y'], pools: [
    { symbol: 'Y', project: 'aave', chain: 'AllZero174', pool: 'p1', apyBase: 0, apyReward: 0, tvlUsd: 200000 },
    { symbol: 'Y', project: 'aave', chain: 'AllZero174', pool: 'p2', apyBase: 0, apyReward: 0, tvlUsd: 150000 }
  ] };
  assert.strictEqual(tp.yieldHeadlineFor(allZeroRec, 'en'), null);
  const page = gen.renderChainPage(allZeroRec, [], '2026-07-12', [], 'en');
  assert.ok(!page.includes('cp-yield-headline">'), 'all-zero chain must render no cp-yield-headline paragraph');
});
test('174: a zero-APY pool mixed with real pools is excluded from the blend — exact expected value from a fixture', () => {
  // Pre-174 behavior blended ALL 3 pools: median([0,4,6]) = 4.00% (a promise
  // partly resting on a pool the product would never display). 174 requires
  // the blend to use ONLY the visibly-non-zero, rail-passing pools:
  // median([4,6]) = 5.00% — a different, exact number this test pins down.
  const mixedRec = { chain: 'Mixed174', slug: 'mixed174', qualifyingCount: 3, totalTvl: 450000, tokens: ['Y'], pools: [
    { symbol: 'Y', project: 'aave', chain: 'Mixed174', pool: 'p1', apyBase: 0, apyReward: 0, tvlUsd: 200000 },
    { symbol: 'Y', project: 'aave', chain: 'Mixed174', pool: 'p2', apyBase: 4, apyReward: 0, tvlUsd: 150000 },
    { symbol: 'Y', project: 'aave', chain: 'Mixed174', pool: 'p3', apyBase: 6, apyReward: 0, tvlUsd: 100000 }
  ] };
  const h = tp.yieldHeadlineFor(mixedRec, 'en');
  assert.ok(h, 'expected a non-null headline once the zero pool is excluded from the blend');
  const nonZeroPools = [mixedRec.pools[1], mixedRec.pools[2]];
  const expectedApyStr = tp.formatApy(gp.blendedApy(nonZeroPools));
  assert.strictEqual(expectedApyStr, '5.00%', 'sanity: the fixture\'s own expected value');
  assert.strictEqual(h.apyStr, expectedApyStr, 'blended APY must be computed WITHOUT the zero pool');
  assert.notStrictEqual(h.apyStr, tp.formatApy(gp.blendedApy(mixedRec.pools)), 'must differ from the (wrong) all-pools blend');
  const expectedForever = tp.formatUsd(gp.foreverNumber(tp.yieldHeadlineAnchor().monthly, gp.blendedApy(nonZeroPools)));
  assert.strictEqual(h.foreverAmtStr, expectedForever, 'forever amount must be derived from the SAME zero-excluded blend');
});
test('headline renders above the pool table (.cp-card), after the intro paragraph', () => {
  const introIdx = html.indexOf('<p class="intro">');
  const headlineIdx = html.indexOf('<p class="cp-yield-headline">');
  const tableIdx = html.indexOf('<div class="cp-card">');
  assert.ok(introIdx > -1 && headlineIdx > introIdx && headlineIdx < tableIdx,
    'expected intro < yield headline < pool table in document order');
});
test('headline copy states the chain, APY, forever capital, and monthly subscription price', () => {
  const h = tp.yieldHeadlineFor(byChain['Big'], 'en');
  assert.ok(html.includes(`Idle assets on Big could earn ~${h.apyStr}`), 'missing chain/APY in rendered headline');
  assert.ok(html.includes(`park ${h.foreverAmtStr}`), 'missing forever-capital figure in rendered headline');
  assert.ok(html.includes(`$${h.monthly}/mo Claude Pro`), 'missing monthly subscription anchor in rendered headline');
});
test('malicious chain name cannot inject markup into the yield headline', () => {
  const evil = { chain: '<script>alert(1)</script>', slug: 'evil', qualifyingCount: 1, totalTvl: 1e7, tokens: ['Y'],
    pools: [{ symbol: 'Y', project: 'aave', chain: 'X', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] };
  const evilPage = gen.renderChainPage(evil, [], '2026-07-12', [], 'en');
  const headlineP = evilPage.match(/<p class="cp-yield-headline">[\s\S]*?<\/p>/)[0];
  assert.ok(!headlineP.includes('<script>alert(1)</script>'), 'unescaped chain name leaked into the yield headline');
  assert.ok(headlineP.includes('&lt;script&gt;'), 'expected escaped chain name in the yield headline');
});
test('every generated chain page (en + ko) carries the yield headline with natural KO copy', () => {
  ranked.forEach(rec => {
    const enHtml = gen.renderChainPage(rec, [], '2026-07-12', [], 'en');
    const koHtml = gen.renderChainPage(rec, [], '2026-07-12', [], 'ko');
    assert.ok(enHtml.includes('cp-yield-headline'), `EN page missing yield headline for ${rec.chain}`);
    assert.ok(koHtml.includes('cp-yield-headline'), `KO page missing yield headline for ${rec.chain}`);
    assert.ok(koHtml.includes('Claude Pro') && koHtml.includes('구독료'), `KO page yield headline not translated for ${rec.chain}`);
  });
});
test('yield headline uses the neuro token system only, no hardcoded hex colors', () => {
  const styleMatch = html.match(/\.cp-yield-headline \{[^}]*\}/);
  assert.ok(styleMatch, 'yield headline style rule missing from rendered page');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleMatch[0]), 'hardcoded hex color in the yield headline style');
  assert.ok(styleMatch[0].includes('var(--neuro-shadow-raised)'), 'must reuse existing neuro shadow token');
});

console.log('174 — safety-floor honesty (FAQ) + no 0.00% rows + forever-number rail (committed regression)');
test('174: FAQ "Are these rates safe?" answer cites the real MIN_POOL_TVL floor and never says "trust filters" (EN)', () => {
  const faq = extractLdJsonBlocks(html, 'FAQPage')[0].mainEntity;
  assert.strictEqual(faq[2].name, 'Are these rates safe?');
  const safetyAnswer = faq[2].acceptedAnswer.text;
  assert.ok(safetyAnswer.includes(tp.formatUsd(gen.MIN_POOL_TVL)),
    'FAQ safety answer must cite the real MIN_POOL_TVL floor (' + tp.formatUsd(gen.MIN_POOL_TVL) + ')');
  assert.ok(!/trust filters/i.test(safetyAnswer),
    'FAQ safety answer must not attribute the page\'s floor to "DeFi Garden\'s trust filters" (100x false safety claim)');
});
test('174: FAQ safety answer changes when MIN_POOL_TVL changes (interpolated, never a re-typed literal)', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  assert.ok(t('tcpFaqA3', '$1.00').includes('$1.00'), 'tcpFaqA3 must be a function of its floor argument');
  assert.ok(t('tcpFaqA3', '$9.99M').includes('$9.99M'), 'tcpFaqA3 must reflect a different floor string, not a fixed literal');
});
test('174: FAQ safety answer cites the real USD floor and never says 신뢰 기준 (trust criteria) as the safety guarantee (KO)', () => {
  const koHtml = gen.renderChainPage(byChain['Big'], [], '2026-07-12', [], 'ko');
  const koFaq = extractLdJsonBlocks(koHtml, 'FAQPage')[0].mainEntity;
  const safetyAnswer = koFaq[2].acceptedAnswer.text;
  assert.ok(safetyAnswer.includes(tp.formatUsd(gen.MIN_POOL_TVL)),
    'KO FAQ safety answer must cite the real USD floor — never a converted/relabeled 원 figure');
  assert.ok(!safetyAnswer.includes('신뢰 기준'),
    'KO FAQ safety answer must not attribute the page\'s floor to DeFi Garden\'s "trust criteria" as a safety guarantee');
});
test('174: tcpTrustNote footer note is likewise interpolated from the floor, not "trust filters" (EN + KO)', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  const tKo = require('./translations.js').createTranslationFunction('ko');
  assert.ok(!/trust filters/i.test(t('tcpTrustNote', tp.formatUsd(gen.MIN_POOL_TVL))), 'EN trust note must not say "trust filters"');
  assert.ok(!tKo('tcpTrustNote', tp.formatUsd(gen.MIN_POOL_TVL)).includes('신뢰 기준'), 'KO trust note must not say 신뢰 기준');
  assert.ok(html.includes(tp.formatUsd(gen.MIN_POOL_TVL)), 'rendered page must show the real floor somewhere via the trust note');
});
test('174: no rendered pool row across ANY ranked chain shows 0.00% APY (display excludes zero-yield rows)', () => {
  ranked.forEach(r => r.pools.forEach(p =>
    assert.notStrictEqual(tp.formatApy(tp.poolTotalApy(p)), '0.00%', r.chain + ' has a displayed 0.00% APY row')));
});
test('174: rankTopChains excludes 0.00%-APY rows from the displayed table and backfills a real-yield pool ranked beyond POOLS_PER_PAGE', () => {
  const backfillPools = [];
  for (let i = 0; i < 7; i++) {
    backfillPools.push({ symbol: 'Z' + i, project: 'zpool' + i, chain: 'Backfill174',
      tvlUsd: (900 - i * 100) * 1e6, apyBase: 0, apyReward: 0, pool: 'bf174-z' + i });
  }
  // Rank #8 by TVL — inside the gate's `shown` slice, keeps the chain qualifying.
  backfillPools.push({ symbol: 'Y8', project: 'yieldpool8', chain: 'Backfill174',
    tvlUsd: 200000000, apyBase: 5, apyReward: 0, pool: 'bf174-y8' });
  // Rank #9 by TVL — beyond POOLS_PER_PAGE (8), the exact 033-style truncation case.
  backfillPools.push({ symbol: 'Y9', project: 'yieldpool9', chain: 'Backfill174',
    tvlUsd: 100000000, apyBase: 6, apyReward: 0, pool: 'bf174-y9' });
  const rankedBackfill = gen.rankTopChains(backfillPools);
  const rec = rankedBackfill.find(r => r.chain === 'Backfill174');
  assert.ok(rec, 'Backfill174 should qualify (its top-8-by-TVL gate slice has >=1 non-zero pool)');
  assert.strictEqual(rec.pools.length, 2, 'only the 2 real-yield pools should remain in the displayed table');
  assert.ok(rec.pools.every(p => tp.formatApy(tp.poolTotalApy(p)) !== '0.00%'),
    'no displayed Backfill174 pool row may show 0.00% APY');
  assert.ok(rec.pools.some(p => p.pool === 'bf174-y9'),
    'the rank-9 real-yield pool must backfill into the displayed table once zero rows are excluded');
  const bfHtml = gen.renderChainPage(rec, [], '2026-07-12');
  assert.ok(!bfHtml.includes('0.00%'), 'rendered Backfill174 page must not show any 0.00% APY cell');
});
test('174: mutating MIN_POOL_TVL in a scratch run moves EVERY floor mention on chain + token + hub pages, with zero stale $100K literal', () => {
  const { tokenGen, chainGen, scratchDir } = loadScratchGenerators(250000);
  try {
    const newFloorStr = tokenGen.formatUsd(250000);
    assert.strictEqual(newFloorStr, '$250K', 'sanity: the mutated floor formats to $250K');

    const scratchChainRanked = chainGen.rankTopChains(pools); // reuses this file's own chain fixture
    const big = scratchChainRanked.find(r => r.chain === 'Big');
    assert.ok(big, 'Big (500M/300M/100M pools) must still qualify at the mutated $250K floor');
    const chainHtml = chainGen.renderChainPage(big, [], '2026-07-12');
    assert.ok(chainHtml.includes(newFloorStr), 'chain page must show the MUTATED floor, not a fixed literal');
    assert.ok(!chainHtml.includes('$100K'), 'chain page must not retain the stale $100K literal once the constant changes');

    const chainHubHtml = chainGen.renderChainHubPage(scratchChainRanked);
    assert.ok(chainHubHtml.includes(newFloorStr), 'chain hub page must show the MUTATED floor');
    assert.ok(!chainHubHtml.includes('$100K'), 'chain hub page must not retain the stale $100K literal');

    const scratchTokenRanked = tokenGen.rankTopTokens(pools);
    assert.ok(scratchTokenRanked.length > 0, 'expected at least one qualifying token at the mutated floor');
    const tokenHtml = tokenGen.renderTokenPage(scratchTokenRanked[0], [], '2026-07-12');
    assert.ok(tokenHtml.includes(newFloorStr), 'token page must show the MUTATED floor');
    assert.ok(!tokenHtml.includes('$100K'), 'token page must not retain the stale $100K literal');

    const azGroups = tokenGen.groupTokensAZ(scratchTokenRanked);
    const tokenHubHtml = tokenGen.renderTokenHubPage(scratchTokenRanked, azGroups);
    assert.ok(tokenHubHtml.includes(newFloorStr), 'token hub page must show the MUTATED floor');
    assert.ok(!tokenHubHtml.includes('$100K'), 'token hub page must not retain the stale $100K literal');
  } finally {
    cleanupScratch(scratchDir);
  }
});

console.log(`\n${passed} assertions passed`);
