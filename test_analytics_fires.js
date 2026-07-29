/* Playwright live-render check for SEO-surface analytics wiring (spec 044).
   Existing coverage only proves the snippet is byte-present in generated
   HTML (test_token_pages.js/test_chain_pages.js/test_stories.js grep
   `Analytics.trackPageView("/tokens/big"` out of the string) — it never ran
   a real browser against a real page, the exact gap 017's post-mortem
   warned about. This test renders one real generated `/tokens/<slug>` page
   in headless Chromium and asserts the actual Mixpanel track call fires
   with the right path/page_type.

   `?pool=<id>` url_direct pool_view firing is already live-render-verified
   in test_search.js ("?pool= deep link fires pool_view(source=url_direct)
   ..."); this file only closes the remaining token-page gap.

   Run: node test_analytics_fires.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const gen = require('./generate-token-pages.js');

const PORT = 8793;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare\.com/i;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Real generated token page HTML — same generator function 039 shipped,
// same fixture branch (`BIG`) test_token_pages.js already exercises.
const pools = JSON.parse(fs.readFileSync(path.join(ROOT, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const bigRecord = gen.rankTopTokens(pools).find(r => r.symbol === 'BIG');
const FIXTURE_TOKEN_HTML = gen.renderTokenPage(bigRecord);
const FIXTURE_PATH = '/tokens/' + bigRecord.slug;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === FIXTURE_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(FIXTURE_TOKEN_HTML);
        return;
      }
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
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    await test('generated /tokens/<slug> page issues one page_view track call (page_type=token_landing, correct path) on real load', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        // Chromium's "Failed to load resource" text never includes the URL
        // itself (mirrors test_search.js) — match against the failing
        // resource's own location, not the message text.
        const source = msg.location()?.url || '';
        if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
          errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
        }
      });

      // Blanket-abort every external host except localhost, reusing the more
      // robust pattern test_snapshot_first.js:107-109 already has (rather than
      // a per-host allowlist the next new external host would defeat). The
      // page pulls https://api.fontshare.com/... (style.css's blocking
      // @import) and https://mp.defi.garden/lib.min.js (the Mixpanel
      // bootstrap generate-token-pages.js embeds in every generated page);
      // neither fails fast in this sandbox (~13s ERR_CONNECTION_RESET each),
      // which sequentially blew the old waitUntil:'load' budget. Registered
      // FIRST so the specific analytics.js fulfill route below still wins —
      // Playwright matches routes most-recently-registered-first, so the
      // fulfill added after this abort takes precedence (proven by the
      // page_view assertion below actually passing, since it depends on
      // analytics.js having loaded).
      await page.route(u => !u.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());

      // Every generated SEO page references analytics.js by absolute
      // production URL (renderAnalyticsBootstrap uses SITE_URL), so this
      // local server needs to intercept that one absolute request; other
      // assets (/style.css) already resolve against localhost. Registered
      // after the blanket abort above so it wins for this one URL.
      await page.route('https://www.defi.garden/analytics.js', (route) => route.fulfill({
        status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'analytics.js'))
      }));

      // Spy on Analytics.track (one call above mixpanel.track itself, which
      // is unreachable in this sandbox — same established pattern as
      // test_search.js's installAnalyticsSpy/installPoolViewSpyBeforeLoad).
      // addInitScript runs before the page's own deferred scripts, so the
      // patch is in place before the bootstrap's window 'load' listener
      // (which fires trackPageView) can race it.
      await page.addInitScript(() => {
        window.__analyticsEvents = [];
        const install = () => {
          if (typeof Analytics === 'undefined' || !Analytics.track) { setTimeout(install, 0); return; }
          const origTrack = Analytics.track.bind(Analytics);
          Analytics.track = (eventName, eventData) => {
            window.__analyticsEvents.push({ eventName, eventData });
            return origTrack(eventName, eventData);
          };
        };
        install();
      });

      await page.goto(`http://localhost:${PORT}${FIXTURE_PATH}`, { waitUntil: 'load', timeout: 15000 });

      const deadline = Date.now() + 5000;
      let events = [];
      for (;;) {
        events = await page.evaluate(() => window.__analyticsEvents);
        if (events.length || Date.now() > deadline) break;
        await page.waitForTimeout(100);
      }
      await page.close();

      if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      const pageViews = events.filter((e) => e.eventName === 'page_view');
      if (pageViews.length !== 1) throw new Error(`expected exactly one page_view track call, got ${JSON.stringify(pageViews)}`);
      const data = pageViews[0].eventData;
      if (data.path !== FIXTURE_PATH) throw new Error(`expected path ${FIXTURE_PATH}, got ${data.path}`);
      if (data.page_type !== 'token_landing') throw new Error(`expected page_type=token_landing, got ${JSON.stringify(data)}`);
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' analytics-fires assertions passed');
}

main().catch((err) => {
  console.error('test_analytics_fires crashed: ' + err.message);
  process.exitCode = 1;
});
