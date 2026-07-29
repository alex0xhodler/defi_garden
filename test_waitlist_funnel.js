/* Playwright behavior gate for spec 063 (waitlist funnel drop-off
   instrumentation): drives the REAL rendered plan.html quick-waitlist UI
   (?waitlist=1&src=seo_token, same entry point 062/test_waitlist_seo_entry.js
   uses) and asserts the three new intermediate events actually fire on the
   right transitions, and that 009's waitlist_submitted is unchanged.

   Same fixture-routing pattern as test_waitlist_seo_entry.js: local static
   server, all non-local requests aborted except a mocked formspree endpoint
   so success/network-error/non-ok paths can be driven deterministically.

   Spec 096's production-host gate (analytics.js:96, PRODUCTION_HOSTS at :14)
   makes `Analytics.track()` return before ever calling `mixpanel.track()`
   when `location.hostname` is localhost, which is where this file's server
   runs — so without help `trackedEvents()`'s stub-queue read below is
   structurally always empty, independent of whether the product fires the
   events correctly. `neutralizeHostGate()` overrides
   `Analytics.isProductionHost()` to `true` via `addInitScript` (same
   poll-and-patch shape as test_analytics_host_gate_render.js:74-89, and
   identical to test_waitlist_seo_entry.js's copy) so real track() calls
   travel the normal path into the stub queue and `trackedEvents()` regains
   its original end-to-end meaning. Each test case below opens its own
   context, so the override is installed in every one of them.

   Run: node test_waitlist_funnel.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8797; // 8791-8796 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

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

async function trackedEvents(page) {
  return page.evaluate(() => (window.mixpanel || []).filter(c => Array.isArray(c) && c[0] === 'track'));
}

// See file-header note: neutralizes spec 096's production-host gate so
// Analytics.track() actually reaches mixpanel.track() (and this file's
// stub-queue reads) even though these pages are served from localhost.
async function neutralizeHostGate(target) {
  await target.addInitScript(() => {
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.isProductionHost) { setTimeout(install, 0); return; }
      Analytics.isProductionHost = () => true;
    };
    install();
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- Case A: formspree succeeds ---
    await test('first email keystroke -> waitlist_email_entered fires once; submit -> waitlist_submit_attempt then waitlist_submitted(success=true); no waitlist_error', async () => {
      const context = await browser.newContext();
      await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('formspree.io'), route => route.abort());
      await context.route('**formspree.io/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await neutralizeHostGate(context);
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1&src=seo_token`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });

      const emailInput = page.locator('.gp-waitlist-email-input');
      await emailInput.pressSequentially('g'); // first keystroke -> email_entered
      await emailInput.fill('grower@example.com'); // further edits must NOT double-fire email_entered
      await page.click('.gp-waitlist-submit');
      await page.waitForSelector('.gp-waitlist-next-steps', { timeout: 5000 }); // step-2 confirms submit resolved

      const calls = await trackedEvents(page);
      const names = calls.map(c => c[1]);
      const enteredCount = names.filter(n => n === 'waitlist_email_entered').length;
      if (enteredCount !== 1) throw new Error('expected exactly 1 waitlist_email_entered, got ' + enteredCount);
      if (!names.includes('waitlist_submit_attempt')) throw new Error('waitlist_submit_attempt did not fire');
      if (names.includes('waitlist_error')) throw new Error('waitlist_error fired on a success path');
      const submitted = calls.find(c => c[1] === 'waitlist_submitted');
      if (!submitted || submitted[2].success !== true) throw new Error('waitlist_submitted(success=true) did not fire as expected');

      // Order check: opened -> email_entered -> submit_attempt -> submitted
      const order = ['waitlist_opened', 'waitlist_email_entered', 'waitlist_submit_attempt', 'waitlist_submitted'];
      const positions = order.map(n => names.indexOf(n));
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] <= positions[i - 1]) throw new Error('event order violated: ' + JSON.stringify(names));
      }
      await context.close();
    });

    // --- Case B: formspree responds non-OK ---
    await test('formspree 500 response -> waitlist_error(reason=formspree_error) + waitlist_submitted(success=false)', async () => {
      const context = await browser.newContext();
      await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('formspree.io'), route => route.abort());
      await context.route('**formspree.io/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
      await neutralizeHostGate(context);
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1&src=seo_token`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      await page.locator('.gp-waitlist-email-input').fill('grower@example.com');
      await page.click('.gp-waitlist-submit');
      await page.waitForSelector('.gp-waitlist-error', { timeout: 5000 });

      const calls = await trackedEvents(page);
      const err = calls.find(c => c[1] === 'waitlist_error');
      if (!err || err[2].reason !== 'formspree_error') throw new Error('expected waitlist_error reason=formspree_error, got ' + JSON.stringify(err && err[2]));
      const submitted = calls.find(c => c[1] === 'waitlist_submitted');
      if (!submitted || submitted[2].success !== false) throw new Error('waitlist_submitted(success=false) did not fire as expected');
      await context.close();
    });

    // --- Case C: formspree request fails outright (network) ---
    await test('formspree request aborted -> waitlist_error(reason=network) + waitlist_submitted(success=false)', async () => {
      const context = await browser.newContext();
      await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('formspree.io'), route => route.abort());
      await context.route('**formspree.io/**', route => route.abort('failed'));
      await neutralizeHostGate(context);
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1&src=seo_token`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      await page.locator('.gp-waitlist-email-input').fill('grower@example.com');
      await page.click('.gp-waitlist-submit');
      await page.waitForSelector('.gp-waitlist-error', { timeout: 5000 });

      const calls = await trackedEvents(page);
      const err = calls.find(c => c[1] === 'waitlist_error');
      if (!err || err[2].reason !== 'network') throw new Error('expected waitlist_error reason=network, got ' + JSON.stringify(err && err[2]));
      const submitted = calls.find(c => c[1] === 'waitlist_submitted');
      if (!submitted || submitted[2].success !== false) throw new Error('waitlist_submitted(success=false) did not fire as expected');
      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} waitlist-funnel-instrumentation assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
