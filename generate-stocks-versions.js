#!/usr/bin/env node
/**
 * /stocks "token versions" data layer.
 *
 * For each underlying (NVDA, TSLA, SPY...) lists every VERIFIED tokenized
 * version (issuer basis in VERIFIED_BASES) side by side: on-chain price,
 * multiplier, premium vs the real share, supply, liquidity, best yield, issuer
 * risk facts and centralized-exchange prices. Unverified tokens go to a separate
 * `unverified` array and never enter a comparison or a summary.
 *
 * Writes data/stocks-versions.json (full) and data/stocks-versions-slim.json
 * (the input of the live `?view=versions` mode of api/stocks-onchain.js).
 * Both are generated outputs (scripts/site-outputs.txt), never committed.
 * Run AFTER generate-stocks-snapshot.js.
 *
 * Data sources, per field:
 *   priceUsd        DefiLlama coins /prices/current (aggregator of on-chain prices)
 *   multiplier      xStocks: issuer design, 1 scaled token = 1 share (docs.xstocks.fi/developers/multipliers)
 *                   Coinbase: https://api.coinbase.com/v1/tokenized-stocks (multiplier)
 *                   Robinhood: https://api.robinhood.com/rhj/assets (currentMultiplier)
 *                   Ondo: SyntheticSharesOracle.getSValue (EVM RPC; needs ALCHEMY_KEY or --public-rpc)
 *                   others: unknown -> null + multiplierUnknown, no premium
 *   supply          Coinbase API total_supply; EVM totalSupply() via Alchemy (ALCHEMY_KEY);
 *                   Solana mint account (getMultipleAccounts, Alchemy or public RPC) x scaled-UI multiplier
 *   liquidity       data/stocks-snapshot.json pools; best +-2% depth from api/_stocks-onchain.js (needs ALCHEMY_KEY)
 *   referenceClose  Pyth Hermes at the last regular close (needs PYTH_API_KEY; null otherwise)
 *   cex             public ticker endpoints listed in data/stocks-registry.json cexSources
 *
 * Usage: node generate-stocks-versions.js [--out <dir>] [--public-rpc]
 * Env:   ALCHEMY_KEY (or ALCHEMY_API_KEY), PYTH_API_KEY (optional). Secrets are
 *        used for request URLs/headers only, never logged or written.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const snap = require('./generate-stocks-snapshot.js');
const core = require('./api/_stocks-onchain.js');
const ver = require('./api/_stocks-versions.js');

const isNum = core.isNum;
const round = core.round;
const EXPLICIT_TERMS = 'USDT|USDC|USD';
const PUBLIC_RPC = {
  Ethereum: 'https://ethereum-rpc.publicnode.com', Base: 'https://base-rpc.publicnode.com',
  BSC: 'https://bsc-rpc.publicnode.com', Arbitrum: 'https://arbitrum-one-rpc.publicnode.com'
};
const SOLANA_PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const SEL_TOTAL_SUPPLY = '0x18160ddd';
const SEL_DECIMALS = '0x313ce567';
const SEL_GET_SVALUE = '0x0a562827'; // getSValue(address)
const CEX_MAX_DEVIATION = 0.25;
const ROBINHOOD_CHAIN_ID = 4663;

const normAddr = snap.normalizeAddress;
const keyOf = (t) => ver.versionKey(t.chain, t.address);
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------------------------------------------------------------- parsers ---

function stripQuote(sym) {
  const m = String(sym).toUpperCase().match(new RegExp('^(.+?)(' + EXPLICIT_TERMS + ')$'));
  return m ? { base: m[1], quote: m[2] } : null;
}
const num = (v) => { const n = Number(v); return isNum(n) ? n : null; };

// Each parser returns rows [{base, quote, pair, last, volumeUsd}] (base normalised).
const CEX_PARSERS = {
  kraken: (json) => {
    const out = [];
    Object.keys((json && json.result) || {}).forEach((k) => {
      const m = k.match(/^(.+)xUSD$/); // 'NVDAxUSD'; the SPV-suffixed duplicates are skipped
      const t = json.result[k];
      if (!m || !t || !Array.isArray(t.c)) return;
      const last = num(t.c[0]);
      const vol = num(t.v && t.v[1]), vwap = num(t.p && t.p[1]);
      out.push({ base: norm(m[1] + 'x'), quote: 'USD', pair: m[1] + 'x/USD', last, volumeUsd: vol !== null && vwap !== null ? round(vol * vwap, 0) : null });
    });
    return out;
  },
  bybit: (json) => ((json && json.result && json.result.list) || []).map((x) => {
    const q = stripQuote(x.symbol); if (!q) return null;
    return { base: norm(q.base), quote: q.quote, pair: x.symbol, last: num(x.lastPrice), volumeUsd: num(x.turnover24h) };
  }).filter(Boolean),
  binance: (json) => (Array.isArray(json) ? json : []).map((x) => {
    const q = stripQuote(x.symbol); if (!q) return null;
    return { base: norm(q.base), quote: q.quote, pair: x.symbol, last: num(x.lastPrice), volumeUsd: num(x.quoteVolume) };
  }).filter(Boolean),
  mexc: (json) => (Array.isArray(json) ? json : []).map((x) => {
    const q = stripQuote(x.symbol); if (!q) return null;
    return { base: norm(q.base), quote: q.quote, pair: x.symbol, last: num(x.lastPrice), volumeUsd: num(x.quoteVolume) };
  }).filter(Boolean),
  gate: (json) => (Array.isArray(json) ? json : []).map((x) => {
    const m = String(x.currency_pair || '').match(/^(.+)_(USDT|USDC|USD)$/); if (!m) return null;
    return { base: norm(m[1]), quote: m[2], pair: x.currency_pair, last: num(x.last), volumeUsd: num(x.quote_volume) };
  }).filter(Boolean),
  bitget: (json) => ((json && json.data) || []).map((x) => {
    const q = stripQuote(x.symbol); if (!q) return null;
    return { base: norm(q.base), quote: q.quote, pair: x.symbol, last: num(x.lastPr), volumeUsd: num(x.quoteVolume) };
  }).filter(Boolean)
};

// One request per exchange per run (all spot tickers; filtered locally).
const CEX_URLS = {
  kraken: 'https://api.kraken.com/0/public/Ticker?asset_class=tokenized_asset',
  bybit: 'https://api.bybit.com/v5/market/tickers?category=spot',
  binance: 'https://data-api.binance.vision/api/v3/ticker/24hr',
  mexc: 'https://api.mexc.com/api/v3/ticker/24hr',
  gate: 'https://api.gateio.ws/api/v4/spot/tickers',
  bitget: 'https://api.bitget.com/api/v2/spot/market/tickers'
};

/**
 * @returns {Promise<{rowsBy: Object<string,Array>, status: Object}>} rows per enabled exchange id.
 */
