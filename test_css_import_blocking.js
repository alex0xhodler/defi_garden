/* Playwright acceptance gate for backlog 187 — style.css's blocking @import.
   style.css line 1 used to @import a third-party fontshare stylesheet. Every
   page defers style.min.css with the async-CSS pattern
   `media="print" onload="this.media='all'"`; a <link>'s `load` event does not
   fire until its @import'ed sub-resources resolve, so whenever
   api.fontshare.com is blocked/slow, `this.media='all'` NEVER runs and the
   whole 545-rule design system stays applied to print media only — a totally
   unstyled page (see product-loop-kit/specs/187.md).

   The fix (separate diff) deletes the @import; nothing replaces it (the font
   it imported, Satoshi, is used by zero font-family declarations — the real
   font, FKGroteskNeue, is self-hosted). This test is the rendered regression
   gate for that fix, plus a source-level rail so it cannot come back:

     A1. `style.css` and `style.min.css` contain no `@import` at all.
     A3. Rendered, with api.fontshare.com BLOCKED: on BOTH /plan.html and
         /home.html?pool=<real snapshot id>, the style.min.css <link>'s live
         `media` IDL property settles to 'all' and
         `getComputedStyle(document.documentElement).getPropertyValue('--color-background')`
         is non-empty (polled up to ~10s — the swap happens on the sheet's
         `load`, which is after document `load`, per the async-read trap in
         playbooks/product-audit.md).
     A5. `style.css` contains no @import of a REMOTE url (http:, https:, or
         protocol-relative //) — a relative @import is not what broke this and
         is not banned. The failure message names the offending line.

   A4 (non-vacuity — this test must be provably RED on the pre-fix tree) is
   NOT proven by this file; it's proven once, out-of-band, by temporarily
   re-adding the @import to a scratch copy of style.min.css and recording the
   failing output in product-loop-kit/specs/187-notes.md (a test that would
   pass either way is worthless per that spec's territory notes).

   Fixture-routed per the test_smoke.js / test_snapshot_first.js pattern: a
   local static server serves the repo, api.fontshare.com is explicitly
   ABORTED (the condition under test), and /data/pools-snapshot-meta.json is
   routed with a FRESH generatedAt so the snapshot-first path is exercised —
   without it the grid falls through to a blocked live fetch and renders 0
   results (documented fixture trap, playbooks/product-audit.md).

   Run: node test_css_import_blocking.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8865; // distinct from other test_* files (8791-8864 taken)
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — same id test_northstar_cta_fires.js uses for its url_direct
// case. Verified present in the snapshot below before the test runs.
const REAL_POOL_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90';

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

// ---------------------------------------------------------------------------
// A1 / A5 — source-level checks on the CSS files themselves (no browser).
// ---------------------------------------------------------------------------

// Returns [{ line, text }] for every line containing "@import".
function findImportLines(cssText) {
  return cssText.split('\n')
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter((entry) => /@import/i.test(entry.text));
}

// True if an @import line's target URL is remote (http:, https:, or
// protocol-relative //). A relative @import (e.g. url('./foo.css')) is NOT
// remote and is not banned (spec 187 A5).
function isRemoteImportLine(text) {
  const m = text.match(/@import\s+(?:url\(\s*)?['"]?([^'")]+)['"]?\)?/i);
  const target = (m ? m[1] : text).trim();
  return /^(https?:)?\/\//i.test(target);
}

function assertNoImportAtAll(cssText, label) {
  const offenders = findImportLines(cssText);
  if (offenders.length) {
    throw new Error(`${label} still contains @import — ` +
      offenders.map((o) => `line ${o.line}: "${o.text}"`).join('; '));
  }
}

function assertNoRemoteImport(cssText, label) {
  const offenders = findImportLines(cssText).filter((o) => isRemoteImportLine(o.text));
  if (offenders.length) {
    throw new Error(`${label} contains a remote @import — ` +
      offenders.map((o) => `line ${o.line}: "${o.text}"`).join('; '));
  }
}

// ---------------------------------------------------------------------------
// A3 — rendered check: fontshare BLOCKED, the deferred sheet must still
// settle to media="all" and the design-system tokens must resolve.
// ---------------------------------------------------------------------------

// Polls up to timeoutMs (default ~10s per the async-read trap: the print→all
// swap happens on the stylesheet's own `load`, which fires after document
// `load`) for the style.min.css <link>'s live `media` IDL property to settle
// to 'all' AND --color-background to resolve to a non-empty value.
async function pollCssApplied(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 10000);
  let last = { media: null, colorBg: '' };
  for (;;) {
    last = await page.evaluate(() => {
      const link = document.querySelector('link[href*="style.min.css"]');
      return {
        media: link ? link.media : null,
        colorBg: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim()
      };
    });
    if (last.media === 'all' && last.colorBg !== '') return last;
    if (Date.now() > deadline) return last;
    await page.waitForTimeout(150);
  }
}

async function routeFixtures(context) {
  // The condition under test: api.fontshare.com is unreachable/blocked.
  // Match by hostname (not a glob string) so both http/https and any path are
  // caught regardless of scheme.
  await context.route((url) => url.hostname === 'api.fontshare.com', (route) => route.abort());

  // Snapshot-first fixture trap (playbooks/product-audit.md): route the meta
  // file with a FRESH generatedAt so pages that check the snapshot-first path
  // (the planner, unconditionally) take it instead of falling through to a
  // blocked live fetch and rendering 0 results. schemaVersion/generatedAt are
  // the only fields app.js/planner.js actually read off this file.
  await context.route('**/data/pools-snapshot-meta.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString() })
  }));
  // Serve the real committed snapshot verbatim so the chain the meta file
  // promises (meta fresh -> fetch pools-snapshot.json) actually resolves.
  await context.route('**/data/pools-snapshot.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8')
  }));
  // /home.html?pool=<id> always goes live (?pool= deep links skip the
  // snapshot path by design, spec 072/105) — fixture the live endpoint with
  // the real pool so the pool-detail view renders cleanly.
  await context.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'success',
      data: [{
        pool: REAL_POOL_ID, project: 'lido', symbol: 'STETH', chain: 'Ethereum',
        tvlUsd: 18_059_973_278, apyBase: 2.283, apyReward: null
      }]
    })
  }));
  // Decorative icon host — irrelevant to CSS application, abort so it never
  // delays anything.
  await context.route('https://icons.llamao.fi/**', (route) => route.abort());
}

