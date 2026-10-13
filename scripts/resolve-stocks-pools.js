#!/usr/bin/env node
/**
 * Resolves on-chain pool addresses for the /stocks live depth layer and writes
 * data/stocks-pool-addresses.json.
 *
 * DefiLlama does not publish pool contract addresses, but for factory-based AMMs
 * the address is DERIVABLE from the token pair plus the fee tier / tick spacing:
 *   - Uniswap v3  : factory.getPool(tokenA, tokenB, fee)
 *   - Aerodrome Slipstream (Base): factory.getPool(tokenA, tokenB, tickSpacing)
 *   - Uniswap v2  : factory.getPair(tokenA, tokenB)   (no such pool in the data today)
 * Every resolved pool is cross-checked (the pool's own token0/token1 must be the
 * expected pair) and its token decimals are stored, so the live function
 * (api/stocks-onchain.js) only needs slot0 / liquidity / getReserves.
 * Uniswap v4, Solana (Raydium / Orca) and lending markets have no resolver here:
 * they keep the TVL-heuristic clip.
 *
 * Needs ALCHEMY_API_KEY. Without it NOTHING is written (the existing file, if
 * any, is left untouched) and the script says so.
 *
 * Usage: ALCHEMY_API_KEY=... node scripts/resolve-stocks-pools.js [--out <path>]
 * Re-run when data/stocks-snapshot.json gains pools (new tokens / fee tiers).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../api/_stocks-onchain.js');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'stocks-snapshot.json');
const DEFAULT_OUT = path.join(__dirname, '..', 'data', 'stocks-pool-addresses.json');

// Factory contracts. Uniswap: official deployment lists (docs.uniswap.org).
// Slipstream (Base): taken from the pool itself - factory() of the Aerodrome
// USDC/NVDAc pool 0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9 returns the address
// below, and its getPool(NVDAc, USDC, 10) returns that same pool (checked
// 2026-10-12). The older-looking 0x5e7BB104... CLFactory returns zero for it.
const FACTORIES = {
  'uniswap-v3': {
    Ethereum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    Arbitrum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    Base: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    BSC: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7'
  },
  slipstream: {
    Base: '0xF8f2eb4940CFE7D13603dDDd87f123820Fc061eF'
  },
  'uniswap-v2': {
    Ethereum: '0x5C69bEE701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    Arbitrum: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    Base: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    BSC: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'
  }
};
const V3_FEES = [100, 500, 3000, 10000];

/** The resolver inputs of one snapshot pool, or { skip: reason }. */
function planPool(p) {
  const kind = core.RESOLVABLE_AMMS[p.onchain && p.onchain.ammType];
  if (!kind) return { skip: 'no-resolver' };
  if (!core.ALCHEMY_NETWORKS[p.chain]) return { skip: 'chain-unsupported' };
  const factory = FACTORIES[kind] && FACTORIES[kind][p.chain];
  if (!factory) return { skip: 'no-factory' };
  const toks = (p.onchain && p.onchain.tokens) || [];
  const equity = toks.filter((t) => t.role === 'equity');
  const quote = toks.filter((t) => t.role === 'stable');
  if (equity.length !== 1 || quote.length !== 1) return { skip: 'not-equity-stable-pair' };
  const plan = { kind, factory, equity: equity[0].address.toLowerCase(), quote: quote[0].address.toLowerCase() };
  if (kind === 'uniswap-v3') {
    const fee = Math.round(Number(p.onchain.feeTierPct) * 10000);
    if (V3_FEES.indexOf(fee) < 0) return { skip: 'unsupported-fee-tier' };
    plan.fee = fee;
  } else if (kind === 'slipstream') {
    const ts = Number(p.onchain.tickSpacing);
    if (!Number.isInteger(ts) || ts <= 0) return { skip: 'tick-spacing-unknown' };
    plan.tickSpacing = ts;
  }
  return plan;
}

function getPoolCall(plan) {
  const a = core.addrWord(plan.equity);
  const b = core.addrWord(plan.quote);
  if (plan.kind === 'uniswap-v3') return core.encodeCall(core.SEL.v3GetPool, a, b, core.intWord(plan.fee));
  if (plan.kind === 'slipstream') return core.encodeCall(core.SEL.slipstreamGetPool, a, b, core.intWord(plan.tickSpacing));
  return core.encodeCall(core.SEL.v2GetPair, a, b);
}

const ZERO = '0x0000000000000000000000000000000000000000';

