/* Rendered Playwright test for backlog 182 — the CI-baked protocol-URL
   artifact (data/protocol-urls.json) closes the class test_protocol_cta_fallback.js
   only patched one instance of (sky-lending, item 138). This file does NOT
   modify that test — it extends the same fixture-routing pattern with a NEW
   distinct PORT (per spec) and proves, against REAL renders:

   (a) uniswap-v4 (a project with NO static PROTOCOL_URLS entry — verified in
       this file, not assumed) renders `.cta-button-protocol` purely from the
       baked artifact when the dynamic api.llama.fi/protocols fetch is
       aborted, and clicking it still fires pool_click{source=protocol_link}.
       This is the exact regression item 182 exists to close — proven to FAIL
       on origin/main separately (see specs/182-notes.md for that run).
   (b) a pool whose project resolves in NO tier at all (no dynamic, no baked,
       no static) renders the honest DefiLlama fallback instead of empty
       space: copy does not contain "Start Earning", href/target point at
       the pool's real DefiLlama page, and clicking it fires
       pool_click{source=defillama_fallback} — never protocol_link.
   (c) pool_view carries protocolCtaPresent: true in case (a), and matching
       the rendered reality (false) in case (b).
   (d) with ?lang=ko, the fallback copy renders the real KO literals read
       live from translations.js (never re-typed here).

   Serves the repo from a REAL local http server (so /data/protocol-urls.json
   is fetched for real, not stubbed) — the one thing test_protocol_cta_fallback.js
   deliberately does NOT need to prove, since it only exercises the static
   PROTOCOL_URLS tier. yields.llama.fi/pools is routed to a fixture,
   api.llama.fi/protocols is aborted (the degraded path), and
   localStorage['defi-protocols'] is cleared so no cached dynamic map masks
   the baked tier under test.

   Run: node test_protocol_cta_baked.js
   (per spec 182: run Leg F — `npm run compile && npm run minify` — first;
   home.html loads the compiled/minified artifacts, not app.js/PoolDetail.js
   directly.) */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8864; // NEW, distinct from every other test_* file (8791-8863 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|api\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real uniswap-v4 pool id from the committed data/pools-snapshot.json. NO
// `url` field (matches the snapshot), forcing resolution to walk past
// pool.url and the (aborted) dynamic tier down to the baked artifact.
const UNISWAP_POOL = {
  pool: 'a043091f-8295-44c4-b6c2-151faee0b8d1',
  project: 'uniswap-v4', symbol: 'ETH-USDC', chain: 'Ethereum',
  tvlUsd: 34_523_597, apyBase: 10.73179, apyReward: 0
};
// A project with NO dynamic, NO baked, NO static entry — the true-null case
// leg (B)/(D) exist for.
const UNKNOWN_POOL = {
  pool: 'unknown-proto-baked-test',
  project: 'totally-unknown-protocol-xyz', symbol: 'USDC', chain: 'Ethereum',
  tvlUsd: 50_000_000, apyBase: 4.0, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [UNISWAP_POOL, UNKNOWN_POOL] });

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

