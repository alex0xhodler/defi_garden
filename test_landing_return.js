/* Playwright gate for spec 114: the "Welcome back" saved-garden re-entry card
   on the search-first landing. Drives the real static app in Chromium, seeding
   localStorage['garden-plan'] and reloading (does NOT drive the planner, and
   never leaves the landing route). One browser context, reused across scenarios
   via reload — keeps memory low in the sandbox's constrained cgroup.
   Run: node test_landing_return.js */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8795;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const FIXTURE_POOLS = [
  { pool: 'usdc-base-aave', project: 'aave-v3', symbol: 'USDC', chain: 'Base', tvlUsd: 45_000_000, apyBase: 4.2, apyReward: 0 }
];

// A realistic saved subscription plan (fields per planner.js savePlan()).
const SAVED_PLAN = {
  version: 3,
  goal: 'spotify',
  archetype: 'subscription',
  monthly: 0,
  years: 10,
  persona: 'safe',
  capital: 2900,
  effectiveApy: 5.1,
  blendedApy: 5.1,
  mix: ['spotify'],
  hero: { kind: 'foreverNumber', capital: 2900 },
  savedAt: '2026-07-15T12:00:00.000Z',
  pools: [{ pool: 'usdc-base-aave', symbol: 'USDC', project: 'aave-v3', chain: 'Base', apy: 4.2 }]
};

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

// Set localStorage on the current origin, then reload so landing.js re-reads it
// at mount. `plan` may be an object (JSON-stringified), a raw string (stored
// verbatim — the malformed case, opts.rawPlan), or null (key removed).
async function applyStateAndReload(page, opts) {
  await page.evaluate((o) => {
    try {
      if (o.plan === null) localStorage.removeItem('garden-plan');
      else if (o.rawPlan) localStorage.setItem('garden-plan', o.plan);
      else localStorage.setItem('garden-plan', JSON.stringify(o.plan));
      if (o.lang) localStorage.setItem('defi-garden-lang', o.lang);
      else localStorage.removeItem('defi-garden-lang');
      if (o.theme) localStorage.setItem('theme', o.theme);
      else localStorage.removeItem('theme');
    } catch (e) {}
  }, opts);
  await page.reload({ waitUntil: 'load', timeout: 20000 });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  let passed = 0;
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const loc = (msg.location() && msg.location().url) || '';
      // The blocked-host URL lives in msg.location(), not msg.text() (which is
      // just "Failed to load resource: net::ERR_CONNECTION_RESET"), so match both.
      if (IGNORABLE_ERROR_PATTERN.test(msg.text()) || IGNORABLE_ERROR_PATTERN.test(loc)) return;
      errors.push('console.error: ' + msg.text() + (loc ? ' @ ' + loc : ''));
    });
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: FIXTURE_POOLS })
    }));
    await page.route('https://api.llama.fi/protocols', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] })
    }));
    // Stub the non-essential external hosts (analytics lib + fonts) so the
    // sandbox's blocked HTTPS doesn't surface as ERR_CONNECTION_RESET console
    // errors. With mixpanel absent, Analytics.track() no-ops (same as non-prod).
    await page.route(/mp\.defi\.garden|cdn\.mxpnl\.com|fontshare\.com/, (route) => route.fulfill({
      status: 200, contentType: 'text/plain', body: ''
    }));

    // Land once so we are on-origin before touching localStorage.
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('#landing-root .landing-app', { timeout: 10000 });

    // 1. Valid saved plan -> re-entry card with goal label + plan.html link
    errors.length = 0;
    await applyStateAndReload(page, { plan: SAVED_PLAN, lang: 'en' });
    await page.waitForSelector('[data-testid="landing-return-card"]', { timeout: 10000 });
    {
      const cardText = await page.locator('[data-testid="landing-return-card"]').innerText();
      assert.ok(cardText.includes('Spotify'), 'return card should show the goal label');
      // Case-insensitive: the caption renders in the certificate plate-label
      // voice (CSS text-transform: uppercase), which innerText reflects.
      assert.ok(/welcome back/i.test(cardText), 'return card should show the welcome caption');
      assert.strictEqual(await page.locator('[data-testid="landing-return-cta"]').getAttribute('href'), 'plan.html');
      assert.strictEqual(await page.locator('.landing-garden-card h2:has-text("Have a goal in mind?")').count(), 0, 'generic prompt must yield to the return card');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    passed++; console.log('  ✓ valid saved plan renders the re-entry card');

    // 2. No saved plan -> generic card, no re-entry element
    errors.length = 0;
    await applyStateAndReload(page, { plan: null, lang: 'en' });
    await page.waitForSelector('.landing-garden-card', { timeout: 10000 });
    assert.strictEqual(await page.locator('[data-testid="landing-return-card"]').count(), 0);
    assert.ok((await page.locator('.landing-garden-card').innerText()).includes('Have a goal in mind?'), 'first-time visitor keeps the generic prompt');
    if (errors.length) throw new Error(errors.join('\n'));
    passed++; console.log('  ✓ no saved plan keeps the generic first-time card');

    // 3. Malformed plan -> generic card, no page error
    errors.length = 0;
    await applyStateAndReload(page, { plan: '{', rawPlan: true, lang: 'en' });
    await page.waitForSelector('.landing-garden-card', { timeout: 10000 });
    assert.strictEqual(await page.locator('[data-testid="landing-return-card"]').count(), 0);
    assert.ok((await page.locator('.landing-garden-card').innerText()).includes('Have a goal in mind?'));
    if (errors.length) throw new Error('malformed plan caused errors:\n' + errors.join('\n'));
    passed++; console.log('  ✓ malformed saved plan fails safe, no page error');

    // 4. KO renders localized strings, no raw keys
    errors.length = 0;
    await applyStateAndReload(page, { plan: SAVED_PLAN, lang: 'ko' });
    await page.waitForSelector('[data-testid="landing-return-card"]', { timeout: 10000 });
    {
      const cardText = await page.locator('[data-testid="landing-return-card"]').innerText();
      assert.ok(cardText.includes('다시 오셨네요'), 'KO welcome caption should render');
      assert.ok(cardText.includes('정원 돌보기'), 'KO CTA should render');
      assert.ok(!/returnCaption|returnCta|returnStatus/.test(cardText), 'no raw translation keys may leak');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    passed++; console.log('  ✓ KO renders localized re-entry strings');

    // 5. Dark mode + responsive widths: card visible, no horizontal body scroll
    for (const width of [360, 768, 1280]) {
      errors.length = 0;
      await page.setViewportSize({ width, height: 900 });
      await applyStateAndReload(page, { plan: SAVED_PLAN, lang: 'en', theme: 'dark' });
      await page.waitForSelector('[data-testid="landing-return-card"]', { timeout: 10000 });
      assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark', 'dark theme at ' + width);
      assert.ok(await page.locator('[data-testid="landing-return-card"]').isVisible(), 'card visible at ' + width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 2, 'no horizontal body scroll at ' + width + ' (overflow ' + overflow + ')');
      if (errors.length) throw new Error('errors at ' + width + ':\n' + errors.join('\n'));
    }
    passed++; console.log('  ✓ dark mode + 360/768/1280 render without horizontal scroll');

    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' landing-return assertions passed');
}

main().catch((err) => { console.error('landing-return test failed: ' + err.message); process.exitCode = 1; });
