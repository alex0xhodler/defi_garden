/* Rendered-Playwright acceptance for spec 106: plan-level "projection
   confidence" note on the planner bloom. The note summarizes the track record
   of the `curated` set behind the blended rate using 087's stored kpis
   (apyStdev / historyPoints), on the bloom view both archetypes share.

   Unlike test_share_mix_roundtrip.js (which routes a STALE snapshot to force
   the no-kpis live path), this test serves a FRESH meta (generatedAt = now,
   schemaVersion:1) + a pools-snapshot.json whose pools carry controlled kpis,
   so the snapshot path loads and the tiers fire. F4 alone routes a STALE meta
   so the FE falls through to the live yields.llama.fi fixture (no kpis) and the
   note must hide honestly.

   Fixture pools clear the `stable` persona rails (>=3 distinct-project stable
   USDC-like pools, tvlUsd >= 60M, apyBase <= sanity). Drives the REAL
   plan.html subscription bloom (?goal=claude&pace=stable).

   Cases:
   - F1. All 3 pools hp:30, apyStdev:0.5, apy~8% (ratio<=0.2) -> STEADY copy incl. "30".
   - F2. Mixed (1 steady hp:30,stdev:0.5; 2 with hp:30,stdev:6 ratio>0.2) -> PARTIAL copy incl. "1" & "3".
   - F3. All 3 pools hp:2, apyStdev:null -> BUILDING copy (number-free).
   - F4. STALE meta -> live fixture (no kpis) -> .gp-plan-confidence ABSENT.
   - F5. ?lang=ko on the STEADY fixture -> Korean copy substring present.
   - F6. Zero page errors across all renders.

   Run: node test_plan_confidence.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8817; // distinct from other test_* files (8791-8816 taken)
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Three distinct-project stable USDC lending pools clear the `stable` persona
// rails (planner.js PERSONAS.stable: minTvl 50M, stableOnly, maxApy = sanity).
// `kpis` is per-case controlled; each carries the 087 shape.
function makePool(id, project, apyBase, kpis) {
  var p = { pool: id, project: project, symbol: 'USDC', chain: 'Ethereum', tvlUsd: 60000000, apyBase: apyBase, apyReward: 0 };
  if (kpis) p.kpis = kpis;
  return p;
}
function kpi(historyPoints, apyStdev) {
  return { historyPoints: historyPoints, firstSeen: '2026-06-01', apyMomentum: 0, apyStdev: apyStdev, tvlTrend: 0 };
}

// F1/F5 STEADY: all three steady (stdev/apy ratio <= 0.2, hp >= 7).
const POOLS_STEADY = [
  makePool('usdc-aave', 'aave-v3', 8.0, kpi(30, 0.5)),
  makePool('usdc-compound', 'compound-v3', 8.2, kpi(30, 0.5)),
  makePool('usdc-morpho', 'morpho-blue', 7.8, kpi(30, 0.5))
];
// F2 PARTIAL: one steady, two with ratio > 0.2 (stdev 6 / apy 8 = 0.75).
const POOLS_PARTIAL = [
  makePool('usdc-aave', 'aave-v3', 8.0, kpi(30, 0.5)),
  makePool('usdc-compound', 'compound-v3', 8.0, kpi(30, 6)),
  makePool('usdc-morpho', 'morpho-blue', 8.0, kpi(30, 6))
];
// F3 BUILDING: all three tracked (hp >= 1) but none steady (hp < 7, stdev null).
const POOLS_BUILDING = [
  makePool('usdc-aave', 'aave-v3', 8.0, kpi(2, null)),
  makePool('usdc-compound', 'compound-v3', 8.2, kpi(2, null)),
  makePool('usdc-morpho', 'morpho-blue', 7.8, kpi(2, null))
];
// F4 live fixture: same rail-passing pools but NO kpis (cold-CDN / live path).
const POOLS_LIVE_NO_KPIS = [
  makePool('usdc-aave', 'aave-v3', 8.0, null),
  makePool('usdc-compound', 'compound-v3', 8.2, null),
  makePool('usdc-morpho', 'morpho-blue', 7.8, null)
];

function snapshotBody(pools) {
  return JSON.stringify({ schemaVersion: 1, pools: pools });
}
function liveBody(pools) {
  return JSON.stringify({ status: 'success', data: pools });
}
function freshMeta(count) {
  return JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), count: count, bytes: 1000 });
}
const STALE_META = JSON.stringify({ schemaVersion: 1, generatedAt: '2020-01-01T00:00:00.000Z', count: 3, bytes: 1000 });

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

async function main() {
  console.log('network: unpkg.com BLOCKED (using local vendored React/Babel), snapshot + yields.llama.fi ROUTED (fixtures)');

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const pageErrors = [];
  try {
    const nodeModules = path.join(ROOT, 'node_modules');
    const vendored = {
      'https://unpkg.com/react@18/umd/react.production.min.js':
        path.join(nodeModules, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
        path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js':
        path.join(nodeModules, '@babel/standalone/babel.min.js')
    };

    // Each case gets its OWN fresh context (auto-saved plans in localStorage
    // would route a reused context into the returning-visitor report view).
    // opts: { tag, meta, snapshotPools, livePools, lang }
    async function renderBloom(opts) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const pg = await ctx.newPage();
      pg.on('pageerror', (err) => pageErrors.push('pageerror' + opts.tag + ': ' + err.message));
      pg.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const source = (msg.location() && msg.location().url) || '';
        if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
          pageErrors.push('console.error' + opts.tag + ': ' + msg.text() + (source ? ' (' + source + ')' : ''));
        }
      });
      for (const [url, localPath] of Object.entries(vendored)) {
        await pg.route(url, (route) => route.fulfill({
          status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
        }));
      }
      await pg.route('**/data/pools-snapshot-meta.json', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: opts.meta
      }));
      await pg.route('**/data/pools-snapshot.json', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: snapshotBody(opts.snapshotPools || [])
      }));
      await pg.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: liveBody(opts.livePools || [])
      }));

      const lang = opts.lang ? ('&lang=' + opts.lang) : '';
      const url = 'http://localhost:' + PORT + '/plan.html?goal=claude&pace=stable&capital=5000&fm=capital' + lang;
      await pg.goto(url, { waitUntil: 'load', timeout: 20000 });
      // Wait until pools have loaded: the subscription customize summary shows the
      // real blended rate (not the pre-load "0.00%"). This confirms `curated` is
      // populated in EVERY case, so an absent note in F4 is an honest hide.
      await pg.waitForFunction(() => {
        const el = document.querySelector('.gp-sub-customize-rate');
        return el && el.textContent && /%/.test(el.textContent) && el.textContent.indexOf('0.00%') === -1;
      }, { timeout: 15000 });
      return { ctx: ctx, page: pg };
    }

    async function confidenceText(page) {
      return page.$$eval('.gp-plan-confidence-text', (els) => els.map((el) => el.textContent.trim()));
    }
    async function confidenceCount(page) {
      return page.$$eval('.gp-plan-confidence', (els) => els.length);
    }

    // ---- F1. STEADY ----
    await test('F1 STEADY: all 3 pools steady -> note present, STEADY copy incl. "30"', async () => {
      const r = await renderBloom({ tag: '(F1)', meta: freshMeta(3), snapshotPools: POOLS_STEADY, livePools: POOLS_STEADY });
      await r.page.waitForSelector('.gp-plan-confidence', { timeout: 10000 });
      const texts = await confidenceText(r.page);
      if (texts.length !== 1) throw new Error('expected exactly one confidence note, got ' + texts.length + ': ' + JSON.stringify(texts));
      if (texts[0].indexOf('30') === -1) throw new Error('STEADY copy must include the day count "30", got: ' + texts[0]);
      if (texts[0].toLowerCase().indexOf('steady') === -1) throw new Error('expected STEADY copy, got: ' + texts[0]);
      await r.ctx.close();
    });

    // ---- F2. PARTIAL ----
    await test('F2 PARTIAL: 1 of 3 steady -> note present, PARTIAL copy incl. "1" and "3"', async () => {
      const r = await renderBloom({ tag: '(F2)', meta: freshMeta(3), snapshotPools: POOLS_PARTIAL, livePools: POOLS_PARTIAL });
      await r.page.waitForSelector('.gp-plan-confidence', { timeout: 10000 });
      const texts = await confidenceText(r.page);
      if (texts.length !== 1) throw new Error('expected exactly one confidence note, got ' + texts.length + ': ' + JSON.stringify(texts));
      if (texts[0].indexOf('1') === -1 || texts[0].indexOf('3') === -1) {
        throw new Error('PARTIAL copy must include steady count "1" and total "3", got: ' + texts[0]);
      }
      // Distinguish from STEADY/BUILDING: PARTIAL mentions "rest".
      if (texts[0].toLowerCase().indexOf('rest') === -1) throw new Error('expected PARTIAL copy, got: ' + texts[0]);
      await r.ctx.close();
    });

    // ---- F3. BUILDING ----
    await test('F3 BUILDING: hp<7, stdev null -> note present, BUILDING copy (number-free)', async () => {
      const r = await renderBloom({ tag: '(F3)', meta: freshMeta(3), snapshotPools: POOLS_BUILDING, livePools: POOLS_BUILDING });
      await r.page.waitForSelector('.gp-plan-confidence', { timeout: 10000 });
      const texts = await confidenceText(r.page);
      if (texts.length !== 1) throw new Error('expected exactly one confidence note, got ' + texts.length + ': ' + JSON.stringify(texts));
      if (/[0-9]/.test(texts[0])) throw new Error('BUILDING copy must be number-free, got: ' + texts[0]);
      if (texts[0].toLowerCase().indexOf('still building') === -1) throw new Error('expected BUILDING copy, got: ' + texts[0]);
      await r.ctx.close();
    });

    // ---- F4. Live path (no kpis) -> note ABSENT ----
    await test('F4 LIVE: stale meta -> live fixture (no kpis) -> .gp-plan-confidence ABSENT', async () => {
      const r = await renderBloom({ tag: '(F4)', meta: STALE_META, snapshotPools: POOLS_LIVE_NO_KPIS, livePools: POOLS_LIVE_NO_KPIS });
      const count = await confidenceCount(r.page);
      if (count !== 0) {
        const texts = await confidenceText(r.page);
        throw new Error('expected NO confidence note on the no-kpis live path, got ' + count + ': ' + JSON.stringify(texts));
      }
      await r.ctx.close();
    });

    // ---- F5. Korean copy ----
    await test('F5 KO: ?lang=ko on STEADY fixture -> Korean copy substring present', async () => {
      const r = await renderBloom({ tag: '(F5)', meta: freshMeta(3), snapshotPools: POOLS_STEADY, livePools: POOLS_STEADY, lang: 'ko' });
      await r.page.waitForSelector('.gp-plan-confidence', { timeout: 10000 });
      const texts = await confidenceText(r.page);
      if (texts.length !== 1) throw new Error('expected exactly one confidence note, got ' + texts.length + ': ' + JSON.stringify(texts));
      if (texts[0].indexOf('믿기 쉬워집니다') === -1) {
        throw new Error('expected Korean STEADY copy substring, got: ' + texts[0]);
      }
      if (texts[0].indexOf('30') === -1) throw new Error('Korean STEADY copy must include the day count "30", got: ' + texts[0]);
      await r.ctx.close();
    });

    // ---- F6. Zero page errors ----
    await test('F6 no page/console errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors during run:\n' + pageErrors.join('\n'));
    });
  } finally {
    await browser.close();
    server.close();
  }
  const total = 6;
  console.log(passed + '/' + total + ' plan-confidence assertions passed');
}

main().catch((err) => {
  console.error('test_plan_confidence crashed: ' + err.message);
  process.exitCode = 1;
});
