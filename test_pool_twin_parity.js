/* Acceptance test for backlog 213 — mechanical NUMBER PARITY between a pool's
   Markdown twin (pools/<pool-id>.md, generate-pool-pages.js) and the REAL
   rendered pool-detail UI (`?pool=<id>`, PoolDetail.js) for the same pool at
   the same data timestamp. Guards specifically against generate-pool-pages.js's
   MIRRORED getRiskAssessment/getPoolTypeShared drifting from PoolDetail.js's
   own copy — the two can never be import-linked (PoolDetail.js has no
   module.exports; see generate-pool-pages.js's own header comment), so this
   is the only thing that can catch that drift.

   BROWSER LANE — drives the real Chromium/React render. Fixture mechanics
   copied verbatim from test_kpi_rail_history.js: the always-live pool-detail
   data path (app.js:1141 — `?pool=` is NEVER snapshot-eligible), the separate
   kpis-merge effect (app.js:1224) that fetches the real committed
   data/pools-snapshot.json once, the vendored-React/Babel routing, the
   ignorable-console-error filter, and the CHROMIUM_EXECUTABLE override this
   sandbox requires (a bare chromium.launch() fails here — version mismatch).

   Numbers are extracted from RENDERED TEXT (not React internals): the
   `.apy-value-hero` / `.tvl-badge` / risk `.trust-badge[title]` nodes,
   parsing the same formatted strings formatCurrency()/formatApy() (app.js)
   produce — mirroring the twin's own formatUsd()/formatApy()
   (generate-token-pages.js). The two formatters round to different DECIMAL
   PRECISIONS (twin: fixed 2dp; rendered: up to 2dp, no padding) so a tight
   but non-zero tolerance is used, sized from the coarser (rendered) side's
   own rounding granularity — never a loose blanket percentage that could
   hide a real drift.

   A pool that cannot be driven (render timeout, page error, missing DOM
   node) FAILS LOUDLY, naming the pool id — it is never silently skipped
   while the run still reports a pass.

   Run: node test_pool_twin_parity.js */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const genPool = require('./generate-pool-pages.js');
const { createTranslationFunction } = require('./translations.js');
const t = createTranslationFunction('en');

const PORT = 8862; // distinct from other test_* files' ports
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');
const SNAPSHOT_RAW = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
const SNAPSHOT = JSON.parse(SNAPSHOT_RAW);
const GEN_DATE = 'August 3, 2026'; // fixed — twin/rendered parity doesn't depend on the freshness string

// --- Sample: 12 real, distinct pools spread evenly across the committed
//     snapshot (never clustered on one chain/project) — comfortably above
//     the >=10 floor the acceptance criterion asks for. ---------------------
const SAMPLE_SIZE = 12;
const n = SNAPSHOT.pools.length;
const SAMPLE_POOLS = Array.from({ length: SAMPLE_SIZE }, (_, i) => SNAPSHOT.pools[Math.floor(i * n / SAMPLE_SIZE)]);

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

async function routeCommon(page) {
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
  await page.route('https://icons.llamao.fi/**', (route) => route.abort());
}

// --- Reverse-formatting helpers: parse app.js's formatCurrency()/formatApy()
//     output AND generate-token-pages.js's formatUsd()/formatApy() output
//     back into raw numbers, so parity is asserted on the underlying VALUE,
//     not on byte-identical strings from two formatters with different
//     decimal-precision conventions (2dp fixed vs up-to-2dp unpadded). -------
function parseFormattedUsd(str) {
  const m = String(str).replace(/,/g, '').match(/\$(-?[\d.]+)\s*([BMK]?)/);
  if (!m) return null;
  const mult = m[2] === 'B' ? 1e9 : m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1;
  return parseFloat(m[1]) * mult;
}
function parseFormattedApy(str) {
  const m = String(str).match(/(-?[\d.]+)\s*%/);
  return m ? parseFloat(m[1]) : null;
}
// Tolerance sized from the RENDERED string's own suffix — half its 1-decimal-
// place rounding granularity, plus headroom. app.js's formatCurrency() always
// rounds to 1dp (toFixed(1)); the twin's formatUsd() rounds to <=2dp — so the
// two can legitimately disagree by up to ~0.05 of the rendered suffix's unit,
// never more.
function usdParityTolerance(renderedStr) {
  const m = String(renderedStr).match(/\$(-?[\d.]+)\s*([BMK]?)/);
  const mult = m && m[2] === 'B' ? 1e9 : m && m[2] === 'M' ? 1e6 : m && m[2] === 'K' ? 1e3 : 1;
  return 0.06 * mult;
}

