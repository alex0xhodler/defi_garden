/* Unit gate for stocks.js's pure logic layer (the /stocks page) plus the
   page's i18n and static-shell contracts. No browser, no network.
   Run: node test_stocks_page.js */
const assert = require('assert');
const fs = require('fs');
const logic = require('./stocks.js');
const { translations } = require('./translations.js');
const clock = require('./stocks-market-clock.js');

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

function pool(over) {
  return Object.assign({
    id: 'p-' + Math.random().toString(36).slice(2), symbol: 'USDC-NVDAC', project: 'uniswap-v4', chain: 'Base', type: 'cl',
    underlying: 'NVDA', issuer: null, tvl: 1500000, tier: 2, apy: 66, proj: 50, flags: [], clip: 7500,
    score: { v: 50, r: 'BBB', st: 10, su: 10, sk: 10, li: 3 }
  }, over || {});
}

check('sanitize drops pools that break the equity rails or carry non-finite numbers', () => {
  const good = pool();
  const bad = [
    pool({ apy: 501 }), pool({ tvl: 99999 }), pool({ tvl: NaN }), pool({ proj: Infinity }), pool({ apy: undefined }),
    pool({ tier: 4 }), pool({ id: '' }), null, { id: 'x' }
  ];
  const out = logic.sanitizePools([good].concat(bad));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, good.id);
  assert.strictEqual(logic.sanitizePools(null).length, 0);
});

check('normalize never leaves a non-finite optional number', () => {
  const p = logic.normalizePool(pool({ band: [1, NaN], clip: NaN, score: { v: 40, r: null, st: NaN } }));
  assert.strictEqual(p.band, null);
  assert.strictEqual(p.clip, null);
  assert.strictEqual(p.score.st, null);
  assert.strictEqual(p.reward, 0);
  assert.strictEqual(logic.fmtPct(p.clip), '—');
});

check('formatting is en-US pinned and dashes missing values', () => {
  assert.strictEqual(logic.fmtPct(1651.984), '1,651.98%');
  assert.strictEqual(logic.fmtUsd(108740000), '$108.74M');
  assert.strictEqual(logic.fmtUsdShort(24711), '$24.7K');
  assert.strictEqual(logic.fmtInt(1976), '1,976');
  [logic.fmtPct, logic.fmtUsd, logic.fmtUsdShort, logic.fmtInt, logic.fmtScore].forEach(f => {
    assert.strictEqual(f(NaN), '—'); assert.strictEqual(f(undefined), '—'); assert.strictEqual(f(null), '—');
  });
});

check('default sort is tier asc then TVL desc; projection/TVL/score sorts are descending', () => {
  const a = pool({ id: 'a', tier: 2, tvl: 900000, proj: 5, score: null });
  const b = pool({ id: 'b', tier: 1, tvl: 3000000, proj: 1, score: { v: 80 } });
  const c = pool({ id: 'c', tier: 1, tvl: 5000000, proj: 9, score: { v: 40 } });
  const ids = s => logic.sortPools([a, b, c], s).map(p => p.id).join('');
  assert.strictEqual(ids('default'), 'cba');
  assert.strictEqual(ids('proj'), 'cab');
  assert.strictEqual(ids('tvl'), 'cba');
  assert.strictEqual(ids('score'), 'bca');
});

check('filters, chain list and aggregates (median only over yield pools)', () => {
  const ps = [pool({ id: '1', chain: 'Base', proj: 10 }), pool({ id: '2', chain: 'Solana', proj: 30, tier: 1, tvl: 5e6 }),
    pool({ id: '3', chain: 'Solana', type: 'lending', proj: 0, tier: 1, tvl: 2e6 })];
  assert.deepStrictEqual(logic.filterPools(ps, { chain: 'Solana', tier: 'all' }).map(p => p.id), ['2', '3']);
  assert.deepStrictEqual(logic.filterPools(ps, { chain: 'all', tier: '1' }).map(p => p.id), ['2', '3']);
  assert.deepStrictEqual(logic.chainsOf(ps).map(c => c.chain + c.count), ['Solana2', 'Base1']);
  const agg = logic.aggregates(ps);
  assert.strictEqual(agg.count, 3);
  assert.strictEqual(agg.tvl, 1.5e6 + 5e6 + 2e6);
  assert.strictEqual(agg.medianProj, 20);
  assert.strictEqual(logic.median([]), null);
});

