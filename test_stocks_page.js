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

// ---- token versions section (static + live merge, picker, cells) ----
const VERS = JSON.parse(fs.readFileSync('data/stocks-versions.json', 'utf8'));
function vcopy(l) { return Object.assign({}, translations[l].stocks, logic.VERSIONS_COPY[l]); }
function rawTicker(over) {
  const v = (k, extra) => Object.assign({ key: k, issuer: 'Iss' + k, issuerSlug: 'xstocks', chain: 'Base', symbol: 'S' + k, priceUsd: 100, multiplier: 1,
    spreadVsMedianPct: 0.5, premiumVsClosePct: null, reasons: { premium: 'pyth-no-key' }, supplyUsd: 5e6, liquidity: { tvlUsd: 1e6, depth2pctUsd: null }, bestYield: {}, risk: {}, cex: [] }, extra || {});
  return Object.assign({ name: 'Test Corp', versions: [v('a'), v('b', { multiplier: null, multiplierUnknown: true, spreadVsMedianPct: null, reasons: { premium: 'multiplier-unknown' } })], unverified: [] }, over || {});
}
function rawData(tickers) { return { generatedAt: '2026-10-26T11:00:00.000Z', issuers: { xstocks: { structureSource: 'https://example.com/s', mintRedeemHoursSource: 'javascript:alert(1)' } }, cexSources: [{ id: 'kraken', name: 'Kraken' }], tickers }; }

check('versions: tickers with >= 2 verified versions come first, single ones after, no-verified tickers dropped', () => {
  const d = logic.normalizeVersionsData(rawData({
    ONE: rawTicker({ versions: [rawTicker().versions[0]] }), TWO: rawTicker(), NONE: rawTicker({ versions: [], unverified: [{ symbol: 'X', chain: 'Base', priceUsd: 5 }] }),
    BIG: rawTicker({ versions: [rawTicker().versions[0], rawTicker().versions[0]].map((x, i) => Object.assign({}, x, { key: 'k' + i, liquidity: { tvlUsd: 9e6 } })) })
  }));
  assert.deepStrictEqual(logic.sortTickers(d).map(t => t.ticker), ['BIG', 'TWO', 'ONE']);
  const real = logic.sortTickers(logic.normalizeVersionsData(VERS));
  const firstSingle = real.findIndex(t => t.versions.length < 2);
  assert.ok(firstSingle > 0 && real.slice(0, firstSingle).every(t => t.versions.length >= 2) && real.slice(firstSingle).every(t => t.versions.length < 2));
  assert.ok(!real.some(t => t.ticker === 'SPX'), 'a ticker with only unverified tokens is not in the picker');
  assert.strictEqual(logic.defaultTicker(real), 'NVDA');
  assert.strictEqual(logic.defaultTicker([{ ticker: 'ZZ', versions: [1] }, { ticker: 'NVDA', versions: [1] }]), 'ZZ', 'NVDA needs >= 2 versions to be the default');
});

check('versions: ?ticker= parsing ignores invalid values; building keeps other params', () => {
  const list = logic.sortTickers(logic.normalizeVersionsData(VERS));
  assert.strictEqual(logic.parseTickerParam('?ticker=nvda', list), 'NVDA');
  assert.strictEqual(logic.parseTickerParam('?ticker=BRK.B', list), 'BRK.B');
  assert.strictEqual(logic.parseTickerParam('?ticker=ZZZZ', list), null);
  assert.strictEqual(logic.parseTickerParam('?ticker=SPX', list), null);
  assert.strictEqual(logic.parseTickerParam('', list), null);
  assert.strictEqual(logic.buildTickerSearch('?lang=ko&c=Base', 'TSLA'), '?lang=ko&c=Base&ticker=TSLA');
  assert.strictEqual(logic.buildTickerSearch('?ticker=OLD', 'NVDA'), '?ticker=NVDA');
  assert.strictEqual(logic.buildTickerSearch('?ticker=OLD', null), '');
  assert.deepStrictEqual(logic.filterTickers(list, 'nvd').map(t => t.ticker), ['NVDA']);
  assert.strictEqual(logic.filterTickers(list, 'nvidia')[0].ticker, 'NVDA');
  assert.strictEqual(logic.filterTickers(list, '').length, list.length);
  assert.strictEqual(logic.staticPageHref('NVDA'), '/stocks/nvda');
  assert.strictEqual(logic.staticPageHref('BRK.B'), '/stocks/brk-b');
});

check('versions: static data is sanitised (unknown multiplier has no spread, bad URLs dropped, unverified kept apart)', () => {
  const t = rawTicker({ unverified: [{ symbol: 'DESPXA', chain: 'Base', priceUsd: 765.6, flag: 'Issuer unverified' }] });
  const d = logic.normalizeVersionsData(rawData({ T: t }));
  const [a, b] = d.tickers.T.versions;
  assert.strictEqual(a.spreadPct, 0.5);
  assert.strictEqual(b.multiplierUnknown, true);
  assert.strictEqual(b.spreadPct, null);
  assert.strictEqual(d.issuers.xstocks.structureSource, 'https://example.com/s');
  assert.strictEqual(d.issuers.xstocks.hoursSource, null, 'non-https source links are dropped');
  const g = logic.groupVersions(d.tickers.T);
  assert.strictEqual(g.verified.length, 2);
  assert.strictEqual(g.unverified.length, 1);
  assert.strictEqual(g.verified.some(v => v.symbol === 'DESPXA'), false);
  assert.strictEqual(logic.normalizeVersionsData(null), null);
  assert.strictEqual(logic.normalizeVersionsData({ tickers: 5 }), null);
});

