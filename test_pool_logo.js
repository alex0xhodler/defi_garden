/* Playwright behavior gate for spec 094: each pool row/card in the shared
   renderPoolCard path (grid AND list) carries a decorative protocol logo with
   a small chain badge. Drives the REAL rendered UI (http-server + chromium)
   and asserts on the rendered DOM — never on source strings — per the
   2026-07-11 standing decision.

   Fixture-routed, sandbox-safe (clone of test_list_default.js): browser HTTPS
   to unpkg.com (React/Babel) and yields.llama.fi (pools) is blocked, so those
   are routed to local vendored copies / a DefiLlama-shaped fixture. The
   committed snapshot is stale-stubbed (generatedAt 2020) so the FE freshness
   gate falls back to the live fixture. Additionally the DefiLlama icon host
   (icons.llamao.fi) is routed: one project's icon is fulfilled with a valid
   tiny PNG (resolving branch), the rest abort (monogram fallback branch).

   Run: node test_pool_logo.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8796;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Aborted icon requests log a console error (source = icons.llamao.fi) — that
// is the expected monogram-fallback path, not a page defect, so ignore it.
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|icons\.llamao\.fi/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
// A valid 1x1 PNG so the resolving-image branch keeps an <img> (no onError).
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const FIXTURE_POOLS = [
  makePool('good-eth', 'goodproto', 'USDC', 'Ethereum', 50_000_000, 4.5),
  makePool('bad-eth', 'badproto', 'USDC', 'Ethereum', 60_000_000, 5.0),
  makePool('usdc-eth-aave', 'aave-v3', 'USDC', 'Ethereum', 70_000_000, 4.8),
  makePool('3crv-eth-curve', 'curve-dex', '3CRV', 'Ethereum', 55_000_000, 3.2)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
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
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));

  // Icon host routing. Playwright matches the MOST RECENTLY added route first,
  // so register the catch-all abort FIRST and the specific goodproto fulfill
  // LAST so it takes precedence. Everything else (chains, badproto) aborts →
  // the component's onError → monogram fallback.
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('https://icons.llamao.fi/icons/chains/**', (route) => route.abort());
  await page.route('https://icons.llamao.fi/icons/protocols/badproto*', (route) => route.abort());
  await page.route('https://icons.llamao.fi/icons/protocols/goodproto*', (route) => route.fulfill({
    status: 200, contentType: 'image/png', body: TINY_PNG
  }));
}

// home.html loads style.min.css with media="print" and flips it to "all" on
// the link's onload (a render-blocking-CSS perf trick). In real browsers that
// onload fires; in this headless fixture load it can stay "print", leaving the
// main stylesheet inert. Since this gate asserts on the REAL CSS box sizes,
// deterministically activate any print-media stylesheet after each navigation.
async function activateStylesheets(page) {
  await page.evaluate(() => {
    document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => { if (l.media === 'print') l.media = 'all'; });
  });
  await page.waitForFunction(() => {
    const ci = document.querySelector('.pool-context-inline');
    return ci && getComputedStyle(ci).fontSize === '10px';
  }, { timeout: 5000 }).catch(() => {});
}

async function main() {
  console.log('network: unpkg.com + yields.llama.fi BLOCKED (vendored/fixture); icons.llamao.fi ROUTED (goodproto ok, rest abort)');
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
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
    await routeFixtures(page);

    await test('(a) /?token=USDC list view: every .pool-card has a .pool-logo (count matches)', async () => {
      await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await activateStylesheets(page);
      // Wait for the badproto image error to resolve into a monogram.
      await page.waitForSelector('.pool-logo-monogram[title="badproto logo"]', { timeout: 5000 });
      const counts = await page.evaluate(() => ({
        cards: document.querySelectorAll('.pool-card').length,
        logos: document.querySelectorAll('.pool-card .pool-logo').length,
        badges: document.querySelectorAll('.pool-card .pool-context-inline').length
      }));
      if (counts.cards < 1) throw new Error(`expected >=1 .pool-card, got ${counts.cards}`);
      if (counts.logos !== counts.cards) throw new Error(`expected .pool-logo count == .pool-card count (${counts.cards}), got ${counts.logos}`);
      if (counts.badges !== counts.cards) throw new Error(`text badge must still be present on every card: expected ${counts.cards}, got ${counts.badges}`);
    });

    await test('(b) goodproto row renders img.pool-logo-img[loading=lazy], 24x24 square box', async () => {
      const r = await page.evaluate(() => {
        const img = document.querySelector('img.pool-logo-img[src*="goodproto"]');
        if (!img) return { ok: false, reason: 'no img.pool-logo-img with goodproto src' };
        return {
          ok: true,
          loading: img.getAttribute('loading'),
          w: img.offsetWidth,
          h: img.offsetHeight,
          alt: img.getAttribute('alt')
        };
      });
      if (!r.ok) throw new Error(r.reason);
      if (r.loading !== 'lazy') throw new Error(`expected loading="lazy", got "${r.loading}"`);
      if (r.w !== r.h) throw new Error(`expected square box, got ${r.w}x${r.h}`);
      if (r.w !== 24) throw new Error(`expected 24px box, got ${r.w}`);
      if (!r.alt) throw new Error('expected non-empty alt text on protocol img');
    });

    await test('(c) badproto row (image aborted) shows monogram "B" in the same 24x24 box (no reflow)', async () => {
      const r = await page.evaluate(() => {
        const mono = document.querySelector('.pool-logo-monogram[title="badproto logo"]');
        if (!mono) return { ok: false, reason: 'no monogram for badproto' };
        const goodImg = document.querySelector('img.pool-logo-img[src*="goodproto"]');
        return {
          ok: true,
          text: mono.textContent.trim(),
          w: mono.offsetWidth,
          h: mono.offsetHeight,
          goodW: goodImg ? goodImg.offsetWidth : null,
          goodH: goodImg ? goodImg.offsetHeight : null
        };
      });
      if (!r.ok) throw new Error(r.reason);
      if (r.text !== 'B') throw new Error(`expected monogram text "B", got "${r.text}"`);
      if (r.w !== r.h) throw new Error(`expected square monogram box, got ${r.w}x${r.h}`);
      if (r.w !== 24) throw new Error(`expected 24px monogram box, got ${r.w}`);
      if (r.w !== r.goodW || r.h !== r.goodH) throw new Error(`monogram box (${r.w}x${r.h}) must equal good-image box (${r.goodW}x${r.goodH}) — no reflow`);
    });

    await test('(d) grid view + /?chain=Ethereum both render .pool-logo (shared-path regression guard)', async () => {
      // Toggle to grid view (still on /?token=USDC).
      await page.locator('.view-toggle-btn[title="Grid View"]').click();
      await page.waitForFunction(
        () => { const c = document.querySelector('.pool-card'); return c && c.parentElement.className === 'pools-grid'; },
        { timeout: 5000 }
      ).catch(() => {});
      const grid = await page.evaluate(() => ({
        cards: document.querySelectorAll('.pool-card').length,
        logos: document.querySelectorAll('.pool-card .pool-logo').length
      }));
      if (grid.logos !== grid.cards || grid.cards < 1) throw new Error(`grid view: expected .pool-logo on every card (${grid.cards}), got ${grid.logos}`);

      await page.goto(`http://localhost:${PORT}/?chain=Ethereum`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await activateStylesheets(page);
      const chain = await page.evaluate(() => ({
        cards: document.querySelectorAll('.pool-card').length,
        logos: document.querySelectorAll('.pool-card .pool-logo').length
      }));
      if (chain.logos !== chain.cards || chain.cards < 1) throw new Error(`chain mode: expected .pool-logo on every card (${chain.cards}), got ${chain.logos}`);
    });

    await test('(e) no unexpected page errors', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`✓ ${passed}/${total} pool-logo assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_pool_logo crashed: ' + err.message);
  process.exitCode = 1;
});