function extractTwinApy(md) {
  const m = md.match(/\*\*[^*]*:\*\* ([\d,]+\.\d{2})% \(/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}
function extractTwinTvl(md) {
  const m = md.match(/\*\*[^*]*:\*\* (\$[\d,.]+[BMK]?)\n/);
  return m ? parseFormattedUsd(m[1]) : null;
}
function extractTwinRiskLevel(md) {
  const m = md.match(/^## .*?: (.+)$/m);
  return m ? m[1].trim() : null;
}

async function main() {
  console.log(`network: unpkg.com BLOCKED (vendored React/Babel), yields.llama.fi BLOCKED (routed per-pool to real committed data)`);
  console.log(`sample: ${SAMPLE_POOLS.length} real pools spread across ${n} committed snapshot pools`);

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    for (const pool of SAMPLE_POOLS) {
      const id = pool.pool;
      const md = genPool.renderPoolPageMarkdown(pool, GEN_DATE, {});
      const twinApy = extractTwinApy(md);
      const twinTvl = extractTwinTvl(md);
      const twinRisk = extractTwinRiskLevel(md);

      await test(`twin sanity: ${id} (${pool.symbol}) parses an APY, TVL and risk level out of its own twin`, () => {
        if (twinApy === null) throw new Error(`${id}: could not parse Total APY out of the twin`);
        if (twinTvl === null) throw new Error(`${id}: could not parse TVL out of the twin`);
        if (twinRisk === null) throw new Error(`${id}: could not parse a Risk Assessment heading out of the twin`);
      });

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
      await routeCommon(page);

      // Pool-detail is NEVER snapshot-eligible (app.js:1141) — force the
      // always-live path, then let the real kpis-merge effect (app.js:1224)
      // read the real committed snapshot, exactly like test_kpi_rail_history.js.
      const liveTargetPool = Object.assign({}, pool);
      delete liveTargetPool.kpis; // the live endpoint never carries kpis — matches production
      await page.route('**/data/pools-snapshot-meta.json', (route) =>
        route.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
      await page.route('**/data/pools-snapshot.json', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: SNAPSHOT_RAW }));
      await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: [liveTargetPool] })
      }));

      let renderedApyStr = null, renderedTvlStr = null, renderedRiskStr = null;
      await test(`render+parity: ${id} (${pool.symbol}) — rendered APY/TVL/risk equal the twin's`, async () => {
        try {
          await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(id)}`, { waitUntil: 'load', timeout: 20000 });
          await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
          await page.waitForSelector('.pool-info-content', { timeout: 15000 });
          await page.waitForSelector('.apy-value-hero', { timeout: 15000 });
          await page.waitForSelector('.tvl-badge', { timeout: 15000 });

          // AnimatedNumber briefly animates from 0 up to the target value
          // (app.js:750-797, duration 1200-1500ms) even though its FIRST
          // paint already shows the final value — poll until two reads
          // 300ms apart agree, so we never read a value mid-animation.
          const readNumbers = () => page.evaluate(() => {
            const apyEl = document.querySelector('.apy-value-hero');
            const tvlEl = document.querySelector('.tvl-badge');
            const riskEl = Array.from(document.querySelectorAll('.trust-badge'))
              .find(el => el.hasAttribute('title'));
            return {
              apy: apyEl ? apyEl.textContent.trim() : null,
              tvl: tvlEl ? tvlEl.textContent.trim() : null,
              risk: riskEl ? riskEl.textContent.trim() : null,
            };
          });
          const deadline = Date.now() + 4000;
          let prev = await readNumbers();
          let stable = null;
          while (Date.now() < deadline) {
            await page.waitForTimeout(300);
            const cur = await readNumbers();
            if (cur.apy === prev.apy && cur.tvl === prev.tvl && cur.risk === prev.risk &&
              cur.apy && cur.tvl && cur.risk) {
              stable = cur;
              break;
            }
            prev = cur;
          }
          if (!stable) throw new Error(`${id}: rendered APY/TVL/risk never stabilized (last read: ${JSON.stringify(prev)})`);

          renderedApyStr = stable.apy;
          renderedTvlStr = stable.tvl;
          renderedRiskStr = stable.risk;

          const renderedApy = parseFormattedApy(renderedApyStr);
          const renderedTvl = parseFormattedUsd(renderedTvlStr);
          const riskMatch = renderedRiskStr.match(/:\s*(.+)$/);
          const renderedRisk = riskMatch ? riskMatch[1].trim() : null;

          if (renderedApy === null) throw new Error(`${id}: could not parse rendered APY from "${renderedApyStr}"`);
          if (renderedTvl === null) throw new Error(`${id}: could not parse rendered TVL from "${renderedTvlStr}"`);
          if (renderedRisk === null) throw new Error(`${id}: could not parse rendered risk level from "${renderedRiskStr}"`);

          const apyDiff = Math.abs(renderedApy - twinApy);
          if (apyDiff > 0.02) {
            throw new Error(`${id}: APY parity failed — twin ${twinApy}% vs rendered ${renderedApy}% (diff ${apyDiff})`);
          }
          const tvlTolerance = usdParityTolerance(renderedTvlStr);
          const tvlDiff = Math.abs(renderedTvl - twinTvl);
          if (tvlDiff > tvlTolerance) {
            throw new Error(`${id}: TVL parity failed — twin $${twinTvl} vs rendered $${renderedTvl} (diff ${tvlDiff}, tolerance ${tvlTolerance})`);
          }
          if (renderedRisk !== twinRisk) {
            throw new Error(`${id}: risk-level parity failed — twin "${twinRisk}" vs rendered "${renderedRisk}"`);
          }
        } catch (err) {
          // Fail loudly, naming the pool id — never silently skip.
          throw new Error(`pool ${id} (${pool.symbol}) could not be driven/verified: ${err.message}`);
        }
      });

      await test(`zero page errors while driving ${id}`, () => {
        if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
      });

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/${total} pool-twin-parity assertions passed`);
  if (passed !== total) process.exitCode = 1;
}

main().catch((err) => {
  console.error('test_pool_twin_parity crashed: ' + err.message);
  process.exitCode = 1;
});
