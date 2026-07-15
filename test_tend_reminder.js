/* Playwright acceptance gate (spec 115): the honest "tend your garden" .ics
   calendar reminder — the missing hook-model trigger leg.
   Run: node test_tend_reminder.js

   Harness mirrors test_smoke.js: static server (home.html rewrite for "/"),
   sandboxed Chromium, the pools-fetch route stubs, and the ignorable-error
   classifier. Seeds localStorage['garden-plan'] to render report mode without
   driving the whole conversational flow, and drives a shared-plan URL to reach
   bloom. Captures the generated .ics by monkeypatching URL.createObjectURL. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8795;
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
// saved plan, capture the .ics payload, and neutralize the real download.
function initScript(seedPlan) {
  return `(${function (planJson) {
    try {
      if (planJson) window.localStorage.setItem('garden-plan', planJson);
    } catch (e) {}
    // Capture the generated .ics text; never trigger a real download dialog.
    var _create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      try { blob.text().then(function (txt) { window.__lastIcs = txt; }); } catch (e) {}
      return 'blob:captured';
    };
    URL.revokeObjectURL = function () {};
    try {
      HTMLAnchorElement.prototype.click = function () {};
    } catch (e) {}
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
    // 1. Report mode: control present + visible.
    await test('report mode: .gp-tend-reminder control present and visible', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html', true);
      await page.waitForSelector('.gp-tend-reminder', { timeout: 10000 });
      const visible = await page.isVisible('.gp-tend-reminder');
      await page.close();
      if (!visible) throw new Error('.gp-tend-reminder not visible');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
    });

    // 2. Click -> captured .ics has the right shape + ~30-day DTSTART + plan URL.
    await test('report mode: click generates valid recurring .ics ~30 days out with plan URL', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html', true);
      await page.waitForSelector('.gp-tend-reminder', { timeout: 10000 });
      await page.click('.gp-tend-reminder');
      await page.waitForFunction(() => !!window.__lastIcs, { timeout: 10000 });
      const ics = await page.evaluate(() => window.__lastIcs);
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (!/BEGIN:VEVENT/.test(ics)) throw new Error('missing BEGIN:VEVENT');
      if (!/RRULE:FREQ=MONTHLY/.test(ics)) throw new Error('missing RRULE:FREQ=MONTHLY');
      const m = ics.match(/DTSTART:(\d{8})T\d{6}Z/);
      if (!m) throw new Error('missing DTSTART line');
      const y = +m[1].slice(0, 4), mo = +m[1].slice(4, 6), d = +m[1].slice(6, 8);
      const startMs = Date.UTC(y, mo - 1, d);
      const days = (startMs - Date.now()) / 864e5;
      if (days < 28 || days > 32) throw new Error('DTSTART not ~30 days out: ' + days.toFixed(1) + ' days');
      const urlLine = ics.match(/URL:(\S+)/);
      if (!urlLine) throw new Error('missing URL line');
      if (!/goal=/.test(urlLine[1])) throw new Error('URL line missing goal= (expected encodePlanToUrl output): ' + urlLine[1]);
    });

    // 4. EN renders English text (not the raw key).
    await test('report mode: EN renders the English CTA text (no raw key leak)', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html?lang=en', true);
      await page.waitForSelector('.gp-tend-reminder', { timeout: 10000 });
      const txt = (await page.textContent('.gp-tend-reminder')).trim();
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (txt === 'tendReminderCta') throw new Error('raw key leaked');
      if (!/Remind me to tend/i.test(txt)) throw new Error('unexpected EN text: ' + txt);
    });

    // 4. KO renders Korean text (not the raw key).
    await test('report mode: KO renders localized CTA text (no raw key leak)', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html?lang=ko', true);
      await page.waitForSelector('.gp-tend-reminder', { timeout: 10000 });
      const txt = (await page.textContent('.gp-tend-reminder')).trim();
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (txt === 'tendReminderCta') throw new Error('raw key leaked');
      if (!/알림/.test(txt)) throw new Error('KO text not localized: ' + txt);
    });

    // 5. Bloom surface: shared-plan URL fast-forwards to bloom; control exists.
    await test('bloom surface: shared-plan URL exposes .gp-tend-reminder', async () => {
      const { page, errors } = await newPage(browser, VIEWPORTS[2], '/plan.html?goal=retirement&monthly=200&years=10&pace=stable', false);
      await page.waitForSelector('.gp-bloom', { timeout: 12000 });
      await page.waitForSelector('.gp-share-prompt .gp-tend-reminder', { timeout: 10000 });
      const visible = await page.isVisible('.gp-share-prompt .gp-tend-reminder');
      await page.close();
      if (!visible) throw new Error('.gp-tend-reminder not visible at bloom');
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
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
        await page.waitForSelector('.gp-tend-reminder', { timeout: 10000 });
        const visible = await page.isVisible('.gp-tend-reminder');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        await page.screenshot({ path: '/tmp/tend-reminder-' + vp.width + '.png' }).catch(() => {});
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
  console.log(passed + ' tend-reminder assertions passed');
}

main().catch((err) => {
  console.error('tend-reminder test crashed: ' + err.message);
  process.exitCode = 1;
});
