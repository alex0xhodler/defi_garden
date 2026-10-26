/* Offline gate for the /stocks token-versions data layer
   (generate-stocks-versions.js + api/_stocks-versions.js + ?view=versions).
   No network, no keys: every upstream is a fixture or a mocked fetch.
   Run: node test_stocks_versions.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gen = require('./generate-stocks-versions.js');
const ver = require('./api/_stocks-versions.js');
const handler = require('./api/stocks-onchain.js');

let passed = 0;
let queue = Promise.resolve();
function check(name, fn) {
  queue = queue.then(() => fn()).then(() => { passed++; console.log('  ✓ ' + name); }, (err) => {
    console.error('  ✗ ' + name + '\n    ' + (err && err.stack || err));
    process.exitCode = 1;
  });
}

const SOL_NVDA = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const BASE_NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const BSC_NVDA = '0xdedf549037c7e204ad90f2081f80b1c43fa40ef0';
const ETH_NVDA = '0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee';
const MEME = '0x8e16d46cb2da01cdd49601ec73d7b0344969ae33';

const registry = {
  issuers: {
    xstocks: { name: 'xStocks', legalEntity: 'Backed', jurisdiction: 'Jersey', usPersons: false, structure: 'SPV token', mintRedeem: { hours: '24/5', minUsd: null }, multiplier: { kind: 'issuer-design', value: 1, source: 'https://docs.xstocks.fi/developers/multipliers' }, sources: ['u1'] },
    coinbase: { name: 'Coinbase', legalEntity: 'CB SPV', jurisdiction: 'ADGM', usPersons: false, multiplier: { kind: 'issuer-api', source: 'https://api.coinbase.com/v1/tokenized-stocks' }, sources: [] },
    bstocks: { name: 'bStocks', legalEntity: 'BTech', jurisdiction: 'ADGM', usPersons: false, sources: [] },
    centrifuge: { name: 'Centrifuge', legalEntity: null, jurisdiction: null, usPersons: 'unknown', sources: [] }
  },
  cexSources: [
    { id: 'kraken', name: 'Kraken', docs: 'd', enabled: true, issuers: ['xstocks'] },
    { id: 'binance', name: 'Binance', docs: 'd', enabled: true, issuers: ['bstocks'] }
  ],
  tokens: {
    a: { symbol: 'NVDAX', underlying: 'NVDA', name: 'NVIDIA Corp', assetClass: 'equity', issuer: 'xStocks', issuerSlug: 'xstocks', issuerBasis: 'official-registry', chain: 'Solana', address: SOL_NVDA },
    b: { symbol: 'NVDAC', underlying: 'NVDA', name: 'NVIDIA Corp', assetClass: 'equity', issuer: 'Coinbase', issuerSlug: 'coinbase', issuerBasis: 'official-registry', chain: 'Base', address: BASE_NVDA },
    c: { symbol: 'NVDAB', underlying: 'NVDA', name: 'NVIDIA Corp', assetClass: 'equity', issuer: 'bStocks', issuerSlug: 'bstocks', issuerBasis: 'official-registry', chain: 'BSC', address: BSC_NVDA },
    d: { symbol: 'NVDAZ', underlying: 'NVDA', name: 'NVIDIA Corp', assetClass: 'equity', issuer: 'Centrifuge', issuerSlug: 'centrifuge', issuerBasis: 'onchain-name', chain: 'Ethereum', address: ETH_NVDA },
    e: { symbol: 'WNVDAX', underlying: 'NVDA', name: 'NVIDIA wrapped', assetClass: 'equity', issuer: 'xStocks', issuerSlug: 'xstocks', issuerBasis: 'official-registry', chain: 'Base', address: MEME, wrapper: true }
  }
};
const idSol = ver.versionKey('Solana', SOL_NVDA), idBase = ver.versionKey('Base', BASE_NVDA), idBsc = ver.versionKey('BSC', BSC_NVDA), idEth = ver.versionKey('Ethereum', ETH_NVDA), idWrap = ver.versionKey('Base', MEME);

const snapshot = {
  pools: [
    { pool: 'lp1', project: 'orca-dex', chain: 'Solana', poolType: 'cl', exposure: 'single', tier: 1, tvlUsd: 3000000, headlineApy: 20, honestProjection: 12, flags: ['forcedHighIL', 'x'],
      equityTokens: [{ address: SOL_NVDA }],
      defiScore: { score: 70, rating: 'A', pillarsTier: { stability: 'High', sustainability: 'Low', stickiness: 'Medium', liquidity: 'High' }, pillarsPct: { stability: 91 }, breakdown: { stability: 33 } } },
    { pool: 'lp2', project: 'raydium', chain: 'Solana', poolType: 'amm', exposure: 'single', tier: 3, tvlUsd: 150000, headlineApy: 300, honestProjection: 250, flags: ['thinLiquidity'], equityTokens: [{ address: SOL_NVDA }] },
    { pool: 'ln1', project: 'kamino-lend', chain: 'Solana', poolType: 'lending', exposure: 'single', tier: 1, tvlUsd: 2000000, headlineApy: 0.1, honestProjection: 0.1, flags: ['nearZeroYield'], equityTokens: [{ address: SOL_NVDA }] }
  ]
};
const NOW = Date.UTC(2026, 9, 26, 3, 0, 0) ; // Sun 2026-10-26 03:00Z, market closed
const market = ver.marketInfo(NOW);
const nowSec = Math.floor(NOW / 1000);

function ctx(over) {
  const prices = new Map([
    [idSol, { price: 211.5, ts: nowSec - 60, confidence: 0.99, decimals: 8 }],
    [idBase, { price: 211.0, ts: nowSec - 60, confidence: 0.99, decimals: 8 }],
    [idBsc, { price: 211.4, ts: nowSec - 60, confidence: 0.99, decimals: 18 }],
    [idEth, { price: 150, ts: nowSec - 60, confidence: 0.99, decimals: 18 }],
    [idWrap, { price: 212, ts: nowSec - 60, confidence: 0.99, decimals: 18 }]
  ]);
  return Object.assign({
    registry, snapshot, now: NOW, market, prices, rejected: new Map(),
    supply: new Map([[idBsc, { raw: 100n * 10n ** 18n, decimals: 18 }]]), solana: new Map([[idSol, { raw: 1000n * 10n ** 8n, decimals: 8, scale: 1.01 }]]),
    coinbase: new Map([[BASE_NVDA, { multiplier: 1.0005, total_supply: 50, nav_price: 211.8 }]]), coinbaseStatus: 'ok', robinhood: new Map(), robinhoodStatus: 'ok',
    sValue: new Map(), cex: new Map(), depths: new Map(), refClose: new Map([['NVDA', { price: 210, ts: market.lastRegularCloseTs - 1 }]]), refStatus: 'ok',
    cexMeta: [], issuersOut: {}, sources: {}
  }, over || {});
}

check('groups by underlying; verified only in versions, unverified apart', () => {
  const out = gen.buildVersions(ctx());
  const n = out.tickers.NVDA;
  assert.strictEqual(n.versions.length, 4);
  assert.ok(n.versions.every((v) => v.issuerSlug !== 'centrifuge'));
  assert.strictEqual(n.unverified.length, 1);
  assert.strictEqual(n.unverified[0].flag, 'Issuer unverified');
  assert.strictEqual(n.unverified[0].symbol, 'NVDAZ');
  assert.strictEqual(n.summary.versionCount, 4);
  assert.strictEqual(out.counts.tickersWithMultipleVerified, 1);
  assert.strictEqual(out.counts.unverifiedTokens, 1);
});

check('premium math: price / (multiplier x reference) - 1', () => {
  const out = gen.buildVersions(ctx());
  const byKey = {}; out.tickers.NVDA.versions.forEach((v) => { byKey[v.key] = v; });
  assert.strictEqual(byKey[idSol].multiplier, 1);
  assert.strictEqual(byKey[idSol].premiumVsClosePct, round3((211.5 / 210 - 1) * 100));
  assert.strictEqual(byKey[idBase].multiplier, 1.0005);
  assert.strictEqual(byKey[idBase].premiumVsClosePct, round3((211.0 / (1.0005 * 210) - 1) * 100));
  assert.strictEqual(out.tickers.NVDA.summary.premiumCount, 2);
  assert.strictEqual(out.tickers.NVDA.summary.premiumMinKey, idBase);
  assert.strictEqual(out.tickers.NVDA.summary.premiumMaxKey, idSol);
});
function round3(x) { return Math.round(x * 1000) / 1000; }

check('multiplier unknown or wrapped: flag set, NO premium computed', () => {
  const out = gen.buildVersions(ctx());
  const byKey = {}; out.tickers.NVDA.versions.forEach((v) => { byKey[v.key] = v; });
  assert.strictEqual(byKey[idBsc].multiplier, null);
  assert.strictEqual(byKey[idBsc].multiplierUnknown, true);
  assert.strictEqual(byKey[idBsc].premiumVsClosePct, null);
  assert.strictEqual(byKey[idBsc].reasons.premium, 'multiplier-unknown');
  assert.strictEqual(byKey[idWrap].multiplierUnknown, true);
  assert.strictEqual(byKey[idWrap].reasons.multiplier, 'wrapped-token');
  assert.strictEqual(byKey[idWrap].premiumVsClosePct, null);
});

check('premiumPct rails: no price / no reference / implausible gap', () => {
  assert.deepStrictEqual(ver.premiumPct(null, 1, 100), { pct: null, reason: 'no-price' });
  assert.deepStrictEqual(ver.premiumPct(100, null, 100), { pct: null, reason: 'multiplier-unknown' });
  assert.deepStrictEqual(ver.premiumPct(100, 1, null), { pct: null, reason: 'no-reference' });
  assert.deepStrictEqual(ver.premiumPct(100, 0, 100), { pct: null, reason: 'multiplier-unknown' });
  assert.deepStrictEqual(ver.premiumPct(200, 1, 100), { pct: null, reason: 'reference-mismatch' });
  assert.strictEqual(ver.premiumPct(101, 1, 100).pct, 1);
});

check('supply units: scaled-UI multiplier applied, USD only with a price, issuer API wins', () => {
  const out = gen.buildVersions(ctx());
  const byKey = {}; out.tickers.NVDA.versions.forEach((v) => { byKey[v.key] = v; });
  assert.strictEqual(byKey[idSol].supply, 1010);
  assert.strictEqual(byKey[idSol].supplyUsd, Math.round(1010 * 211.5));
  assert.strictEqual(byKey[idBase].supply, 50);
  assert.strictEqual(byKey[idBase].supplySource, 'issuer-api');
  assert.strictEqual(byKey[idBsc].supply, 100);
  assert.strictEqual(byKey[idWrap].supply, null);
  assert.strictEqual(byKey[idWrap].supplyUsd, null);
  assert.strictEqual(out.tickers.NVDA.summary.supplyKnownCount, 3);
});

check('liquidity sums pool TVL; best yield prefers tier 1-2 over a higher tier-3 rate', () => {
  const out = gen.buildVersions(ctx());
  const v = out.tickers.NVDA.versions.find((x) => x.key === idSol);
  assert.strictEqual(v.liquidity.tvlUsd, 5150000);
  assert.strictEqual(v.liquidity.pools, 3);
  assert.strictEqual(v.bestYield.lp.pool, 'lp1');
  assert.strictEqual(v.bestYield.lp.honestProjection, 12);
  assert.deepStrictEqual(v.bestYield.lp.flags, ['forcedHighIL']);
  assert.strictEqual(v.bestYield.lending.pool, 'ln1');
  assert.strictEqual(out.tickers.NVDA.summary.totalLiquidityUsd, 5150000);
  assert.strictEqual(out.tickers.NVDA.summary.bestYield.pool, 'lp1');
  const none = out.tickers.NVDA.versions.find((x) => x.key === idBase);
  assert.strictEqual(none.bestYield.lp, null);
  assert.strictEqual(none.liquidity.depth2pctUsd, null);
});

check('no pillar numbers or raw points anywhere in the output', () => {
  const s = JSON.stringify(gen.buildVersions(ctx()));
  assert.ok(!/pillarsPct|pillars_pct|breakdown/.test(s));
  assert.ok(!s.includes('"stability":91') && !s.includes(':33'));
  const sc = gen.buildVersions(ctx()).tickers.NVDA.versions.find((x) => x.key === idSol).bestYield.lp.defiScore;
  assert.deepStrictEqual(Object.keys(sc).sort(), ['pillarsTier', 'rating', 'score']);
  assert.deepStrictEqual(sc.pillarsTier, { stability: 'High', sustainability: 'Low', stickiness: 'Medium', liquidity: 'High' });
  const fullJson = fs.readFileSync(path.join(__dirname, 'generate-stocks-versions.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'api/_stocks-versions.js'), 'utf8');
  assert.ok(!/pillarsPct|pillars_pct|\.breakdown/.test(fullJson));
});

check('null-safety: every upstream empty still yields a well-formed result', () => {
  const out = gen.buildVersions(ctx({ prices: new Map(), supply: new Map(), solana: new Map(), coinbase: new Map(), coinbaseStatus: 'network', refClose: new Map(), refStatus: 'no-key', snapshot: { pools: [] } }));
  const v = out.tickers.NVDA.versions;
  assert.strictEqual(v.length, 4);
  v.forEach((x) => {
    assert.strictEqual(x.priceUsd, null); assert.strictEqual(x.supplyUsd, null);
    assert.strictEqual(x.premiumVsClosePct, null); assert.deepStrictEqual(x.cex, []);
    assert.strictEqual(x.liquidity.tvlUsd, 0); assert.strictEqual(x.bestYield.lp, null);
  });
  assert.strictEqual(out.tickers.NVDA.summary.premiumMinPct, null);
  assert.strictEqual(out.tickers.NVDA.summary.totalSupplyUsd, null);
  assert.strictEqual(out.tickers.NVDA.referenceClose, null);
  assert.strictEqual(out.referenceSource.status, 'no-key');
});

check('schema: required fields on every version, slim mirrors the full file', () => {
  const out = gen.buildVersions(ctx());
  ['schemaVersion', 'generatedAt', 'referenceSource', 'priceSource', 'tickers', 'counts'].forEach((k) => assert.ok(k in out, k));
  out.tickers.NVDA.versions.forEach((v) => {
    ['issuerSlug', 'chain', 'address', 'symbol', 'decimals', 'priceUsd', 'priceSource', 'priceTs', 'multiplier', 'supply', 'supplyUsd', 'liquidity', 'bestYield', 'risk', 'cex', 'premiumVsClosePct'].forEach((k) => assert.ok(k in v, k));
    ['legalEntity', 'jurisdiction', 'structure', 'usPersons', 'mintRedeemHours', 'redemptionMinUsd'].forEach((k) => assert.ok(k in v.risk, k));
  });
  const slim = gen.buildSlim(out);
  assert.strictEqual(slim.tickers.NVDA.v.length, 4);
  assert.strictEqual(slim.tickers.NVDA.refClose.p, 210);
  assert.ok(slim.tickers.NVDA.v.every((x) => x.k && x.a && x.c));
});

check('real registry: every verified token resolves a multiplier spec or is flagged unknown; wrappers marked', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/stocks-registry.json'), 'utf8'));
  const snap = require('./generate-stocks-snapshot.js');
  Object.keys(reg.tokens).forEach((k) => {
    const t = reg.tokens[k];
    assert.ok(reg.issuers[t.issuerSlug], 'issuer for ' + k);
    if (/^(WNVDAX|WT)/.test(t.symbol) && t.chain !== 'Mantle') assert.ok(t.wrapper === true || !snap.isVerifiedToken(t), 'wrapper flag ' + t.symbol);
  });
  (reg.cexSources || []).forEach((c) => { assert.ok(/^https:\/\//.test(c.docs), 'docs url ' + c.id); assert.ok(Array.isArray(c.issuers)); });
  Object.keys(reg.issuers).forEach((s) => { const i = reg.issuers[s]; if (i.structure) assert.ok(i.structureSource, 'structure needs a source ' + s); });
});

// ----------------------------------------------------------------- CEX ---

check('CEX parsers: kraken / bybit / binance / gate / mexc / bitget fixtures', () => {
  const k = gen.CEX_PARSERS.kraken({ result: { NVDAxUSD: { c: ['211.07', '0.5'], v: ['10', '100'], p: ['210', '211'] }, NVDASPVUSD: { c: ['1', '1'], v: ['1', '1'], p: ['1', '1'] } } });
  assert.deepStrictEqual(k, [{ base: 'NVDAX', quote: 'USD', pair: 'NVDAx/USD', last: 211.07, volumeUsd: 21100 }]);
  assert.deepStrictEqual(gen.CEX_PARSERS.bybit({ result: { list: [{ symbol: 'NVDAXUSDT', lastPrice: '211.76', turnover24h: '54686' }] } })[0], { base: 'NVDAX', quote: 'USDT', pair: 'NVDAXUSDT', last: 211.76, volumeUsd: 54686 });
  assert.strictEqual(gen.CEX_PARSERS.binance([{ symbol: 'NVDABUSDT', lastPrice: '211.33', quoteVolume: '99' }, { symbol: 'BTCEUR', lastPrice: '1', quoteVolume: '1' }]).length, 1);
  assert.strictEqual(gen.CEX_PARSERS.gate([{ currency_pair: 'NVDAX_USDT', last: '211.3', quote_volume: '5' }])[0].base, 'NVDAX');
  assert.strictEqual(gen.CEX_PARSERS.mexc([{ symbol: 'NVDAXUSDT', lastPrice: '1', quoteVolume: '2' }])[0].volumeUsd, 2);
  assert.strictEqual(gen.CEX_PARSERS.bitget({ data: [{ symbol: 'RAAPLUSDT', lastPr: '300', quoteVolume: '3' }] })[0].base, 'RAAPL');
  assert.deepStrictEqual(gen.CEX_PARSERS.kraken(null), []);
});

check('CEX matching: issuer allow-list, symbol equality, implausible price dropped', () => {
  const rowsBy = {
    kraken: [{ base: 'NVDAX', quote: 'USD', pair: 'NVDAx/USD', last: 211, volumeUsd: 10 }, { base: 'NVDAC', quote: 'USD', pair: 'x', last: 211, volumeUsd: 1 }],
    binance: [{ base: 'NVDAB', quote: 'USDT', pair: 'NVDABUSDT', last: 400, volumeUsd: 5 }]
  };
  const tokens = Object.keys(registry.tokens).map((k) => registry.tokens[k]);
  const m = gen.matchCex(tokens, registry, rowsBy, '2026-10-26T00:00:00.000Z');
  assert.strictEqual(m.get(idSol).length, 1);
  assert.strictEqual(m.get(idSol)[0].exchange, 'kraken');
  assert.ok(!m.has(idBase), 'coinbase token is not an allowed kraken issuer');
  const out = gen.buildVersions(ctx({ cex: m }));
  const sol = out.tickers.NVDA.versions.find((x) => x.key === idSol);
  assert.strictEqual(sol.cex[0].priceUsd, 211);
  assert.strictEqual(sol.cex[0].premiumVsClosePct, round3((211 / 210 - 1) * 100));
  const bsc = out.tickers.NVDA.versions.find((x) => x.key === idBsc);
  assert.deepStrictEqual(bsc.cex, [], 'a 400 USD print against a 211 on-chain price is dropped');
});

check('CEX fetch: disabled exchanges are not called; failures reduce to a status', async () => {
  const calls = [];
  const fetch = async (url) => { calls.push(url); if (/kraken/.test(url)) return { ok: true, json: async () => ({ result: {} }) }; return { ok: false, status: 500 }; };
  const reg = { cexSources: [{ id: 'kraken', enabled: true }, { id: 'binance', enabled: true }, { id: 'gate', enabled: false, disabledReason: 'terms' }] };
  const r = await gen.fetchCex({ fetch }, reg, true);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(r.status.kraken.status, 'ok');
  assert.strictEqual(r.status.binance.status, 'failed');
  assert.strictEqual(r.status.gate.status, 'disabled');
});

// ------------------------------------------------------------ live view ---

const PYTH_KEY = 'pk_TEST_SECRET_pyth';
const slim = {
  tickers: {
    NVDA: { refClose: { p: 210, ts: market.lastRegularCloseTs - 2, date: market.lastRegularCloseEtDate, src: 'pyth' },
      v: [{ k: idSol, c: 'Solana', a: SOL_NVDA, s: 'NVDAX', i: 'xstocks', m: 1 }, { k: idBsc, c: 'BSC', a: BSC_NVDA, s: 'NVDAB', i: 'bstocks', m: null }] }
  }
};
const feeds = { feeds: { NVDA: { id: 'ab'.repeat(32) } } };
function mkFetch(nowMs, log, pythPrice) {
  return async (url, init) => {
    log.push({ url, init });
    if (/prices\/current/.test(url)) {
      const coins = {};
      coins[idSol] = { price: 212.1, timestamp: Math.floor(nowMs / 1000) - 5, confidence: 0.99, decimals: 8 };
      coins[idBsc] = { price: 211.9, timestamp: Math.floor(nowMs / 1000) - 5, confidence: 0.99, decimals: 18 };
      return { ok: true, json: async () => ({ coins }) };
    }
    if (/hermes/.test(url) || /pyth/.test(url)) {
      if (!init || !init.headers) return { ok: false, status: 401 };
      return { ok: true, json: async () => ({ parsed: [{ id: 'ab'.repeat(32), price: { price: String(Math.round(pythPrice * 1e5)), expo: -5, publish_time: Math.floor(nowMs / 1000) - 3 } }] }) };
    }
    return { ok: false, status: 404 };
  };
}

check('live view, regular session: Pyth live reference, premium, unknown multiplier has none', async () => {
  ver.resetVersionsMemo();
  const wed = Date.UTC(2026, 9, 14, 15, 0, 0);
  const log = [];
  const v = await ver.buildVersionsView({ fetch: mkFetch(wed, log, 211), now: () => wed, env: { PYTH_API_KEY: PYTH_KEY }, slim, feeds });
  assert.strictEqual(v.referenceMode, 'live');
  const t = v.tickers.NVDA;
  assert.strictEqual(t.reference.kind, 'live');
  assert.strictEqual(t.reference.source, 'pyth');
  assert.strictEqual(t.versions[idSol].premiumPct, round3((212.1 / 211 - 1) * 100));
  assert.strictEqual(t.versions[idBsc].premiumPct, null);
  assert.strictEqual(t.versions[idBsc].reasons.premium, 'multiplier-unknown');
  assert.ok(!JSON.stringify(v).includes(PYTH_KEY));
});

check('live view, closed: last regular close from the slim file, labelled as such', async () => {
  ver.resetVersionsMemo();
  const log = [];
  const v = await ver.buildVersionsView({ fetch: mkFetch(NOW, log, 211), now: () => NOW, env: {}, slim, feeds });
  assert.strictEqual(v.referenceMode, 'last-close');
  assert.strictEqual(v.tickers.NVDA.reference.kind, 'last-close');
  assert.strictEqual(v.tickers.NVDA.reference.price, 210);
  assert.strictEqual(v.tickers.NVDA.versions[idSol].premiumPct, round3((212.1 / 210 - 1) * 100));
  assert.ok(!log.some((l) => /hermes|pyth/.test(l.url)), 'no Pyth call needed when the CI close is current');
});

check('live view, regular session without a Pyth key: no stale-close substitute, reason code', async () => {
  ver.resetVersionsMemo();
  const wed = Date.UTC(2026, 9, 14, 15, 0, 0);
  const v = await ver.buildVersionsView({ fetch: mkFetch(wed, [], 211), now: () => wed, env: {}, slim, feeds });
  assert.strictEqual(v.tickers.NVDA.reference, null);
  assert.strictEqual(v.tickers.NVDA.referenceReason, 'pyth-no-key');
  assert.strictEqual(v.tickers.NVDA.versions[idSol].premiumPct, null);
  assert.strictEqual(v.tickers.NVDA.versions[idSol].reasons.premium, 'pyth-no-key');
  assert.strictEqual(v.tickers.NVDA.versions[idSol].price, 212.1);
});

check('live view, stale slim close falls back to Pyth at the close, else null', async () => {
  ver.resetVersionsMemo();
  const stale = JSON.parse(JSON.stringify(slim)); stale.tickers.NVDA.refClose.ts -= 86400 * 3;
  const nowMs = NOW;
  const closeTs = market.lastRegularCloseTs;
  const fetch = async (url, init) => {
    if (/prices\/current/.test(url)) return { ok: true, json: async () => ({ coins: {} }) };
    return { ok: true, json: async () => ({ parsed: [{ id: 'ab'.repeat(32), price: { price: '21000000', expo: -5, publish_time: closeTs - 1 } }] }) };
  };
  const v = await ver.buildVersionsView({ fetch, now: () => nowMs, env: { PYTH_API_KEY: PYTH_KEY }, slim: stale, feeds });
  assert.strictEqual(v.tickers.NVDA.reference.price, 210);
  const v2 = await ver.buildVersionsView({ fetch, now: () => nowMs, env: {}, slim: stale, feeds });
  assert.strictEqual(v2.tickers.NVDA.reference, null);
  assert.strictEqual(v2.tickers.NVDA.referenceReason, 'pyth-no-key');
  assert.strictEqual(v2.tickers.NVDA.versions[idSol].reasons.price, 'price-unavailable');
});

check('live view: DefiLlama outage degrades to nulls, slim missing gives null (503 path)', async () => {
  ver.resetVersionsMemo();
  const fetch = async () => { throw new Error('boom ' + PYTH_KEY); };
  const v = await ver.buildVersionsView({ fetch, now: () => NOW, env: { PYTH_API_KEY: PYTH_KEY }, slim, feeds });
  assert.strictEqual(v.tickers.NVDA.versions[idSol].price, null);
  assert.strictEqual(v.sources.prices.status, 'partial');
  assert.ok(!JSON.stringify(v).includes(PYTH_KEY));
  assert.strictEqual(await ver.buildVersionsView({ fetch, now: () => NOW, env: {}, slim: null, feeds }), null);
});

check('handler: ?view=versions routes to the versions view, default route unchanged', async () => {
  const src = fs.readFileSync(path.join(__dirname, 'api/stocks-onchain.js'), 'utf8');
  assert.ok(/view === 'versions'/.test(src));
  assert.ok(typeof handler === 'function');
});

queue.then(() => {
  console.log(passed + ' checks passed' + (process.exitCode ? ' (with failures)' : ''));
});
