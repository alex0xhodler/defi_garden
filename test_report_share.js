/* Playwright acceptance gate (spec 116): the "Share my garden" report-mode
   copy-link CTA — the direct viral-loop closure at the return-visit high-intent
   moment.
   Run: node test_report_share.js

   Harness mirrors test_tend_reminder.js: static server (home.html rewrite for
   "/"), sandboxed Chromium, the pools-fetch route stubs, and the ignorable-error
   classifier. Seeds localStorage['garden-plan'] to render report mode without
   driving the whole conversational flow. Captures the copied link by
   monkeypatching navigator.clipboard.writeText. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8796;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;

const POOLS_URL = 'https://yields.llama.fi/pools';

function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9),
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 4.8),
  makePool('usdc-sol-kamino', 'kamino-lend', 'USDC', 'Solana', 80_000_000, 7.5),
  makePool('eth-eth-aave', 'aave-v3', 'ETH', 'Ethereum', 200_000_000, 2.9)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// PLAN_VERSION is 3 in planner.js (asserted below so a bump breaks the test loudly).
const PLAN_VERSION = 3;
const SAVED_PLAN = {
  version: PLAN_VERSION,
  goal: 'retirement',
  monthly: 200,
  years: 10,
  persona: 'stable',
  temperament: 'cautious',
  pools: [{ pool: 'usdc-eth-morpho', symbol: 'USDC', project: 'morpho-blue', chain: 'Ethereum', apy: 5.9 }],
  blendedApy: 5.9,
  effectiveApy: 5.9,
  projection: 35000,
  fundingMode: 'monthly',
  capital: null,
  deadline: null,
  archetype: 'growth',
  target: null,
  savedAt: new Date(Date.now() - 40 * 864e5).toISOString(),
  poolFilters: null,
  mix: null
};

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 }
];

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

// Init script (runs before page scripts in every frame): optionally seed the
// saved plan and monkeypatch the clipboard so the copied URL is captured without
// any real system-clipboard access.
function initScript(seedPlan) {
  return `(${function (planJson) {
    try {
      if (planJson) window.localStorage.setItem('garden-plan', planJson);
    } catch (e) {}
    // Capture the copied link; never touch the real clipboard.
    navigator.clipboard = navigator.clipboard || {};
    navigator.clipboard.writeText = function (txt) { window.__copied = txt; return Promise.resolve(); };
  }.toString()})(${JSON.stringify(seedPlan ? JSON.stringify(SAVED_PLAN) : null)})`;
}

async function newPage(browser, viewport, urlPath, seedPlan) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  await page.addInitScript(initScript(seedPlan));
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
  await page.goto('http://localhost:' + PORT + urlPath, { waitUntil: 'load', timeout: 15000 });
  return { page, errors };
}

async function main() {
  // Guard: PLAN_VERSION must match planner.js, else report mode wouldn't render.
  const plannerSrc = fs.readFileSync(path.join(ROOT, 'planner.js'), 'utf8');
  const pv = plannerSrc.match(/var PLAN_VERSION\s*=\s*(\d+)/);
  if (!pv || Number(pv[1]) !== PLAN_VERSION) {
    console.error('PLAN_VERSION mismatch: planner.js=' + (pv && pv[1]) + ' test=' + PLAN_VERSION);
    process.exitCode = 1;
    return;
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // 1. Report mode: share control present + visible.
    await test('report mode: .gp-report-share-link control present and visible', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html', true);
      await page.waitForSelector('.gp-report-share-link', { timeout: 10000 });
      const visible = await page.isVisible('.gp-report-share-link');
      await page.close();
      if (!visible) throw new Error('.gp-report-share-link not visible');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
    });

    // 2 + 3. Click -> clipboard receives encodePlanToUrl output (contains goal=),
    // no network call to the yields host fires, and the button switches to the
    // copied confirmation.
    await test('report mode: click copies plan URL (goal=), no yields fetch, shows Copied!', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html?lang=en', true);
      await page.waitForSelector('.gp-report-share-link', { timeout: 10000 });
      let yieldsHit = false;
      page.on('request', (req) => { if (/yields\.llama\.fi/.test(req.url())) yieldsHit = true; });
      await page.evaluate(() => { window.__copied = undefined; });
      await page.click('.gp-report-share-link');
      await page.waitForFunction(() => typeof window.__copied === 'string', { timeout: 10000 });
      const copied = await page.evaluate(() => window.__copied);
      // confirmation text after click
      await page.waitForFunction(() => {
        const b = document.querySelector('.gp-report-share-link');
        return b && /Copied/i.test(b.textContent);
      }, { timeout: 5000 });
      const btnText = (await page.textContent('.gp-report-share-link')).trim();
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (typeof copied !== 'string') throw new Error('clipboard not populated');
      if (!/goal=/.test(copied)) throw new Error('copied URL missing goal= (expected encodePlanToUrl output): ' + copied);
      if (yieldsHit) throw new Error('unexpected network call to yields host fired on click');
      if (btnText !== 'Copied!') throw new Error('confirmation text not shown, got: ' + btnText);
    });

    // 2b. Instrumentation: the emitted share_link_created payload actually carries
    // surface:'report' + method:'copy'. Guards against analytics.js silently
    // dropping the surface dimension the measurement plan depends on (verifier
    // catch, item 116 attempt 1).
    await test('report mode: share_link_created payload carries surface=report + method=copy', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html?lang=en', true);
      await page.waitForSelector('.gp-report-share-link', { timeout: 10000 });
      // `Analytics` is a top-level `const` (bare global, NOT a window property —
      // item 044's lesson); the planner guard is `typeof Analytics`, so patch the
      // bare binding, not window.Analytics.
      await page.waitForFunction(() => typeof Analytics !== 'undefined' && typeof Analytics.track === 'function', { timeout: 10000 });
      await page.evaluate(() => {
        window.__trackedShare = null;
        Analytics.track = function (name, props) {
          if (name === 'share_link_created') window.__trackedShare = props;
        };
      });
      await page.click('.gp-report-share-link');
      await page.waitForFunction(() => window.__trackedShare != null, { timeout: 10000 });
      const payload = await page.evaluate(() => window.__trackedShare);
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (!payload) throw new Error('share_link_created never emitted');
      if (payload.surface !== 'report') throw new Error("payload.surface !== 'report' (got: " + JSON.stringify(payload.surface) + ') — analytics.js dropped the surface dimension');
      if (payload.method !== 'copy') throw new Error("payload.method !== 'copy' (got: " + JSON.stringify(payload.method) + ')');
    });

    // 4. EN renders English CTA (not the raw key), matches /Share my garden/i pre-click.
    await test('report mode: EN renders the English CTA text (no raw key leak)', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html?lang=en', true);
      await page.waitForSelector('.gp-report-share-link', { timeout: 10000 });
      const txt = (await page.textContent('.gp-report-share-link')).trim();
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (txt === 'reportShareCta') throw new Error('raw key leaked');
      if (!/Share my garden/i.test(txt)) throw new Error('unexpected EN text: ' + txt);
    });

    // 5. KO renders localized CTA (not the raw key).
    await test('report mode: KO renders localized CTA text (no raw key leak)', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html?lang=ko', true);
      await page.waitForSelector('.gp-report-share-link', { timeout: 10000 });
      const txt = (await page.textContent('.gp-report-share-link')).trim();
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (txt === 'reportShareCta') throw new Error('raw key leaked');
      if (!/(공유|정원)/.test(txt)) throw new Error('KO text not localized: ' + txt);
    });

    // 6. Dark + responsive: control visible, no horizontal body scroll.
    for (const vp of VIEWPORTS) {
      await test('dark ' + vp.width + 'px: control visible, no horizontal body scroll', async () => {
        const page = await browser.newPage({ viewport: vp, colorScheme: 'dark' });
        const errors = [];
        page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const source = msg.location()?.url || '';
          if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
            errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
          }
        });
        await page.addInitScript(`(function(){ try { window.localStorage.setItem('theme','dark'); window.localStorage.setItem('garden-plan', ${JSON.stringify(JSON.stringify(SAVED_PLAN))}); } catch(e){} })()`);
        await page.route('https://icons.llamao.fi/**', (route) => route.abort());
        await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
        await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
        await page.goto('http://localhost:' + PORT + '/plan.html', { waitUntil: 'load', timeout: 15000 });
        await page.waitForSelector('.gp-report-share-link', { timeout: 10000 });
        const visible = await page.isVisible('.gp-report-share-link');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        await page.screenshot({ path: '/tmp/report-share-' + vp.width + '.png' }).catch(() => {});
        await page.close();
        if (!visible) throw new Error('control not visible');
        if (overflow) throw new Error('horizontal body scroll present');
        if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      });
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' report-share assertions passed');
}

main().catch((err) => {
  console.error('report-share test crashed: ' + err.message);
  process.exitCode = 1;
});
