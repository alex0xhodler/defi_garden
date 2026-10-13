/**
 * GET /api/stocks-onchain — live on-chain layer for /stocks (Phase 4).
 *
 * One batched JSON response: per-pool price, after-hours drift and RPC depth,
 * plus the market-session state. Logic lives in api/_stocks-onchain.js.
 *
 * Env (Vercel project settings, server-side only, never sent to the browser):
 *   ALCHEMY_API_KEY  RPC reads for depth. Missing -> depth falls back to the
 *                    client-side heuristic (reason "rpc-unavailable").
 *   PYTH_API_KEY     Pyth Hermes price of the underlying stock at the close
 *                    (drift reference). Missing -> the token's own price at the
 *                    close is used instead.
 *   PYTH_HERMES_BASE optional, default https://pyth.dourolabs.app/hermes
 *   LLAMA_COINS_BASE optional, default https://coins.llama.fi
 *
 * Caching: s-maxage=60 at the CDN plus a 60s in-memory memo per warm instance.
 * Partial upstream failures still return 200 with nulls and reason codes; only
 * "cannot read the snapshot at all" is a 503 (and is not cached).
 */
'use strict';

const core = require('./_stocks-onchain.js');

const CACHE_OK = 'public, s-maxage=60, stale-while-revalidate=300';

function send(res, status, body, cache) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

module.exports = async function handleStocksOnchain(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Allow': 'GET, OPTIONS', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'method-not-allowed' }));
    return;
  }
  try {
    const body = await core.getOnchain({ fetch: globalThis.fetch, now: Date.now, env: process.env });
    if (!body) { send(res, 503, { error: 'unavailable' }, 'no-store'); return; }
    send(res, 200, body, CACHE_OK);
  } catch (err) {
    // Log the error class only: messages from fetch/RPC failures can embed request URLs.
    console.error('[stocks-onchain] failed:', err && err.name ? err.name : 'Error');
    send(res, 503, { error: 'unavailable' }, 'no-store');
  }
};