async function fetchCex(deps, registry, onlyEnabled) {
  const rowsBy = {};
  const status = {};
  const list = (registry.cexSources || []).filter((c) => CEX_PARSERS[c.id]);
  await Promise.all(list.map(async (c) => {
    if (!c.enabled && onlyEnabled) { status[c.id] = { status: 'disabled', reason: c.disabledReason || 'disabled' }; return; }
    const r = await core.httpJson(deps, CEX_URLS[c.id], { headers: { 'user-agent': 'defi-garden-ci' } }, 20000);
    if (!r.ok) { status[c.id] = { status: 'failed', reason: r.reason }; return; }
    rowsBy[c.id] = CEX_PARSERS[c.id](r.json);
    status[c.id] = { status: 'ok', tickers: rowsBy[c.id].length };
  }));
  return { rowsBy, status };
}

/**
 * Match CEX rows to versions: base symbol == registry symbol, issuer allowed for
 * that exchange. Returns Map versionKey -> entries.
 */
function matchCex(tokens, registry, rowsBy, fetchedAt) {
  const out = new Map();
  (registry.cexSources || []).forEach((c) => {
    const rows = rowsBy[c.id];
    if (!rows) return;
    const bySym = new Map();
    rows.forEach((r) => { if (!bySym.has(r.base)) bySym.set(r.base, []); bySym.get(r.base).push(r); });
    tokens.forEach((t) => {
      if (!(c.issuers || []).includes(t.issuerSlug)) return;
      const cand = (bySym.get(norm(t.symbol)) || []).filter((r) => isNum(r.last) && r.last > 0);
      if (!cand.length) return;
      cand.sort((a, b) => (b.volumeUsd || 0) - (a.volumeUsd || 0));
      const r = cand[0];
      const k = keyOf(t);
      if (!out.has(k)) out.set(k, []);
      out.get(k).push({ exchange: c.id, pair: r.pair, quote: r.quote, priceUsd: r.last, volume24hUsd: r.volumeUsd, ts: fetchedAt });
    });
  });
  return out;
}

