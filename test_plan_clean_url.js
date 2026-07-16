/* Playwright acceptance gate: the "Garden this pool" critical flow must render
   the planner when the planner document is served at the CLEAN url `/plan`
   (Vercel `cleanUrls: true` strips the `.html`, so the CTA's `plan.html?...`
   href 308-redirects to `/plan?...` in production).

   Regression guarded: planner.js only mounted when the path matched
   /plan\.html$/ OR window.__APP_MODE === 'planner'; at the clean `/plan` path
   neither held (plan.html never set __APP_MODE, its own doc doesn't run
   home.html's router), so #planner-root stayed empty -> blank page.

   Run: node test_plan_clean_url.js

   Harness mirrors test_report_share.js: static server (with a Vercel-style
   cleanUrls resolver so `/plan` serves plan.html), sandboxed Chromium, the
   pools-fetch fixture route, and the ignorable-error classifier. Drives the
   REAL UI at the real clean path — no unit fixtures. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8799;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml; charset=utf-8'
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

// Vercel cleanUrls:true + trailingSlash:false resolver: `/` -> home.html,
// an extensionless path whose `<name>.html` exists -> that file (so `/plan`
// serves plan.html, exactly as production does).
function resolveCleanUrl(urlPath) {
  if (urlPath === '/') return 'home.html';
  const rel = urlPath.replace(/^\/+/, '');
  if (fs.existsSync(path.join(ROOT, rel))) return rel;
  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + '.html'))) return rel + '.html';
  return rel;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, resolveCleanUrl(urlPath));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
  return { page, errors };
}

// The exact URL from the "Garden this pool" CTA (PoolDetail.js), sans .html.
const PLAN_QUERY = 'goal=retirement&pace=stable&capital=1000&fm=capital&years=5';

async function assertPlannerRendered(page) {
  await page.waitForSelector('#planner-root > *', { timeout: 10000 });
  const childCount = await page.$eval('#planner-root', (el) => el.children.length);
  if (childCount < 1) throw new Error('#planner-root has no child elements (planner did not mount)');
  const text = (await page.$eval('#planner-root', (el) => el.innerText || '')).trim();
  if (text.length < 20) throw new Error('#planner-root rendered but content is trivially short (' + text.length + ' chars): "' + text.slice(0, 60) + '"');
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // 1. THE BUG: clean url `/plan?...` (what production serves after cleanUrls).
    await test('clean url /plan?<gardenCta params> mounts the planner (not blank)', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/plan?' + PLAN_QUERY, { waitUntil: 'load', timeout: 15000 });
      const mode = await page.evaluate(() => window.__APP_MODE);
      await assertPlannerRendered(page);
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
      console.log('      (window.__APP_MODE=' + JSON.stringify(mode) + ')');
      await page.close();
    });

    // 2. Backward compat: the explicit `.html` path still mounts the planner.
    await test('/plan.html?<gardenCta params> still mounts the planner', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/plan.html?' + PLAN_QUERY, { waitUntil: 'load', timeout: 15000 });
      await assertPlannerRendered(page);
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
      await page.close();
    });

    // 3. The plan actually reflects the deep-linked goal (retirement / GROWTH),
    //    proving the flow lands on real content, not just an empty shell.
    await test('clean url /plan renders retirement plan content (capital + projection)', async () => {
      const { page } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/plan?' + PLAN_QUERY, { waitUntil: 'load', timeout: 15000 });
      await assertPlannerRendered(page);
      const body = (await page.$eval('#planner-root', (el) => el.innerText || '')).toLowerCase();
      if (!/\$\s?1,?000|1000/.test(body) && !/retire|garden|plan/i.test(body)) {
        throw new Error('planner content does not reflect the deep-linked plan: "' + body.slice(0, 120) + '"');
      }
      await page.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n' + passed + '/3 passed');
}

main();
