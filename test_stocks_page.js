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
    score: { v: 50, r: 'BBB', st: 'High', su: 'Medium', sk: 'Low', li: null }
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
  const p = logic.normalizePool(pool({ band: [1, NaN], clip: NaN, score: { v: 40, r: null, st: 17 } }));
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

check('spotlight lead rule: Tier 1-2 only, projected APY within 1%..100% inclusive; others never lead', () => {
  const lead = ps => logic.spotlight(ps, 10);
  // boundaries
  assert.ok(logic.isSpotlightLead(pool({ proj: 1 })));
  assert.ok(logic.isSpotlightLead(pool({ proj: 100 })));
  assert.ok(!logic.isSpotlightLead(pool({ proj: 0.99 })));
  assert.ok(!logic.isSpotlightLead(pool({ proj: 100.01 })));
  assert.ok(!logic.isSpotlightLead(pool({ proj: 0 })));
  assert.ok(!logic.isSpotlightLead(pool({ tier: 3, proj: 20 })));
  // SPCX-like: a 212% Backpack farm must not lead; the plausible tier-2 pool does
  const spcx = lead([pool({ id: 'farm', underlying: 'SPCX', tier: 1, tvl: 9e6, proj: 212 }), pool({ id: 'ok', underlying: 'SPCX', tier: 2, tvl: 1e6, proj: 12 })]);
  assert.strictEqual(spcx[0].lead.id, 'ok');
  assert.strictEqual(spcx[0].count, 2);          // the card still counts every yield pool
  assert.strictEqual(spcx[0].tvl, 1e7);
  // SPY-like: a 0.00% collateral position must not lead
  const spy = lead([pool({ id: 'zero', underlying: 'SPY', tier: 1, tvl: 9e6, proj: 0 }), pool({ id: 'ok', underlying: 'SPY', tier: 2, tvl: 6e5, proj: 4 })]);
  assert.strictEqual(spy[0].lead.id, 'ok');
  // best qualifying tier then TVL
  const t = lead([pool({ id: 'a', underlying: 'X', tier: 2, tvl: 1.9e6, proj: 5 }), pool({ id: 'b', underlying: 'X', tier: 1, tvl: 3e6, proj: 7 }), pool({ id: 'c', underlying: 'X', tier: 1, tvl: 4e6, proj: 300 })]);
  assert.strictEqual(t[0].lead.id, 'b');
});

check('spotlight drops an underlying with no qualifying pool and takes the next by TVL', () => {
  const ps = [
    pool({ id: 'big', underlying: 'BIG', tier: 1, tvl: 9e9, proj: 248 }),          // absurd only -> dropped
    pool({ id: 'thin', underlying: 'THIN', tier: 3, tvl: 4e5, proj: 15 }),          // tier 3 only -> dropped
    pool({ id: 'a', underlying: 'AAA', tier: 1, tvl: 5e6, proj: 8 }),
    pool({ id: 'b', underlying: 'BBB', tier: 2, tvl: 4e6, proj: 3 }),
    pool({ id: 'c', underlying: 'CCC', tier: 2, tvl: 3e6, proj: 2 })
  ];
  const sp = logic.spotlight(ps, 2);
  assert.deepStrictEqual(sp.map(g => g.underlying), ['AAA', 'BBB']);
  assert.deepStrictEqual(logic.spotlight([pool({ underlying: 'Z', proj: 0 })], 4), []);
  sp.forEach(g => assert.ok(logic.isSpotlightLead(g.lead)));
});

check('committed data/stocks-pools.json: every spotlight card leads with a Tier 1-2 pool at 1%..100%', () => {
  const raw = JSON.parse(fs.readFileSync('data/stocks-pools.json', 'utf8'));
  const sp = logic.spotlight(logic.sanitizePools(raw.pools, raw.issuers), 4);
  assert.ok(sp.length >= 3);
  sp.forEach(g => {
    assert.ok(g.lead.tier <= 2, g.underlying);
    assert.ok(g.lead.proj >= 1 && g.lead.proj <= 100, g.underlying + ' ' + g.lead.proj);
  });
});

