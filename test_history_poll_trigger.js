/* Unit tests for workers/history-poll-trigger/worker.js (ESM). Pure Node, fake fetch,
   NO network, NO Worker runtime. The token must never appear in an error message.

   Run: node test_history_poll_trigger.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); passed++; }

const TOKEN = 'ghp_SECRET_TOKEN_123';
const ENV = { GITHUB_DISPATCH_TOKEN: TOKEN };
const res = (status, text) => ({ status, text: async () => text || '' });
const fakeFetch = (...answers) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return a;
  };
  f.calls = calls;
  return f;
};

(async () => {
  // The repo is CommonJS (no "type": "module"), so a worker.js import would parse as CJS:
  // copy the ESM source to a temp .mjs and import that.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'history-poll-trigger-'));
  const mjs = path.join(tmp, 'worker.mjs');
  fs.copyFileSync(path.join(__dirname, 'workers', 'history-poll-trigger', 'worker.js'), mjs);
  const worker = await import(pathToFileURL(mjs).href);
  fs.rmSync(tmp, { recursive: true, force: true });
  const fast = { delayMs: 1 };

  // request shape
  const req = worker.buildDispatchRequest(ENV);
  eq(req.url, 'https://api.github.com/repos/alex0xhodler/defi_garden/actions/workflows/history-poll.yml/dispatches', 'url');
  eq(req.init.method, 'POST', 'method');
  eq(req.init.headers.Authorization, 'Bearer ' + TOKEN, 'auth header');
  eq(req.init.headers.Accept, 'application/vnd.github+json', 'accept');
  eq(req.init.headers['X-GitHub-Api-Version'], '2022-11-28', 'api version');
  eq(req.init.headers['User-Agent'], 'defi-garden-history-poll-trigger', 'user agent');
  assert.deepStrictEqual(JSON.parse(req.init.body), { ref: 'main' }); passed++;

  // 204 ok, single call
  let f = fakeFetch(res(204));
  eq(await worker.dispatch(ENV, f, fast), 204, '204 ok');
  eq(f.calls.length, 1, 'one fetch');
  f = fakeFetch(res(200));
  eq(await worker.dispatch(ENV, f, fast), 200, '200 accepted');

  // 500 then 204 -> one retry
  f = fakeFetch(res(500, 'boom'), res(204));
  eq(await worker.dispatch(ENV, f, fast), 204, 'retry succeeds');
  eq(f.calls.length, 2, 'retried once');

  // network error then 204
  f = fakeFetch(new Error('connect reset'), res(204));
  eq(await worker.dispatch(ENV, f, fast), 204, 'retry after network error');
  eq(f.calls.length, 2, 'network error retried once');

  // 5xx twice -> throws after exactly 2 calls
  f = fakeFetch(res(502, 'bad gw'), res(503, 'unavail'));
  await assert.rejects(worker.dispatch(ENV, f, fast), /503/); passed++;
  eq(f.calls.length, 2, 'only one retry');

  // 401 -> throws, no retry, token not leaked, body truncated
  f = fakeFetch(res(401, 'Bad credentials ' + 'x'.repeat(500)));
  let err;
  try { await worker.dispatch(ENV, f, fast); } catch (e) { err = e; }
  ok(err && /401/.test(err.message) && /Bad credentials/.test(err.message), '401 throws with status and body');
  ok(!err.message.includes(TOKEN), 'token not in error');
  ok(err.message.length < 450, 'body truncated to 300 chars');
  eq(f.calls.length, 1, '401 not retried');

  // missing token
  f = fakeFetch(res(204));
  await assert.rejects(worker.dispatch({}, f, fast), /GITHUB_DISPATCH_TOKEN/); passed++;
  eq(f.calls.length, 0, 'no fetch without token');

  // handlers
  eq(typeof worker.default.scheduled, 'function', 'scheduled handler');
  eq((await worker.default.fetch()).status, 404, 'fetch handler 404');

  console.log(`test_history_poll_trigger: ${passed} assertions passed`);
})().catch((e) => { console.error(e); process.exit(1); });
