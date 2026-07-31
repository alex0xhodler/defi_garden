/* Playwright acceptance gate (item 190, Leg A's rendered proof): the bare `/`
   landing route's footer (landing.js:356-361) must close with a coherent
   Korean sentence under ?lang=ko, not the English "Powered by ... Made with
   AI & Degen Love." that translations.js shipped untranslated (spec 190's
   two real defects, ko.landing.footerPoweredBy / ko.landing.footerMadeWith).

   Per standing decision 2026-07-11, a unit-fixture-only check is a FAIL for
   this class of bug — this drives the REAL rendered app.js/landing.js on a
   fixture-routed static server, mirroring test_footer_hub_links.js's rig
   (fixture pools, CHROMIUM_EXECUTABLE fallback, IGNORABLE_ERROR_PATTERN,
   page-error collection) rather than reinventing it.

   Corrected blast radius (this brief, not spec 190's original text): the
   spec claimed landing.js backs 2,113 tokens/*.html + 88 chains/*.html pages.
   Verified false — those generated pages load ONLY analytics.js and have no
   "Powered by" footer at all. landing.js is loaded ONLY by home.html
   (home.html:204), i.e. the bare `/` route this test drives.

   The KO footer copy is served from translations.min.js on this route (see
   home.html:180), so this test ALSO proves Leg A's `npm run minify` regen
   actually landed the fix, not just the translations.js source edit — item
   061's documented lesson (skipping the minify step ships copy nowhere).

   Run: node test_ko_landing_footer.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8867; // 8791-8866 already claimed by prior test_* files (190 takes the next one)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Same rationale as test_footer_hub_links.js: only known non-critical
// external fetches are silenced; genuine page/console errors still fail.
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;

const POOLS_URL = 'https://yields.llama.fi/pools';
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9)
];
const POOLS_BODY = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// Expected composed KO sentence — landing.js:356-361 renders
// [footerPoweredBy] ' ' <a>footerDefillamaApi</a> [footerMadeWith] as
// adjacent text/inline-anchor nodes inside one <p>. Asserted verbatim so a
// future half-fix (e.g. translating only one half) fails loudly.
const EXPECTED_KO_TEXT = '데이터 제공: DefiLlama API. AI와 디젠의 애정으로 만들었어요.';
const EXPECTED_EN_TEXT = 'Powered by DefiLlama API. Made with AI & Degen Love.';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/home.html';
      let filePath = path.join(ROOT, urlPath);
      if (!path.extname(filePath)) {
        const indexPath = path.join(filePath, 'index.html');
        if (fs.existsSync(indexPath)) filePath = indexPath;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  await page.route(POOLS_URL, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: POOLS_BODY }));
  return { page, errors };
}

// Splits a <p>'s childNodes into text-before-anchor / anchor-text /
// text-after-anchor, using the FIRST <a> child found (there is exactly one
// on this paragraph). Returns null if there's no anchor child at all.
async function splitAroundAnchor(pLocator) {
  return pLocator.evaluate((p) => {
    const anchor = p.querySelector('a');
    if (!anchor) return null;
    let before = '';
    let after = '';
    let seenAnchor = false;
    for (const node of p.childNodes) {
      if (node === anchor) { seenAnchor = true; continue; }
      const text = node.textContent || '';
      if (!seenAnchor) before += text; else after += text;
    }
    return { before: before.trim(), anchorText: anchor.textContent.trim(), anchorHref: anchor.getAttribute('href'), after: after.trim(), fullText: p.textContent.trim() };
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    await test('bare / ?lang=ko: .app-footer p contains Hangul, DefiLlama API link renders INLINE with Korean text both before and after it', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?lang=ko', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('[data-testid="landing-search"]', { timeout: 10000 });

      const footerP = page.locator('.app-footer p').first();
      await footerP.waitFor({ state: 'attached', timeout: 10000 });

      const split = await splitAroundAnchor(footerP);
      if (!split) throw new Error('expected an inline <a> child inside .app-footer p');

      const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
      if (!HANGUL.test(split.fullText)) throw new Error('expected .app-footer p to contain Hangul; got: ' + split.fullText);
      if (split.anchorText !== 'DefiLlama API') throw new Error('expected the inline anchor text to be "DefiLlama API"; got: ' + split.anchorText);
      if (split.before.length === 0) throw new Error('expected non-empty Korean text BEFORE the anchor; got empty string');
      if (split.after.length === 0) throw new Error('expected non-empty Korean text AFTER the anchor; got empty string');
      if (!HANGUL.test(split.before)) throw new Error('expected Hangul before the anchor; got: ' + split.before);
      if (!HANGUL.test(split.after)) throw new Error('expected Hangul after the anchor; got: ' + split.after);

      if (split.fullText.includes('Powered by')) throw new Error('paragraph text must NOT contain "Powered by"; got: ' + split.fullText);
      if (split.fullText.includes('Made with AI & Degen Love.')) throw new Error('paragraph text must NOT contain "Made with AI & Degen Love."; got: ' + split.fullText);

      if (split.fullText !== EXPECTED_KO_TEXT) throw new Error('expected the exact composed KO sentence "' + EXPECTED_KO_TEXT + '"; got: "' + split.fullText + '"');

      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      await page.close();
    });

    await test('control: bare / ?lang=en still renders the English sentence unchanged (EN not collateral damage)', async () => {
      const { page, errors } = await newPage(browser);
      await page.goto('http://localhost:' + PORT + '/?lang=en', { waitUntil: 'load', timeout: 15000 });
      await page.waitForSelector('[data-testid="landing-search"]', { timeout: 10000 });

      const footerP = page.locator('.app-footer p').first();
      await footerP.waitFor({ state: 'attached', timeout: 10000 });
      const split = await splitAroundAnchor(footerP);
      if (!split) throw new Error('expected an inline <a> child inside .app-footer p');
      if (split.anchorText !== 'DefiLlama API') throw new Error('expected the inline anchor text to be "DefiLlama API"; got: ' + split.anchorText);
      if (split.fullText !== EXPECTED_EN_TEXT) throw new Error('expected the exact EN sentence "' + EXPECTED_EN_TEXT + '"; got: "' + split.fullText + '"');

      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      await page.close();
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' assertions passed');
}

main().catch((err) => {
  console.error('test_ko_landing_footer.js crashed: ' + err.message);
  process.exitCode = 1;
});