check('issuer facts: tooltip text is built from data + localized copy; unknown issuers get no guessed facts', () => {
  const issuers = { Coinbase: { e: 'Coinbase Onchain SPV Ltd', j: 'Abu Dhabi Global Market (ADGM)', us: false }, ST0x: { e: 'S01 Issuer GmbH', j: 'Germany', us: null }, Centrifuge: { e: null, j: null, us: null } };
  const [a, b, c] = ['Coinbase', 'ST0x', 'Centrifuge'].map(n => logic.normalizePool(pool({ issuer: n }), issuers));
  assert.deepStrictEqual(a.issuerInfo, [{ name: 'Coinbase', entity: 'Coinbase Onchain SPV Ltd', jurisdiction: 'Abu Dhabi Global Market (ADGM)', us: false }]);
  assert.deepStrictEqual(logic.normalizePool(pool({ issuer: 'Nobody' }), issuers).issuerInfo, []);
  assert.deepStrictEqual(logic.normalizePool(pool({ issuer: null }), issuers).issuerInfo, []);
  assert.deepStrictEqual(logic.normalizePool(pool({ issuer: 'Coinbase' })).issuerInfo, []);
  ['en', 'ko'].forEach(l => {
    const copy = translations[l].stocks;
    const ta = logic.issuerTipText(a.issuerInfo, copy), tb = logic.issuerTipText(b.issuerInfo, copy), tc = logic.issuerTipText(c.issuerInfo, copy);
    assert.ok(ta.includes('Coinbase Onchain SPV Ltd') && ta.includes('ADGM') && ta.includes(copy.issuerUsNo), l);
    assert.ok(tb.includes('S01 Issuer GmbH') && tb.includes(copy.issuerUsUnknown), l);
    assert.ok(tc.includes('Centrifuge') && tc.includes(copy.issuerUsUnknown) && !/undefined|null/.test(tc), l);
    assert.strictEqual(logic.issuerTipText([], copy), copy.issuerUnverifiedTip);
  });
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

check('live layer: normalizeLive keeps only finite, typed fields and never trusts an unknown drift source', () => {
  const raw = {
    generatedAt: '2026-10-10T15:00:00.000Z', market: { isRegularSession: false, state: 'weekend' },
    pools: [
      { pool: 'a', price: 229.57, priceTs: '2026-10-10T14:58:00.000Z', drift: 2.22, driftRef: { source: 'defillama-token', kind: 'last-close' }, depth2pct: 123456, depthSource: 'rpc', depthCapped: true },
      { pool: 'b', price: NaN, drift: 1, driftRef: { source: 'made-up' }, depth2pct: 5, depthSource: 'heuristic' },
      { pool: 'c', price: -3, drift: null, depth2pct: NaN, depthSource: 'rpc' },
      { price: 1 }, null
    ]
  };
  const live = logic.normalizeLive(raw);
  assert.deepStrictEqual(Object.keys(live.byId), ['a', 'b', 'c']);
  assert.deepStrictEqual(live.byId.a, { price: 229.57, priceTs: '2026-10-10T14:58:00.000Z', drift: 2.22, driftSource: 'defillama-token', depth: 123456, depthCapped: true });
  assert.strictEqual(live.byId.b.price, null);
  assert.strictEqual(live.byId.b.drift, null, 'an unknown reference source drops the drift');
  assert.strictEqual(live.byId.b.depth, null, 'a heuristic depth is never shown as on-chain');
  assert.strictEqual(live.byId.c.depth, null);
  assert.strictEqual(live.depthCount, 1);
  assert.strictEqual(logic.normalizeLive(null), null);
  assert.strictEqual(logic.normalizeLive({ pools: [] }), null);
  assert.strictEqual(logic.normalizeLive({ market: {}, pools: 'x' }), null);
});

check('live layer: price and drift formatting is en-US, signed and dashes missing values', () => {
  assert.strictEqual(logic.fmtPrice(229.5681), '$229.57');
  assert.strictEqual(logic.fmtPrice(1478.185), '$1,478.19');
  assert.strictEqual(logic.fmtPrice(0.12345), '$0.1235');
  assert.strictEqual(logic.fmtPrice(0), '—');
  assert.strictEqual(logic.fmtPrice(NaN), '—');
  assert.strictEqual(logic.fmtDrift(2.222), '+2.22%');
  assert.strictEqual(logic.fmtDrift(-1.5), '-1.50%');
  assert.strictEqual(logic.fmtDrift(0.001), '0.00%');
  assert.strictEqual(logic.fmtDrift(null), '—');
});

check('live layer: the after-hours move shows only when BOTH the server and this browser say the session is closed', () => {
  const entry = { drift: 1.8 };
  const closed = { market: { isRegularSession: false, calendarStale: false } };
  assert.ok(logic.driftVisible(closed, entry, 'weekend'));
  assert.ok(logic.driftVisible(closed, entry, 'after'));
  assert.ok(!logic.driftVisible(closed, entry, 'open'), 'browser clock says open');
  assert.ok(!logic.driftVisible({ market: { isRegularSession: true, calendarStale: false } }, entry, 'weekend'));
  assert.ok(!logic.driftVisible({ market: { isRegularSession: false, calendarStale: true } }, entry, 'weekend'));
  assert.ok(!logic.driftVisible(closed, { drift: null }, 'weekend'));
  assert.ok(!logic.driftVisible(null, entry, 'weekend'));
});

check('live layer copy: EN + KO exist for every new string and no API key name reaches the browser', () => {
  ['colPrice', 'depthOnchain', 'depthTip', 'depthCappedNote', 'priceTip', 'driftVsClose', 'driftTipUnderlying', 'driftTipToken',
    'liveLoading', 'liveReady', 'liveStale', 'liveError', 'notesLive'].forEach(k => {
    assert.ok(translations.en.stocks[k], 'en ' + k);
    assert.ok(translations.ko.stocks[k], 'ko ' + k);
  });
  assert.strictEqual(translations.en.stocks.driftVsClose('+1.00%'), '+1.00% vs last close');
  assert.ok(/[가-힣]/.test(translations.ko.stocks.driftVsClose('+1.00%')));
  assert.ok(translations.en.stocks.liveReady('t', '26', '114').includes('26 of 114'));
  const client = fs.readFileSync('stocks.js', 'utf8') + JSON.stringify(translations);
  ['ALCHEMY', 'PYTH_API', 'g.alchemy.com', 'hermes'].forEach(w => assert.ok(client.indexOf(w) < 0, w));
  assert.strictEqual(logic.LIVE_URL, '/api/stocks-onchain');
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
