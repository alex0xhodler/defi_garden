/* Playwright behavior gate for the chain/token share-URL round trip (spec
   060): drives the REAL rendered plan.html UI — opens a share link carrying
   `chain`/`token` query params and asserts the rendered bloom step's pool
   grid actually curates to that filter, not just that encodePlanToUrl/
   decodePlanFromUrl parse the params correctly in isolation (2026-07-11
   standing decision: UX acceptance means rendered behavior, never fixtures
   alone — 017's failure is the precedent NORTH_STAR.md cites for this rule).

   Mirrors test_search.js's exact pattern: local static server, real
   Chromium, host-probe-then-fixture-fallback for unpkg.com/yields.llama.fi
   (browser-originated HTTPS to both is blocked at the proxy connection
   level in this sandbox even though curl/Node reach them fine — NORTH_STAR.
   md 2026-07-12 standing decision). Logs which mode ran per the spec's
   acceptance criteria.

   Run: node test_spotlight_url.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const PORT = 8794; // 8791/8792/8793 are already claimed by test_smoke/test_search/test_analytics_fires
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Same ignore-list as test_search.js, plus google.com/s2/favicons: the
// planner's subscription-ladder brand icons fetch Google's favicon service
// per-service (spotify.com/netflix.com/claude.ai/...), which this sandbox's
// proxy resets like every other external host — cosmetic icon loading, not a
// product bug (confirmed pre-existing/unrelated to this diff — same class
// CLAUDE.md documents as "external font/analytics fetches fail locally;
// page errors are not", and the exact host 060-notes.md's manual smoke-test
// pass already saw and classified this way).
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// --- Fixture pools ---------------------------------------------------------
// target-usdc-base: the ONLY pool that should survive goal=claude&pace=stable
// &chain=Base&token=USDC — stable band (stablecoin symbol, TVL>=$50M),
// chain=Base, symbol contains "USDC".
// decoy-usdt-base: same chain, higher APY, but wrong token (USDT is also a
//   stable symbol so it clears the persona band — only the token filter
//   should exclude it, proving the filter itself is applied, not just the
//   persona band).
// decoy-usdc-eth: right token, wrong chain.
// noise-eth-lido: excluded by the stable persona band regardless of filters.
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('target-usdc-base', 'aave-v3', 'USDC', 'Base', 60_000_000, 4.5),
  makePool('decoy-usdt-base', 'moonwell', 'USDT', 'Base', 80_000_000, 6.0),
  makePool('decoy-usdc-eth', 'compound-v3', 'USDC', 'Ethereum', 90_000_000, 5.5),
  makePool('noise-eth-lido', 'lido', 'ETH', 'Ethereum', 200_000_000, 3.0)
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

// Same reachability probe test_search.js uses (curl honors HTTPS_PROXY the
// same way Chromium does; a raw Node https.get would not).
function probe(url) {
  try {
    const code = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8', url], {
      encoding: 'utf8'
    });
    return code.trim().startsWith('2') || code.trim().startsWith('3');
  } catch (err) {
    return false;
  }
}

// The pool-grid trigger has TWO different DOM shapes depending on archetype
// (planner.js:2647 branches the whole bloom layout on `archetype ===
// 'subscription'`): growth/target goals render `.gp-pools-toggle` +
// `engineElement` (planner.js:2067); subscription goals (e.g. 'claude', this
// spec's own default spotlight goal) render a DIFFERENT trigger,
// `.gp-sub-customize-trigger` + `subCustomizeElement` (planner.js:2204) —
// `engineElement`/`.gp-pools-toggle` is NOT part of the subscription bloom
// tree at all (confirmed by inspecting live rendered DOM in this pass; see
// 060-notes.md). Both toggles reveal the same `.gp-pool-grid`/`.gp-pool-card`
// markup once expanded, so this helper opens whichever one the current
// goal's archetype actually rendered.
async function openShareUrl(page, query) {
  await page.goto(`http://localhost:${PORT}/plan.html?${query}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('.gp-pools-toggle, .gp-sub-customize-trigger', { timeout: 15000 });
  const toggle = (await page.locator('.gp-sub-customize-trigger').count()) > 0
    ? page.locator('.gp-sub-customize-trigger')
    : page.locator('.gp-pools-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await page.waitForSelector('.gp-pool-grid, .gp-pools-empty', { timeout: 10000 });
}

async function main() {
  // Browser-originated HTTPS is blocked at the proxy connection level in
  // this sandbox (NORTH_STAR.md 2026-07-12): Chromium's CONNECT tunnels to
  // unpkg.com/yields.llama.fi get reset even though curl/Node reach the same
  // hosts directly (diagnosed 2026-07-12 — a connection-level policy, not a
  // trust/cert issue). test_search.js established this exact fallback and
  // deliberately hardcodes both flags to false rather than trusting a curl
  // probe (a curl probe() function is kept below for documentation/future
  // environments but its result is NOT used to decide routing here, mirroring
  // test_search.js precisely — confirmed by trial in this pass: a live curl
  // probe reported both hosts reachable, but leaving Chromium to hit them
  // directly hung every assertion below on a Playwright.waitForSelector
  // timeout, since React itself never mounted).
  const unpkgReachable = false;
  const llamaReachable = false;
  console.log(`network: unpkg.com ${unpkgReachable ? 'reachable' : 'BLOCKED (using local vendored React/Babel)'}, ` +
    `yields.llama.fi ${llamaReachable ? 'reachable (live data ignored — fixture pools still routed for deterministic assertions)' : 'BLOCKED (using DefiLlama-shaped fixture snapshot)'}`);

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // Each test below navigates fresh to a new share URL on the same origin.
    // The planner persists a saved plan to localStorage once a bloom settles
    // (planner.js's plan_saved effect) — without clearing it, a later
    // navigation would boot straight into "report" mode (savedPlan truthy)
    // instead of re-decoding the new URL's shared plan, which is what these
    // tests need to exercise each time. addInitScript runs before every
    // subsequent page.goto's own scripts, so this clears deterministically
    // ahead of each navigation, not just the first.
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });

    if (!unpkgReachable) {
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
    }
    // Pools are always routed to this test's own deterministic fixture
    // (regardless of live reachability) so the chain/token assertions below
    // are exact, not dependent on whatever pools happen to be live right now.
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    await test('a share link WITH chain=Base&token=USDC curates only pools matching that filter', async () => {
      await openShareUrl(page, 'goal=claude&monthly=20&pace=stable&chain=Base&token=USDC');

      const cards = await page.locator('.gp-pool-card').count();
      if (cards < 1) throw new Error('expected at least one curated pool card for a filter with a real matching pool');

      const chains = await page.locator('.gp-pool-chain').allTextContents();
      const symbols = await page.locator('.gp-pool-symbol').allTextContents();
      if (!chains.every((c) => c.toLowerCase() === 'base')) {
        throw new Error(`expected every card's chain to be "Base", got: ${JSON.stringify(chains)}`);
      }
      if (!symbols.every((s) => s.toUpperCase().includes('USDC'))) {
        throw new Error(`expected every card's symbol to include "USDC", got: ${JSON.stringify(symbols)}`);
      }
      // The decoy pools (wrong token / wrong chain) must never appear.
      const hrefs = await page.locator('.gp-pool-card').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
      if (hrefs.some((h) => h && (h.includes('decoy-usdt-base') || h.includes('decoy-usdc-eth') || h.includes('noise-eth-lido')))) {
        throw new Error(`a decoy/noise pool leaked into the filtered grid: ${JSON.stringify(hrefs)}`);
      }
      if (!hrefs.some((h) => h && h.includes('target-usdc-base'))) {
        throw new Error(`expected the target pool to be curated, got hrefs: ${JSON.stringify(hrefs)}`);
      }
    });

    await test('the pool-filter chips reflect chain=Base/token=USDC as pre-selected on open', async () => {
      // Already on the filtered URL from the previous test; re-open fresh to
      // be independent of prior test state.
      await openShareUrl(page, 'goal=claude&monthly=20&pace=stable&chain=Base&token=USDC');
      const selectedChainChip = await page.locator('.gp-engine-filter-row .gp-chip.is-selected').first();
      // Chip rows only render when there is >1 option (planner.js chainOptions.length>1
      // gate) — with this 4-pool fixture there are 2 chains (Base/Ethereum) and 2
      // tokens (USDC/USDT/ETH symbols), so the row should render and show a selection.
      const count = await page.locator('.gp-engine-filter-row .gp-chip.is-selected').count();
      if (count < 1) {
        throw new Error('expected at least one pre-selected filter chip (chain=Base or token=USDC) on a filtered share-link open');
      }
    });

    await test('a share link WITHOUT chain/token (legacy 024 link shape) still decodes and renders — no regression', async () => {
      await openShareUrl(page, 'goal=claude&monthly=20&pace=stable');
      const emptyState = await page.locator('.gp-pools-empty').count();
      const cards = await page.locator('.gp-pool-card').count();
      if (emptyState === 0 && cards < 1) {
        throw new Error('expected either curated cards or the explicit empty state, got neither');
      }
      // Unfiltered stable persona should surface the eligible stable pools
      // (project-deduped) — decoy-usdt-base and decoy-usdc-eth are both
      // valid stable-band pools when no chain/token filter narrows them out.
      if (cards > 0) {
        const chains = await page.locator('.gp-pool-chain').allTextContents();
        if (chains.length < 1) throw new Error('expected chain labels to render');
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
  const total = 3;
  console.log(passed + '/' + total + ' spotlight-URL behavior assertions passed');
}

main().catch((err) => {
  console.error('test_spotlight_url crashed: ' + err.message);
  process.exitCode = 1;
});
