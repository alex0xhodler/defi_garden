/*
 * test_garden_cta_arrival.js — item 143
 *
 * Verifies the "Garden this pool →" CTA arrival is framed honestly and does NOT
 * masquerade as a genuine share (copy + metric integrity), WITHOUT changing the
 * genuine-share arrival (item 007 regression guard).
 *
 * Fixture-routing mirrors audit-app.js / test_search.js / scratchpad/ns_clickthrough.js:
 *   - unpkg vendor served from node_modules
 *   - ?pool= deep-links go LIVE, so https://yields.llama.fi/pools is routed to the
 *     committed data/pools-snapshot.json re-shaped as { status:'success', data:[...] }.
 *
 * Metric hook (assertion D): analytics.js exposes `Analytics` as a top-level lexical
 * const (NOT window.Analytics), and on non-production hosts Analytics.track() early-
 * returns before any network call — so neither a window property trap nor a network
 * capture can observe the event on localhost. The robust, deterministic hook is to
 * intercept the analytics.js RESPONSE and append a wrapper that runs in the SAME
 * script scope where `Analytics` is in lexical scope, wrapping the exact method the
 * planner calls (Analytics.trackShareLinkOpened) so every real invocation is pushed
 * to window.__shareOpens. This observes the REAL code path the planner exercises and
 * installs synchronously at the end of analytics.js, before planner.js runs.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const CHROMIUM = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const PORT = 8837;
const POOL_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90'; // lido stETH
const IGNORABLE = /unpkg|babel|llamao|fonts|mixpanel|analytics|Failed to load resource/i;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function server() {
  return new Promise((res) => {
    const s = http.createServer((req, r) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/home.html';
      const fp = path.join(ROOT, p);
      fs.readFile(fp, (e, buf) => {
        if (e) { r.writeHead(404); r.end('nf'); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' });
        r.end(buf);
      });
    });
    s.listen(PORT, () => res(s));
  });
}

const snapshotBody = fs.readFileSync(path.join(ROOT, 'data/pools-snapshot.json'), 'utf8');
const snap = JSON.parse(snapshotBody);
const pools = snap.pools;
let meta = { schemaVersion: 1, count: pools.length };
try { meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pools-snapshot-meta.json'), 'utf8')); } catch (e) {}
meta.generatedAt = new Date().toISOString();
const freshMeta = JSON.stringify(meta);
const liveBody = JSON.stringify({ status: 'success', data: pools.map((p) => Object.assign({}, p, { apy: (p.apyBase || 0) + (p.apyReward || 0) })) });

// analytics.js + metric-capture wrapper (see header comment for rationale).
const analyticsSrc = fs.readFileSync(path.join(ROOT, 'analytics.js'), 'utf8');
const CAPTURE = `
;(function(){ try {
  window.__shareOpens = window.__shareOpens || [];
  var __orig = Analytics.trackShareLinkOpened.bind(Analytics);
  Analytics.trackShareLinkOpened = function(ctx){ window.__shareOpens.push(ctx || {}); return __orig(ctx); };
} catch (e) { /* Analytics not in lexical scope here — leave untouched */ } })();
`;

const UNPKG = {
  'https://unpkg.com/react@18/umd/react.production.min.js': 'node_modules/react/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js': 'node_modules/@babel/standalone/babel.min.js',
};

async function setup(page) {
  for (const [u, lp] of Object.entries(UNPKG)) {
    const full = path.join(ROOT, lp);
    if (fs.existsSync(full)) await page.route(u, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(full) }));
  }
  await page.route('https://unpkg.com/**', (r) => r.continue());
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  await page.route('**/analytics.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: analyticsSrc + CAPTURE }));
  await page.route('**/data/pools-snapshot-meta.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: freshMeta }));
  await page.route('**/data/pools-snapshot.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: snapshotBody }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: liveBody }));
}

let failed = 0;
function assert(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`);
  }
}

async function readPlanner(page) {
  // The planner mounts and its passive effect (share tracking) fires right after
  // the first commit. Wait for the app root + a settle, then read.
  await page.waitForSelector('.gp-app', { timeout: 15000 });
  await page.waitForFunction(() => /\$[0-9]/.test(document.body.innerText || ''), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const bodyText = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ').trim();
  const shareOpens = await page.evaluate(() => (window.__shareOpens || []).length);
  return { bodyText, shareOpens };
}

async function freshPage(browser, errs) {
  // A dedicated context per scenario so localStorage (garden-plan) from an
  // earlier arrival never bleeds into the next (a saved plan would flip the
  // planner into report mode and mask the share/pool arrival copy).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORABLE.test(m.text())) errs.push('console: ' + m.text()); });
  await setup(page);
  return page;
}

(async () => {
  const srv = await server();
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const errs = [];
  try {
    let page = await freshPage(browser, errs);

    // ---- Scenario 1: pool-detail → Garden CTA → planner arrival (A, B, D-pool) ----
    console.log('[Scenario 1] Garden-this-pool CTA arrival');
    await page.goto(`http://localhost:${PORT}/home.html?pool=${POOL_ID}`, { waitUntil: 'commit', timeout: 20000 });
    await page.waitForSelector('.cta-echo-link', { timeout: 15000 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'commit', timeout: 15000 }),
      page.locator('.cta-echo-link').first().click(),
    ]);
    const landedUrl = page.url();
    // A: navigation carries the src=pool marker
    assert('A. CTA navigates with src=pool', /src=pool/.test(landedUrl), landedUrl);

    const pool = await readPlanner(page);
    // B: honest copy, no share framing, prefill still renders
    assert('B1. no "Someone sent you" framing', !/Someone sent you/i.test(pool.bodyText));
    assert('B2. no "Someone shared" framing', !/Someone shared/i.test(pool.bodyText));
    assert('B3. honest pool copy present ("prefilled from the pool")', /prefilled from the pool/i.test(pool.bodyText), pool.bodyText.slice(0, 200));
    assert('B4. prefilled plan renders ($ projection present)', /\$[0-9]/.test(pool.bodyText));
    // D-pool: no share_link_opened event fired
    assert('D1. share_link_opened NOT fired on pool arrival', pool.shareOpens === 0, 'shareOpens=' + pool.shareOpens);

    // ---- Scenario 2: genuine share URL (C, D-share) — item 007 regression guard ----
    console.log('[Scenario 2] Genuine share arrival (no src=pool)');
    page = await freshPage(browser, errs); // isolated context — no saved plan from scenario 1
    await page.goto(`http://localhost:${PORT}/plan.html?goal=retirement&pace=stable&capital=1000&fm=capital&years=5`, { waitUntil: 'commit', timeout: 20000 });
    const share = await readPlanner(page);
    // C: share-recipient copy unchanged
    assert('C. genuine share still shows "Someone sent/shared" copy',
      /Someone sent you/i.test(share.bodyText) || /Someone shared/i.test(share.bodyText),
      share.bodyText.slice(0, 200));
    // D-share: share_link_opened fires for a genuine share
    assert('D2. share_link_opened fired on genuine share', share.shareOpens >= 1, 'shareOpens=' + share.shareOpens);

    if (errs.length) {
      console.log('  NOTE  non-ignorable page errors observed:');
      errs.slice(0, 10).forEach((x) => console.log('        ' + x));
      // Page errors are a real failure per CLAUDE.md verification notes.
      failed++;
    }

    console.log('');
    console.log(failed === 0 ? 'RESULT: PASS (all assertions)' : `RESULT: FAIL (${failed} assertion(s))`);
  } finally {
    await browser.close();
    srv.close();
  }
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
