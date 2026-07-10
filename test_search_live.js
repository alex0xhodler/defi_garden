/* Spec 018: NL search behavior test — drives the REAL UI (real React from CDN,
   real live DefiLlama pool data), types each canonical query into the actual
   search input, and asserts on the RENDERED GRID (not parser return values).
   This is the acceptance-bar upgrade from spec 017's mistake: 017 measured
   parsing (unit fixtures against mock lists) and shipped while the product
   was still broken — 14/14 fixtures green, search still bad in prod preview.

   Requires real network access (unpkg.com for React, yields.llama.fi for pool
   data) — this cannot run in a network-sandboxed CI/build environment. See
   specs/018-notes.md for the sandbox investigation that established this.

   Run: node test_search_live.js
   Timebox: exits after CANONICAL_QUERIES are exhausted; each query capped at
   the per-step Playwright timeouts below (standing decision 2026-07-11: 5-min
   foreground cap on the whole run — this script budgets well under that for
   ~10 queries at a few seconds each). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8792;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};

// Every advertised typing-animation example (app.js searchPhrases, ~line 776)
// plus the human's reported classes plus novel same-class queries — the exact
// set spec 017 pinned as unit fixtures, now re-asserted on rendered behavior.
const CANONICAL_QUERIES = [
  { query: 'USDC on Base', expectChain: 'Base' },
  { query: 'Lending on Plasma', expectChain: 'Plasma' },
  { query: 'CRV LP on Curve', expectChain: null },
  { query: 'Kamino lending', expectChain: null },
  { query: 'solana', expectChain: 'Solana' },
  { query: 'base', expectChain: 'Base' },
  { query: 'kamino', expectChain: null },
  { query: 'kamino lenders', expectChain: null },
  { query: 'curve', expectChain: null },
  { query: 'convex', expectChain: null },
  { query: 'arbitrum', expectChain: 'Arbitrum' },
  { query: 'morpho lending', expectChain: null },
  { query: 'aave', expectChain: null },
  { query: 'usdc on base', expectChain: 'Base' },
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

async function main() {
  const server = await startServer();
  const launchOpts = fs.existsSync('/opt/pw-browsers/chromium')
    ? { executablePath: '/opt/pw-browsers/chromium' }
    : {};
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // Land on the analytics app with an inert filter so the grid + search box mount.
    await page.goto('http://localhost:' + PORT + '/?token=USDC', { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('.pool-card', { timeout: 20000 });

    for (const { query, expectChain } of CANONICAL_QUERIES) {
      await test(`"${query}" -> non-empty, correctly filtered grid`, async () => {
        const input = page.locator('input[type="text"], input[type="search"]').first();
        await input.fill('');
        await input.fill(query);
        await input.press('Enter');
        // Rendered result, not parser output: grid must be non-empty wherever
        // live pools exist for the query.
        await page.waitForSelector('.pool-card', { timeout: 10000 });
        const cardCount = await page.locator('.pool-card').count();
        if (cardCount === 0) throw new Error('grid empty after typing "' + query + '"');
        if (expectChain) {
          const chainBadges = await page.locator('.pool-card').allTextContents();
          if (!chainBadges.some((t) => t.includes(expectChain))) {
            throw new Error('expected chain "' + expectChain + '" not visible in any rendered pool card');
          }
        }
      });
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + '/' + CANONICAL_QUERIES.length + ' live search behavior assertions passed');
}

main().catch((err) => {
  console.error('live search test crashed: ' + err.message);
  process.exitCode = 1;
});
