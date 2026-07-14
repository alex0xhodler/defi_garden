/* Playwright acceptance gate for spec 070 (surface the honest "card doesn't
   exist yet" micro-disclaimer at the LIVE waitlist CTA): drives the REAL
   rendered plan.html bloom checkout panel and asserts the `ctaWaitlistMicro`
   string renders under the primary CTA on BOTH archetype layouts, in EN and
   KO, and that clicking the CTA still opens the waitlist modal.

   Rails under test (070):
   - `.gp-checkout-panel .gp-cta-microcopy` is visible and its text equals the
     EXACT en.planner.ctaWaitlistMicro string, on a subscription-archetype
     bloom URL AND on a growth-archetype bloom URL.
   - With &lang=ko the same node equals the EXACT ko.planner.ctaWaitlistMicro.
   - Clicking `.gp-checkout-cta` still opens `.gp-waitlist-backdrop` (no
     handler regression after the dead-ctaElement deletion).
   - Zero page errors (external-host fetch failures per CLAUDE.md exempt —
     they abort as network requests, not as uncaught exceptions).

   Canonical strings are pulled from translations.js at runtime (never
   hardcoded), same source-of-truth pattern as test_waitlist_pitch.js.
   Browser HTTPS to external hosts is connection-blocked in-sandbox, so the
   yields.llama.fi/pools request is intercepted and fulfilled with a fixture
   (same fixture-routing pattern as test_hero_copy.js / test_waitlist_pitch.js);
   plan.html loads React + the min bundles from local paths, so no unpkg route
   is needed.

   Run: node test_waitlist_microcopy.js */
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

// Canonical copy pulled straight from the source of truth so assertions are
// byte-exact against what the checkout panel must render.
const { translations: tr } = require('./translations.js');
const enMicro = tr.en.planner.ctaWaitlistMicro;
const koMicro = tr.ko.planner.ctaWaitlistMicro;

// Fixture pools: 3 stablecoin pools that clear the 'stable' curation rails (for
// the subscription/claude URL) + 1 ondo RWA pool that clears the 'rwa' rails
// (for the growth/retirement URL), so both bloom URLs compute a real plan.
const FIXTURE_POOLS = { status: 'success', data: [
  { pool: 'p1',   symbol: 'USDC', project: 'aave-v3',     chain: 'Ethereum', apyBase: 5,   apyReward: 0, tvlUsd: 800000000 },
  { pool: 'p2',   symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 6,   apyReward: 0, tvlUsd: 400000000 },
  { pool: 'p3',   symbol: 'DAI',  project: 'morpho-blue', chain: 'Ethereum', apyBase: 7,   apyReward: 0, tvlUsd: 250000000 },
  { pool: 'rwa1', symbol: 'USDC', project: 'ondo',        chain: 'Ethereum', apyBase: 8.5, apyReward: 0, tvlUsd: 60000000 }
] };

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

// Load a bloom URL with the pools route fulfilled by the fixture and every
// other non-local request aborted (fonts/analytics/favicons — connection
// blocked in-sandbox anyway). Waits until the checkout panel has rendered.
async function loadBloom(browser, query) {
  const context = await browser.newContext();
  const pageErrors = [];
  // Route the pools API first (first match wins in Playwright).
  // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically (a 200 keeps the browser console clean; a 404 would trip pageErrors guards).
  await context.route('**/data/pools-snapshot*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await context.route('**yields.llama.fi/pools**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE_POOLS)
  }));
  await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('yields.llama.fi'), route => route.abort());

  const page = await context.newPage();
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.goto(`http://localhost:${PORT}/plan.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.gp-checkout-panel', { timeout: 15000 });
  return { context, page, pageErrors };
}

// Read the micro-disclaimer node inside the checkout panel: assert it's visible
// and its trimmed text equals `expected`.
async function assertMicro(page, expected, label) {
  const micro = page.locator('.gp-checkout-panel .gp-cta-microcopy');
  await micro.waitFor({ state: 'visible', timeout: 8000 });
  if (!(await micro.isVisible())) throw new Error(label + ': micro-disclaimer not visible');
  const text = (await micro.textContent()).trim();
  if (text !== expected) throw new Error(label + ': text mismatch\n      expected: ' + expected + '\n      got:      ' + text);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // Guard: canonical strings must be non-empty, else every assertion is vacuous.
    await test('canonical ctaWaitlistMicro strings are present (source sanity)', async () => {
      if (!enMicro || !enMicro.length) throw new Error('en.planner.ctaWaitlistMicro missing');
      if (!koMicro || !koMicro.length) throw new Error('ko.planner.ctaWaitlistMicro missing');
    });

    // --- subscription-archetype bloom (goal=claude): EN micro-disclaimer ---
    await test('subscription bloom (goal=claude): .gp-checkout-panel .gp-cta-microcopy renders the EXACT EN string; no page errors', async () => {
      const { context, page, pageErrors } = await loadBloom(browser, 'goal=claude&pace=stable&fm=capital&capital=5000');
      await assertMicro(page, enMicro, 'subscription EN');
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- growth-archetype bloom (goal=retirement): EN micro-disclaimer ---
    await test('growth bloom (goal=retirement): .gp-checkout-panel .gp-cta-microcopy renders the EXACT EN string; no page errors', async () => {
      const { context, page, pageErrors } = await loadBloom(browser, 'goal=retirement&pace=rwa&capital=1000&fm=capital&years=5');
      await assertMicro(page, enMicro, 'growth EN');
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- KO run: subscription bloom with &lang=ko → exact KO string ---
    await test('subscription bloom &lang=ko: micro-disclaimer renders the EXACT KO string', async () => {
      const { context, page } = await loadBloom(browser, 'goal=claude&pace=stable&fm=capital&capital=5000&lang=ko');
      await assertMicro(page, koMicro, 'subscription KO');
      await context.close();
    });

    // --- KO run: growth bloom with &lang=ko → exact KO string ---
    await test('growth bloom &lang=ko: micro-disclaimer renders the EXACT KO string', async () => {
      const { context, page } = await loadBloom(browser, 'goal=retirement&pace=rwa&capital=1000&fm=capital&years=5&lang=ko');
      await assertMicro(page, koMicro, 'growth KO');
      await context.close();
    });

    // --- CTA still opens the waitlist modal (no handler regression) ---
    await test('clicking the checkout CTA still opens the waitlist modal', async () => {
      const { context, page } = await loadBloom(browser, 'goal=claude&pace=stable&fm=capital&capital=5000');
      await page.click('.gp-checkout-cta');
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      if (!(await page.locator('.gp-waitlist-backdrop').isVisible())) throw new Error('waitlist modal did not open on CTA click');
      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} waitlist-microcopy assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