// ------------------------------------------------------- issuer fetchers ---

async function fetchCoinbase(deps) {
  const map = new Map();
  let tok = '';
  for (let i = 0; i < 10; i++) {
    const r = await core.httpJson(deps, 'https://api.coinbase.com/v1/tokenized-stocks' + (tok ? '?page_token=' + encodeURIComponent(tok) : ''), undefined, 20000);
    if (!r.ok) return { map, status: map.size ? 'partial' : r.reason };
    ((r.json && r.json.tokens) || []).forEach((t) => {
      if (t && typeof t.contract_address === 'string') map.set(t.contract_address.toLowerCase(), t);
    });
    tok = r.json && r.json.next_page_token;
    if (!tok) break;
  }
  return { map, status: map.size ? 'ok' : 'empty' };
}

async function fetchRobinhood(deps) {
  const map = new Map();
  const r = await core.httpJson(deps, 'https://api.robinhood.com/rhj/assets', undefined, 20000);
  if (!r.ok) return { map, status: r.reason };
  ((r.json && r.json.assets) || []).forEach((a) => {
    (a.deployments || []).forEach((d) => {
      if (d && d.chainId === ROBINHOOD_CHAIN_ID && typeof d.contractAddress === 'string') map.set(d.contractAddress.toLowerCase(), a);
    });
  });
  return { map, status: map.size ? 'ok' : 'empty' };
}

function rpcUrl(chain, env, publicRpc) {
  const key = env.ALCHEMY_KEY || env.ALCHEMY_API_KEY;
  const u = core.alchemyUrl(chain, key);
  if (u) return u;
  return publicRpc ? PUBLIC_RPC[chain] || null : null;
}

const pad = (hex) => String(hex).replace(/^0x/, '').toLowerCase().padStart(64, '0');

/** totalSupply, decimals and (Ondo) getSValue per EVM token, one batch per chain. */
async function fetchEvm(deps, tokens, registry, publicRpc) {
  const supply = new Map();   // key -> {raw: BigInt, decimals}
  const sValue = new Map();   // key -> {value:number}|{reason}
  const status = {};
  const oracles = (registry.issuers.ondo && registry.issuers.ondo.multiplier && registry.issuers.ondo.multiplier.oracles) || {};
  const byChain = new Map();
  tokens.filter((t) => t.chain !== 'Solana').forEach((t) => {
    if (!byChain.has(t.chain)) byChain.set(t.chain, []);
    byChain.get(t.chain).push(t);
  });
  await Promise.all(Array.from(byChain.entries()).map(async ([chain, list]) => {
    const url = rpcUrl(chain, deps.env, publicRpc);
    if (!url) { status[chain] = deps.env.ALCHEMY_KEY || deps.env.ALCHEMY_API_KEY ? 'chain-unsupported' : 'rpc-unavailable'; list.forEach((t) => { supply.set(keyOf(t), { reason: status[chain] }); if (t.issuerSlug === 'ondo') sValue.set(keyOf(t), { reason: status[chain] }); }); return; }
    const calls = [];
    const plan = list.map((t) => {
      const start = calls.length;
      calls.push({ to: t.address, data: SEL_TOTAL_SUPPLY });
      calls.push({ to: t.address, data: SEL_DECIMALS });
      const wantS = t.issuerSlug === 'ondo' && oracles[chain];
      if (wantS) calls.push({ to: oracles[chain], data: SEL_GET_SVALUE + pad(t.address) });
      return { t, start, wantS: !!wantS };
    });
    const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'] }));
    const r = await core.httpJson(deps, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 20000);
    if (!r.ok) { status[chain] = 'rpc-' + r.reason; list.forEach((t) => { supply.set(keyOf(t), { reason: status[chain] }); if (t.issuerSlug === 'ondo') sValue.set(keyOf(t), { reason: status[chain] }); }); return; }
    status[chain] = 'ok';
    const byId = new Map();
    (Array.isArray(r.json) ? r.json : []).forEach((x) => { if (x && x.id !== undefined) byId.set(x.id, x); });
    const res = (i) => { const x = byId.get(i); return x && typeof x.result === 'string' && x.result.length > 2 && !x.error ? x.result : null; };
    plan.forEach(({ t, start, wantS }) => {
      const ts = res(start), dec = res(start + 1);
      if (ts && dec) supply.set(keyOf(t), { raw: BigInt('0x' + pad(ts).slice(-64)), decimals: Number(BigInt('0x' + pad(dec).slice(-64))) });
      else supply.set(keyOf(t), { reason: 'rpc-error' });
      if (wantS) {
        const sv = res(start + 2);
        if (sv) {
          const v = Number(BigInt('0x' + String(sv).replace(/^0x/, '').slice(0, 64))) / 1e18;
          sValue.set(keyOf(t), v > 0 ? { value: v } : { reason: 'oracle-zero' });
        } else sValue.set(keyOf(t), { reason: 'oracle-not-registered' });
      }
    });
  }));
  return { supply, sValue, status };
}

