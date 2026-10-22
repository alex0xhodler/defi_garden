-- History v2 (GitHub Actions poller, every 3 hours -> D1 table `samples`).
-- Idempotent: safe to apply on every run (see .github/workflows/history-poll.yml).
--
-- Why this shape:
--   * PRIMARY KEY (ts, pool_id) leads with ts, so range scans by time and the
--     "latest slot" lookup (WHERE ts = (SELECT MAX(ts) ...)) are served by the
--     table itself; no extra index is needed.
--   * WITHOUT ROWID stores the row in the primary-key b-tree => exactly ONE row
--     write per sample (D1 bills index writes as row writes, and the free plan
--     allows 100k writes/day for the whole account).
--   * No other indexes, on purpose: every index would double the write cost.
CREATE TABLE IF NOT EXISTS samples (
  ts      INTEGER NOT NULL,  -- unix seconds, start of the 3-hour UTC slot
  pool_id TEXT    NOT NULL,  -- DefiLlama pool id (pool.pool)
  apy     REAL    NOT NULL,  -- round(apyBase + apyReward, 4) — same as src/poller-core.js totalApy
  tvl_usd REAL    NOT NULL,  -- Number(tvlUsd) || 0
  PRIMARY KEY (ts, pool_id)
) WITHOUT ROWID;
