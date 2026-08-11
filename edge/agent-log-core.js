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

// backlog 234 (spec 234, Change §3): Web Bot Auth identity verdicts become a
// first-class D1 column. `IDENTITY_STATUSES` is imported from
// web-bot-auth-core.js, NEVER hand-typed here — that file is the single
// source of the three verdict strings ('unverified'/'invalid'/'verified'),
// and a second hand-typed copy here is exactly the mirror-drift class
// RAZOR.md warns about. No cycle risk: web-bot-auth-core.js has zero
// `require()` calls of its own (confirmed by inspection), so this is a
// plain, safe, one-directional dependency.
const webBotAuth = require('./web-bot-auth-core.js');
const IDENTITY_STATUSES = webBotAuth.IDENTITY_STATUSES;

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
//   3. api           — "/api/*" (item 227's read-only Yield API).
//   4. mcp           — "/mcp" and "/mcp/*" (item 228's MCP server). A
//                       separate class from "api", checked immediately
//                       after it, so NORTH_STAR leg (A)'s two documented
//                       terms — read-only API calls and MCP invocations —
//                       stay separable in the D1 log by construction,
//                       rather than an MCP request silently counting as a
//                       REST call (see product-loop-kit/specs/228.md's
//                       Territory notes for why /mcp is its own top-level
//                       path rather than living under /api/*).
//   5. md_twin       — any path ending ".md" (pools/, tokens/, chains/,
//                       ko/**, and any future markdown twin — extension-
//                       based on purpose, so a new twin directory is covered
//                       automatically, never a hardcoded directory list).
//   6. markdown_negotiation — Accept header contains "text/markdown" on ANY
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

  if (path === '/mcp' || path.startsWith('/mcp/')) {
    return { pathClass: 'mcp' };
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
// backlog 234: a Web Bot Auth `keyid` is caller-chosen (RFC 9421 Signature-
// Input parameter), so it gets the same hostile-input truncation discipline
// as every other unbounded string field above — a huge/hostile keyid must
// not be able to bloat D1 either.
const MAX_AGENT_IDENTITY_LEN = 256;

// ---------------------------------------------------------------------------
// backlog 234 (spec 234, Change §2/§3): PAYMENT_STATUSES — the single source
// for the `payment_status` D1 column's five legal values. Exported so a
// caller (edge/agent-log.mjs) reads the string it needs from THIS array
// (e.g. `PAYMENT_STATUSES[0]`) or from `mapPaymentStatus()` below, rather
// than hand-typing 'none'/'paid'/'paid_test'/'rejected'/'required' at each
// call site — the same discipline IDENTITY_STATUSES enforces one file over.
//
//   'none'     — the payment gate did not apply to this request at all
//                (a free-tier route, an unrelated path, or X402_ENABLED is
//                not true — "dark" per spec 234's acceptance criterion).
//   'required' — the gate applied (a paid route, gate enabled) and NO
//                X-PAYMENT header was presented at all — verifyPayment()'s
//                own 'none' status, renamed here to avoid colliding with
//                THIS array's unrelated 'none' meaning above.
//   'rejected' — the gate applied and a payment WAS presented but failed
//                verification (wrong scheme/network/resource, underpaid,
//                malformed, or a live-mode facilitator rejection).
//   'paid'     — the gate applied and a LIVE payment was VERIFIED against the
//                configured facilitator's /verify endpoint. This is NOT
//                settlement: this Worker never calls a facilitator's /settle
//                endpoint (see edge/x402-core.js's verifyPayment() and
//                edge/X402.md's residue notes), so no funds move on our side
//                even for a 'paid' row — verified-but-unsettled, always.
//   'paid_test'— the gate applied and a well-formed TEST-network payment
//                was accepted (test mode never settles real value).
// ---------------------------------------------------------------------------
const PAYMENT_STATUSES = Object.freeze(['none', 'paid', 'paid_test', 'rejected', 'required']);
const [PAYMENT_NONE, PAYMENT_PAID, PAYMENT_PAID_TEST, PAYMENT_REJECTED, PAYMENT_REQUIRED] = PAYMENT_STATUSES;

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

/** backlog 234: `agentIdentity`/`identityStatus` are only ever meaningful
 * for a request the Worker actually ran Web Bot Auth verification against
 * (`/api` and `/mcp` — see edge/agent-log.mjs). For every other path class,
 * the caller simply omits them, and they land as `null` here — a DISTINCT
 * fact from `identity_status: 'unverified'` (which specifically means "we
 * checked, and this request carried no/an unrecognized signature"; see
 * web-bot-auth-core.js's own header comment). `identityStatus` is validated
 * against `IDENTITY_STATUSES` (imported, never hand-typed) — anything else
 * (including a caller bug) lands as `null` rather than corrupting the
 * column with an unrecognized string. `paymentStatus` is validated against
 * `PAYMENT_STATUSES` the same way, defaulting to `'none'` (never null —
 * "no payment concept applied to this request" is always a real, sayable
 * fact, unlike identity which can be genuinely "not checked"). */
function buildRow({
  tsSeconds, pathname, userAgent, accept, referer, status, botScore,
  agentIdentity, identityStatus, paymentStatus,
} = {}) {
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
    agent_identity: agentIdentity == null ? null : truncate(agentIdentity, MAX_AGENT_IDENTITY_LEN),
    identity_status: IDENTITY_STATUSES.indexOf(identityStatus) !== -1 ? identityStatus : null,
    payment_status: PAYMENT_STATUSES.indexOf(paymentStatus) !== -1 ? paymentStatus : PAYMENT_NONE,
  };
}

