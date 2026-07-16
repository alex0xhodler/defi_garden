/*
 * Pure, network/DB-free core for the pool-history poller (backlog 109, spec 108/117).
 * CommonJS so the existing `node test_*.js` harness can unit-test it directly
 * (like compute-kpis.js); the Worker (src/poller.js, ESM) imports it and wrangler's
 * bundler handles the interop.
 *
 * TRUST RAILS — mirrored VERBATIM from generate-pools-snapshot.js:51-52
 * (themselves mirrored from app.js:729-730). This store is another enforcement
 * point for the rails and may NEVER relax or change them:
 *   - $10M TVL floor applied at write time (pools below are dropped).
 *   - Anomalous pools (total APY > 1000%) are KEPT, not dropped — they are flagged
 *     downstream (show flagged, never hide). So we filter on TVL only, exactly as
 *     the snapshot generator does (generate-pools-snapshot.js isRailedIn).
 */

'use strict';

const APY_SANITY_LIMIT = 1000;      // total APY above this = anomalous (KEPT + flagged downstream)
const DEFAULT_MIN_TVL = 10000000;   // $10M floor — applied upstream, never lowered
const RETENTION_DAYS = 90;          // history window kept in D1 (Worker prunes older)

/** Match compute-kpis.js round() exactly so the DB path is byte-equivalent to the
 * file-history path (ticket 110): round(n, dp). */
function round(n, dp) {
  if (n == null || Number.isNaN(n)) return n;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Total APY = apyBase + apyReward, rounded to 4dp — mirrors compute-kpis slimPoint. */
function totalApy(pool) {
  return round((Number(pool.apyBase) || 0) + (Number(pool.apyReward) || 0), 4);
}

/**
 * Project a live DefiLlama `/pools` array into the slim rows to store, applying
 * the trust rails at write time. Returns `[{ pool_id, ts, apy, tvl_usd }, …]`.
 *   - Drops pools below the $10M TVL floor and pools with no `pool` id.
 *   - KEEPS anomalous pools (apy > APY_SANITY_LIMIT) — never hidden.
 * `tsSeconds` is the poll time in unix seconds (integer).
 */
function railedRows(pools, tsSeconds) {
  const ts = Math.floor(Number(tsSeconds) || 0);
  const out = [];
  (Array.isArray(pools) ? pools : []).forEach((p) => {
    if (!p || !p.pool) return;                     // need a stable id
    const tvl = Number(p.tvlUsd) || 0;
    if (tvl < DEFAULT_MIN_TVL) return;             // $10M floor — the ONLY drop
    out.push({ pool_id: String(p.pool), ts, apy: totalApy(p), tvl_usd: tvl });
  });
  return out;
}

/** Unix-seconds cutoff for retention: rows with ts < cutoff are prunable. */
function retentionCutoff(nowSeconds, days = RETENTION_DAYS) {
  return Math.floor(Number(nowSeconds) || 0) - days * 86400;
}

module.exports = {
  APY_SANITY_LIMIT,
  DEFAULT_MIN_TVL,
  RETENTION_DAYS,
  round,
  totalApy,
  railedRows,
  retentionCutoff,
};
