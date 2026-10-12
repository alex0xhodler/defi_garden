/**
 * /stocks live on-chain layer (Phase 4) — core logic behind api/stocks-onchain.js.
 *
 * The leading underscore keeps Vercel from routing this file; the handler is
 * api/stocks-onchain.js. Plain CommonJS, zero dependencies, every upstream call
 * goes through an injected `fetch` so tests run with no network.
 *
 * What it produces, per pool in data/stocks-snapshot.json:
 *   - price:  the equity token's USD price from DefiLlama coins (one batched
 *             call per ~40 tokens). Confidence < 0.9, stale (> 1h) or missing
 *             prices are returned as null with a reason, never guessed.
 *   - drift:  token price vs the last regular-session close, ONLY while the US
 *             market is not in its regular session. Reference order:
 *               1. Pyth Hermes price of the UNDERLYING stock at the close
 *                  (needs PYTH_API_KEY; Hermes stopped serving prices keyless),
 *               2. the token's OWN DefiLlama price at the close timestamp.
 *             No trustworthy reference -> drift null + reason. `driftRef.source`
 *             says which one was used so the UI can word it honestly.
 *   - depth:  +-2% depth in USD from RPC reads (Alchemy, ALCHEMY_API_KEY) for
 *             pools whose address is in data/stocks-pool-addresses.json
 *             (Uniswap v3 / v2, Aerodrome Slipstream). Everything else keeps the
 *             client-side TVL heuristic (depth2pct null, depthSource "heuristic").
 *
 * Secrets: ALCHEMY_API_KEY / PYTH_API_KEY are read from the environment at call
 * time, used only to build request URLs/headers, and NEVER logged or returned:
 * every upstream failure is reduced to a short reason code (no error text).
 *
 * Research only. Nothing here is a trade signal.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const clock = require('../stocks-market-clock.js');

const MEMO_TTL_MS = 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 4000;
const PRICE_CHUNK = 40;
const MIN_CONFIDENCE = 0.9;
const MAX_PRICE_AGE_SEC = 60 * 60;
// A reference must have been printed within this window around the close.
const CLOSE_WINDOW_SEC = 15 * 60;
// A drift beyond this is far more likely a token multiplier / corporate action
// mismatch than a real move; report it as unusable rather than as a "gap".
const MAX_PLAUSIBLE_DRIFT_PCT = 25;
const DEPTH_MOVE = 0.02;
// Pool-implied price vs DefiLlama price: a bigger gap means a wrong pool /
// orientation / decimals, so the depth is dropped.
const MAX_POOL_PRICE_GAP = 0.25;
const STABLE_USD = 1; // quote tokens in the resolved pools are USD stablecoins, valued at $1.

// DefiLlama coins chain slugs (all verified live 2026-10-12; "Hyperliquid L1" is
// served as `hyperliquid`, Robinhood Chain as `robinhood`).
const LLAMA_CHAIN_SLUGS = {
  Solana: 'solana', Base: 'base', BSC: 'bsc', Ethereum: 'ethereum', Arbitrum: 'arbitrum',
  'Hyperliquid L1': 'hyperliquid', 'Robinhood Chain': 'robinhood'
};
// Alchemy networks for the chains with a pool resolver. Others degrade.
const ALCHEMY_NETWORKS = {
  Ethereum: 'eth-mainnet', Base: 'base-mainnet', BSC: 'bnb-mainnet', Arbitrum: 'arb-mainnet'
};
// snapshot `onchain.ammType` values a resolver exists for.
const RESOLVABLE_AMMS = { 'uniswap-v3': 'uniswap-v3', 'slipstream-cl': 'slipstream', 'uniswap-v2': 'uniswap-v2' };

const SEL = {
  slot0: '0x3850c7bd', liquidity: '0x1a686502', getReserves: '0x0902f1ac',
  token0: '0x0dfe1681', token1: '0xd21220a7', decimals: '0x313ce567',
  v3GetPool: '0x1698ee82', slipstreamGetPool: '0x28af8d0b', v2GetPair: '0xe6a43905'
};

// ------------------------------------------------------------------ data ---

// Literal path.join(__dirname, '../data/<file>') so Vercel's file tracer bundles them.
function readJsonSafe(read) {
  try { return JSON.parse(read()); } catch (_e) { return null; }
}
function loadSnapshot() { return readJsonSafe(() => fs.readFileSync(path.join(__dirname, '../data/stocks-snapshot.json'), 'utf8')); }
function loadPythFeeds() { return readJsonSafe(() => fs.readFileSync(path.join(__dirname, '../data/stocks-pyth-feeds.json'), 'utf8')); }
function loadPoolAddresses() { return readJsonSafe(() => fs.readFileSync(path.join(__dirname, '../data/stocks-pool-addresses.json'), 'utf8')); }

// ------------------------------------------------------------- utilities ---

function isNum(v) { return typeof v === 'number' && isFinite(v); }
function round(v, dp) { const m = Math.pow(10, dp); return Math.round(v * m) / m; }

function coinId(chain, address) {
  const slug = LLAMA_CHAIN_SLUGS[chain];
  if (!slug || typeof address !== 'string' || !address) return null;
  // EVM addresses are case-insensitive (lowercase); Solana base58 is case-exact.
  return slug + ':' + (chain === 'Solana' ? address : address.toLowerCase());
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * JSON over HTTP with a hard timeout. Resolves { ok, json } or { ok:false, reason }
 * where reason is a short code. Never rejects and never carries error text or the
 * URL (URLs can embed API keys).
 */
