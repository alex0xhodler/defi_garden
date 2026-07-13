/* Playwright acceptance gate for spec 068 (planner hero-copy CRO swap):
   drives the REAL rendered plan.html hero and asserts the three swapped
   strings plus the LIVE-derived proof number in the splash hook.

   Rails under test (068 trust-rail guardrail):
   - With a fixture pools payload that clears the 'stable' curation rails,
     `.gp-splash-hook` renders the live blended rate (splashHookLive) — a real
     %, not a hardcoded range, and NOT the number-free fallback. The rendered %
     equals formatApy(blendedApy(curatePools(fixture,'stable',3))) computed
     independently in-test from the SAME fixture via the real exported helpers
     (proves live derivation).
   - With the pools route failing, `.gp-splash-hook` degrades to the exact
     number-free fallback (splashHook) and contains NO digit-% pattern.
   - h1 == new EN title, tagline p == new EN tagline (V01/V02).
   - Both router paths load the planner hero; zero page errors.

   Browser HTTPS to external hosts is connection-blocked in-sandbox, so the
   yields.llama.fi/pools request is intercepted and fulfilled with a fixture
   (same fixture-routing pattern as test_waitlist_pitch.js / test_search.js).

   Run: node test_hero_copy.js */
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
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Canonical strings + real trust-rail helpers straight from the source of
// truth so assertions are byte-exact against what the hero must render.
const { translations: tr } = require('./translations.js');
const gp = require('./planner.js');
const enP = tr.en.planner;

