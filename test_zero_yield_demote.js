/* Playwright behavior gate for spec 092: 0%/near-0%-yield pools (collateral
   assets with huge TVL, no supply yield) must be DEMOTED below yielding pools
   in the TVL sort, and TAGGED "No supply yield" on the card — while KEEPING the
   honest 0.00% number (trust rail: never hide/fabricate a number). Drives the
   REAL rendered UI (http-server + chromium) and asserts on the rendered DOM —
   never on source strings — per the 2026-07-11 standing decision that UX items
   ship a rendered Playwright test.

   Fixture-routed, sandbox-safe: this run's sandbox blocks browser HTTPS to
   unpkg.com (React/Babel) and yields.llama.fi (pools), so those are routed to
   local vendored copies / a DefiLlama-shaped fixture. The committed static
   snapshot (/data/pools-snapshot*) is stale-stubbed (generatedAt 2020) so the
   FE's 15-min freshness gate falls back to the live fixture rather than the
   committed snapshot — mirrors test_list_default.js exactly.

   Extended for spec 239: the same 092 demotion was missing from the
   Risk-Adjusted ("sharpe") sort of the DEFAULT view (`/?chain=Popular`) — with
   no apySharpe history every pool falls through to the TVL tie-break, so
   huge-TVL 0%-yield collateral pools topped the flagship list. Phases below
   add a second (Population A) and third (Population B) fixture population,
   switched in via `activeFixture` between navigations, to cover: the
   Risk-Adjusted/TVL/APY toggles on the default view, the trust-rail
   (anomalous-pool) interaction, and a scope pin proving `/?token=` ordering
   is unchanged by this item.

   Run: node test_zero_yield_demote.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { translations } = require('./translations.js');

const PORT = 8797;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// DefiLlama-shaped fixture: sized above DEFAULT_MIN_TVL ($10M) so trust-rail
// filtering never hides them. Several yielding Base pools plus ONE high-TVL
// 0%-yield collateral pool (CBBTC) whose TVL dwarfs every yielding pool — the
// exact population the audit flags. `apyReward` defaults to 0 in makePool.
function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}
const COLLATERAL_ID = 'cbbtc-base-collateral';
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-base-morpho', 'morpho-blue', 'USDC', 'Base', 55_000_000, 5.9, 'Lending'),
  makePool('weth-base-aave', 'aave-v3', 'WETH', 'Base', 80_000_000, 8.0),
  makePool('dai-base-curve', 'curve-dex', 'DAI', 'Base', 40_000_000, 4.8),
  makePool(COLLATERAL_ID, 'aave-v3', 'CBBTC', 'Base', 500_000_000, 0)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// --- 239: Population A — DEFAULT VIEW (`/?chain=Popular`), exactly 9 pools.
// 6 yielding pools (apyBase 2-9%) with SMALL TVL ($20M-$90M), and 3 zero-yield
// pools (apyBase 0) with the LARGEST TVL ($2.4B/$2.3B/$2.2B) — mirroring the
// WSTETH/CBBTC/WEETH population from the UX audit, so that absent the fix
// these three top every TVL-tie-broken ranking (incl. Risk-Adjusted, which
// has no apySharpe history in this fixture and falls through to the TVL
// tie-break). Every symbol shares a "USDC" token segment so the same fixture
// also drives the `/?token=USDC` scope-pin assertion (Population C is just
// Population A viewed through the token-first branch). All chains are in the
// popular set; all TVL above the $10M floor; no APY above APY_SANITY_LIMIT.
const POP_A = [
  makePool('usdc-a1-eth', 'aave-v3', 'USDC-A1', 'Ethereum', 20_000_000, 2.1),
  makePool('usdc-a2-base', 'compound-v3', 'USDC-A2', 'Base', 35_000_000, 3.4, 'Lending'),
  makePool('usdc-a3-arb', 'morpho-blue', 'USDC-A3', 'Arbitrum', 50_000_000, 5.0),
  makePool('usdc-a4-op', 'spark', 'USDC-A4', 'Optimism', 65_000_000, 6.7),
  makePool('usdc-a5-poly', 'euler', 'USDC-A5', 'Polygon', 80_000_000, 7.8),
  makePool('usdc-a6-eth', 'fluid', 'USDC-A6', 'Ethereum', 90_000_000, 8.9),
  makePool('wstusdc-a7-eth', 'sparklend', 'WSTUSDC-A7', 'Ethereum', 2_400_000_000, 0),
  makePool('cbusdc-a8-base', 'morpho-blue', 'CBUSDC-A8', 'Base', 2_300_000_000, 0),
  makePool('weusdc-a9-arb', 'aave-v3', 'WEUSDC-A9', 'Arbitrum', 2_200_000_000, 0)
];
const POP_A_RESPONSE = JSON.stringify({ status: 'success', data: POP_A });

// --- 239: Population B — TRUST-RAIL INTERACTION. 4 yielding sane pools, 2
// zero-yield high-TVL pools, and 1 ANOMALOUS pool (apyBase 5000, far above
// APY_SANITY_LIMIT=1000) with large TVL — proves the pre-existing anomaly
// rail still outranks the new no-supply-yield partition (anomalous pools
// stay demoted last of all, even below zero-yield pools).
const POP_B = [
  makePool('usdc-b1-eth', 'aave-v3', 'USDC-B1', 'Ethereum', 25_000_000, 3.0),
  makePool('usdc-b2-base', 'compound-v3', 'USDC-B2', 'Base', 40_000_000, 4.5),
  makePool('usdc-b3-arb', 'morpho-blue', 'USDC-B3', 'Arbitrum', 55_000_000, 6.0),
  makePool('usdc-b4-op', 'spark', 'USDC-B4', 'Optimism', 70_000_000, 7.5),
  makePool('wstusdc-b5-eth', 'sparklend', 'WSTUSDC-B5', 'Ethereum', 2_100_000_000, 0),
  makePool('cbusdc-b6-base', 'morpho-blue', 'CBUSDC-B6', 'Base', 2_000_000_000, 0),
  makePool('anomusdc-b7-poly', 'shady-farm', 'ANOMUSDC-B7', 'Polygon', 1_500_000_000, 5000)
];
const POP_B_RESPONSE = JSON.stringify({ status: 'success', data: POP_B });

// Which fixture body the pools route serves next; read at request time (see
// routeFixtures below) so it can be switched between navigations on the same
// page instance without re-registering the route.
let activeFixture = 'ORIGINAL';
const FIXTURE_RESPONSES = { ORIGINAL: FIXTURE_RESPONSE, A: POP_A_RESPONSE, B: POP_B_RESPONSE };

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

async function routeFixtures(page) {
  const nodeModules = path.join(ROOT, 'node_modules');
  const vendored = {
    'https://unpkg.com/react@18/umd/react.production.min.js':
      path.join(nodeModules, 'react/umd/react.production.min.js'),
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
      path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
    'https://unpkg.com/@babel/standalone/babel.min.js':
      path.join(nodeModules, '@babel/standalone/babel.min.js')
  };
  for (const [url, localPath] of Object.entries(vendored)) {
    await page.route(url, (route) => route.fulfill({
      status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
    }));
  }
  // Stale-stub the committed snapshot so the 15-min freshness gate falls back
  // to the live fixture (spec 059 pattern, copied from test_list_default.js).
  await page.route('https://icons.llamao.fi/**', (route) => route.abort()); // decorative icon host (spec 094) is proxy-blocked in-sandbox; abort so requests never delay the load event
  await page.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
  // Body computed at REQUEST time (not registration time) so `activeFixture`
  // can be flipped between navigations on the same page instance (239).
  await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSES[activeFixture]
  }));
}

// Ordered list of .pool-symbol texts, in DOM order.
function symbolOrder(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim())
  );
}

// 239: partition helpers — everything derived from the fixture at test time,
// never a hardcoded symbol list, per the acceptance criterion. The threshold
// literals below re-type app.js's NO_SUPPLY_YIELD_EPSILON / APY_SANITY_LIMIT
// (RAZOR mirror rule: two copies where only one is read at runtime). See
// assertAppConstant() and its two test() calls in main() for the TESTED
// equality against the app.js source that closes this mirror.
const totalApy = (p) => (p.apyBase || 0) + (p.apyReward || 0);
const ZERO_YIELD_EPSILON = 0.01; // mirrors app.js NO_SUPPLY_YIELD_EPSILON
const ANOMALY_LIMIT = 1000; // mirrors app.js APY_SANITY_LIMIT
const isZeroYield = (p) => totalApy(p) < ZERO_YIELD_EPSILON;
const isAnomalous = (p) => totalApy(p) > ANOMALY_LIMIT;

function symbolsWhere(pop, pred) {
  return pop.filter(pred).map(p => p.symbol);
}

// RAZOR mirror check (239 follow-up): read app.js from disk at test time and
// parse the REAL constant out of the source, then assert it === the
// test-side literal above. If the anchored regex fails to match, throw
// loudly rather than silently passing — a silently-unmatched regex would
// launder the mirror as "covered" while actually verifying nothing, which is
// the exact failure mode the razor names.
function assertAppConstant(constName, pattern, testValue) {
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const match = appSrc.match(pattern);
  if (!match) {
    throw new Error(`RAZOR mirror check: ${pattern} did not match app.js source for ${constName} — regex drifted, mirror is UNVERIFIED (treat as failure, not as covered)`);
  }
  const appValue = parseFloat(match[1]);
  if (appValue !== testValue) {
    throw new Error(`RAZOR mirror check: app.js ${constName} = ${appValue}, but test-side literal = ${testValue} — the mirror has drifted`);
  }
}

// Assert every symbol in `beforeSymbols` renders at a lower DOM index than
// every symbol in `afterSymbols`. Throws with the full rendered order on
// failure so red-path messages are legible.
function assertBefore(order, beforeSymbols, afterSymbols, label) {
  const beforeIdxs = beforeSymbols.map(s => order.indexOf(s));
  const afterIdxs = afterSymbols.map(s => order.indexOf(s));
  const missing = [...beforeSymbols, ...afterSymbols].filter(s => order.indexOf(s) === -1);
  if (missing.length) throw new Error(`${label}: symbols missing from rendered order: ${JSON.stringify(missing)}; order=${JSON.stringify(order)}`);
  const maxBefore = Math.max(...beforeIdxs);
  const minAfter = Math.min(...afterIdxs);
  if (!(maxBefore < minAfter)) {
    throw new Error(`${label}: expected all of ${JSON.stringify(beforeSymbols)} before all of ${JSON.stringify(afterSymbols)}; order=${JSON.stringify(order)}`);
  }
}

function assertSameSymbolSet(order, pop, label) {
  if (order.length !== pop.length) {
    throw new Error(`${label}: expected ${pop.length} rendered cards, got ${order.length}; order=${JSON.stringify(order)}`);
  }
  const expected = new Set(pop.map(p => p.symbol));
  const actual = new Set(order);
  const missing = [...expected].filter(s => !actual.has(s));
  const extra = [...actual].filter(s => !expected.has(s));
  if (missing.length || extra.length) {
    throw new Error(`${label}: symbol set mismatch; missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  }
}

// Wait (bounded) until beforeSymbols all precede afterSymbols in rendered
// order — avoids a fixed sleep between a sort-toggle click and the assertion,
// exactly like the pre-existing CBBTC phase below.
async function waitForPartition(page, beforeSymbols, afterSymbols) {
  await page.waitForFunction(({ beforeSymbols, afterSymbols }) => {
    const syms = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim());
    const beforeIdxs = beforeSymbols.map(s => syms.indexOf(s));
    const afterIdxs = afterSymbols.map(s => syms.indexOf(s));
    if (beforeIdxs.some(i => i === -1) || afterIdxs.some(i => i === -1)) return false;
    return Math.max(...beforeIdxs) < Math.min(...afterIdxs);
  }, { beforeSymbols, afterSymbols }, { timeout: 5000 }).catch(() => {});
}

async function main() {
  // RAZOR mirror checks FIRST, before any server/browser phase, so constant
  // drift between app.js and this test file's threshold literals fails fast
  // (239 follow-up).
  await test('RAZOR mirror: test-side ZERO_YIELD_EPSILON (0.01) === app.js NO_SUPPLY_YIELD_EPSILON', async () => {
    assertAppConstant('NO_SUPPLY_YIELD_EPSILON', /NO_SUPPLY_YIELD_EPSILON\s*=\s*([\d.]+)/, ZERO_YIELD_EPSILON);
  });
  await test('RAZOR mirror: test-side ANOMALY_LIMIT (1000) === app.js APY_SANITY_LIMIT', async () => {
    assertAppConstant('APY_SANITY_LIMIT', /APY_SANITY_LIMIT\s*=\s*([\d.]+)/, ANOMALY_LIMIT);
  });

  console.log('network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (fixture snapshot)');
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
    await routeFixtures(page);

    await page.goto(`http://localhost:${PORT}/?chain=Base`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });

    // Click the TVL sort toggle (default is APY). The sort buttons are
    // .view-toggle-btn.sort-toggle-btn labeled 'APY' / 'TVL' (app.js ~line 2892).
    await page.locator('.sort-toggle-btn', { hasText: 'TVL' }).click();
    // Wait until the collateral pool has sunk to the last card position.
    await page.waitForFunction(() => {
      const syms = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim());
      return syms.length > 1 && syms[syms.length - 1] === 'CBBTC';
    }, { timeout: 5000 }).catch(() => {});

    await test('TVL sort demotes the 0%-yield collateral pool below every yielding pool', async () => {
      const order = await symbolOrder(page);
      const collateralIdx = order.indexOf('CBBTC');
      if (collateralIdx === -1) throw new Error(`CBBTC card not found; order=${JSON.stringify(order)}`);
      // Every OTHER card is a yielding pool — each must appear before CBBTC.
      const yieldingIdxs = order
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s !== 'CBBTC')
        .map(({ i }) => i);
      if (yieldingIdxs.length < 1) throw new Error(`expected >=1 yielding card, order=${JSON.stringify(order)}`);
      const maxYielding = Math.max(...yieldingIdxs);
      if (!(collateralIdx > maxYielding)) {
        throw new Error(`expected CBBTC (idx ${collateralIdx}) after all yielding cards (max idx ${maxYielding}); order=${JSON.stringify(order)}`);
      }
    });

    await test('collateral card shows the "No supply yield" tag (.pool-apy-tag)', async () => {
      const tagText = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.pool-card'));
        const card = cards.find(c => c.querySelector('.pool-symbol')?.textContent.trim() === 'CBBTC');
        const tag = card && card.querySelector('.pool-apy-tag');
        return tag ? tag.textContent.trim() : null;
      });
      if (tagText !== 'No supply yield') {
        throw new Error(`expected .pool-apy-tag text "No supply yield", got ${JSON.stringify(tagText)}`);
      }
    });

    await test('collateral card still renders the honest 0.00% APY hero (trust rail)', async () => {
      const heroText = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.pool-card'));
        const card = cards.find(c => c.querySelector('.pool-symbol')?.textContent.trim() === 'CBBTC');
        const hero = card && card.querySelector('.pool-apy-hero');
        return hero ? hero.textContent.trim() : null;
      });
      if (heroText === null) throw new Error('CBBTC .pool-apy-hero not found');
      // Number preserved: reads as "0" / "0.00%" once formatApy rounds.
      if (!/0/.test(heroText) || !heroText.includes('%')) {
        throw new Error(`expected honest zero APY in hero (contains "0" and "%"), got ${JSON.stringify(heroText)}`);
      }
    });

    await test('a yielding pool card does NOT show the .pool-apy-tag', async () => {
      const hasTag = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.pool-card'));
        const card = cards.find(c => c.querySelector('.pool-symbol')?.textContent.trim() !== 'CBBTC');
        return !!(card && card.querySelector('.pool-apy-tag'));
      });
      if (hasTag) throw new Error('a yielding pool card unexpectedly rendered .pool-apy-tag');
    });

    // --- 239: Population A, DEFAULT VIEW (`/?chain=Popular`) — every sort
    // toggle must demote no-supply-yield rows below yielding rows. This is
    // the RISK-ADJUSTED gap the audit flagged (F4); TVL already carried the
    // 092 partition and is re-asserted here so all three toggles are covered
    // in one place.
    const popAYieldingSymbols = symbolsWhere(POP_A, p => !isZeroYield(p));
    const popAZeroSymbols = symbolsWhere(POP_A, isZeroYield);
    if (popAYieldingSymbols.length !== 6 || popAZeroSymbols.length !== 3) {
      throw new Error(`Population A fixture shape drifted: expected 6 yielding / 3 zero-yield, got ${popAYieldingSymbols.length} / ${popAZeroSymbols.length}`);
    }

    activeFixture = 'A';
    await page.goto(`http://localhost:${PORT}/?chain=Popular`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });

    const SORT_TOGGLES = [
      { name: 'Risk-Adjusted', label: translations.en.sortByRiskAdjusted },
      { name: 'TVL', label: 'TVL' },
      { name: 'APY', label: 'APY' }
    ];
    for (const toggle of SORT_TOGGLES) {
      await page.locator('.sort-toggle-btn', { hasText: toggle.label }).click();
      await waitForPartition(page, popAYieldingSymbols, popAZeroSymbols);

      await test(`/?chain=Popular ${toggle.name} sort: every zero-yield row ranks after every yielding row (239)`, async () => {
        const order = await symbolOrder(page);
        assertBefore(order, popAYieldingSymbols, popAZeroSymbols, `${toggle.name} sort`);
      });

      await test(`/?chain=Popular ${toggle.name} sort: nothing filtered — card count and symbol set match the fixture`, async () => {
        const order = await symbolOrder(page);
        assertSameSymbolSet(order, POP_A, `${toggle.name} sort`);
      });

      await test(`/?chain=Popular ${toggle.name} sort: every zero-yield row shows the honest "${translations.en.noSupplyYield}" tag, count == 3`, async () => {
        const tagCount = await page.evaluate((tagText) =>
          Array.from(document.querySelectorAll('.pool-card .pool-apy-tag'))
            .filter(el => el.textContent.trim() === tagText).length,
          translations.en.noSupplyYield);
        if (tagCount !== 3) throw new Error(`expected 3 "${translations.en.noSupplyYield}" tags, got ${tagCount}`);
      });
    }

    // --- 239: Population B, TRUST-RAIL INTERACTION — under Risk-Adjusted,
    // the pre-existing anomaly rail must still outrank the new no-supply-yield
    // partition: sane-yielding < zero-yield < anomalous, in that order.
    const popBYieldingSymbols = symbolsWhere(POP_B, p => !isAnomalous(p) && !isZeroYield(p));
    const popBZeroSymbols = symbolsWhere(POP_B, p => !isAnomalous(p) && isZeroYield(p));
    const popBAnomSymbols = symbolsWhere(POP_B, isAnomalous);
    if (popBYieldingSymbols.length !== 4 || popBZeroSymbols.length !== 2 || popBAnomSymbols.length !== 1) {
      throw new Error(`Population B fixture shape drifted: expected 4/2/1, got ${popBYieldingSymbols.length}/${popBZeroSymbols.length}/${popBAnomSymbols.length}`);
    }

    activeFixture = 'B';
    await page.goto(`http://localhost:${PORT}/?chain=Popular`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await page.locator('.sort-toggle-btn', { hasText: translations.en.sortByRiskAdjusted }).click();
    await waitForPartition(page, popBYieldingSymbols, popBZeroSymbols.concat(popBAnomSymbols));
    await waitForPartition(page, popBZeroSymbols, popBAnomSymbols);

    await test('Population B Risk-Adjusted sort: sane-yielding < zero-yield < anomalous (trust rail still wins) (239)', async () => {
      const order = await symbolOrder(page);
      assertBefore(order, popBYieldingSymbols, popBZeroSymbols, 'yielding-before-zero');
      assertBefore(order, popBZeroSymbols, popBAnomSymbols, 'zero-before-anomalous');
    });

    // --- 239: Population C (scope pin) — Population A viewed via
    // `/?token=USDC` (the token-first branch, comparator #3, deliberately
    // NOT touched by this item). Under Risk-Adjusted the ranking must be
    // UNCHANGED by 239: with no apySharpe history every pool falls through to
    // the plain TVL tie-break, so the highest-TVL zero-yield pool is still
    // ranked FIRST. This pins the deliberate scope of 239 — the residual
    // (token/chain views under Risk-Adjusted still ranking huge-TVL
    // zero-yield pools first) is a recorded OPEN class, not an oversight; see
    // product-loop-kit/specs/239.md "OUT of scope".
    activeFixture = 'A';
    await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-card', { timeout: 15000 });
    await page.locator('.sort-toggle-btn', { hasText: translations.en.sortByRiskAdjusted }).click();

    const highestTvlZeroSymbol = POP_A
      .filter(isZeroYield)
      .reduce((max, p) => (p.tvlUsd > max.tvlUsd ? p : max)).symbol;
    await page.waitForFunction((sym) => {
      const syms = Array.from(document.querySelectorAll('.pool-card .pool-symbol')).map(el => el.textContent.trim());
      return syms.length > 0 && syms[0] === sym;
    }, highestTvlZeroSymbol, { timeout: 5000 }).catch(() => {});

    await test('/?token=USDC Risk-Adjusted sort: unchanged by 239 — highest-TVL zero-yield pool still ranks FIRST', async () => {
      const order = await symbolOrder(page);
      if (order[0] !== highestTvlZeroSymbol) {
        throw new Error(`scope pin broken: expected ${JSON.stringify(highestTvlZeroSymbol)} first on the token view, got order=${JSON.stringify(order)}`);
      }
    });

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`✓ ${passed}/${total} zero-yield-demote assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_zero_yield_demote crashed: ' + err.message);
  process.exitCode = 1;
});
