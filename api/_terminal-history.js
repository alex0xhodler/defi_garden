/**
 * DeFi Garden Terminal, P1: GET /api/v1/history?pool=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Paid ("terminal") per-pool history: the pool's daily published 14-day forecast
 * range (p10 / p50 / p90) with the realized rate where it is known (the pool's
 * own track record), plus daily DeFi Score / band / pillar TIERS when a score
 * history source is configured. Spec: docs/terminal-spec.md.
 *
 * PROPRIETARY RULE (CLAUDE.md): never an exact pillar number, weight, cutoff or
 * model name. Tiers only (High / Medium / Low); this file never reads
 * pillar numbers or raw pillar points.
 *
 * Access (checked in this order):
 *   1. `Authorization: Bearer <api key>`; sha256(key) must be in the env allowlist
 *      TERMINAL_API_KEYS_SHA256 (comma separated sha256 hex). A bad key is a 401, it
 *      never falls through to payment.
 *   2. x402 pay-per-call: `X-PAYMENT` header verified by the existing gate
 *      (edge/x402-core.js). Only when X402_ENABLED is on.
 *   Otherwise 401 (or 402 with an x402 challenge when x402 is enabled).
 * Feature flag: TERMINAL_HISTORY_ENABLED must be "1"/"true", else 404 for everything.
 *
 * Data: the public forecast ledger data/forecasts/YYYY-MM-DD.json and the 30-day
 * outcome tree data/history/YYYY-MM-DD.json, bundled into this function through
 * vercel.json functions.includeFiles (the files are already public; this
 * endpoint is a convenience + the paid wrapper). Score history is NEVER a static
 * file (anything static is public): it is read from a Cloudflare D1 table over
 * the REST API when TERMINAL_SCORES_* env vars are set.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROUTE_ID = '/api/v1/history';
const SCHEMA = 'defi-garden.terminal.history.v1';
const MAX_RANGE_DAYS = 365;
const DEFAULT_RANGE_DAYS = 30;
const FORECAST_HORIZON_DAYS = 14;
// Proposal, owner to confirm (docs/terminal-spec.md): $0.01 USDC per call, 6 decimals.
const X402_PRICE_USDC_ATOMIC = '10000';
// Rate limit PLACEHOLDER: not enforced in P1 (see spec "Rate limits"). The hook exists so P2 can
// plug in D1 counters / Vercel WAF without touching the handler.
const RATE_LIMIT_PLACEHOLDER = { enforced: false, plannedPerKeyPerMinute: 60 };

const POOL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,99}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;
const ALLOWED_PARAMS = new Set(['pool', 'from', 'to']);
const BANDS = new Set(['AAA', 'AA', 'A', 'BBB', 'HIGH RISK']);
const TIER_NAME = { H: 'High', M: 'Medium', L: 'Low' };

// Literal paths so Vercel's file tracer bundles them (see api/mcp.js).
const DEFAULT_FORECASTS_DIR = path.join(__dirname, '../data/forecasts');
const DEFAULT_HISTORY_DIR = path.join(__dirname, '../data/history');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function parseAllowlist(raw) {
  if (typeof raw !== 'string') return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[0-9a-f]{64}$/.test(s));
}

/** Constant-time membership test of sha256(key) against the allowlist. */
function keyIsValid(token, allowlist) {
  if (!token || allowlist.length === 0) return false;
  const h = Buffer.from(sha256Hex(token), 'hex');
  let hit = false;
  for (const entry of allowlist) {
    if (crypto.timingSafeEqual(h, Buffer.from(entry, 'hex'))) hit = true;
  }
  return hit;
}

function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function parseDay(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return null;
  const ms = Date.parse(s + 'T00:00:00Z');
  if (!Number.isFinite(ms) || isoDay(ms) !== s) return null;
  return ms;
}
function addDays(day, n) { return isoDay(parseDay(day) + n * 86400000); }

/** Strict query validation. Returns { ok:true, pool, from, to } or { ok:false, message }. */
function validateQuery(query, nowMs) {
  const q = query || {};
  for (const k of Object.keys(q)) {
    if (!ALLOWED_PARAMS.has(k)) return { ok: false, message: 'Unknown query parameter "' + String(k).slice(0, 40) + '". Allowed: pool, from, to.' };
    if (typeof q[k] !== 'string') return { ok: false, message: 'Query parameter "' + k + '" must be given once.' };
  }
  if (!q.pool || !POOL_RE.test(q.pool)) return { ok: false, message: '"pool" is required: a DefiLlama pool id (6-100 chars of letters, digits, . _ : -).' };
  const today = isoDay(nowMs);
  let to = today;
  if (q.to !== undefined) {
    if (parseDay(q.to) === null) return { ok: false, message: '"to" must be a real date, YYYY-MM-DD.' };
    to = q.to;
  }
  let from = addDays(to, -DEFAULT_RANGE_DAYS);
  if (q.from !== undefined) {
    if (parseDay(q.from) === null) return { ok: false, message: '"from" must be a real date, YYYY-MM-DD.' };
    from = q.from;
  }
  if (from > to) return { ok: false, message: '"from" must not be after "to".' };
  if ((parseDay(to) - parseDay(from)) / 86400000 > MAX_RANGE_DAYS) return { ok: false, message: 'Date range is limited to ' + MAX_RANGE_DAYS + ' days.' };
  return { ok: true, pool: q.pool, from, to };
}

