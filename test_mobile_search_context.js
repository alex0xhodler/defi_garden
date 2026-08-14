/* Rendered Chromium regression for PR 424 mobile header search context.
 *
 * Run: node test_mobile_search_context.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium')
  ? '/opt/pw-browsers/chromium'
  : undefined;
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;
const POOL_ID = 'pt-usd3-dec-236';
const POOL_SYMBOL = 'PT-USD3-17DEC2026';
const NO_RESULTS_QUERY = 'PT-USDC';
const POOLS_BODY = JSON.stringify({
  status: 'success',
  data: [{
    pool: POOL_ID,
    project: 'morpho-blue',
    symbol: POOL_SYMBOL,
    chain: 'Ethereum',
    tvlUsd: 30_000_000,
    apyBase: 4.2,
    apyReward: 0
  }]
});

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, pathname === '/' ? 'home.html' : pathname);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function openPage(browser, origin, route, ready, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ` (${source})` : ''));
    }
  });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.route('https://icons.llamao.fi/**', (request) => request.abort());
  await page.route('https://yields.llama.fi/pools', (request) => request.fulfill({
    status: 200,
    contentType: 'application/json',
    body: POOLS_BODY
  }));
  await page.route('**/data/pools-snapshot*', (request) => request.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2026-08-13T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.goto(origin + route, { waitUntil: 'load', timeout: 20_000 });
  await page.waitForSelector(ready, { timeout: 15_000 });
  await page.waitForFunction(() => {
    const input = document.querySelector('.app-search-input');
    return input && input.value.length > 0;
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepStrictEqual(errors, [], 'unexpected page errors');
  return page;
}

async function searchFacts(page) {
  return page.evaluate(() => {
    const input = document.querySelector('.app-search-input');
    const bar = document.querySelector('.app-search-bar');
    const clear = document.querySelector('.app-search-clear');
    const controls = document.querySelector('.app-header-controls');
    const mark = document.querySelector('.app-brand-mark');
    const logo = document.querySelector('.app-logo');
    const textNode = Array.from(logo.childNodes).find((node) => node.textContent.trim() === 'DeFi Garden');
    const wordmarkRange = document.createRange();
    wordmarkRange.selectNodeContents(textNode);
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, width: value.width, height: value.height };
    };
    const clearRect = rect(clear);
    const clearHit = document.elementFromPoint(
      clearRect.left + clearRect.width / 2,
      clear.getBoundingClientRect().top + clearRect.height / 2
    );
    return {
      value: input.value,
      label: input.getAttribute('aria-label'),
      inputWidth: input.clientWidth,
      inputScrollLeft: input.scrollLeft,
      bar: rect(bar),
      controls: rect(controls),
      mark: rect(mark),
      wordmarkWidth: wordmarkRange.getBoundingClientRect().width,
      clearReachable: clear === clearHit || clear.contains(clearHit),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    };
  });
}

function assertMobileSearch(facts, expected) {
  assert.strictEqual(facts.value, expected, 'active query must remain exact in the editable search control');
  assert.ok(facts.inputWidth >= 96, `query text box is only ${facts.inputWidth}px wide; a meaningful query prefix cannot be shown`);
  assert.ok(facts.label && /search/i.test(facts.label), 'search input needs an accessible search label');
  assert.strictEqual(facts.inputScrollLeft, 0, 'an unfocused query must show its beginning, not a scrolled suffix');
  assert.ok(facts.bar.width >= 140, `search control collapsed to ${facts.bar.width}px`);
  assert.ok(facts.mark.width >= 38, 'leaf identity tile must remain visible');
  assert.ok(facts.wordmarkWidth < 1, `phone header still spends ${facts.wordmarkWidth}px on the redundant wordmark`);
  assert.ok(facts.controls.right <= facts.clientWidth, 'language/theme controls extend beyond the viewport');
  assert.strictEqual(facts.clearReachable, true, 'clear action is not reachable at its painted center');
  assert.strictEqual(facts.scrollWidth, facts.clientWidth, 'header creates horizontal overflow');
}

async function main() {
  const server = await startServer();
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  let passed = 0;
  try {
    const noResults = await openPage(
      browser,
      origin,
      `/?token=${NO_RESULTS_QUERY}`,
      '.empty-state',
      { width: 360, height: 780 }
    );
    assertMobileSearch(await searchFacts(noResults), NO_RESULTS_QUERY);
    await noResults.close();
    passed++;
    console.log('✓ 360px no-results header visibly preserves the active query');

    const poolDetail = await openPage(
      browser,
      origin,
      `/?pool=${POOL_ID}`,
      '.pool-detail-view',
      { width: 360, height: 780 }
    );
    assertMobileSearch(await searchFacts(poolDetail), POOL_SYMBOL);
    await poolDetail.close();
    passed++;
    console.log('✓ 360px pool-detail header visibly preserves the pool symbol');

    const phoneBoundary = await openPage(
      browser,
      origin,
      `/?token=${NO_RESULTS_QUERY}`,
      '.empty-state',
      { width: 480, height: 780 }
    );
    assertMobileSearch(await searchFacts(phoneBoundary), NO_RESULTS_QUERY);
    await phoneBoundary.close();
    passed++;
    console.log('✓ 480px breakpoint keeps the active query and compact identity');

    const tablet = await openPage(
      browser,
      origin,
      `/?token=${NO_RESULTS_QUERY}`,
      '.empty-state',
      { width: 768, height: 900 }
    );
    const tabletFacts = await searchFacts(tablet);
    assert.ok(tabletFacts.wordmarkWidth >= 80, 'wordmark should remain visible when the header has room');
    assert.strictEqual(tabletFacts.value, NO_RESULTS_QUERY);
    await tablet.close();
    passed++;
    console.log('✓ wider headers retain the full brand identity and active query');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(`${passed}/4 mobile search-context assertions passed`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
