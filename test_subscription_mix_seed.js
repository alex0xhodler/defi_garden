/* Regression test for a live production bug (human ticket 2026-07-14, spec 085):
   picking a subscription (e.g. ChatGPT Plus) then a risk landed at the bloom
   "checkout" with the picked service AND Spotify selected — with ANY anchor,
   Spotify was auto-selected by default.

   Cause: the mix seed effect (planner.js) seeded `selectedSubs` from
   `coveredBundle(slideCapital, apy, goal).covered` — every anchored-ladder rung
   the capital already covered — instead of the user's pick. Spotify ($12/mo,
   the cheapest non-anchor rung) tagged along whenever the default/entered
   capital covered anchor + $12/mo. Fix: seed `selectedSubs` with exactly
   `[goal]` (the anchor); coveredBundle stays in use only for unlocked/pct
   display + report/share bundles.

   Share-restore note (traced for spec 085 AC #2): the share URL format
   (encodePlanToUrl / decodePlanFromUrl in planner.js) does NOT carry the mix at
   all — only goal, capital/monthly, fm, years, dl, pace, chain, token. The
   localStorage-saved plan carries `mix`, but only the returning-visitor report
   view consumes it; the Bloom mix is always RE-DERIVED on arrival by this seed
   effect. So a shared subscription plan's preserved "pick" is its anchor goal
   (carried as ?goal=), which is exactly what the [goal] seed reproduces — and
   Spotify no longer auto-tags-along on arrival. Case (d) asserts that.

   Drives the REAL rendered plan.html UI (2026-07-11 standing decision — never
   fixture strings alone). Mirrors test_growth_capital_projection.js's harness
   (local static server, real Chromium, vendored React/Babel + a routed pools
   fixture; browser-originated HTTPS to unpkg.com / yields.llama.fi is blocked
   at the proxy in this sandbox).

   Run: node test_subscription_mix_seed.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8802; // 8791-8801 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// One stable USDC lending pool clears the `stable` persona rails
// (planner.js PERSONAS.stable: minTvl 50M, stableOnly, maxApy = sanity limit).
// 8.5% is chosen so the DEFAULT $5,000 capital covers the anchor forever number
// AND anchor+Spotify's cumulative — the exact condition that used to seed
// Spotify. forever(chatgpt 20/mo @ 8.5%) ~= $2,824; forever(32/mo) ~= $4,517;
// both <= $5,000, so pre-fix coveredBundle = [chatgpt, spotify]. Post-fix the
// seed must still be [chatgpt] only.
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('stable-usdc-eth', 'aave-v3', 'USDC', 'Ethereum', 60_000_000, 8.5)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

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

// Read the rendered mix toggle rows: label text + on-state (both the is-on
// class and aria-pressed, so we assert the RENDERED toggle, not internal state).
async function readMixRows(page) {
  await page.waitForSelector('.gp-mix-row', { timeout: 15000 });
  return page.$$eval('.gp-mix-row', (els) => els.map((el) => ({
    label: (el.querySelector('.gp-mix-label') || {}).textContent ? el.querySelector('.gp-mix-label').textContent.trim() : '',
    on: el.classList.contains('is-on'),
    pressed: el.getAttribute('aria-pressed')
  })));
}
function rowFor(rows, labelSubstr) {
  const r = rows.find((x) => x.label.indexOf(labelSubstr) !== -1);
  if (!r) throw new Error('no mix row matching "' + labelSubstr + '" — rows: ' + JSON.stringify(rows));
  return r;
}
function assertOn(rows, labelSubstr) {
  const r = rowFor(rows, labelSubstr);
  if (!r.on || r.pressed !== 'true') {
    throw new Error('expected "' + labelSubstr + '" SELECTED, got ' + JSON.stringify(r) + ' — rows: ' + JSON.stringify(rows));
  }
}
function assertOff(rows, labelSubstr) {
  const r = rowFor(rows, labelSubstr);
  if (r.on || r.pressed !== 'false') {
    throw new Error('expected "' + labelSubstr + '" NOT selected, got ' + JSON.stringify(r) + ' — rows: ' + JSON.stringify(rows));
  }
}

async function main() {
  console.log('network: unpkg.com BLOCKED (using local vendored React/Babel), yields.llama.fi BLOCKED (using fixture pool)');

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const pageErrors = [];
    const nodeModules = path.join(ROOT, 'node_modules');
    const vendored = {
      'https://unpkg.com/react@18/umd/react.production.min.js':
        path.join(nodeModules, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
        path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js':
        path.join(nodeModules, '@babel/standalone/babel.min.js')
    };
    // Each independent goal arrives in its OWN fresh context: a subscription
    // bloom that auto-saved a plan to localStorage would route the NEXT
    // navigation into the returning-visitor report view (no mix rows). So we
    // never reuse storage across the (a/c), (b), (d) cases.
    async function routedPage(tag) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const pg = await ctx.newPage();
      pg.on('pageerror', (err) => pageErrors.push('pageerror' + tag + ': ' + err.message));
      pg.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const source = (msg.location() && msg.location().url) || '';
        if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
          pageErrors.push('console.error' + tag + ': ' + msg.text() + (source ? ' (' + source + ')' : ''));
        }
      });
      for (const [url, localPath] of Object.entries(vendored)) {
        await pg.route(url, (route) => route.fulfill({
          status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
        }));
      }
      await pg.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
      }));
      return { ctx: ctx, page: pg };
    }

    // Reach subscription bloom deterministically via a share-style URL: goal +
    // pace (persona) + capital + fm=capital satisfies decodePlanFromUrl and the
    // "fast-forward to bloom" effect (needs goal, persona, and capital/monthly).
    const chatgptUrl = `http://localhost:${PORT}/plan.html?goal=chatgpt&pace=stable&capital=5000&fm=capital`;
    const netflixUrl = `http://localhost:${PORT}/plan.html?goal=netflix&pace=stable&capital=5000&fm=capital`;

    // (a) + (c) share one fresh context: (a) checks the untouched seed, then (c)
    // toggles on the SAME page to exercise the toggle path from that seed.
    const ac = await routedPage('(a/c)');
    await test('(a) chatgpt bloom seeds ONLY ChatGPT — Spotify is NOT auto-selected', async () => {
      await ac.page.goto(chatgptUrl, { waitUntil: 'load', timeout: 20000 });
      const rows = await readMixRows(ac.page);
      assertOn(rows, 'ChatGPT');
      assertOff(rows, 'Spotify');
      // Every other non-anchor rung is off too.
      assertOff(rows, 'Netflix');
      assertOff(rows, 'Claude');
      assertOff(rows, 'Amazon');
    });

    // (c) toggling Spotify on manually still works and updates the rendered mix
    // + the combined monthly figure (ChatGPT $20/mo -> ChatGPT+Spotify $32/mo).
    await test('(c) manually toggling Spotify ON flips its row and updates the combined monthly', async () => {
      const before = (await ac.page.textContent('.gp-mix-total')).trim();
      if (before.indexOf('$20/mo') === -1) {
        throw new Error('expected the seeded ChatGPT-only total to read $20/mo, got: ' + before);
      }
      const spotifyRow = ac.page.locator('.gp-mix-row', { has: ac.page.locator('.gp-mix-label', { hasText: 'Spotify' }) });
      await spotifyRow.click();
      await ac.page.waitForFunction(() => {
        const el = document.querySelector('.gp-mix-total');
        return el && el.textContent.indexOf('$32/mo') !== -1;
      }, { timeout: 5000 });
      const rows = await readMixRows(ac.page);
      assertOn(rows, 'ChatGPT'); // anchor stays on
      assertOn(rows, 'Spotify'); // now toggled on
      const after = (await ac.page.textContent('.gp-mix-total')).trim();
      if (after.indexOf('$32/mo') === -1) {
        throw new Error('expected combined monthly to update to $32/mo after adding Spotify, got: ' + after);
      }
    });
    await ac.ctx.close();

    // (b) a different anchor (netflix), own fresh context → only Netflix ON.
    await test('(b) netflix bloom seeds ONLY Netflix — Spotify is NOT auto-selected', async () => {
      const b = await routedPage('(b)');
      await b.page.goto(netflixUrl, { waitUntil: 'load', timeout: 20000 });
      const rows = await readMixRows(b.page);
      assertOn(rows, 'Netflix');
      assertOff(rows, 'Spotify');
      assertOff(rows, 'ChatGPT');
      assertOff(rows, 'Claude');
      assertOff(rows, 'Amazon');
      await b.ctx.close();
    });

    // (d) share-restore integrity: the share format re-derives (never carries)
    // the mix, so the preserved user pick is the anchor goal carried as ?goal=.
    // Opening a share-style subscription URL must arrive with ONLY the anchor
    // selected — the previous coveredBundle seed would have added Spotify here.
    await test('(d) share-style URL arrives with ONLY the anchor selected (mix re-derived, not carried)', async () => {
      const d = await routedPage('(d)');
      await d.page.goto(chatgptUrl, { waitUntil: 'load', timeout: 20000 });
      const rows = await readMixRows(d.page);
      assertOn(rows, 'ChatGPT');
      assertOff(rows, 'Spotify');
      await d.ctx.close();
    });

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
  const total = 4;
  console.log(passed + '/' + total + ' subscription-mix-seed assertions passed');
}

main().catch((err) => {
  console.error('test_subscription_mix_seed crashed: ' + err.message);
  process.exitCode = 1;
});
