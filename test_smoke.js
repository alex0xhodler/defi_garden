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
// Sandboxed Chromium build (mirrors test_search.js) — a fresh install can
// pull a Playwright version whose default headless-shell revision isn't
// pre-installed; the full chrome binary always is.
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
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

function extractLdJsonBlocks(html, type) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const parsed = JSON.parse(m[1]);
    if (!type || parsed['@type'] === type) blocks.push(parsed);
  }
  return blocks;
}

async function main() {
  await test('home.html: sitewide Organization + WebSite JSON-LD, valid JSON, minimum required properties (040)', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
    const org = extractLdJsonBlocks(html, 'Organization');
    const site = extractLdJsonBlocks(html, 'WebSite');
    if (org.length !== 1) throw new Error('expected exactly one Organization block, found ' + org.length);
    if (site.length !== 1) throw new Error('expected exactly one WebSite block, found ' + site.length);
    ['name', 'url', 'logo'].forEach(k => { if (!org[0][k]) throw new Error('Organization missing ' + k); });
    ['name', 'url'].forEach(k => { if (!site[0][k]) throw new Error('WebSite missing ' + k); });
    if (org[0].url !== 'https://www.defi.garden/') throw new Error('Organization.url mismatch');
    if (site[0].url !== 'https://www.defi.garden/') throw new Error('WebSite.url mismatch');
  });

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
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

    await test('pool-detail view (?pool=<id>) renders a BreadcrumbList JSON-LD block (040)', async () => {
      const { page, errors } = await loadAndCollectErrors(browser, '/?token=USDC', VIEWPORTS[2]);
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await page.click('.pool-card');
      await page.waitForSelector('.pool-breadcrumb', { timeout: 10000 });
      const blocks = await page.evaluate(() => Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(s => JSON.parse(s.textContent)));
      const breadcrumb = blocks.find(b => b['@type'] === 'BreadcrumbList');
      await page.close();
      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      if (!breadcrumb) throw new Error('no BreadcrumbList JSON-LD found on the pool-detail view');
      if (breadcrumb.itemListElement.length !== 2) throw new Error('expected 2 breadcrumb items (Search Results, <SYMBOL> Pool)');
      if (!/ Pool$/.test(breadcrumb.itemListElement[1].name)) throw new Error('second breadcrumb item should be "<SYMBOL> Pool"');
    });
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
