/* Rendered Playwright test for backlog 252 — the persisted `insider` traffic
   marker. `?insider=1` persists a flag to localStorage; every subsequently
   tracked event (not just page_view) carries `insider: true`; `?insider=0`
   clears it; unmarked visitors carry no `insider` key at all (absence, not
   `false`); the flag survives a reload AND a navigation between the two
   router modes (planner-mode `/` vs analytics-mode `/?token=…`).

   Proves the RENDERED, end-to-end path (never fixture strings alone,
   2026-07-11 standing decision — 017's failure is the precedent), mirroring
   test_analytics_src_attribution.js's fixture-routing style:
     - same local HTTP server + `/opt/pw-browsers/chromium` fallback
     - same blanket "abort every non-localhost request" route, registered
       first so per-test fixture routes (registered after) still win
     - same neutralizeHostGate() (spec 096's PRODUCTION_HOSTS gate makes
       Analytics.track() return before ever reaching mixpanel.track() when
       location.hostname is localhost)
     - same window.mixpanel stub-queue inspection (['track', eventName,
       props] entries queued by the inline Mixpanel snippet before the real
       lib loads)

   POPULATION, not instance (spec 252 acceptance criteria): the set of
   events analytics.js can emit is derived BY PARSING analytics.js's OWN
   SOURCE at test time (every `this.track('<name>'` / `Analytics.track('<name>'`
   call site), not hand-picked. Every event actually observed in this file's
   scenarios is checked against that derived population and against the
   insider expectation — the planner leg deliberately exercises
   `waitlist_opened`, an event `page_view` can never stand in for (it fires
   only from app.js — trackPageView is never called from planner.js), so a
   check blind to the planner path cannot pass here.

   Run: node test_analytics_insider.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8880; // distinct from other test_* files (8791-8878 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};

// A pool whose symbol matches ?token=USDC so the analytics grid renders at
// least one .pool-card, which is what drives app.js's "track initial page
// load" effect (Analytics.trackPageView — the event that ONLY ever fires
// from app.js, never from planner.js).
const POOL_FIXTURE = { pool: 'insider-test-usdc-pool', project: 'aave', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 50_000_000, apyBase: 3.5, apyReward: 0 };
const POOLS_RESPONSE = JSON.stringify({ status: 'success', data: [POOL_FIXTURE] });
// Forces the snapshot-first loader (app.js ~1138) to decline on staleness
// regardless of the real repo's committed data/pools-snapshot-meta.json age,
// so every run in this file deterministically falls through to the live
// https://yields.llama.fi/pools fetch fixtured above — same pattern
// test_search.js already established.
const STALE_SNAPSHOT_META = '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}';

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

// Same poll-and-patch shape as test_analytics_src_attribution.js:
// spec 096's production-host gate makes Analytics.track() return before ever
// calling mixpanel.track() when location.hostname is localhost; neutralising
// restores the real production path into the same window.mixpanel stub
// queue every assertion below reads.
async function neutralizeHostGate(target) {
  await target.addInitScript(() => {
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.isProductionHost) { setTimeout(install, 0); return; }
      Analytics.isProductionHost = () => true;
    };
    install();
  });
}

function trackCalls(page) {
  return page.evaluate(() => (window.mixpanel || []).filter((c) => Array.isArray(c) && c[0] === 'track'));
}

// Polls the mixpanel stub queue until `predicate` is satisfied or `timeoutMs`
// elapses, returning whatever was last read (never throws on timeout — the
// caller decides what an empty/incomplete result means).
async function pollTrackCalls(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let calls = [];
  for (;;) {
    calls = await trackCalls(page);
    if (predicate(calls) || Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  return calls;
}

// Route the analytics-mode fixtures (live pools fetch + forced-stale
// snapshot) onto a page/context so `/?token=USDC...` renders `.pool-card`.
async function routeAnalyticsFixtures(target) {
  await target.route('**/data/pools-snapshot*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: STALE_SNAPSHOT_META }));
  await target.route('https://yields.llama.fi/pools', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: POOLS_RESPONSE
  }));
}

