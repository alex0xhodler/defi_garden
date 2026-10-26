/**
 * /stocks "token versions" comparison: shared logic (premium math, reference
 * price, DefiLlama prices) used by BOTH the CI generator
 * (generate-stocks-versions.js -> data/stocks-versions*.json) and the live view
 * of api/stocks-onchain.js (`?view=versions`).
 *
 * The leading underscore keeps Vercel from routing this file. Plain CommonJS, no
 * dependencies; every upstream call goes through an injected `fetch`.
 *
 * Definitions (one place, used everywhere):
 *   multiplier  = shares of the underlying that ONE token represents
 *                 (null = unknown; NO premium is ever computed for such a token).
 *   premium %   = (token price / (multiplier x reference price) - 1) x 100.
 *   reference   = Pyth (Equity.US.<TICKER>/USD) live during the regular US
 *                 session, the last regular close outside it. Always labelled
 *                 with which one it is. Pyth Hermes needs PYTH_API_KEY; without
 *                 it the reference is null with a reason, never a substitute.
 *
 * Secrets (PYTH_API_KEY) are read from `deps.env`, used only for request
 * headers, and never logged or returned. Failures reduce to short reason codes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('./_stocks-onchain.js');
const clock = require('../stocks-market-clock.js');

const MIN_CONFIDENCE = 0.9;
const MAX_PRICE_AGE_SEC = 60 * 60;
// A premium beyond this is far more likely a multiplier / corporate-action or
// wrong-token mismatch than a real dislocation: dropped, never shown.
const MAX_PLAUSIBLE_PREMIUM_PCT = 25;
const CLOSE_WINDOW_SEC = 15 * 60;
const LIVE_MAX_AGE_SEC = 120;
const MEMO_TTL_MS = 60 * 1000;

const isNum = core.isNum;
const round = core.round;

// ------------------------------------------------------------------ keys ---

/** DefiLlama coins id for a registry chain+address (EVM lowercased, Solana case-exact). */
function versionKey(chain, address) {
  return core.coinId(chain, address);
}

// ----------------------------------------------------------------- prices ---

/**
 * DefiLlama coins current prices (an AGGREGATOR of on-chain prices), batched.
 * Keeps confidence and timestamp. A price is rejected (with a reason) when it is
 * missing, below MIN_CONFIDENCE or older than MAX_PRICE_AGE_SEC.
 * @returns {Promise<{prices: Map<string,{price,ts,confidence,decimals,symbol}>, rejected: Map<string,string>, failed: string|null}>}
 */
async function fetchVersionPrices(deps, ids) {
  const prices = new Map();
  const rejected = new Map();
  let failed = null;
  const nowSec = Math.floor(deps.now() / 1000);
  const results = await Promise.all(core.chunk(ids, 40).map(async (batch) => ({
    batch, r: await core.httpJson(deps, core.coinsBase(deps) + '/prices/current/' + batch.join(','))
  })));
  results.forEach(({ batch, r }) => {
    if (!r.ok) { failed = r.reason; batch.forEach((id) => rejected.set(id, 'prices-' + r.reason)); return; }
    const coins = (r.json && r.json.coins) || {};
    batch.forEach((id) => {
      const c = coins[id];
      if (!c || !isNum(c.price) || c.price <= 0) { rejected.set(id, 'price-unavailable'); return; }
      if (!isNum(c.confidence) || c.confidence < MIN_CONFIDENCE) { rejected.set(id, 'low-confidence'); return; }
      if (!isNum(c.timestamp) || nowSec - c.timestamp > MAX_PRICE_AGE_SEC) { rejected.set(id, 'stale-price'); return; }
      prices.set(id, {
        price: c.price, ts: c.timestamp, confidence: c.confidence,
        decimals: isNum(c.decimals) ? c.decimals : null, symbol: typeof c.symbol === 'string' ? c.symbol : null
      });
    });
  });
  return { prices, rejected, failed };
}

// ---------------------------------------------------------------- premium ---

/**
 * @returns {{pct: number|null, reason?: string}}
 */
