/*
 * Pure, network/Worker-free core for the edge agent-read logger (backlog 224,
 * spec 224). CommonJS so the plain `node test_agent_log.js` harness can
 * require it directly (same convention as src/poller-core.js); the Worker
 * (edge/agent-log.mjs, ESM) imports it and wrangler's bundler handles the
 * interop.
 *
 * This file answers three questions with no side effects, no fetch, no D1:
 *   1. classifyRequest() — is this request to the "agent surface", and which
 *      slice of it?
 *   2. uaFamily() — which known AI-crawler/agent family sent it (or 'other')?
 *   3. buildRow() — the exact row object the Worker's INSERT binds, with
 *      truncation so a hostile UA/Accept/Referer can't bloat D1.
 *
 * No trust rails live here (spec 224 is instrumentation-only) — nothing in
 * this file may ever gate what a visitor/agent receives; see agent-log.mjs's
 * header for how pass-through-on-failure is enforced at the Worker layer.
 */

'use strict';

// ---------------------------------------------------------------------------
// 1. classifyRequest — agent-surface classification.
//
// Precedence (checked in this exact order, first match wins — documented
// here because it's the one thing a future edit to this file must not
// silently reorder):
//   1. llms          — exact path "/llms.txt" or "/llms-full.txt".
//   2. well_known    — "/.well-known/**", "/openapi.json", "/tools/*.json"
//                       (the agent-discovery assets .vercelignore's header
//                       names as live agent surface).
//   3. api           — "/api/*" (future, item 227 — no routes exist yet,
//                       classified ahead of time so 227 needs no core change).
//   4. md_twin       — any path ending ".md" (pools/, tokens/, chains/,
//                       ko/**, and any future markdown twin — extension-
//                       based on purpose, so a new twin directory is covered
//                       automatically, never a hardcoded directory list).
//   5. markdown_negotiation — Accept header contains "text/markdown" on ANY
//                       remaining path. This is checked LAST, after the
//                       specific path classes above, because vercel.json's
//                       own negotiation redirect only ever fires for a
//                       request that has no more specific match already
//                       (a real .md URL is served directly, never
//                       redirected — see test_markdown_negotiation.js's
//                       "point 1" cases) — mirroring that here keeps a
//                       direct GET of pools/x.md classified as 'md_twin',
//                       not double-counted as negotiation.
//   Anything matching none of the above -> null (not agent surface).
// ---------------------------------------------------------------------------

const WELL_KNOWN_TOOLS_RE = /^\/tools\/[^/]+\.json$/;

/** Strips a query string / fragment defensively, even though callers are
 * expected to pass a bare pathname — query strings must never defeat
 * classification either way. */
function barePathname(pathname) {
  let p = String(pathname == null ? '' : pathname);
  const qIdx = p.indexOf('?');
  if (qIdx !== -1) p = p.slice(0, qIdx);
  const hIdx = p.indexOf('#');
  if (hIdx !== -1) p = p.slice(0, hIdx);
  return p;
}

