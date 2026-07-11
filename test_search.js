/* Playwright behavior gate for NL search (spec 018): drives the REAL rendered
   UI (npm run dev + chromium) — types every advertised/canonical query into
   the real search input and asserts on the rendered grid, never on parser
   return values. Root-cause bug precedent: spec 017 asserted only against an
   extracted parser function with hand-picked fixtures; 14/14 fixtures passed
   while the actual product stayed broken because nothing ever mounted a
   browser or looked at the DOM. This file exists so that mistake can't repeat.

   Live-data-shaped fixture: this run's sandbox blocks outbound access to
   unpkg.com (React/Babel) and yields.llama.fi (pools) — a network-policy
   403, not a code issue (see product-loop-kit/specs/018-notes.md). The test
   probes both hosts first; where reachable it lets the real request through
   (genuinely live), and only falls back to a local vendored copy / a
   DefiLlama-shaped fixture snapshot where the host is unreachable, logging
   which mode ran. In an environment with full network access this test
   exercises fully live data end-to-end, exactly as the spec requires.

   Run: node test_search.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const PORT = 8792;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
// Matched against the failing resource's own URL (msg.location().url), not
// msg.text() — Chromium's "Failed to load resource" text never includes the
// URL itself. Fonts/analytics/protocol-name-cache are non-critical per
// CLAUDE.md ("external font/analytics fetches fail locally; page errors are
// not") and app.js already degrades them gracefully (protocols fetch fails
// silently, analytics is fire-and-forget).
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// --- DefiLlama-shaped fixture pools --------------------------------------
// Realistic project slugs / chain names / symbol conventions, sized well
// above DEFAULT_MIN_TVL ($10M) so trust-rail filtering never hides them.
// Includes below-floor and off-topic noise pools so a query only surfaces
// pools it should.
function makePool(id, project, symbol, chain, tvlUsd, apyBase, poolMeta) {
  const pool = { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
  if (poolMeta) pool.poolMeta = poolMeta;
  return pool;
}

const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-base-moonwell', 'moonwell', 'USDC', 'Base', 20_000_000, 5.1),
  makePool('usdt-plasma-aave', 'aave-v3', 'USDT', 'Plasma', 15_000_000, 6.0, 'Lending'),
  makePool('usdc-plasma-euler', 'euler', 'USDC', 'Plasma', 12_000_000, 5.5, 'Lending'),
  makePool('crv-eth-curve', 'curve-dex', 'CRV-ETH', 'Ethereum', 30_000_000, 8.0),
  makePool('3crv-eth-curve', 'curve-dex', '3CRV', 'Ethereum', 60_000_000, 3.2),
  makePool('usdc-sol-kamino', 'kamino-lend', 'USDC', 'Solana', 80_000_000, 7.5, 'Lending'),
  makePool('sol-sol-kamino', 'kamino-lend', 'SOL', 'Solana', 40_000_000, 6.1, 'Lending'),
  makePool('cvx-eth-convex', 'convex-finance', 'CVX-ETH', 'Ethereum', 25_000_000, 9.4),
  makePool('3crv-eth-convex', 'convex-finance', '3CRV', 'Ethereum', 18_000_000, 4.4),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9, 'Lending'),
  makePool('usdc-base-morpho', 'morpho-blue', 'USDC', 'Base', 33_000_000, 6.3, 'Lending'),
  makePool('usdc-arb-aave', 'aave-v3', 'USDC', 'Arbitrum', 70_000_000, 4.8),
  makePool('eth-eth-aave', 'aave-v3', 'ETH', 'Ethereum', 200_000_000, 2.9),
  makePool('gmx-arb-gmx', 'gmx', 'GMX', 'Arbitrum', 90_000_000, 12.0),
  makePool('arb-eth-camelot', 'camelot-v3', 'ARB-ETH', 'Arbitrum', 22_000_000, 15.0),
  makePool('sol-usdc-raydium', 'raydium', 'SOL-USDC', 'Solana', 35_000_000, 20.0),
  makePool('sol-sol-marinade', 'marinade', 'SOL', 'Solana', 60_000_000, 6.8),
  makePool('eth-usdc-aerodrome', 'aerodrome-slipstream', 'ETH-USDC', 'Base', 50_000_000, 18.0),
  makePool('usdc-base-compound', 'compound-v3', 'USDC', 'Base', 28_000_000, 4.0),
  makePool('usdc-eth-sushi-belowfloor', 'sushiswap', 'USDC', 'Ethereum', 500_000, 9.0), // below $10M floor
  makePool('eth-polygon-lido', 'lido', 'ETH', 'Polygon', 40_000_000, 3.5) // off-topic noise
];

const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// --- Canonical query set (spec 018 §3): every typing-animation example +
// every human-reported failing class. Each card's rendered context line is
// "on {pool.project} • {chain}" (translations.js onProtocolChain) — asserting
// on that text (not just card count) proves the filter was actually applied,
// not merely that *something* rendered. ----------------------------------
const QUERIES = [
  { q: 'USDC on Base', minCards: 1, context: ['base'], symbol: 'usdc' },
  { q: 'Lending on Plasma', minCards: 1, context: ['plasma'] },
  { q: 'CRV LP on Curve', minCards: 1, context: ['curve', 'ethereum'], symbol: 'crv' },
  { q: 'Kamino lending', minCards: 1, context: ['kamino'] },
  { q: 'solana', minCards: 1, context: ['solana'] },
  { q: 'base', minCards: 1, context: ['base'] },
  { q: 'kamino', minCards: 1, context: ['kamino'] },
  { q: 'kamino lenders', minCards: 1, context: ['kamino'] },
  { q: 'curve', minCards: 1, context: ['curve'] },
  { q: 'convex', minCards: 1, context: ['convex'] },
  { q: 'arbitrum', minCards: 1, context: ['arbitrum'] },
  { q: 'morpho lending', minCards: 1, context: ['morpho'] },
  { q: 'aave', minCards: 1, context: ['aave'] },
  { q: 'usdc on base', minCards: 1, context: ['base'], symbol: 'usdc' }
];

// --- Negative regression set --------------------------------------------
// A prior version of the Method 2 protocol-forward-match fix dropped word-
// boundary checking entirely instead of narrowing it, so short static-
// fallback aliases ("comp", "bal", "joe") false-matched inside unrelated
// words: "compare" -> Compound, "global" -> Balancer, "joel" -> Trader Joe.
// These plausible retail-saver queries carry no protocol/chain/token intent
// and must not resolve to a narrow, wrong result set.
const NEGATIVE_QUERIES = [
  'compare rates',
  'global yields',
  'joel wants some yield',
  'comparison of yields',
  'balance my portfolio'
];

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

// Quick outbound reachability probe via curl, which — unlike Node's bare
// https module — honors HTTPS_PROXY the same way Chromium does. A raw
// Node https.get would silently bypass the proxy and report false
// positives (direct egress can succeed even when the policy proxy 403s
// the same host). Sandbox egress policy 403s are immediate, so an 8s cap
// is generous, not a real wait; never retried per /root/.ccr/README.md.
// Spy on Analytics.trackSearchSuccess/trackSearchAbandonment by wrapping
// them in-page before the query is typed. Analytics.track() itself no-ops
// when `mixpanel` isn't loaded (true in this sandbox — mp.defi.garden is
// blocked, same policy as unpkg.com/yields.llama.fi), so this spy is what
// proves the Enter-triggered NL-search path actually calls these — the
// exact code path spec 018's own Measurement section commits to
// (search_success / search_abandonment) and that shipped disconnected from
// it until this fix.
async function installAnalyticsSpy(page) {
  await page.evaluate(() => {
    window.__analyticsEvents = [];
    const origSuccess = Analytics.trackSearchSuccess.bind(Analytics);
    Analytics.trackSearchSuccess = (query, selectedResult, resultsCount, context) => {
      window.__analyticsEvents.push({ type: 'search_success', query, resultsCount });
      return origSuccess(query, selectedResult, resultsCount, context);
    };
    const origAbandon = Analytics.trackSearchAbandonment.bind(Analytics);
    Analytics.trackSearchAbandonment = (query, timeSpent, context) => {
      window.__analyticsEvents.push({ type: 'search_abandonment', query });
      return origAbandon(query, timeSpent, context);
    };
    const origPoolView = Analytics.trackPoolView.bind(Analytics);
    Analytics.trackPoolView = (pool, context) => {
      window.__analyticsEvents.push({ type: 'pool_view', poolId: pool && pool.pool, source: context && context.source });
      return origPoolView(pool, context);
    };
  });
}

// trackPoolView fires automatically on a ?pool= landing (no interaction to
// time against), so page.evaluate after goto can race it; addInitScript
// runs before the page's own scripts, so it wins deterministically.
async function installPoolViewSpyBeforeLoad(page) {
  await page.addInitScript(() => {
    window.__analyticsEvents = [];
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.trackPoolView) {
        setTimeout(install, 0);
        return;
      }
      const origPoolView = Analytics.trackPoolView.bind(Analytics);
      Analytics.trackPoolView = (pool, context) => {
        window.__analyticsEvents.push({ type: 'pool_view', poolId: pool && pool.pool, source: context && context.source });
        return origPoolView(pool, context);
      };
    };
    install();
  });
}

function probe(url) {
  try {
    const code = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8', url], {
      encoding: 'utf8'
    });
    return code.trim().startsWith('2') || code.trim().startsWith('3');
  } catch (err) {
    return false;
  }
}

async function main() {
  const unpkgReachable = probe('https://unpkg.com/react@18/umd/react.production.min.js');
  const llamaReachable = probe('https://yields.llama.fi/pools');
  console.log(`network: unpkg.com ${unpkgReachable ? 'reachable' : 'BLOCKED (using local vendored React/Babel)'}, ` +
    `yields.llama.fi ${llamaReachable ? 'reachable (live data)' : 'BLOCKED (using DefiLlama-shaped fixture snapshot)'}`);

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

    if (!unpkgReachable) {
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
    }
    if (!llamaReachable) {
      await page.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
      }));
    }
    // api.llama.fi/protocols already fails silently in app.js when unreachable.

    for (const { q, minCards, context, symbol } of QUERIES) {
      await test(`"${q}" renders a correctly filtered, non-empty grid`, async () => {
        await page.goto(`http://localhost:${PORT}/home.html?app=analytics`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.search-input', { timeout: 15000 });
        // Let the pools fetch resolve before typing (matches real user timing).
        await page.waitForFunction(
          () => document.querySelector('.search-input')?.placeholder?.length > 0,
          { timeout: 15000 }
        );
        await page.waitForTimeout(1200);
        await installAnalyticsSpy(page);

        const input = page.locator('.search-input');
        await input.click();
        await input.fill(q);
        await input.press('Enter');

        await page.waitForSelector('.results-section', { timeout: 10000 });

        // Filtering settles across a render + a follow-up effect pass (the
        // chain/protocol state commits, then the filteredPools effect runs).
        // A single point-in-time snapshot can catch that intermediate frame,
        // so poll for the settled, correctly-filtered state instead of
        // reading once — this bounds the wait without being a fixed sleep.
        const deadline = Date.now() + 8000;
        let lastFailure = null;
        for (;;) {
          lastFailure = await page.evaluate(({ minCards, context, symbol }) => {
            const cards = Array.from(document.querySelectorAll('.pool-card'));
            if (cards.length < minCards) {
              const emptyState = document.querySelectorAll('.empty-state').length > 0;
              return `expected >=${minCards} rendered .pool-card, got ${cards.length} (empty-state shown: ${emptyState})`;
            }
            const contextTexts = Array.from(document.querySelectorAll('.pool-context-inline')).map((e) => e.textContent);
            const symbolTexts = Array.from(document.querySelectorAll('.pool-symbol')).map((e) => e.textContent);
            if (context) {
              for (const needle of context) {
                if (!contextTexts.every((t) => t.toLowerCase().includes(needle))) {
                  return `expected every card's context to include "${needle}", got: ${JSON.stringify(contextTexts)}`;
                }
              }
            }
            if (symbol && !symbolTexts.every((t) => t.toLowerCase().includes(symbol))) {
              return `expected every card's symbol to include "${symbol}", got: ${JSON.stringify(symbolTexts)}`;
            }
            return null;
          }, { minCards, context: context || null, symbol: symbol || null });

          if (!lastFailure) break;
          if (Date.now() > deadline) throw new Error(lastFailure);
          await page.waitForTimeout(200);
        }

        // search_success fires from a follow-up effect (spec 020), so it can
        // trail the rendered grid by a pass — poll briefly for it to catch up.
        const eventDeadline = Date.now() + 3000;
        let successEvent = null;
        for (;;) {
          const events = await page.evaluate(() => window.__analyticsEvents);
          successEvent = events.find((ev) => ev.type === 'search_success');
          if (successEvent || Date.now() > eventDeadline) break;
          await page.waitForTimeout(100);
        }
        if (!successEvent) {
          throw new Error('expected a search_success analytics event');
        }
        if (!(successEvent.resultsCount > 0)) {
          throw new Error(`expected search_success resultsCount > 0, got ${successEvent.resultsCount}`);
        }
      });
    }

    await test('?pool= deep link fires pool_view(source=url_direct); card click fires pool_view(source=card_click), no double-fire', async () => {
      // Discover a real pool id via card click first, so this works with live or fixture data.
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      await installAnalyticsSpy(page);

      await page.locator('.pool-card').first().click();
      await page.waitForSelector('.pool-detail-view', { timeout: 10000 });
      const poolId = new URL(page.url()).searchParams.get('pool');
      if (!poolId) throw new Error('expected card click to set ?pool= in the URL');

      const clickViews = (await page.evaluate(() => window.__analyticsEvents)).filter((ev) => ev.type === 'pool_view');
      if (clickViews.length !== 1) {
        throw new Error(`expected exactly one pool_view after card click, got ${JSON.stringify(clickViews)}`);
      }
      if (clickViews[0].source !== 'card_click') {
        throw new Error(`expected card_click source, got: ${JSON.stringify(clickViews[0])}`);
      }

      // Fresh direct landing on the same pool id (the SEO/share deep-link path).
      await installPoolViewSpyBeforeLoad(page);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      const deadline = Date.now() + 5000;
      let urlViews = [];
      for (;;) {
        urlViews = (await page.evaluate(() => window.__analyticsEvents)).filter((ev) => ev.type === 'pool_view');
        if (urlViews.length || Date.now() > deadline) break;
        await page.waitForTimeout(100);
      }
      if (urlViews.length !== 1) {
        throw new Error(`expected exactly one pool_view on url_direct landing, got ${JSON.stringify(urlViews)}`);
      }
      if (urlViews[0].source !== 'url_direct') {
        throw new Error(`expected url_direct source, got: ${JSON.stringify(urlViews[0])}`);
      }
    });

    for (const q of NEGATIVE_QUERIES) {
      await test(`"${q}" does not false-match a protocol`, async () => {
        await page.goto(`http://localhost:${PORT}/home.html?app=analytics`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.search-input', { timeout: 15000 });
        await page.waitForTimeout(1200);
        await installAnalyticsSpy(page);

        const input = page.locator('.search-input');
        await input.click();
        await input.fill(q);
        await input.press('Enter');
        await page.waitForTimeout(1500);

        const events = await page.evaluate(() => window.__analyticsEvents);
        if (!events.some((ev) => ev.type === 'search_abandonment')) {
          throw new Error(`expected a search_abandonment analytics event, got: ${JSON.stringify(events)}`);
        }

        // No token/chain/protocol intent in these queries means no display
        // mode should activate — the results section stays unmounted, same
        // as today's behavior for any non-matching query. If it renders
        // pool cards, that's a false protocol match wrongly narrowing the
        // grid instead of leaving the user's typed text alone.
        const resultsSection = await page.locator('.results-section').count();
        if (resultsSection > 0) {
          const contextTexts = await page.locator('.pool-context-inline').allTextContents();
          throw new Error(`expected no results section for a non-matching query, got cards: ${JSON.stringify(contextTexts)}`);
        }
      });
    }

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  const total = QUERIES.length + NEGATIVE_QUERIES.length + 1; // +1: pool_view source test
  console.log(passed + '/' + total + ' search behavior assertions passed');
}

main().catch((err) => {
  console.error('test_search crashed: ' + err.message);
  process.exitCode = 1;
});