function premiumPct(price, multiplier, refPrice) {
  if (!isNum(price) || price <= 0) return { pct: null, reason: 'no-price' };
  if (!isNum(multiplier) || multiplier <= 0) return { pct: null, reason: 'multiplier-unknown' };
  if (!isNum(refPrice) || refPrice <= 0) return { pct: null, reason: 'no-reference' };
  const pct = (price / (multiplier * refPrice) - 1) * 100;
  if (!isNum(pct) || Math.abs(pct) > MAX_PLAUSIBLE_PREMIUM_PCT) return { pct: null, reason: 'reference-mismatch' };
  return { pct: round(pct, 3) };
}

// ----------------------------------------------------------------- spread ---

/**
 * Spread vs the median price of the ticker's token versions. Needs NO external
 * reference: each priced version with a KNOWN multiplier is normalised to one
 * share (price / multiplier); the median of those is the benchmark. A version with
 * an unknown multiplier (or no price) is shown elsewhere but is excluded from the
 * median and gets no spread. Fewer than two normalisable versions -> no median
 * (a lone version would trivially sit at 0).
 * This is "vs median of token versions", NOT "vs the real share".
 * @param {Array<{key:string, price:number|null, multiplier:number|null}>} entries
 * @returns {{medianNormalizedPrice: number|null, count: number, spreads: Map<string, number>}}
 */
function spreadVsMedian(entries) {
  const norm = [];
  (entries || []).forEach((e) => {
    if (!e || !isNum(e.price) || e.price <= 0 || !isNum(e.multiplier) || e.multiplier <= 0) return;
    norm.push({ key: e.key, n: e.price / e.multiplier });
  });
  const spreads = new Map();
  if (norm.length < 2) return { medianNormalizedPrice: null, count: norm.length, spreads };
  const sorted = norm.map((x) => x.n).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  norm.forEach((x) => spreads.set(x.key, round((x.n / median - 1) * 100, 3)));
  return { medianNormalizedPrice: round(median, median >= 1 ? 4 : 8), count: norm.length, spreads };
}

// ------------------------------------------------------------------- Pyth ---

function pythHeaders(deps) {
  const key = deps.env && deps.env.PYTH_API_KEY;
  return key ? { headers: { Authorization: 'Bearer ' + key } } : null;
}

function pythIds(feeds, tickers) {
  const idToTicker = new Map();
  tickers.forEach((t) => { const f = feeds && feeds.feeds && feeds.feeds[t]; if (f && f.id) idToTicker.set(f.id, t); });
  return idToTicker;
}

function parsePyth(json, idToTicker, accept) {
  const out = new Map();
  ((json && json.parsed) || []).forEach((p) => {
    const ticker = idToTicker.get(String(p && p.id).replace(/^0x/, ''));
    const px = p && p.price;
    if (!ticker || !px) return;
    const price = Number(px.price) * Math.pow(10, Number(px.expo));
    const ts = Number(px.publish_time);
    if (!isNum(price) || price <= 0 || !isNum(ts) || !accept(ts)) return;
    out.set(ticker, { price: round(price, price >= 1 ? 4 : 8), ts });
  });
  return out;
}

/**
 * Pyth price of each underlying right now (regular session). A print older than
 * LIVE_MAX_AGE_SEC is rejected (status stays 'ok'; the ticker is just absent).
 * @returns {Promise<{refs: Map<string,{price,ts}>, status: string}>}
 */
async function fetchPythLive(deps, feeds, tickers) {
  const auth = pythHeaders(deps);
  if (!auth) return { refs: new Map(), status: 'no-key' };
  const map = pythIds(feeds, tickers);
  if (!map.size) return { refs: new Map(), status: 'no-feeds' };
  const nowSec = Math.floor(deps.now() / 1000);
  const q = Array.from(map.keys()).map((id) => 'ids[]=' + id).join('&');
  const r = await core.httpJson(deps, core.pythBase(deps) + '/v2/updates/price/latest?' + q + '&parsed=true&encoding=hex', auth);
  if (!r.ok) return { refs: new Map(), status: r.reason };
  return { refs: parsePyth(r.json, map, (ts) => nowSec - ts <= LIVE_MAX_AGE_SEC && ts - nowSec <= 60), status: 'ok' };
}