/** Solana mint supply + scaled-UI multiplier, one getMultipleAccounts call. */
async function fetchSolana(deps, tokens) {
  const out = new Map();
  const list = tokens.filter((t) => t.chain === 'Solana');
  if (!list.length) return { out, status: 'none' };
  const key = deps.env.ALCHEMY_KEY || deps.env.ALCHEMY_API_KEY;
  const urls = [];
  if (key) urls.push('https://solana-mainnet.g.alchemy.com/v2/' + key);
  urls.push(SOLANA_PUBLIC_RPC);
  const nowSec = Math.floor(deps.now() / 1000);
  let lastReason = 'network';
  for (const url of urls) {
    const r = await core.httpJson(deps, url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [list.map((t) => t.address), { encoding: 'jsonParsed' }] })
    }, 20000);
    const values = r.ok && r.json && r.json.result && r.json.result.value;
    if (!Array.isArray(values)) { lastReason = r.ok ? 'rpc-error' : 'rpc-' + r.reason; continue; }
    list.forEach((t, i) => {
      const v = values[i];
      const info = v && v.data && v.data.parsed && v.data.parsed.type === 'mint' && v.data.parsed.info;
      if (!info || !isNum(Number(info.decimals)) || typeof info.supply !== 'string') { out.set(keyOf(t), { reason: 'mint-unreadable' }); return; }
      const ext = (info.extensions || []).find((e) => e.extension === 'scaledUiAmountConfig');
      let scale = 1;
      if (ext && ext.state) {
        const eff = Number(ext.state.newMultiplierEffectiveTimestamp);
        const m = nowSec >= eff ? Number(ext.state.newMultiplier) : Number(ext.state.multiplier);
        if (isNum(m) && m > 0) scale = m;
      }
      out.set(keyOf(t), { raw: BigInt(info.supply), decimals: Number(info.decimals), scale });
    });
    return { out, status: 'ok' };
  }
  list.forEach((t) => out.set(keyOf(t), { reason: lastReason }));
  return { out, status: lastReason };
}

// ------------------------------------------------------------ assemblers ---

function supplyUnits(s) {
  if (!s || s.raw === undefined) return null;
  const v = Number(s.raw) / Math.pow(10, s.decimals) * (s.scale || 1);
  return isNum(v) ? v : null;
}

function resolveMultiplier(t, ctx) {
  const iss = ctx.registry.issuers[t.issuerSlug] || {};
  const spec = iss.multiplier || null;
  const unknown = (reason) => ({ value: null, source: null, reason });
  if (!spec) return unknown('issuer-publishes-no-multiplier');
  if (t.wrapper) return unknown('wrapped-token');
  if (spec.kind === 'issuer-design') return { value: spec.value, source: spec.source };
  if (spec.kind === 'issuer-api') {
    if (t.issuerSlug === 'coinbase') {
      const a = ctx.coinbase.get(t.address.toLowerCase());
      const m = a && Number(a.multiplier);
      return isNum(m) && m > 0 ? { value: m, source: spec.source } : unknown(ctx.coinbaseStatus === 'ok' ? 'not-in-issuer-api' : 'issuer-api-' + ctx.coinbaseStatus);
    }
    if (t.issuerSlug === 'robinhood') {
      const a = ctx.robinhood.get(t.address.toLowerCase());
      const m = a && Number(a.currentMultiplier);
      return isNum(m) && m > 0 ? { value: m, source: spec.source } : unknown(ctx.robinhoodStatus === 'ok' ? 'not-in-issuer-api' : 'issuer-api-' + ctx.robinhoodStatus);
    }
  }
  if (spec.kind === 'onchain-oracle') {
    const s = ctx.sValue.get(keyOf(t));
    return s && s.value ? { value: s.value, source: spec.source } : unknown((s && s.reason) || 'rpc-unavailable');
  }
  return unknown('unsupported');
}

