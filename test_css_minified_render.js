/* Playwright acceptance gate for spec 073 (minify planner-styles.css +
   pool-detail-styles.css). Drives the REAL rendered router — not just static
   HTML string checks — to prove the minified stylesheets are the URLs the
   browser actually requests AND that the planner sheet applies (a computed
   style only planner-styles(.min).css sets), so a wrong reference = unstyled
   planner would fail here, not just in test_minified_assets.js.

   Rails under test (073 acceptance):
   - plan.html requests `planner-styles.min.css` with a 200 response, never the
     raw `planner-styles.css`, and `.gp-tagline` carries text-align:center —
     a rule only the planner stylesheet provides (proves the sheet applied,
     not merely downloaded).
   - Analytics mode (`?token=` — fixture-routed) requests
     `pool-detail-styles.min.css`, never the raw `pool-detail-styles.css`.

   External hosts (yields.llama.fi pools, fonts, analytics CDN) are
   connection-blocked in-sandbox, so they are fixture-routed / aborted per the
   test_hero_copy.js / test_search.js pattern; all local files serve normally.

   Run: node test_css_minified_render.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8801; // 8791-8800 range already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Minimal DefiLlama-shaped payload so the app's pools fetch resolves; the
// specific pools are irrelevant to which stylesheet URL loads.
const FIXTURE_POOLS = JSON.stringify({ status: 'success', data: [
  { pool: 'p1', symbol: 'USDC', project: 'aave-v3', chain: 'Ethereum', apyBase: 5, apyReward: 0, tvlUsd: 800000000 }
] });

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

// Route yields.llama.fi to the fixture and abort every other non-local
// request (fonts, analytics CDN) — connection-blocked in-sandbox anyway.
async function routeExternals(context) {
  await context.route('**yields.llama.fi/pools**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_POOLS
  }));
  await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('yields.llama.fi'), route => route.abort());
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- plan.html: min sheet requested (200) + applied ---
    await test('plan.html requests planner-styles.min.css (200), not the raw sheet, and it applies', async () => {
      const context = await browser.newContext();
      await routeExternals(context);
      const cssRequests = [];
      const rawRequested = [];
      context.on('response', resp => {
        const u = resp.url();
        if (u.includes('planner-styles.min.css')) cssRequests.push({ url: u, status: resp.status() });
      });
      context.on('request', req => {
        const u = req.url();
        if (/\/planner-styles\.css(\?|$)/.test(u)) rawRequested.push(u);
      });
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.gp-tagline', { timeout: 10000 });

      const minResp = cssRequests.find(r => r.status === 200);
      if (!minResp) throw new Error('planner-styles.min.css was not requested with a 200. got: ' + JSON.stringify(cssRequests));
      if (rawRequested.length) throw new Error('raw planner-styles.css was requested: ' + JSON.stringify(rawRequested));

      // A rule only planner-styles(.min).css provides: .gp-tagline { text-align: center }.
      // Without the sheet applied, the computed value would be the default (start/left).
      const textAlign = await page.$eval('.gp-tagline', el => getComputedStyle(el).textAlign);
      if (textAlign !== 'center') throw new Error('.gp-tagline text-align should be "center" (planner-styles applied), got: ' + textAlign);

      await context.close();
    });

    // --- analytics mode: pool-detail min sheet requested, not the raw sheet ---
    await test('analytics mode (?token=) requests pool-detail-styles.min.css, not the raw sheet', async () => {
      const context = await browser.newContext();
      await routeExternals(context);
      const minRequested = [];
      const rawRequested = [];
      context.on('request', req => {
        const u = req.url();
        if (u.includes('pool-detail-styles.min.css')) minRequested.push(u);
        else if (/\/pool-detail-styles\.css(\?|$)/.test(u)) rawRequested.push(u);
      });
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      // The mode router injects the pool-detail link synchronously at load; give
      // the request a beat to be observed.
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href.includes('pool-detail-styles.min.css')),
        { timeout: 10000 }
      );
      if (!minRequested.length) throw new Error('pool-detail-styles.min.css was not requested');
      if (rawRequested.length) throw new Error('raw pool-detail-styles.css was requested: ' + JSON.stringify(rawRequested));

      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} css-minified-render assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
