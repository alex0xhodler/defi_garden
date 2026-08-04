/* Playwright acceptance gate for spec 072 (honest dead-`?pool=` empty state):
   drives the REAL rendered analytics app (home.html + vendored React +
   app.compiled.min.js) and asserts the six acceptance criteria — a dead
   `?pool=<id>` deep link renders the honest "no longer tracked" empty state,
   noindexes ONLY that dead URL, offers live trust-rail alternatives, and never
   noindexes a VALID pool URL.

   home.html loads React/ReactDOM/translations/analytics/PoolDetail/app entirely
   from LOCAL vendored files (see home.html:141-143, :318-319); the ONLY external
   request is yields.llama.fi/pools, which is fixture-routed here. Every other
   non-local request (fonts, analytics CDN) is aborted — connection-blocked
   in-sandbox anyway (NORTH_STAR 2026-07-12). Runtime EN/KO strings are read from
   translations.js at test time, never hardcoded.

   Run: node test_dead_pool.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8800; // 8791-8799 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// Runtime strings straight from the source of truth (never hardcoded).
const { translations: tr } = require('./translations.js');
const EN_TITLE = tr.en.poolNotFoundTitle;
const KO_TITLE = tr.ko.poolNotFoundTitle;

const DEAD_ID = 'definitely-not-a-real-pool-id';

// Fixture pools: stablecoin pools well above the $10M floor (DEFAULT_MIN_TVL)
// become the honest alternatives; one sub-floor stable pool must be excluded;
// VALID_ID is a real live pool used to prove a valid ?pool= URL is never
// noindexed and still renders pool detail.
const VALID_ID = 'usdc-eth-aave-valid';
const FIXTURE_POOLS = { status: 'success', data: [
  { pool: VALID_ID,          symbol: 'USDC', project: 'aave-v3',     chain: 'Ethereum', apyBase: 5,  apyReward: 0, tvlUsd: 800000000 },
  { pool: 'usdt-eth-comp',   symbol: 'USDT', project: 'compound-v3', chain: 'Ethereum', apyBase: 6,  apyReward: 0, tvlUsd: 400000000 },
  { pool: 'dai-eth-morpho',  symbol: 'DAI',  project: 'morpho-blue', chain: 'Ethereum', apyBase: 7,  apyReward: 0, tvlUsd: 250000000 },
  { pool: 'usds-eth-spark',  symbol: 'USDS', project: 'spark',       chain: 'Ethereum', apyBase: 4,  apyReward: 0, tvlUsd: 120000000 },
  { pool: 'usdc-eth-subfloor', symbol: 'USDC', project: 'sushiswap', chain: 'Ethereum', apyBase: 9, apyReward: 0, tvlUsd: 500000 } // below $10M -> excluded
] };
const FIXTURE_RESPONSE = JSON.stringify(FIXTURE_POOLS);

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

// New context with pools fixture-routed and every other external request
// aborted. Collects pageerrors for the zero-page-errors criterion. Viewport
// defaults to the existing 1280x900 (unchanged for all pre-existing spec 072
// criteria); item 224's occlusion criteria pass their own viewport.
async function newCtx(browser, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.route('**yields.llama.fi/pools**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
  }));
  await context.route(url =>
    !url.href.startsWith(`http://localhost:${PORT}`) && !url.href.includes('yields.llama.fi'),
    route => route.abort());
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  return { context, page, pageErrors };
}

const robotsContent = (page) => page.evaluate(() => {
  const m = document.querySelector('meta[name="robots"]');
  return m ? m.getAttribute('content') : null;
});

// --- Item 224: at-rest / bottom-of-scroll occlusion of the dead-pool empty
//     state's alternatives grid by the fixed .app-footer. -------------------

// Scrolls to the true bottom of the document, looping window.scrollTo (content
// can still be growing/settling right after mount) with short waits, then
// ASSERTS the bottom was actually reached — a test that silently failed to
// scroll would pass the geometry assertion below vacuously (playbook trap).
async function scrollToTrueBottom(page) {
  let atBottom = false;
  for (let i = 0; i < 8; i++) {
    atBottom = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const doc = document.documentElement;
      // Within 1px of true bottom counts as "reached" (sub-pixel rounding).
      return Math.abs((doc.scrollTop + window.innerHeight) - doc.scrollHeight) <= 1;
    });
    if (atBottom) break;
    await page.waitForTimeout(150);
  }
  if (!atBottom) throw new Error('scrollToTrueBottom: never reached the true bottom of the document after 8 attempts');
  return atBottom;
}

// Every rendered (non-zero-area) element inside .empty-state / .empty-state-
// alternatives, derived from the DOM AT TEST TIME — never a hardcoded victim
// list, since the alternatives set is drawn from the fixture at runtime. Each
// candidate is checked BOTH ways: geometric overlap with .app-footer's rect,
// and an elementFromPoint hit-test at the element's lower band (2px above its
// own bottom edge, horizontal centre) — a click-interception check, not just
// a paint-test (playbook step 5).
async function findOcclusionVictims(page) {
  return page.evaluate(() => {
    const footer = document.querySelector('.app-footer');
    if (!footer) return { footerRect: null, victims: [] };
    const fr = footer.getBoundingClientRect();
    const footerRect = { x: fr.x, y: fr.y, w: fr.width, h: fr.height };
    const roots = document.querySelectorAll('.empty-state, .empty-state-alternatives');
    const seen = new Set();
    const victims = [];
    roots.forEach((root) => {
      root.querySelectorAll('*').forEach((el) => {
        if (seen.has(el)) return; // .empty-state-alternatives nests inside .empty-state
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; // skip zero-area elements
        const overlapX = Math.max(0, Math.min(r.right, fr.right) - Math.max(r.left, fr.left));
        const overlapY = Math.max(0, Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top));
        const coveredPct = (r.width * r.height) > 0 ? (overlapX * overlapY) / (r.width * r.height) * 100 : 0;
        const cx = r.left + r.width / 2;
        const cy = r.bottom - 2;
        const hit = document.elementFromPoint(cx, cy);
        const hitInFooter = !!(hit && (hit === footer || footer.contains(hit)));
        if (coveredPct > 0 || hitInFooter) {
          victims.push({
            selector: (typeof el.className === 'string' && el.className) ? el.className : el.tagName,
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            coveredPct: Number(coveredPct.toFixed(1)),
            hitInFooter,
            hitSelector: hit ? ((typeof hit.className === 'string' && hit.className) ? hit.className : hit.tagName) : null
          });
        }
      });
    });
    return { footerRect, victims };
  });
}

// Throws naming the victim selector, both rects, the covered %, and the
// hit-test result — never a bare "expected 0 got N" (spec 224 requirement).
async function assertNoOcclusion(page, label) {
  const { footerRect, victims } = await findOcclusionVictims(page);
  if (victims.length) {
    const lines = victims.map((v) =>
      `victim ".${v.selector}" rect=${JSON.stringify(v.rect)} vs .app-footer rect=${JSON.stringify(footerRect)} ` +
      `covered=${v.coveredPct}% hitTest=${v.hitInFooter ? `INSIDE .app-footer (resolved "${v.hitSelector}")` : `clear (resolved "${v.hitSelector}")`}`
    );
    throw new Error(`${label}: ${victims.length} occluded element(s) in .empty-state / .empty-state-alternatives:\n    ` + lines.join('\n    '));
  }
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // --- Criterion 1: dead ?pool= renders honest empty state, no homepage grid,
    //     noindex ------------------------------------------------------------
    await test('dead ?pool= renders honest empty state (EN title), no all-pools grid, robots=noindex', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.empty-state', { timeout: 15000 });

      // Honest headline visible.
      await page.waitForFunction((title) => {
        const el = document.querySelector('.empty-state .empty-message');
        return el && el.textContent.trim() === title;
      }, EN_TITLE, { timeout: 8000 });

      // The all-pools grid must NOT render: zero .pool-card outside the
      // alternatives block (alternatives live inside .empty-state-alternatives).
      const strayCards = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.pool-card'))
          .filter(c => !c.closest('.empty-state-alternatives')).length);
      if (strayCards !== 0) throw new Error(`expected 0 pool-cards outside alternatives, got ${strayCards}`);

      const robots = await robotsContent(page);
      if (robots !== 'noindex') throw new Error(`expected robots=noindex, got ${robots}`);

      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 2: alternatives render (from fixture, above floor); clicking
    //     one navigates to pool detail and restores robots=index, follow ------
    await test('alternatives render above the floor; clicking one -> pool detail + robots restored', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.empty-state-alternatives .pool-card', { timeout: 15000 });

      const altCards = await page.locator('.empty-state-alternatives .pool-card').count();
      if (altCards < 1) throw new Error(`expected >=1 alternative pool-card, got ${altCards}`);

      // Every alternative must be a fixture pool above the $10M floor.
      const aboveFloor = new Set(FIXTURE_POOLS.data.filter(p => p.tvlUsd >= 10_000_000).map(p => p.symbol));
      const altSymbols = await page.locator('.empty-state-alternatives .pool-symbol').allTextContents();
      for (const s of altSymbols) {
        const base = s.trim().split(/[-\s/]/)[0];
        if (!aboveFloor.has(base)) throw new Error(`alternative symbol "${s}" is not an above-floor fixture pool`);
      }

      await page.locator('.empty-state-alternatives .pool-card').first().click();
      await page.waitForSelector('.pool-detail-view', { timeout: 10000 });

      await page.waitForFunction(() => {
        const m = document.querySelector('meta[name="robots"]');
        return m && m.getAttribute('content') === 'index, follow';
      }, { timeout: 8000 });
      const robots = await robotsContent(page);
      if (robots !== 'index, follow') throw new Error(`expected robots restored to "index, follow", got ${robots}`);

      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 3 (guardrail): valid ?pool= renders detail, NEVER noindexed
    await test('valid ?pool= renders pool detail and robots stays "index, follow" (never noindexed)', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${VALID_ID}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

      // Watch robots for a while; it must never flip to noindex on a live pool.
      const deadline = Date.now() + 3000;
      for (;;) {
        const robots = await robotsContent(page);
        if (robots === 'noindex') throw new Error('valid pool URL was noindexed — guardrail violation');
        if (Date.now() > deadline) break;
        await page.waitForTimeout(150);
      }
      const finalRobots = await robotsContent(page);
      if (finalRobots !== 'index, follow') throw new Error(`expected robots "index, follow" on valid pool, got ${finalRobots}`);

      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 4: KO locale renders KO title -----------------------------
    await test('dead ?pool=&lang=ko renders the KO poolNotFoundTitle string', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}&lang=ko`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.empty-state', { timeout: 15000 });
      await page.waitForFunction((title) => {
        const el = document.querySelector('.empty-state .empty-message');
        return el && el.textContent.trim() === title;
      }, KO_TITLE, { timeout: 8000 });
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Criterion 6: token empty-state path untouched — a VALID token search
    //     still renders the grid and is indexable (deadPoolResolved=false path
    //     renders byte-identically to before) -------------------------------
    await test('valid ?token= still renders pool cards and stays indexable (dead-pool path does not disturb token path)', async () => {
      const { context, page, pageErrors } = await newCtx(browser);
      await page.goto(`http://localhost:${PORT}/home.html?token=USDC`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const cards = await page.locator('.pool-card').count();
      if (cards < 1) throw new Error(`expected >=1 pool-card for a valid token, got ${cards}`);
      const robots = await robotsContent(page);
      if (robots !== 'index, follow') throw new Error(`expected valid token page indexable, got robots=${robots}`);
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });

    // --- Item 224 criterion: at-rest occlusion is zero at every design-bar
    //     viewport (360/768/1280) on the dead-pool empty state --------------
    for (const viewport of [{ width: 1280, height: 780 }, { width: 768, height: 780 }, { width: 360, height: 780 }]) {
      await test(`item 224: ${viewport.width}x${viewport.height} at rest (scrollY=0) — zero .empty-state* occlusion by .app-footer`, async () => {
        const { context, page, pageErrors } = await newCtx(browser, viewport);
        await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.empty-state', { timeout: 15000 });
        await page.waitForSelector('.empty-state-alternatives .pool-card', { timeout: 15000 });
        const scrollY = await page.evaluate(() => window.scrollY);
        if (scrollY !== 0) throw new Error(`expected scrollY=0 at rest, got ${scrollY}`);
        await assertNoOcclusion(page, `${viewport.width}x${viewport.height} at rest`);
        if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
        await context.close();
      });
    }

    // --- Item 224 criterion: bottom-of-scroll is still clear. This is the
    //     case the old `padding-bottom: 80px` used to protect; with the
    //     footer now in flow it must still hold ---------------------------
    for (const viewport of [{ width: 1280, height: 780 }, { width: 768, height: 780 }, { width: 360, height: 780 }]) {
      await test(`item 224: ${viewport.width}x${viewport.height} true bottom of scroll — arrival asserted, zero .empty-state* occlusion`, async () => {
        const { context, page, pageErrors } = await newCtx(browser, viewport);
        await page.goto(`http://localhost:${PORT}/home.html?pool=${DEAD_ID}`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.empty-state', { timeout: 15000 });
        await page.waitForSelector('.empty-state-alternatives .pool-card', { timeout: 15000 });
        await scrollToTrueBottom(page); // throws if it never arrives — no vacuous pass
        await assertNoOcclusion(page, `${viewport.width}x${viewport.height} bottom of scroll`);
        if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
        await context.close();
      });
    }

    // --- Item 224 criterion: no collateral on the analytics search-home
    //     state — `.app:not(.has-results)` with NO `.results-section`
    //     (`?app=analytics`, no query yet) must keep the fixed footer + its
    //     80px clearance untouched; the new selector requires BOTH
    //     `.results-section` present AND `.has-results` absent, so this
    //     state (`.results-section` absent) must not match it -------------
    await test('item 224: analytics search-home (no .results-section) keeps .app-footer fixed + .app padding-bottom:80px', async () => {
      const { context, page, pageErrors } = await newCtx(browser, { width: 1280, height: 780 });
      await page.goto(`http://localhost:${PORT}/home.html?app=analytics`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.app-footer', { timeout: 15000 });

      const rendered = await page.evaluate(() => {
        const app = document.querySelector('.app');
        const footer = document.querySelector('.app-footer');
        return {
          hasResultsSection: !!document.querySelector('.results-section'),
          appHasResultsClass: app ? app.classList.contains('has-results') : null,
          footerPosition: footer ? getComputedStyle(footer).position : null,
          appPaddingBottom: app ? getComputedStyle(app).paddingBottom : null
        };
      });

      if (rendered.hasResultsSection) throw new Error('expected NO .results-section on the bare analytics search-home state, found one — fixture/URL does not exercise the collateral case');
      if (rendered.appHasResultsClass) throw new Error('expected .app to lack .has-results on the search-home state');
      if (rendered.footerPosition !== 'fixed') throw new Error(`expected .app-footer position:fixed on search-home (no .results-section), got "${rendered.footerPosition}" — item 224's :has(.results-section) selector leaked onto a state with no results`);
      if (rendered.appPaddingBottom !== '80px') throw new Error(`expected .app padding-bottom:80px on search-home, got "${rendered.appPaddingBottom}"`);

      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
      await context.close();
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} dead-pool assertions passed (EN: "${EN_TITLE}", KO: "${KO_TITLE}")`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