async function httpJson(deps, url, init, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || UPSTREAM_TIMEOUT_MS);
  try {
    const res = await deps.fetch(url, Object.assign({}, init || {}, { signal: ctl.signal }));
    if (!res || !res.ok) return { ok: false, reason: 'http-' + (res && res.status ? res.status : 'error') };
    try { return { ok: true, json: await res.json() }; } catch (_e) { return { ok: false, reason: 'bad-json' }; }
  } catch (err) {
    return { ok: false, reason: err && err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

function coinsBase(deps) {
  // chore/llama-endpoints will centralise the DefiLlama base URLs; fold this env read into it then.
  return String((deps.env && deps.env.LLAMA_COINS_BASE) || 'https://coins.llama.fi').replace(/\/+$/, '');
}

// ---------------------------------------------------------------- prices ---

/**
 * @returns {Promise<{prices: Map<string,{price:number,ts:number}>, rejected: Map<string,string>, failed: string|null}>}
 */
async function fetchPrices(deps, ids) {
  const prices = new Map();
  const rejected = new Map();
  let failed = null;
  const nowSec = Math.floor(deps.now() / 1000);
  const results = await Promise.all(chunk(ids, PRICE_CHUNK).map(async (batch) => {
    const r = await httpJson(deps, coinsBase(deps) + '/prices/current/' + batch.join(','));
    return { batch, r };
  }));
  results.forEach(({ batch, r }) => {
    if (!r.ok) { failed = r.reason; batch.forEach((id) => rejected.set(id, 'prices-' + r.reason)); return; }
    const coins = (r.json && r.json.coins) || {};
    batch.forEach((id) => {
      const c = coins[id];
      if (!c || !isNum(c.price) || c.price <= 0) { rejected.set(id, 'price-unavailable'); return; }
      if (!isNum(c.confidence) || c.confidence < MIN_CONFIDENCE) { rejected.set(id, 'low-confidence'); return; }
      if (!isNum(c.timestamp) || nowSec - c.timestamp > MAX_PRICE_AGE_SEC) { rejected.set(id, 'stale-price'); return; }
      prices.set(id, { price: c.price, ts: c.timestamp });
    });
  });
  return { prices, rejected, failed };
}

/** The token's own DefiLlama price at the close timestamp (drift reference, fallback). */
async function fetchTokenCloseRefs(deps, ids, closeTs) {
  const refs = new Map();
  let failed = null;
  const results = await Promise.all(chunk(ids, PRICE_CHUNK).map(async (batch) => {
    const r = await httpJson(deps, coinsBase(deps) + '/prices/historical/' + closeTs + '/' + batch.join(',') + '?searchWidth=' + CLOSE_WINDOW_SEC);
    return { batch, r };
  }));
  results.forEach(({ batch, r }) => {
    if (!r.ok) { failed = r.reason; return; }
    const coins = (r.json && r.json.coins) || {};
    batch.forEach((id) => {
      const c = coins[id];
      if (!c || !isNum(c.price) || c.price <= 0 || !isNum(c.timestamp)) return;
      if (isNum(c.confidence) && c.confidence < MIN_CONFIDENCE) return;
      if (Math.abs(c.timestamp - closeTs) > CLOSE_WINDOW_SEC) return;
      refs.set(id, { price: c.price, ts: c.timestamp });
    });
  });
  return { refs, failed };
}

// ----------------------------------------------------------------- Pyth ---

function pythBase(deps) {
  return String((deps.env && deps.env.PYTH_HERMES_BASE) || 'https://pyth.dourolabs.app/hermes').replace(/\/+$/, '');
}

/**
 * Last regular-session print of each underlying from Pyth Hermes. The
 * Equity.US feed only publishes in the regular session, so after the close its
 * latest update IS the last close; anything not printed within the window around
 * the close is rejected (reference-stale), never used.
 * @returns {Promise<{refs: Map<string,{price:number,ts:number}>, status: string}>}
 */
async function fetchPythRefs(deps, feeds, tickers, closeTs) {
  const key = deps.env && deps.env.PYTH_API_KEY;
  if (!key) return { refs: new Map(), status: 'no-key' };
  const idToTicker = new Map();
  tickers.forEach((t) => { const f = feeds && feeds.feeds && feeds.feeds[t]; if (f && f.id) idToTicker.set(f.id, t); });
  if (!idToTicker.size) return { refs: new Map(), status: 'no-feeds' };
  const query = Array.from(idToTicker.keys()).map((id) => 'ids[]=' + id).join('&');
  const r = await httpJson(deps, pythBase(deps) + '/v2/updates/price/latest?' + query + '&parsed=true&encoding=hex',
    { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) return { refs: new Map(), status: r.reason };
  const refs = new Map();
  ((r.json && r.json.parsed) || []).forEach((p) => {
    const ticker = idToTicker.get(String(p && p.id).replace(/^0x/, ''));
    const px = p && p.price;
    if (!ticker || !px) return;
    const price = Number(px.price) * Math.pow(10, Number(px.expo));
    const ts = Number(px.publish_time);
    if (!isNum(price) || price <= 0 || !isNum(ts)) return;
    if (ts < closeTs - CLOSE_WINDOW_SEC || ts > closeTs + 60) return;
    refs.set(ticker, { price, ts });
  });
  return { refs, status: 'ok' };
}

// ----------------------------------------------------------------- drift ---

function driftFrom(price, ref) {
  if (!isNum(price) || !ref || !isNum(ref.price) || ref.price <= 0) return null;
  const pct = (price / ref.price - 1) * 100;
  if (!isNum(pct) || Math.abs(pct) > MAX_PLAUSIBLE_DRIFT_PCT) return null;
  return round(pct, 3);
}

// ----------------------------------------------------------------- depth ---

/** Raw token amounts needed to push a CL pool's sqrt price from s to s2 inside the active range. */
function moveCost(s, s2, L) {
  if (s2 > s) return { token0In: 0, token1In: L * (s2 - s) };
  return { token0In: L * (1 / s2 - 1 / s), token1In: 0 };
}

/**
 * +-2% depth of a concentrated-liquidity pool (Uniswap v3 / Slipstream) in USD.
 * APPROXIMATION: the active liquidity is held constant across the whole +-2%
 * move (ticks crossed on the way are ignored), and fees are ignored. Depth is the
 * smaller of the buy side (quote in, equity price +2%) and the sell side (equity
 * in, equity price -2%, valued at the pool price). Quote token valued at $1.
 */
function v3Depth(p) {
  const s = Number(p.sqrtPriceX96) / Math.pow(2, 96);
  const L = Number(p.liquidity);
  if (!(s > 0) || !(L > 0) || !isNum(s) || !isNum(L)) return null;
  const up = Math.sqrt(1 + DEPTH_MOVE);
  const dn = Math.sqrt(1 - DEPTH_MOVE);
  const ratio = s * s * Math.pow(10, p.decimals0 - p.decimals1); // token1 per token0, human units
  let priceUsd, buyUsd, sellUsd;
  if (p.equitySide === 0) {
    priceUsd = ratio * STABLE_USD;
    buyUsd = moveCost(s, s * up, L).token1In / Math.pow(10, p.decimals1) * STABLE_USD;
    sellUsd = moveCost(s, s * dn, L).token0In / Math.pow(10, p.decimals0) * priceUsd;
  } else {
    priceUsd = STABLE_USD / ratio;
    buyUsd = moveCost(s, s / up, L).token0In / Math.pow(10, p.decimals0) * STABLE_USD;
    sellUsd = moveCost(s, s / dn, L).token1In / Math.pow(10, p.decimals1) * priceUsd;
  }
  if (![priceUsd, buyUsd, sellUsd].every(isNum) || priceUsd <= 0) return null;
  return { model: 'v3-active-liquidity', priceUsd, buyUsd, sellUsd, depthUsd: Math.min(buyUsd, sellUsd) };
}

/** +-2% depth of a constant-product pool from reserves (exact for the xy=k curve, fees ignored). */
function v2Depth(p) {
  const rEquity = Number(p.reserveEquity) / Math.pow(10, p.decimalsEquity);
  const rQuote = Number(p.reserveQuote) / Math.pow(10, p.decimalsQuote);
  if (!(rEquity > 0) || !(rQuote > 0)) return null;
  const priceUsd = rQuote / rEquity * STABLE_USD;
  const buyUsd = rQuote * (Math.sqrt(1 + DEPTH_MOVE) - 1) * STABLE_USD;
  const sellUsd = rQuote * (1 / Math.sqrt(1 - DEPTH_MOVE) - 1) * STABLE_USD;
  if (![priceUsd, buyUsd, sellUsd].every(isNum)) return null;
  return { model: 'v2-reserves', priceUsd, buyUsd, sellUsd, depthUsd: Math.min(buyUsd, sellUsd) };
}

// ------------------------------------------------------------------- RPC ---

function alchemyUrl(chain, key) {
  const net = ALCHEMY_NETWORKS[chain];
  return net && key ? 'https://' + net + '.g.alchemy.com/v2/' + key : null;
}

function pad32(hex) { return hex.replace(/^0x/, '').toLowerCase().padStart(64, '0'); }
function encodeCall(selector /* , ...32-byte words */) {
  return selector + Array.prototype.slice.call(arguments, 1).join('');
}
function addrWord(address) { return pad32(address); }
function intWord(n) {
  const v = BigInt(n);
  return (v < 0n ? (1n << 256n) + v : v).toString(16).padStart(64, '0');
}
function word(hex, i) { return '0x' + String(hex).replace(/^0x/, '').slice(i * 64, i * 64 + 64); }
function wordToBig(hex, i) { const w = word(hex, i); return w.length === 66 ? BigInt(w) : null; }
function wordToAddress(hex, i) { const w = word(hex, i); return w.length === 66 ? '0x' + w.slice(26) : null; }

/**
 * One JSON-RPC batch to a chain. Resolves { ok, results: [hex|null per call],
 * reason? }; a per-call error yields null for that call only.
 */
async function rpcBatch(deps, chain, calls) {
  const key = deps.env && deps.env.ALCHEMY_API_KEY;
  const url = alchemyUrl(chain, key);
  if (!url) return { ok: false, reason: key ? 'chain-unsupported' : 'rpc-unavailable', results: [] };
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'] }));
  const r = await httpJson(deps, url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return { ok: false, reason: 'rpc-' + r.reason, results: [] };
  const byId = new Map();
  (Array.isArray(r.json) ? r.json : []).forEach((x) => { if (x && x.id !== undefined) byId.set(x.id, x); });
  const results = calls.map((_c, i) => {
    const x = byId.get(i);
    return x && typeof x.result === 'string' && x.result.length > 2 && !x.error ? x.result : null;
  });
  return { ok: true, results };
}

/** Reads every resolved pool of one chain in a single batch and computes its depth. */
async function readChainDepths(deps, chain, entries, priceByPool) {
  const calls = [];
  const plan = entries.map((e) => {
    const start = calls.length;
    if (e.kind === 'uniswap-v2') calls.push({ to: e.address, data: SEL.getReserves });
    else { calls.push({ to: e.address, data: SEL.slot0 }); calls.push({ to: e.address, data: SEL.liquidity }); }
    return { e, start };
  });
  const out = new Map();
  const batch = await rpcBatch(deps, chain, calls);
  if (!batch.ok) { plan.forEach(({ e }) => out.set(e.poolId, { reason: batch.reason })); return out; }
  plan.forEach(({ e, start }) => {
    let d = null;
    if (e.kind === 'uniswap-v2') {
      const raw = batch.results[start];
      const r0 = raw ? wordToBig(raw, 0) : null;
      const r1 = raw ? wordToBig(raw, 1) : null;
      if (r0 === null || r1 === null) { out.set(e.poolId, { reason: 'rpc-error' }); return; }
      const eq = e.equitySide;
      d = v2Depth({
        reserveEquity: eq === 0 ? r0 : r1, reserveQuote: eq === 0 ? r1 : r0,
        decimalsEquity: eq === 0 ? e.token0.decimals : e.token1.decimals,
        decimalsQuote: eq === 0 ? e.token1.decimals : e.token0.decimals
      });
    } else {
      const slot0 = batch.results[start];
      const liq = batch.results[start + 1];
      const sqrtP = slot0 ? wordToBig(slot0, 0) : null;
      const L = liq ? wordToBig(liq, 0) : null;
      if (sqrtP === null || L === null) { out.set(e.poolId, { reason: 'rpc-error' }); return; }
      d = v3Depth({ sqrtPriceX96: sqrtP, liquidity: L, decimals0: e.token0.decimals, decimals1: e.token1.decimals, equitySide: e.equitySide });
    }
    if (!d) { out.set(e.poolId, { reason: 'no-liquidity' }); return; }
    const ref = priceByPool.get(e.poolId);
    if (ref && Math.abs(d.priceUsd / ref - 1) > MAX_POOL_PRICE_GAP) { out.set(e.poolId, { reason: 'price-mismatch' }); return; }
    out.set(e.poolId, { depth: d });
  });
  return out;
}

// -------------------------------------------------------------- response ---

function marketSummary(now) {
  const st = clock.getMarketState(new Date(now));
  const last = clock.getLastRegularClose(new Date(now));
  return {
    state: st.state,
    isRegularSession: st.state === 'open',
    calendarStale: !!st.calendarStale,
    lastRegularClose: last ? last.at.toISOString() : null,
    lastRegularCloseTs: last ? Math.floor(last.at.getTime() / 1000) : null
  };
}

async function buildResponse(deps) {
  const now = deps.now();
  const snapshot = deps.snapshot !== undefined ? deps.snapshot : loadSnapshot();
  if (!snapshot || !Array.isArray(snapshot.pools)) return null;
  const feeds = deps.feeds !== undefined ? deps.feeds : loadPythFeeds();
  const addresses = deps.addresses !== undefined ? deps.addresses : loadPoolAddresses();
  const market = marketSummary(now);

  // --- pool -> priced token
  const rows = snapshot.pools.map((p) => {
    const toks = Array.isArray(p.equityTokens) ? p.equityTokens : [];
    const id = toks.length === 1 ? coinId(p.chain, toks[0].address) : null;
    let priceReason = null;
    if (toks.length !== 1) priceReason = 'multi-equity-pool';
    else if (!id) priceReason = 'chain-unsupported';
    return { pool: p, coin: id, priceReason };
  });
  const coinIds = Array.from(new Set(rows.map((r) => r.coin).filter(Boolean)));

  // --- upstream fan-out (independent, each timeboxed, none can fail the others)
  const closed = !market.isRegularSession && !market.calendarStale && market.lastRegularCloseTs !== null;
  const tickers = Array.from(new Set(rows.map((r) => r.pool.underlying).filter(Boolean)));
  const pricesP = fetchPrices(deps, coinIds);
  const [priceRes, pythRes, tokenCloseRes, depthByPool] = await Promise.all([
    pricesP,
    closed ? fetchPythRefs(deps, feeds, tickers, market.lastRegularCloseTs) : Promise.resolve({ refs: new Map(), status: 'not-needed' }),
    closed ? fetchTokenCloseRefs(deps, coinIds, market.lastRegularCloseTs) : Promise.resolve({ refs: new Map(), failed: null }),
    pricesP.then((pr) => readDepths(deps, rows, addresses, pr.prices))
  ]);

  const poolsOut = rows.map((row) => {
    const reasons = {};
    const out = { pool: row.pool.pool, price: null, priceSource: null, priceTs: null, drift: null, driftRef: null, depth2pct: null, depthSource: 'heuristic' };
    const px = row.coin ? priceRes.prices.get(row.coin) : null;
    if (px) {
      out.price = round(px.price, px.price >= 1 ? 4 : 8);
      out.priceSource = 'defillama-coins';
      out.priceTs = new Date(px.ts * 1000).toISOString();
    } else {
      reasons.price = row.priceReason || (row.coin && priceRes.rejected.get(row.coin)) || 'price-unavailable';
    }

    // --- drift
    if (market.calendarStale) reasons.drift = 'calendar-stale';
    else if (market.isRegularSession) reasons.drift = 'market-open';
    else if (market.lastRegularCloseTs === null) reasons.drift = 'calendar-stale';
    else if (!px) reasons.drift = 'no-price';
    else {
      const candidates = [];
      const pyth = pythRes.refs.get(row.pool.underlying);
      if (pyth) candidates.push({ source: 'pyth', ref: pyth });
      const own = tokenCloseRes.refs.get(row.coin);
      if (own) candidates.push({ source: 'defillama-token', ref: own });
      let used = null;
      let mismatch = false;
      for (const c of candidates) {
        const d = driftFrom(px.price, c.ref);
        if (d !== null) { used = { c, d }; break; }
        mismatch = true;
      }
      if (used) {
        out.drift = used.d;
        out.driftRef = { source: used.c.source, kind: 'last-close', price: round(used.c.ref.price, used.c.ref.price >= 1 ? 4 : 8), ts: new Date(used.c.ref.ts * 1000).toISOString() };
      } else {
        reasons.drift = mismatch ? 'reference-mismatch' : 'reference-unavailable';
      }
    }

    // --- depth
    const dres = depthByPool.get(row.pool.pool);
    if (dres && dres.depth) {
      const tvl = Number(row.pool.tvlUsd);
      const cap = isNum(tvl) && tvl > 0 ? tvl / 2 : null;
      const capped = cap !== null && dres.depth.depthUsd > cap;
      out.depth2pct = Math.round(capped ? cap : dres.depth.depthUsd);
      out.depthSource = 'rpc';
      out.depthModel = dres.depth.model;
      if (capped) out.depthCapped = true;
    } else {
      reasons.depth = (dres && dres.reason) || 'no-resolver';
    }
    if (Object.keys(reasons).length) out.reasons = reasons;
    return out;
  });

  return {
    generatedAt: new Date(now).toISOString(),
    market: {
      state: market.state, isRegularSession: market.isRegularSession,
      calendarStale: market.calendarStale, lastRegularClose: market.lastRegularClose
    },
    sources: {
      prices: priceRes.failed ? { status: 'partial', reason: priceRes.failed } : { status: 'ok' },
      reference: closed
        ? { pyth: pythRes.status, defillamaToken: tokenCloseRes.failed ? tokenCloseRes.failed : 'ok' }
        : { status: 'not-needed' },
      rpc: rpcStatus(deps, depthByPool)
    },
    pools: poolsOut
  };
}

function rpcStatus(deps, depthByPool) {
  const key = deps.env && deps.env.ALCHEMY_API_KEY;
  if (!key) return { status: 'unavailable', reason: 'rpc-unavailable' };
  let ok = 0, failed = 0;
  depthByPool.forEach((v) => { if (v.depth) ok += 1; else failed += 1; });
  return { status: failed && !ok ? 'failed' : failed ? 'partial' : 'ok', pools: ok };
}

/** poolId -> { depth } | { reason } for every snapshot pool that has a resolver (others absent). */
async function readDepths(deps, rows, addresses, prices) {
  const out = new Map();
  const key = deps.env && deps.env.ALCHEMY_API_KEY;
  const known = (addresses && addresses.pools) || {};
  const refByPool = new Map();
  const byChain = new Map();
  rows.forEach((row) => {
    const amm = row.pool.onchain && row.pool.onchain.ammType;
    if (!RESOLVABLE_AMMS[amm]) { out.set(row.pool.pool, { reason: 'no-resolver' }); return; }
    if (!ALCHEMY_NETWORKS[row.pool.chain]) { out.set(row.pool.pool, { reason: 'chain-unsupported' }); return; }
    if (!key) { out.set(row.pool.pool, { reason: 'rpc-unavailable' }); return; }
    const entry = known[row.pool.pool];
    if (!entry || !entry.address) { out.set(row.pool.pool, { reason: 'pool-address-unresolved' }); return; }
    if (!byChain.has(row.pool.chain)) byChain.set(row.pool.chain, []);
    byChain.get(row.pool.chain).push(Object.assign({ poolId: row.pool.pool }, entry));
    // The DefiLlama price of the equity token is the sanity reference for the pool-implied price.
    const ref = row.coin ? prices.get(row.coin) : null;
    if (ref) refByPool.set(row.pool.pool, ref.price);
  });

  await Promise.all(Array.from(byChain.entries()).map(async ([chain, entries]) => {
    const res = await readChainDepths(deps, chain, entries, refByPool);
    res.forEach((v, k) => out.set(k, v));
  }));
  return out;
}

// ------------------------------------------------------------------ memo ---

let memo = null; // { at, promise }

/** Cached build: concurrent callers share one in-flight build; entries live 60s. */
async function getOnchain(deps) {
  const now = deps.now();
  if (memo && now - memo.at < MEMO_TTL_MS) return memo.promise;
  const promise = buildResponse(deps).catch(() => null);
  memo = { at: now, promise };
  const value = await promise;
  if (value === null) memo = null; // do not pin a failure for a minute
  return value;
}

function resetMemo() { memo = null; }

module.exports = {
  getOnchain, buildResponse, resetMemo,
  fetchPrices, fetchTokenCloseRefs, fetchPythRefs, driftFrom, v3Depth, v2Depth, moveCost,
  rpcBatch, alchemyUrl, httpJson, coinId, marketSummary,
  encodeCall, addrWord, intWord, word, wordToBig, wordToAddress,
  SEL, LLAMA_CHAIN_SLUGS, ALCHEMY_NETWORKS, RESOLVABLE_AMMS,
  MIN_CONFIDENCE, MEMO_TTL_MS, UPSTREAM_TIMEOUT_MS, MAX_PLAUSIBLE_DRIFT_PCT
};