// Parses app.js's `const PROTOCOL_URLS = { ... };` object literal out of
// source (brace-counted, so it's robust regardless of formatting) — never a
// hardcoded second copy of the map.
function extractProtocolUrlsConst() {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const startMarker = 'const PROTOCOL_URLS = {';
  const startIdx = src.indexOf(startMarker);
  if (startIdx < 0) throw new Error('could not find "const PROTOCOL_URLS = {" in app.js');
  const braceStart = startIdx + startMarker.length - 1;
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error('could not find matching closing brace for PROTOCOL_URLS');
  const literal = src.slice(braceStart, i + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${literal};`)();
}

// Reads the REAL KO literals for the fallback copy straight from
// translations.js's `ko:` block — never re-typed in this test.
function extractKoFallbackCopy() {
  const src = fs.readFileSync(path.join(ROOT, 'translations.js'), 'utf8');
  const koIdx = src.indexOf('\n  ko: {');
  if (koIdx < 0) throw new Error('could not find the "ko:" block in translations.js');
  const koSrc = src.slice(koIdx);
  const labelMatch = koSrc.match(/viewOnDefillama:\s*"([^"]*)"/);
  const hintMatch = koSrc.match(/opensDefillamaFallback:\s*"([^"]*)"/);
  if (!labelMatch || !hintMatch) throw new Error('could not find viewOnDefillama/opensDefillamaFallback in translations.js ko block');
  return { label: labelMatch[1], hint: hintMatch[1] };
}

async function installSpies(page) {
  await page.addInitScript(() => {
    window.__events = [];
    window.__openCalls = [];
    // Record window.open calls (url/target/features) instead of just
    // stubbing it inert, so click assertions can verify the real
    // destination URL without a live navigation.
    window.open = (url, target, features) => {
      window.__openCalls.push({ url, target, features });
      return null;
    };
    // Ensure no cached dynamic protocol map masks the baked-fallback path.
    try { localStorage.removeItem('defi-protocols'); } catch (e) {}
    document.addEventListener('click', (e) => {
      if (e.target.closest('.cta-button-primary, .cta-button-protocol')) e.preventDefault();
    }, true);
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.track) { setTimeout(install, 0); return; }
      const orig = Analytics.track.bind(Analytics);
      Analytics.track = (eventName, eventData) => {
        window.__events.push({ eventName, eventData });
        return orig(eventName, eventData);
      };
    };
    install();
  });
}

async function pollEvents(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let events = [];
  for (;;) {
    events = await page.evaluate(() => window.__events);
    if (predicate(events) || Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  return events;
}

async function routeFixtures(page) {
  const nm = path.join(ROOT, 'node_modules');
  for (const [url, lp] of Object.entries({
    'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
    'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
  })) {
    await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
  }
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  // Force the live path (snapshot 404'd) so our fixture pools are used, and
  // simulate the dynamic protocols fetch failing/being blocked — the
  // degraded condition this item's baked tier exists to survive.
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
  await page.route('https://api.llama.fi/protocols', (r) => r.abort());
  // NOTE: '/data/protocol-urls.json' is intentionally NOT routed/stubbed —
  // it must be served for real by the local http server started above.
}

async function main() {
  // --- Sanity checks (fail loudly if the test's premises don't hold) -------
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  const hit = snapshot.pools.find((p) => p.pool === UNISWAP_POOL.pool);
  if (!hit) throw new Error(`UNISWAP_POOL.pool ${UNISWAP_POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  if (hit.project !== 'uniswap-v4') throw new Error(`UNISWAP_POOL.pool is project "${hit.project}", expected uniswap-v4`);
  if (hit.url) throw new Error('UNISWAP_POOL snapshot entry unexpectedly has a url — premise (no pool.url) broken');

  const PROTOCOL_URLS = extractProtocolUrlsConst();
  if (Object.prototype.hasOwnProperty.call(PROTOCOL_URLS, 'uniswap-v4')) {
    throw new Error('uniswap-v4 unexpectedly has a static PROTOCOL_URLS entry in app.js — case (a) premise (no static entry) is broken');
  }

  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'protocol-urls.json'), 'utf8'));
  if (!artifact.urls['uniswap-v4']) {
    throw new Error('uniswap-v4 has no entry in data/protocol-urls.json — regenerate it (npm run protocol-urls) before running this test');
  }
  if (artifact.urls[UNKNOWN_POOL.project] || PROTOCOL_URLS[UNKNOWN_POOL.project]) {
    throw new Error(`${UNKNOWN_POOL.project} unexpectedly resolves somewhere — negative-control premise broken`);
  }

  const koExpected = extractKoFallbackCopy();

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

    await routeFixtures(page);
    await installSpies(page);

    // --- (a) POSITIVE: uniswap-v4 renders + fires from the baked tier -----
    let viewEventsA;
    await test('(a) uniswap-v4: .cta-button-protocol renders purely from the baked artifact (no static entry, dynamic fetch aborted)', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(UNISWAP_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      // Poll for pool_view — it only fires once protocolUrlsSettled is true
      // (spec 182 Territory T4), so this also guarantees the baked-artifact
      // fetch has resolved before we assert on the render below.
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_view'), 8000);
      viewEventsA = events.filter((e) => e.eventName === 'pool_view');
      if (viewEventsA.length !== 1) throw new Error(`expected exactly one pool_view, got ${JSON.stringify(viewEventsA)}`);

      const count = await page.locator('.cta-button-protocol').count();
      if (count === 0) throw new Error('expected .cta-button-protocol to render for uniswap-v4 from the baked artifact — got 0 (the item-182 regression)');
      const text = await page.locator('.cta-button-protocol').first().textContent();
      if (/DefiLlama/i.test(text)) throw new Error(`rendered the DefiLlama fallback instead of the real protocol CTA for uniswap-v4: "${text}"`);
    });

    await test('(a) uniswap-v4: clicking the CTA fires pool_click{source=protocol_link}', async () => {
      await page.evaluate(() => { window.__events = []; });
      await page.locator('.cta-button-protocol').first().click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click');
      if (clicks.length < 1) throw new Error(`expected a pool_click, got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.source !== 'protocol_link') throw new Error(`expected source=protocol_link, got ${JSON.stringify(clicks[0].eventData)}`);
    });

    await test('(c) uniswap-v4: pool_view carried protocolCtaPresent=true', async () => {
      const view = viewEventsA[0];
      if (view.eventData.protocolCtaPresent !== true) throw new Error(`expected protocolCtaPresent=true, got ${JSON.stringify(view.eventData.protocolCtaPresent)}`);
      if (view.eventData.protocol_cta_present !== true) throw new Error(`expected protocol_cta_present=true, got ${JSON.stringify(view.eventData.protocol_cta_present)}`);
    });

    // --- (b) NEGATIVE: unknown protocol renders the DefiLlama fallback ----
    let viewEventsB;
    await test('(b) unknown protocol: renders the DefiLlama fallback, not the protocol CTA, and not empty', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(UNKNOWN_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_view'), 8000);
      viewEventsB = events.filter((e) => e.eventName === 'pool_view');
      if (viewEventsB.length !== 1) throw new Error(`expected exactly one pool_view, got ${JSON.stringify(viewEventsB)}`);

      const count = await page.locator('.cta-button-protocol').count();
      if (count === 0) throw new Error('expected the DefiLlama fallback button (still .cta-button-protocol className) to render — got 0');
      const text = await page.locator('.cta-button-protocol').first().textContent();
      if (text.includes('Start Earning')) throw new Error(`fallback copy must not contain "Start Earning" (would impersonate the protocol CTA): "${text}"`);

      const href = await page.locator('.cta-button-protocol').first().evaluate((el) => el.getAttribute('href'));
      // The fallback is a <button> (window.open on click), not an <a href>,
      // matching the protocol CTA's own element shape — assert there's no
      // href attribute misleadingly present instead.
      if (href) throw new Error(`expected no href attribute on the fallback button (opens via window.open), got "${href}"`);
    });

    await test('(b) unknown protocol: clicking the fallback opens the DefiLlama pool URL and fires pool_click{source=defillama_fallback}, never protocol_link', async () => {
      await page.evaluate(() => { window.__events = []; window.__openCalls = []; });
      await page.locator('.cta-button-protocol').first().click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click');
      if (clicks.length < 1) throw new Error(`expected a pool_click, got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.source === 'protocol_link') throw new Error('fallback click fired source=protocol_link — this would silently redefine the north star');
      if (clicks[0].eventData.source !== 'defillama_fallback') throw new Error(`expected source=defillama_fallback, got ${JSON.stringify(clicks[0].eventData)}`);

      const opens = await page.evaluate(() => window.__openCalls);
      if (opens.length !== 1) throw new Error(`expected exactly one window.open call, got ${JSON.stringify(opens)}`);
      const expectedUrl = 'https://defillama.com/yields/pool/' + encodeURIComponent(UNKNOWN_POOL.pool);
      if (opens[0].url !== expectedUrl) throw new Error(`expected window.open url "${expectedUrl}", got "${opens[0].url}"`);
      if (opens[0].target !== '_blank') throw new Error(`expected target "_blank", got "${opens[0].target}"`);
    });

    await test('(c) unknown protocol: pool_view protocolCtaPresent matches the rendered (fallback) reality — false', async () => {
      const view = viewEventsB[0];
      if (view.eventData.protocolCtaPresent !== false) throw new Error(`expected protocolCtaPresent=false, got ${JSON.stringify(view.eventData.protocolCtaPresent)}`);
      if (view.eventData.protocol_cta_present !== false) throw new Error(`expected protocol_cta_present=false, got ${JSON.stringify(view.eventData.protocol_cta_present)}`);
    });

    // --- (d) KO renders the real fallback copy -----------------------------
    await test('(d) ?lang=ko: fallback renders the real Korean copy (read live from translations.js)', async () => {
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(UNKNOWN_POOL.pool)}&lang=ko`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_view'), 8000);

      const cta = page.locator('.cta-button-protocol').first();
      if ((await cta.count()) === 0) throw new Error('expected the fallback CTA to render in KO — got 0');
      const ctaText = (await cta.textContent()).trim();
      if (!ctaText.startsWith(koExpected.label)) {
        throw new Error(`expected KO fallback button to start with "${koExpected.label}", got "${ctaText}"`);
      }

      const hint = page.locator('.pool-action-hint--muted').last();
      const hintText = (await hint.textContent()).trim();
      if (hintText !== koExpected.hint) {
        throw new Error(`expected KO fallback hint "${koExpected.hint}", got "${hintText}"`);
      }
    });

    if (pageErrors.length) throw new Error('page errors during test:\n  ' + pageErrors.join('\n  '));
    console.log(`\n  ${passed}/${total} assertions passed`);
    if (process.exitCode) process.exit(process.exitCode);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
