/* Nav-rail IA gate for spec 093: restructures the analytics sticky-header nav
   into a primary category rail + a visually separated secondary filter cluster,
   with monochrome (currentColor) inline-SVG iconography, EN+KO-translated filter
   labels, and preserved press physics / dropdown positioning.

   Rendered Playwright only (test_category_taxonomy.js harness verbatim: local
   static server for home.html; page.route fixtures for unpkg React/react-dom/
   @babel standalone from node_modules; a stale data/pools-snapshot* stub so the
   freshness gate falls back to the live fixture; a yields.llama.fi/pools fixture;
   IGNORABLE_ERROR_PATTERN; /opt/pw-browsers/chromium executable if present).

   Fixture = an ondo (RWA) + aave (Lending) pool on chain Base spanning two
   categories, plus one Ethereum pool so availableChains > 1 (the Chains dropdown
   only renders with more than one chain in the dataset). Load /?chain=Base.

   Implements all 10 acceptance assertions from spec 093 §Acceptance criteria.

   Run: node test_nav_rail_ia.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8802;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|icons\.llamao\.fi/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
// All TVL > $10M, non-zero apyBase, symbols carry a token segment (USDC).
// Two Base pools spanning RWA + Lending; one Ethereum pool so availableChains > 1.
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
  // Stale-stub the committed snapshot so the 15-min freshness gate falls back
  // to the live fixture rather than the committed snapshot.
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

// Set of visible .pool-card symbols.
function symbolSet(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim())
  );
}
async function waitForSymbols(page, expected) {
  await page.waitForFunction((exp) => {
    const syms = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim());
    return syms.length === exp.length && exp.every((s) => syms.includes(s));
  }, expected, { timeout: 15000 }).catch(() => {});
}
function assertSet(actual, expected, label) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length || !a.every((s, i) => s === e[i])) {
    throw new Error(`${label}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
  }
}
// Click the nav tab whose trimmed text exactly equals `label`.
async function clickTab(page, label) {
  await page.evaluate((lbl) => {
    const btn = Array.from(document.querySelectorAll('.app-nav-tab')).find(b => b.textContent.trim() === lbl);
    if (!btn) throw new Error('tab not found: ' + lbl);
    btn.click();
  }, label);
}

async function main() {
  console.log('\n=== rendered Playwright: nav-rail IA restructure (spec 093) ===');
  console.log('network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (fixture snapshot)');
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

    await page.goto(`http://localhost:${PORT}/?chain=Base`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await waitForSymbols(page, ['USDC-ONDO', 'USDC-AAVE']);

    // (1) Grouping renders: one .app-nav-primary, one .app-nav-secondary,
    //     a .app-nav-divider between them in DOM order.
    await test('grouping renders: primary → divider → secondary in DOM order', async () => {
      const r = await page.evaluate(() => {
        const tabs = document.querySelector('.app-nav-tabs');
        const primaries = tabs.querySelectorAll('.app-nav-primary');
        const secondaries = tabs.querySelectorAll('.app-nav-secondary');
        const dividers = tabs.querySelectorAll('.app-nav-divider');
        const kids = Array.from(tabs.children);
        const iP = kids.findIndex(el => el.classList.contains('app-nav-primary'));
        const iD = kids.findIndex(el => el.classList.contains('app-nav-divider'));
        const iS = kids.findIndex(el => el.classList.contains('app-nav-secondary'));
        return { p: primaries.length, s: secondaries.length, d: dividers.length, iP, iD, iS };
      });
      if (r.p !== 1) throw new Error('expected exactly 1 .app-nav-primary, got ' + r.p);
      if (r.s !== 1) throw new Error('expected exactly 1 .app-nav-secondary, got ' + r.s);
      if (r.d !== 1) throw new Error('expected exactly 1 .app-nav-divider, got ' + r.d);
      if (!(r.iP >= 0 && r.iD > r.iP && r.iS > r.iD))
        throw new Error(`expected DOM order primary(${r.iP}) < divider(${r.iD}) < secondary(${r.iS})`);
    });

    // (2) Primary rail holds only category tabs.
    await test('primary rail holds every .app-nav-tab and zero .app-filter-btn', async () => {
      const r = await page.evaluate(() => {
        const primary = document.querySelector('.app-nav-primary');
        const allTabs = Array.from(document.querySelectorAll('.app-nav-tab'));
        const tabsOutside = allTabs.filter(t => !primary.contains(t)).length;
        const filtersInside = primary.querySelectorAll('.app-filter-btn').length;
        return { totalTabs: allTabs.length, tabsOutside, filtersInside };
      });
      if (r.totalTabs < 1) throw new Error('expected category tabs to exist');
      if (r.tabsOutside !== 0) throw new Error(r.tabsOutside + ' .app-nav-tab(s) live outside .app-nav-primary');
      if (r.filtersInside !== 0) throw new Error(r.filtersInside + ' .app-filter-btn(s) live inside .app-nav-primary');
    });

    // (3) Secondary cluster holds only the four id'd filter buttons.
    await test('secondary cluster holds the 4 id\'d filters, IDs preserved', async () => {
      const r = await page.evaluate(() => {
        const secondary = document.querySelector('.app-nav-secondary');
        const ids = ['chains-btn', 'tvl-btn', 'protocols-btn', 'apy-btn'];
        const missing = ids.filter(id => !document.getElementById(id));
        const notInside = ids.filter(id => {
          const el = document.getElementById(id);
          return !el || !secondary.contains(el);
        });
        const notFilterBtn = ids.filter(id => {
          const el = document.getElementById(id);
          return !el || !el.classList.contains('app-filter-btn');
        });
        return { missing, notInside, notFilterBtn };
      });
      if (r.missing.length) throw new Error('missing filter IDs: ' + JSON.stringify(r.missing));
      if (r.notInside.length) throw new Error('filters not inside .app-nav-secondary: ' + JSON.stringify(r.notInside));
      if (r.notFilterBtn.length) throw new Error('filters missing .app-filter-btn class: ' + JSON.stringify(r.notFilterBtn));
    });

    // (4) Category tabs are text-only (no <svg>); every filter button keeps exactly one inline <svg>.
    await test('category tabs have NO <svg>; every filter button has exactly one <svg>', async () => {
      const r = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('.app-nav-tab'));
        const filters = Array.from(document.querySelectorAll('.app-filter-btn'));
        const tabsWithSvg = tabs.filter(t => t.querySelector('svg')).length;
        const filtersWrongSvg = filters.filter(f => f.querySelectorAll('svg').length !== 1).length;
        return { tabCount: tabs.length, tabsWithSvg, filterCount: filters.length, filtersWrongSvg };
      });
      if (r.tabCount < 1) throw new Error('expected category tabs to exist');
      if (r.tabsWithSvg !== 0) throw new Error(r.tabsWithSvg + ' category tab(s) still contain an <svg>');
      if (r.filterCount < 1) throw new Error('expected filter buttons to exist');
      if (r.filtersWrongSvg !== 0) throw new Error(r.filtersWrongSvg + ' filter button(s) do not have exactly one <svg>');
    });

    // (6) Dropdown still positions off its button (preserved IDs drive positioning).
    await test('clicking #chains-btn opens .global-filter-dropdown positioned off the button', async () => {
      await page.click('#chains-btn');
      await page.waitForSelector('.global-filter-dropdown', { timeout: 5000 });
      const r = await page.evaluate(() => {
        const dd = document.querySelector('.global-filter-dropdown');
        const btn = document.getElementById('chains-btn');
        return { ddLeft: dd.getBoundingClientRect().left, btnLeft: btn.getBoundingClientRect().left };
      });
      if (Math.abs(r.ddLeft - r.btnLeft) > 4)
        throw new Error(`dropdown left ${r.ddLeft} not within 4px of #chains-btn left ${r.btnLeft}`);
      // Close it again to avoid state bleed.
      await page.click('#chains-btn');
      await page.waitForTimeout(150);
    });

    // (5) Active state is unambiguous + wiring intact: click RWA -> only that tab
    //     .active, grid filters to the ondo pool.
    await test('clicking the RWA tab makes exactly that tab .active and filters the grid', async () => {
      await clickTab(page, 'RWA');
      await waitForSymbols(page, ['USDC-ONDO']);
      assertSet(await symbolSet(page), ['USDC-ONDO'], 'RWA-filtered grid');
      const r = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('.app-nav-tab'));
        const active = tabs.filter(t => t.classList.contains('active'));
        return { activeCount: active.length, activeText: active.map(t => t.textContent.trim()) };
      });
      if (r.activeCount !== 1) throw new Error('expected exactly 1 active tab, got ' + r.activeCount + ' ' + JSON.stringify(r.activeText));
      if (r.activeText[0] !== 'RWA') throw new Error('expected RWA to be the active tab, got ' + JSON.stringify(r.activeText));
    });

    // (8) Sticky-on-scroll holds: .app-header-sticky top is pinned near the
    //     viewport top and does NOT move when the results scroll (position:fixed).
    await test('.app-header-sticky stays pinned to the viewport top after scroll', async () => {
      const before = await page.evaluate(() =>
        document.querySelector('.app-header-sticky').getBoundingClientRect().top);
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(150);
      const after = await page.evaluate(() =>
        document.querySelector('.app-header-sticky').getBoundingClientRect().top);
      if (Math.abs(after) > 12)
        throw new Error('.app-header-sticky top is ' + after + ' after scroll, expected pinned near viewport top');
      if (Math.abs(after - before) > 1)
        throw new Error('.app-header-sticky moved on scroll (before=' + before + ', after=' + after + '); not fixed');
      await page.evaluate(() => window.scrollTo(0, 0));
    });

    // (9) 360px survives: primary rail, divider, and all four filters still in DOM.
    await test('primary + divider + 4 filters survive in DOM at 360x780', async () => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const ids = ['chains-btn', 'tvl-btn', 'protocols-btn', 'apy-btn'];
        return {
          primary: !!document.querySelector('.app-nav-primary'),
          divider: !!document.querySelector('.app-nav-divider'),
          filters: ids.filter(id => document.getElementById(id)).length
        };
      });
      if (!r.primary) throw new Error('.app-nav-primary missing at 360px');
      if (!r.divider) throw new Error('.app-nav-divider missing at 360px');
      if (r.filters !== 4) throw new Error('expected 4 filter buttons at 360px, got ' + r.filters);
    });

    // (7) Filter labels are translated (route through t(), not hardcoded English).
    //     NOTE: ?chain=Base sets selectedChain='Base' -> the Chains button shows
    //     'Base' (the selected chain), so the DEFAULT Chains label is only
    //     reachable when no chain is selected. Token mode (?token=USDC) leaves
    //     selectedChain empty, exposing the default Chains + Protocols labels.
    await test('KO default filter labels: Chains === 체인, Protocols === 프로토콜', async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`http://localhost:${PORT}/?token=USDC&lang=ko`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await page.waitForSelector('#chains-btn', { timeout: 5000 });
      const r = await page.evaluate(() => {
        const label = (id) => {
          const el = document.getElementById(id);
          const span = el && el.querySelector('.app-nav-label');
          return (span ? span.textContent : el ? el.textContent : '').trim();
        };
        return { chains: label('chains-btn'), protocols: label('protocols-btn') };
      });
      if (r.chains !== '체인') throw new Error('expected Chains label "체인" in KO, got ' + JSON.stringify(r.chains));
      if (r.protocols !== '프로토콜') throw new Error('expected Protocols label "프로토콜" in KO, got ' + JSON.stringify(r.protocols));
    });

    // (10) Zero non-ignorable page errors across the run.
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
  console.error('test_nav_rail_ia crashed: ' + err.message);
  process.exitCode = 1;
});
