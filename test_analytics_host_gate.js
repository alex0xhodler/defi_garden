/* Unit coverage for the production-hostname tracking gate (spec 096).

   analytics.js suppresses every Mixpanel event on non-production hosts so
   local dev servers, Vercel preview deploys, and file: loads never pollute
   the north-star funnel. Evidence (signals/2026-07-14.md): 13/13 recent
   share_link_opened and 11/11 plan_created events came from localhost.

   This test requires the real analytics.js (module.exports = Analytics) and
   drives Analytics.track() directly, stubbing window.location.hostname +
   mixpanel to prove the gate lets production hosts through and blocks
   everything else — and, crucially, that the choke point is track() itself
   (so startSession/all track* helpers inherit the gate). The rendered-browser
   proof lives in test_analytics_host_gate_render.js.

   Run: node test_analytics_host_gate.js */

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// --- Minimal browser-global stubs so requiring analytics.js does not throw and
//     getBaseContext() (only reached on the allowed path) has what it needs. ---
const trackCalls = [];
global.mixpanel = { track: (name, data) => trackCalls.push({ name, data }) };
global.navigator = { userAgent: 'node-test', language: 'en-US', deviceMemory: 8, hardwareConcurrency: 8, connection: null };
global.screen = { width: 1280, height: 800 };
global.window = {
  location: { hostname: 'localhost', href: 'http://localhost:8000/plan.html' },
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener: () => {},
};
global.document = { referrer: '', addEventListener: () => {}, visibilityState: 'visible' };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Intl = Intl;

const Analytics = require('./analytics.js');
Analytics.init();

function setHost(hostname) {
  global.window.location.hostname = hostname;
  global.window.location.href = 'https://' + hostname + '/plan.html';
  Analytics._suppressionLogged = false; // reset one-shot debug flag between cases
}
function fireAndCount(hostname) {
  setHost(hostname);
  trackCalls.length = 0;
  Analytics.track('session_start', { probe: true });
  return trackCalls.length;
}

const ALLOWED = ['defi.garden', 'www.defi.garden', 'yield.garden', 'www.yield.garden'];
const BLOCKED = ['localhost', '127.0.0.1', 'defi-garden-git-main-alexs-projects-x.vercel.app', 'defi-garden-abc123.vercel.app', '', 'example.com', 'staging.defi.garden'];

test('the allowlist is exactly the four documented production hosts', () => {
  assert(JSON.stringify(Analytics.PRODUCTION_HOSTS) === JSON.stringify(ALLOWED),
    'PRODUCTION_HOSTS = ' + JSON.stringify(Analytics.PRODUCTION_HOSTS));
});

ALLOWED.forEach((host) => {
  test('production host "' + host + '" fires the event through to mixpanel.track', () => {
    assert(fireAndCount(host) === 1, 'expected exactly 1 mixpanel.track call on ' + host);
    assert(trackCalls[0].name === 'session_start', 'event name should be preserved');
    // The gate must not strip the enriched context of allowed events.
    assert(trackCalls[0].data && trackCalls[0].data.page_url, 'allowed event should carry base context');
  });
});

BLOCKED.forEach((host) => {
  test('non-production host "' + (host || '(empty)') + '" is suppressed (zero mixpanel.track calls)', () => {
    assert(fireAndCount(host) === 0, 'expected 0 mixpanel.track calls on ' + (host || '(empty)'));
  });
});

test('case-insensitive: WWW.DEFI.GARDEN is treated as production', () => {
  assert(fireAndCount('WWW.DEFI.GARDEN') === 1, 'uppercase production host should still fire');
});

test('startSession() inherits the gate (localhost => no session_start reaches mixpanel)', () => {
  setHost('localhost');
  trackCalls.length = 0;
  Analytics.sessionId = null;
  Analytics.startSession();
  assert(trackCalls.length === 0, 'startSession must funnel through the gated track()');
});

test('startSession() on production reaches mixpanel', () => {
  setHost('www.defi.garden');
  trackCalls.length = 0;
  Analytics.sessionId = null;
  Analytics.startSession();
  assert(trackCalls.length === 1 && trackCalls[0].name === 'session_start', 'production startSession should fire');
});

test('a thrown getBaseContext-adjacent access cannot come from the gate itself (isProductionHost never throws)', () => {
  const saved = global.window;
  global.window = undefined; // simulate a hostile/absent environment
  let threw = false;
  try { Analytics.isProductionHost(); } catch (e) { threw = true; }
  global.window = saved;
  assert(!threw, 'isProductionHost must be defensive and never throw');
});

console.log(passed + ' analytics-host-gate unit assertions passed');
