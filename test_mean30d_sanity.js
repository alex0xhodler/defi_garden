/* Playwright behavior gate for spec 144 (apyMean30d must never render outside
   the trust rail): drives the REAL rendered pool-detail UI (static server +
   chromium) and asserts on the rendered DOM / document.body.innerText — never
   on a return value. Acceptance criteria 1–4 are exercised as real
   `/?pool=<id>` renders.

   Fixture-routed like test_rate_volatility.js: browser-originated HTTPS is
   proxy-blocked in-sandbox (standing decision 2026-07-12), so the
   yields.llama.fi /pools fetch and the unpkg React/Babel scripts are stubbed
   with local vendored copies / a DefiLlama-shaped fixture snapshot. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.

   Run: node test_mean30d_sanity.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8796;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// --- DefiLlama-shaped fixtures ------------------------------------------
// All sized above DEFAULT_MIN_TVL ($100K as of spec 173, was $10M) so trust-rail filtering never hides
// them, and all with a total APY below the sanity limit (1000%) so anomaly
// demotion never interferes with the apyMean30d gate under test.
function makePool(overrides) {
  return Object.assign({
    pool: 'fixture-pool', project: 'aave-v3', symbol: 'USDC', chain: 'Base',
    tvlUsd: 45_000_000, apyBase: 0, apyReward: 0
  }, overrides);
}

// Criterion 1/2 — the live case (balancer-v2 WSTETH-AAVE, verbatim numbers from
// data/pools-snapshot.json): total APY 0.24% but a 36,452% "30-day mean".
const ABSURD = makePool({
  pool: 'absurd-mean-pool', project: 'balancer-v2', symbol: 'WSTETH-AAVE',
  chain: 'Ethereum', tvlUsd: 12_412_471,
  apyBase: 0.24482, apyReward: null, apyMean30d: 36452.38798
});
// Criterion 3a — ordinary sane mean: card MUST still render.
const SANE_STABLE = makePool({
  pool: 'sane-stable-pool', apyBase: 5.2, apyReward: 0, apyMean30d: 5.0
});
// Criterion 3b — item 071's shipped divergent case: card AND note MUST render.
const SANE_DIVERGENT = makePool({
  pool: 'sane-divergent-pool', apyBase: 100, apyReward: 42.84, apyMean30d: 405.32
});
// Criterion 4a — NaN. JSON cannot carry NaN, so the fixture ships a SANE value
// (999 → would render "999%") and an in-page fetch shim rewrites it to a real
// NaN before React sees it. If the shim ever stops working the card renders
// 999% and this test fails loudly rather than passing vacuously.
const NAN_MEAN = makePool({
  pool: 'nan-mean-pool', apyBase: 4, apyReward: 0, apyMean30d: 999
});
// Criterion 4b — negative mean (renders "-12.5%" unclamped today).
const NEGATIVE_MEAN = makePool({
  pool: 'negative-mean-pool', apyBase: 4, apyReward: 0, apyMean30d: -12.5
});
// Criterion 4c — non-finite via JSON overflow: 1e999 parses to Infinity, which
// is typeof 'number' and renders "∞%" without the magnitude gate.
const INFINITE_MEAN = makePool({
  pool: 'infinite-mean-pool', apyBase: 4, apyReward: 0, apyMean30d: '__INFINITY__'
});

const ALL_POOLS = [ABSURD, SANE_STABLE, SANE_DIVERGENT, NAN_MEAN, NEGATIVE_MEAN, INFINITE_MEAN];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: ALL_POOLS })
  .replace('"__INFINITY__"', '1e999');

let passed = 0;
const TOTAL = 8;
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

// Land directly on ?pool=<id> (the SEO / share deep-link path) and read the
// settled pool-detail DOM: the "30d Mean APY" stat card, the 071 note, the CTAs
// and the full rendered text of the page.
async function renderPool(page, poolId) {
  await page.goto(
    `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}`,
    { waitUntil: 'load', timeout: 20000 }
  );
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  // Pool Information is expanded by default; wait for its content to mount so
  // the stat grid (and any note) has had its render pass.
  await page.waitForSelector('.pool-info-content', { timeout: 15000 });
  // Cards/notes are conditional; give the render a settle window then read once.
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('.pool-info-content div'))
      .find((el) => el.children.length === 0 && el.textContent.trim() === '30d Mean APY');
    const card = label ? label.parentElement : null;
    const note = document.querySelector('.rate-volatility-note');
    const poolTypeLabel = Array.from(document.querySelectorAll('.pool-info-content div'))
      .find((el) => el.children.length === 0 && el.textContent.trim() === 'Pool Type');
    return {
      cardPresent: !!card,
      cardText: card ? card.textContent : null,
      notePresent: !!note,
      noteText: note ? note.textContent : null,
      ctaCount: document.querySelectorAll('.cta-button-primary').length,
      statGridPresent: !!poolTypeLabel,
      bodyText: document.body.innerText
    };
  });
}

async function main() {
  console.log('network: unpkg.com BLOCKED (local vendored React/Babel), ' +
    'yields.llama.fi BLOCKED (DefiLlama-shaped fixture snapshot)');

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
    // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically (a 200 keeps the browser console clean; a 404 would trip pageErrors guards).
    await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    // JSON cannot express NaN — patch the one fixture pool in-page, after the
    // routed response is parsed and before React renders it.
    await page.addInitScript(() => {
      const origFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const res = await origFetch(input, init);
        if (!/yields\.llama\.fi\/pools/.test(url)) return res;
        const data = await res.json();
        if (data && Array.isArray(data.data)) {
          data.data.forEach((p) => { if (p && p.pool === 'nan-mean-pool') p.apyMean30d = NaN; });
        }
        return { ok: true, status: 200, json: async () => data };
      };
    });

    // Criterion 1 — the live absurd case: card absent, number nowhere on the page.
    await test('absurd apyMean30d (36452.38798) renders no 30d Mean APY card and no 36,452 anywhere', async () => {
      const r = await renderPool(page, ABSURD.pool);
      if (r.cardPresent) throw new Error(`expected no "30d Mean APY" card, got: ${r.cardText}`);
      if (r.bodyText.includes('36,452')) throw new Error('page text contains "36,452"');
      if (r.bodyText.includes('36452')) throw new Error('page text contains "36452"');
    });

    // Criterion 2 — the 071 note cannot quote a hidden number; page still whole.
    await test('absurd pool suppresses the 071 note but still renders CTAs and the stat grid', async () => {
      const r = await renderPool(page, ABSURD.pool);
      if (r.notePresent) throw new Error(`expected no .rate-volatility-note, got: ${r.noteText}`);
      if (r.ctaCount < 1) throw new Error('expected at least one .cta-button-primary to render');
      if (!r.statGridPresent) throw new Error('expected the pool-info stat grid (Pool Type card) to render');
      if (!r.bodyText.includes('0.24%')) throw new Error('expected the real current APY (0.24%) to still render');
    });

    // Criterion 3a — no over-suppression of an ordinary sane mean.
    await test('sane apyMean30d (5.0) still renders the 30d Mean APY card with its value', async () => {
      const r = await renderPool(page, SANE_STABLE.pool);
      if (!r.cardPresent) throw new Error('expected the "30d Mean APY" card to render');
      if (!r.cardText.includes('5%')) throw new Error(`expected card text to contain "5%", got: ${r.cardText}`);
    });

    // Criterion 3b — item 071's shipped behavior is preserved.
    await test('sane divergent pool (142.84% vs 405.32%) still renders card + 071 note with both figures', async () => {
      const r = await renderPool(page, SANE_DIVERGENT.pool);
      if (!r.cardPresent) throw new Error('expected the "30d Mean APY" card to render');
      if (!r.cardText.includes('405.32%')) throw new Error(`expected card text to contain "405.32%", got: ${r.cardText}`);
      if (!r.notePresent) throw new Error('expected .rate-volatility-note to be present');
      if (!r.noteText.includes('142.84%')) throw new Error(`expected note to contain "142.84%", got: ${r.noteText}`);
      if (!r.noteText.includes('405.32%')) throw new Error(`expected note to contain "405.32%", got: ${r.noteText}`);
    });

    // Criterion 4a — NaN.
    await test('NaN apyMean30d renders no card, no "NaN%" and no fabricated value', async () => {
      const r = await renderPool(page, NAN_MEAN.pool);
      if (r.cardPresent) throw new Error(`expected no "30d Mean APY" card, got: ${r.cardText}`);
      if (r.bodyText.includes('NaN')) throw new Error('page text contains "NaN"');
      if (r.bodyText.includes('999%')) throw new Error('fetch shim did not apply — fixture value 999% rendered');
    });

    // Criterion 4b — negative mean.
    await test('negative apyMean30d (-12.5) renders no card and no negative percent', async () => {
      const r = await renderPool(page, NEGATIVE_MEAN.pool);
      if (r.cardPresent) throw new Error(`expected no "30d Mean APY" card, got: ${r.cardText}`);
      if (r.bodyText.includes('-12.5%')) throw new Error('page text contains "-12.5%"');
    });

    // Criterion 4c — non-finite mean.
    await test('non-finite apyMean30d (Infinity) renders no card and no "∞%"', async () => {
      const r = await renderPool(page, INFINITE_MEAN.pool);
      if (r.cardPresent) throw new Error(`expected no "30d Mean APY" card, got: ${r.cardText}`);
      if (r.bodyText.includes('∞')) throw new Error('page text contains "∞"');
    });

    // Zero page errors across every render above.
    await test('zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/' + TOTAL + ' mean30d sanity behavior assertions passed');
}

main().catch((err) => {
  console.error('test_mean30d_sanity crashed: ' + err.message);
  process.exitCode = 1;
});
