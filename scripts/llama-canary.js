#!/usr/bin/env node
/* scripts/llama-canary.js — DefiLlama free-endpoint canary (no dependencies).
 *
 * DefiLlama is reorganising its API (see docs/defillama-api.md). The free
 * https://yields.llama.fi/pools and /chart/{pool} are what the whole product
 * reads; if either disappears or changes shape we want ONE loud, early CI
 * failure instead of a silently degraded daily regeneration.
 *
 * Asserts, against the FREE endpoints (never the Pro paths — the canary's job
 * is to watch the thing production depends on, so LLAMA_PRO_API_KEY is
 * deliberately ignored; LLAMA_YIELDS_BASE is honoured so a proxy can be tested):
 *   /pools  -> HTTP 200, status === "success", data is an array with > 5000
 *              entries, and the fields the app relies on are present:
 *              pool/chain/project/symbol (string), tvlUsd (number), and the
 *              keys apy/apyBase/apyReward (number or null — apyReward is
 *              legitimately null for most pools).
 *   /chart/{id} (a pool id from data/landing-pools.json — the same one the
 *              landing card reads live) -> HTTP 200, status === "success",
 *              non-empty array whose last point has numeric apy + tvlUsd
 *              (exactly what landing.js requires).
 * Also warns (does not fail) if the response carries Deprecation/Sunset
 * headers. Exit 0 = healthy, 1 = canary failed, with a clear message.
 *
 * Usage: node scripts/llama-canary.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const llama = require('../llama-endpoints.js').build({
  LLAMA_YIELDS_BASE: process.env.LLAMA_YIELDS_BASE // free URLs only; no Pro key on purpose
});

const MIN_POOLS = 5000;
const MIN_VALID_RATIO = 0.99; // tolerate a handful of malformed rows, not a schema change
const ATTEMPTS = 3;
const TIMEOUT_MS = 90000;

const failures = [];
function fail(msg) { failures.push(msg); }

async function getJson(url, label) {
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'defi-garden-llama-canary' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const deprecation = res.headers.get('deprecation') || res.headers.get('sunset');
      if (deprecation) console.warn(`WARN ${label}: deprecation/sunset header present: ${deprecation}`);
      if (res.status >= 500 && attempt < ATTEMPTS) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        if (res.status !== 200) throw Object.assign(new Error(`HTTP ${res.status} (expected 200)`), { final: true });
        return await res.json();
      }
    } catch (err) {
      if (err.final) throw err;
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  throw lastErr;
}

function checkPools(body) {
  if (!body || body.status !== 'success') {
    fail(`/pools: status is ${JSON.stringify(body && body.status)}, expected "success"`);
    return;
  }
  if (!Array.isArray(body.data)) { fail('/pools: data is not an array'); return; }
  if (body.data.length <= MIN_POOLS) {
    fail(`/pools: only ${body.data.length} entries, expected > ${MIN_POOLS}`);
  }
  const numOrNull = (v) => v === null || typeof v === 'number';
  let valid = 0;
  for (const p of body.data) {
    if (p && typeof p.pool === 'string' && typeof p.chain === 'string' &&
        typeof p.project === 'string' && typeof p.symbol === 'string' &&
        typeof p.tvlUsd === 'number' &&
        'apy' in p && 'apyBase' in p && 'apyReward' in p &&
        numOrNull(p.apy) && numOrNull(p.apyBase) && numOrNull(p.apyReward)) valid++;
  }
  const ratio = body.data.length ? valid / body.data.length : 0;
  if (ratio < MIN_VALID_RATIO) {
    fail(`/pools: only ${valid}/${body.data.length} entries have the fields the app relies on ` +
      '(pool, chain, project, symbol, tvlUsd, apy, apyBase, apyReward) — schema drift?');
  }
  console.log(`pools: ${body.data.length} entries, ${valid} well-formed (${(ratio * 100).toFixed(2)}%)`);
}

function checkChart(body, poolId) {
  if (!body || body.status !== 'success') {
    fail(`/chart/${poolId}: status is ${JSON.stringify(body && body.status)}, expected "success"`);
    return;
  }
  if (!Array.isArray(body.data) || body.data.length === 0) {
    fail(`/chart/${poolId}: data is not a non-empty array`);
    return;
  }
  const last = body.data[body.data.length - 1];
  if (!last || typeof last.apy !== 'number' || typeof last.tvlUsd !== 'number' || !last.timestamp) {
    fail(`/chart/${poolId}: last point lacks numeric apy/tvlUsd + timestamp: ${JSON.stringify(last)}`);
    return;
  }
  console.log(`chart ${poolId}: ${body.data.length} points, latest apy=${last.apy} tvlUsd=${Math.round(last.tvlUsd)}`);
}

function pickChartPoolId() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'landing-pools.json'), 'utf8'));
    const id = j && j.pools && j.pools[0] && j.pools[0].pool;
    if (typeof id === 'string' && id) return id;
  } catch (_e) { /* fall through */ }
  return null;
}

async function main() {
  const poolsUrl = llama.pools();
  console.log(`GET ${poolsUrl}`);
  let pools;
  try { pools = await getJson(poolsUrl, '/pools'); } catch (err) { fail(`/pools: ${err.message}`); }
  if (pools) checkPools(pools);

  let poolId = pickChartPoolId();
  if (!poolId && pools && Array.isArray(pools.data) && pools.data[0]) poolId = pools.data[0].pool;
  if (!poolId) {
    fail('chart: no pool id available (data/landing-pools.json unreadable and /pools unusable)');
  } else {
    const chartUrl = llama.chart(poolId);
    console.log(`GET ${chartUrl}`);
    try { checkChart(await getJson(chartUrl, '/chart'), poolId); } catch (err) { fail(`/chart/${poolId}: ${err.message}`); }
  }

  if (failures.length) {
    console.error('\nDefiLlama canary FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('\nSee docs/defillama-api.md (endpoint status + Pro v1 switch procedure).');
    process.exit(1);
  }
  console.log('DefiLlama canary OK');
}

main().catch((err) => { console.error(`DefiLlama canary crashed: ${(err && err.stack) || err}`); process.exit(1); });
