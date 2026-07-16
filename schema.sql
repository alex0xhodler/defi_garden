-- D1 schema for the pool-history store (backlog 108/109, spec 108/117).
-- Cloudflare D1 (SQLite). Written by the CF Worker poller (src/poller.js) on an
-- hourly Cron Trigger; read by CI (compute-kpis.js, ticket 110) via GET /history.
--
-- One row per (pool, poll). `apy` is the total APY (apyBase+apyReward) AFTER the
-- SAME trust rails the shipped snapshot applies (generate-pools-snapshot.js:51-52,
-- mirrored from app.js:729-730): $10M TVL floor; anomalous pools (>1000% APY) are
-- KEPT (flagged downstream, never hidden) — this store NEVER relaxes or changes a rail.

CREATE TABLE IF NOT EXISTS pool_history (
  pool_id TEXT    NOT NULL,   -- pool.pool (DefiLlama pool id)
  ts      INTEGER NOT NULL,   -- unix seconds, poll time (event.scheduledTime/1000)
  apy     REAL    NOT NULL,   -- round(apyBase+apyReward, 4) — mirrors compute-kpis slimPoint
  tvl_usd REAL    NOT NULL,   -- Number(tvlUsd) || 0
  PRIMARY KEY (pool_id, ts)
);

-- Read pattern is "recent window for every pool", ascending by time.
CREATE INDEX IF NOT EXISTS idx_pool_ts ON pool_history (pool_id, ts);
-- Retention prune is a range delete on ts.
CREATE INDEX IF NOT EXISTS idx_ts ON pool_history (ts);
