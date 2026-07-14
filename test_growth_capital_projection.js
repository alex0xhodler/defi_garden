/* Regression test for a live production bug (reported 2026-07-13): a
   capital-funded GROWTH plan (e.g. /plan.html?goal=retirement&pace=rwa&
   capital=1000&fm=capital&years=5) rendered "≈ $0 in 5 years", "vs $0 in a
   typical 0.5% savings account", and "You'd have deposited $0 of your own
   money" — the headline, bank-comparison, and deposited figures were all
   computed from `futureValue(monthly, ...)`, a pure monthly-contribution
   annuity formula, and `monthly` is null for a capital-funded plan. Fixed
   by planner.js's new `capitalGrowth()` lump-sum helper, threaded into
   buildPlanHero, Bloom's live-slider headline, and GardenReport's returning-
   visitor recompute.

   Drives the REAL rendered plan.html UI (2026-07-11 standing decision —
   never fixture strings alone). Mirrors test_spotlight_url.js's exact
   harness (local static server, real Chromium, vendored React/Babel +
   a routed pools fixture — browser-originated HTTPS to unpkg.com/
   yields.llama.fi is blocked at the proxy connection level in this sandbox,
   NORTH_STAR.md 2026-07-12).

   Run: node test_growth_capital_projection.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8799; // 8791-8798 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// 'ondo' clears the rwa persona's RWA_ALLOWLIST + $10M TVL floor + <=20% APY
// band (planner.js PERSONAS.rwa) — the exact persona the reported URL uses
// (pace=rwa).
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('rwa-usdc-eth', 'ondo', 'USDC', 'Ethereum', 60_000_000, 8.5)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'plan.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function main() {
  const unpkgReachable = false; // same hardcoded precedent as test_spotlight_url.js
  console.log(`network: unpkg.com ${unpkgReachable ? 'reachable' : 'BLOCKED (using local vendored React/Babel)'}, yields.llama.fi BLOCKED (using fixture pool)`);

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // Deliberately NOT clearing localStorage on every navigation here (unlike
    // test_spotlight_url.js's per-case isolation pattern) — the second
    // assertion below needs the plan Bloom auto-saves on the first
    // navigation to still be there on the second, to exercise GardenReport's
    // returning-visitor path. A fresh browser context already starts empty.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });

    const nodeModules = path.join(ROOT, 'node_modules');
    const vendored = {
      'https://unpkg.com/react@18/umd/react.production.min.js':
        path.join(nodeModules, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
        path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js':
        path.join(nodeModules, '@babel/standalone/babel.min.js')
    };
    for (const [url, localPath] of Object.entries(vendored)) {
      await page.route(url, (route) => route.fulfill({
        status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
      }));
    }
    // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically (a 200 keeps the browser console clean; a 404 would trip pageErrors guards).
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    await test('exact reported URL (goal=retirement&pace=rwa&capital=1000&fm=capital&years=5) does NOT render $0', async () => {
      await page.goto(
        `http://localhost:${PORT}/plan.html?goal=retirement&pace=rwa&capital=1000&fm=capital&years=5`,
        { waitUntil: 'load', timeout: 20000 }
      );
      await page.waitForSelector('.gp-headline-figure', { timeout: 15000 });
      const headline = (await page.textContent('.gp-headline-figure')).trim();
      if (/\$0\b/.test(headline) || headline === '≈ $0') {
        throw new Error('headline projection is $0 — capital-funded growth plan regression, got: ' + headline);
      }
      // 1000 * 1.0858^5 ~= $1,509 — sanity floor, not an exact-match assertion
      // (live-fixture APY, formatUsdRounded rounding).
      const headlineNum = Number(headline.replace(/[^0-9.]/g, ''));
      if (!(headlineNum > 1000)) {
        throw new Error('expected the $1,000 capital to compound above its principal, got: ' + headline);
      }

      const vsBank = (await page.textContent('.gp-headline-vs')).trim();
      if (/\$0\b/.test(vsBank)) {
        throw new Error('bank-comparison line is $0 — capital not fed into the bank-rate projection, got: ' + vsBank);
      }

      const deposited = (await page.textContent('.gp-headline-deposited')).trim();
      if (/\$0\b/.test(deposited)) {
        throw new Error('"you\'d have deposited" line is $0 — expected the $1,000 capital, got: ' + deposited);
      }
      if (!deposited.includes('1,000') && !deposited.includes('1000')) {
        throw new Error('expected the deposited line to reflect the $1,000 capital, got: ' + deposited);
      }
    });

    await test('the same plan, saved and reloaded (GardenReport view), also does not render $0', async () => {
      // Bloom auto-saves the plan on settle (plan_saved effect, async) —
      // give it a moment before navigating away, then reload the bare
      // /plan.html (no query); with localStorage populated this routes into
      // GardenReport, the returning-visitor view, which recomputes its own
      // "now" projection independently of Bloom's.
      await page.waitForTimeout(1000);
      await page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.gp-report-now, .gp-headline-figure', { timeout: 15000 });
      const nowEl = await page.locator('.gp-report-now').count();
      if (nowEl > 0) {
        const now = (await page.textContent('.gp-report-now')).trim();
        if (/\$0\b/.test(now)) {
          throw new Error('GardenReport "now" projection is $0 for a saved capital-funded growth plan, got: ' + now);
        }
      }
    });

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  const total = 2;
  console.log(passed + '/' + total + ' growth-capital-projection assertions passed');
}

main().catch((err) => {
  console.error('test_growth_capital_projection crashed: ' + err.message);
  process.exitCode = 1;
});