async function resolve(deps, snapshot) {
  const pools = {};
  const unresolved = {};
  const byChain = new Map();
  (snapshot.pools || []).forEach((p) => {
    const plan = planPool(p);
    if (plan.skip) { if (plan.skip !== 'no-resolver') unresolved[p.pool] = plan.skip; return; }
    if (!byChain.has(p.chain)) byChain.set(p.chain, []);
    byChain.get(p.chain).push({ id: p.pool, plan });
  });

  for (const [chain, items] of byChain) {
    // 1) factory lookup
    const first = await core.rpcBatch(deps, chain, items.map((i) => ({ to: i.plan.factory, data: getPoolCall(i.plan) })));
    if (!first.ok) { items.forEach((i) => { unresolved[i.id] = first.reason; }); continue; }
    const found = [];
    items.forEach((i, idx) => {
      const addr = first.results[idx] ? core.wordToAddress(first.results[idx], 0) : null;
      if (!addr || addr === ZERO) unresolved[i.id] = 'pool-not-found'; else found.push({ i, addr });
    });
    if (!found.length) continue;
    // 2) verify the pair and read decimals
    const calls = [];
    found.forEach(({ addr }) => { calls.push({ to: addr, data: core.SEL.token0 }); calls.push({ to: addr, data: core.SEL.token1 }); });
    const pair = await core.rpcBatch(deps, chain, calls);
    if (!pair.ok) { found.forEach(({ i }) => { unresolved[i.id] = pair.reason; }); continue; }
    const decCalls = [];
    const toks = found.map(({ i, addr }, k) => {
      const t0 = pair.results[k * 2] ? core.wordToAddress(pair.results[k * 2], 0) : null;
      const t1 = pair.results[k * 2 + 1] ? core.wordToAddress(pair.results[k * 2 + 1], 0) : null;
      return { i, addr, t0, t1 };
    });
    toks.forEach((t) => { if (t.t0 && t.t1) { decCalls.push({ to: t.t0, data: core.SEL.decimals }); decCalls.push({ to: t.t1, data: core.SEL.decimals }); } });
    const dec = decCalls.length ? await core.rpcBatch(deps, chain, decCalls) : { ok: true, results: [] };
    let d = 0;
    toks.forEach((t) => {
      const { i, addr, t0, t1 } = t;
      const pairOk = t0 && t1 && [t0, t1].sort().join() === [i.plan.equity, i.plan.quote].sort().join();
      if (!pairOk) { unresolved[i.id] = 'pair-mismatch'; if (t0 && t1) d += 2; return; }
      const d0 = dec.ok && dec.results[d] ? core.wordToBig(dec.results[d], 0) : null;
      const d1 = dec.ok && dec.results[d + 1] ? core.wordToBig(dec.results[d + 1], 0) : null;
      d += 2;
      if (d0 === null || d1 === null || d0 > 36n || d1 > 36n) { unresolved[i.id] = 'decimals-unreadable'; return; }
      const entry = {
        chain, kind: i.plan.kind, address: addr,
        equitySide: t0 === i.plan.equity ? 0 : 1,
        token0: { address: t0, decimals: Number(d0) }, token1: { address: t1, decimals: Number(d1) }
      };
      if (i.plan.fee) entry.fee = i.plan.fee;
      if (i.plan.tickSpacing) entry.tickSpacing = i.plan.tickSpacing;
      pools[i.id] = entry;
    });
  }
  return { pools, unresolved };
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1]) : DEFAULT_OUT;
  if (!process.env.ALCHEMY_API_KEY) {
    console.log('ALCHEMY_API_KEY is not set: nothing resolved, ' + path.relative(process.cwd(), out) + ' left untouched. ' +
      'Live depth stays on the heuristic until pool addresses are resolved with a key.');
    return;
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const { pools, unresolved } = await resolve({ fetch: globalThis.fetch, env: process.env }, snapshot);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: snapshot.generatedAt || null,
    source: 'factory getPool/getPair via eth_call (EVM JSON-RPC); pair cross-checked against pool token0/token1',
    factories: FACTORIES,
    pools,
    unresolved
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log('wrote ' + out + ': ' + Object.keys(pools).length + ' pools resolved, ' + Object.keys(unresolved).length + ' unresolved');
  Object.entries(unresolved).forEach(([id, why]) => console.log('  unresolved ' + id + ': ' + why));
}

if (require.main === module) {
  main().catch((err) => { console.error('resolve-stocks-pools failed:', err && err.name ? err.name : 'Error'); process.exit(1); });
}

module.exports = { planPool, getPoolCall, resolve, FACTORIES };
