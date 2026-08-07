/*
 * Cloudflare Worker: edge agent-read telemetry (backlog 224, spec 224).
 *
 * NAMING NOTE (deviation from the spec's literal "edge/agent-log.js"):
 * this file is `.mjs`, not `.js`. The house pattern (src/poller.js) is a
 * plain `.js` file using `import`/`export default`, safe because it is
 * NEVER loaded natively by Node — only bundled by wrangler's esbuild step,
 * which detects ESM syntax directly and ignores file extension / any
 * package.json "type" field entirely. This item is different: spec 224
 * requires test_agent_log.js to `import()` THIS FILE DIRECTLY, natively, in
 * plain Node (no wrangler, no bundler). Node's native loader decides ESM vs
 * CommonJS per-file from extension (or an inherited package.json "type"),
 * and this repo's root package.json has (and must keep) no "type" field —
 * every other `.js` file in the repo is implicitly CommonJS. A same-directory
 * package.json can't split the difference either: it would apply to EVERY
 * `.js` sibling, breaking agent-log-core.js's required CJS/`module.exports`
 * shape (the same shape src/poller-core.js uses, deliberately mirrored here
 * so the plain-Node test harness can `require()` it). `.mjs` is Node's
 * documented, unambiguous, per-file way to say "this one file is a real ES
 * module" without touching anything else — no root package.json edit, no
 * new directory-scoped package.json, and it is Wrangler's own recommended
 * extension for a "modules"-format Worker entry point. Wrangler bundles
 * `.mjs` exactly the same way it would bundle `.js` with `import`/`export`
 * syntax; nothing about the deployed behavior changes.
 *
 * Sits in front of origin on route www.defi.garden/* (see wrangler.toml).
 * fetch(): PASS-THROUGH FIRST — `const response = await fetch(request)` — and
 *   the exact same Response object is returned, untouched: no clone, no body
 *   read, no header rebuild. Byte-parity holds BY CONSTRUCTION, not by care.
 *   This is safe from a self-invocation loop precisely because a Worker's
 *   OWN subrequest to the route it is itself bound to does not re-enter the
 *   Worker — Cloudflare routes a Worker's outbound `fetch()` to the next hop
 *   in line (here: the origin, Vercel), never back through the same script.
 *   That is what makes "fetch(request) then return it unmodified" a correct
 *   proxy and not infinite recursion.
 *
 * AFTER the response is captured (never before — logging must not add
 * latency to what a visitor/agent receives), classify the request via
 * agent-log-core.js. If it's agent surface AND env.DB is bound, an INSERT is
 * scheduled with `ctx.waitUntil()` so it runs after the response has already
 * been handed back — it can never delay or block serving.
 *
 * The whole logging path is wrapped so ANY failure — missing DB binding, a
 * thrown classifier, D1 rejecting the write, a malformed request — is
 * swallowed silently. This Worker's ONE job that must never fail is serving
 * the pass-through response; logging is a pure side effect that is allowed
 * to be lossy but never allowed to be load-bearing.
 *
 * Store-only, like src/poller.js: nothing in this app's front end calls or
 * depends on this Worker, so the no-backend tenet holds. This is a SECOND,
 * independent Worker from src/poller.js — it shares the D1 database
 * (defi-garden-history) but has its own wrangler.toml/deploy/route and must
 * never be merged into the root one.
 */

import core from './agent-log-core.js';

const INSERT_SQL =
  'INSERT INTO agent_reads (ts, path, ua, ua_family, accept, referer, status, bot_score, path_class) ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

export default {
  async fetch(request, env, ctx) {
    // PASS-THROUGH FIRST. This is the entire contract with every visitor and
    // agent hitting www.defi.garden — everything below this line is a
    // best-effort side effect on a response that has ALREADY been decided.
    const response = await fetch(request);

    try {
      logAgentRead(request, response, env, ctx);
    } catch (_err) {
      // Logging must never break serving — swallow synchronous failures
      // (missing/broken env.DB, a thrown classifier, a malformed request)
      // right here. Async failures (a rejected D1 .run()) are swallowed
      // inside logAgentRead's own promise chain — see the `.catch` there.
    }

    return response;
  },
};

/**
 * Best-effort: classify the request and, if it's agent surface and a DB
 * binding exists, schedule (never await) an INSERT via ctx.waitUntil.
 * Any synchronous throw here (env.DB missing/broken, classifyRequest
 * throwing, prepare()/bind() throwing) propagates to the caller's try/catch
 * in fetch() above, by design — this function does not double-guard that.
 */
function logAgentRead(request, response, env, ctx) {
  if (!env || !env.DB) return; // no binding configured (e.g. local/dev) — nothing to log

  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';
  const classification = core.classifyRequest({ pathname: url.pathname, accept });
  if (!classification) return; // not agent surface — nothing to log

  const row = core.buildRow({
    tsSeconds: Math.floor(Date.now() / 1000),
    pathname: url.pathname,
    userAgent: request.headers.get('user-agent') || '',
    accept,
    referer: request.headers.get('referer') || null,
    status: response.status,
    // request.cf is a Cloudflare-only, best-effort property — read
    // defensively, since it's absent outside the real edge runtime (local
    // dev, this file's own tests) and Bot Management may not be on-plan.
    botScore: request.cf && request.cf.botManagement ? request.cf.botManagement.score : null,
  });

  const stmt = env.DB.prepare(INSERT_SQL).bind(
    row.ts, row.path, row.ua, row.ua_family, row.accept, row.referer, row.status, row.bot_score, row.path_class
  );

  // Wrapped in Promise.resolve().then(...) so that even a SYNCHRONOUS throw
  // from stmt.run() (not just an async rejection) is caught by the trailing
  // .catch and never surfaces as an unhandled rejection under waitUntil.
  const write = Promise.resolve().then(() => stmt.run()).catch(() => {});

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(write);
  }
  // If ctx/ctx.waitUntil is unavailable for any reason, `write` still runs
  // (it's already a live promise with its own .catch) — it just isn't
  // guaranteed to finish before the isolate is recycled, which is an
  // acceptable, honest degradation, never a thrown error.
}
