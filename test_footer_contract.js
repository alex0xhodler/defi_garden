/* Playwright acceptance gate (item 240): ONE footer contract across the three
   money surfaces — bare `/` (landing.js), `/?token=USDC` (app.js grid view),
   and `/?pool=<id>` (app.js pool-detail view). Before 240 all three hardcoded
   English literals independently (`'Powered by '`, the wrong-cased
   `'Defillama API'`, `'. Made with AI & Degen Love.'`), so KO users saw
   English there and the off-ICP "Degen Love" sign-off sat in the trust
   position of the two surfaces where money decisions happen. 240 moved the
   footer copy onto ONE root translations.js dictionary (poweredBy /
   defillamaApi / footerSignOff / browseTokens / browseChains) that all three
   renderers now read, and retired the sign-off to "Education, not advice." /
   "투자 조언이 아닙니다.".

   Per standing decision 2026-07-11, a unit-fixture-only check is a FAIL for
   this class of bug — this drives the REAL rendered app on all three routes.
   Rig mirrors test_ko_landing_footer.js / test_footer_hub_links.js exactly:
   fixture-routed static server, CHROMIUM_EXECUTABLE fallback,
   IGNORABLE_ERROR_PATTERN, page-error collection.

   Repo razor: assert invariants over the population, not a hardcoded golden
   string per surface — the cross-surface-identity assertion below is the
   "one contract" invariant; the motivating EN/KO sentences are only a
   positive control (see the source-level leg's mutation transcript in
   product-loop-kit/specs/240-notes.md for the non-vacuity proof that this
   file actually detects a break in each leg separately).

   Run: node test_footer_contract.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// PORT scan: `grep -h "^const PORT" test_*.js | sed ...` → highest claimed
// port among existing test_*.js files was 8876 (test_ko_landing_footer.js
// group tops out there); 240 takes the next one.
const PORT = 8877;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Same rationale as test_ko_landing_footer.js / test_footer_hub_links.js:
// only known non-critical external fetches are silenced; genuine page/console
// errors still fail the gate.
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i;

const POOLS_URL = 'https://yields.llama.fi/pools';
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOL_ID = 'usdc-base-aave';
const FIXTURE_POOLS = [
  makePool(FIXTURE_POOL_ID, 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9)
];
const POOLS_BODY = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

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

// The three money/entry surfaces under test, one fixture route each, with the
// selector that proves the surface actually mounted before we read its footer.
const SURFACES = [
  { name: 'landing (/)', path: '/', ready: '[data-testid="landing-search"]' },
  { name: 'grid (/?token=USDC)', path: '/?token=USDC', ready: '.pool-card' },
  { name: `pool-detail (/?pool=${FIXTURE_POOL_ID})`, path: `/?pool=${FIXTURE_POOL_ID}`, ready: '.pool-detail-view' }
];

function withLang(routePath, lang) {
  return routePath + (routePath.includes('?') ? '&' : '?') + 'lang=' + lang;
}

function normalize(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

// Fetch one surface's rendered .app-footer contents for a given language.
// Returns { fullText, hasDefillamaAnchor, defillamaAnchorText, hasTokensLink, hasChainsLink }.
async function readFooter(browser, surface, lang) {
  const { page, errors } = await newPage(browser);
  await page.goto('http://localhost:' + PORT + withLang(surface.path, lang), { waitUntil: 'load', timeout: 15000 });
  await page.waitForSelector(surface.ready, { timeout: 15000 });
  const footer = page.locator('footer.app-footer').first();
  await footer.waitFor({ state: 'attached', timeout: 10000 });

  const fullText = normalize(await footer.innerText());
  const defillamaAnchor = footer.locator('a[href="https://api-docs.defillama.com/"]');
  const hasDefillamaAnchor = (await defillamaAnchor.count()) > 0;
  const defillamaAnchorText = hasDefillamaAnchor ? normalize(await defillamaAnchor.first().textContent()) : '';
  const hasTokensLink = (await footer.locator('a[href="/tokens"]').count()) > 0;
  const hasChainsLink = (await footer.locator('a[href="/chains"]').count()) > 0;

  if (errors.length) throw new Error(surface.name + ' (' + lang + '): page errors:\n' + errors.join('\n'));
  await page.close();
  return { fullText, hasDefillamaAnchor, defillamaAnchorText, hasTokensLink, hasChainsLink };
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    for (const lang of ['en', 'ko']) {
      const results = {};
      for (const surface of SURFACES) {
        results[surface.name] = await readFooter(browser, surface, lang);
      }

      // --- Leg 1: cross-surface identity — the "one contract" invariant.
      // Assert the population (the three rendered .app-footer texts) is a
      // single value, not a hardcoded golden string per surface.
      await test(`[${lang}] footer.app-footer text is IDENTICAL across all three surfaces`, async () => {
        const texts = SURFACES.map((s) => results[s.name].fullText);
        const distinct = new Set(texts);
        if (distinct.size !== 1) {
          throw new Error('expected one shared footer text across ' + SURFACES.map((s) => s.name).join(', ') +
            '; got:\n' + SURFACES.map((s) => '  ' + s.name + ': "' + results[s.name].fullText + '"').join('\n'));
        }
        if (!texts[0]) throw new Error('shared footer text must not be empty');
      });

      // --- Leg 2: DefiLlama attribution present on all three (honesty leg).
      await test(`[${lang}] every surface carries a DefiLlama attribution anchor to https://api-docs.defillama.com/`, async () => {
        for (const surface of SURFACES) {
          const r = results[surface.name];
          if (!r.hasDefillamaAnchor) throw new Error(surface.name + ': missing anchor to https://api-docs.defillama.com/');
          if (!/defillama/i.test(r.defillamaAnchorText)) {
            throw new Error(surface.name + ': DefiLlama anchor text does not read as an attribution, got "' + r.defillamaAnchorText + '"');
          }
        }
      });

      // --- Leg 3: /tokens and /chains hub links present on all three.
      await test(`[${lang}] every surface carries the /tokens and /chains hub links`, async () => {
        for (const surface of SURFACES) {
          const r = results[surface.name];
          if (!r.hasTokensLink) throw new Error(surface.name + ': missing /tokens hub link');
          if (!r.hasChainsLink) throw new Error(surface.name + ': missing /chains hub link');
        }
      });

      // --- Leg 4: the retired off-ICP sign-off never survives, in either language.
      await test(`[${lang}] rendered footer text matches neither /degen/i nor /디젠/`, async () => {
        for (const surface of SURFACES) {
          const text = results[surface.name].fullText;
          if (/degen/i.test(text)) throw new Error(surface.name + ': footer text matches /degen/i: "' + text + '"');
          if (/디젠/.test(text)) throw new Error(surface.name + ': footer text matches /디젠/: "' + text + '"');
        }
      });
    }

    // --- Leg 5 (source-level, cheap): zero "degen love" matches survive in
    // source AND regenerated committed twins — proves the regen actually
    // landed, not just the source edit (item 061's documented lesson).
    await test('zero /degen love/i matches in source + compiled/minified twins', async () => {
      const files = [
        'app.js', 'translations.js', 'landing.js',
        'app.compiled.js', 'app.compiled.min.js', 'translations.min.js'
      ];
      const offenders = [];
      for (const f of files) {
        const filePath = path.join(ROOT, f);
        if (!fs.existsSync(filePath)) { offenders.push(f + ': FILE MISSING'); continue; }
        const contents = fs.readFileSync(filePath, 'utf8');
        if (/degen love/i.test(contents)) offenders.push(f);
      }
      if (offenders.length) throw new Error('"degen love" still present in: ' + offenders.join(', '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' footer-contract assertions passed');
}

main().catch((err) => {
  console.error('test_footer_contract.js crashed: ' + err.message);
  process.exitCode = 1;
});
