/* Rendered-browser proof for the production-hostname tracking gate (spec 096).

   The unit test (test_analytics_host_gate.js) drives Analytics.track()
   directly. This test loads the REAL home.html in headless Chromium from a
   localhost server and proves that a genuine page load — which previously
   fired session_start into Mixpanel — now sends ZERO mixpanel.track calls
   because location.hostname is localhost.

   Mutation check baked in: the test also loads the page with the gate
   neutralised (Analytics.isProductionHost forced to true via addInitScript,
   simulating "gate removed") and asserts mixpanel.track DOES fire — so a
   regression that drops the gate makes THIS assertion's premise fail loudly
   in review, and the primary assertion (zero calls with the gate) is what
   guards production.

   Mirrors the established fixture-routing / sandbox pattern in
   test_analytics_fires.js + test_search.js: mixpanel's CDN lib is blocked in
   the sandbox, but the inline snippet defines a `mixpanel` stub with a
   .track() that queues — that stub is exactly what we spy on.

   Run: node test_analytics_host_gate_render.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8795;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// Install a spy on the mixpanel stub's .track BEFORE any page script runs.
// The inline snippet in home.html (re)assigns window.mixpanel synchronously in
// <head>; we poll until it exists, then wrap .track to record every real call.
function spyOnMixpanelTrack() {
  window.__mpTrackCalls = [];
  const install = () => {
    const mp = window.mixpanel;
    if (mp && typeof mp.track === 'function' && !mp.__gateSpied) {
      const orig = mp.track.bind(mp);
      mp.track = function () {
        window.__mpTrackCalls.push(Array.prototype.slice.call(arguments));
        return orig.apply(this, arguments);
      };
      mp.__gateSpied = true;
    }
    // keep re-checking in case the snippet reassigns window.mixpanel after us
    setTimeout(install, 10);
  };
  install();
}

async function loadAndCountMpCalls(browser, forceProduction) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(spyOnMixpanelTrack);
  if (forceProduction) {
    // Mutation-check leg: neutralise the gate as if it were removed.
    await page.addInitScript(() => {
      const patch = () => {
        if (typeof Analytics !== 'undefined' && Analytics.isProductionHost) {
          Analytics.isProductionHost = () => true;
          return;
        }
        setTimeout(patch, 0);
      };
      patch();
    });
  }
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 15000 });

  // Give the window 'load' listener (startSession -> track('session_start')) time to run.
  const deadline = Date.now() + 4000;
  let calls = [];
  for (;;) {
    calls = await page.evaluate(() => window.__mpTrackCalls || []);
    if (calls.length || Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  await page.close();
  return calls;
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    await test('real localhost home.html load fires ZERO mixpanel.track calls (gate active)', async () => {
      const calls = await loadAndCountMpCalls(browser, false);
      if (calls.length !== 0) {
        throw new Error('expected 0 mixpanel.track calls from localhost, got ' + calls.length + ': ' + JSON.stringify(calls.map((c) => c[0])));
      }
    });

    await test('mutation check: with the gate neutralised, the same load DOES fire session_start (proves the gate is what suppresses)', async () => {
      const calls = await loadAndCountMpCalls(browser, true);
      const names = calls.map((c) => c[0]);
      if (!names.includes('session_start')) {
        throw new Error('expected session_start to fire once the gate is neutralised, got ' + JSON.stringify(names));
      }
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' analytics-host-gate render assertions passed');
}

main().catch((err) => {
  console.error('test_analytics_host_gate_render crashed: ' + err.message);
  process.exitCode = 1;
});