async function main() {
  // --- Population: parse the PRODUCT SOURCE at test time for every event name
  // that can reach Analytics.track, rather than a hand-picked list. Matches both
  // `this.track('<name>'` (every trackX helper inside analytics.js) and
  // `Analytics.track('<name>'` (bare call sites — page_focus/page_blur at the
  // bottom of analytics.js, and garden_reentry_shown/garden_reentry_clicked in
  // landing.js).
  //
  // The FILE SET is derived at test time too, not hardcoded: analytics.js is not
  // the only emitter, and a population parsed from it alone is a guard narrower
  // than the class it guards (RAZOR / item 212's mirror rule) — it would raise a
  // spurious "regex drift" failure the first time a scenario exercises a caller
  // that emits from its own file. Scanning every product .js in the repo root
  // makes the set self-maintaining: a new emitter file is picked up with no edit
  // here. Widening the accepted population can only ever suppress a false
  // failure, never cause one; the size + must-contain self-checks below are what
  // actually guard against the regex drifting. ---
  const SOURCE_FILES = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.js') && !f.startsWith('test_') && !f.includes('.min.') && !f.includes('.compiled.'))
    .filter((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return /[A-Za-z.]*track\('[a-zA-Z_]+'/.test(src);
    });
  const EVENT_POPULATION = new Set(
    SOURCE_FILES.flatMap((f) => Array.from(
      fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/[A-Za-z.]*track\('([a-zA-Z_]+)'/g)
    ).map((m) => m[1]))
  );
  if (!SOURCE_FILES.includes('analytics.js') || !SOURCE_FILES.includes('landing.js')) {
    throw new Error(`emitter-file discovery drifted — expected at least analytics.js + landing.js, got ${JSON.stringify(SOURCE_FILES)}`);
  }
  if (EVENT_POPULATION.size < 20) {
    throw new Error(`population parse looks broken — only found ${EVENT_POPULATION.size} event names in ${SOURCE_FILES.join(', ')}: ${JSON.stringify([...EVENT_POPULATION])}`);
  }
  if (!EVENT_POPULATION.has('page_view') || !EVENT_POPULATION.has('waitlist_opened') || !EVENT_POPULATION.has('session_start')) {
    throw new Error(`population parse missed an expected event name — regex likely drifted from the call-site shape in ${SOURCE_FILES.join(', ')} (all three expected names are emitted by analytics.js)`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const observedEventNames = new Set(); // aggregated across every scenario below, for the final population-coverage assertion

  // Asserts every call in `calls` (a) has an eventName drawn from the parsed
  // population and (b) matches `expectInsider` exactly: `true` stamps
  // `insider: true`; `false` means the `insider` KEY IS ABSENT (never
  // `insider: false` — spec 252's explicit ban on stamping the negative).
  function assertPopulationInsider(calls, expectInsider, label) {
    if (!calls.length) throw new Error(`${label}: no track calls observed at all`);
    for (const c of calls) {
      const eventName = c[1];
      const props = c[2] || {};
      if (!EVENT_POPULATION.has(eventName)) {
        throw new Error(`${label}: observed event "${eventName}" is not in the population parsed from ${SOURCE_FILES.join(', ')} — regex/test drift`);
      }
      observedEventNames.add(eventName);
      if (expectInsider) {
        if (props.insider !== true) {
          throw new Error(`${label}: event "${eventName}" expected insider===true, got ${JSON.stringify(props.insider)}`);
        }
      } else {
        if ('insider' in props) {
          throw new Error(`${label}: event "${eventName}" expected NO insider key (absence, not false), got ${JSON.stringify(props.insider)}`);
        }
      }
    }
  }

  try {
    // ================================================================
    // A. Direct marking on the PLANNER-MODE router path (`/plan.html`,
    //    which bare `/` also routes to per home.html's IA router).
    // ================================================================
    await test('planner-mode /plan.html?insider=1: every tracked event carries insider=true, including waitlist_opened (never fires from app.js)', async () => {
      const context = await browser.newContext();
      await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());
      await neutralizeHostGate(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));

      await page.goto(`http://localhost:${PORT}/plan.html?insider=1&waitlist=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 10000 });
      // waitlist_opened fires from a React mount effect, well after the
      // context's neutralizeHostGate init-script patch has landed — the
      // reliable anchor here. session_start fires off the page's own
      // 'load' listener, which sometimes wins a genuine race against that
      // same init-script patch (patch not yet applied when startSession()
      // runs → isProductionHost() still reads the real (localhost) host →
      // that ONE session_start call is silently gate-suppressed, same as a
      // real non-production visit would be) — this is a harness artifact of
      // the patch-after-the-fact neutralisation this repo's existing
      // analytics tests already use, not a defect in analytics.js itself,
      // so session_start is asserted opportunistically (checked for
      // insider-correctness IF observed) rather than required.
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'waitlist_opened'), 10000);

      const names = new Set(calls.map((c) => c[1]));
      if (!names.has('waitlist_opened')) throw new Error('expected waitlist_opened among observed events, got: ' + JSON.stringify([...names]));

      assertPopulationInsider(calls, true, 'planner-mode marked');
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
      await context.close();
    });

    // ================================================================
    // B. Direct marking on the ANALYTICS-MODE router path
    //    (`/?token=USDC`), which is where trackPageView actually lives.
    // ================================================================
    await test('analytics-mode /?token=USDC&insider=1: every tracked event carries insider=true, including page_view (only ever fires from app.js)', async () => {
      const context = await browser.newContext();
      await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());
      await neutralizeHostGate(context);
      await routeAnalyticsFixtures(context);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push('pageerror: ' + err.message));

      await page.goto(`http://localhost:${PORT}/?token=USDC&insider=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'page_view'), 15000);

      const names = new Set(calls.map((c) => c[1]));
      if (!names.has('page_view')) throw new Error('expected page_view among observed events, got: ' + JSON.stringify([...names]));

      assertPopulationInsider(calls, true, 'analytics-mode marked');
      if (pageErrors.length) throw new Error('page errors:\n' + pageErrors.join('\n'));
      await context.close();
    });

    // ================================================================
    // C. Unmarked visitor, PLANNER-MODE path: absence, not `false`.
    // ================================================================
    await test('planner-mode /plan.html (no insider param): no event carries an insider key', async () => {
      const context = await browser.newContext();
      await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());
      await neutralizeHostGate(context);
      const page = await context.newPage();

      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 10000 });
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'waitlist_opened'), 8000);

      assertPopulationInsider(calls, false, 'planner-mode unmarked');
      await context.close();
    });

    // ================================================================
    // D. Unmarked visitor, ANALYTICS-MODE path: absence, not `false`.
    // ================================================================
    await test('analytics-mode /?token=USDC (no insider param): no event carries an insider key', async () => {
      const context = await browser.newContext();
      await context.route(url => !url.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());
      await neutralizeHostGate(context);
      await routeAnalyticsFixtures(context);
      const page = await context.newPage();

      await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'page_view'), 15000);

      assertPopulationInsider(calls, false, 'analytics-mode unmarked');
      await context.close();
    });

    // ================================================================
    // E. Persistence: mark once via a URL param, then revisit BOTH
    //    router paths with NO insider param in the URL at all — proves
    //    the stamp survives via localStorage, not via URL re-application.
    //    (This is also the leg the non-vacuity proof breaks in isolation.)
    // ================================================================
    let persistenceContext;
    await test('persistence: mark via planner ?insider=1, then reload the SAME planner URL without the param — still insider=true', async () => {
      persistenceContext = await browser.newContext();
      await persistenceContext.route(url => !url.href.startsWith(`http://localhost:${PORT}`), (route) => route.abort());
      await neutralizeHostGate(persistenceContext);
      await routeAnalyticsFixtures(persistenceContext);
      const page = await persistenceContext.newPage();

      // Mark.
      await page.goto(`http://localhost:${PORT}/plan.html?insider=1&waitlist=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 10000 });
      await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'waitlist_opened'), 8000);

      // "Reload" — revisit the same planner URL, but with NO ?insider= param,
      // so the ONLY way this can be insider=true is a persisted localStorage read.
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 10000 });
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'waitlist_opened'), 8000);

      assertPopulationInsider(calls, true, 'persistence across reload (planner)');
    });

    await test('persistence: same marked device navigates to the ANALYTICS-mode path with no insider param — still insider=true', async () => {
      const page = await persistenceContext.newPage();
      await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'page_view'), 15000);

      assertPopulationInsider(calls, true, 'persistence across router-mode navigation (planner -> analytics)');
      await page.close();
    });

    // ================================================================
    // F. ?insider=0 clears the persisted flag; the clear itself
    //    persists across a further navigation with no param.
    // ================================================================
    await test('?insider=0 on the analytics-mode path clears a previously-marked device', async () => {
      const page = await persistenceContext.newPage();
      await page.goto(`http://localhost:${PORT}/?token=USDC&insider=0`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.pool-card', { timeout: 15000 });
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'page_view'), 15000);

      assertPopulationInsider(calls, false, 'cleared via insider=0 (analytics-mode)');
      await page.close();
    });

    await test('the clear persists: revisiting the planner path with no insider param stays absent', async () => {
      const page = await persistenceContext.newPage();
      await page.goto(`http://localhost:${PORT}/plan.html?waitlist=1`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 10000 });
      const calls = await pollTrackCalls(page, (cs) => cs.some((c) => c[1] === 'waitlist_opened'), 8000);

      assertPopulationInsider(calls, false, 'clear persists across navigation (analytics -> planner)');
      await page.close();
      await persistenceContext.close();
    });

    // ================================================================
    // G. Population coverage sanity: the events actually exercised above
    //    span BOTH router paths and are not limited to page_view — a
    //    check that only ever saw page_view would be blind to exactly
    //    the planner-bound path spec 252 exists to measure.
    // ================================================================
    await test('population coverage: observed events span both router paths, not just page_view', async () => {
      if (!observedEventNames.has('page_view')) throw new Error('expected page_view among all observed events across every scenario');
      if (!observedEventNames.has('waitlist_opened')) throw new Error('expected waitlist_opened (planner-only) among all observed events — a page_view-only check would be blind to the planner path');
      if (observedEventNames.size < 2) throw new Error('expected >=2 distinct event names observed across the whole suite, got: ' + JSON.stringify([...observedEventNames]));
      // session_start is opportunistic (see the planner-mode marking test's
      // comment) — logged for visibility, not required, since it sometimes
      // loses a genuine load-vs-init-script-patch race in this harness.
      console.log(`    (session_start observed: ${observedEventNames.has('session_start')})`);
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_analytics_insider.js: ${passed}/9 tests passed`);
  console.log(`  population parsed from ${SOURCE_FILES.join(', ')}: ${EVENT_POPULATION.size} event names`);
  console.log(`  events observed across all scenarios: ${JSON.stringify([...observedEventNames].sort())}`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('test_analytics_insider crashed: ' + err.message);
  process.exit(1);
});
