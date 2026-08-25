/* Filter-dropdown open-state polish gate for spec 111. Drives the REAL analytics
   UI (home.html) and verifies part B of the spec:
     B1. Opening a filter dropdown renders a .global-filter-scrim.
     B2. The selected .filter-chip.active reads as filled-primary (white text,
         a background distinct from a non-active chip, non-transparent).
     B3. Hovering a non-active chip lifts (translate) with NO scale (m11 === 1).
     B4. Clicking the scrim closes the dropdown.
     B5. Open → scrim → close runs clean at 360/768/1280 widths and in dark mode,
         with a dark-tinted scrim (alpha > 0).
   Harness scaffolding copied verbatim from test_nav_rail_ia.js (local static
   server; page.route fixtures for unpkg React/react-dom/@babel from node_modules;
   stale snapshot stub; yields.llama.fi fixture; IGNORABLE_ERROR_PATTERN incl.
   icons.llamao.fi; chromium at /opt/pw-browsers/chromium if present).

   Load /?token=USDC so the TVL/APY dropdowns are reachable and no chain is
   preselected.

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
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
}

// Open the TVL dropdown (idempotent: closes any open dropdown first).
async function openTvl(page) {
  // Close whatever is open so we start clean.
  await page.evaluate(() => {
    const scrim = document.querySelector('.global-filter-scrim');
    if (scrim) scrim.click();
  });
  await page.waitForTimeout(150);
  const isVis = await page.evaluate(() => {
    const btn = document.getElementById('tvl-btn');
    if (!btn) return false;
    const style = window.getComputedStyle(btn);
    return style.display !== 'none' && style.visibility !== 'hidden' && btn.offsetWidth > 0;
  });
  if (isVis) {
    await page.click('#tvl-btn');
  } else {
    await page.evaluate(() => {
      const btn = document.getElementById('tvl-btn');
      if (btn) btn.click();
    });
  }
  await page.waitForSelector('.global-filter-dropdown', { timeout: 5000 });
  await page.waitForTimeout(120);
}

async function main() {
  console.log('\n=== rendered Playwright: filter-dropdown open-state polish (spec 111) ===');
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

    await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await page.waitForSelector('#tvl-btn', { timeout: 5000 });
    // style.min.css is perf-deferred (media="print" → onload this.media='all'); prod
    // browsers fire that swap near-instantly, but headless chromium lazy-loads print
    // sheets so the swap can lag arbitrarily in-sandbox. Do exactly what the prod
    // onload handler does, then wait for the neuro tokens (--color-primary, scrim
    // tint) to actually resolve before asserting computed styles.
    await page.evaluate(() => {
      document.querySelectorAll('link[rel="stylesheet"][media="print"]').forEach((l) => { l.media = 'all'; });
    });
    await page.waitForFunction(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() !== '',
      null, { timeout: 15000 });

    // B1: opening a dropdown renders the scrim.
    await test('B1: opening #tvl-btn renders a .global-filter-scrim', async () => {
      await openTvl(page);
      const hasScrim = await page.evaluate(() => !!document.querySelector('.global-filter-scrim'));
      if (!hasScrim) throw new Error('.global-filter-scrim not present after opening #tvl-btn');
    });

    // B2: selected chip reads as filled-primary — white text, a background that
    //     differs from a non-active chip and is not transparent.
    await test('B2: selected $10M+ chip is filled-primary (white text, distinct non-transparent bg)', async () => {
      await openTvl(page);
      // Click the chip whose trimmed text is exactly "$10M+".
      await page.evaluate(() => {
        const chip = Array.from(document.querySelectorAll('.global-filter-dropdown .filter-chip'))
          .find(c => c.textContent.trim() === '$10M+');
        if (!chip) throw new Error('no $10M+ chip');
        chip.click();
      });
      await page.waitForTimeout(150);
      // Selecting closes the dropdown; reopen to inspect the active chip.
      await openTvl(page);
      const r = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('.global-filter-dropdown .filter-chip'));
        const active = chips.find(c => c.classList.contains('active'));
        const nonActive = chips.find(c => !c.classList.contains('active'));
        if (!active) return { err: 'no active chip' };
        if (!nonActive) return { err: 'no non-active chip' };
        const cs = getComputedStyle(active);
        const csN = getComputedStyle(nonActive);
        // Resolve the design system's on-accent ink to a computed rgb() via a
        // probe span — the 247 world's filled-primary chip uses
        // var(--ui-on-accent) (not literal white in every scheme).
        const probe = document.createElement('span');
        probe.style.color = 'var(--ui-on-accent)';
        document.body.appendChild(probe);
        const onAccent = getComputedStyle(probe).color;
        probe.remove();
        return {
          activeBg: cs.backgroundColor,
          nonActiveBg: csN.backgroundColor,
          activeColor: cs.color,
          onAccent,
          activeText: active.textContent.trim()
        };
      });
      if (r.err) throw new Error(r.err);
      if (r.activeText !== '$10M+') throw new Error('active chip text is ' + JSON.stringify(r.activeText) + ', expected "$10M+"');
      if (r.activeBg === 'rgba(0, 0, 0, 0)' || r.activeBg === 'transparent')
        throw new Error('active chip background is transparent: ' + r.activeBg);
      if (r.activeBg === r.nonActiveBg)
        throw new Error('active chip background (' + r.activeBg + ') does not differ from non-active (' + r.nonActiveBg + ')');
      if (r.activeColor !== r.onAccent)
        throw new Error('active chip color is ' + r.activeColor + ', expected on-accent ink ' + r.onAccent);
    });

    // B3: hovering a non-active chip lifts (translate) but does NOT scale.
    await test('B3: hovering a non-active chip has no scale in its transform (m11 === 1)', async () => {
      await openTvl(page);
      // Hover the "$1M+" chip (non-active while minTvl=$10M).
      const handle = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.global-filter-dropdown .filter-chip'))
          .find(c => c.textContent.trim() === '$1M+') || null;
      });
      const el = handle.asElement();
      if (!el) throw new Error('no $1M+ chip to hover');
      await el.hover();
      await page.waitForTimeout(250);
      const transform = await el.evaluate((node) => getComputedStyle(node).transform);
      if (transform && transform !== 'none') {
        const m = transform.match(/matrix\(([^)]+)\)/);
        if (!m) throw new Error('unexpected transform format: ' + transform);
        const parts = m[1].split(',').map(s => parseFloat(s.trim()));
        const m11 = parts[0];
        if (Math.abs(m11 - 1) > 0.001)
          throw new Error('hover transform has a scale (m11=' + m11 + '): ' + transform);
      }
    });

    // B4: clicking the scrim closes the dropdown.
    await test('B4: clicking the .global-filter-scrim closes the dropdown', async () => {
      await openTvl(page);
      await page.evaluate(() => {
        const scrim = document.querySelector('.global-filter-scrim');
        if (!scrim) throw new Error('no scrim to click');
        scrim.click();
      });
      await page.waitForTimeout(200);
      const stillOpen = await page.evaluate(() => !!document.querySelector('.global-filter-dropdown'));
      if (stillOpen) throw new Error('.global-filter-dropdown still present after clicking scrim');
    });

    // B5: open → scrim present → close runs clean at each viewport, then dark mode.
    await test('B5: open/scrim/close survives 360/768/1280 widths', async () => {
      const viewports = [{ w: 360, h: 780 }, { w: 768, h: 1024 }, { w: 1280, h: 900 }];
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(150);
        await openTvl(page);
        const hasScrim = await page.evaluate(() => !!document.querySelector('.global-filter-scrim'));
        if (!hasScrim) throw new Error('scrim missing at ' + vp.w + 'px');
        await page.evaluate(() => document.querySelector('.global-filter-scrim').click());
        await page.waitForTimeout(200);
        const stillOpen = await page.evaluate(() => !!document.querySelector('.global-filter-dropdown'));
        if (stillOpen) throw new Error('dropdown did not close at ' + vp.w + 'px');
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    await test('B5: dark-mode scrim renders with a dark tint (alpha > 0)', async () => {
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.waitForTimeout(150);
      await openTvl(page);
      const r = await page.evaluate(() => {
        const scrim = document.querySelector('.global-filter-scrim');
        if (!scrim) return { err: 'no scrim in dark mode' };
        const bg = getComputedStyle(scrim).backgroundColor;
        // Parse rgb/rgba → alpha (defaults to 1 for rgb()).
        const m = bg.match(/rgba?\(([^)]+)\)/);
        let alpha = 1;
        if (m) {
          const parts = m[1].split(',').map(s => parseFloat(s.trim()));
          if (parts.length === 4) alpha = parts[3];
        }
        return { bg, alpha };
      });
      if (r.err) throw new Error(r.err);
      if (!(r.alpha > 0)) throw new Error('dark-mode scrim background has no visible tint: ' + r.bg);
      // Clean up: close + restore light mode.
      await page.evaluate(() => {
        const scrim = document.querySelector('.global-filter-scrim');
        if (scrim) scrim.click();
        document.documentElement.removeAttribute('data-theme');
      });
      await page.waitForTimeout(150);
    });

    // Final: zero non-ignorable page errors across the run.
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