function pickYield(pools) {
  if (!pools.length) return null;
  const sorted = pools.slice().sort((a, b) =>
    ((a.tier <= 2 ? 0 : 1) - (b.tier <= 2 ? 0 : 1)) ||
    (b.honestProjection - a.honestProjection) || (b.tvlUsd - a.tvlUsd) || (a.pool < b.pool ? -1 : 1));
  const p = sorted[0];
  const flags = (p.flags || []).filter((f) => ['forcedHighIL', 'thinLiquidity', 'nearZeroYield'].indexOf(f) >= 0);
  return {
    pool: p.pool, project: p.project, poolType: p.poolType, exposure: p.exposure, tier: p.tier, tvlUsd: p.tvlUsd,
    headlineApy: p.headlineApy, honestProjection: p.honestProjection, flags,
    defiScore: snap.publicDefiScore(p.defiScore) // total, band, pillar TIERS only
  };
}

function riskOf(t, registry) {
  const i = registry.issuers[t.issuerSlug] || {};
  const mr = i.mintRedeem || {};
  return {
    legalEntity: i.legalEntity == null ? null : i.legalEntity,
    jurisdiction: i.jurisdiction == null ? null : i.jurisdiction,
    structure: i.structure == null ? null : i.structure,
    usPersons: i.usPersons === true || i.usPersons === false ? i.usPersons : null,
    mintRedeemHours: mr.hours == null ? null : mr.hours,
    redemptionMinUsd: isNum(mr.minUsd) ? mr.minUsd : null
  };
}

/**
 * Pure assembly. ctx: {registry, snapshot, now(ms), prices(Map), rejected(Map),
 * supply(Map evm), solana(Map), coinbase(Map), coinbaseStatus, robinhood(Map),
 * robinhoodStatus, sValue(Map), cex(Map), depths(Map poolId->usd), refClose(Map
 * ticker->{price,ts}), refStatus, market, sources, cexStatus}
 */
