/* Playwright smoke gate (spec 003): both sacred router paths must actually render.
   Run: node test_smoke.js
   Serves the repo statically (mimicking vercel.json's "/" -> home.html rewrite)
   and drives real Chromium at 360/768/1280px against:
     1. "/"              -> planner UI mounts into #planner-root
     2. "/?token=USDC"    -> analytics app renders .pool-card elements
   Fails on any unexpected page/console error (external font/analytics fetch
   failures are ignorable per CLAUDE.md). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8791;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Errors from these are ignorable per CLAUDE.md ("external font/analytics
// fetch failures are ignorable locally; page errors are not").
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel/i;

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

async function loadAndCollectErrors(browser, urlPath, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text());
    }
  });
  await page.goto('http://localhost:' + PORT + urlPath, { waitUntil: 'load', timeout: 15000 });
  return { page, errors };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      await test('bare / renders planner UI at ' + viewport.width + 'px', async () => {
        const { page, errors } = await loadAndCollectErrors(browser, '/', viewport);
        await page.waitForSelector('#planner-root [class*="gp-"]', { timeout: 10000 });
        await page.close();
        if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      });

      await test('/?token=USDC renders pool cards at ' + viewport.width + 'px', async () => {
        const { page, errors } = await loadAndCollectErrors(browser, '/?token=USDC', viewport);
        await page.waitForSelector('.pool-card', { timeout: 15000 });
        await page.close();
        if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      });
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' smoke assertions passed');
}

main().catch((err) => {
  console.error('smoke test crashed: ' + err.message);
  process.exitCode = 1;
});
