/* Regression test for spec 101: a subscription SHARE LINK must reproduce the
   sender's full multi-service mix (`selectedSubs`), not just the anchor `goal`.

   Before 101 the share URL carried only goal/capital/fm/years/dl/pace/chain/
   token — never the mix — so a Spotify+Netflix+Claude garden rebuilt as just the
   single anchor on the recipient's side. 101 adds a `mix` param on
   encodePlanToUrl (only for real multi/edited subscription mixes — single-pick
   and non-subscription URLs stay byte-identical) and decodes+validates+seeds it
   on arrival (mixTouched=true so the anchor seed effect never clobbers it, and
   the 099 slideCapital⇄neededCapital coverage recomputes from the restored mix).

   Asserts:
   (a) ENCODE: a multi-service mix (ChatGPT + Spotify) produces a share URL with
       `mix=chatgpt,spotify`; a single-service (anchor-only) pick produces a URL
       with NO `mix` param (byte-identical regression guard).
   (b) DECODE round-trip: opening ?...&mix=chatgpt,spotify,netflix rebuilds
       selectedSubs to exactly those services (rendered toggles ON) and the
       combined monthly total reflects the multi-mix, not just the anchor.
   (c) HONEST DEGRADATION: mix=spotify,garbage999,netflix seeds [spotify,netflix]
       (unknown dropped) with NO JS pageerror; mix=garbage alone falls back to
       the anchor goal, no error.

   Drives the REAL rendered plan.html UI (2026-07-11 standing decision — never
   fixture strings alone). Mirrors test_subscription_mix_seed.js's harness (local
   static server, real Chromium, vendored React/Babel + a routed pools fixture;
   browser-originated HTTPS to unpkg.com / yields.llama.fi is blocked at the
   proxy in this sandbox).

   Run: node test_share_mix_roundtrip.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8815; // distinct from other test_* files (8791-8803 taken)
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
    // never reuse storage across cases.
    async function routedPage(tag) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      // Force the clipboard-copy share path (not the native sheet) and capture
      // the URL the real doCopyLink handler writes — deterministic in headless.
      await ctx.addInitScript(() => {
        try { Object.defineProperty(navigator, 'share', { get: () => undefined, configurable: true }); } catch (e) {}
        window.__copiedUrl = null;
        try {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            get: () => ({ writeText: (txt) => { window.__copiedUrl = txt; return Promise.resolve(); } })
          });
        } catch (e) {}
      });
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
      // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically.
      await pg.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
      await pg.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
      }));
      return { ctx: ctx, page: pg };
    }

    const chatgptUrl = `http://localhost:${PORT}/plan.html?goal=chatgpt&pace=stable&capital=5000&fm=capital`;

    // ---- (a) ENCODE: multi-service mix produces mix=; anchor-only produces none.
    const enc = await routedPage('(a-enc)');
    await test('(a) encode: multi-service mix (ChatGPT+Spotify) writes mix= listing both ids', async () => {
      await enc.page.goto(chatgptUrl, { waitUntil: 'load', timeout: 20000 });
      let rows = await readMixRows(enc.page);
      assertOn(rows, 'ChatGPT');
      assertOff(rows, 'Spotify');

      // Toggle Spotify ON to build a real multi-service mix.
      const spotifyRow = enc.page.locator('.gp-mix-row', { has: enc.page.locator('.gp-mix-label', { hasText: 'Spotify' }) });
      await spotifyRow.click();
      await enc.page.waitForFunction(() => {
        const el = document.querySelector('.gp-mix-total');
        return el && el.textContent.indexOf('$32/mo') !== -1;
      }, { timeout: 5000 });
      rows = await readMixRows(enc.page);
      assertOn(rows, 'ChatGPT');
      assertOn(rows, 'Spotify');

      // Drive the REAL copy-link handler (doCopyLink) and capture the URL it
      // writes to the (stubbed) clipboard.
      await enc.page.evaluate(() => { window.__copiedUrl = null; });
      const copyBtn = enc.page.locator('.gp-share-prompt-btn').first();
      await copyBtn.click({ timeout: 5000 });
      await enc.page.waitForFunction(() => window.__copiedUrl !== null, { timeout: 5000 });
      const multiUrl = await enc.page.evaluate(() => window.__copiedUrl);
      const mp = new URL(multiUrl).searchParams.get('mix');
      if (!mp) throw new Error('multi-service share URL missing mix param: ' + multiUrl);
      const ids = mp.split(',');
      if (ids.indexOf('chatgpt') === -1 || ids.indexOf('spotify') === -1) {
        throw new Error('mix param does not list both ids, got: ' + mp + ' (url ' + multiUrl + ')');
      }
    });
    await enc.ctx.close();

    await test('(a-guard) encode: single-service anchor-only pick produces NO mix param', async () => {
      const g = await routedPage('(a-guard)');
      await g.page.goto(chatgptUrl, { waitUntil: 'load', timeout: 20000 });
      await readMixRows(g.page); // ensure seeded ([chatgpt] only, untouched)
      await g.page.evaluate(() => { window.__copiedUrl = null; });
      const copyBtn = g.page.locator('.gp-share-prompt-btn').first();
      await copyBtn.click({ timeout: 5000 });
      await g.page.waitForFunction(() => window.__copiedUrl !== null, { timeout: 5000 });
      const url = await g.page.evaluate(() => window.__copiedUrl);
      const mp = new URL(url).searchParams.get('mix');
      if (mp !== null) throw new Error('anchor-only URL must have NO mix param, got mix=' + mp + ' (url ' + url + ')');
      await g.ctx.close();
    });

    // ---- (b) DECODE round-trip: mix= rebuilds selectedSubs exactly.
    await test('(b) decode: ?mix=chatgpt,spotify,netflix rebuilds all three + reflects combined monthly', async () => {
      const b = await routedPage('(b)');
      const url = `http://localhost:${PORT}/plan.html?goal=chatgpt&pace=stable&capital=5000&fm=capital&mix=chatgpt,spotify,netflix`;
      await b.page.goto(url, { waitUntil: 'load', timeout: 20000 });
      const rows = await readMixRows(b.page);
      assertOn(rows, 'ChatGPT');
      assertOn(rows, 'Spotify');
      assertOn(rows, 'Netflix');
      assertOff(rows, 'Claude');
      assertOff(rows, 'Amazon');
      // Combined monthly reflects the multi-mix (ChatGPT $20 + Spotify $12 +
      // Netflix $18 = $50/mo), not just the $20 anchor.
      const total = (await b.page.textContent('.gp-mix-total')).trim();
      if (total.indexOf('$50/mo') === -1) {
        throw new Error('expected restored mix combined monthly $50/mo, got: ' + total);
      }
      await b.ctx.close();
    });

    // ---- (c) HONEST DEGRADATION.
    await test('(c1) decode: mix=spotify,garbage999,netflix drops the unknown → [spotify,netflix], no error', async () => {
      const c = await routedPage('(c1)');
      const url = `http://localhost:${PORT}/plan.html?goal=chatgpt&pace=stable&capital=5000&fm=capital&mix=spotify,garbage999,netflix`;
      await c.page.goto(url, { waitUntil: 'load', timeout: 20000 });
      const rows = await readMixRows(c.page);
      assertOn(rows, 'Spotify');
      assertOn(rows, 'Netflix');
      assertOff(rows, 'ChatGPT'); // not in the (valid) mix → anchor NOT force-added
      const total = (await c.page.textContent('.gp-mix-total')).trim();
      // Spotify $12 + Netflix $18 = $30/mo — the garbage id contributes nothing.
      if (total.indexOf('$30/mo') === -1) {
        throw new Error('expected degraded mix combined monthly $30/mo, got: ' + total);
      }
      await c.ctx.close();
    });

    await test('(c2) decode: mix=garbage (no valid id) falls back to the anchor goal, no error', async () => {
      const c = await routedPage('(c2)');
      const url = `http://localhost:${PORT}/plan.html?goal=chatgpt&pace=stable&capital=5000&fm=capital&mix=garbage`;
      await c.page.goto(url, { waitUntil: 'load', timeout: 20000 });
      const rows = await readMixRows(c.page);
      assertOn(rows, 'ChatGPT'); // fell back to anchor seed
      assertOff(rows, 'Spotify');
      assertOff(rows, 'Netflix');
      await c.ctx.close();
    });

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
  const total = 5;
  console.log(passed + '/' + total + ' share-mix-roundtrip assertions passed');
}

main().catch((err) => {
  console.error('test_share_mix_roundtrip crashed: ' + err.message);
  process.exitCode = 1;
});