function listDays(dir) {
  try {
    return fs.readdirSync(dir).map((f) => (FILE_RE.exec(f) || [])[1]).filter(Boolean).sort();
  } catch (_e) { return []; }
}

/** Reads one dated file but only JSON-parses it when it mentions the pool (cheap prefilter). */
function readPoolEntry(dir, day, pool, key) {
  let text;
  try { text = fs.readFileSync(path.join(dir, day + '.json'), 'utf8'); } catch (_e) { return null; }
  if (text.indexOf('"' + pool + '"') === -1) return null;
  try {
    const doc = JSON.parse(text);
    const entry = (doc[key] || {})[pool];
    return Array.isArray(entry) ? entry : null;
  } catch (_e) { return null; }
}

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

function forecastHistory(pool, from, to, dirs) {
  const days = listDays(dirs.forecasts).filter((d) => d >= from && d <= to);
  const outcomeDays = new Set(listDays(dirs.history));
  const rows = [];
  for (const day of days) {
    const e = readPoolEntry(dirs.forecasts, day, pool, 'forecasts');
    if (!e) continue;
    const [p10, p50, p90, apy, tvl, stable] = e;
    const row = { date: day, p10: num(p10), p50: num(p50), p90: num(p90), apy_at_issue: num(apy), tvl_usd: num(tvl), stable: stable === 1 };
    // The pool's own track record: published range vs the rate observed 14 days later (same basis
    // as the public /forecast-accuracy evaluation). Null until that outcome day exists.
    const outcomeDay = addDays(day, FORECAST_HORIZON_DAYS);
    let realized = null;
    if (outcomeDays.has(outcomeDay)) {
      const h = readPoolEntry(dirs.history, outcomeDay, pool, 'pools');
      if (h && num(h[0]) !== null && h[0] <= 1000) realized = h[0];
    }
    row.realized_apy = realized;
    row.realized_on = realized === null ? null : outcomeDay;
    row.in_range = realized === null || row.p10 === null || row.p90 === null ? null : (realized >= row.p10 && realized <= row.p90);
    rows.push(row);
  }
  return rows;
}

/** Daily score history from Cloudflare D1 over REST (Vercel functions cannot use Worker bindings). */
async function scoreHistory(pool, from, to, env, fetchImpl) {
  const acct = env.CLOUDFLARE_ACCOUNT_ID;
  const db = env.TERMINAL_SCORES_D1_DATABASE_ID;
  const token = env.TERMINAL_SCORES_D1_TOKEN;
  if (!acct || !db || !token || typeof fetchImpl !== 'function') {
    return { available: false, reason: 'not_yet_collected', rows: [] };
  }
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 4000) : null;
  try {
    const resp = await fetchImpl('https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(acct) + '/d1/database/' + encodeURIComponent(db) + '/query', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: 'SELECT day, score, band, tiers FROM score_daily WHERE pool_id = ? AND day >= ? AND day <= ? ORDER BY day ASC LIMIT 400',
        params: [pool, from, to]
      }),
      signal: ctl ? ctl.signal : undefined
    });
    if (!resp || !resp.ok) return { available: false, reason: 'source_unavailable', rows: [] };
    const body = await resp.json();
    const raw = body && body.success && body.result && body.result[0] && body.result[0].results;
    if (!Array.isArray(raw)) return { available: false, reason: 'source_unavailable', rows: [] };
    const rows = [];
    for (const r of raw) {
      if (!r || parseDay(r.day) === null || num(r.score) === null || !BANDS.has(r.band)) continue;
      const t = typeof r.tiers === 'string' && /^[HML]{4}$/.test(r.tiers) ? r.tiers : null;
      rows.push({
        date: r.day,
        score: Math.round(r.score * 10) / 10,
        band: r.band,
        tiers: t ? { stability: TIER_NAME[t[0]], sustainability: TIER_NAME[t[1]], stickiness: TIER_NAME[t[2]], liquidity: TIER_NAME[t[3]] } : null
      });
    }
    return { available: true, reason: null, rows };
  } catch (_e) {
    return { available: false, reason: 'source_unavailable', rows: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function send(res, status, body, extra) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    // Authenticated / paid response: never shared-cacheable.
    'Cache-Control': 'private, no-store',
    'Vary': 'Authorization, X-PAYMENT',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex'
  }, extra || {}));
  res.end(JSON.stringify(body));
}

