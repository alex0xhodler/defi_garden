/* Playwright acceptance gate for spec 072 (honest dead-`?pool=` empty state):
   drives the REAL rendered analytics app (home.html + vendored React +
   app.compiled.min.js) and asserts the six acceptance criteria — a dead
   `?pool=<id>` deep link renders the honest "no longer tracked" empty state,
   noindexes ONLY that dead URL, offers live trust-rail alternatives, and never
   noindexes a VALID pool URL.

   home.html loads React/ReactDOM/translations/analytics/PoolDetail/app entirely
   from LOCAL vendored files (see home.html:141-143, :318-319); the ONLY external
   request is yields.llama.fi/pools, which is fixture-routed here. Every other
   non-local request (fonts, analytics CDN) is aborted — connection-blocked
   in-sandbox anyway (NORTH_STAR 2026-07-12). Runtime EN/KO strings are read from
   translations.js at test time, never hardcoded.

   Run: node test_dead_pool.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8800; // 8791-8799 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Runtime strings straight from the source of truth (never hardcoded).
const { translations: tr } = require('./translations.js');
const EN_TITLE = tr.en.poolNotFoundTitle;
const KO_TITLE = tr.ko.poolNotFoundTitle;

const DEAD_ID = 'definitely-not-a-real-pool-id';

// Fixture pools: stablecoin pools well above the $10M floor (DEFAULT_MIN_TVL)
// become the honest alternatives; one sub-floor stable pool must be excluded;
// VALID_ID is a real live pool used to prove a valid ?pool= URL is never
// noindexed and still renders pool detail.
const VALID_ID = 'usdc-eth-aave-valid';
const FIXTURE_POOLS = { status: 'success', data: [
  { pool: VALID_ID,          symbol: 'USDC', project: 'aave-v3',     chain: 'Ethereum', apyBase: 5,  apyReward: 0, tvlUsd: 800000000 },
  { pool: 'usdt-eth-comp',   symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 6,  apyReward: 0, tvlUsd: 400000000 },
  { pool: 'dai-eth-morpho',  symbol: 'DAI',  project: 'morpho-blue', chain: 'Ethereum', apyBase: 7,  apyReward: 0, tvlUsd: 250000000 },
  { pool: 'usds-eth-spark',  symbol: 'USDS', project: 'spark',       chain: 'Ethereum', apyBase: 4,  apyReward: 0, tvlUsd: 120000000 },
  { pool: 'usdc-eth-subfloor', symbol: 'USDC', project: 'sushiswap', chain: 'Ethereum', apyBase: 9, apyReward: 0, tvlUsd: 500000 } // below $10M -> excluded
] };
const FIXTURE_RESPONSE = JSON.stringify(FIXTURE_POOLS);

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

// New context with pools fixture-routed and every other external request
// aborted. Collects pageerrors for the zero-page-errors criterion.
async function newCtx(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**yields.llama.fi/pools**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
  await context.route(url =>
    !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('yields.llama.fi'),
    route => route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  return { context, page, pageErrors };
}

const robotsContent = (page) => page.evaluate(() => {
  const m = document.querySelector('meta[name="robots"]');
  return m ? m.getAttribute('content') : null;
});

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- Criterion 1: dead ?pool= renders honest empty state, no homepage grid,
    //     noindex ------------------------------------------------------------
    await test('dead ?pool= renders honest empty state (EN title), no all-pools grid, robots=noindex', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.empty-state', { timeout: 15000 });

      // Honest headline visible.
      await page.waitForFunction((title) => {
        const el = document.querySelector('.empty-state .empty-message');
        return el && el.textContent.trim() === title;
      }, EN_TITLE, { timeout: 8000 });

      // The all-pools grid must NOT render: zero .pool-card outside the
      // alternatives block (alternatives live inside .empty-state-alternatives).
      const strayCards = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.pool-card'))
          .filter(c => !c.closest('.empty-state-alternatives')).length);
      if (strayCards !== 0) throw new Error(`expected 0 pool-cards outside alternatives, got ${strayCards}`);

      const robots = await robotsContent(page);
      if (robots !== 'noindex') throw new Error(`expected robots=noindex, got ${robots}`);

      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 2: alternatives render (from fixture, above floor); clicking
    //     one navigates to pool detail and restores robots=index, follow ------
    await test('alternatives render above the floor; clicking one -> pool detail + robots restored', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.empty-state-alternatives .pool-card', { timeout: 15000 });

      const altCards = await page.locator('.empty-state-alternatives .pool-card').count();
      if (altCards < 1) throw new Error(`expected >=1 alternative pool-card, got ${altCards}`);

      // Every alternative must be a fixture pool above the $10M floor.
      const aboveFloor = new Set(FIXTURE_POOLS.data.filter(p => p.tvlUsd >= 10_000_000).map(p => p.symbol));
      const altSymbols = await page.locator('.empty-state-alternatives .pool-symbol').allTextContents();
      for (const s of altSymbols) {
        const base = s.trim().split(/[-\s/]/)[0];
        if (!aboveFloor.has(base)) throw new Error(`alternative symbol "${s}" is not an above-floor fixture pool`);
      }

      await page.locator('.empty-state-alternatives .pool-card').first().click();
      await page.waitForSelector('.pool-detail-view', { timeout: 10000 });

      await page.waitForFunction(() => {
        const m = document.querySelector('meta[name="robots"]');
        return m && m.getAttribute('content') === 'index, follow';
      }, { timeout: 8000 });
      const robots = await robotsContent(page);
      if (robots !== 'index, follow') throw new Error(`expected robots restored to "index, follow", got ${robots}`);

      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 3 (guardrail): valid ?pool= renders detail, NEVER noindexed
    await test('valid ?pool= renders pool detail and robots stays "index, follow" (never noindexed)', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${VALID_ID}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      // Watch robots for a while; it must never flip to noindex on a live pool.
      const deadline = Date.now() + 3000;
      for (;;) {
        const robots = await robotsContent(page);
        if (robots === 'noindex') throw new Error('valid pool URL was noindexed — guardrail violation');
        if (Date.now() > deadline) break;
        await page.waitForTimeout(150);
      }
      const finalRobots = await robotsContent(page);
      if (finalRobots !== 'index, follow') throw new Error(`expected robots "index, follow" on valid pool, got ${finalRobots}`);

      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 4: KO locale renders KO title -----------------------------
    await test('dead ?pool=&lang=ko renders the KO poolNotFoundTitle string', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}&lang=ko`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.empty-state', { timeout: 15000 });
      await page.waitForFunction((title) => {
        const el = document.querySelector('.empty-state .empty-message');
        return el && el.textContent.trim() === title;
      }, KO_TITLE, { timeout: 8000 });
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 6: token empty-state path untouched — a VALID token search
    //     still renders the grid and is indexable (deadPoolResolved=false path
    //     renders byte-identically to before) -------------------------------
    await test('valid ?token= still renders pool cards and stays indexable (dead-pool path does not disturb token path)', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const cards = await page.locator('.pool-card').count();
      if (cards < 1) throw new Error(`expected >=1 pool-card for a valid token, got ${cards}`);
      const robots = await robotsContent(page);
      if (robots !== 'index, follow') throw new Error(`expected valid token page indexable, got robots=${robots}`);
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} dead-pool assertions passed (EN: "${EN_TITLE}", KO: "${KO_TITLE}")`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
