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

   Post-210 verifier round — collapse-state trust-rail regression guard
   (criteria 7-8, added here since this file already drives the anomalous
   fixture and both the degen-haircut and anomaly warnings coincide on it —
   see the ANOMALOUS fixture below, whose forced riskScore:100 makes it BOTH
   anomalous AND degen-tier at once): 210 moved the degen-haircut warning,
   the anomaly warning, and the single .calc-disclaimer to always-rendered
   siblings of the collapsible calculator content, specifically so that
   collapsing the "Calculate Your Earnings" block (a single click, a
   reachable state — `calculatorExpanded` starts true but the header toggles
   it) can never silently drop a trust-rail disclosure. Before that fix all
   three lived INSIDE the `calculatorExpanded &&` guard, so collapsing wiped
   them while the moved repeat CTA (a sibling, unaffected by the guard) kept
   showing its concrete "~$X in 5y" projection with no disclaimer in sight.
   7. EXPANDED (default): exactly one anomaly .calc-warning and exactly one
      .calc-disclaimer render for the anomalous fixture.
   8. COLLAPSED (click the calculator header first, verify the collapsible
      content actually unmounted — not a vacuous check): the anomaly
      warning, the degen-haircut warning, and the disclaimer ALL still
      render, each exactly once.

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
const TOTAL = 11;
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

