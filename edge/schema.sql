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
  path_class TEXT    NOT NULL    -- classifyRequest() result: llms | md_twin | api | mcp | well_known | markdown_negotiation
);
-- (`path_class` gained the `mcp` value with backlog 228/spec 228 — this
-- comment was stale until backlog 234 touched the same line; not a
-- functional change, SQLite has no per-column CHECK here to update.)

-- ---------------------------------------------------------------------------
-- backlog 234 migration (spec 234, agentic commerce / x402 + Web Bot Auth):
-- three new NULLABLE columns, added via ALTER TABLE rather than folded into
-- the CREATE TABLE above, so this file stays correct and idempotent for
-- BOTH a fresh install (CREATE TABLE makes the 9-column table, then these
-- three ALTERs bring it to 12) AND the already-deployed table (item 224's
-- original deploy — CREATE TABLE IF NOT EXISTS is a no-op, these three
-- ALTERs are the entire delta). The human runs this by hand against
-- production D1 — see edge/DEPLOY.md's "Deploy delta — x402 + Web Bot Auth"
-- section for the copy-pasteable `wrangler d1 execute` command. SQLite's
-- `ALTER TABLE ... ADD COLUMN` has no `IF NOT EXISTS` form, so re-running
-- this block against a table that already has these columns errors on the
-- second run — expected and harmless (the columns are already there), not
-- evidence of a broken migration.
--
-- Territory note 4 (spec 234): until this migration runs, the Worker's
-- 12-column INSERT fails on every write and edge/agent-log.mjs's
-- insertRow() falls back to the original 9-column statement — so telemetry
-- keeps landing (the OLD columns), it just doesn't gain the three new ones
-- until this migration is run. Running it late is safe; the fallback makes
-- "not yet run" non-catastrophic rather than "must never happen".
--
--   agent_identity  — Web Bot Auth `keyid` (RFC 9421 Signature-Input),
--                      truncated (agent-log-core.js MAX_AGENT_IDENTITY_LEN);
--                      NULL if never checked (not /api or /mcp) or unsigned.
--   identity_status — one of web-bot-auth-core.js's IDENTITY_STATUSES
--                      ('unverified'|'invalid'|'verified'); NULL if never
--                      checked (a row for a non-/api, non-/mcp path — llms/
--                      md_twin/well_known/markdown_negotiation — never runs
--                      the identity check at all, so this is honestly NULL
--                      there, never a fabricated 'unverified').
--   payment_status  — one of agent-log-core.js's PAYMENT_STATUSES
--                      ('none'|'paid'|'paid_test'|'rejected'|'required').
-- See edge/X402.md for the full payment contract.
-- ---------------------------------------------------------------------------
ALTER TABLE agent_reads ADD COLUMN agent_identity TEXT;
ALTER TABLE agent_reads ADD COLUMN identity_status TEXT;
ALTER TABLE agent_reads ADD COLUMN payment_status TEXT;

-- Daily aggregation read pattern ("reads by UA-family by day", the
-- heartbeat's §2 read) groups by day-bucketed ts and ua_family — see
-- DAILY_READS_QUERY in edge/agent-log-core.js. edge/DEPLOY.md states this
-- query exactly once, inside a `DAILY_READS_QUERY:begin`/`:end` marked
-- region; test_agent_log.js locates that region structurally (by the
-- markers, not the query text), pins the region count at 1, and
-- byte-compares its content against the constant.
CREATE INDEX IF NOT EXISTS idx_agent_reads_day_family ON agent_reads (ts, ua_family);
-- Retention prune is a range delete on ts (mirrors pool_history's idx_ts;
-- see RETENTION_DAYS/retentionCutoff() in agent-log-core.js). No scheduled
-- Cron Trigger runs this prune yet in this Worker — see edge/DEPLOY.md's
-- Territory note on manual pruning until a follow-up item adds one.
CREATE INDEX IF NOT EXISTS idx_agent_reads_ts ON agent_reads (ts);
