/* Offline gate for the /stocks live on-chain layer (api/stocks-onchain.js +
   api/_stocks-onchain.js). Every upstream is a mocked fetch: no network, no keys.
   Covers price batching + the confidence filter, drift math and its null
   cases, v2/v3 depth against hand-computed fixtures (independent python
   Decimal derivation, see comments), partial-failure behaviour, the cache memo,
   the handler contract and that the API keys never reach a response or a log.
   Run: node test_stocks_onchain.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('./api/_stocks-onchain.js');
const handler = require('./api/stocks-onchain.js');

let passed = 0;
let queue = Promise.resolve();
function check(name, fn) {
  queue = queue.then(() => fn()).then(() => { passed++; console.log('  ✓ ' + name); }, (err) => {
    console.error('  ✗ ' + name + '\n    ' + (err && err.stack || err));
    process.exitCode = 1;
  });
}

const KEY = 'ak_TEST_SECRET_0123456789';
const PYTH_KEY = 'pk_TEST_SECRET_abcdef';
const SAT = Date.UTC(2026, 9, 10, 15, 0, 0);   // Saturday 2026-10-10 15:00Z, market closed
const WED = Date.UTC(2026, 9, 14, 15, 0, 0);   // Wednesday 11:00 ET, regular session
const CLOSE_TS = 1791576000;                   // Fri 2026-10-09 16:00 EDT

const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const NVDA_BASE = '0xb20000000000000000000078ee7ce2fe4908108c';
const NVDA_SOL = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const AAPL_ETH = '0xAbCdEf0000000000000000000000000000000001';

function pool(over) {
  return Object.assign({
    pool: 'pool-' + Math.random().toString(36).slice(2), symbol: 'X', chain: 'Base', project: 'p', underlying: 'NVDA',
    tvlUsd: 2000000, equityTokens: [{ address: NVDA_BASE }],
    onchain: { ammType: 'uniswap-v4' }
  }, over || {});
}

function snapshot(pools) { return { pools }; }

// ---- mock fetch --------------------------------------------------------------
function mockFetch(handlers) {
  const calls = [];
  async function f(url, init) {
    calls.push({ url: String(url), init: init || {} });
    for (const [match, fn] of handlers) {
      if (typeof match === 'string' ? String(url).includes(match) : match.test(String(url))) {
        const out = await fn(String(url), init || {});
        if (out instanceof Error) throw out;
        return { ok: out.status === undefined || out.status < 400, status: out.status || 200, json: async () => out.body };
      }
    }
    throw new Error('unmocked fetch ' + url);
  }
  f.calls = calls;
  return f;
}
const coinsBody = (map) => ({ coins: map });
const nowSecOf = (ms) => Math.floor(ms / 1000);

function deps(over) {
  return Object.assign({ fetch: null, now: () => SAT, env: {}, snapshot: snapshot([]), feeds: { feeds: {} }, addresses: { pools: {} } }, over);
}

// ============================================================ prices ==========

check('prices: one batched call, EVM lowercased, Solana case-exact, confidence/missing/stale rejected', async () => {
  const f = mockFetch([['/prices/current/', (url) => {
    assert.ok(url.includes('base:' + NVDA_BASE), 'EVM address is lowercase');
    assert.ok(url.includes('solana:' + NVDA_SOL), 'Solana address keeps its case');
    const t = nowSecOf(WED) - 60;
    return { body: coinsBody({
      ['base:' + NVDA_BASE]: { price: 229.9, confidence: 0.99, timestamp: t },
      ['solana:' + NVDA_SOL]: { price: 100, confidence: 0.5, timestamp: t },
      ['ethereum:' + AAPL_ETH.toLowerCase()]: { price: 300, confidence: 0.99, timestamp: nowSecOf(WED) - 3 * 3600 }
    }) };
  }]]);
  const ids = ['base:' + NVDA_BASE, 'solana:' + NVDA_SOL, 'ethereum:' + AAPL_ETH.toLowerCase(), 'bsc:0xmissing'];
  const r = await core.fetchPrices(deps({ fetch: f, now: () => WED }), ids);
  assert.strictEqual(f.calls.length, 1);
  assert.strictEqual(r.prices.get('base:' + NVDA_BASE).price, 229.9);
  assert.strictEqual(r.rejected.get('solana:' + NVDA_SOL), 'low-confidence');
  assert.strictEqual(r.rejected.get('ethereum:' + AAPL_ETH.toLowerCase()), 'stale-price');
  assert.strictEqual(r.rejected.get('bsc:0xmissing'), 'price-unavailable');
  assert.strictEqual(r.failed, null);
});

check('prices: more than 40 tokens split into several calls', async () => {
  const ids = [];
  for (let i = 0; i < 95; i++) ids.push('base:0x' + String(i).padStart(40, '0'));
  const f = mockFetch([['/prices/current/', (url) => {
    const coins = {};
    url.split('/prices/current/')[1].split(',').forEach((id) => { coins[id] = { price: 10, confidence: 0.99, timestamp: nowSecOf(WED) }; });
    return { body: coinsBody(coins) };
  }]]);
  const r = await core.fetchPrices(deps({ fetch: f, now: () => WED }), ids);
  assert.strictEqual(f.calls.length, 3);
  assert.strictEqual(r.prices.size, 95);
});

check('prices: honours LLAMA_COINS_BASE', async () => {
  const f = mockFetch([['https://llama.example/prices/current/', () => ({ body: coinsBody({}) })]]);
  await core.fetchPrices(deps({ fetch: f, env: { LLAMA_COINS_BASE: 'https://llama.example/' } }), ['base:0xabc']);
  assert.ok(f.calls[0].url.startsWith('https://llama.example/prices/current/'));
});

check('prices: every registry chain has a DefiLlama slug; unknown chains yield no coin id', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'stocks-registry.json'), 'utf8'));
  const chains = new Set(Object.values(reg.tokens).map((t) => t.chain));
  chains.forEach((c) => assert.ok(core.LLAMA_CHAIN_SLUGS[c], 'slug for ' + c));
  assert.strictEqual(core.coinId('Mars', '0xabc'), null);
  assert.strictEqual(core.coinId('Hyperliquid L1', '0xABC'), 'hyperliquid:0xabc');
  assert.strictEqual(core.coinId('Robinhood Chain', '0xABC'), 'robinhood:0xabc');
});

check('prices: an upstream failure is a reason code, not a throw, and carries no error text', async () => {
  const f = mockFetch([['/prices/current/', () => new Error('socket hang up https://x/?key=' + KEY)]]);
  const r = await core.fetchPrices(deps({ fetch: f }), ['base:0xabc']);
  assert.strictEqual(r.rejected.get('base:0xabc'), 'prices-network');
  assert.ok(!JSON.stringify([r.failed, Array.from(r.rejected)]).includes(KEY));
});

// ============================================================ drift ===========

check('drift math: (price / reference - 1) in percent, null without or with an implausible reference', () => {
  assert.strictEqual(core.driftFrom(229.9, { price: 225 }), 2.178);
  assert.strictEqual(core.driftFrom(95, { price: 100 }), -5);
  assert.strictEqual(core.driftFrom(100, null), null);
  assert.strictEqual(core.driftFrom(100, { price: 0 }), null);
  assert.strictEqual(core.driftFrom(NaN, { price: 100 }), null);
  assert.strictEqual(core.driftFrom(200, { price: 100 }), null, '+100% is a multiplier mismatch, not a gap');
});

function weekendFetch(opts) {
  opts = opts || {};
  const handlers = [
    ['/prices/current/', () => ({ body: coinsBody({ ['base:' + NVDA_BASE]: { price: 230, confidence: 0.99, timestamp: nowSecOf(SAT) - 120 } }) })],
    ['/prices/historical/', (url) => {
      assert.ok(url.includes('/prices/historical/' + CLOSE_TS + '/'), 'queries the close timestamp');
      if (opts.noHistorical) return { body: coinsBody({}) };
      return { body: coinsBody({ ['base:' + NVDA_BASE]: { price: 225, confidence: 0.99, timestamp: CLOSE_TS - 30 } }) };
    }]
  ];
  if (opts.pyth) handlers.push(['/v2/updates/price/latest', opts.pyth]);
  return mockFetch(handlers);
}
const feeds = { feeds: { NVDA: { id: 'a'.repeat(64), symbol: 'Equity.US.NVDA/USD' } } };
const v4pool = () => pool({ pool: 'p-nvda' });

check('drift: closed market without a Pyth key falls back to the token price at the close, labelled', async () => {
  core.resetMemo();
  const f = weekendFetch();
  const res = await core.buildResponse(deps({ fetch: f, snapshot: snapshot([v4pool()]), feeds }));
  const p = res.pools[0];
  assert.strictEqual(p.price, 230);
  assert.strictEqual(p.drift, 2.222);
  assert.strictEqual(p.driftRef.source, 'defillama-token');
  assert.strictEqual(p.driftRef.kind, 'last-close');
  assert.strictEqual(res.market.state, 'weekend');
  assert.strictEqual(res.market.isRegularSession, false);
  assert.strictEqual(res.market.lastRegularClose, '2026-10-09T20:00:00.000Z');
  assert.strictEqual(res.sources.reference.pyth, 'no-key');
  assert.ok(!f.calls.some((c) => c.url.includes('/v2/updates/price')), 'no Pyth call without a key');
});

check('drift: Pyth underlying close is preferred when keyed and printed at the close', async () => {
  core.resetMemo();
  const f = weekendFetch({ pyth: (url, init) => {
    assert.strictEqual(init.headers.Authorization, 'Bearer ' + PYTH_KEY);
    assert.ok(url.includes('ids[]=' + 'a'.repeat(64)));
    return { body: { parsed: [{ id: 'a'.repeat(64), price: { price: '22900000', expo: -5, publish_time: CLOSE_TS - 2 } }] } };
  } });
  const res = await core.buildResponse(deps({ fetch: f, env: { PYTH_API_KEY: PYTH_KEY }, snapshot: snapshot([v4pool()]), feeds }));
  const p = res.pools[0];
  assert.strictEqual(p.driftRef.source, 'pyth');
  assert.strictEqual(p.driftRef.price, 229);
  assert.strictEqual(p.drift, 0.437); // 230 / 229 - 1
  assert.ok(!JSON.stringify(res).includes(PYTH_KEY));
});

check('drift: a Pyth print that is not at the close is rejected (falls back, never used)', async () => {
  core.resetMemo();
  const f = weekendFetch({ pyth: () => ({ body: { parsed: [{ id: 'a'.repeat(64), price: { price: '22900000', expo: -5, publish_time: CLOSE_TS + 6 * 3600 } }] } }) });
  const res = await core.buildResponse(deps({ fetch: f, env: { PYTH_API_KEY: PYTH_KEY }, snapshot: snapshot([v4pool()]), feeds }));
  assert.strictEqual(res.pools[0].driftRef.source, 'defillama-token');
});

check('drift: null with a reason when no reference exists or the market is open', async () => {
  core.resetMemo();
  const none = await core.buildResponse(deps({ fetch: weekendFetch({ noHistorical: true }), snapshot: snapshot([v4pool()]), feeds }));
  assert.strictEqual(none.pools[0].drift, null);
  assert.strictEqual(none.pools[0].driftRef, null);
  assert.strictEqual(none.pools[0].reasons.drift, 'reference-unavailable');

  core.resetMemo();
  const f = weekendFetch();
  const open = await core.buildResponse(deps({ fetch: f, now: () => WED, snapshot: snapshot([v4pool()]), feeds }));
  assert.strictEqual(open.pools[0].drift, null);
  assert.strictEqual(open.pools[0].reasons.drift, 'market-open');
  assert.strictEqual(open.market.isRegularSession, true);
  assert.ok(!f.calls.some((c) => c.url.includes('/prices/historical/')), 'no reference fetch during the session');
});

check('drift: no price means no drift; a calendar outside the covered years never guesses', async () => {
  core.resetMemo();
  const f = mockFetch([['/prices/current/', () => ({ body: coinsBody({}) })], ['/prices/historical/', () => ({ body: coinsBody({}) })]]);
  const res = await core.buildResponse(deps({ fetch: f, snapshot: snapshot([v4pool()]), feeds }));
  assert.strictEqual(res.pools[0].price, null);
  assert.strictEqual(res.pools[0].reasons.price, 'price-unavailable');
  assert.strictEqual(res.pools[0].reasons.drift, 'no-price');

  core.resetMemo();
  const stale = await core.buildResponse(deps({ fetch: mockFetch([['/prices/current/', () => ({ body: coinsBody({}) })]]), now: () => Date.UTC(2031, 0, 8, 15), snapshot: snapshot([v4pool()]), feeds }));
  assert.strictEqual(stale.pools[0].reasons.drift, 'calendar-stale');
});

check('multi-equity pools and unsupported chains get no price and a reason', async () => {
  core.resetMemo();
  const f = mockFetch([['/prices/current/', () => ({ body: coinsBody({}) })], ['/prices/historical/', () => ({ body: coinsBody({}) })]]);
  const res = await core.buildResponse(deps({
    fetch: f,
    snapshot: snapshot([pool({ pool: 'multi', equityTokens: [{ address: NVDA_BASE }, { address: USDC_BASE }] }), pool({ pool: 'mars', chain: 'Mars' })]),
    feeds
  }));
  assert.strictEqual(res.pools[0].reasons.price, 'multi-equity-pool');
  assert.strictEqual(res.pools[1].reasons.price, 'chain-unsupported');
});

// ============================================================ depth math ======
// Fixtures derived independently (python Decimal, virtual reserves x = L/s,
// y = L*s, constant product after the move) and pasted here as plain numbers.

check('v3 depth, equity = token0 (18 dec) vs USDC token1 (6 dec) at $200, L = 1e20', () => {
  const d = core.v3Depth({ sqrtPriceX96: 1120455419495722798374639n, liquidity: 10n ** 20n, decimals0: 18, decimals1: 6, equitySide: 0 });
  assert.ok(Math.abs(d.priceUsd - 200) < 1e-6, 'pool price ' + d.priceUsd);
  assert.ok(Math.abs(d.buyUsd - 14072123.3355) < 0.01, 'buy ' + d.buyUsd);
  assert.ok(Math.abs(d.sellUsd - 14357866.1983) < 0.01, 'sell ' + d.sellUsd);
  assert.strictEqual(d.depthUsd, d.buyUsd, 'depth is the smaller side');
  assert.strictEqual(d.model, 'v3-active-liquidity');
});

check('v3 depth, equity = token1 (18 dec) vs USDC token0 (6 dec) at $200, L = 1e19', () => {
  const d = core.v3Depth({ sqrtPriceX96: 5602277097478613991873193822745817n, liquidity: 10n ** 19n, decimals0: 6, decimals1: 18, equitySide: 1 });
  assert.ok(Math.abs(d.priceUsd - 200) < 1e-6, 'pool price ' + d.priceUsd);
  assert.ok(Math.abs(d.buyUsd - 1407212.3335) < 0.01, 'buy ' + d.buyUsd);
  assert.ok(Math.abs(d.sellUsd - 1435786.6198) < 0.01, 'sell ' + d.sellUsd);
  assert.strictEqual(d.depthUsd, d.buyUsd);
});

check('v3 depth: zero liquidity or zero price is null, not 0', () => {
  assert.strictEqual(core.v3Depth({ sqrtPriceX96: 1n << 96n, liquidity: 0n, decimals0: 18, decimals1: 6, equitySide: 0 }), null);
  assert.strictEqual(core.v3Depth({ sqrtPriceX96: 0n, liquidity: 5n, decimals0: 18, decimals1: 6, equitySide: 0 }), null);
});

check('v2 depth from reserves: 5,000 equity (18 dec) / 1,000,000 USDC (6 dec) -> $9,950.49 buy, $10,152.54 sell', () => {
  const d = core.v2Depth({ reserveEquity: 5000n * 10n ** 18n, reserveQuote: 1000000n * 10n ** 6n, decimalsEquity: 18, decimalsQuote: 6 });
  assert.ok(Math.abs(d.priceUsd - 200) < 1e-9);
  assert.ok(Math.abs(d.buyUsd - 9950.49383620783) < 1e-6);
  assert.ok(Math.abs(d.sellUsd - 10152.544552210597) < 1e-6);
  assert.strictEqual(d.depthUsd, d.buyUsd);
  assert.strictEqual(d.model, 'v2-reserves');
  assert.strictEqual(core.v2Depth({ reserveEquity: 0n, reserveQuote: 1n, decimalsEquity: 18, decimalsQuote: 6 }), null);
});

// ============================================================ RPC depth =======

const POOL_ADDR = '0x00000000000000000000000000000000000000aa';
const hex32 = (n) => BigInt(n).toString(16).padStart(64, '0');
const slot0Hex = (sqrt) => '0x' + hex32(sqrt) + '0'.repeat(64 * 6);
const addrEntry = {
  kind: 'uniswap-v3', address: POOL_ADDR, equitySide: 0,
  token0: { address: NVDA_BASE, decimals: 18 }, token1: { address: USDC_BASE, decimals: 6 }
};

function rpcFetch(opts) {
  opts = opts || {};
  return mockFetch([
    ['alchemy.com', (url, init) => {
      const body = JSON.parse(init.body);
      if (opts.fail) return new Error('boom ' + url);
      return { body: body.map((c) => {
        if (c.params[0].data === core.SEL.slot0) return { id: c.id, result: slot0Hex(opts.sqrt || 1120455419495722798374639n) };
        if (c.params[0].data === core.SEL.liquidity) return { id: c.id, result: '0x' + hex32(opts.liquidity === undefined ? 10n ** 20n : opts.liquidity) };
        return { id: c.id, error: { code: -32000, message: 'nope' } };
      }) };
    }],
    ['/prices/current/', () => ({ body: coinsBody({ ['base:' + NVDA_BASE]: { price: opts.llamaPrice || 200, confidence: 0.99, timestamp: nowSecOf(WED) - 30 } }) })]
  ]);
}
const v3pool = (over) => pool(Object.assign({ pool: 'p-v3', tvlUsd: 100000000, onchain: { ammType: 'uniswap-v3' } }, over || {}));

check('rpc depth: v3 pool with a resolved address returns the +-2% figure labelled rpc', async () => {
  core.resetMemo();
  const f = rpcFetch();
  const res = await core.buildResponse(deps({
    fetch: f, now: () => WED, env: { ALCHEMY_API_KEY: KEY }, snapshot: snapshot([v3pool()]), addresses: { pools: { 'p-v3': addrEntry } }
  }));
  const p = res.pools[0];
  assert.strictEqual(p.depthSource, 'rpc');
  assert.strictEqual(p.depth2pct, 14072123);
  assert.strictEqual(p.depthModel, 'v3-active-liquidity');
  assert.ok(f.calls.some((c) => c.url === 'https://base-mainnet.g.alchemy.com/v2/' + KEY), 'alchemy base network URL');
  assert.strictEqual(f.calls.filter((c) => c.url.includes('alchemy')).length, 1, 'one batched RPC call per chain');
  assert.strictEqual(res.sources.rpc.status, 'ok');
  assert.ok(!JSON.stringify(res).includes(KEY));
});

check('rpc depth: capped at half the pool TVL (active-liquidity approximation is an upper bound)', async () => {
  core.resetMemo();
  const res = await core.buildResponse(deps({
    fetch: rpcFetch(), now: () => WED, env: { ALCHEMY_API_KEY: KEY }, snapshot: snapshot([v3pool({ tvlUsd: 2000000 })]), addresses: { pools: { 'p-v3': addrEntry } }
  }));
  assert.strictEqual(res.pools[0].depth2pct, 1000000);
  assert.strictEqual(res.pools[0].depthCapped, true);
});

check('rpc depth: a pool price far from the DefiLlama price is dropped (wrong pool / decimals)', async () => {
  core.resetMemo();
  const res = await core.buildResponse(deps({
    fetch: rpcFetch({ llamaPrice: 500 }), now: () => WED, env: { ALCHEMY_API_KEY: KEY }, snapshot: snapshot([v3pool()]), addresses: { pools: { 'p-v3': addrEntry } }
  }));
  assert.strictEqual(res.pools[0].depth2pct, null);
  assert.strictEqual(res.pools[0].depthSource, 'heuristic');
  assert.strictEqual(res.pools[0].reasons.depth, 'price-mismatch');
});

check('rpc depth: zero active liquidity reports no-liquidity, not a 0 depth', async () => {
  core.resetMemo();
  const res = await core.buildResponse(deps({
    fetch: rpcFetch({ liquidity: 0n }), now: () => WED, env: { ALCHEMY_API_KEY: KEY }, snapshot: snapshot([v3pool()]), addresses: { pools: { 'p-v3': addrEntry } }
  }));
  assert.strictEqual(res.pools[0].reasons.depth, 'no-liquidity');
});

check('no ALCHEMY_API_KEY: depth degrades to rpc-unavailable (resolvable pools) / no-resolver (the rest), price still served', async () => {
  core.resetMemo();
  const f = rpcFetch();
  const res = await core.buildResponse(deps({
    fetch: f, now: () => WED, env: {}, snapshot: snapshot([v3pool(), pool({ pool: 'p-v4' })]), addresses: { pools: { 'p-v3': addrEntry } }
  }));
  assert.strictEqual(res.pools[0].depth2pct, null);
  assert.strictEqual(res.pools[0].depthSource, 'heuristic');
  assert.strictEqual(res.pools[0].reasons.depth, 'rpc-unavailable');
  assert.strictEqual(res.pools[1].reasons.depth, 'no-resolver');
  assert.strictEqual(res.pools[0].price, 200);
  assert.strictEqual(res.sources.rpc.reason, 'rpc-unavailable');
  assert.ok(!f.calls.some((c) => c.url.includes('alchemy')));
});

check('chains without an Alchemy network and unresolved addresses degrade per pool', async () => {
  core.resetMemo();
  const res = await core.buildResponse(deps({
    fetch: rpcFetch(), now: () => WED, env: { ALCHEMY_API_KEY: KEY },
    snapshot: snapshot([
      v3pool({ pool: 'rh', chain: 'Robinhood Chain' }),
      v3pool({ pool: 'nores' })
    ]),
    addresses: { pools: {} }
  }));
  assert.strictEqual(res.pools[0].reasons.depth, 'chain-unsupported');
  assert.strictEqual(res.pools[1].reasons.depth, 'pool-address-unresolved');
});

check('partial failure: an RPC outage leaves prices intact and never throws; the key is not echoed', async () => {
  core.resetMemo();
  const logged = [];
  const origErr = console.error; const origLog = console.log; const origWarn = console.warn;
  console.error = console.log = console.warn = (...a) => logged.push(a.join(' '));
  let res;
  try {
    res = await core.buildResponse(deps({
      fetch: rpcFetch({ fail: true }), now: () => WED, env: { ALCHEMY_API_KEY: KEY }, snapshot: snapshot([v3pool()]), addresses: { pools: { 'p-v3': addrEntry } }
    }));
  } finally { console.error = origErr; console.log = origLog; console.warn = origWarn; }
  assert.strictEqual(res.pools[0].price, 200);
  assert.strictEqual(res.pools[0].depth2pct, null);
  assert.strictEqual(res.pools[0].reasons.depth, 'rpc-network');
  assert.strictEqual(res.sources.rpc.status, 'failed');
  assert.ok(!JSON.stringify(res).includes(KEY));
  assert.ok(!logged.join('\n').includes(KEY));
});

check('partial failure: prices down -> every pool still present with null price and a reason', async () => {
  core.resetMemo();
  const f = mockFetch([['/prices/', () => ({ status: 503, body: {} })]]);
  const res = await core.buildResponse(deps({ fetch: f, snapshot: snapshot([v4pool(), pool({ pool: 'b' })]), feeds }));
  assert.strictEqual(res.pools.length, 2);
  assert.strictEqual(res.pools[0].price, null);
  assert.strictEqual(res.pools[0].reasons.price, 'prices-http-503');
  assert.strictEqual(res.sources.prices.status, 'partial');
});

check('timeout: a hung upstream is abandoned after the per-call limit', async () => {
  const hung = async (_u, init) => new Promise((_res, rej) => { init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
  const t0 = Date.now();
  const r = await core.httpJson({ fetch: hung }, 'https://x.example/?k=' + KEY, {}, 50);
  assert.strictEqual(r.reason, 'timeout');
  assert.ok(Date.now() - t0 < 1000);
  assert.ok(!JSON.stringify(r).includes(KEY));
  assert.strictEqual(core.UPSTREAM_TIMEOUT_MS, 4000);
});

// ============================================================ cache + handler =

check('memo: two calls inside 60s hit upstream once; after 60s they rebuild', async () => {
  core.resetMemo();
  let t = SAT;
  const f = mockFetch([['/prices/', () => ({ body: coinsBody({}) })]]);
  const d = deps({ fetch: f, now: () => t, snapshot: snapshot([v4pool()]), feeds });
  await core.getOnchain(d);
  const first = f.calls.length;
  t += 30000;
  await core.getOnchain(d);
  assert.strictEqual(f.calls.length, first);
  t += 31000;
  await core.getOnchain(d);
  assert.ok(f.calls.length > first);
  core.resetMemo();
});

function invoke(method) {
  return new Promise((resolve) => {
    const res = { status: null, headers: {}, writeHead(s, h) { this.status = s; this.headers = h || {}; }, end(b) { resolve({ status: this.status, headers: this.headers, body: b }); } };
    handler({ method }, res);
  });
}

check('handler: GET is 200 JSON with the CDN cache header; other methods 405; the body never carries a key', async () => {
  core.resetMemo();
  const realFetch = globalThis.fetch;
  const origKey = process.env.ALCHEMY_API_KEY; const origPyth = process.env.PYTH_API_KEY;
  process.env.ALCHEMY_API_KEY = KEY; process.env.PYTH_API_KEY = PYTH_KEY;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/prices/')) return { ok: true, status: 200, json: async () => coinsBody({}) };
    throw new Error('network down ' + url);
  };
  try {
    const ok = await invoke('GET');
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.headers['Cache-Control'], 'public, s-maxage=60, stale-while-revalidate=300');
    assert.ok(/application\/json/.test(ok.headers['Content-Type']));
    const body = JSON.parse(ok.body);
    assert.ok(Array.isArray(body.pools) && body.pools.length > 100, 'covers the committed snapshot');
    assert.ok(body.generatedAt && body.market && body.sources);
    assert.ok(!ok.body.includes(KEY) && !ok.body.includes(PYTH_KEY));
    body.pools.forEach((p) => { assert.strictEqual(typeof p.pool, 'string'); assert.ok(p.depthSource === 'rpc' || p.depthSource === 'heuristic'); });
    const post = await invoke('POST');
    assert.strictEqual(post.status, 405);
    const opt = await invoke('OPTIONS');
    assert.strictEqual(opt.status, 204);
  } finally {
    globalThis.fetch = realFetch;
    if (origKey === undefined) delete process.env.ALCHEMY_API_KEY; else process.env.ALCHEMY_API_KEY = origKey;
    if (origPyth === undefined) delete process.env.PYTH_API_KEY; else process.env.PYTH_API_KEY = origPyth;
    core.resetMemo();
  }
});

check('handler: an unreadable snapshot is a 503 that is not cached', async () => {
  core.resetMemo();
  const realRead = fs.readFileSync;
  const realFetch = globalThis.fetch;
  fs.readFileSync = function (p) { if (String(p).endsWith('stocks-snapshot.json')) throw new Error('ENOENT'); return realRead.apply(this, arguments); };
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const r = await invoke('GET');
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.headers['Cache-Control'], 'no-store');
  } finally { fs.readFileSync = realRead; globalThis.fetch = realFetch; core.resetMemo(); }
});

// ============================================================ deploy wiring ===

check('deploy: the function, its core and its data files are not excluded by .vercelignore', () => {
  const ignore = fs.readFileSync(path.join(__dirname, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  ['/api/stocks-onchain.js', '/api/_stocks-onchain.js', '/data/stocks-snapshot.json', '/data/stocks-pyth-feeds.json',
    '/data/stocks-pool-addresses.json', '/stocks-market-clock.js'].forEach((f) => {
    ignore.forEach((pat) => {
      if (pat.endsWith('/')) assert.ok(!f.startsWith(pat), f + ' hidden by ' + pat);
      else {
        const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
        assert.ok(!re.test(f), f + ' hidden by ' + pat);
      }
    });
  });
});

check('deploy: the committed Pyth feed map is exact-symbol only and covers the registry', () => {
  const feedsFile = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'stocks-pyth-feeds.json'), 'utf8'));
  Object.entries(feedsFile.feeds).forEach(([ticker, f]) => {
    assert.ok(/^[0-9a-f]{64}$/.test(f.id));
    assert.strictEqual(f.symbol, 'Equity.US.' + ticker.replace(/\./g, '-') + '/USD');
  });
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'stocks-registry.json'), 'utf8'));
  const unders = new Set(Object.values(reg.tokens).map((t) => t.underlying));
  unders.forEach((u) => assert.ok(feedsFile.feeds[u] || feedsFile.missing.includes(u), u + ' is mapped or listed missing'));
});

queue.then(() => { console.log(`\n${passed} passed`); });