function classifyRequest({ pathname, accept } = {}) {
  const path = barePathname(pathname);
  const acceptLower = String(accept == null ? '' : accept).toLowerCase();

  if (path === '/llms.txt' || path === '/llms-full.txt') {
    return { pathClass: 'llms' };
  }

  if (
    path === '/.well-known' ||
    path.startsWith('/.well-known/') ||
    path === '/openapi.json' ||
    WELL_KNOWN_TOOLS_RE.test(path)
  ) {
    return { pathClass: 'well_known' };
  }

  if (path === '/api' || path.startsWith('/api/')) {
    return { pathClass: 'api' };
  }

  if (path.endsWith('.md')) {
    return { pathClass: 'md_twin' };
  }

  if (acceptLower.indexOf('text/markdown') !== -1) {
    return { pathClass: 'markdown_negotiation' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. uaFamily — coarse family for the known AI-crawler/agent set.
//
// UA_FAMILIES is the single exported source of truth (a test iterates it).
// Matching is a case-insensitive SUBSTRING test against the raw User-Agent
// string, first entry in the list that matches wins. None of the listed
// tokens are substrings of one another (verified by inspection — e.g.
// "ClaudeBot" is not contained in "Claude-User" or "Claude-SearchBot", the
// hyphen breaks it), so list order does not currently change any result; it
// is still fixed and documented so a FUTURE addition can't introduce a
// silent ordering bug without a reviewer noticing this comment.
// ---------------------------------------------------------------------------

const UA_FAMILIES = [
  { token: 'GPTBot', family: 'gptbot' },
  { token: 'OAI-SearchBot', family: 'oai-searchbot' },
  { token: 'ChatGPT-User', family: 'chatgpt-user' },
  { token: 'Claude-SearchBot', family: 'claude-searchbot' },
  { token: 'Claude-User', family: 'claude-user' },
  { token: 'ClaudeBot', family: 'claudebot' },
  { token: 'Perplexity-User', family: 'perplexity-user' },
  { token: 'PerplexityBot', family: 'perplexitybot' },
  { token: 'Google-Extended', family: 'google-extended' },
  { token: 'Googlebot', family: 'googlebot' },
  { token: 'Bingbot', family: 'bingbot' },
  { token: 'Applebot', family: 'applebot' },
  { token: 'Amazonbot', family: 'amazonbot' },
  { token: 'Bytespider', family: 'bytespider' },
  { token: 'CCBot', family: 'ccbot' },
  { token: 'meta-externalagent', family: 'meta-externalagent' },
  { token: 'DuckDuckBot', family: 'duckduckbot' },
  { token: 'YandexBot', family: 'yandexbot' },
  { token: 'curl', family: 'curl' },
];

const OTHER_FAMILY = 'other';

function uaFamily(userAgent) {
  const ua = String(userAgent == null ? '' : userAgent).toLowerCase();
  if (!ua) return OTHER_FAMILY;
  for (let i = 0; i < UA_FAMILIES.length; i++) {
    if (ua.indexOf(UA_FAMILIES[i].token.toLowerCase()) !== -1) {
      return UA_FAMILIES[i].family;
    }
  }
  return OTHER_FAMILY;
}

// ---------------------------------------------------------------------------
// 3. buildRow — the exact row the Worker's INSERT binds.
//
// Every unbounded string field is capped so a hostile UA/Accept/Referer
// can't bloat D1 (D1's per-row and per-database limits are shared with
// pool_history — this store must not be the thing that blows the budget).
// Caps are documented constants, not magic numbers.
// ---------------------------------------------------------------------------

const MAX_PATH_LEN = 512;
const MAX_UA_LEN = 512;
const MAX_ACCEPT_LEN = 256;
const MAX_REFERER_LEN = 512;

function truncate(value, maxLen) {
  const s = String(value);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/** null-safe integer status; returns null (not 0) when status is absent or
 * not a finite number, so a missing status is honest, never a fake 0. */
function safeStatus(status) {
  const n = Number(status);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** null-safe bot score (Cloudflare Bot Management's request.cf.botManagement.score,
 * 1-99); passes through null/undefined as null rather than coercing to 0 —
 * "no score available" and "score of zero" are different facts. */
function safeBotScore(botScore) {
  if (botScore == null) return null;
  const n = Number(botScore);
  return Number.isFinite(n) ? n : null;
}

function buildRow({ tsSeconds, pathname, userAgent, accept, referer, status, botScore } = {}) {
  const path = barePathname(pathname);
  const classification = classifyRequest({ pathname: path, accept });
  return {
    ts: Math.floor(Number(tsSeconds) || 0),
    path: truncate(path, MAX_PATH_LEN),
    ua: truncate(userAgent == null ? '' : userAgent, MAX_UA_LEN),
    ua_family: uaFamily(userAgent),
    accept: truncate(accept == null ? '' : accept, MAX_ACCEPT_LEN),
    referer: referer == null ? null : truncate(referer, MAX_REFERER_LEN),
    status: safeStatus(status),
    bot_score: safeBotScore(botScore),
    path_class: classification ? classification.pathClass : null,
  };
}

// ---------------------------------------------------------------------------
// 4. Retention — mirrors src/poller-core.js's retentionCutoff() semantics
//    exactly (same shape, different window: this table is one row per
//    REQUEST rather than one row per hourly poll, so it is kept much
//    shorter to bound D1 growth under real crawler traffic volume).
// ---------------------------------------------------------------------------

const RETENTION_DAYS = 30; // per-request volume is much higher than pool_history's hourly cadence

function retentionCutoff(nowSeconds, days = RETENTION_DAYS) {
  return Math.floor(Number(nowSeconds) || 0) - days * 86400;
}

// ---------------------------------------------------------------------------
// 5. DAILY_READS_QUERY — the single source of truth for "reads by UA-family
//    by day" (the heartbeat's §2 read, spec 224 acceptance criterion). This
//    EXACT string must also appear, byte-identical, everywhere edge/DEPLOY.md
//    states this query — test_agent_log.js scans the full text of
//    edge/DEPLOY.md for every occurrence (by shape, not by line number) and
//    asserts each one, individually, is byte-identical to this constant.
// ---------------------------------------------------------------------------

const DAILY_READS_QUERY = `SELECT
  date(ts, 'unixepoch') AS day,
  ua_family,
  COUNT(*) AS reads
FROM agent_reads
GROUP BY day, ua_family
ORDER BY day DESC, reads DESC;`;

module.exports = {
  classifyRequest,
  uaFamily,
  UA_FAMILIES,
  OTHER_FAMILY,
  buildRow,
  MAX_PATH_LEN,
  MAX_UA_LEN,
  MAX_ACCEPT_LEN,
  MAX_REFERER_LEN,
  RETENTION_DAYS,
  retentionCutoff,
  DAILY_READS_QUERY,
};