/**
 * Pyth price of each underlying at the last regular close: the first update at
 * or after closeTs - 5s, accepted only when printed inside the window around the
 * close (the Equity.US feed is silent outside the regular session).
 * @returns {Promise<{refs: Map<string,{price,ts}>, status: string}>}
 */
async function fetchPythAtClose(deps, feeds, tickers, closeTs) {
  const auth = pythHeaders(deps);
  if (!auth) return { refs: new Map(), status: 'no-key' };
  const map = pythIds(feeds, tickers);
  if (!map.size) return { refs: new Map(), status: 'no-feeds' };
  const q = Array.from(map.keys()).map((id) => 'ids[]=' + id).join('&');
  const r = await core.httpJson(deps, core.pythBase(deps) + '/v2/updates/price/' + (closeTs - 5) + '?' + q + '&parsed=true&encoding=hex', auth);
  if (!r.ok) return { refs: new Map(), status: r.reason };
  return { refs: parsePyth(r.json, map, (ts) => ts >= closeTs - CLOSE_WINDOW_SEC && ts <= closeTs + 60), status: 'ok' };
}

// ----------------------------------------------------------------- market ---

function marketInfo(nowMs) {
  const d = new Date(nowMs);
  const st = clock.getMarketState(d);
  const last = clock.getLastRegularClose(d);
  return {
    state: st.state,
    isRegularSession: st.state === 'open',
    calendarStale: !!st.calendarStale,
    lastRegularClose: last ? last.at.toISOString() : null,
    lastRegularCloseTs: last ? Math.floor(last.at.getTime() / 1000) : null,
    lastRegularCloseEtDate: last ? last.etDate : null
  };
}

// -------------------------------------------------------------- live view ---

function loadSlim() {
  // Literal path so Vercel's file tracer bundles it with the function.
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stocks-versions-slim.json'), 'utf8')); } catch (_e) { return null; }
}
function loadFeeds() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stocks-pyth-feeds.json'), 'utf8')); } catch (_e) { return null; }
}

/**
 * `GET /api/stocks-onchain?view=versions`: per-version live on-chain price (DefiLlama
 * coins), Pyth reference per ticker, session, and the resulting premium.
 *
 * Reference per ticker:
 *   regular session  -> Pyth live ({kind:'live'}); if unavailable, null + reason
 *                       (we do NOT silently show a stale close as if it were live)
 *   otherwise        -> last regular close ({kind:'last-close'}): the CI value from
 *                       the slim file when it is for the current close, else Pyth
 *                       at the close (needs PYTH_API_KEY), else null + reason.
 * @returns {Promise<object|null>} null when the slim file is unreadable (-> 503).
 */
