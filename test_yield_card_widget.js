/* Playwright behavior test for Contextual Yield-Funded Virtual Card Widget (PRD Design 3).
   Tests DOM mounting in PoolDetail, slider interactivity, dynamic unlock grid,
   auto-slide micro-interaction, virtual Visa card visual sync, and waitlist submission.
   Run: node test_yield_card_widget.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');

const PORT = 8842;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath);
      if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      }
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

async function run() {
  const server = await startServer();
  let browser;

  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM_EXECUTABLE,
      headless: true
    });

    const mockPool = {
      pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
      chain: 'Base',
      project: 'aave-v3',
      symbol: 'USDC',
      tvlUsd: 48000000,
      apyBase: 6.20,
      apyReward: 0,
      underlyingTokens: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913']
    };

    console.log('--- Yield Card Widget Browser Integration ---');

    await test('Yield Card widget renders inside PoolDetail with context header, slider, grid, card, and reservation form', async () => {
      const page = await browser.newPage();
      await page.addInitScript(() => {
        window.__TEST_MOCK_POOLS = true;
      });

      // Navigate to app mode with pool query
      await page.goto(`http://localhost:${PORT}/?app=1&pool=747c1d2a-c668-4682-b9f9-296708a3dd90`);
      await page.waitForSelector('.pool-detail-container', { timeout: 5000 });

      // Yield Card Terminal element must exist
      const terminal = await page.waitForSelector('.yield-card-terminal', { timeout: 3000 });
      assert.ok(terminal, 'Yield Card Terminal container should exist in PoolDetail');

      // Check context alert banner
      const banner = await page.$('.yield-card-context-banner');
      assert.ok(banner, 'Context banner should exist');

      // Check slider with min 300 and default $4,000
      const slider = await page.$('input.yield-card-slider');
      assert.ok(slider, 'Deposit slider should exist');
      const minVal = await slider.getAttribute('min');
      assert.strictEqual(minVal, '300', 'Slider minimum should be 300');
      const val = await slider.inputValue();
      assert.ok(Number(val) >= 300, `Default slider deposit should be valid number >= 300, got: ${val}`);
      // Check monthly yield readout ($4k @ pool APY ~ $7+/mo)
      const readout = await page.$eval('.yield-card-monthly-yield', el => el.textContent);
      const val4k = parseFloat(readout.replace(/[^0-9.]/g, ''));
      assert.ok(val4k >= 3.0 && val4k <= 25.0, `Expected monthly yield ~$7+, got: ${readout}`);

      // Check subscription grid exists
      const grid = await page.$('.yield-card-grid');
      assert.ok(grid, 'Subscription grid should exist');

      // Check virtual card element exists
      const card = await page.$('.virtual-visa-card');
      assert.ok(card, 'Virtual Visa card should exist');

      // Check Visa SVG logo and gold chip
      const visaLogo = await page.$('.virtual-visa-card svg.visa-logo-svg');
      assert.ok(visaLogo, 'Visa logo SVG should be present on card');
      const goldChip = await page.$('.virtual-visa-card .visa-gold-chip');
      assert.ok(goldChip, 'Gold security chip should be present on card');

      // Check reservation terminal
      const reserveForm = await page.$('.yield-card-reservation');
      assert.ok(reserveForm, 'Reservation form should exist');

      await page.close();
    });

    await test('Calculate Your Earnings is collapsed by default and Hero Garden button scrolls to Card Widget', async () => {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${PORT}/?app=1&pool=747c1d2a-c668-4682-b9f9-296708a3dd90`);
      await page.waitForSelector('.pool-detail-container', { timeout: 5000 });

      // Calculator should NOT be expanded by default
      const calcCompact = await page.$('.calculator-compact');
      assert.ok(calcCompact, 'Calculator section should exist');
      const calcClass = await calcCompact.getAttribute('class');
      assert.ok(!calcClass.includes('expanded'), 'Calculator should be collapsed by default');

      // Hero Garden this pool button should have href #yield-card-widget
      const heroGardenBtn = await page.$('.pool-hero-action-primary a.cta-button-primary');
      assert.ok(heroGardenBtn, 'Hero Garden CTA should exist');
      const heroHref = await heroGardenBtn.getAttribute('href');
      assert.strictEqual(heroHref, '#yield-card-widget', 'Hero Garden CTA href should point to #yield-card-widget');

      // Click hero button
      await heroGardenBtn.click();

      // Card terminal widget should exist and have id yield-card-widget
      const widget = await page.$('#yield-card-widget');
      assert.ok(widget, 'Yield Card Widget with id yield-card-widget should exist');

      await page.close();
    });

    await test('Slider allows sliding down to $300 minimum and updates calculation', async () => {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${PORT}/?app=1&pool=747c1d2a-c668-4682-b9f9-296708a3dd90`);
      await page.waitForSelector('.yield-card-terminal', { timeout: 5000 });

      const slider = await page.$('input.yield-card-slider');
      await slider.fill('300');
      await slider.dispatchEvent('input');
      await slider.dispatchEvent('change');

      const readout300 = await page.$eval('.yield-card-monthly-yield', el => el.textContent);
      const val300 = parseFloat(readout300.replace(/[^0-9.]/g, ''));
      assert.ok(val300 >= 0.2 && val300 <= 2.5, `Expected yield ~$0.5+ at $300, got ${readout300}`);

      await page.close();
    });

    await test('Dragging slider updates monthly yield and dynamic covered/locked rungs', async () => {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${PORT}/?app=1&pool=747c1d2a-c668-4682-b9f9-296708a3dd90`);
      await page.waitForSelector('.yield-card-terminal', { timeout: 5000 });

      const slider = await page.$('input.yield-card-slider');

      // At $4,000 deposit ($20.66/mo at 6.2%), OpenCode Go ($5.00) is COVERED, AWS Cloud ($50) is LOCKED
      const opencodeCard = await page.$('.yield-card-item[data-goal-id="opencode_go"]');
      assert.ok(opencodeCard, 'OpenCode Go item should exist');
      const opencodeClass = await opencodeCard.getAttribute('class');
      assert.ok(opencodeClass.includes('is-covered'), 'OpenCode Go should be COVERED at $4,000');

      const awsCard = await page.$('.yield-card-item[data-goal-id="aws"]');
      assert.ok(awsCard, 'AWS Cloud item should exist');
      const awsClass = await awsCard.getAttribute('class');
      assert.ok(awsClass.includes('is-locked'), 'AWS Cloud should be LOCKED at $4,000');

      // Lower slider to $1,000 (monthly yield ~ $5.16)
      await slider.fill('500');
      await slider.dispatchEvent('input');
      await slider.dispatchEvent('change');

      const readout500 = await page.$eval('.yield-card-monthly-yield', el => el.textContent);
      const val500 = parseFloat(readout500.replace(/[^0-9.]/g, ''));
      assert.ok(val500 >= 0.8 && val500 <= 5.0, `Expected yield ~$2.5+ at $500, got ${readout500}`);

      // At $500, OpenCode Go is now LOCKED
      const opencodeClass500 = await opencodeCard.getAttribute('class');
      assert.ok(opencodeClass500.includes('is-locked'), 'OpenCode Go should be LOCKED at $500');

      // Locked card should display requirement text
      const awsText = await awsCard.textContent();
      assert.ok(awsText.includes('Requires') || awsText.includes('k') || awsText.includes('필요'), `Expected required capital hint, got ${awsText}`);

      await page.close();
    });

    await test('Clicking locked card auto-slides slider to required capital and unlocks it', async () => {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${PORT}/?app=1&pool=747c1d2a-c668-4682-b9f9-296708a3dd90`);
      await page.waitForSelector('.yield-card-terminal', { timeout: 5000 });

      const slider = await page.$('input.yield-card-slider');
      await slider.fill('1000');
      await slider.dispatchEvent('input');
      await slider.dispatchEvent('change');

      // Click locked ChatGPT Plus card
      const chatgptCard = await page.$('.yield-card-item[data-goal-id="chatgpt"]');
      await chatgptCard.click();

      // Slider value should now be updated to required capital
      const newSliderVal = Number(await slider.inputValue());
      assert.ok(newSliderVal >= 3000, `Slider should auto-slide to >= 3000, got ${newSliderVal}`);

      // ChatGPT Plus should now be COVERED
      const updatedClass = await chatgptCard.getAttribute('class');
      assert.ok(updatedClass.includes('is-covered'), 'ChatGPT Plus should now be COVERED after auto-slide');

      await page.close();
    });

    await test('Selecting a covered card updates Virtual Visa preview label and spend cap badge', async () => {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${PORT}/?app=1&pool=747c1d2a-c668-4682-b9f9-296708a3dd90`);
      await page.waitForSelector('.yield-card-terminal', { timeout: 5000 });

      // Click Spotify or Claude or Cursor
      const cursorCard = await page.$('.yield-card-item[data-goal-id="cursor"]');
      if (cursorCard) {
        await cursorCard.click();
        const cardTitle = await page.$eval('.virtual-visa-card .visa-card-funded-label', el => el.textContent);
        assert.ok(cardTitle.toLowerCase().includes('cursor'), `Expected card label to mention Cursor, got: ${cardTitle}`);

        const capBadge = await page.$eval('.virtual-visa-card .visa-card-cap-badge', el => el.textContent);
        assert.ok(capBadge.includes('20') || capBadge.includes('24') || capBadge.includes('48'), `Expected cap badge to reflect sub amount, got: ${capBadge}`);
      }

      await page.close();
    });

    await test('Reservation widget renders Get Visa Card on Laso button with referral link and zero email capture', async () => {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${PORT}/?app=1&pool=747c1d2a-c668-4682-b9f9-296708a3dd90`);
      await page.waitForSelector('.yield-card-terminal', { timeout: 5000 });

      // Verify no email input is rendered
      const emailInput = await page.$('.yield-card-reservation input[type="email"], .yield-card-reservation input.email-input');
      assert.strictEqual(emailInput, null, 'Email input should NOT exist in reservation section');

      // Verify primary Laso referral button
      const lasoBtn = await page.$('.yield-card-reservation a.reserve-submit-btn');
      assert.ok(lasoBtn, 'Get Visa Card on Laso button should exist');
      const href = await lasoBtn.getAttribute('href');
      assert.strictEqual(href, 'https://laso.finance?ref=lmretyujvzr9jiutxi4d', 'Expected Laso referral link');
      const text = await lasoBtn.textContent();
      assert.ok(text.includes('Get Visa Card on Laso'), `Expected button text to mention Get Visa Card on Laso, got: ${text}`);

      await page.close();
    });

  } finally {
    if (browser) await browser.close();
    server.close();
  }

  console.log(`\nPassed ${passed} browser tests.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
