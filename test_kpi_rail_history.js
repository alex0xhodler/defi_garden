/* Rendered Playwright acceptance test for backlog 145 (AC5) — trust rail on
   history-derived KPIs: an out-of-rail rate-history point must not produce a
   "steadier" numeric Sharpe/stdev/mean, and pool-detail must never show a
   steadiness claim (or NaN/undefined/null) built from poisoned history.

   Drives the REAL rendered UI against the REAL COMMITTED data/pools-snapshot.json
   (never a hand-built fixture alone) — the same real pool the spec's evidence
   section cites: 201e5f6e-cf75-4d0e-b07f-d58da3cee23a (balancer-v2 WSTETH-AAVE,
   Ethereum), whose committed rate history has one 260,768%-magnitude glitch day
   (2026-07-20) mid-series. After the 145 fix, compute-kpis.js nulls this pool's
   apySharpe/apyStdev/apyMean (poisoned whole-series) while apyMomentum survives
   (both endpoints sane) — see 145-notes.md for the exact committed diff.

   Fixture mechanics copied verbatim (not reinvented) from:
     - test_kpi_sharpe_sort.js — local http-server + vendored unpkg React/Babel/
       ReactDOM, icons.llamao.fi abort, the "Risk-adjusted" sort-button lookup by
       rendered text (not source string), symbolOrder()/waitForOrder() polling.
     - test_kpi_track_record.js — the `?pool=<id>` pool-detail render + note
       read-back mechanics.
     - audit-app.js (playbook trap #1, learned 2026-07-25): a plain-parameterized
       analytics URL (no `?pool=`) is snapshot-eligible (app.js tryLoadSnapshot),
       which requires a FRESH `/data/pools-snapshot-meta.json` (schemaVersion:1,
       generatedAt within the 6h SNAPSHOT_MAX_AGE_MS window) routed in, or the
       gate falls through to a live fetch and (since we deliberately don't mirror
       740 pools into the live fixture) renders 0 results.

   Two entry paths, two different data-load shapes (both against real data):
     (a) Grid: `/?token=WSTETH` is snapshot-eligible (no `?pool=`, default minTvl)
         — routes fresh meta + the real snapshot body verbatim.
     (b) Pool-detail: `/?pool=<id>` is NEVER snapshot-eligible (app.js:1141,
         spec 105) — always loads LIVE `yields.llama.fi/pools` first (routed here
         to the same real pool object, kpis stripped, exactly like production),
         then a separate effect (app.js:1224) fetches the real committed
         `/data/pools-snapshot.json` once to merge `kpis` onto the live pool —
         the exact mechanism that puts the regenerated, rail-respecting kpis in
         front of a real SEO deep-link landing.

   Run: node test_kpi_rail_history.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8860; // distinct from other test_* files (8791-8851 taken)
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const TARGET_POOL_ID = '201e5f6e-cf75-4d0e-b07f-d58da3cee23a';
const APY_SANITY_LIMIT = 1000; // trust-rail mirror, read-only, same value as app.js/compute-kpis.js

// --- Real committed data (never a hand-built fixture for this assertion) ---
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');
const SNAPSHOT_RAW = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
const SNAPSHOT = JSON.parse(SNAPSHOT_RAW);

const targetPool = SNAPSHOT.pools.find((p) => p.pool === TARGET_POOL_ID);
if (!targetPool) {
  throw new Error(`${TARGET_POOL_ID} not found in data/pools-snapshot.json — regenerate via node compute-kpis.js first`);
}
if (targetPool.kpis.apySharpe !== null || targetPool.kpis.apyStdev !== null || targetPool.kpis.apyMean !== null) {
  throw new Error('target pool kpis are not rail-nulled in the committed snapshot — did the 145 fix run? got: ' +
    JSON.stringify(targetPool.kpis));
}

// --- (a) predicted Risk-adjusted order, mirroring app.js's token-first
//     `sortBy === 'sharpe'` comparator EXACTLY (app.js ~2006-2025) over the
//     REAL pools matching token=WSTETH (symbolMatchesToken: case-insensitive
//     substring). All 27 committed matches are sane (non-anomalous) APYs, so
//     this reduces to "null Sharpe, tie-break TVL desc" for every one of them
//     post-145-fix — proving the target is NOT pulled to the front anymore.
function symbolMatchesToken(symbol, token) {
  return !!symbol && String(symbol).toUpperCase().includes(String(token).toUpperCase());
}
function sharpeComparator(a, b) {
  const apyA = (a.apyBase || 0) + (a.apyReward || 0);
  const apyB = (b.apyBase || 0) + (b.apyReward || 0);
  const anomA = apyA > APY_SANITY_LIMIT ? 1 : 0;
  const anomB = apyB > APY_SANITY_LIMIT ? 1 : 0;
  if (anomA !== anomB) return anomA - anomB;
  const shA = (a.kpis && typeof a.kpis.apySharpe === 'number') ? a.kpis.apySharpe : null;
  const shB = (b.kpis && typeof b.kpis.apySharpe === 'number') ? b.kpis.apySharpe : null;
  const nullA = shA === null ? 1 : 0;
  const nullB = shB === null ? 1 : 0;
  if (nullA !== nullB) return nullA - nullB;
  if (shA !== null && shB !== null && shA !== shB) return shB - shA;
  return b.tvlUsd - a.tvlUsd;
}
const TOKEN = 'WSTETH';
const wstethMatches = SNAPSHOT.pools.filter((p) => symbolMatchesToken(p.symbol, TOKEN) && p.tvlUsd > 0);
if (!wstethMatches.some((p) => p.pool === TARGET_POOL_ID)) {
  throw new Error('target pool does not match the WSTETH token filter — fixture assumption broke');
}
// At least one other real pool in this set must have a numeric-Sharpe-free
// (null) profile for "not ahead of null-Sharpe pools" to be a meaningful check.
const otherNullSharpePeers = wstethMatches.filter((p) =>
  p.pool !== TARGET_POOL_ID && (!p.kpis || typeof p.kpis.apySharpe !== 'number'));
if (otherNullSharpePeers.length === 0) {
  throw new Error('expected at least one other real WSTETH-matching pool with null apySharpe — fixture assumption broke');
}
const predictedOrder = wstethMatches.slice().sort(sharpeComparator);
const predictedTargetIndex = predictedOrder.findIndex((p) => p.pool === TARGET_POOL_ID);
// Sanity: with a numeric (un-railed) apySharpe this pool would sort FIRST
// (it's the only WSTETH match ever carrying a numeric Sharpe) — the bug this
// ticket fixes. Confirm the fixture actually exercises that contrast.
if (predictedTargetIndex === 0 && wstethMatches.length > 1) {
  throw new Error('predicted order still puts the target first — the fixture would not catch the pre-145 bug');
}

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
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

async function routeCommon(page) {
  const nodeModules = path.join(ROOT, 'node_modules');
  const vendored = {
    'https://unpkg.com/react@18/umd/react.production.min.js':
      path.join(nodeModules, 'react/umd/react.production.min.js'),
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
      path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
    'https://unpkg.com/@babel/standalone/babel.min.js':
      path.join(nodeModules, '@babel/standalone/babel.min.js')
  };
  for (const [url, localPath] of Object.entries(vendored)) {
    await page.route(url, (route) => route.fulfill({
      status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
    }));
  }
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
}

// Ordered list of .pool-symbol texts, in DOM order (one page).
function symbolOrder(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim())
  );
}

// The grid paginates itemsPerPage=9 (app.js:919) — 27 real WSTETH matches
// span 3 pages. Collect the FULL sorted order by paging through with the
// real 'Next' control rather than assuming everything fits on one page.
async function fullSymbolOrderAcrossPages(page) {
  const order = [];
  for (;;) {
    order.push(...(await symbolOrder(page)));
    const next = page.locator('.pagination-button', { hasText: 'Next' });
    if ((await next.count()) === 0) break;
    if (await next.isDisabled()) break;
    const pageInfoBefore = await page.evaluate(() =>
      (document.querySelector('.pagination-info')?.textContent || '').trim());
    await next.click();
    await page.waitForFunction((prevInfo) =>
      (document.querySelector('.pagination-info')?.textContent || '').trim() !== prevInfo,
      pageInfoBefore, { timeout: 5000 }).catch(() => {});
  }
  return order;
}

async function main() {
  console.log('network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (routed to real committed data)');
  console.log(`target pool ${TARGET_POOL_ID}: committed kpis = ${JSON.stringify(targetPool.kpis)}`);
  console.log(`predicted risk-adjusted index among ${wstethMatches.length} real WSTETH-matching pools: ${predictedTargetIndex}`);

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });
    await routeCommon(page);

    // (a) Grid: snapshot-eligible path — fresh meta + the REAL committed
    // snapshot body, routed verbatim (playbook trap #1).
    const freshMeta = JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), count: SNAPSHOT.pools.length, bytes: SNAPSHOT_RAW.length });
    await page.route('**/data/pools-snapshot-meta.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: freshMeta }));
    await page.route('**/data/pools-snapshot.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: SNAPSHOT_RAW }));
    // Defensive fallback only — snapshotEligible should be true so this
    // should never actually be hit for the grid path.
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: SNAPSHOT.pools })
    }));

    let sharpeLabelEn = null;
    await test('AC5a: /?token=WSTETH real committed data + Risk-adjusted sort — ' +
      'the rail-nulled pool is NOT ahead of null-Sharpe pools (lands in the null/TVL-tiebreak group)', async () => {
      await page.goto(`http://localhost:${PORT}/?token=${TOKEN}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });

      sharpeLabelEn = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.view-toggle-btn.sort-toggle-btn'));
        const b = btns.find(x => x.textContent.trim() !== 'APY' && x.textContent.trim() !== 'TVL');
        return b ? b.textContent.trim() : null;
      });
      if (!sharpeLabelEn) throw new Error('Risk-adjusted sort button not found');
      await page.locator('.view-toggle-btn.sort-toggle-btn', { hasText: sharpeLabelEn }).click();
      await page.waitForTimeout(300); // let the sort + first page settle before paging through

      const order = await fullSymbolOrderAcrossPages(page);
      if (order.length !== wstethMatches.length) {
        throw new Error(`expected ${wstethMatches.length} rendered WSTETH cards, got ${order.length}: ${JSON.stringify(order)}`);
      }
      const renderedTargetIndex = order.indexOf('WSTETH-AAVE');
      if (renderedTargetIndex === -1) throw new Error(`WSTETH-AAVE card not rendered; order=${JSON.stringify(order)}`);
      if (renderedTargetIndex === 0) {
        throw new Error('WSTETH-AAVE sorted FIRST — the pre-145 bug (a poisoned-history Sharpe pulling it ahead of every null-Sharpe pool)');
      }
      if (renderedTargetIndex !== predictedTargetIndex) {
        throw new Error(`expected WSTETH-AAVE at index ${predictedTargetIndex} (real-data TVL tie-break among null-Sharpe pools), got ${renderedTargetIndex}. Rendered order: ${JSON.stringify(order)}`);
      }
    });

    // (b) Pool-detail: always-live path (app.js:1141) + the real kpis-merge
    // effect (app.js:1224) reading the real committed snapshot.
    const liveTargetPool = Object.assign({}, targetPool);
    delete liveTargetPool.kpis; // live endpoint never carries kpis — matches production
    await page.route('**/data/pools-snapshot-meta.json', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('**/data/pools-snapshot.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: SNAPSHOT_RAW }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: [liveTargetPool] })
    }));

    await test('AC5b: /?pool=<id> real committed pool renders the neutral TRACKED-tier note — ' +
      'no steadiness claim, no NaN/undefined/null text, zero page errors', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(TARGET_POOL_ID)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await page.waitForSelector('.pool-info-content', { timeout: 15000 });

      // The note depends on the async kpis-merge fetch (app.js:1224) landing
      // after the live pool render — poll instead of a fixed sleep.
      const deadline = Date.now() + 8000;
      let note = null;
      while (Date.now() < deadline) {
        note = await page.evaluate(() => {
          const el = document.querySelector('.rate-track-record-note');
          return el ? { present: true, text: el.textContent } : { present: false, text: null };
        });
        if (note.present) break;
        await page.waitForTimeout(150);
      }
      if (!note || !note.present) throw new Error('expected .rate-track-record-note to render after the kpis merge');

      const hp = targetPool.kpis.historyPoints; // real committed value (12)
      if (!note.text.includes("tracking this pool's rate")) {
        throw new Error(`expected the neutral TRACKED-tier copy, got: ${note.text}`);
      }
      if (!note.text.includes(String(hp))) {
        throw new Error(`expected the real historyPoints (${hp}) in the note, got: ${note.text}`);
      }
      if (note.text.includes('Steady so far')) {
        throw new Error(`expected NO steadiness claim (apyStdev is rail-nulled) — got: ${note.text}`);
      }
      if (/\bNaN\b|\bundefined\b|\bnull\b/.test(note.text)) {
        throw new Error(`expected no NaN/undefined/null text in the note — got: ${note.text}`);
      }
    });

    await test('AC5b: zero page errors across both renders', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`✓ ${passed}/${total} kpi-rail-history assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_kpi_rail_history crashed: ' + err.message);
  process.exitCode = 1;
});