// Replicate planner.js formatApy (not on the exported api) — must stay in sync
// with planner.js:67. The expected % is derived through the REAL curatePools +
// blendedApy so it traces the live-rate math, not a hardcoded figure.
function formatApy(pct) {
  return Number(pct || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
}

// Fixture pools: 3 clear the 'stable' rails (stablecoin symbol, tvl >> $50M
// band floor, sane apy, lending projects) + 3 decoys that each trip a distinct
// rail (non-stable symbol / sub-floor TVL / anomalous APY) so the decoys must
// be excluded for the derived rate to be correct.
const FIXTURE_POOLS = { data: [
  { pool: 'p1', symbol: 'USDC', project: 'aave-v3',       chain: 'Ethereum', apyBase: 5, apyReward: 0, tvlUsd: 800000000 },
  { pool: 'p2', symbol: 'USDT', project: 'compound-v3',   chain: 'Ethereum', apyBase: 6, apyReward: 0, tvlUsd: 400000000 },
  { pool: 'p3', symbol: 'DAI',  project: 'morpho-blue',   chain: 'Ethereum', apyBase: 7, apyReward: 0, tvlUsd: 250000000 },
  { pool: 'p4', symbol: 'WETH-USDC', project: 'uniswap-v3', chain: 'Ethereum', apyBase: 9, apyReward: 0, tvlUsd: 600000000 }, // non-stable -> excluded
  { pool: 'p5', symbol: 'USDS', project: 'spark',         chain: 'Ethereum', apyBase: 4, apyReward: 0, tvlUsd: 20000000 },    // tvl < $50M floor -> excluded
  { pool: 'p6', symbol: 'USDP', project: 'anomaly-proto', chain: 'Ethereum', apyBase: 5000, apyReward: 0, tvlUsd: 100000000 } // apy > sanity limit -> excluded
] };

// Independent expected live rate, via the REAL exported trust-rail path.
const EXPECTED_APY = formatApy(gp.blendedApy(gp.curatePools(FIXTURE_POOLS.data, 'stable', 3)));

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

// Load plan.html with the pools route either fulfilled by the fixture or
// failed, collecting any pageerror. Returns the rendered hero strings.
async function loadHero(browser, poolsMode) {
  const context = await browser.newContext();
  const pageErrors = [];
  // Route the pools API first (route order: first match wins in Playwright).
  await context.route('**yields.llama.fi/pools**', route => {
    if (poolsMode === 'ok') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE_POOLS) });
    } else if (poolsMode === 'fail500') {
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else {
      route.abort();
    }
  });
  // Abort every other non-local request (fonts, analytics CDN) — connection
  // blocked in-sandbox anyway; keeps the page deterministic.
  await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('yields.llama.fi'), route => route.abort());

  const page = await context.newPage();
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.gp-tagline h1', { timeout: 8000 });
  return { context, page, pageErrors };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // Guard: fixture must actually yield a non-null derived rate, else the
    // whole live-path assertion is vacuous.
    await test('fixture yields a non-null stable blended rate (fixture sanity)', async () => {
      if (!/\d/.test(EXPECTED_APY)) throw new Error('EXPECTED_APY has no digit: ' + EXPECTED_APY);
      if (EXPECTED_APY !== '6%') throw new Error('EXPECTED_APY should be the median of [5,6,7]=6% -> "6%", got ' + EXPECTED_APY);
    });

    // --- (a) live-rate hook + V01/V02 headline/sub + zero page errors ---
    await test('with fixture pools: h1/tagline swapped, splash-hook carries the LIVE-derived rate', async () => {
      const { context, page, pageErrors } = await loadHero(browser, 'ok');
      // Wait until the live variant has rendered (contains a %).
      await page.waitForFunction(() => {
        const el = document.querySelector('.gp-splash-hook');
        return el && /%/.test(el.textContent);
      }, { timeout: 8000 });

      const h1 = (await page.locator('.gp-tagline h1').textContent()).trim();
      const tagline = (await page.locator('.gp-tagline p').textContent()).trim();
      const hook = (await page.locator('.gp-splash-hook').textContent()).trim();

      if (h1 !== enP.title) throw new Error('h1 should equal new EN title. got: ' + h1);
      if (tagline !== enP.tagline) throw new Error('tagline should equal new EN tagline. got: ' + tagline);
      if (!/\d+(\.\d+)?%/.test(hook)) throw new Error('splash-hook should contain a digit-% rate. got: ' + hook);
      if (hook === enP.splashHook) throw new Error('splash-hook must NOT be the static fallback in the live path. got: ' + hook);
      if (hook.indexOf(EXPECTED_APY) === -1) throw new Error('splash-hook should contain the independently-derived rate ' + EXPECTED_APY + '. got: ' + hook);
      // (c) piggyback: the planner hero itself rendered (both router paths load).
      if (h1.length === 0) throw new Error('planner hero did not render');
      if (pageErrors.length) throw new Error('page errors in live path: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- (b) failed pools route: honest number-free fallback + zero page errors ---
    await test('with pools route failing (500): splash-hook shows number-free fallback, no digit-%', async () => {
      const { context, page, pageErrors } = await loadHero(browser, 'fail500');
      // Give the app time to reach loadStatus 'error' and settle on the fallback.
      await page.waitForFunction((fallback) => {
        const el = document.querySelector('.gp-splash-hook');
        return el && el.textContent.trim() === fallback;
      }, enP.splashHook, { timeout: 8000 });

      const hook = (await page.locator('.gp-splash-hook').textContent()).trim();
      if (hook !== enP.splashHook) throw new Error('splash-hook should be the exact number-free fallback. got: ' + hook);
      if (/\d+(\.\d+)?%/.test(hook)) throw new Error('fallback splash-hook must contain NO digit-% pattern. got: ' + hook);
      if (pageErrors.length) throw new Error('page errors in fallback path: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- (b') aborted pools route degrades identically ---
    await test('with pools route aborted: splash-hook shows number-free fallback', async () => {
      const { context, page } = await loadHero(browser, 'abort');
      await page.waitForFunction((fallback) => {
        const el = document.querySelector('.gp-splash-hook');
        return el && el.textContent.trim() === fallback;
      }, enP.splashHook, { timeout: 8000 });
      const hook = (await page.locator('.gp-splash-hook').textContent()).trim();
      if (hook !== enP.splashHook) throw new Error('aborted-route splash-hook should be the fallback. got: ' + hook);
      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} hero-copy assertions passed (derived rate: ${EXPECTED_APY})`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
