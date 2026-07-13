/* Playwright behavior gate for spec 065 (waitlist pitch-variant system):
   drives the REAL rendered plan.html quick-waitlist modal (auto-opened via
   ?waitlist=1&src=seo_token) and asserts the `pitch` URL param swaps the modal
   title + benefits copy AND stamps pitch_variant onto the waitlist events.

   Rails under test:
   - ?pitch=b / ?pitch=c → variant B/C title+benefits render; waitlist_opened
     carries pitch_variant 'b'/'c'.
   - no pitch / ?pitch=zzz → byte-identical variant-A copy, pitch_variant 'a'.
   - one KO run (?lang=ko&pitch=b) → KO variant-B copy renders.
   - submit (mocked formspree) → waitlist_submitted carries the same variant.

   Same fixture-routing pattern as test_waitlist_funnel.js: local static
   server, all non-local requests aborted except a mocked formspree endpoint.

   Run: node test_waitlist_pitch.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8798; // 8791-8797 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Canonical copy pulled straight from the source of truth so assertions are
// byte-exact against what the modal must render.
const { translations: tr } = require('./translations.js');
const enP = tr.en.planner;
const koP = tr.ko.planner;

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

// Open the quick-waitlist modal for a given query and return the rendered
// title/benefits text plus the fired waitlist_opened event props.
async function openModal(browser, query, mockFormspree) {
  const context = await browser.newContext();
  await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('formspree.io'), route => route.abort());
  if (mockFormspree) {
    await context.route('**formspree.io/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  }
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/plan.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
  const title = (await page.locator('.gp-waitlist-title').textContent()).trim();
  const benefits = (await page.locator('.gp-waitlist-benefits').textContent()).trim();
  const ariaLabel = await page.locator('.gp-waitlist-backdrop').getAttribute('aria-label');
  return { context, page, title, benefits, ariaLabel };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- pitch=b → variant B copy + pitch_variant 'b' ---
    await test("?pitch=b renders EN variant-B title+benefits; waitlist_opened carries pitch_variant 'b'", async () => {
      const { context, page, title, benefits, ariaLabel } = await openModal(browser, 'waitlist=1&src=seo_token&pitch=b');
      if (title !== enP.waitlistTitleB) throw new Error('B title mismatch: ' + title);
      if (benefits !== enP.waitlistBenefitsB) throw new Error('B benefits mismatch: ' + benefits);
      if (ariaLabel !== enP.waitlistTitleB) throw new Error('B aria-label mismatch: ' + ariaLabel);
      const opened = (await trackedEvents(page)).find(c => c[1] === 'waitlist_opened');
      if (!opened || opened[2].pitch_variant !== 'b') throw new Error('waitlist_opened pitch_variant should be b, got ' + JSON.stringify(opened && opened[2]));
      await context.close();
    });

    // --- pitch=c → variant C copy + pitch_variant 'c' ---
    await test("?pitch=c renders EN variant-C title+benefits; waitlist_opened carries pitch_variant 'c'", async () => {
      const { context, page, title, benefits, ariaLabel } = await openModal(browser, 'waitlist=1&src=seo_token&pitch=c');
      if (title !== enP.waitlistTitleC) throw new Error('C title mismatch: ' + title);
      if (benefits !== enP.waitlistBenefitsC) throw new Error('C benefits mismatch: ' + benefits);
      if (ariaLabel !== enP.waitlistTitleC) throw new Error('C aria-label mismatch: ' + ariaLabel);
      const opened = (await trackedEvents(page)).find(c => c[1] === 'waitlist_opened');
      if (!opened || opened[2].pitch_variant !== 'c') throw new Error('waitlist_opened pitch_variant should be c, got ' + JSON.stringify(opened && opened[2]));
      await context.close();
    });

    // --- uppercase PITCH=B is accepted (case-insensitive) ---
    await test("?pitch=B (uppercase) renders EN variant-B copy; pitch_variant 'b'", async () => {
      const { context, page, title } = await openModal(browser, 'waitlist=1&src=seo_token&pitch=B');
      if (title !== enP.waitlistTitleB) throw new Error('uppercase B title mismatch: ' + title);
      const opened = (await trackedEvents(page)).find(c => c[1] === 'waitlist_opened');
      if (!opened || opened[2].pitch_variant !== 'b') throw new Error('uppercase B pitch_variant should be b, got ' + JSON.stringify(opened && opened[2]));
      await context.close();
    });

    // --- no pitch → byte-identical variant-A copy + pitch_variant 'a' ---
    await test("no pitch param renders EXACT variant-A copy; waitlist_opened carries pitch_variant 'a'", async () => {
      const { context, page, title, benefits, ariaLabel } = await openModal(browser, 'waitlist=1&src=seo_token');
      if (title !== enP.waitlistTitle) throw new Error('A title mismatch: ' + title);
      if (benefits !== enP.waitlistBenefits) throw new Error('A benefits mismatch: ' + benefits);
      if (ariaLabel !== enP.waitlistTitle) throw new Error('A aria-label mismatch: ' + ariaLabel);
      const opened = (await trackedEvents(page)).find(c => c[1] === 'waitlist_opened');
      if (!opened || opened[2].pitch_variant !== 'a') throw new Error('waitlist_opened pitch_variant should be a, got ' + JSON.stringify(opened && opened[2]));
      await context.close();
    });

    // --- invalid pitch → falls back to variant-A copy + pitch_variant 'a' ---
    await test("?pitch=zzz (invalid) falls back to EXACT variant-A copy; pitch_variant 'a'", async () => {
      const { context, page, title, benefits } = await openModal(browser, 'waitlist=1&src=seo_token&pitch=zzz');
      if (title !== enP.waitlistTitle) throw new Error('invalid-pitch title should equal A: ' + title);
      if (benefits !== enP.waitlistBenefits) throw new Error('invalid-pitch benefits should equal A: ' + benefits);
      const opened = (await trackedEvents(page)).find(c => c[1] === 'waitlist_opened');
      if (!opened || opened[2].pitch_variant !== 'a') throw new Error('invalid-pitch pitch_variant should be a, got ' + JSON.stringify(opened && opened[2]));
      await context.close();
    });

    // --- KO run: ?lang=ko&pitch=b renders KO variant-B copy ---
    await test('?lang=ko&pitch=b renders KO variant-B title+benefits', async () => {
      const { context, page, title, benefits } = await openModal(browser, 'waitlist=1&src=seo_token&lang=ko&pitch=b');
      if (title !== koP.waitlistTitleB) throw new Error('KO B title mismatch: ' + title);
      if (benefits !== koP.waitlistBenefitsB) throw new Error('KO B benefits mismatch: ' + benefits);
      const opened = (await trackedEvents(page)).find(c => c[1] === 'waitlist_opened');
      if (!opened || opened[2].pitch_variant !== 'b') throw new Error('KO waitlist_opened pitch_variant should be b, got ' + JSON.stringify(opened && opened[2]));
      await context.close();
    });

    // --- submit flow: waitlist_submitted carries the same variant ---
    await test("submit under ?pitch=c → waitlist_submitted(success=true) carries pitch_variant 'c'", async () => {
      const { context, page } = await openModal(browser, 'waitlist=1&src=seo_token&pitch=c', true);
      await page.locator('.gp-waitlist-email-input').fill('grower@example.com');
      await page.click('.gp-waitlist-submit');
      await page.waitForSelector('.gp-waitlist-next-steps', { timeout: 5000 });
      const calls = await trackedEvents(page);
      const submitted = calls.find(c => c[1] === 'waitlist_submitted');
      if (!submitted || submitted[2].success !== true) throw new Error('waitlist_submitted(success=true) did not fire');
      if (submitted[2].pitch_variant !== 'c') throw new Error('waitlist_submitted pitch_variant should be c, got ' + JSON.stringify(submitted[2]));
      const attempt = calls.find(c => c[1] === 'waitlist_submit_attempt');
      if (!attempt || attempt[2].pitch_variant !== 'c') throw new Error('waitlist_submit_attempt pitch_variant should be c, got ' + JSON.stringify(attempt && attempt[2]));
      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} waitlist-pitch-variant assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
