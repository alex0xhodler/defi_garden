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
const { execFileSync } = require('child_process');
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
// Matched against the failing resource's own URL (msg.location().url), not
// msg.text() — Chromium's "Failed to load resource" text never includes the
// URL itself (exact test_search.js technique + comment). Each entry is an
// observed-firing, non-critical external fetch that degrades gracefully, so
// per CLAUDE.md ("external font/analytics fetches fail locally; page errors
// are not") it must not fail the gate — genuine page errors and any other
// console error still do:
//   - mp.defi.garden / cdn.mxpnl.com / mixpanel — analytics (fire-and-forget)
//   - api.llama.fi/protocols            — app.js protocol-name cache, fails silently
//   - fontshare.com                     — style.css @import web font
//   - www.google.com/s2/favicons        — planner brand favicons (aria-hidden,
//                                          onError falls back to emoji)
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;

// yields.llama.fi is blocked at the proxy for browser-originated HTTPS in
// cloud-loop sandboxes (NORTH_STAR standing decision 2026-07-12) while curl —
// which honors HTTPS_PROXY — still reaches it. So we route the pools fetch on
// every page and fulfill it with a live snapshot (captured once via curl when
// reachable) or a DefiLlama-shaped fixture otherwise. test_search.js precedent.
const POOLS_URL = 'https://yields.llama.fi/pools';

// --- DefiLlama-shaped fixture (fallback only) ----------------------------
// Inline (spec 077 §3 builder's choice — test_search.js keeps its own fixture
// too; requiring it is impossible here since it runs main() at require time).
// USDC pools sized well above the $10M DEFAULT_MIN_TVL floor with non-zero
// apyBase so /?token=USDC renders .pool-card elements and survives trust-rail
// filtering; a couple of non-USDC pools add realistic noise.
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

// Body served to every routed pools request, and which mode produced it.
let POOLS_BODY = FIXTURE_RESPONSE;
let DATA_MODE = 'fixture';

// Quick outbound reachability probe via curl (honors HTTPS_PROXY exactly as
// Chromium would; a raw Node https.get would bypass the proxy and false-
// positive). Same shape as test_search.js probe(). 8s cap is generous — policy
// 403/resets are immediate; never retried per /root/.ccr/README.md.
function probe(url) {
  try {
    const code = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8', url], {
      encoding: 'utf8'
    });
    return code.trim().startsWith('2') || code.trim().startsWith('3');
  } catch (err) {
    return false;
  }
}

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
    if (msg.type() !== 'error') return;
    // Classify by the failing resource's URL, not the text — Chromium's
    // "Failed to load resource" message never contains the URL (test_search.js).
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  // Route the pools fetch before navigating so the browser never egresses to
  // the (proxy-blocked) host; serve the captured live snapshot or the fixture.
  // spec 059: serve a STALE snapshot so the FE falls back to the fixtured/captured POOLS_BODY deterministically (200 keeps the console clean).
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route(POOLS_URL, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: POOLS_BODY
  }));
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
  // Decide the pools data mode once: capture the real body if curl can reach
  // llama (the browser can't in-sandbox), else fall back to the fixture. The
  // 10MB+ payload needs a raised maxBuffer.
  if (probe(POOLS_URL)) {
    try {
      const body = execFileSync('curl', ['-sS', '--max-time', '20', POOLS_URL], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
      });
      if (body && body.trim().startsWith('{')) { POOLS_BODY = body; DATA_MODE = 'live snapshot'; }
    } catch (err) { /* keep fixture fallback */ }
  }
  console.log('network: yields.llama.fi ' + (DATA_MODE === 'live snapshot'
    ? 'reachable — serving live snapshot captured via curl'
    : 'BLOCKED — serving DefiLlama-shaped fixture'));

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