function buildVersions(ctx) {
  const registry = ctx.registry;
  const all = Object.keys(registry.tokens).map((k) => registry.tokens[k]);
  const poolsByKey = new Map();
  (ctx.snapshot.pools || []).forEach((p) => (p.equityTokens || []).forEach((et) => {
    const k = ver.versionKey(p.chain, et.address);
    if (!k) return;
    if (!poolsByKey.has(k)) poolsByKey.set(k, []);
    poolsByKey.get(k).push(p);
  }));
  const tickers = {};
  const refCloseOut = (ticker) => {
    const r = ctx.refClose.get(ticker);
    return r ? { price: r.price, ts: new Date(r.ts * 1000).toISOString(), date: ctx.market.lastRegularCloseEtDate, source: 'pyth', kind: 'last-close' } : null;
  };

  all.forEach((t) => {
    const T = tickers[t.underlying] || (tickers[t.underlying] = { names: [], versions: [], unverified: [] });
    const k = keyOf(t);
    const px = k ? ctx.prices.get(k) : null;
    if (!snap.isVerifiedToken(t)) {
      T.unverified.push({
        flag: 'Issuer unverified', issuerHint: t.issuerHint || null, chain: t.chain, address: normAddr(t.chain, t.address), symbol: t.symbol,
        priceUsd: px ? round(px.price, px.price >= 1 ? 4 : 8) : null
      });
      return;
    }
    if (!t.wrapper && t.name && !/not verifiable/i.test(t.name)) T.names.push(t.name);
    const reasons = {};
    const v = {
      key: k, issuerSlug: t.issuerSlug, issuer: t.issuer, chain: t.chain, address: normAddr(t.chain, t.address),
      symbol: t.symbol, decimals: px && px.decimals != null ? px.decimals : null,
      assetClass: t.assetClass || 'equity'
    };
    if (t.wrapper) v.wrapper = true;
    if (px) {
      v.priceUsd = round(px.price, px.price >= 1 ? 4 : 8);
      v.priceSource = 'defillama-coins (aggregated on-chain prices)';
      v.priceTs = new Date(px.ts * 1000).toISOString();
      v.priceConfidence = px.confidence;
    } else {
      v.priceUsd = null; v.priceSource = null; v.priceTs = null; v.priceConfidence = null;
      reasons.price = (k && ctx.rejected.get(k)) || 'price-unavailable';
    }
    const mult = resolveMultiplier(t, ctx);
    v.multiplier = mult.value;
    v.multiplierSource = mult.source;
    if (mult.value === null) { v.multiplierUnknown = true; reasons.multiplier = mult.reason; }

    // supply (token units) and USD value
    let units = null; let supplySource = null;
    const cb = t.issuerSlug === 'coinbase' ? ctx.coinbase.get(t.address.toLowerCase()) : null;
    if (cb && isNum(Number(cb.total_supply))) { units = Number(cb.total_supply); supplySource = 'issuer-api'; }
    else if (t.chain === 'Solana') {
      const s = ctx.solana.get(k); units = supplyUnits(s); if (units !== null) supplySource = 'solana-mint'; else reasons.supply = (s && s.reason) || 'rpc-unavailable';
    } else {
      const s = ctx.supply.get(k); units = supplyUnits(s); if (units !== null) supplySource = 'erc20-totalSupply'; else reasons.supply = (s && s.reason) || 'rpc-unavailable';
    }
    v.supply = units !== null ? round(units, 4) : null;
    v.supplySource = supplySource;
    v.supplyUsd = units !== null && px ? Math.round(units * px.price) : null;

    // liquidity + yield from the stocks snapshot (pool TVL, not tradable depth)
    const pools = poolsByKey.get(k) || [];
    const depths = pools.map((p) => ctx.depths.get(p.pool)).filter(isNum);
    v.liquidity = {
      tvlUsd: pools.reduce((a, p) => a + (p.tvlUsd || 0), 0),
      lpTvlUsd: pools.filter((p) => p.poolType !== 'lending').reduce((a, p) => a + (p.tvlUsd || 0), 0),
      pools: pools.length,
      depth2pctUsd: depths.length ? Math.max.apply(null, depths) : null,
      depthSource: depths.length ? 'rpc (+-2%, active-liquidity approximation)' : null
    };
    v.bestYield = {
      lp: pickYield(pools.filter((p) => p.poolType !== 'lending')),
      lending: pickYield(pools.filter((p) => p.poolType === 'lending'))
    };
    v.risk = riskOf(t, registry);
    if (cb && isNum(Number(cb.nav_price))) v.issuerNavUsd = round(Number(cb.nav_price), 4);

    // cex
    const refc = ctx.refClose.get(t.underlying);
    v.cex = (ctx.cex.get(k) || []).filter((e) => {
      const base = px ? px.price : (mult.value && refc ? mult.value * refc.price : null);
      return base === null || Math.abs(e.priceUsd / base - 1) <= CEX_MAX_DEVIATION;
    }).map((e) => {
      const pr = ver.premiumPct(e.priceUsd, mult.value, refc && refc.price);
      return Object.assign({}, e, { premiumVsClosePct: pr.pct });
    });
    // premium vs last regular close
    const prem = ver.premiumPct(px && px.price, mult.value, refc && refc.price);
    v.premiumVsClosePct = prem.pct;
    if (prem.pct === null && px) reasons.premium = prem.reason === 'no-reference' ? (ctx.refStatus === 'ok' ? 'no-reference' : 'pyth-' + ctx.refStatus) : prem.reason;
    if (Object.keys(reasons).length) v.reasons = reasons;
    T.versions.push(v);
  });

  const outTickers = {};
  Object.keys(tickers).sort().forEach((u) => {
    const T = tickers[u];
    T.versions.sort((a, b) => ((b.supplyUsd || 0) - (a.supplyUsd || 0)) || (a.key < b.key ? -1 : 1));
    const counts = {};
    T.names.forEach((n) => { counts[n] = (counts[n] || 0) + 1; });
    const name = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : 1))[0] || u;
    const vs = T.versions;
    const withPrem = vs.filter((v) => v.premiumVsClosePct !== null);
    const lo = withPrem.slice().sort((a, b) => a.premiumVsClosePct - b.premiumVsClosePct)[0];
    const hi = withPrem.slice().sort((a, b) => b.premiumVsClosePct - a.premiumVsClosePct)[0];
    const seen = new Set(); let liq = 0;
    vs.forEach((v) => (poolsByKey.get(v.key) || []).forEach((p) => { if (!seen.has(p.pool)) { seen.add(p.pool); liq += p.tvlUsd || 0; } }));
    const supplyKnown = vs.filter((v) => v.supplyUsd !== null);
    const yieldCands = [];
    vs.forEach((v) => ['lp', 'lending'].forEach((kind) => { const y = v.bestYield[kind]; if (y) yieldCands.push({ v, kind, y }); }));
    yieldCands.sort((a, b) => ((a.y.tier <= 2 ? 0 : 1) - (b.y.tier <= 2 ? 0 : 1)) || (b.y.honestProjection - a.y.honestProjection) || (b.y.tvlUsd - a.y.tvlUsd));
    const by = yieldCands[0];
    outTickers[u] = {
      name,
      referenceClose: refCloseOut(u),
      versions: vs,
      unverified: T.unverified,
      summary: {
        versionCount: vs.length,
        pricedCount: vs.filter((v) => v.priceUsd !== null).length,
        premiumMinPct: lo ? lo.premiumVsClosePct : null,
        premiumMaxPct: hi ? hi.premiumVsClosePct : null,
        premiumMinKey: lo ? lo.key : null,
        premiumMaxKey: hi ? hi.key : null,
        premiumCount: withPrem.length,
        totalSupplyUsd: supplyKnown.length ? supplyKnown.reduce((a, v) => a + v.supplyUsd, 0) : null,
        supplyKnownCount: supplyKnown.length,
        totalLiquidityUsd: liq,
        bestYield: by ? { key: by.v.key, issuerSlug: by.v.issuerSlug, chain: by.v.chain, kind: by.kind, pool: by.y.pool, honestProjection: by.y.honestProjection, tier: by.y.tier } : null
      }
    };
  });

  const verifiedTickers = Object.keys(outTickers).filter((u) => outTickers[u].versions.length > 0);
  return {
    schemaVersion: 1,
    generatedAt: new Date(ctx.now).toISOString(),
    referenceSource: {
      label: 'Pyth (Equity.US feeds): live in the regular US session, last regular close otherwise',
      status: ctx.refStatus,
      market: { lastRegularClose: ctx.market.lastRegularClose, etDate: ctx.market.lastRegularCloseEtDate }
    },
    priceSource: 'DefiLlama coins (aggregated on-chain prices)',
    sources: ctx.sources,
    cexSources: ctx.cexMeta,
    issuers: ctx.issuersOut,
    counts: {
      tickers: verifiedTickers.length,
      tickersWithMultipleVerified: verifiedTickers.filter((u) => outTickers[u].versions.length >= 2).length,
      verifiedVersions: verifiedTickers.reduce((a, u) => a + outTickers[u].versions.length, 0),
      unverifiedTokens: Object.keys(outTickers).reduce((a, u) => a + outTickers[u].unverified.length, 0)
    },
    tickers: outTickers
  };
}

