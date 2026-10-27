/* Playwright gate (2026-10-26 owner decision): the pool view (/?pool=<id>, the
   Decision Terminal) carries NO card pitch in any language — no Yield-Funded Virtual
   Card widget, no "Get ... Yield Card" CTA, no Laso issuance terminal, no card
   waitlist, no LasoService calls (even with a stored pending card that would
   otherwise auto-resume the terminal) — and the buy box holds exactly one primary
   CTA (the protocol handoff). The card code is kept (PoolDetail.js
   CARD_FLOW_ENABLED) and /for/* stays live; this test pins the pool view only.
   Run: node test_pool_view_no_card.js */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8861;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi|yields\.llama\.fi\/chart|fontshare\.com|www\.google\.com\/s2\/favicons|coingecko/i;

const FIXTURE_POOLS = [
  { pool: 'aaaaaaaa-0000-4000-8000-000000000001', project: 'morpho-blue', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 250_000_000, apyBase: 5.4, apyReward: 0, apyMean30d: 5.3 },
  { pool: 'aaaaaaaa-0000-4000-8000-000000000002', project: 'ondo-yield-assets', symbol: 'USDY', chain: 'Ethereum', tvlUsd: 1_200_000_000, apyBase: 3.6, apyReward: 0, apyMean30d: 3.6 },
  // Volatile: current vs 30d mean >= 1.5x renders the rate-volatility honesty note.
  { pool: 'aaaaaaaa-0000-4000-8000-000000000003', project: 'aave-v3', symbol: 'USDT', chain: 'Arbitrum', tvlUsd: 40_000_000, apyBase: 12.5, apyReward: 0, apyMean30d: 5.0 }
];
const VIEWPORTS = [[1280, 800], [360, 740]];
const LANGS = ['en', 'ko'];

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

async function preparePage(page) {
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  // Stale snapshot -> the app falls through to the routed live /pools fixture.
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data: FIXTURE_POOLS })
  }));
  await page.route('https://api.llama.fi/protocols', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '[]'
  }));
}


const CARD_SELECTORS = [
  '#yield-card-widget', '.yield-card-terminal', '[class*="yield-card"]',
  '[class*="laso"]', '[id*="laso"]', '[class*="waitlist"]', '[id*="waitlist"]'
].join(',');
const CARD_TEXT = /yield[- ]funded virtual card|virtual (visa )?card|yield card|laso|waitlist|가상 ?카드|대기자/i;

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  let passed = 0;
  let failed = 0;
  try {
    for (const lang of LANGS) {
      for (const [w, h] of VIEWPORTS) {
        const name = `${lang} ${w}x${h}`;
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        const lasoRequests = [];
        page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const source = (msg.location() && msg.location().url) || '';
          if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) errors.push('console.error: ' + msg.text());
        });
        page.on('request', (req) => { if (/laso\.finance|\/api\/laso/i.test(req.url())) lasoRequests.push(req.url()); });
        try {
          await preparePage(page);
          // A stored PENDING card: with the flow on this would auto-open the Laso terminal.
          await page.addInitScript(() => {
            try {
              localStorage.setItem('defi_garden_laso_anonymous_cards', JSON.stringify([{ card_id: 'c_test', status: 'pending', id_token: 't' }]));
              sessionStorage.setItem('defi_garden_selected_sub', 'netflix');
            } catch (_e) {}
            window.__lasoCalls = [];
            const wrap = () => {
              const svc = window.LasoService;
              if (!svc || svc.__wrapped) return;
              svc.__wrapped = true;
              Object.keys(svc).forEach((k) => {
                if (typeof svc[k] !== 'function' || k === 'getStoredCards') return;
                const orig = svc[k];
                svc[k] = function () { window.__lasoCalls.push(k); return orig.apply(this, arguments); };
              });
            };
            document.addEventListener('DOMContentLoaded', wrap);
            window.addEventListener('load', wrap);
          });
          await page.goto(`http://localhost:${PORT}/?pool=${FIXTURE_POOLS[0].pool}&lang=${lang}`, { waitUntil: 'load', timeout: 20000 });
          await page.waitForSelector('.pool-hero-actions .cta-button-primary', { timeout: 15000 });
          await page.waitForSelector('#decision-terminal', { timeout: 15000 });
          await page.waitForTimeout(800);
          const m = await page.evaluate((sel) => {
            const view = document.querySelector('.pool-detail-view');
            return {
              cardNodes: Array.from(document.querySelectorAll(sel)).map((el) => el.className || el.id),
              primaryCount: document.querySelectorAll('.pool-detail-view .cta-button-primary').length,
              primaryText: (document.querySelector('.pool-detail-view .cta-button-primary') || {}).textContent || '',
              primaryIsProtocol: !!document.querySelector('.pool-detail-view .cta-button-primary.cta-button-protocol'),
              viewText: view ? view.innerText : '',
              lasoCalls: window.__lasoCalls || [],
              hash: location.hash
            };
          }, CARD_SELECTORS);
          assert.deepStrictEqual(m.cardNodes, [], 'no card/Laso/waitlist DOM on the pool view: ' + m.cardNodes.join(', '));
          assert.ok(!CARD_TEXT.test(m.viewText), 'no card/Laso/waitlist copy on the pool view: ' + (m.viewText.match(CARD_TEXT) || [])[0]);
          assert.strictEqual(m.primaryCount, 1, 'exactly one primary CTA in the buy box, got ' + m.primaryCount);
          assert.ok(m.primaryIsProtocol, 'the one primary CTA is the protocol handoff');
          assert.ok(m.primaryText.trim().length > 0, 'primary CTA has a label');
          assert.deepStrictEqual(m.lasoCalls, [], 'no LasoService calls: ' + m.lasoCalls.join(','));
          assert.deepStrictEqual(lasoRequests, [], 'no laso.finance / api/laso requests');
          if (errors.length) throw new Error(errors.join('\n'));
          passed++;
          console.log('  ✓ ' + name);
        } catch (err) {
          failed++;
          console.error('  ✗ ' + name + '\n    ' + err.message);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error('pool view no-card test failed: ' + err.message); process.exitCode = 1; });