function howToGetAccess(x402On) {
  return {
    api_key: 'Send "Authorization: Bearer <api key>". API keys are issued to DeFi Garden Terminal subscribers; the Terminal is launching in phases.',
    x402: x402On
      ? 'Pay per call in USDC: retry with an X-PAYMENT header built from the 402 challenge.'
      : 'x402 pay-per-call is not enabled yet.',
    free_alternatives: ['GET https://www.defi.garden/data/pool-scores.json (current score, band and pillar tiers)', 'https://www.defi.garden/forecast-accuracy (public track record)']
  };
}

function loadX402() {
  try { return require('../edge/x402-core.js'); } catch (_e) { return null; }
}

function createHandler(opts) {
  const o = opts || {};
  return async function terminalHistoryHandler(req, res) {
    const env = o.env || process.env;
    const flag = String(env.TERMINAL_HISTORY_ENABLED || '').toLowerCase();
    if (flag !== '1' && flag !== 'true') return send(res, 404, { error: 'not_found' });

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' });

    const headers = req.headers || {};
    let access = null;
    const extraHeaders = {};
    const auth = headers.authorization;
    const x402 = o.x402 !== undefined ? o.x402 : loadX402();
    const x402Cfg = x402 ? x402.readConfig(env) : { enabled: false };
    const x402On = !!(x402 && x402Cfg.enabled);

    if (auth !== undefined) {
      const m = /^Bearer\s+(\S+)$/i.exec(String(auth));
      if (!m || !keyIsValid(m[1], parseAllowlist(env.TERMINAL_API_KEYS_SHA256))) {
        return send(res, 401, { error: 'invalid_api_key', message: 'The API key is not valid.', how_to_get_access: howToGetAccess(x402On) }, { 'WWW-Authenticate': 'Bearer realm="defi-garden-terminal"' });
      }
      access = 'api_key';
    } else if (x402On) {
      const host = headers.host || 'www.defi.garden';
      const challenge = x402.buildChallenge({ routeId: ROUTE_ID, resourceUrl: 'https://' + host + (req.url || ROUTE_ID), config: x402Cfg });
      const a0 = challenge.accepts[0];
      a0.maxAmountRequired = X402_PRICE_USDC_ATOMIC;
      a0.description = 'Per-pool daily forecast and score history (paid terminal data).';
      const result = await x402.verifyPayment({ header: headers['x-payment'], challenge, config: x402Cfg, fetchImpl: o.fetchImpl || (typeof fetch === 'function' ? fetch : undefined) });
      if (!result.paid) {
        if (result.reason) challenge.error = result.reason;
        return send(res, 402, challenge);
      }
      access = 'x402';
      if (typeof x402.paymentResponseHeader === 'function') extraHeaders['X-PAYMENT-RESPONSE'] = x402.paymentResponseHeader(result);
    } else {
      return send(res, 401, { error: 'authentication_required', message: 'This endpoint is part of the paid DeFi Garden Terminal. Send an API key as a Bearer token.', how_to_get_access: howToGetAccess(false) }, { 'WWW-Authenticate': 'Bearer realm="defi-garden-terminal"' });
    }

    // Rate limit placeholder: not enforced in P1 (documented in docs/terminal-spec.md).
    void RATE_LIMIT_PLACEHOLDER;

    const nowMs = o.now ? o.now() : Date.now();
    const url = new URL(req.url || '/', 'http://localhost');
    const query = {};
    for (const k of new Set(url.searchParams.keys())) {
      const all = url.searchParams.getAll(k);
      query[k] = all.length === 1 ? all[0] : all;
    }
    const v = validateQuery(query, nowMs);
    if (!v.ok) return send(res, 400, { error: 'invalid_request', message: v.message }, extraHeaders);

    const dirs = { forecasts: o.forecastsDir || DEFAULT_FORECASTS_DIR, history: o.historyDir || DEFAULT_HISTORY_DIR };
    const forecasts = forecastHistory(v.pool, v.from, v.to, dirs);
    const scores = await scoreHistory(v.pool, v.from, v.to, env, o.fetchImpl || (typeof fetch === 'function' ? fetch : undefined));

    return send(res, 200, {
      schema: SCHEMA,
      pool: v.pool,
      from: v.from,
      to: v.to,
      access,
      forecast_history: {
        note: 'Daily published 14-day forecast range (low p10 / central p50 / high p90, percent APY). Experimental. realized_apy is the rate observed 14 days after issue, once known; in_range says whether it fell inside the published range.',
        rows: forecasts
      },
      score_history: {
        note: 'Daily DeFi Score (0-100), band and pillar tiers. Bands are DeFi Garden\'s own model output, not a credit rating from a registered agency. Education, not advice.',
        available: scores.available,
        unavailable_reason: scores.reason,
        rows: scores.rows
      },
      source: 'DefiLlama, via DeFi Garden trust rails'
    }, extraHeaders);
  };
}

module.exports = { createHandler, validateQuery, keyIsValid, parseAllowlist, sha256Hex, ROUTE_ID, SCHEMA, X402_PRICE_USDC_ATOMIC, MAX_RANGE_DAYS };
