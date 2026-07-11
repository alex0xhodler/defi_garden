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
test('renders >=1 real pool row with en-US formatted numbers', () => {
  assert.ok(/<td class="num">\d/.test(html), 'no formatted numeric cell');
  assert.ok(html.includes('%') && html.includes('$'), 'no APY/TVL');
});
test('indexable (robots index,follow)', () => {
  assert.ok(html.includes('content="index,follow"'), 'should be indexable');
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

console.log(`\n${passed} assertions passed`);
