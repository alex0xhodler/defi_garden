/* Rendered Playwright acceptance for backlog 137 — P0 KO money honesty.

   Bug: in Korean, five pool-detail money strings ran raw USD numbers through
   translations.js `formatKoreanCurrency()`, which appended `원` (KRW) + 만/억
   grouping — mislabeling USD as Won (~1300x distortion) on the north-star
   conversion surface (the two CTAs, PoolDetail.js:497/517). Fix (spec 137):
   render honest `$`-prefixed en-US USD in KO, no FX; retire the helper.

   This test proves, against a REAL render (not source reading), that a
   pool-detail page in `lang=ko`:
   (1) shows NO `<digit>원` currency suffix anywhere in the detail view
       (the exact defect signature — `원` in 정원/영원/원금 etc. is a word,
       never preceded by a digit, so the regex targets only the bug);
   (2) renders every daily/monthly sub-label as `$<en-US> 기준`;
   (3) renders the projection body + concrete garden CTA with `$` figures;
   (4) is numerically IDENTICAL to the EN render of the same pool (the fix is
       display-honesty, not a value change) — proving no FX was invented;
   (5) throws no unexpected page/console errors.

   Fixture-routed exactly like test_northstar_cta_fires.js (unpkg React/Babel
   vendored from node_modules, snapshot 404'd to force the live path,
   yields.llama.fi/pools fulfilled from a byte-stable fixture) — browser
   external HTTPS is blocked in-sandbox (NORTH_STAR.md 2026-07-12).

   Run: node test_ko_pool_money_honesty.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8819; // distinct from other test_* files
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH),
// same id the north-star test uses — verified present before the run.
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
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
}

// Loads the pool-detail page in the given lang and returns a snapshot of the
// rendered money surface: the full detail-view text, the metric sub-labels,
// the projection body, and the primary garden CTA text.
async function renderDetail(browser, lang) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      pageErrors.push('console.error: ' + m.text());
  });
  await routeFixtures(page);
  const langQ = lang ? `&lang=${lang}` : '';
  await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(POOL.pool)}${langQ}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  // Let the calculator's default investment + projection render fully.
  await page.waitForSelector('.metric-sublabel', { timeout: 10000 });

  const snap = await page.evaluate(() => {
    const view = document.querySelector('.pool-detail-view');
    const sublabels = Array.from(document.querySelectorAll('.metric-sublabel')).map((n) => n.textContent.trim());
    const cta = document.querySelector('.cta-button-primary');
    // The projection body is the bold line under the "장기적으로 보면" /
    // "The long game" heading; grab the whole view text and slice for robustness.
    return {
      viewText: view ? view.innerText : '',
      sublabels,
      ctaText: cta ? cta.textContent.trim() : ''
    };
  });
  snap.pageErrors = pageErrors;
  await page.close();
  return snap;
}

// Extracts the $-figures (e.g. "$1,000", "$1,189") from a string, in order.
function dollarFigures(s) {
  return (s.match(/\$[\d,]+(?:\.\d+)?/g) || []);
}

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.find((p) => p.pool === POOL.pool)) {
    throw new Error(`POOL.pool ${POOL.pool} not found in data/pools-snapshot.json — pick a real id`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const ko = await renderDetail(browser, 'ko');
    const en = await renderDetail(browser, 'en');

    await test('KO pool-detail renders (no unexpected page/console errors)', async () => {
      if (ko.pageErrors.length) throw new Error('KO page errors: ' + ko.pageErrors.join(' | '));
      if (!ko.viewText) throw new Error('KO pool-detail-view rendered empty');
    });

    await test('KO render is actually Korean (sanity: KO-only copy present)', async () => {
      // '기준' (used by the sub-labels) + a KO detail label confirm the ko dict loaded.
      if (!/기준/.test(ko.viewText)) throw new Error('no KO "기준" text found — lang=ko may not have applied');
      if (/on \$/.test(ko.sublabels.join(' '))) throw new Error('EN sub-label ("on $...") leaked into KO render');
    });

    await test('DEFECT SIGNATURE GONE: no <digit>원 currency suffix anywhere in KO detail view', async () => {
      // The bug produced "1,189원", "1,000원", "5.0만원", "1.2억원". A digit
      // immediately before 원 (optionally via 만/억) is the exact signature;
      // word-원 (정원/영원/원금) is never preceded by a digit.
      const m = ko.viewText.match(/[\d,](?:만|억)?원/g);
      if (m) throw new Error('found Won-suffixed USD figures (the bug): ' + JSON.stringify(m));
    });

    await test('KO daily/monthly sub-labels render as "$<en-US> 기준" (honest USD)', async () => {
      if (ko.sublabels.length < 2) throw new Error('expected >=2 .metric-sublabel (daily + monthly), got ' + JSON.stringify(ko.sublabels));
      for (const s of ko.sublabels) {
        if (!/^\$[\d,]+(?:\.\d+)? 기준$/.test(s)) {
          throw new Error(`sub-label not honest "$<en-US> 기준": "${s}"`);
        }
      }
    });

    await test('KO concrete garden CTA carries a $ projection, no 원', async () => {
      // lido is not anomalous → showConcreteCta true → gardenThisPoolCtaConcrete.
      if (!/가든하기/.test(ko.ctaText)) throw new Error('primary CTA is not the garden CTA: "' + ko.ctaText + '"');
      if (!/\$[\d,]+/.test(ko.ctaText)) throw new Error('concrete garden CTA has no $ figure: "' + ko.ctaText + '"');
      if (/[\d,](?:만|억)?원/.test(ko.ctaText)) throw new Error('garden CTA still shows Won over USD: "' + ko.ctaText + '"');
    });

    await test('KO projection body renders $ figures and ends "…됩니다" with no 원', async () => {
      const line = ko.viewText.split('\n').find((l) => /됩니다/.test(l) && /\$/.test(l)) || '';
      if (!line) throw new Error('no KO projection line with a $ figure found');
      if (dollarFigures(line).length < 2) throw new Error('projection body should carry principal + projected $ figures: "' + line + '"');
      if (/[\d,](?:만|억)?원/.test(line)) throw new Error('projection body still shows Won over USD: "' + line + '"');
    });

    await test('KO $ figures are NUMERICALLY IDENTICAL to the EN render (no FX invented)', async () => {
      // Sub-labels are the cleanest 1:1 comparison: both langs feed the same
      // investmentAmount through en-US grouping.
      const koFigs = ko.sublabels.map((s) => dollarFigures(s)[0]);
      const enFigs = en.sublabels.map((s) => dollarFigures(s)[0]);
      if (JSON.stringify(koFigs) !== JSON.stringify(enFigs)) {
        throw new Error(`KO/EN sub-label $ figures differ — KO ${JSON.stringify(koFigs)} vs EN ${JSON.stringify(enFigs)} (an FX conversion would diverge here)`);
      }
      if (koFigs.some((f) => !f)) throw new Error('a KO sub-label had no $ figure: ' + JSON.stringify(ko.sublabels));
    });

    console.log(`\ntest_ko_pool_money_honesty.js: ${passed} tests passed`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
