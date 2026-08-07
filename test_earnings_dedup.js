/* Rendered Playwright test for backlog 128 — dedup the pool-detail earnings
   numbers. Before backlog 128 the daily/monthly earnings figure appeared
   THREE times on the pool-detail page: the top "quick metrics" stat cards
   (Daily + Monthly), the calculator's expandable result, AND a redundant
   numeric "Quick estimate for $1,000: $0.1/day" subhead on the calculator
   header. 128's consolidation kept ONE at-a-glance earnings surface (the top
   stat cards) + the calculator, and removed the numeric quick-estimate
   subhead, replacing it with a non-numeric invite line (`calcSubPrompt`).

   RE-POINTED for spec 210 (input-first earnings block merge, see
   specs/210-notes.md for the line-by-line justification): 210 went one step
   further and removed the top "quick metrics" stat cards ENTIRELY — the
   single earnings surface is now the calculator readout alone (the 1D/7D/30D
   toggle inside `calculator-compact`), fed by the same input the projection
   headline above it uses. Criterion (1) below is RE-POINTED from "the stat
   cards render Daily+Monthly" to "the stat cards are ABSENT" — this is not a
   weakened assertion, it's the opposite fact: 210 deleted the duplicate
   surface (1) used to require present.

   This test also now carries 210's page-level de-duplication acceptance
   criteria (added here per the spec's instruction to reuse this file rather
   than open a new one): the `~$X in 5y` projection string appears AT MOST
   TWICE (was 3× before 210: hero CTA label, Long Game headline, repeat CTA
   label — the hero CTA no longer carries a projection, so this is headline +
   repeat CTA only), the disclaimer sentence appears EXACTLY ONCE, and the
   BASE APY / REWARD APY / POOL TYPE tiles are absent from Pool Information.

   This test proves, against a REAL render (not source reading, per the
   2026-07-11 standing decision that UX acceptance measures rendered
   behaviour):
   (1) the standalone daily/monthly stat cards (`.quick-metrics`) are ABSENT —
       the single earnings surface is now the calculator readout;
   (2) the calculator header subhead is the non-numeric prompt and carries NO
       "$X/day" figure;
   (3) no "Quick estimate" copy survives anywhere on the page;
   (4) the `~$X in 5y` projection string appears at most twice on the page;
   (5) the calc-disclaimer sentence appears exactly once on the page;
   (6) the BASE APY / REWARD APY / POOL TYPE tiles are absent from Pool
       Information;
   (7) no unexpected page/console errors.

   Fixture-routed (unpkg React/Babel vendored, snapshot 404'd to force the
   live path) — the house pattern from test_northstar_cta_fires.js/
   test_search.js; browser-originated external HTTPS is blocked in this
   sandbox (NORTH_STAR.md 2026-07-12 standing decision).

   Run: node test_earnings_dedup.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8819; // distinct from other test_* files (8791-8818 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — reused from test_northstar_cta_fires.js so the fixture stays
// byte-stable regardless of snapshot regeneration cadence; verified present
// in the snapshot before the test runs.
const POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [POOL] });

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

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        pageErrors.push('console.error: ' + m.text());
    });

    const nm = path.join(ROOT, 'node_modules');
    for (const [url, lp] of Object.entries({
      'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
    })) {
      await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
    }
    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

    // (1) RE-POINTED (210): the standalone daily/monthly stat cards
    // (.quick-metrics) are now ABSENT — merged into the calculator readout,
    // the single earnings surface. This is the opposite fact from what 128
    // asserted (stat cards present) because 210 deleted the duplicate
    // surface 128 required.
    await test('.quick-metrics stat cards are ABSENT (merged into the calculator readout, 210)', async () => {
      const count = await page.locator('.quick-metrics').count();
      if (count !== 0) throw new Error(`expected .quick-metrics to be gone (merged away by 210), found ${count}`);
    });

    await test('calculator header subhead is the non-numeric prompt (no "$X/day", no "Quick estimate")', async () => {
      const headerText = await page.locator('.calculator-header').innerText();
      if (!/See your daily, weekly & monthly returns/i.test(headerText)) {
        throw new Error(`expected the non-numeric calcSubPrompt in the calculator header — got:\n${headerText}`);
      }
      if (/\$[\d.,]+\s*\/\s*day/i.test(headerText)) {
        throw new Error(`calculator header still shows a redundant "$X/day" quick-estimate figure — got:\n${headerText}`);
      }
      if (/Quick estimate/i.test(headerText)) {
        throw new Error(`calculator header still shows the "Quick estimate" copy — got:\n${headerText}`);
      }
    });

    await test('no "Quick estimate" copy survives anywhere on the pool-detail page', async () => {
      const bodyText = await page.locator('.pool-detail-view').innerText();
      if (/Quick estimate/i.test(bodyText)) {
        throw new Error('the removed "Quick estimate" subhead copy is still rendering somewhere on the page');
      }
    });

    // --- 210 de-duplication acceptance criteria (added here per the spec's
    // instruction to reuse this file rather than open a new one) ---

    await test('210: the "~$X in 5y" projection string appears AT MOST TWICE on the page (was 3x pre-210)', async () => {
      const bodyText = await page.locator('.pool-detail-view').innerText();
      const matches = bodyText.match(/in 5y/g) || [];
      if (matches.length > 2) {
        throw new Error(`expected "in 5y" to appear at most twice, found ${matches.length} times in:\n${bodyText}`);
      }
      if (matches.length === 0) {
        throw new Error('expected "in 5y" to appear at least once (the Long Game headline) — projection may be missing entirely');
      }
    });

    await test('210: the calc-disclaimer sentence appears EXACTLY ONCE on the page', async () => {
      const count = await page.locator('.calc-disclaimer').count();
      if (count !== 1) throw new Error(`expected exactly one .calc-disclaimer, found ${count}`);
    });

    await test('210: BASE APY / REWARD APY / POOL TYPE tiles are absent from Pool Information', async () => {
      const infoText = await page.locator('.pool-info-section').last().innerText();
      if (/\bBase APY\b/i.test(infoText)) throw new Error(`Base APY tile still present in Pool Information:\n${infoText}`);
      if (/\bReward APY\b/i.test(infoText)) throw new Error(`Reward APY tile still present in Pool Information:\n${infoText}`);
      if (/\bPool Type\b/i.test(infoText)) throw new Error(`Pool Type tile still present in Pool Information:\n${infoText}`);
    });

    await test('210: a TVL tile renders in Pool Information in the same tile shape', async () => {
      const infoText = await page.locator('.pool-info-section').last().innerText();
      if (!/\bTVL\b/.test(infoText)) throw new Error(`expected a TVL tile in Pool Information, got:\n${infoText}`);
    });

    await test('no unexpected page/console errors', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_earnings_dedup.js: ${passed}/8 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