// RE-POINTED for spec 210: the old standalone daily/monthly quick-metric
// stat cards (.quick-metrics) that used to hold these two data points are
// gone — 210 merged them into ONE toggleable calculator readout (the 1D/7D/
// 30D tabs inside .calculator-compact). Click the named tab and read the
// readout's current $ value.
//
// RE-POINTED AGAIN (post-210 verifier fix): the original walk-back-from-
// .calc-disclaimer technique broke when the trust-rail fix moved the
// disclaimer OUT of the readout box (it's now a sibling of the whole
// calculatorExpanded && block, so it survives collapsing — see
// PoolDetail.js). The readout box no longer has a disclaimer as a child at
// all. Locate it structurally instead: it's the LAST child of
// .calculator-content (after the investment-input-group, the projection
// card, and the tab navigation), and its own children are
// [label, value, "based on investment"] — the value is child[1].
async function readCalcValueForTab(page, tabText) {
  const tabBtn = page.locator('button', { hasText: new RegExp('^' + tabText + '$') });
  if (await tabBtn.count()) {
    await tabBtn.first().click();
    await page.waitForTimeout(150);
  }
  return page.evaluate(() => {
    const content = document.querySelector('.calculator-content');
    const readout = content ? content.lastElementChild : null;
    const calcValueDiv = readout ? readout.children[1] : null;
    return calcValueDiv ? calcValueDiv.textContent.trim() : null;
  });
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
  await page.waitForSelector('.pool-projection-card', { timeout: 15000 });
  await page.waitForSelector('.calc-disclaimer', { timeout: 15000 });
  // Metric cards use AnimatedNumber (1000ms/1500ms duration) when healthy —
  // let the animation settle so the final $ figure (not an in-flight one) is
  // read for the healthy-pool assertions.
  await page.waitForTimeout(1700);

  // dailyValue reads the '1 Day' tab; monthlyValue reads '30 Days' (the
  // default tab — clicking it back also restores the default state before
  // the rest of the DOM is read below).
  const dailyValue = await readCalcValueForTab(page, '1 Day');
  const monthlyValue = await readCalcValueForTab(page, '30 Days');

  const rest = await page.evaluate(() => {
    const projectionCard = document.querySelector('.pool-projection-card');
    const projectionBody = projectionCard ? projectionCard.children[1].textContent.trim() : null;
    // See readCalcValueForTab's comment above — the readout box (last child
    // of .calculator-content) is now located structurally, not via the
    // disclaimer (which moved out of it in the post-210 trust-rail fix).
    const content = document.querySelector('.calculator-content');
    const readout = content ? content.lastElementChild : null;
    const calcValueDiv = readout ? readout.children[1] : null;
    const calcValue = calcValueDiv ? calcValueDiv.textContent.trim() : null;
    const heroApy = document.querySelector('.apy-value-hero');
    // 210: the standalone .risk-card is gone — risk now renders as the LAST
    // chip in the hero's .trust-indicators row (alongside Verified + TVL),
    // with no dedicated className (210's hard constraint: zero new CSS
    // classes, so the chip carries no test-only hook either).
    const trustIndicators = document.querySelector('.trust-indicators');
    const riskChip = trustIndicators ? trustIndicators.lastElementChild : null;
    const anomalyWarnings = Array.from(document.querySelectorAll('.calc-warning'))
      .map((n) => n.textContent.trim());
    return {
      bodyText: document.body.innerText,
      projectionBody,
      calcValue,
      riskChipText: riskChip ? riskChip.textContent.trim() : null,
      heroApyText: heroApy ? heroApy.textContent.trim() : null,
      anomalyWarnings
    };
  });

  return Object.assign({ dailyValue, monthlyValue }, rest);
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

    // RE-POINTED (210): the daily/monthly quick-metric stat cards this test
    // used to read from .quick-metrics no longer exist as standalone
    // elements — 210 merged them into the calculator's single toggleable
    // readout. dailyValue/monthlyValue now come from clicking the '1 Day'/
    // '30 Days' tabs (see readCalcValueForTab above) and reading that same
    // readout; the assertion itself (both render the "—" placeholder for an
    // anomalous pool, never a $ figure) is unchanged.
    await test('criterion 2b: the calculator readout on both the 1D and 30D tabs renders "—", not a $ figure', async () => {
      if (anomEn.dailyValue !== '—') throw new Error(`expected daily (1D tab) value "—", got: "${anomEn.dailyValue}"`);
      if (anomEn.monthlyValue !== '—') throw new Error(`expected monthly (30D tab) value "—", got: "${anomEn.monthlyValue}"`);
    });

    await test('criterion 2c: yield-calculator amount renders "—", not a $ figure', async () => {
      if (anomEn.calcValue !== '—') throw new Error(`expected calculator value "—", got: "${anomEn.calcValue}"`);
    });

    // RE-POINTED (210): the standalone .risk-card ("Risk Assessment" card in
    // the old .quick-metrics grid) is gone — risk now renders as the last
    // chip in the hero's .trust-indicators row (see PoolDetail.js's A1
    // change). riskCardText -> riskChipText; the substring assertion itself
    // is unchanged (still just checks the rendered risk level text reads
    // "High").
    await test('criterion 3: ⚠ anomaly warning renders and the hero risk chip reads High', async () => {
      if (!anomEn.anomalyWarnings.some((w) => w === tr.en.calcAnomalyWarning)) {
        throw new Error(`expected an anomaly warning matching translations.en.calcAnomalyWarning, got: ${JSON.stringify(anomEn.anomalyWarnings)}`);
      }
      if (!anomEn.riskChipText || !anomEn.riskChipText.includes(tr.en.highRisk)) {
        throw new Error(`expected the hero risk chip to read "${tr.en.highRisk}", got: "${anomEn.riskChipText}"`);
      }
    });

    await test('criterion 4: hero still renders the pool\'s own rate (345,079.06%) — datum not hidden', async () => {
      if (!anomEn.heroApyText || !anomEn.heroApyText.includes('345,079.06%')) {
        throw new Error(`expected hero APY to include "345,079.06%", got: "${anomEn.heroApyText}"`);
      }
    });

    // --- Criterion 7: EXPANDED — exact-once counts (post-210 verifier fix) --
    await test('criterion 7: EXPANDED — exactly one anomaly .calc-warning and exactly one .calc-disclaimer render', async () => {
      const anomalyCount = anomEn.anomalyWarnings.filter((w) => w === tr.en.calcAnomalyWarning).length;
      if (anomalyCount !== 1) {
        throw new Error(`expected exactly 1 anomaly .calc-warning, got ${anomalyCount}: ${JSON.stringify(anomEn.anomalyWarnings)}`);
      }
      const disclaimerCount = await page.locator('.calc-disclaimer').count();
      if (disclaimerCount !== 1) {
        throw new Error(`expected exactly 1 .calc-disclaimer, got ${disclaimerCount}`);
      }
    });

    // --- Criterion 8: COLLAPSED — the trust-rail regression guard -----------
    // Before the post-210 fix, the degen-haircut warning, the anomaly
    // warning, and the .calc-disclaimer all lived INSIDE the
    // calculatorExpanded && guard, so a single click collapsing "Calculate
    // Your Earnings" silently dropped all three while the repeat CTA (a
    // sibling, unaffected by the guard) kept showing its concrete
    // "~$X in 5y" projection with no disclaimer anywhere on the page. This
    // proves the fix: all three now survive collapsing. The ANOMALOUS
    // fixture's forced riskScore:100 (see getRiskAssessment's anomalous-yield
    // override) makes gardenPersona 'degen' too, so this single collapsed
    // render exercises BOTH the degen-haircut warning and the anomaly
    // warning at once.
    await test('criterion 8: COLLAPSED — degen-haircut warning, anomaly warning, and disclaimer all still render, each exactly once', async () => {
      await page.locator('.calculator-header').click();
      // Prove the collapse actually happened — a check that never observes
      // the collapsed state would pass whether or not the guard fix worked
      // (compiled-artifact-mutation-proof.md's non-vacuity rule).
      await page.waitForSelector('.calculator-content', { state: 'detached', timeout: 5000 });

      const collapsed = await page.evaluate(() => ({
        warnings: Array.from(document.querySelectorAll('.calc-warning')).map((n) => n.textContent.trim()),
        disclaimerCount: document.querySelectorAll('.calc-disclaimer').length,
        primaryCtaCount: document.querySelectorAll('.cta-button-primary').length,
        echoLinkCount: document.querySelectorAll('.cta-echo-link').length
      }));

      const anomalyCount = collapsed.warnings.filter((w) => w === tr.en.calcAnomalyWarning).length;
      if (anomalyCount !== 1) {
        throw new Error(`collapsed: expected exactly 1 anomaly warning, got ${anomalyCount}: ${JSON.stringify(collapsed.warnings)}`);
      }
      // poolDegenHaircutNote is a template fn (headline interpolated); match
      // on its fixed substring rather than reconstructing the exact string.
      const degenCount = collapsed.warnings.filter((w) => /⅓ haircut/.test(w)).length;
      if (degenCount !== 1) {
        throw new Error(`collapsed: expected exactly 1 degen-haircut warning, got ${degenCount}: ${JSON.stringify(collapsed.warnings)}`);
      }
      if (collapsed.disclaimerCount !== 1) {
        throw new Error(`collapsed: expected exactly 1 .calc-disclaimer, got ${collapsed.disclaimerCount}`);
      }
      // Sanity: the hero primary AND the earnings-block echo link (237: the
      // repeat CTA is no longer a second .cta-button-primary) should still
      // be present alongside the now-restored warnings/disclaimer.
      if (collapsed.primaryCtaCount !== 1) {
        throw new Error(`collapsed: expected exactly 1 .cta-button-primary (hero only), got ${collapsed.primaryCtaCount}`);
      }
      if (collapsed.echoLinkCount !== 1) {
        throw new Error(`collapsed: expected the earnings-block .cta-echo-link to survive collapsing, got ${collapsed.echoLinkCount}`);
      }

      // Restore expanded state so it doesn't leak into any later render on
      // this same page/browser (none currently follow, but be defensive).
      await page.locator('.calculator-header').click();
      await page.waitForSelector('.calculator-content', { timeout: 5000 });
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