/** Slim input of the live `?view=versions` mode: what to price, with which multiplier. */
function buildSlim(full) {
  const tickers = {};
  Object.keys(full.tickers).forEach((u) => {
    const T = full.tickers[u];
    if (!T.versions.length) return;
    const rc = T.referenceClose;
    tickers[u] = {
      refClose: rc ? { p: rc.price, ts: Math.floor(Date.parse(rc.ts) / 1000), date: rc.date, src: rc.source } : null,
      v: T.versions.map((v) => ({ k: v.key, c: v.chain, a: v.address, s: v.symbol, i: v.issuerSlug, m: v.multiplier }))
    };
  });
  return { schemaVersion: 1, generatedAt: full.generatedAt, tickers };
}

function issuersOut(registry, tokens) {
  const out = {};
  tokens.forEach((t) => {
    const i = registry.issuers[t.issuerSlug];
    if (!i || out[t.issuerSlug]) return;
    const mr = i.mintRedeem || {};
    out[t.issuerSlug] = {
      name: i.name, sources: i.sources || [], structureSource: i.structureSource || null, usPersonsSource: i.usPersonsSource || null,
      mintRedeemHoursSource: mr.hoursSource || null, redemptionMinSource: mr.minSource || null,
      multiplierSource: (i.multiplier && i.multiplier.source) || null
    };
  });
  return out;
}

// ------------------------------------------------------------------- main ---