check('versions: live values overlay the static ones per version; a failed/malformed live view keeps the static data', () => {
  const base = logic.normalizeVersionsData(rawData({ T: rawTicker() }));
  const live = { generatedAt: '2026-10-26T15:00:00.000Z', referenceMode: 'live', tickers: { T: {
    reference: { kind: 'live', source: 'pyth', price: 98, ts: '2026-10-26T15:00:00.000Z' }, medianNormalizedPrice: 101,
    versions: { a: { price: 102, priceTs: '2026-10-26T14:59:00.000Z', premiumPct: 4.08, spreadVsMedianPct: 0.99 }, b: { price: null, reasons: { price: 'stale-price' } } } } } };
  const m = logic.mergeLive(base, live);
  const [a, b] = m.tickers.T.versions;
  assert.strictEqual(a.price, 102); assert.strictEqual(a.premiumPct, 4.08); assert.strictEqual(a.spreadPct, 0.99); assert.strictEqual(a.priceLive, true);
  assert.strictEqual(b.price, 100, 'a version the live view cannot price keeps its static price');
  assert.strictEqual(m.tickers.T.median, 101);
  assert.strictEqual(m.referenceMode, 'live');
  assert.strictEqual(base.tickers.T.versions[0].price, 100, 'merge never mutates the static model');
  assert.strictEqual(logic.mergeLive(base, null), base);
  assert.strictEqual(logic.mergeLive(base, { tickers: 'x' }), base);
  // live premium null (reference missing) replaces a stale static premium and carries the live reason
  const withPrem = logic.normalizeVersionsData(rawData({ T: rawTicker({ versions: [Object.assign(rawTicker().versions[0], { premiumVsClosePct: 2 })] }) }));
  const m2 = logic.mergeLive(withPrem, { referenceMode: 'last-close', tickers: { T: { reference: null, referenceReason: 'pyth-no-key', versions: { a: { price: 101, premiumPct: null, spreadVsMedianPct: 0, reasons: { premium: 'pyth-no-key' } } } } } });
  assert.strictEqual(m2.tickers.T.versions[0].premiumPct, null);
  assert.strictEqual(m2.tickers.T.versions[0].premiumReason, 'pyth-no-key');
  assert.strictEqual(m2.tickers.T.referenceReason, 'pyth-no-key');
});

check('versions: premium null shows a dash with its reason; unknown multiplier has no spread; spread label is not a premium', () => {
  const d = logic.mergeLive(logic.normalizeVersionsData(rawData({ T: rawTicker() })), null);
  ['en', 'ko'].forEach(l => {
    const c = vcopy(l);
    const [a, b] = d.tickers.T.versions;
    const ca = logic.versionCells(a, c), cb = logic.versionCells(b, c);
    assert.strictEqual(ca.premiumText, '—'); assert.strictEqual(ca.premiumTip, c.vPremiumNoRef);
    assert.strictEqual(ca.spreadText, '+0.50%'); assert.strictEqual(ca.spreadTip, c.vSpreadTip);
    assert.strictEqual(cb.premiumText, '—'); assert.strictEqual(cb.premiumTip, c.vPremiumNoMult);
    assert.strictEqual(cb.spreadText, '—'); assert.strictEqual(cb.spreadTip, c.vSpreadNoMult);
    const shown = logic.versionCells(Object.assign({}, a, { premiumPct: -1.234 }), c);
    assert.strictEqual(shown.premiumText, '-1.23%');
  });
  assert.strictEqual(vcopy('en').vColSpread, 'Spread vs median of token versions');
  assert.strictEqual(vcopy('en').vColPremium, 'Premium vs share');
  assert.strictEqual(vcopy('en').vSpreadNoMult, 'Multiplier unknown: excluded from the median');
  assert.strictEqual(vcopy('en').vPremiumNoMult, 'Multiplier unknown: no premium computed');
  assert.ok(/not a premium vs the real share/.test(vcopy('en').vSpreadTip));
});

check('versions: reference status line (live / last close / unavailable)', () => {
  const c = vcopy('en');
  assert.strictEqual(logic.referenceLine({ reference: { kind: 'live' } }, c), 'Reference: Pyth live');
  assert.strictEqual(logic.referenceLine({ reference: { kind: 'last-close', date: '2026-10-23' } }, c), 'Reference: last regular close Oct 23, 2026');
  assert.strictEqual(logic.referenceLine({ reference: null }, c), c.vRefNone);
  assert.ok(c.vRefNone.startsWith('Reference price unavailable right now. Spreads vs the median of token versions are still shown'));
});

