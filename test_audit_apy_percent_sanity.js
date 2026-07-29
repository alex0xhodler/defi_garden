/* Rendered + fixture test for backlog 173 — the rail-relative APY-percent
   check on audit-app.js's rendered number-sanity leg (the 144 blind spot
   playbooks/product-audit.md's Automatability section names as a candidate
   extension: scanNumbers() is magnitude-only (ABSURD_MAGNITUDE = 1e11) and
   is blind to an out-of-rail PERCENT that never reaches that magnitude — the
   144 bug itself, apyMean30d = 36,452.38798%, is only 3.6e4).

   Three layers, each proving something the others cannot:

   1. Pure-function unit cases (no Playwright) for filterApyRailBreaches() —
      the exact threshold/exclusion/anomaly-suppression LOGIC, isolated from
      the DOM. Fast, deterministic, spec 173 criterion 2(a)'s explicit ask.

   2. DOM-extraction FIXTURE cases (real Chromium, page.setContent() with
      hand-built markup — NOT a real product page) for
      collectApyPercentCandidates() — the browser-side collector's own
      correctness: per-.pool-card scoping (spec 173 Territory notes: "must
      be per-.pool-card, not page-global" — a page-global flag would wrongly
      suppress an unflagged breach in a DIFFERENT card), the page-level
      fallback when no .pool-card ancestor exists, the two documented
      non-rate exclusions (.tvl-trend-note, .gp-item-fill), and that
      script/style text is never collected at all. These fixtures exist
      because today's REAL product markup cannot differentially exercise
      the per-card branch (see the header comment on case 2b below) — this
      is spec 173 criterion 2(b)'s "prove the DOM-extraction layer is live"
      ask, done directly rather than only inferred from a full-app render.

   3. REAL rendered acceptance criteria (via runAudit() against the actual
      app + committed/mutated data/pools-snapshot.json — the house pattern,
      mirrors test_audit_app.js):
        - true-negative pin on today's clean data (criterion 1)
        - non-vacuous positive control: an out-of-rail kpis.apyMomentum
          (PoolDetail.js:1483-1492, _formatApy(|mom|), only transitively
          bounded — spec 173 Territory notes flags this exact field) reaches
          the screen on a pool the product does NOT anomaly-flag (criterion 2)
        - anomaly-aware negative control: out-of-rail apyBase/apyReward that
          DOES render .calc-warning suppresses the new check specifically
          (criterion 3)
        - TVL-trend control: tvlTrend=19 renders "1,900%" and produces ZERO
          findings of the new check (criterion 4)
        - KO parity: clean KO render + anomaly suppression in KO (criterion 5)

   Run: node test_audit_apy_percent_sanity.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { runAudit, collectApyPercentCandidates, filterApyRailBreaches } = require('./audit-app.js');
const { APY_SANITY_LIMIT } = require('./src/poller-core.js');

const ROOT = __dirname;
const SNAPSHOT = path.join(ROOT, 'data', 'pools-snapshot.json');
const ANCHOR_POOL_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90'; // same anchor as test_audit_app.js
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-apy-pct-${tag}-${process.pid}.json`); }
function mutatedSnapshotPath(tag, mutateFn) {
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  const target = snap.pools.find((p) => p.pool === ANCHOR_POOL_ID) || snap.pools[0];
  mutateFn(target, snap);
  const p = path.join(os.tmpdir(), `audit-mutated-apy-pct-${tag}-${process.pid}.json`);
  fs.writeFileSync(p, JSON.stringify(snap));
  return p;
}

// ---------------------------------------------------------------------------
// Layer 1 — pure filterApyRailBreaches() unit cases. No Playwright, no I/O.
// ---------------------------------------------------------------------------
async function testPureHelper() {
  await test('filterApyRailBreaches: value > limit, not excluded, not anomalous -> included', () => {
    const out = filterApyRailBreaches([{ value: 1500, raw: '1,500%', excluded: false, anomalous: false }], APY_SANITY_LIMIT);
    assert(out.length === 1 && out[0].raw === '1,500%', 'expected the breach to survive the filter');
  });

  await test('filterApyRailBreaches: excluded=true suppresses regardless of value', () => {
    const out = filterApyRailBreaches([{ value: 190000, raw: '190,000%', excluded: true, anomalous: false }], APY_SANITY_LIMIT);
    assert(out.length === 0, 'excluded candidate must never be reported: ' + JSON.stringify(out));
  });

  await test('filterApyRailBreaches: anomalous=true suppresses regardless of value', () => {
    const out = filterApyRailBreaches([{ value: 5000, raw: '5,000%', excluded: false, anomalous: true }], APY_SANITY_LIMIT);
    assert(out.length === 0, 'anomalous candidate must never be reported: ' + JSON.stringify(out));
  });

  await test('filterApyRailBreaches: boundary — value === limit is NOT a breach (strictly greater, mirrors app.js isAnomalousApy)', () => {
    const out = filterApyRailBreaches([{ value: APY_SANITY_LIMIT, raw: `${APY_SANITY_LIMIT}%`, excluded: false, anomalous: false }], APY_SANITY_LIMIT);
    assert(out.length === 0, `value === limit must not breach (got ${JSON.stringify(out)})`);
  });

  await test('filterApyRailBreaches: boundary — value just above limit IS a breach', () => {
    const out = filterApyRailBreaches([{ value: APY_SANITY_LIMIT + 0.01, raw: `${APY_SANITY_LIMIT + 0.01}%`, excluded: false, anomalous: false }], APY_SANITY_LIMIT);
    assert(out.length === 1, `value just above limit must breach (got ${JSON.stringify(out)})`);
  });

  await test('filterApyRailBreaches: value <= limit is never reported', () => {
    const out = filterApyRailBreaches([{ value: 42, raw: '42%', excluded: false, anomalous: false }], APY_SANITY_LIMIT);
    assert(out.length === 0, 'a normal 42% must never be reported: ' + JSON.stringify(out));
  });

  await test('filterApyRailBreaches: non-finite/missing value is defensively dropped, never thrown', () => {
    const out = filterApyRailBreaches([{ value: NaN, raw: 'x', excluded: false, anomalous: false }, null, {}], APY_SANITY_LIMIT);
    assert(out.length === 0, 'non-finite/malformed candidates must be dropped, not reported: ' + JSON.stringify(out));
  });

  await test('filterApyRailBreaches: null/undefined candidates array does not throw', () => {
    assert(filterApyRailBreaches(null, APY_SANITY_LIMIT).length === 0, 'null candidates must yield []');
    assert(filterApyRailBreaches(undefined, APY_SANITY_LIMIT).length === 0, 'undefined candidates must yield []');
  });
}

// ---------------------------------------------------------------------------
// Layer 2 — collectApyPercentCandidates() DOM-extraction fixtures.
// Real Chromium, page.setContent() — controlled markup, not a real product
// page. Today's real grid markup CANNOT differentially exercise the
// per-.pool-card branch: the grid's only percent figure per card is the
// exact totalApy value that also derives .apy-anomalous (app.js:2336's
// isAnomalousApy), so an out-of-rail card is ALWAYS self-flagged by
// construction — a genuine "card breached but unflagged, different card
// breached and flagged" pair does not exist in the product today (recorded
// as a limitation in specs/173-notes.md). These fixtures test the
// EXTRACTION LOGIC directly instead.
// ---------------------------------------------------------------------------
async function testDomExtractionFixtures(browser) {
  async function collect(html) {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    const candidates = await page.evaluate(collectApyPercentCandidates);
    await page.close();
    return candidates;
  }

  await test('collectApyPercentCandidates: per-card scoping — card WITH .apy-anomalous suppresses only its own breach', async () => {
    const candidates = await collect(`
      <div class="pool-card" id="cardA">
        <div class="pool-apy-hero apy-anomalous">5000.00%</div>
      </div>
      <div class="pool-card" id="cardB">
        <div class="pool-apy-hero">3000.00%</div>
      </div>
    `);
    const a = candidates.find((c) => c.raw === '5000.00%');
    const b = candidates.find((c) => c.raw === '3000.00%');
    assert(a && a.anomalous === true && a.scope === 'card', 'card A (has .apy-anomalous) must be anomalous=true: ' + JSON.stringify(a));
    assert(b && b.anomalous === false && b.scope === 'card', 'card B (no marker of its own) must be anomalous=false even though card A has one — a page-global flag would wrongly suppress it: ' + JSON.stringify(b));
  });

  await test('collectApyPercentCandidates: page-level fallback — no .pool-card ancestor, marker present elsewhere -> anomalous', async () => {
    const candidates = await collect(`
      <div class="rate-momentum-note">6000.00%</div>
      <div class="calc-warning">warning</div>
    `);
    const c = candidates.find((x) => x.raw === '6000.00%');
    assert(c && c.scope === 'page' && c.anomalous === true, 'page-level candidate with a .calc-warning present anywhere must be anomalous=true: ' + JSON.stringify(c));
  });

  await test('collectApyPercentCandidates: page-level fallback — no .pool-card ancestor, no marker anywhere -> not anomalous', async () => {
    const candidates = await collect(`<div class="rate-momentum-note">6000.00%</div>`);
    const c = candidates.find((x) => x.raw === '6000.00%');
    assert(c && c.scope === 'page' && c.anomalous === false, 'page-level candidate with no marker anywhere must be anomalous=false: ' + JSON.stringify(c));
  });

  await test('collectApyPercentCandidates: .tvl-trend-note is excluded (criterion 4 class)', async () => {
    const candidates = await collect(`<div class="tvl-trend-note">Deposits grew about 1,900%</div>`);
    const c = candidates.find((x) => x.raw === '1,900%');
    assert(c && c.excluded === true, 'a percent inside .tvl-trend-note must be excluded=true: ' + JSON.stringify(c));
  });

  await test('collectApyPercentCandidates: .gp-item-fill (progress bar) is excluded', async () => {
    const candidates = await collect(`<div class="gp-item-fill"><div class="gp-item-fill-label">5000% grown</div></div>`);
    const c = candidates.find((x) => x.raw === '5000%');
    assert(c && c.excluded === true, 'a percent inside .gp-item-fill must be excluded=true: ' + JSON.stringify(c));
  });

  await test('collectApyPercentCandidates: an ordinary container is NOT excluded', async () => {
    const candidates = await collect(`<div class="some-other-note">2000%</div>`);
    const c = candidates.find((x) => x.raw === '2000%');
    assert(c && c.excluded === false, 'a percent outside the two known exclusion containers must be excluded=false: ' + JSON.stringify(c));
  });

  await test('collectApyPercentCandidates: script/style text is never collected', async () => {
    const candidates = await collect(`
      <script>var neverCollected = "9999% in js";</script>
      <style>.x { width: 9999%; }</style>
      <div>Visible: 50%</div>
    `);
    assert(candidates.every((c) => !/9999/.test(c.raw)), 'script/style-owned text must never appear in candidates: ' + JSON.stringify(candidates));
    assert(candidates.some((c) => c.raw === '50%'), 'the one real visible percent must still be collected: ' + JSON.stringify(candidates));
  });
}

// ---------------------------------------------------------------------------
// Layer 3 — real rendered acceptance criteria via runAudit().
// ---------------------------------------------------------------------------
async function testRenderedCriteria() {
  // Criterion 1 — true negative on today's committed data, pinned to the
  // exact baseline measured this session (specs/173-notes.md records the
  // origin/main worktree comparison run separately; both are 6 total / 5
  // blocking, apy-rail-breach: 0).
  await test('criterion 1: full clean run — zero apy-rail-breach findings, blocking count unchanged (6/5 baseline)', async () => {
    const out = tmpOut('clean-full');
    const result = await runAudit({ port: 8843, outPath: out });
    const apyRail = result.findings.filter((f) => f.check === 'apy-rail-breach');
    const blocking = result.findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
    assert(apyRail.length === 0, 'expected ZERO apy-rail-breach findings on clean data, got: ' + JSON.stringify(apyRail));
    assert(result.findings.length === 6 && blocking.length === 5,
      `expected the documented 6 total / 5 blocking baseline (spec 173), got ${result.findings.length}/${blocking.length}: ` + JSON.stringify(result.findings));
    fs.unlinkSync(out);
  });

  // Criterion 2 — non-vacuous positive control: kpis.apyMomentum = 5000,
  // apyMean30d nulled (so mean30dSane is false and the momentum note isn't
  // yielded to the volatility note), apyBase/apyReward left low (totalApy
  // stays far under the rail, so isAnomalous/.calc-warning never fires).
  await test('criterion 2: injected apyMomentum=5000 renders unflagged on pool-detail -> real P0 apy-rail-breach', async () => {
    const mutated = mutatedSnapshotPath('momentum', (p) => {
      p.apyMean30d = null;
      p.kpis = p.kpis || {};
      p.kpis.apyMomentum = 5000;
      p.kpis.historyPoints = Math.max(7, Number(p.kpis.historyPoints) || 16);
    });
    const out = tmpOut('momentum');
    try {
      const result = await runAudit({ port: 8844, snapshotPath: mutated, outPath: out, only: ['pool-detail'] });
      const hits = result.findings.filter((f) => f.surface === 'pool-detail' && f.check === 'apy-rail-breach' && f.severity === 'P0');
      assert(hits.length > 0, 'expected a P0 apy-rail-breach finding for pool-detail; got: ' + JSON.stringify(result.findings));
      const hit = hits.find((f) => /5,000%|5000%/.test(f.detail));
      assert(hit, 'no apy-rail-breach finding quoted the injected 5,000% momentum figure verbatim: ' + JSON.stringify(hits));
    } finally { fs.unlinkSync(mutated); fs.existsSync(out) && fs.unlinkSync(out); }
  });

  // Criterion 3 — anomaly-aware negative control: apyBase=5000/apyReward=1
  // (mirrors test_audit_app.js:92-98's gate reasoning) makes totalApy > rail
  // -> isAnomalous -> .calc-warning renders -> page-level suppression.
  await test('criterion 3: injected apyBase=5000 (anomaly-flagged) is suppressed — new check specifically', async () => {
    const mutated = mutatedSnapshotPath('anomaly', (p) => { p.apyBase = 5000; p.apyReward = 1; });
    const out = tmpOut('anomaly');
    try {
      const result = await runAudit({ port: 8845, snapshotPath: mutated, outPath: out, only: ['pool-detail'] });
      const hits = result.findings.filter((f) => f.surface === 'pool-detail' && f.check === 'apy-rail-breach');
      assert(hits.length === 0, 'expected ZERO apy-rail-breach findings once .calc-warning renders (anomaly-flagged); got: ' + JSON.stringify(hits));
    } finally { fs.unlinkSync(mutated); fs.existsSync(out) && fs.unlinkSync(out); }
  });

  // Criterion 4 — TVL-trend control via runAudit() (zero findings)...
  await test('criterion 4: tvlTrend=19 renders "1,900%" -> ZERO apy-rail-breach findings (runAudit)', async () => {
    const mutated = mutatedSnapshotPath('tvltrend', (p) => {
      p.apyMean30d = null;
      p.kpis = p.kpis || {};
      p.kpis.tvlTrend = 19;
      p.kpis.historyPoints = Math.max(7, Number(p.kpis.historyPoints) || 16);
    });
    const out = tmpOut('tvltrend');
    try {
      const result = await runAudit({ port: 8846, snapshotPath: mutated, outPath: out, only: ['pool-detail'] });
      const hits = result.findings.filter((f) => f.surface === 'pool-detail' && f.check === 'apy-rail-breach');
      assert(hits.length === 0, 'TVL-trend note must never produce an apy-rail-breach finding; got: ' + JSON.stringify(hits));
    } finally { fs.unlinkSync(mutated); fs.existsSync(out) && fs.unlinkSync(out); }
  });

  // ...and directly, non-vacuously: assert the "1,900%" text actually reached
  // the screen AND was collected+excluded by the extraction layer (spec 173
  // criterion 4: "a rendered assertion is strongly preferred over a
  // helper-only one" — this is the load-bearing one, not runAudit's silence).
  await test('criterion 4 (non-vacuous): "1,900%" is rendered on a REAL pool-detail page and collected as excluded', async () => {
    const mutated = mutatedSnapshotPath('tvltrend-direct', (p) => {
      p.apyMean30d = null;
      p.kpis = p.kpis || {};
      p.kpis.tvlTrend = 19;
      p.kpis.historyPoints = Math.max(7, Number(p.kpis.historyPoints) || 16);
    });
    const snapshotBody = fs.readFileSync(mutated, 'utf8');
    const snap = JSON.parse(snapshotBody);
    const liveBody = JSON.stringify({ status: 'success', data: snap.pools.map((p) => Object.assign({}, p, { apy: (p.apyBase || 0) + (p.apyReward || 0) })) });
    const port = 8847;
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    await new Promise((resolve) => server.listen(port, resolve));
    const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
    try {
      const page = await browser.newPage();
      await page.route('**/data/pools-snapshot-meta.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString() }) }));
      await page.route('**/data/pools-snapshot.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: snapshotBody }));
      await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: liveBody }));
      await page.route('https://icons.llamao.fi/**', (r) => r.abort());
      const NM = path.join(ROOT, 'node_modules');
      await page.route('https://unpkg.com/react@18/umd/react.production.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, 'react/umd/react.production.min.js')) }));
      await page.route('https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, 'react-dom/umd/react-dom.production.min.js')) }));
      await page.route('https://unpkg.com/@babel/standalone/babel.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NM, '@babel/standalone/babel.min.js')) }));
      await page.goto(`http://localhost:${port}/home.html?pool=${encodeURIComponent(ANCHOR_POOL_ID)}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => document.body.innerText || '');
      assert(text.includes('1,900%'), 'the TVL-trend note must have actually rendered "1,900%" on screen (non-vacuous control): got no match in rendered text');
      const candidates = await page.evaluate(collectApyPercentCandidates);
      const hit = candidates.find((c) => c.raw === '1,900%');
      assert(hit, 'the extraction layer must have collected the rendered "1,900%" figure: ' + JSON.stringify(candidates));
      assert(hit.excluded === true, 'the collected "1,900%" figure must be excluded=true (.tvl-trend-note): ' + JSON.stringify(hit));
      await page.close();
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
      fs.unlinkSync(mutated);
    }
  });

  // Criterion 5 — KO parity: clean KO render + anomaly suppression in KO.
  await test('criterion 5: clean KO pool-detail render — zero apy-rail-breach findings', async () => {
    const out = tmpOut('ko-clean');
    const result = await runAudit({ port: 8848, outPath: out, only: ['pool-detail-ko'] });
    const hits = result.findings.filter((f) => f.check === 'apy-rail-breach');
    assert(hits.length === 0, 'expected zero apy-rail-breach findings on the clean KO render; got: ' + JSON.stringify(hits));
    fs.unlinkSync(out);
  });

  await test('criterion 5: criterion-3 suppression still holds on a real KO render', async () => {
    const mutated = mutatedSnapshotPath('anomaly-ko', (p) => { p.apyBase = 5000; p.apyReward = 1; });
    const out = tmpOut('anomaly-ko');
    try {
      const result = await runAudit({ port: 8849, snapshotPath: mutated, outPath: out, only: ['pool-detail-ko'] });
      const hits = result.findings.filter((f) => f.check === 'apy-rail-breach');
      assert(hits.length === 0, 'expected zero apy-rail-breach findings on KO once anomaly-flagged; got: ' + JSON.stringify(hits));
    } finally { fs.unlinkSync(mutated); fs.existsSync(out) && fs.unlinkSync(out); }
  });
}

async function main() {
  await testPureHelper();

  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    await testDomExtractionFixtures(browser);
  } finally {
    await browser.close();
  }

  await testRenderedCriteria();

  console.log(`\ntest_audit_apy_percent_sanity.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
