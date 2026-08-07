/* Rendered Playwright test for backlog 129 — lead the pool-detail body with the
   5y projection + "keep your money" frame, ahead of the underwhelming
   daily/monthly small-$ cards.

   RE-POINTED for spec 210 (input-first earnings block merge): the standalone
   `.pool-projection-card` top-level section and the `.quick-metrics` grid it
   used to lead (daily card, monthly card, risk card) no longer exist as
   siblings — 210 merged them into ONE `calculator-compact` "your garden"
   block. `.pool-projection-card` itself survives (same class, conditions,
   copy — judgment call recorded in specs/210-notes.md: relocated, not
   deleted, consistent with the spec's "do not change class names" rule for
   the sibling rate-note family) but now renders INSIDE `calculator-compact`,
   AFTER the investment-amount input (`input-wrapper`) — input-first, so the
   user sets their number before reading the projection. The old daily/
   monthly-cards-still-render assertion is RETIRED here: those stat cards are
   gone by design (210 acceptance criterion — dedup, not a regression);
   test_earnings_dedup.js is the new home for asserting they don't come back.

   Proves, against a REAL chromium render of a `?pool=<id>` landing (not source
   reading):
   (1) the projection card (`.pool-projection-card`) renders INSIDE
       `.calculator-compact`, AFTER the amount input (`.input-wrapper`), in DOM
       order — input-first;
   (2) the projection card still carries the 5y projection number
       (`projectionBody` — "in 5y … at current rates") — the reorder did not
       drop the honest number;
   (3) the "keep your money" line renders inside the projection card in EN
       ("keep your money") AND in KO ("예치금") on a `&lang=ko` render — EN+KO
       both present;
   (4) the standalone `.quick-metrics` grid is GONE (merged away, not a
       regression — 210's de-duplication);
   (5) no unexpected page/console errors.

   House pattern from test_repeat_cta.js / test_ko_pool_money_honesty.js: unpkg
   React/Babel vendored from node_modules, snapshot 404'd to force the live
   `yields.llama.fi/pools` path, one real pool from the committed snapshot.

   Run: node test_projection_lead.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8820; // distinct from other test_* files (8791-8819 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — a low-single-digit-APY pool, exactly the "low-absolute-$" class
// 129 targets. Reused (not read live) so the fixture stays byte-stable.
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

async function routeFixtures(page) {
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
}

async function renderDetail(browser, lang) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      pageErrors.push('console.error: ' + m.text());
  });
  await routeFixtures(page);
  const langQ = lang ? `&lang=${lang}` : '';
  await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}${langQ}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  await page.waitForSelector('.pool-projection-card', { timeout: 10000 });
  return { page, pageErrors };
}

async function main() {
  // Sanity: the fixture pool id is real, drawn from the committed snapshot.
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // ---- EN render ----
    const { page, pageErrors } = await renderDetail(browser, null);

    // (1) projection card lives INSIDE calculator-compact, AFTER the amount
    // input — input-first (210). The old .quick-metrics grid it used to lead
    // is gone entirely (asserted separately below).
    await test('.pool-projection-card renders inside .calculator-compact, AFTER the amount input (input-first)', async () => {
      const result = await page.evaluate(() => {
        const proj = document.querySelector('.pool-projection-card');
        const calc = document.querySelector('.calculator-compact');
        const input = document.querySelector('.input-wrapper');
        if (!proj) return { err: 'no .pool-projection-card on the page' };
        if (!calc) return { err: 'no .calculator-compact on the page' };
        if (!input) return { err: 'no .input-wrapper (amount input) on the page' };
        const insideCalc = calc.contains(proj);
        // DOCUMENT_POSITION_FOLLOWING (4): proj follows input, i.e. input
        // renders first (input-first ordering).
        const inputFirst = !!(input.compareDocumentPosition(proj) & Node.DOCUMENT_POSITION_FOLLOWING);
        return { insideCalc, inputFirst };
      });
      if (result.err) throw new Error(result.err);
      if (!result.insideCalc) throw new Error('.pool-projection-card is NOT inside .calculator-compact');
      if (!result.inputFirst) throw new Error('.pool-projection-card does NOT come after the amount input — not input-first');
    });

    // (4, moved up) the standalone .quick-metrics grid no longer exists —
    // 210 merged the daily/monthly/risk cards it held into the earnings
    // block and hero chip row. Retiring, not weakening, the old "daily +
    // monthly earnings cards still render" leg from this file — the
    // reference-count/no-daily-monthly-stat-card assertions now live in
    // test_earnings_dedup.js (the natural home for de-dup acceptance).
    await test('.quick-metrics grid no longer renders (merged into the earnings block, 210)', async () => {
      const count = await page.locator('.quick-metrics').count();
      if (count !== 0) throw new Error(`expected .quick-metrics to be gone (merged away by 210), found ${count}`);
    });

    // (2) projection card still carries the 5y projection number
    await test('projection card still shows the 5y projection number (projectionBody)', async () => {
      const txt = await page.locator('.pool-projection-card').innerText();
      if (!/in\s*5y/i.test(txt) || !/at current rates/i.test(txt)) {
        throw new Error('projectionBody "…in 5y … at current rates" not found in the projection card: ' + JSON.stringify(txt));
      }
    });

    // (3a) keep-your-money line present in EN inside the projection card
    await test('keep-your-money line renders in EN inside the projection card', async () => {
      const txt = await page.locator('.pool-projection-card').innerText();
      if (!/keep your money/i.test(txt)) {
        throw new Error('EN "keep your money" line not found in the projection card: ' + JSON.stringify(txt));
      }
    });

    // (5) no unexpected page/console errors on the EN render
    await test('no unexpected page/console errors (EN)', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
    await page.close();

    // ---- KO render ----
    const { page: koPage, pageErrors: koErrors } = await renderDetail(browser, 'ko');

    // (3b) keep-your-money line present in KO
    await test('keep-your-money line renders in KO ("예치금") inside the projection card', async () => {
      const txt = await koPage.locator('.pool-projection-card').innerText();
      if (!/예치금/.test(txt)) {
        throw new Error('KO keep-note ("예치금") not found in the projection card — lang=ko may not have applied: ' + JSON.stringify(txt));
      }
      // And the projection card still renders input-first (after the amount
      // input) inside calculator-compact on the KO render too.
      const ok = await koPage.evaluate(() => {
        const proj = document.querySelector('.pool-projection-card');
        const calc = document.querySelector('.calculator-compact');
        const input = document.querySelector('.input-wrapper');
        return !!(proj && calc && input && calc.contains(proj) &&
          (input.compareDocumentPosition(proj) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      if (!ok) throw new Error('projection card is not input-first inside calculator-compact on the KO render');
    });

    await test('no unexpected page/console errors (KO)', async () => {
      if (koErrors.length) throw new Error(koErrors.join('\n    '));
    });
    await koPage.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_projection_lead.js: ${passed}/7 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