async function run(deps, files, opts) {
  const registry = files.registry, snapshot = files.snapshot;
  const nowMs = deps.now();
  const market = ver.marketInfo(nowMs);
  const tokens = Object.keys(registry.tokens).map((k) => registry.tokens[k]);
  const verified = tokens.filter(snap.isVerifiedToken);
  const ids = Array.from(new Set(tokens.map(keyOf).filter(Boolean)));
  const tickersAll = Array.from(new Set(verified.map((t) => t.underlying)));
  const fetchedAt = new Date(nowMs).toISOString();
  const env = deps.env;
  const alchemyKey = env.ALCHEMY_KEY || env.ALCHEMY_API_KEY;

  const [priceRes, cbRes, rhRes, evmRes, solRes, cexRes, pythRes] = await Promise.all([
    ver.fetchVersionPrices(deps, ids),
    fetchCoinbase(deps),
    fetchRobinhood(deps),
    fetchEvm(deps, tokens, registry, opts.publicRpc),
    fetchSolana(deps, tokens),
    fetchCex(deps, registry, true),
    market.lastRegularCloseTs ? ver.fetchPythAtClose(deps, files.feeds, tickersAll, market.lastRegularCloseTs) : Promise.resolve({ refs: new Map(), status: 'calendar-stale' })
  ]);

  // optional: +-2% depth through the existing live module (needs the RPC key)
  const depths = new Map();
  let depthStatus = 'rpc-unavailable';
  if (alchemyKey) {
    try {
      const live = await core.buildResponse({ fetch: deps.fetch, now: deps.now, env: { ALCHEMY_API_KEY: alchemyKey }, snapshot, feeds: files.feeds, addresses: files.addresses });
      (live ? live.pools : []).forEach((p) => { if (isNum(p.depth2pct)) depths.set(p.pool, p.depth2pct); });
      depthStatus = live ? 'ok' : 'failed';
    } catch (_e) { depthStatus = 'failed'; }
  }

  const cexMap = matchCex(verified, registry, cexRes.rowsBy, fetchedAt);
  const cexMeta = (registry.cexSources || []).map((c) => Object.assign({
    id: c.id, name: c.name, docs: c.docs, enabled: !!c.enabled, fetchedAt: fetchedAt
  }, cexRes.status[c.id] || {}));
  cexMeta.push.apply(cexMeta, (registry.cexNotAvailable || []).map((c) => ({ id: c.id, status: 'not-available', reason: c.reason })));

  const result = buildVersions({
    registry, snapshot, now: nowMs, market,
    prices: priceRes.prices, rejected: priceRes.rejected,
    supply: evmRes.supply, solana: solRes.out,
    coinbase: cbRes.map, coinbaseStatus: cbRes.status, robinhood: rhRes.map, robinhoodStatus: rhRes.status,
    sValue: evmRes.sValue, cex: cexMap, depths, refClose: pythRes.refs, refStatus: pythRes.status,
    cexMeta,
    issuersOut: issuersOut(registry, verified),
    sources: {
      prices: priceRes.failed ? { status: 'partial', reason: priceRes.failed } : { status: 'ok' },
      reference: { pyth: pythRes.status },
      evmRpc: evmRes.status, solanaRpc: solRes.status, coinbase: cbRes.status, robinhood: rhRes.status, depth: depthStatus
    }
  });
  return { result, priced: priceRes.prices.size };
}

function main() {
  const args = process.argv.slice(2);
  const oi = args.indexOf('--out');
  const outDir = oi >= 0 ? args[oi + 1] : path.join(__dirname, 'data');
  const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
  let files;
  try {
    files = { registry: read('stocks-registry.json'), snapshot: read('stocks-snapshot.json'), feeds: read('stocks-pyth-feeds.json'), addresses: (() => { try { return read('stocks-pool-addresses.json'); } catch (_e) { return null; } })() };
  } catch (e) { console.error('generate-stocks-versions: input unreadable:', e.message); process.exit(1); }
  return run({ fetch: globalThis.fetch, now: Date.now, env: process.env }, files, { publicRpc: args.includes('--public-rpc') }).then(({ result, priced }) => {
    if (!priced) { console.error('generate-stocks-versions: no token priced (DefiLlama unreachable?) — refusing to write'); process.exit(1); }
    fs.mkdirSync(outDir, { recursive: true });
    const full = JSON.stringify(result);
    const slim = JSON.stringify(buildSlim(result));
    fs.writeFileSync(path.join(outDir, 'stocks-versions.json'), full + '\n');
    fs.writeFileSync(path.join(outDir, 'stocks-versions-slim.json'), slim + '\n');
    console.log('generate-stocks-versions: wrote stocks-versions.json (' + Buffer.byteLength(full) + ' bytes), slim (' + Buffer.byteLength(slim) + ' bytes); tickers ' + result.counts.tickers + ', with >=2 verified versions ' + result.counts.tickersWithMultipleVerified);
  });
}

if (require.main === module) main().catch((e) => { console.error('generate-stocks-versions failed:', e && e.name ? e.name : 'Error'); process.exit(1); });

module.exports = { buildVersions, buildSlim, run, matchCex, fetchCex, CEX_PARSERS, resolveMultiplier, pickYield, supplyUnits, stripQuote, fetchSolana, fetchEvm };