async function main() {
  // Sanity check: the pool id used for /home.html?pool=<id> is real, drawn
  // from the committed snapshot (matches test_northstar_cta_fires.js's
  // precedent) — not invented.
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  if (!snapshot.pools.some((p) => p.pool === REAL_POOL_ID)) {
    throw new Error(`REAL_POOL_ID ${REAL_POOL_ID} not found in data/pools-snapshot.json — pick a real id`);
  }

  console.log('network: api.fontshare.com BLOCKED (page.route abort) on every page under test');

  // --- A1 / A5: source-level checks, no browser needed ---
  const styleCss = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const styleMinCss = fs.readFileSync(path.join(ROOT, 'style.min.css'), 'utf8');

  await test('A1: style.css contains no @import', async () => assertNoImportAtAll(styleCss, 'style.css'));
  await test('A1: style.min.css contains no @import', async () => assertNoImportAtAll(styleMinCss, 'style.min.css'));
  await test('A5: style.css contains no @import of a remote URL (http:/https:/protocol-relative //)', async () =>
    assertNoRemoteImport(styleCss, 'style.css'));

  // --- A3: rendered, fontshare blocked, on both sacred surfaces ---
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const pages = [
      { label: '/plan.html', url: '/plan.html' },
      { label: `/home.html?pool=${REAL_POOL_ID}`, url: `/home.html?pool=${encodeURIComponent(REAL_POOL_ID)}` }
    ];

    for (const { label, url } of pages) {
      await test(`A3: ${label} — style.min.css link settles to media="all" with fontshare blocked`, async () => {
        const context = await browser.newContext();
        await routeFixtures(context);
        const page = await context.newPage();
        await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'load', timeout: 20000 });
        const result = await pollCssApplied(page, 10000);
        await context.close();
        if (result.media !== 'all') {
          throw new Error(`style.min.css link.media never settled to "all" within 10s (last observed: ${JSON.stringify(result.media)}) — the design system stayed print-only`);
        }
      });

      await test(`A3: ${label} — --color-background resolves (fontshare blocked)`, async () => {
        const context = await browser.newContext();
        await routeFixtures(context);
        const page = await context.newPage();
        await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'load', timeout: 20000 });
        const result = await pollCssApplied(page, 10000);
        await context.close();
        if (!result.colorBg) {
          throw new Error(`--color-background never resolved to a non-empty value within 10s (link.media was ${JSON.stringify(result.media)}) — the 545-rule design system never applied`);
        }
      });
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} css-import-blocking assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
