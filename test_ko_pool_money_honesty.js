/* Rendered Playwright acceptance for backlog 137 — P0 KO money honesty.

   Bug: in Korean, five pool-detail money strings ran raw USD numbers through
   translations.js `formatKoreanCurrency()`, which appended `원` (KRW) + 만/억
   grouping — mislabeling USD as Won (~1300x distortion) on the north-star
   conversion surface (the two CTAs, PoolDetail.js:497/517). Fix (spec 137):
   render honest `$`-prefixed en-US USD in KO, no FX; retire the helper.

   RE-POINTED for spec 210 (input-first earnings block merge, see
   specs/210-notes.md for the line-by-line justification): the daily/monthly
   `.metric-sublabel` stat cards this test used to read ("$X 기준" honest
   sub-labels) no longer exist — 210 merged them into the calculator's single
   readout. Their direct successor for the "honest $ format, no won" contract
   is the calculator readout's "Based on $X investment" line (KO:
   `t('basedOnInvestment')` → "$X 투자 기준") — same honest-$-format contract,
   same translation-key family, just one line instead of two. The
   walk-back-from-.calc-disclaimer technique matches test_pool_detail_
   anomaly_projection.js's `calcValue` extraction (both read the same DOM
   neighbourhood, now that 210 collapsed the earnings surfaces).

   This test proves, against a REAL render (not source reading), that a
   pool-detail page in `lang=ko`:
   (1) shows NO `<digit>원` currency suffix anywhere in the detail view
       (the exact defect signature — `원` in 정원/영원/원금 etc. is a word,
       never preceded by a digit, so the regex targets only the bug);
   (2) renders the calculator's "based on investment" line as
       `$<en-US> 투자 기준` (honest USD, no FX);
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
  await page.waitForSelector('.calc-disclaimer', { timeout: 10000 });

  const snap = await page.evaluate(() => {
    const view = document.querySelector('.pool-detail-view');
    // 210: the daily/monthly .metric-sublabel stat cards are gone. The
    // calculator readout's "Based on $X investment" line is the direct
    // successor.
    //
    // RE-POINTED (post-210 verifier trust-rail fix): the original walk-back-
    // from-.calc-disclaimer technique broke when the fix moved the
    // disclaimer OUT of the readout box (now a sibling of the whole
    // calculatorExpanded && block, so it survives collapsing — see
    // PoolDetail.js). Locate the readout box structurally instead: it's the
    // LAST child of .calculator-content, with children
    // [label, value, "based on investment"] — basedOnLine is child[2].
    const content = document.querySelector('.calculator-content');
    const readout = content ? content.lastElementChild : null;
    const basedOnDiv = readout ? readout.children[2] : null;
    const basedOnLine = basedOnDiv ? basedOnDiv.textContent.trim() : '';
    // 210: the HERO .cta-button-primary label is now always the plain
    // generic string (no $ projection — see PoolDetail.js A4). The repeat
    // CTA inside the earnings block is the one that KEEPS the concrete
    // showConcreteCta projection label, since by that point the user has
    // parameterised the input. Grab both.
    const ctas = Array.from(document.querySelectorAll('.cta-button-primary'));
    // The projection body is the bold line under the "장기적으로 보면" /
    // "The long game" heading; grab the whole view text and slice for robustness.
    return {
      viewText: view ? view.innerText : '',
      basedOnLine,
      heroCtaText: ctas[0] ? ctas[0].textContent.trim() : '',
      repeatCtaText: ctas[1] ? ctas[1].textContent.trim() : ''
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
      // '기준' (used by the "based on investment" line) + a KO detail label
      // confirm the ko dict loaded.
      if (!/기준/.test(ko.viewText)) throw new Error('no KO "기준" text found — lang=ko may not have applied');
      if (/on \$/.test(ko.basedOnLine)) throw new Error('EN "based on" line ("on $...") leaked into KO render');
    });

    await test('DEFECT SIGNATURE GONE: no <digit>원 currency suffix anywhere in KO detail view', async () => {
      // The bug produced "1,189원", "1,000원", "5.0만원", "1.2억원". A digit
      // immediately before 원 (optionally via 만/억) is the exact signature;
      // word-원 (정원/영원/원금) is never preceded by a digit.
      const m = ko.viewText.match(/[\d,](?:만|억)?원/g);
      if (m) throw new Error('found Won-suffixed USD figures (the bug): ' + JSON.stringify(m));
    });

    // RE-POINTED (210): the daily/monthly .metric-sublabel stat cards this
    // leg used to check no longer exist. The calculator readout's "Based on
    // $X investment" line (KO: "$X 투자 기준") is the direct successor —
    // same honest-$-format contract, one line instead of two.
    await test('KO "based on investment" line renders as "$<en-US> 투자 기준" (honest USD)', async () => {
      if (!ko.basedOnLine) throw new Error('expected a "based on investment" line under the calculator readout, got none');
      if (!/^\$[\d,]+(?:\.\d+)? 투자 기준$/.test(ko.basedOnLine)) {
        throw new Error(`"based on investment" line not honest "$<en-US> 투자 기준": "${ko.basedOnLine}"`);
      }
    });

    // RE-POINTED (210): the HERO garden CTA is now always the plain generic
    // label (no $ projection — PoolDetail.js A4), so this leg now targets the
    // REPEAT CTA inside the earnings block, which keeps the concrete
    // showConcreteCta projection label unchanged.
    await test('KO hero garden CTA is the plain generic label, no $ figure, no 원', async () => {
      if (!/가든하기/.test(ko.heroCtaText)) throw new Error('hero primary CTA is not the garden CTA: "' + ko.heroCtaText + '"');
      if (/\$[\d,]+/.test(ko.heroCtaText)) throw new Error('hero garden CTA unexpectedly carries a $ projection (should be the plain generic label post-210): "' + ko.heroCtaText + '"');
    });

    await test('KO repeat garden CTA carries a $ projection, no 원', async () => {
      // lido is not anomalous → showConcreteCta true → gardenThisPoolCtaConcrete.
      if (!/가든하기/.test(ko.repeatCtaText)) throw new Error('repeat primary CTA is not the garden CTA: "' + ko.repeatCtaText + '"');
      if (!/\$[\d,]+/.test(ko.repeatCtaText)) throw new Error('concrete repeat garden CTA has no $ figure: "' + ko.repeatCtaText + '"');
      if (/[\d,](?:만|억)?원/.test(ko.repeatCtaText)) throw new Error('repeat garden CTA still shows Won over USD: "' + ko.repeatCtaText + '"');
    });

    await test('KO projection body renders $ figures and ends "…됩니다" with no 원', async () => {
      const line = ko.viewText.split('\n').find((l) => /됩니다/.test(l) && /\$/.test(l)) || '';
      if (!line) throw new Error('no KO projection line with a $ figure found');
      if (dollarFigures(line).length < 2) throw new Error('projection body should carry principal + projected $ figures: "' + line + '"');
      if (/[\d,](?:만|억)?원/.test(line)) throw new Error('projection body still shows Won over USD: "' + line + '"');
    });

    // RE-POINTED (210): the "based on investment" line is the cleanest 1:1
    // comparison now available (both langs feed the same investmentAmount
    // through en-US grouping) — the old two-sublabel comparison had no
    // successor that still carries the SAME investmentAmount as two distinct
    // rendered lines, so this now also cross-checks the repeat CTA's
    // projected $ figure for a second, independent data point.
    await test('KO $ figures are NUMERICALLY IDENTICAL to the EN render (no FX invented)', async () => {
      const koBasedOn = dollarFigures(ko.basedOnLine)[0];
      const enBasedOn = dollarFigures(en.basedOnLine)[0];
      if (koBasedOn !== enBasedOn) {
        throw new Error(`KO/EN "based on investment" $ figures differ — KO ${JSON.stringify(koBasedOn)} vs EN ${JSON.stringify(enBasedOn)} (an FX conversion would diverge here)`);
      }
      if (!koBasedOn) throw new Error('KO "based on investment" line had no $ figure: ' + JSON.stringify(ko.basedOnLine));

      const koCtaFig = dollarFigures(ko.repeatCtaText)[0];
      const enCtaFig = dollarFigures(en.repeatCtaText)[0];
      if (koCtaFig !== enCtaFig) {
        throw new Error(`KO/EN repeat-CTA projection $ figures differ — KO ${JSON.stringify(koCtaFig)} vs EN ${JSON.stringify(enCtaFig)} (an FX conversion would diverge here)`);
      }
      if (!koCtaFig) throw new Error('KO repeat CTA had no $ figure: ' + JSON.stringify(ko.repeatCtaText));
    });

    console.log(`\ntest_ko_pool_money_honesty.js: ${passed} tests passed`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
