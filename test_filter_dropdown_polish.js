/* Filter-dropdown polish gate for spec 111. Drives the REAL open-dropdown UI in
   the analytics app and asserts the Part B polish:
     - a subtle .filter-dropdown-scrim renders under the dropdown (z-index below it)
     - NO banned scale-pop hover on inactive pills/chips (matrix scale ≈ 1)
     - the selected chip is a solid, unmistakable filled control (white text, a
       fill distinct from an unselected sibling)
     - clicking the scrim (outside the panel) closes both scrim + dropdown

   Rendered Playwright only, same harness as test_nav_rail_ia.js: local static
   server for home.html; page.route fixtures for React/react-dom/@babel from
   node_modules; a stale pools-snapshot stub; a yields.llama.fi/pools fixture; an
   icons.llamao.fi 1×1 pool-logo fixture; IGNORABLE_ERROR_PATTERN; the
   /opt/pw-browsers/chromium executable if present.

   Load /?token=USDC — token mode leaves selectedChain empty (clean default
   labels) and shows every USDC pool. The TVL dropdown always renders and carries
   one active chip + inactive siblings, ideal for the fill/hover assertions.

   Run: node test_filter_dropdown_polish.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8803;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
// All TVL > $10M so they survive the default floor; two chains so the Chains
// dropdown renders (>1 chain) and every symbol carries a USDC token segment.
const FIXTURE_POOLS = [
  makePool('rwa-ondo-base', 'ondo-yield-assets', 'USDC-ONDO', 'Base', 120_000_000, 4.5),
  makePool('lend-aave-base', 'aave-v3', 'USDC-AAVE', 'Base', 200_000_000, 3.0, 'Lending'),
  makePool('lend-aave-eth', 'aave-v3', 'USDC-COMP', 'Ethereum', 150_000_000, 3.0, 'Lending')
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
  // Stale-stub the committed snapshot so the freshness gate falls back to the
  // live fixture rather than the committed snapshot.
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
  // Pool-logo loads (icons.llamao.fi) → tiny 1×1 fixture so the sandbox network
  // artifact does not mask real page errors.
  await page.route('https://icons.llamao.fi/**', (route) => route.fulfill({
    status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
  }));
}

// Parse a computed transform string to its scaleX / scaleY. 'none' → {1,1}.
function scaleOf(transform) {
  if (!transform || transform === 'none') return { sx: 1, sy: 1 };
  const m = transform.match(/matrix\(([^)]+)\)/);
  if (!m) return { sx: 1, sy: 1 };
  const p = m[1].split(',').map(s => parseFloat(s.trim()));
  // matrix(a, b, c, d, e, f): scaleX ≈ a, scaleY ≈ d (no rotation here).
  return { sx: p[0], sy: p[3] };
}

async function openTvl(page) {
  await page.click('#tvl-btn');
  await page.waitForSelector('.global-filter-dropdown', { timeout: 5000 });
}

async function main() {
  console.log('\n=== rendered Playwright: filter-dropdown polish (spec 111) ===');
  console.log('network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi + icons.llamao.fi BLOCKED (fixtures)');
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

    await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    // home.html loads style.min.css with media="print" onload="this.media='all'"
    // (non-blocking async-CSS). That onload swap is racy under headless, so drive
    // it deterministically — exactly what the browser does on load — then wait
    // until the sheet is live before probing computed styles.
    await page.evaluate(() =>
      document.querySelectorAll('link[rel="stylesheet"][media="print"]').forEach(l => { l.media = 'all'; }));
    await page.waitForFunction(() => {
      const h = document.querySelector('.google-header-sticky');
      return h && getComputedStyle(h).position === 'fixed';
    }, { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('#tvl-btn', { timeout: 5000 });

    // (1) Scrim present + layered under the dropdown.
    await test('opening TVL renders exactly one scrim, z-index below the dropdown', async () => {
      await openTvl(page);
      const r = await page.evaluate(() => {
        const dds = document.querySelectorAll('.global-filter-dropdown');
        const scrims = document.querySelectorAll('.filter-dropdown-scrim');
        if (dds.length < 1 || scrims.length < 1) return { ddCount: dds.length, scrimCount: scrims.length };
        return {
          ddCount: dds.length,
          scrimCount: scrims.length,
          ddZ: parseInt(getComputedStyle(dds[0]).zIndex, 10),
          scrimZ: parseInt(getComputedStyle(scrims[0]).zIndex, 10)
        };
      });
      if (r.scrimCount !== 1) throw new Error('expected exactly 1 .filter-dropdown-scrim, got ' + r.scrimCount);
      if (r.ddCount < 1) throw new Error('expected a .global-filter-dropdown to be open');
      if (!(r.scrimZ < r.ddZ)) throw new Error(`scrim z-index ${r.scrimZ} not strictly below dropdown z-index ${r.ddZ}`);
    });

    // (2) No banned scale-pop hover on an inactive chip.
    await test('hovering an inactive dropdown chip yields no scale (matrix scale ≈ 1)', async () => {
      const sel = '.global-filter-dropdown .filter-chip:not(.active)';
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.hover(sel).catch(() => {});
      await page.waitForTimeout(120);
      const transform = await page.evaluate((s) => {
        const el = document.querySelector(s);
        return el ? getComputedStyle(el).transform : 'none';
      }, sel);
      const { sx, sy } = scaleOf(transform);
      if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01)
        throw new Error(`inactive chip hover has scale (sx=${sx}, sy=${sy}) — banned scale-pop; transform=${transform}`);
    });

    // (3) Selected chip is a solid filled control — white text, fill distinct
    //     from an unselected sibling. Select a chip (this closes the dropdown as
    //     each chip calls setActiveDropdown(null)), then reopen and inspect.
    await test('selected chip is filled: white text + background unlike an unselected sibling', async () => {
      // Select the "No Min" chip so at least one pool always remains visible.
      await page.evaluate(() => {
        const chip = Array.from(document.querySelectorAll('.global-filter-dropdown .filter-chip'))
          .find(c => c.textContent.trim() === 'No Min');
        if (chip) chip.click();
      });
      await page.waitForSelector('.global-filter-dropdown', { state: 'detached', timeout: 5000 }).catch(() => {});
      await openTvl(page);
      const r = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('.global-filter-dropdown .filter-chip'));
        const active = chips.find(c => c.classList.contains('active'));
        const inactive = chips.find(c => !c.classList.contains('active'));
        if (!active || !inactive) return { hasActive: !!active, hasInactive: !!inactive };
        const cs = getComputedStyle(active);
        return {
          hasActive: true,
          hasInactive: true,
          color: cs.color,
          activeBg: cs.backgroundColor,
          inactiveBg: getComputedStyle(inactive).backgroundColor
        };
      });
      if (!r.hasActive) throw new Error('no .active chip found in reopened dropdown');
      if (!r.hasInactive) throw new Error('no unselected sibling chip to compare against');
      const whiteish = /rgba?\(\s*255,\s*255,\s*255/.test(r.color);
      if (!whiteish) throw new Error('selected chip text color is not white: ' + r.color);
      if (r.activeBg === r.inactiveBg)
        throw new Error('selected chip background equals unselected sibling background (' + r.activeBg + ') — not a distinct fill');
      const transparent = /rgba?\([^)]*,\s*0\s*\)/.test(r.activeBg) || r.activeBg === 'transparent';
      if (transparent) throw new Error('selected chip background is transparent: ' + r.activeBg);
    });

    // (4) Clicking the scrim (outside the panel) closes both scrim + dropdown.
    await test('clicking the scrim closes both the dropdown and the scrim', async () => {
      // Dropdown is open from the previous reopen. Click the scrim directly.
      await page.waitForSelector('.filter-dropdown-scrim', { timeout: 5000 });
      await page.evaluate(() => {
        const scrim = document.querySelector('.filter-dropdown-scrim');
        if (scrim) scrim.click();
      });
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => ({
        dd: document.querySelectorAll('.global-filter-dropdown').length,
        scrim: document.querySelectorAll('.filter-dropdown-scrim').length
      }));
      if (r.dd !== 0) throw new Error(r.dd + ' .global-filter-dropdown still present after scrim click');
      if (r.scrim !== 0) throw new Error(r.scrim + ' .filter-dropdown-scrim still present after scrim click');
    });

    // (5) Zero non-ignorable page errors across the run.
    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await test('zero non-ignorable page errors across the run', async () => {
      if (pageErrors.length) throw new Error(pageErrors.length + ' page error(s): ' + pageErrors.join(' | '));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/${total} rendered assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_filter_dropdown_polish crashed: ' + err.message);
  process.exitCode = 1;
});
