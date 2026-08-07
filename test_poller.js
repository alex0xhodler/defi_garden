/* Unit tests for src/poller-core.js (backlog 109, spec 108/117). Pure Node,
   fixture input, NO network, NO Worker runtime, NO D1. Verifies the trust-rail
   filtering the poller applies at write time matches the shipped snapshot's rails
   exactly (generate-pools-snapshot.js): $10M TVL floor drops sub-floor pools,
   anomalous (>1000% APY) pools are KEPT, apy = round(base+reward, 4), and the
   retention cutoff math.

   Run: node test_poller.js */

'use strict';

const assert = require('assert');
const core = require('./src/poller-core.js');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); passed++; }

// --- constants mirror the snapshot generator (never drift) ------------------
eq(core.DEFAULT_MIN_TVL, 100000, '$100K TVL floor mirrored');
eq(core.APY_SANITY_LIMIT, 1000, 'APY sanity limit mirrored');

// --- round matches compute-kpis.js round() ----------------------------------
eq(core.round(1.23456, 4), 1.2346, 'round 4dp');
eq(core.round(null, 4), null, 'round null passthrough');

// --- totalApy = base + reward, 4dp ------------------------------------------
eq(core.totalApy({ apyBase: 3, apyReward: 2 }), 5, 'total apy sums');
eq(core.totalApy({ apyBase: 1.111111, apyReward: 0 }), 1.1111, 'total apy rounds 4dp');
eq(core.totalApy({}), 0, 'total apy null-safe → 0');

// --- railedRows: the trust rails at write time ------------------------------
const TS = 1_700_000_000;
const pools = [
  { pool: 'big',    tvlUsd: 3.3e9, apyBase: 4.86, apyReward: 0 },   // keep
  { pool: 'exactly',tvlUsd: 100000, apyBase: 5, apyReward: 1 },   // keep (== floor)
  { pool: 'under',  tvlUsd: 99999, apyBase: 8, apyReward: 0 },    // DROP (< floor)
  { pool: 'anom',   tvlUsd: 5e7, apyBase: 4000, apyReward: 0 },     // KEEP (anomalous, flagged downstream)
  { pool: 'reward', tvlUsd: 2e7, apyBase: 2, apyReward: 3.5 },      // keep, apy=5.5
  { tvlUsd: 5e9, apyBase: 9 },                                      // DROP (no pool id)
  null,                                                             // DROP (junk)
  { pool: 'notvl',  apyBase: 5 },                                   // DROP (tvl → 0 < floor)
];
const rows = core.railedRows(pools, TS);
const byId = Object.fromEntries(rows.map((r) => [r.pool_id, r]));

eq(rows.length, 4, 'exactly 4 pools survive the $10M floor + id guard');
ok(byId.big && byId.exactly && byId.anom && byId.reward, 'the 4 railed-in pools kept');
ok(!byId.under, 'sub-$10M pool dropped');
ok(!byId.notvl, 'no-TVL pool dropped');

// anomalous KEPT (the spec-108-sketch bug this build caught): >1000% APY stays
eq(byId.anom.apy, 4000, 'anomalous pool KEPT with its real (unclamped) apy');

// row shape + values
eq(byId.exactly.apy, 6, 'exactly: apy = base+reward');
eq(byId.reward.apy, 5.5, 'reward: apy = 2 + 3.5');
eq(byId.big.tvl_usd, 3.3e9, 'tvl preserved');
eq(byId.big.ts, TS, 'ts stamped on every row');
ok(Number.isInteger(byId.big.ts), 'ts is integer seconds');

// empty / junk inputs
eq(core.railedRows(null, TS).length, 0, 'null pools → []');
eq(core.railedRows([], TS).length, 0, 'empty pools → []');

// --- retention cutoff -------------------------------------------------------
eq(core.retentionCutoff(1_000_000, 1), 1_000_000 - 86400, '1-day cutoff');
eq(core.retentionCutoff(1_000_000), 1_000_000 - 90 * 86400, 'default 90-day cutoff');

console.log(`test_poller.js: ${passed}/${passed} assertions passed`);
