/* Playwright acceptance gate for spec 165 (anomalous pools: rail the DERIVED
   DOLLAR projections on pool-detail).

   Bug: when a pool's totalApy exceeds APY_SANITY_LIMIT_LOCAL (1000%), the
   rate itself is flagged (⚠ + High risk), but every DOLLAR AMOUNT compounded
   from that rate rendered anyway — e.g. a real live pool (zeebu/BSC/ZBU,
   345,079.1% total) produced "$100 in this pool grows to
   ~$49,002,948,093,727,200,000 in 5y". This test proves, against a REAL
   render of the COMPILED production bundle (home.html loads
   PoolDetail.compiled.min.js, never PoolDetail.js — spec criterion 8), that:

   1. no $-figure >= $1,000,000,000 renders anywhere on an anomalous pool's
      detail page (parsed out of document.body.innerText, not string-matched);
   2. the projection card renders the new honest out-of-range line instead,
      and the daily/monthly quick-metric values + calculator amount render
      the placeholder "—";
   3. the ⚠ anomaly warning and "High" risk level still render (rail intact);
   4. the hero still renders the pool's own rate (345,079.06%) — the datum is
      demoted+flagged, never hidden;
   5. a healthy pool (real snapshot pool, normal APY) is unaffected — all
      four dollar surfaces render real, non-zero $ figures;
   6. KO parity — the new line renders in Korean with no raw t('...') key
      leak, and the anomalous-pool $1B guard holds in KO too.

   Fixture-routed exactly like test_mean30d_sanity.js / test_dead_pool.js:
   home.html loads React/ReactDOM/translations/PoolDetail/app entirely from
   LOCAL vendored files (home.html:173-174, :354-355) — the only external
   request is yields.llama.fi/pools, fixture-routed here. External
   font/analytics fetches fail locally and are ignorable per CLAUDE.md.
   Browser-originated HTTPS is proxy-blocked in-sandbox (standing decision
   2026-07-12).

   Run: node test_pool_detail_anomaly_projection.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8863; // distinct from other test_* files (8791-8862 taken)
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Runtime strings straight from the source of truth (never hardcoded).
const { translations: tr } = require('./translations.js');

// Anomalous fixture — real live shape from the spec's own evidence (zeebu
// pool, ~345,079% total APY). TVL kept modest ($577,957, the spec's own
// figure) so the TVL display itself never brushes the $1B guard.
const ANOMALOUS = {
  pool: 'anomalous-fixture-pool', project: 'zeebu', symbol: 'ZBU', chain: 'BSC',
  tvlUsd: 577957, apyBase: 345079.06, apyReward: 0
};
// Healthy fixture — a REAL pool from the committed snapshot (same id used by
// test_ko_pool_money_honesty.js: lido stETH), normal APY, well above the
// $10M floor.
const HEALTHY = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90', project: 'lido', symbol: 'STETH',
  chain: 'Ethereum', tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: [ANOMALOUS, HEALTHY] });

let passed = 0;
const TOTAL = 9;
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

// Extracts every $-prefixed number (e.g. "$1,000", "$577,957") from a string.
function dollarFigures(s) {
  return (s.match(/\$[\d,]+(?:\.\d+)?/g) || []).map((m) => Number(m.replace(/[$,]/g, '')));
}

// Land directly on ?pool=<id> (the SEO / share deep-link path, the same one
// item 165's evidence used) and read the settled pool-detail DOM.
async function renderPool(page, poolId, lang) {
  const langQ = lang ? `&lang=${lang}` : '';
  await page.goto(
    `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}${langQ}`,
    { waitUntil: 'load', timeout: 20000 }
  );
  await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
  await page.waitForSelector('.quick-metrics', { timeout: 15000 });
  await page.waitForSelector('.calc-disclaimer', { timeout: 15000 });
  // Metric cards use AnimatedNumber (1000ms/1500ms duration) when healthy —
  // let the animation settle so the final $ figure (not an in-flight one) is
  // read for the healthy-pool assertions.
  await page.waitForTimeout(1700);

  return page.evaluate(() => {
    const projectionCard = document.querySelector('.pool-projection-card');
    const projectionBody = projectionCard ? projectionCard.children[1].textContent.trim() : null;
    const quickMetricCards = Array.from(document.querySelectorAll('.quick-metrics > div'));
    const dailyValue = quickMetricCards[0] ? quickMetricCards[0].children[1].textContent.trim() : null;
    const monthlyValue = quickMetricCards[1] ? quickMetricCards[1].children[1].textContent.trim() : null;
    const disclaimers = Array.from(document.querySelectorAll('.calc-disclaimer'));
    const calcDisclaimer = disclaimers[1]; // [0] = projection card's, [1] = calculator's
    const basedOnDiv = calcDisclaimer ? calcDisclaimer.previousElementSibling : null;
    const calcValueDiv = basedOnDiv ? basedOnDiv.previousElementSibling : null;
    const calcValue = calcValueDiv ? calcValueDiv.textContent.trim() : null;
    const riskCard = document.querySelector('.risk-card');
    const heroApy = document.querySelector('.apy-value-hero');
    const anomalyWarnings = Array.from(document.querySelectorAll('.calc-warning'))
      .map((n) => n.textContent.trim());
    return {
      bodyText: document.body.innerText,
      projectionBody,
      dailyValue,
      monthlyValue,
      calcValue,
      riskCardText: riskCard ? riskCard.textContent : null,
      heroApyText: heroApy ? heroApy.textContent.trim() : null,
      anomalyWarnings
    };
  });
}

async function main() {
  console.log('network: unpkg.com/browser-external HTTPS BLOCKED (home.html vendors React/ReactDOM/PoolDetail/app locally), ' +
    'yields.llama.fi BLOCKED (DefiLlama-shaped fixture)');

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const source = msg.location()?.url || '';
      if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
        pageErrors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
      }
    });

    await page.route('https://icons.llamao.fi/**', (route) => route.abort());
    await page.route('**/data/pools-snapshot*', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
    }));
    await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
    }));

    // --- Criteria 1-3: anomalous pool, no fiction -------------------------
    const anomEn = await renderPool(page, ANOMALOUS.pool);

    await test('criterion 1: anomalous pool renders NO $-figure >= $1,000,000,000 anywhere', async () => {
      const figs = dollarFigures(anomEn.bodyText);
      const huge = figs.filter((n) => n >= 1_000_000_000);
      if (huge.length) throw new Error(`found ${huge.length} huge $ figure(s): ${JSON.stringify(huge)}`);
      if (figs.length === 0) throw new Error('expected at least some $ figures to render (e.g. TVL) — parse may be broken');
    });

    await test('criterion 2a: projection card renders the honest out-of-range line, not projectionBody', async () => {
      if (!anomEn.projectionBody) throw new Error('projection card body did not render');
      if (anomEn.projectionBody !== tr.en.projectionBodyOutOfRange) {
        throw new Error(`expected exact projectionBodyOutOfRange text, got: "${anomEn.projectionBody}"`);
      }
      if (/\$/.test(anomEn.projectionBody)) throw new Error('out-of-range projection line still contains a $ figure');
    });

    await test('criterion 2b: daily + monthly quick-metric values render "—", not a $ figure', async () => {
      if (anomEn.dailyValue !== '—') throw new Error(`expected daily value "—", got: "${anomEn.dailyValue}"`);
      if (anomEn.monthlyValue !== '—') throw new Error(`expected monthly value "—", got: "${anomEn.monthlyValue}"`);
    });

    await test('criterion 2c: yield-calculator amount renders "—", not a $ figure', async () => {
      if (anomEn.calcValue !== '—') throw new Error(`expected calculator value "—", got: "${anomEn.calcValue}"`);
    });

    await test('criterion 3: ⚠ anomaly warning renders and Risk Assessment reads High', async () => {
      if (!anomEn.anomalyWarnings.some((w) => w === tr.en.calcAnomalyWarning)) {
        throw new Error(`expected an anomaly warning matching translations.en.calcAnomalyWarning, got: ${JSON.stringify(anomEn.anomalyWarnings)}`);
      }
      if (!anomEn.riskCardText || !anomEn.riskCardText.includes(tr.en.highRisk)) {
        throw new Error(`expected risk card to read "${tr.en.highRisk}", got: "${anomEn.riskCardText}"`);
      }
    });

    await test('criterion 4: hero still renders the pool\'s own rate (345,079.06%) — datum not hidden', async () => {
      if (!anomEn.heroApyText || !anomEn.heroApyText.includes('345,079.06%')) {
        throw new Error(`expected hero APY to include "345,079.06%", got: "${anomEn.heroApyText}"`);
      }
    });

    // --- Criterion 5: healthy pool unaffected ------------------------------
    const healthyEn = await renderPool(page, HEALTHY.pool);

    await test('criterion 5: healthy pool renders real $ figures on all four surfaces + the normal projectionBody sentence', async () => {
      if (healthyEn.projectionBody === tr.en.projectionBodyOutOfRange) {
        throw new Error('healthy pool incorrectly rendered the out-of-range line');
      }
      if (!/\$1,000 in this pool grows to ~\$/.test(healthyEn.projectionBody)) {
        throw new Error(`expected the normal projectionBody sentence, got: "${healthyEn.projectionBody}"`);
      }
      for (const [label, val] of [['dailyValue', healthyEn.dailyValue], ['monthlyValue', healthyEn.monthlyValue], ['calcValue', healthyEn.calcValue]]) {
        if (val === '—') throw new Error(`healthy pool's ${label} incorrectly rendered "—"`);
        const figs = dollarFigures(val);
        if (figs.length !== 1 || !(figs[0] > 0)) throw new Error(`healthy pool's ${label} ("${val}") is not a single positive $ figure`);
      }
    });

    // --- Criterion 6: KO parity ---------------------------------------------
    const anomKo = await renderPool(page, ANOMALOUS.pool, 'ko');

    await test('criterion 6: KO anomalous pool renders the new line in Korean, no raw t(\'...\') key leak, still no $1B+ figure', async () => {
      if (anomKo.projectionBody !== tr.ko.projectionBodyOutOfRange) {
        throw new Error(`expected exact KO projectionBodyOutOfRange text, got: "${anomKo.projectionBody}"`);
      }
      if (/projectionBodyOutOfRange/.test(anomKo.bodyText)) throw new Error('raw translation key leaked into KO render');
      if (/^[a-zA-Z]/.test(anomKo.projectionBody)) throw new Error('KO projection line looks like an untranslated EN/raw-key string');
      const figs = dollarFigures(anomKo.bodyText);
      if (figs.some((n) => n >= 1_000_000_000)) throw new Error('KO render still contains a $1B+ figure');
    });

    await test('zero page errors across all renders', async () => {
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
    });

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/' + TOTAL + ' pool-detail anomaly-projection assertions passed');
  if (passed !== TOTAL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_pool_detail_anomaly_projection crashed: ' + err.message);
  process.exitCode = 1;
});
