-- D1 schema addition for the edge agent-read log (backlog 224, spec 224).
-- Lives in the SAME D1 database as pool_history (defi-garden-history, item
-- 108) — this is a NEW TABLE in that existing database, not a new database.
-- Written by edge/agent-log.mjs (a Worker on route www.defi.garden/*) via a
-- write-behind INSERT (ctx.waitUntil) for every request classified as
-- "agent surface" by edge/agent-log-core.js's classifyRequest(): llms.txt /
-- llms-full.txt, any *.md twin (pools/, tokens/, chains/, ko/**), /api/*
-- (future, item 227), /.well-known/** + openapi.json + tools/*.json, and any
-- path negotiated via an Accept: text/markdown header. One row per logged
-- request. This write is NEVER allowed to affect what a visitor/agent
-- receives — agent-log.mjs swallows every failure on this path (see its
-- header comment) — so a broken agent_reads table degrades to "no logging",
-- never to "no serving".

CREATE TABLE IF NOT EXISTS agent_reads (
  ts         INTEGER NOT NULL,   -- unix seconds, request time (Date.now()/1000 at log time)
  path       TEXT    NOT NULL,   -- request pathname, query string stripped, truncated (agent-log-core.js MAX_PATH_LEN)
  ua         TEXT,               -- raw User-Agent header, truncated (MAX_UA_LEN)
  ua_family  TEXT    NOT NULL,   -- coarse crawler/agent family from agent-log-core.js's uaFamily() — 'other' if unmatched
  accept     TEXT,               -- raw Accept header, truncated (MAX_ACCEPT_LEN)
  referer    TEXT,               -- raw Referer header, truncated (MAX_REFERER_LEN); NULL if absent
  status     INTEGER,            -- origin response status code; NULL if unavailable
  bot_score  INTEGER,            -- request.cf.botManagement.score (Cloudflare Bot Management, 1-99); NULL off-plan/absent
  path_class TEXT    NOT NULL    -- classifyRequest() result: llms | md_twin | api | well_known | markdown_negotiation
);

-- Daily aggregation read pattern ("reads by UA-family by day", the
-- heartbeat's §2 read) groups by day-bucketed ts and ua_family — see
-- DAILY_READS_QUERY in edge/agent-log-core.js. Every place edge/DEPLOY.md
-- states this query is kept byte-identical to it; test_agent_log.js scans
-- edge/DEPLOY.md for every occurrence and asserts each one individually.
CREATE INDEX IF NOT EXISTS idx_agent_reads_day_family ON agent_reads (ts, ua_family);
-- Retention prune is a range delete on ts (mirrors pool_history's idx_ts;
-- see RETENTION_DAYS/retentionCutoff() in agent-log-core.js). No scheduled
-- Cron Trigger runs this prune yet in this Worker — see edge/DEPLOY.md's
-- Territory note on manual pruning until a follow-up item adds one.
CREATE INDEX IF NOT EXISTS idx_agent_reads_ts ON agent_reads (ts);