check('versions: best yield (tier order, honest APY, tier labels only), CEX lines and source links', () => {
  const by = {
    lp: { pool: 'p-lp', project: 'raydium-amm', tier: 2, honestProjection: 7.8, defiScore: { score: 59.9, rating: 'A', pillarsTier: { stability: 'Low', sustainability: 'High', stickiness: 'Medium', liquidity: 'bogus' }, pillarsPct: { stability: 12 }, breakdown: { x: 1 } } },
    lending: { pool: 'p-ld', project: 'kamino-lend', tier: 1, honestProjection: 0.02, defiScore: { rating: 'AA', pillarsTier: {} } }
  };
  const c = logic.bestYieldCandidates(by);
  assert.deepStrictEqual(c.map(x => x.kind), ['lending', 'lp']);
  assert.deepStrictEqual(c[1].tiers, { stability: 'Low', sustainability: 'High', stickiness: 'Medium', liquidity: null });
  assert.strictEqual(c[1].apy, 7.8); assert.strictEqual(c[1].rating, 'A');
  assert.ok(!JSON.stringify(c).match(/pillarsPct|breakdown|12/), 'no pillar numbers or raw points leave the normaliser');
  assert.deepStrictEqual(logic.bestYieldCandidates({ lp: { pool: 'x', tier: 1, honestProjection: 900 } }), [], 'beyond the equity APY cap is dropped');
  assert.deepStrictEqual(logic.bestYieldCandidates(null), []);
  const d = logic.normalizeVersionsData(rawData({ T: rawTicker({ versions: [Object.assign(rawTicker().versions[0], { cex: [{ exchange: 'kraken', priceUsd: 211.17 }, { exchange: 'bybit', priceUsd: 212 }, { exchange: 'x', priceUsd: NaN }], risk: { structure: 'SPV', mintRedeemHours: 'hours', redemptionMinUsd: 1 } })] }) }));
  const v = d.tickers.T.versions[0];
  assert.deepStrictEqual(logic.cexLines(v, d.cexNames).map(x => x.text), ['Bybit $212.00', 'Kraken $211.17']);
  const facts = logic.riskFacts(v, d.issuers, vcopy('en'));
  assert.deepStrictEqual(facts.map(f => f.key + ':' + f.href), ['structure:https://example.com/s', 'hours:null', 'min:null']);
  assert.strictEqual(facts[2].text, '$1');
});

check('versions: real data file renders without gaps (no NaN/undefined in any cell text)', () => {
  const d = logic.normalizeVersionsData(VERS);
  const c = vcopy('en');
  logic.sortTickers(d).forEach(t => t.versions.forEach(v => {
    const cells = logic.versionCells(v, c);
    assert.ok(!/NaN|undefined|null/.test(JSON.stringify([cells, logic.cexLines(v, d.cexNames), logic.riskFacts(v, d.issuers, c).map(f => f.text), v.yields.map(y => y.apy)])), t.ticker + ' ' + v.key);
    if (v.multiplierUnknown) assert.strictEqual(cells.spreadText, '—');
  }));
});

check('versions: EN/KO copy parity, Hangul in every KO string, functions never print undefined', () => {
  const en = logic.VERSIONS_COPY.en, ko = logic.VERSIONS_COPY.ko;
  assert.deepStrictEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  Object.keys(ko).forEach(k => {
    const val = typeof ko[k] === 'function' ? ko[k]('A') : ko[k];
    assert.ok(/[가-힣]/.test(val) || val === en[k], 'ko ' + k);
    assert.strictEqual(typeof ko[k], typeof en[k], k);
  });
  ['en', 'ko'].forEach(l => Object.keys(logic.VERSIONS_COPY[l]).filter(k => typeof logic.VERSIONS_COPY[l][k] === 'function').forEach(k => assert.ok(!/undefined|NaN/.test(logic.VERSIONS_COPY[l][k]('A')), l + k)));
  const src = fs.readFileSync('stocks.js', 'utf8');
  assert.ok(!/pillarsPct|\.breakdown/.test(src.replace(/allow-pillarsPct/g, '')), 'stocks.js never reads pillarsPct or breakdown');
});

check('stocks.js header: Search / Stocks / Methodology / API with Stocks current; footer links Stocks', () => {
  const src = fs.readFileSync('stocks.js', 'utf8');
  const i = src.indexOf("link('/?app=1'");
  const block = src.slice(i, i + 700);
  assert.ok(block.indexOf("'/stocks'") > 0 && block.indexOf("'/stocks'") < block.indexOf("'/methodology'") && block.indexOf("'/methodology'") < block.indexOf("'/mcp'"));
  assert.ok(/'\/stocks'[^\n]*aria-current/.test(block));
  assert.ok(src.includes("e('a', { href: '/stocks' }, rc.stocksLink"));
  assert.ok(fs.readFileSync('stocks.html', 'utf8').includes('data/stocks-versions.json'));
});

console.log('\n' + passed + ' checks passed');
