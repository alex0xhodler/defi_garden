/* Playwright behavior gate for the SEO-page -> waitlist entry point (spec
   062): drives the REAL rendered plan.html UI (never fixture strings alone,
   2026-07-11 standing decision — 017's failure is the precedent). Opens
   `plan.html?waitlist=1&src=seo_token` — the exact URL the new /tokens/ and
   /chains/ page CTAs deep-link to — and asserts the waitlist modal actually
   auto-opens on load and `Analytics.trackWaitlistOpened` actually fires with
   `source: 'seo_token'`.

   Uses `waitUntil: 'domcontentloaded'` rather than this repo's usual
   `waitUntil: 'load'` (test_smoke.js/test_search.js/test_spotlight_url.js):
   plan.html's head loads the Mixpanel lib async from mp.defi.garden, and in
   this sandbox that request doesn't fail fast, it hangs until Playwright's
   own per-goto timeout — which is why those files' full suites run long
   here (each case pays that timeout, not a genuine hang). The waitlist
   modal's auto-open effect runs on mount and needs none of that resource,
   so domcontentloaded is both faster and the more precise wait condition
   for what this test actually checks. Mixpanel's stub queues `track()`
   calls as plain array entries on `window.mixpanel` before the real lib
   loads (see plan.html's inline snippet) — that queue is inspected directly
   below, so the assertion never depends on mp.defi.garden being reachable.

   Spec 096's production-host gate (analytics.js:96, PRODUCTION_HOSTS at :14)
   makes `Analytics.track()` return before ever calling `mixpanel.track()`
   when `location.hostname` is localhost, which is where this file's server
   runs — so without help the stub queue above is structurally always empty,
   independent of whether the product is doing the right thing.
   `neutralizeHostGate()` below overrides `Analytics.isProductionHost()` to
   `true` via `addInitScript` (same poll-and-patch shape as
   test_analytics_host_gate_render.js:74-89) so real track() calls travel
   into the stub queue and the reads below regain their original meaning.

   Run: node test_waitlist_seo_entry.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8796; // 8791-8795 already claimed by test_smoke/test_search/test_analytics_fires/test_spotlight_url/reserved
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// spec 096's production-host gate (analytics.js:96, PRODUCTION_HOSTS at :14)
// makes Analytics.track() return before ever calling mixpanel.track() when
// location.hostname is localhost — so window.mixpanel's stub queue is
// structurally always empty on these test pages, no matter what the product
// does. Neutralising Analytics.isProductionHost() restores exactly the
// production condition (nothing else) and lets events travel the REAL path
// into the stub queue, so every existing queue-read assertion below keeps its
// original end-to-end meaning. Same poll-and-patch shape as
// test_analytics_host_gate_render.js:74-89, which remains the negative
// control proving the gate itself still suppresses when NOT overridden.
async function neutralizeHostGate(target) {
  await target.addInitScript(() => {
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.isProductionHost) { setTimeout(install, 0); return; }
      Analytics.isProductionHost = () => true;
    };
    install();
  });
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'plan.html' : urlPath);
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
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext();
    // Abort every non-local request up front (mp.defi.garden lib, the
    // yields.llama.fi pools fetch, Google favicons) so nothing lingers in
    // the background after the assertions below run — belt-and-suspenders
    // alongside domcontentloaded, not load-bearing for the test itself.
    await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`), route => route.abort());
    // Context-level: applies to every page created below (page/page2/page3/page4).
    await neutralizeHostGate(context);
    const page = await context.newPage();

    await test('plan.html?waitlist=1&src=seo_token auto-opens the waitlist modal on load', async () => {
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1&src=seo_token`, {
        waitUntil: 'domcontentloaded', timeout: 15000
      });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      const title = await page.textContent('.gp-waitlist-title');
      if (title !== 'Get early access to the card') {
        throw new Error('unexpected modal title: ' + title);
      }
      const emailInput = await page.locator('.gp-waitlist-email-input').count();
      if (emailInput !== 1) throw new Error('waitlist email form did not render');
    });

    await test('Analytics.trackWaitlistOpened fires with source=seo_token (via the Mixpanel stub queue)', async () => {
      const calls = await page.evaluate(() => (window.mixpanel || []).filter(c => Array.isArray(c) && c[0] === 'track'));
      const opened = calls.find(c => c[1] === 'waitlist_opened');
      if (!opened) throw new Error('no waitlist_opened track call found in the Mixpanel stub queue');
      if (opened[2].source !== 'seo_token') {
        throw new Error('expected source=seo_token, got ' + JSON.stringify(opened[2].source));
      }
    });

    await test('a plain plan.html load (no ?waitlist=1) does NOT auto-open the waitlist modal', async () => {
      const page2 = await context.newPage();
      await page2.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page2.waitForTimeout(300); // let any mount-time effects settle
      const backdrop = await page2.locator('.gp-waitlist-backdrop').count();
      await page2.close();
      if (backdrop !== 0) throw new Error('waitlist modal auto-opened without ?waitlist=1');
    });

    await test('?waitlist=1&src=seo_chain opens the modal with source=seo_chain (chain-page CTA path)', async () => {
      const page3 = await context.newPage();
      await page3.goto(`http://localhost:${PORT}/plan.html?waitlist=1&src=seo_chain`, {
        waitUntil: 'domcontentloaded', timeout: 15000
      });
      await page3.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      const calls = await page3.evaluate(() => (window.mixpanel || []).filter(c => Array.isArray(c) && c[0] === 'track'));
      const opened = calls.find(c => c[1] === 'waitlist_opened');
      await page3.close();
      if (!opened || opened[2].source !== 'seo_chain') {
        throw new Error('expected source=seo_chain, got ' + JSON.stringify(opened && opened[2] && opened[2].source));
      }
    });

    // 079: the hub/az spine now carries the same CTA. Drive the REAL served
    // tokens/index.html end-to-end: the CTA must be visible, clicking it must
    // land on plan.html with the waitlist modal open and waitlist_opened
    // tagged source=seo_tokens_hub (the hub surface's own source).
    await test('tokens/index.html CTA is visible, clicks through to the waitlist modal with source=seo_tokens_hub', async () => {
      const page4 = await context.newPage();
      await page4.goto(`http://localhost:${PORT}/tokens/index.html`, {
        waitUntil: 'domcontentloaded', timeout: 15000
      });
      // The waitlist CTA (not the back-to-home hub-cta) — target by its href.
      const cta = page4.locator('.hub-waitlist a.hub-cta[href*="waitlist=1"]');
      await cta.waitFor({ state: 'visible', timeout: 5000 });
      const href = await cta.getAttribute('href');
      if (!/src=seo_tokens_hub/.test(href)) {
        throw new Error('hub CTA href missing src=seo_tokens_hub: ' + href);
      }
      await Promise.all([
        page4.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
        cta.click()
      ]);
      await page4.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      const calls = await page4.evaluate(() => (window.mixpanel || []).filter(c => Array.isArray(c) && c[0] === 'track'));
      const opened = calls.find(c => c[1] === 'waitlist_opened');
      await page4.close();
      if (!opened || opened[2].source !== 'seo_tokens_hub') {
        throw new Error('expected source=seo_tokens_hub, got ' + JSON.stringify(opened && opened[2] && opened[2].source));
      }
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} waitlist-seo-entry assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