/** backlog 234: the SINGLE place that turns x402-core.js's `verifyPayment()`
 * result (statuses: 'none'|'paid'|'paid_test'|'rejected', scoped to "was a
 * payment presented and did it verify") into this file's D1-column
 * `payment_status` (statuses: 'none'|'paid'|'paid_test'|'rejected'|
 * 'required', scoped to "what should the log row say about payment for
 * this request"). The two vocabularies deliberately do not share the string
 * 'none' 1:1 — verifyPayment()'s 'none' means "no X-PAYMENT header was
 * presented", which is only interesting/loggable AS 'required' when the
 * gate actually applied (a paid route, X402_ENABLED true); when the gate
 * never applied at all (free route, or the flag is off — "dark" per spec
 * 234), the honest column value is this file's OWN 'none' ("payment is not
 * a concept here"), regardless of what verifyResult (if any) says. Pure,
 * exported, and testable in isolation — never re-derived ad hoc at a call
 * site in edge/agent-log.mjs. */
function mapPaymentStatus(verifyResult, gateApplied) {
  if (!gateApplied) return PAYMENT_NONE;
  if (!verifyResult || typeof verifyResult.status !== 'string') return PAYMENT_NONE;
  if (verifyResult.status === 'none') return PAYMENT_REQUIRED;
  if (verifyResult.status === PAYMENT_PAID || verifyResult.status === PAYMENT_PAID_TEST || verifyResult.status === PAYMENT_REJECTED) {
    return verifyResult.status;
  }
  return PAYMENT_NONE;
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
//    by day" (the heartbeat's §2 read, spec 224 acceptance criterion).
//    edge/DEPLOY.md states this query exactly ONCE, inside a single region
//    marked with `<!-- DAILY_READS_QUERY:begin -->` / `:end` HTML comments.
//    test_agent_log.js locates that region STRUCTURALLY — by the markers
//    alone, never by matching this string's own text — asserts exactly one
//    marked region exists, and byte-compares its content against this
//    constant. It also fails if a second, unmarked copy of this query is
//    smuggled in elsewhere in edge/DEPLOY.md. It does NOT prove no such copy
//    could ever exist outside both the marker and the smuggling check — see
//    edge/DEPLOY.md §6 and product-loop-kit/specs/224-notes.md ("Verifier
//    round 2") for what is and isn't proven.
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
  MAX_AGENT_IDENTITY_LEN,
  RETENTION_DAYS,
  retentionCutoff,
  DAILY_READS_QUERY,
  IDENTITY_STATUSES,
  PAYMENT_STATUSES,
  mapPaymentStatus,
};