async function buildVersionsView(deps) {
  const nowMs = deps.now();
  const slim = deps.slim !== undefined ? deps.slim : loadSlim();
  if (!slim || !slim.tickers) return null;
  const feeds = deps.feeds !== undefined ? deps.feeds : loadFeeds();
  const market = marketInfo(nowMs);
  const tickers = Object.keys(slim.tickers);

  const ids = [];
  tickers.forEach((t) => slim.tickers[t].v.forEach((v) => { const id = versionKey(v.c, v.a); if (id) ids.push(id); }));

  const live = market.isRegularSession && !market.calendarStale;
  const closeTs = market.lastRegularCloseTs;
  const needCloseRefs = !live && !market.calendarStale && closeTs !== null &&
    tickers.some((t) => { const rc = slim.tickers[t].refClose; return !rc || Math.abs(rc.ts - closeTs) > CLOSE_WINDOW_SEC; });
  const [priceRes, pythLive, pythClose] = await Promise.all([
    fetchVersionPrices(deps, Array.from(new Set(ids))),
    live ? fetchPythLive(deps, feeds, tickers) : Promise.resolve({ refs: new Map(), status: 'not-needed' }),
    needCloseRefs ? fetchPythAtClose(deps, feeds, tickers, closeTs) : Promise.resolve({ refs: new Map(), status: 'not-needed' })
  ]);

  const outTickers = {};
  tickers.forEach((t) => {
    const s = slim.tickers[t];
    let reference = null;
    let refReason = null;
    if (market.calendarStale) refReason = 'calendar-stale';
    else if (live) {
      const p = pythLive.refs.get(t);
      if (p) reference = { kind: 'live', source: 'pyth', price: p.price, ts: new Date(p.ts * 1000).toISOString() };
      else refReason = pythLive.status === 'ok' ? 'reference-stale' : 'pyth-' + pythLive.status;
    } else if (closeTs === null) refReason = 'calendar-stale';
    else {
      const rc = s.refClose;
      if (rc && Math.abs(rc.ts - closeTs) <= CLOSE_WINDOW_SEC) {
        reference = { kind: 'last-close', source: rc.src || 'pyth', price: rc.p, ts: new Date(rc.ts * 1000).toISOString(), date: rc.date || market.lastRegularCloseEtDate };
      } else {
        const p = pythClose.refs.get(t);
        if (p) reference = { kind: 'last-close', source: 'pyth', price: p.price, ts: new Date(p.ts * 1000).toISOString(), date: market.lastRegularCloseEtDate };
        else refReason = pythClose.status === 'ok' ? 'reference-stale' : 'pyth-' + pythClose.status;
      }
    }
    const versions = {};
    s.v.forEach((v) => {
      const id = versionKey(v.c, v.a);
      const px = id ? priceRes.prices.get(id) : null;
      const row = { price: null, priceTs: null, premiumPct: null };
      if (px) { row.price = round(px.price, px.price >= 1 ? 4 : 8); row.priceTs = new Date(px.ts * 1000).toISOString(); }
      const reasons = {};
      if (!px) reasons.price = (id && priceRes.rejected.get(id)) || 'price-unavailable';
      const prem = premiumPct(px && px.price, v.m, reference && reference.price);
      if (prem.pct !== null) row.premiumPct = prem.pct;
      else if (px) reasons.premium = prem.reason === 'no-reference' ? (refReason || 'no-reference') : prem.reason;
      if (Object.keys(reasons).length) row.reasons = reasons;
      versions[v.k] = row;
    });
    const sp = spreadVsMedian(s.v.map((v) => {
      const id = versionKey(v.c, v.a);
      const px = id ? priceRes.prices.get(id) : null;
      return { key: v.k, price: px ? px.price : null, multiplier: v.m };
    }));
    Object.keys(versions).forEach((k) => {
      versions[k].spreadVsMedianPct = sp.spreads.has(k) ? sp.spreads.get(k) : null;
    });
    outTickers[t] = { reference, medianNormalizedPrice: sp.medianNormalizedPrice, versions };
    if (!reference && refReason) outTickers[t].referenceReason = refReason;
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    view: 'versions',
    market: {
      state: market.state, isRegularSession: market.isRegularSession,
      calendarStale: market.calendarStale, lastRegularClose: market.lastRegularClose
    },
    // Which reference the UI must label: "Pyth live" in the regular session, "last regular close" otherwise.
    referenceMode: market.calendarStale ? 'unavailable' : (live ? 'live' : 'last-close'),
    sources: {
      prices: priceRes.failed ? { status: 'partial', reason: priceRes.failed } : { status: 'ok', label: 'DefiLlama coins (aggregated on-chain prices)' },
      reference: { pyth: live ? pythLive.status : pythClose.status }
    },
    tickers: outTickers
  };
}

let memo = null;
async function getVersionsView(deps) {
  const now = deps.now();
  if (memo && now - memo.at < MEMO_TTL_MS) return memo.promise;
  const promise = buildVersionsView(deps).catch(() => null);
  memo = { at: now, promise };
  const value = await promise;
  if (value === null) memo = null;
  return value;
}
function resetVersionsMemo() { memo = null; }

module.exports = {
  versionKey, fetchVersionPrices, premiumPct, spreadVsMedian, fetchPythLive, fetchPythAtClose, marketInfo,
  buildVersionsView, getVersionsView, resetVersionsMemo,
  MIN_CONFIDENCE, MAX_PRICE_AGE_SEC, MAX_PLAUSIBLE_PREMIUM_PCT, CLOSE_WINDOW_SEC, LIVE_MAX_AGE_SEC
};
