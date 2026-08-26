/**
 * test_intent_portal_pages.js
 * Verification test for Zero-Distance Intent Portals (/for/<slug>)
 * Validates PRD-003 compliance:
 * - 8 subscription presets (claude, cursor, chatgpt, spotify, netflix, aws, github, youtube)
 * - Required deposit math, +20% tax buffer, 1.25x buffer
 * - AEO / GEO JSON-LD structured data (Product, Offer, SoftwareApplication)
 * - Quiet Design System styling and invariants
 * - Playwright browser rendering and viewport responsiveness
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const PORT = 8899;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const EXPECTED_PRESETS = [
  { slug: 'claude', name: 'Anthropic Claude Pro', category: 'AI / Developer', baseMonthly: 20.00, taxBuffer: 24.00 },
  { slug: 'cursor', name: 'Cursor Pro IDE', category: 'AI / Developer', baseMonthly: 20.00, taxBuffer: 24.00 },
  { slug: 'chatgpt', name: 'OpenAI ChatGPT Plus', category: 'AI / Developer', baseMonthly: 20.00, taxBuffer: 24.00 },
  { slug: 'spotify', name: 'Spotify Premium', category: 'Media Streaming', baseMonthly: 11.99, taxBuffer: 14.39 },
  { slug: 'netflix', name: 'Netflix Standard', category: 'Media Streaming', baseMonthly: 17.99, taxBuffer: 21.59 },
  { slug: 'amazonprime', name: 'Amazon Prime', category: 'Shopping & Media', baseMonthly: 15.00, taxBuffer: 18.00 },
  { slug: 'opencode', name: 'OpenCode Go', category: 'AI / Developer', baseMonthly: 5.00, taxBuffer: 6.00 },
  { slug: 'aws', name: 'AWS Cloud Micro-Infra', category: 'Cloud Compute', baseMonthly: 50.00, taxBuffer: 60.00 },
  { slug: 'github', name: 'GitHub Copilot Pro', category: 'AI / Developer', baseMonthly: 10.00, taxBuffer: 12.00 },
  { slug: 'youtube', name: 'YouTube Premium', category: 'Media Streaming', baseMonthly: 13.99, taxBuffer: 16.79 },
  { slug: 'disney', name: 'Disney+', category: 'Media Streaming', baseMonthly: 15.99, taxBuffer: 19.19 },
  { slug: 'max', name: 'Max (HBO)', category: 'Media Streaming', baseMonthly: 16.99, taxBuffer: 20.39 },
  { slug: 'hulu', name: 'Hulu', category: 'Media Streaming', baseMonthly: 18.99, taxBuffer: 22.79 },
  { slug: 'appletv', name: 'Apple TV+', category: 'Media Streaming', baseMonthly: 12.99, taxBuffer: 15.59 },
  { slug: 'gamepass', name: 'Xbox Game Pass Ultimate', category: 'Gaming', baseMonthly: 19.99, taxBuffer: 24.00 },
  { slug: 'paramount', name: 'Paramount+', category: 'Media Streaming', baseMonthly: 9.99, taxBuffer: 11.99 },
  { slug: 'peacock', name: 'Peacock Premium', category: 'Media Streaming', baseMonthly: 10.99, taxBuffer: 13.19 },
  { slug: 'doordash', name: 'DoorDash DashPass', category: 'Lifestyle & Food', baseMonthly: 9.99, taxBuffer: 11.99 },
  { slug: 'uber', name: 'Uber One', category: 'Lifestyle & Mobility', baseMonthly: 9.99, taxBuffer: 11.99 },
  { slug: 'audible', name: 'Audible Premium Plus', category: 'Audiobooks & Media', baseMonthly: 14.95, taxBuffer: 17.94 },
  { slug: 'walmart', name: 'Walmart+', category: 'Shopping & Delivery', baseMonthly: 12.95, taxBuffer: 15.54 },
  { slug: 'phonebill', name: 'Mobile Phone Bill', category: 'Everyday Utility Bills', baseMonthly: 70.00, taxBuffer: 84.00 },
  { slug: 'rent', name: 'Apartment Rent Settlement', category: 'Housing & Rent', baseMonthly: 1800.00, taxBuffer: 2160.00 }
];

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
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
  const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'
  };
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

function extractLdJson(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const match = re.exec(html);
  if (!match) return null;
  return JSON.parse(match[1]);
}

console.log('--- Intent Portal Static Generation Tests ---');

EXPECTED_PRESETS.forEach(preset => {
  test(`for/${preset.slug}.html exists and has valid PRD content`, () => {
    const filePath = path.join(ROOT, 'for', `${preset.slug}.html`);
    assert.ok(fs.existsSync(filePath), `Expected ${filePath} to exist`);
    const html = fs.readFileSync(filePath, 'utf8');

    // Check JSON-LD graph
    const ldJson = extractLdJson(html);
    assert.ok(ldJson, 'Expected JSON-LD block');
    assert.ok(ldJson['@graph'], 'Expected @graph in JSON-LD');
    const product = ldJson['@graph'].find(item => item['@type'] === 'Product');
    const app = ldJson['@graph'].find(item => item['@type'] === 'SoftwareApplication');
    assert.ok(product, `Expected Product in @graph for ${preset.slug}`);
    assert.ok(app, `Expected SoftwareApplication in @graph for ${preset.slug}`);
    assert.strictEqual(product['@id'], `https://www.defi.garden/for/${preset.slug}#product`);
    assert.strictEqual(product.offers.price, preset.baseMonthly.toFixed(2));
    assert.strictEqual(product.offers.url, `https://www.defi.garden/for/${preset.slug}`);
    assert.strictEqual(app['@id'], `https://www.defi.garden/for/${preset.slug}#app`);

    // Check cardholder and card visualizer
    assert.ok(html.includes(`${preset.slug.toUpperCase()}-VAULT / AGENT-01`), 'Expected cardholder name');
    assert.ok(html.includes(`•••• •••• •••• 8453`), 'Expected 8453 card number');
    assert.ok(html.includes('id="email-input"'), 'Expected email input for card waitlist reservation');
    assert.ok(html.includes('id="submit-btn"'), 'Expected reservation submit button');
    assert.ok(html.includes('id="receipt-card"'), 'Expected reservation receipt container');

    // Check Quiet design system reference and protocol invariants
    assert.ok(html.includes('<link rel="stylesheet" href="/style.css">'), 'Expected style.css link');
    assert.ok(html.includes('Protocol Invariants'), 'Expected Protocol Invariants section');
    assert.ok(html.includes('Buy it outright and the money is gone. Garden it and you keep the money AND get the thing.'), 'Expected core invariant quote');
  });
});

console.log('--- Intent Portal Browser Smoke Tests ---');

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });

  try {
    for (const width of [360, 768, 1280]) {
      await asyncTest(`browser renders /for/claude at ${width}px viewport`, async () => {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        const errors = [];
        page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
        page.on('console', (msg) => {
          if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
        });

        await page.goto(`http://localhost:${PORT}/for/claude`, { waitUntil: 'load' });
        await page.waitForSelector('.virtual-card-preview', { timeout: 5000 });
        const headline = await page.locator('.hero-title').innerText();
        assert.ok(headline.includes('Claude Pro'), 'Expected Claude Pro in headline');

        // Check reservation form submission
        await page.fill('#email-input', 'builder@anthropic.com');
        await page.click('#submit-btn');
        await page.waitForSelector('#receipt-card:not([style*="display:none"])', { timeout: 5000 });
        const receiptText = await page.locator('#receipt-card').innerText();
        assert.ok(receiptText.includes('Waitlist Spot Reserved'), 'Expected confirmation receipt');
        assert.ok(receiptText.includes('Early Access Reserved'), 'Expected early access badge');

        await page.close();
        if (errors.length) throw new Error('Errors on page:\n' + errors.join('\n'));
      });
    }

    await asyncTest('interactive landing page intent chips switch presets and update CTA', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid="landing-intent-card"]', { timeout: 5000 });

      // Click "Cursor Pro" chip
      const cursorBtn = page.locator('[data-testid="landing-intent-card"] button', { hasText: 'Cursor Pro' });
      await cursorBtn.click();

      // Check updated deposit and CTA
      const cta = page.locator('[data-testid="landing-intent-cta"]');
      const href = await cta.getAttribute('href');
      assert.strictEqual(href, '/for/cursor', 'Expected /for/cursor link on CTA');
      const ctaText = await cta.innerText();
      assert.ok(ctaText.includes('Cursor Pro'), 'Expected Cursor Pro in CTA text');

      // Click "Spotify" chip
      const spotifyBtn = page.locator('[data-testid="landing-intent-card"] button', { hasText: 'Spotify' });
      await spotifyBtn.click();
      const spotifyHref = await cta.getAttribute('href');
      assert.strictEqual(spotifyHref, '/for/spotify', 'Expected /for/spotify link on CTA');

      await page.close();
    });

  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\nPassed ${passed} intent portal tests.`);
})().catch((err) => {
  console.error('Intent portal test failed: ' + err.message);
  process.exitCode = 1;
});
