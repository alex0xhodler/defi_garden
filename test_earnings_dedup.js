/* Rendered Playwright test for backlog 128 — dedup the pool-detail earnings
   numbers. Before this item the daily/monthly earnings figure appeared THREE
   times on the pool-detail page: the top "quick metrics" stat cards (Daily +
   Monthly), the calculator's expandable result, AND a redundant numeric
   "Quick estimate for $1,000: $0.1/day" subhead on the calculator header.
   The redundancy lengthened the north-star conversion page and diluted the
   CTA (NORTH_STAR.md 2026-07-23: pool-detail is the primary optimization
   surface).

   The consolidation kept ONE at-a-glance earnings surface (the top stat
   cards) + the calculator, and removed the numeric quick-estimate subhead,
   replacing it with a non-numeric invite line (`calcSubPrompt`).

   This test proves, against a REAL render (not source reading, per the
   2026-07-11 standing decision that UX acceptance measures rendered
   behaviour):
   (1) the top stat cards still render the single earnings surface — a "Daily
       earnings" and a "Monthly earnings" card, each with a $ value;
   (2) the calculator header subhead is the non-numeric prompt and carries NO
       "$X/day" figure — the redundant third occurrence is gone;
   (3) no "Quick estimate" copy survives anywhere on the page;
   (4) no unexpected page/console errors.

   Fixture-routed (unpkg React/Babel vendored, snapshot 404'd to force the
   live path) — the house pattern from test_northstar_cta_fires.js/
   test_search.js; browser-originated external HTTPS is blocked in this
   sandbox (NORTH_STAR.md 2026-07-12 standing decision).

   Run: node test_earnings_dedup.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8819; // distinct from other test_* files (8791-8818 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — reused from test_northstar_cta_fires.js so the fixture stays
// byte-stable regardless of snapshot regeneration cadence; verified present
// in the snapshot before the test runs.
const POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [POOL] });

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

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        pageErrors.push('console.error: ' + m.text());
    });

    const nm = path.join(ROOT, 'node_modules');
    for (const [url, lp] of Object.entries({
      'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
    })) {
      await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
    }
    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

    await test('top stat cards render the single earnings surface (Daily + Monthly, each with a $ value)', async () => {
      const metricsText = await page.locator('.quick-metrics').innerText();
      if (!/Daily earnings/i.test(metricsText)) throw new Error(`expected a "Daily earnings" stat card — got:\n${metricsText}`);
      if (!/Monthly earnings/i.test(metricsText)) throw new Error(`expected a "Monthly earnings" stat card — got:\n${metricsText}`);
      if (!/\$[\d.,]+/.test(metricsText)) throw new Error(`expected a $ earnings value in the stat cards — got:\n${metricsText}`);
    });

    await test('calculator header subhead is the non-numeric prompt (no "$X/day", no "Quick estimate")', async () => {
      const headerText = await page.locator('.calculator-header').innerText();
      if (!/See your daily, weekly & monthly returns/i.test(headerText)) {
        throw new Error(`expected the non-numeric calcSubPrompt in the calculator header — got:\n${headerText}`);
      }
      if (/\$[\d.,]+\s*\/\s*day/i.test(headerText)) {
        throw new Error(`calculator header still shows a redundant "$X/day" quick-estimate figure — got:\n${headerText}`);
      }
      if (/Quick estimate/i.test(headerText)) {
        throw new Error(`calculator header still shows the "Quick estimate" copy — got:\n${headerText}`);
      }
    });

    await test('no "Quick estimate" copy survives anywhere on the pool-detail page', async () => {
      const bodyText = await page.locator('.pool-detail-view').innerText();
      if (/Quick estimate/i.test(bodyText)) {
        throw new Error('the removed "Quick estimate" subhead copy is still rendering somewhere on the page');
      }
    });

    await test('no unexpected page/console errors', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_earnings_dedup.js: ${passed}/4 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
