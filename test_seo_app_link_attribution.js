/* Acceptance tests for spec 204 — "finish the estate's arrival tag: the
   4,705 `?token=`/`?chain=` app links that 203 left untagged."

   203 tagged the estate's `?pool=` deep links (poolHrefFor's optional 3rd
   arg). 204 tags the estate's remaining outbound app links — the four
   visible render sites named in specs/204.md §2:
     - generate-token-pages.js: `.tp-cta` href, categoryLinksFor items
     - generate-chain-pages.js: `.cp-cta` href, categoryLinksFor items
   via a new shared `withSrc(url, src)` helper, WITHOUT touching the `appUrl`
   variable's own definition, `renderItemListJsonLd`, or `poolHrefFor`'s
   signature/semantics (specs/204.md's THE TRAP).

   Covers acceptance criteria 1-6 (real generator output over the shared
   fixture, unit-level — never hand-written HTML) and 8 (rendered, real
   Chromium, fixture-routed guardrail — 2026-07-12 standing decision: unit
   fixtures alone never satisfy a rendered-guardrail criterion). Criteria
   7/9/10 are verified externally (git diff / the existing test lanes /
   bookkeeping files), not re-asserted here.

   Run: node test_seo_app_link_attribution.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const tokenGen = require('./generate-token-pages.js');
const chainGen = require('./generate-chain-pages.js');

const ROOT = __dirname;
const { SITE_URL, MIN_POOL_TVL, withSrc, categoryLinksFor, poolHrefFor } = tokenGen;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// Real generator output over the shared fixture every other generator test
// file uses (test_fixtures/pools-sample.json), rendered through the real,
// unmodified renderTokenPage()/renderChainPage() exports — never a
// hand-written HTML string.
// ---------------------------------------------------------------------------
const pools = JSON.parse(fs.readFileSync(path.join(ROOT, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const rankedTokens = tokenGen.rankTopTokens(pools);
const rankedChains = chainGen.rankTopChains(pools);
assert.ok(rankedTokens.length > 0 && rankedChains.length > 0, 'fixture wiring check: expected >=1 ranked token and chain');

const tokenRec = rankedTokens[0];
const chainRec = rankedChains[0];
assert.ok(tokenRec.pools.length >= 2, 'fixture wiring check: expected the top ranked token to have >=2 pools (category-nav coverage)');
assert.ok(chainRec.pools.length >= 2, 'fixture wiring check: expected the top ranked chain to have >=2 pools (category-nav coverage)');

const tokenHtml = tokenGen.renderTokenPage(tokenRec);
const chainHtml = chainGen.renderChainPage(chainRec);

// The SAME appUrl computation renderTokenPage/renderChainPage do internally
// (generate-token-pages.js:719 / generate-chain-pages.js:161) — reconstructed
// here from exported constants only, never re-read out of the rendered HTML
// (that would make the test circular).
const tokenAppUrl = `${SITE_URL}/?token=${encodeURIComponent(tokenRec.symbol)}&minTvl=${MIN_POOL_TVL}`;
const chainAppUrl = `${SITE_URL}/?chain=${encodeURIComponent(chainRec.chain)}&minTvl=${MIN_POOL_TVL}`;

function extractHrefs(html) {
  const out = [];
  const re = /href="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// The category nav is rendered by renderLinkNavHtml with extraNavClass
// 'xlink-category' (generate-token-pages.js/generate-chain-pages.js), i.e.
// `<nav class="related xlink-category" ...>...</nav>` — isolate that one
// block so we scan exactly the category links, not the whole page.
function extractCategoryNavHrefs(html) {
  const m = html.match(/<nav class="related xlink-category"[\s\S]*?<\/nav>/);
  assert.ok(m, 'fixture wiring check: expected an xlink-category nav block in rendered output');
  return extractHrefs(m[0]);
}

function extractJsonLdBlocks(html) {
  const out = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

console.log('204 criterion 1 — main CTA tagged, both generators');
test('token page .tp-cta href is exactly <appUrl>&src=seo_token', () => {
  const expected = `<a class="tp-cta" href="${tokenAppUrl}&src=seo_token">`;
  assert.ok(tokenHtml.includes(expected), `expected exact tp-cta href not found; expected substring: ${expected}`);
});
test('chain page .cp-cta href is exactly <appUrl>&src=seo_chain', () => {
  const expected = `<a class="cp-cta" href="${chainAppUrl}&src=seo_chain">`;
  assert.ok(chainHtml.includes(expected), `expected exact cp-cta href not found; expected substring: ${expected}`);
});

console.log('204 criterion 2 — category nav tagged, both generators, no skip/double-tag');
test('every token category-nav href ends with &src=seo_token; count equals categoryLinksFor()', () => {
  const expectedItems = categoryLinksFor(tokenRec.pools, tokenAppUrl);
  const renderedHrefs = extractCategoryNavHrefs(tokenHtml);
  assert.strictEqual(renderedHrefs.length, expectedItems.length,
    `expected ${expectedItems.length} category links (categoryLinksFor's own count), got ${renderedHrefs.length}: ${JSON.stringify(renderedHrefs)}`);
  renderedHrefs.forEach((href, i) => {
    assert.ok(href.endsWith('&src=seo_token'), `category href #${i} does not end with &src=seo_token: ${href}`);
    assert.strictEqual(href, withSrc(expectedItems[i].url, 'seo_token'), `category href #${i} mismatch`);
  });
});
test('every chain category-nav href ends with &src=seo_chain; count equals categoryLinksFor()', () => {
  const expectedItems = categoryLinksFor(chainRec.pools, chainAppUrl);
  const renderedHrefs = extractCategoryNavHrefs(chainHtml);
  assert.strictEqual(renderedHrefs.length, expectedItems.length,
    `expected ${expectedItems.length} category links (categoryLinksFor's own count), got ${renderedHrefs.length}: ${JSON.stringify(renderedHrefs)}`);
  renderedHrefs.forEach((href, i) => {
    assert.ok(href.endsWith('&src=seo_chain'), `category href #${i} does not end with &src=seo_chain: ${href}`);
    assert.strictEqual(href, withSrc(expectedItems[i].url, 'seo_chain'), `category href #${i} mismatch`);
  });
});

console.log('204 criterion 3 — no double-tagging anywhere');
test('no href in rendered token-page output contains src= more than once', () => {
  const offenders = extractHrefs(tokenHtml).filter((h) => ((h.match(/src=/g) || []).length) > 1);
  assert.strictEqual(offenders.length, 0, `double-tagged hrefs found: ${JSON.stringify(offenders)}`);
});
test('no href in rendered chain-page output contains src= more than once', () => {
  const offenders = extractHrefs(chainHtml).filter((h) => ((h.match(/src=/g) || []).length) > 1);
  assert.strictEqual(offenders.length, 0, `double-tagged hrefs found: ${JSON.stringify(offenders)}`);
});

console.log('204 criterion 4 — JSON-LD stays canonical (203\'s invariant survives)');
test('no ld+json block in token-page output contains src= anywhere in the block', () => {
  const blocks = extractJsonLdBlocks(tokenHtml);
  assert.ok(blocks.length > 0, 'fixture wiring check: expected >=1 ld+json block');
  const offenders = blocks.filter((b) => /src=/.test(b));
  assert.strictEqual(offenders.length, 0, `ld+json block(s) unexpectedly carry src=: ${JSON.stringify(offenders)}`);
});
test('no ld+json block in chain-page output contains src= anywhere in the block', () => {
  const blocks = extractJsonLdBlocks(chainHtml);
  assert.ok(blocks.length > 0, 'fixture wiring check: expected >=1 ld+json block');
  const offenders = blocks.filter((b) => /src=/.test(b));
  assert.strictEqual(offenders.length, 0, `ld+json block(s) unexpectedly carry src=: ${JSON.stringify(offenders)}`);
});
test('every ItemList url in token-page ld+json matches the clean pool/appUrl pattern', () => {
  const itemListBlock = extractJsonLdBlocks(tokenHtml).map((b) => { try { return JSON.parse(b); } catch (e) { return null; } })
    .find((j) => j && j['@type'] === 'ItemList');
  assert.ok(itemListBlock, 'fixture wiring check: expected an ItemList ld+json block');
  const cleanPoolPattern = /^https:\/\/www\.defi\.garden\/\?pool=[^&]+$/;
  itemListBlock.itemListElement.forEach((item, i) => {
    const clean = cleanPoolPattern.test(item.url) || item.url === tokenAppUrl;
    assert.ok(clean, `ItemList url #${i} is neither a clean pool url nor the clean appUrl: ${item.url}`);
  });
});
test('every ItemList url in chain-page ld+json matches the clean pool/appUrl pattern', () => {
  const itemListBlock = extractJsonLdBlocks(chainHtml).map((b) => { try { return JSON.parse(b); } catch (e) { return null; } })
    .find((j) => j && j['@type'] === 'ItemList');
  assert.ok(itemListBlock, 'fixture wiring check: expected an ItemList ld+json block');
  const cleanPoolPattern = /^https:\/\/www\.defi\.garden\/\?pool=[^&]+$/;
  itemListBlock.itemListElement.forEach((item, i) => {
    const clean = cleanPoolPattern.test(item.url) || item.url === chainAppUrl;
    assert.ok(clean, `ItemList url #${i} is neither a clean pool url nor the clean appUrl: ${item.url}`);
  });
});

console.log('204 criterion 5 — withSrc/poolHrefFor byte-identical no-op for falsy src (203\'s contract)');
test('withSrc(url, src) returns url byte-identically for undefined/\'\'/null/0', () => {
  const url = 'https://www.defi.garden/?token=USDC&minTvl=100000';
  [undefined, '', null, 0].forEach((falsy) => {
    assert.strictEqual(withSrc(url, falsy), url, `withSrc(url, ${JSON.stringify(falsy)}) mutated the url`);
  });
});
test('poolHrefFor(p, fallback) with no 3rd argument is byte-identical to main for both branches', () => {
  const fallback = 'https://www.defi.garden/?token=USDC&minTvl=100000';
  const withId = { pool: 'abc-123' };
  const withoutId = { pool: undefined };
  assert.strictEqual(poolHrefFor(withId, fallback), `${SITE_URL}/?pool=abc-123`, 'pool-id branch changed behaviour with no 3rd arg');
  assert.strictEqual(poolHrefFor(withoutId, fallback), fallback, 'fallback branch changed behaviour with no 3rd arg');
});

console.log(`\n${passed} passed, ${failed} failed (sync legs)`);

// ---------------------------------------------------------------------------
// Criterion 8 — rendered guardrail (real Chromium, fixture-routed, 2026-07-12
// standing decision: unit fixtures alone do not satisfy this). Mirrors
// test_seo_cta_render.js's server/browser/route-stub harness (item 173) +
// test_analytics_src_attribution.js's neutralizeHostGate/mixpanel-stub-queue
// pattern (item 202) — never a fresh, ad hoc harness for an already-solved
// shape.
// ---------------------------------------------------------------------------
const PORT = 8870; // distinct from other test_* files (8791-8869 taken)
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml; charset=utf-8'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;
const POOLS_URL = 'https://yields.llama.fi/pools';

function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
// A token whose pools sit ABOVE the SEO generator's $100K floor but BELOW
// the app's $10M default floor (test_seo_cta_render.js's Cardano-shaped
// precedent) — proves the SAME &minTvl=100000 lifeline the CTA already
// carried (173) survives sitting *before* the newly-appended &src= (204),
// not just that pool cards render at all. Symbol picked to avoid collision
// with any other test file's fixtures.
const FIXTURE_POOLS = [
  makePool('gzz-liqwid-gzz', 'liqwid', 'GZZ', 'Cardano', 6_130_000, 3.2),
  makePool('gzz-indigo-gzz', 'indigo', 'GZZ', 'Cardano', 2_500_000, 5.8),
  // Unrelated >=$10M pool so the app's default/snapshot view is non-empty.
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });
const SYMBOL = 'GZZ';

function resolveCleanUrl(urlPath) {
  if (urlPath === '/') return 'home.html';
  const rel = urlPath.replace(/^\/+/, '');
  if (fs.existsSync(path.join(ROOT, rel))) return rel;
  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + '.html'))) return rel + '.html';
  return rel;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, resolveCleanUrl(urlPath));
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// Spec 096's PRODUCTION_HOSTS gate suppresses mixpanel.track() on localhost —
// neutralised so the real production tracking path reaches the same
// window.mixpanel stub queue every assertion below reads (identical to
// test_analytics_src_attribution.js's neutralizeHostGate).
async function neutralizeHostGate(target) {
  await target.addInitScript(() => {
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.isProductionHost) { setTimeout(install, 0); return; }
      Analytics.isProductionHost = () => true;
    };
    install();
  });
}

function trackCalls(page) {
  return page.evaluate(() => (window.mixpanel || []).filter((c) => Array.isArray(c) && c[0] === 'track'));
}

async function pollTrackCalls(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let calls = [];
  for (;;) {
    calls = await trackCalls(page);
    if (predicate(calls) || Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  return calls;
}

async function newPage(browser, context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
  await page.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
  return { page, errors };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext();
    // Blanket-abort every external host — the established pattern from
    // test_analytics_fires.js/test_analytics_src_attribution.js. Registered
    // first so the specific per-page fixture routes (pools/snapshot/icons,
    // registered per-page below) still win — Playwright matches
    // most-recently-registered routes first.
    await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());
    await neutralizeHostGate(context);
    await context.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

    console.log('\n204 criterion 8 — rendered guardrail (real Chromium, fixture-routed)');

    let withSrcCardCount = null;

    await atest('/?token=GZZ&minTvl=100000&src=seo_token renders pool cards and emits src=seo_token', async () => {
      const { page, errors } = await newPage(browser, context);
      await page.goto(`http://localhost:${PORT}/?token=${SYMBOL}&minTvl=100000&src=seo_token`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const cardCount = await page.$$eval('.pool-card', (els) => els.length);
      if (cardCount < 1) throw new Error('expected >=1 pool card at minTvl=100000, got ' + cardCount);
      withSrcCardCount = cardCount;

      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'session_start'), 8000);
      const withSrcCalls = calls.filter((c) => c[2] && c[2].src === 'seo_token');
      if (!withSrcCalls.length) throw new Error('no track call carries src=seo_token — got ' + JSON.stringify(calls.map((c) => [c[1], c[2] && c[2].src])));
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
      console.log('      (' + cardCount + ' pool cards rendered; ' + withSrcCalls.length + ' track call(s) carry src=seo_token)');
      await page.close();
    });

    await atest('/?token=GZZ&minTvl=100000 (no src) renders the SAME card count and emits no src key', async () => {
      const { page, errors } = await newPage(browser, context);
      await page.goto(`http://localhost:${PORT}/?token=${SYMBOL}&minTvl=100000`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const cardCount = await page.$$eval('.pool-card', (els) => els.length);
      if (cardCount < 1) throw new Error('expected >=1 pool card at minTvl=100000, got ' + cardCount);
      if (withSrcCardCount !== null && cardCount !== withSrcCardCount) {
        throw new Error(`expected the src-less URL to render the SAME card count as the &src=seo_token URL (${withSrcCardCount}), got ${cardCount} — not identical rendering`);
      }

      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'session_start'), 8000);
      const withSrcCalls = calls.filter((c) => c[2] && 'src' in c[2]);
      if (withSrcCalls.length) throw new Error('expected no src key on any event, found it on: ' + JSON.stringify(withSrcCalls.map((c) => c[1])));
      if (errors.length) throw new Error('unexpected page errors: ' + errors.join(' | '));
      console.log('      (' + cardCount + ' pool cards rendered; 0 track calls carry a src key)');
      await page.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\ntest_seo_app_link_attribution.js: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_seo_app_link_attribution.js crashed: ' + err.message);
  process.exit(1);
});
