/* Unit tests for the static token-page generator (spec 014, phase 1).
   Runs the generator's pure functions against a crafted fixture and asserts
   on the real emitted HTML. Run: node test_token_pages.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gen = require('./generate-token-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Fixture crafted to exercise every branch. TVL in USD.
// AAA: 3 qualifying pools, highest aggregate TVL  -> emitted, rank #1
// BBB: 2 qualifying pools, lower aggregate TVL     -> emitted, rank #2
// CCC: 1 qualifying pool                           -> dropped (gate < 2)
// DDD: 2 pools but both below the $10M TVL floor   -> dropped
// EEE: 2 pools where one is anomalous (>1000% APY) -> anomaly excluded, left with 1 -> dropped
// USDC.E: dotted symbol, 2 qualifying pools        -> emitted, slug-safe
const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const ranked = gen.rankTopTokens(pools, 100);
const bySym = Object.fromEntries(ranked.map(r => [r.symbol, r]));

console.log('rankTopTokens — gate + ranking + trust rails');
test('emits exactly the tokens that clear the >=2 qualifying-pool gate', () => {
  assert.deepStrictEqual(ranked.map(r => r.symbol).sort(), ['AAA', 'BBB', 'USDC.E']);
});
test('ranks by aggregate qualifying TVL desc (AAA before BBB)', () => {
  const iA = ranked.findIndex(r => r.symbol === 'AAA');
  const iB = ranked.findIndex(r => r.symbol === 'BBB');
  assert.ok(iA < iB, 'AAA should rank above BBB');
  assert.ok(bySym['AAA'].totalTvl > bySym['BBB'].totalTvl);
});
test('single-qualifying-pool token (CCC) is dropped', () => {
  assert.ok(!bySym['CCC']);
});
test('sub-floor token (DDD) is dropped', () => {
  assert.ok(!bySym['DDD']);
});
test('anomalous pool excluded from content AND gate (EEE dropped to <2)', () => {
  assert.ok(!bySym['EEE'], 'EEE had 1 real + 1 anomalous pool, should not clear the gate');
});
test('no rendered pool anywhere is anomalous (>1000% total APY)', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok(gen.poolTotalApy(p) <= gen.APY_SANITY_LIMIT, r.symbol + ' has an anomalous pool');
  }));
});
test('every rendered pool clears the $10M TVL floor', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok((p.tvlUsd || 0) >= gen.DEFAULT_MIN_TVL, r.symbol + ' has a sub-floor pool');
  }));
});
test('cap is honored (limit=1 -> single top token AAA)', () => {
  const top1 = gen.rankTopTokens(pools, 1);
  assert.strictEqual(top1.length, 1);
  assert.strictEqual(top1[0].symbol, 'AAA');
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
const html = gen.renderTokenPage(bySym['AAA']);
test('self-canonical to /tokens/<slug>', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/tokens/aaa">'), 'missing self-canonical');
});
test('server-delivered <title> present in raw HTML (no JS)', () => {
  assert.ok(/<title>AAA DeFi Yields[^<]*<\/title>/.test(html), 'missing title');
});
test('server-delivered meta description present', () => {
  assert.ok(/<meta name="description" content="[^"]+">/.test(html), 'missing description');
});
test('links into the live app at ?token=<SYMBOL>', () => {
  assert.ok(html.includes('https://www.defi.garden/?token=AAA'), 'missing app deep link');
});
test('renders >=1 real pool row with en-US formatted numbers', () => {
  assert.ok(/<td class="num">\d/.test(html), 'no formatted numeric cell');
  assert.ok(html.includes('%'), 'no APY');
  assert.ok(html.includes('$'), 'no TVL');
});
test('indexable (robots index,follow — these pages are meant to be found)', () => {
  assert.ok(html.includes('content="index,follow"'), 'should be indexable');
});
test('HTML is escaped (no raw unescaped angle-brackets in content values)', () => {
  // project names etc. go through escapeHtml; sanity-check the helper is wired
  const evil = gen.renderTokenPage({ symbol: 'X<Y', slug: 'x-y', qualifyingCount: 2,
    totalTvl: 2e7, pools: [{ project: '<script>', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0 },
                            { project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 4, apyReward: 0 }] });
  assert.ok(!evil.includes('<script>'), 'unescaped project name leaked into HTML');
  assert.ok(evil.includes('&lt;script&gt;'), 'expected escaped project name');
});

console.log(`\n${passed} assertions passed`);