check('spotlight ranks underlyings by yield-pool TVL; lead = best tier then TVL; lending excluded', () => {
  const ps = [
    pool({ id: 'n1', underlying: 'NVDA', tier: 2, tvl: 1e6 }), pool({ id: 'n2', underlying: 'NVDA', tier: 1, tvl: 2.5e6 }),
    pool({ id: 's1', underlying: 'SPY', tier: 1, tvl: 3e6 }),
    pool({ id: 'l1', underlying: 'SPY', type: 'lending', tier: 1, tvl: 9e9 }),
    pool({ id: 't1', underlying: 'TSLA', tier: 3, tvl: 2e5 })
  ];
  const sp = logic.spotlight(ps, 2);
  assert.deepStrictEqual(sp.map(g => g.underlying), ['NVDA', 'SPY']);
  assert.strictEqual(sp[0].count, 2);
  assert.strictEqual(sp[0].lead.id, 'n2');
  assert.strictEqual(sp[1].tvl, 3e6);
});

check('URL params round-trip (c / tier / sort) and ignore unknown values; lang is preserved', () => {
  assert.deepStrictEqual(logic.parseParams('?c=Base&tier=2&sort=tvl', ['Base']), { chain: 'Base', tier: '2', sort: 'tvl' });
  assert.deepStrictEqual(logic.parseParams('?c=Mars&tier=9&sort=x', ['Base']), { chain: 'all', tier: 'all', sort: 'default' });
  assert.strictEqual(logic.buildSearch('?lang=ko&c=Old', { chain: 'Base', tier: 'all', sort: 'proj' }), '?lang=ko&c=Base&sort=proj');
  assert.strictEqual(logic.buildSearch('?c=Base', { chain: 'all', tier: 'all', sort: 'default' }), '');
  assert.strictEqual(logic.poolHref('abc-1'), '/?pool=abc-1');
});

check('i18n: stocks section has en/ko key parity, Hangul in every ko string, six clock label keys', () => {
  const en = translations.en.stocks, ko = translations.ko.stocks;
  assert.deepStrictEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  Object.keys(clock.LABEL_KEYS).forEach(s => {
    const key = clock.LABEL_KEYS[s];
    assert.strictEqual(typeof en[key], 'string', 'en ' + key);
    assert.ok(/[가-힣]/.test(ko[key]), 'ko ' + key);
  });
  Object.keys(ko).filter(k => typeof ko[k] === 'string' && k !== 'dash').forEach(k => assert.ok(/[가-힣]/.test(ko[k]), 'ko value has no Hangul: ' + k));
  assert.ok(translations.en.landing.navStocks && translations.ko.landing.navStocks);
});

check('i18n: function entries take pre-formatted strings and never print undefined/NaN', () => {
  ['en', 'ko'].forEach(l => {
    const t = translations[l].stocks;
    Object.keys(t).filter(k => typeof t[k] === 'function').forEach(k => {
      const out = t[k]('A', 'B', 'C', 'D');
      assert.ok(!/undefined|NaN/.test(out), l + '.' + k);
    });
  });
});

check('copy never names a guessed issuer as fact', () => {
  const blob = JSON.stringify(translations.en.stocks) + JSON.stringify(translations.ko.stocks) + fs.readFileSync('stocks.js', 'utf8');
  ['Dinari', 'Ondo', 'Alpaca', 'B20'].forEach(w => assert.ok(blob.indexOf(w) < 0, w));
});

check('stocks.html: canonical, OG tags, analytics + clock + page scripts deferred in order, root mount', () => {
  const html = fs.readFileSync('stocks.html', 'utf8');
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/stocks">'));
  ['og:title', 'og:description', 'og:url', 'og:image'].forEach(p => assert.ok(html.includes('property="' + p + '"'), p));
  assert.ok(html.includes('name="description"'));
  assert.ok(html.indexOf('<script defer src="analytics.js">') < html.indexOf('<script defer src="stocks.js">'));
  assert.ok(html.indexOf('<script defer src="stocks-market-clock.js">') < html.indexOf('<script defer src="stocks.js">'));
  assert.ok(html.indexOf('translations.min.js') < html.indexOf('<script defer src="stocks.js">'));
  assert.ok(html.includes('id="stocks-root"'));
  assert.ok(!/<script[^>]+src="[^"]*babel/i.test(html));
});

check('stocks.js: React.createElement only (no JSX), no bare toLocaleString()', () => {
  const src = fs.readFileSync('stocks.js', 'utf8');
  assert.ok(!/\.toLocaleString\(\s*\)/.test(src));
  assert.ok(!/return\s*\(?\s*<[A-Za-z]/.test(src));
});

check('stocks-styles.css: no gradients, shadows only via the overlay/focus tokens', () => {
  const css = fs.readFileSync('stocks-styles.css', 'utf8');
  assert.ok(!/gradient\(/.test(css));
  (css.match(/box-shadow:[^;]+;/g) || []).forEach(d => assert.ok(/--ui-shadow-overlay|--ui-focus-ring|none/.test(d), d));
});

console.log('\n' + passed + ' checks passed');
