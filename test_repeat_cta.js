/* Rendered Playwright test for backlog 237 — exactly ONE "Garden this pool"
   primary CTA per pool-detail page (supersedes 210/125's two-full-strength-
   CTA pattern; see specs/237.md).

   UX audit F2 found the hero CTA pair rendering TWICE at full visual weight
   (hero + the earnings-block "repeat" — audit C3 confirmed the computed
   style was byte-identical to the hero even after 225 round 3c's "slim
   echo" language, because the repeat kept the `.cta-button-primary` class).
   This test proves, against a REAL chromium render of a `?pool=<id>`
   landing (not source reading):
   (1) exactly ONE `.cta-button-primary` (hero) and ONE `.cta-button-protocol`
       (hero) render on the page — the earnings block's echo is neither;
   (2) exactly ONE `.cta-echo-link` renders (the earnings block's slim
       contextual echo), and it navigates to the SAME planner destination as
       the hero CTA (identical href — both bind the same `gardenThisPoolHref`
       constant in PoolDetail.js);
   (3) clicking the echo fires `pool_click{source=garden_cta,
       ctaPlacement=earnings_block, cta_position=calculator}`;
   (4) the hero still fires `pool_click{source=garden_cta, ctaPlacement=hero,
       cta_position=hero}` (no regression from 237's added `cta_position`);
   (5) non-vacuity: injecting a second `.cta-button-primary` into the live
       DOM turns the count assertion red; removing it turns it green again —
       proves the assertion isn't vacuously true;
   (6) no unexpected page/console errors.

   Same house pattern as test_northstar_cta_fires.js: spy point is
   Analytics.track (the pre-mixpanel choke point), fixture-routed (unpkg
   React/Babel vendored, snapshot 404'd to force the live path), CTAs
   preventDefault'd at capture phase + window.open stubbed so neither CTA
   navigates the test page away.

   Run: node test_repeat_cta.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8819; // distinct from other test_* files (8791-8818 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real pool id from the committed data/pools-snapshot.json (lido stETH on
// Ethereum) — used for the url_direct (`?pool=<id>`) landing. Reused here
// (not read live) so the fixture stays byte-stable regardless of snapshot
// regeneration cadence; the id is verified present in the snapshot below.
const URL_DIRECT_POOL = {
  pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
  project: 'lido', symbol: 'STETH', chain: 'Ethereum',
  tvlUsd: 17_622_166_047, apyBase: 2.163, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [URL_DIRECT_POOL] });

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

// Wraps Analytics.track (the pre-mixpanel choke point every track* helper
// funnels through) so every event's fully-enriched payload is observable.
// addInitScript runs before the page's own deferred scripts AND re-runs on
// every real navigation — call this exactly ONCE per page.
//
// Also intercepts the two CTAs at the document capture phase to preventDefault
// their native browser action (the "Garden this pool" CTAs are real <a href>
// into the planner; a real click would navigate this test page away before
// events can be read back) WITHOUT calling stopPropagation, so React's own
// bubble-phase onClick (and the Analytics.trackPoolClick call inside it) still
// fires. window.open is stubbed so the protocol_link button's external
// navigation is inert too.
async function installTrackSpy(page) {
  await page.addInitScript(() => {
    window.__events = [];
    window.open = () => null;
    document.addEventListener('click', (e) => {
      if (e.target.closest('.cta-button-primary, .cta-button-protocol, .cta-echo-link')) e.preventDefault();
    }, true);
    const install = () => {
      if (typeof Analytics === 'undefined' || !Analytics.track) { setTimeout(install, 0); return; }
      const orig = Analytics.track.bind(Analytics);
      Analytics.track = (eventName, eventData) => {
        window.__events.push({ eventName, eventData });
        return orig(eventName, eventData);
      };
    };
    install();
  });
}

async function resetEvents(page) {
  await page.evaluate(() => { window.__events = []; });
}

async function pollEvents(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let events = [];
  for (;;) {
    events = await page.evaluate(() => window.__events);
    if (predicate(events) || Date.now() > deadline) break;
    await page.waitForTimeout(100);
  }
  return events;
}

// Segmentation props required by the north-star query: pool id, project,
// chain, apy, source — every one non-empty/defined.
function assertSegmentationProps(eventData, expectedSource, label) {
  const checks = {
    pool_id: eventData.pool_id,
    pool_project: eventData.pool_project,
    pool_chain: eventData.pool_chain,
    total_apy: eventData.total_apy,
    source: eventData.source
  };
  for (const [key, val] of Object.entries(checks)) {
    if (val === undefined || val === null || val === '') {
      throw new Error(`${label}: missing/empty segmentation prop "${key}" — got ${JSON.stringify(eventData)}`);
    }
  }
  if (eventData.source !== expectedSource) {
    throw new Error(`${label}: expected source="${expectedSource}", got "${eventData.source}" — ${JSON.stringify(eventData)}`);
  }
}

// The 237 count contract, in-page: exactly one of each CTA class. Thrown as
// an Error (not a bare assert) so the non-vacuity test can catch it.
async function countCtaClasses(page) {
  return page.evaluate(() => ({
    primary: document.querySelectorAll('.cta-button-primary').length,
    protocol: document.querySelectorAll('.cta-button-protocol').length,
    echo: document.querySelectorAll('.cta-echo-link').length
  }));
}

function assertExactlyOneOfEach(counts, label) {
  if (counts.primary !== 1) throw new Error(`${label}: expected exactly 1 .cta-button-primary (hero only), got ${counts.primary}`);
  if (counts.protocol !== 1) throw new Error(`${label}: expected exactly 1 .cta-button-protocol (hero only), got ${counts.protocol}`);
  if (counts.echo !== 1) throw new Error(`${label}: expected exactly 1 .cta-echo-link (calculator echo), got ${counts.echo}`);
}

async function main() {
  // Sanity check: the fixture pool id is real, drawn from the committed
  // snapshot — not invented.
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  const snapshotHit = snapshot.pools.find((p) => p.pool === URL_DIRECT_POOL.pool);
  if (!snapshotHit) throw new Error(`URL_DIRECT_POOL.pool ${URL_DIRECT_POOL.pool} not found in data/pools-snapshot.json — pick a real id`);

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        pageErrors.push('console.error: ' + m.text());
    });

    const nm = path.join(ROOT, 'node_modules');
    for (const [url, lp] of Object.entries({
      'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
    })) {
      await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
    }
    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    await installTrackSpy(page);
    await page.goto(`http://localhost:${PORT}/home.html?pool=${encodeURIComponent(URL_DIRECT_POOL.pool)}`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForSelector('.pool-detail-view', { timeout: 15000 });

    // (1) exactly ONE of each CTA class — the 237 count contract.
    await test('exactly 1 .cta-button-primary + 1 .cta-button-protocol (both hero) + 1 .cta-echo-link (calculator echo)', async () => {
      const counts = await countCtaClasses(page);
      assertExactlyOneOfEach(counts, '237 count contract');
    });

    // (2) the echo navigates to the SAME planner destination as the hero.
    await test('calculator echo href matches hero href exactly (same planner destination)', async () => {
      const [heroHref, echoHref] = await Promise.all([
        page.locator('.cta-button-primary').first().getAttribute('href'),
        page.locator('.cta-echo-link').first().getAttribute('href')
      ]);
      if (!heroHref) throw new Error('hero .cta-button-primary has no href');
      if (heroHref !== echoHref) throw new Error(`hero href "${heroHref}" !== echo href "${echoHref}"`);
    });

    // (3) echo click fires pool_click(source=garden_cta, ctaPlacement=earnings_block, cta_position=calculator)
    await test('calculator echo "Garden this pool" fires pool_click(source=garden_cta, ctaPlacement=earnings_block, cta_position=calculator)', async () => {
      await resetEvents(page);
      const echo = page.locator('.cta-echo-link').first();
      await echo.scrollIntoViewIfNeeded();
      await echo.click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=garden_cta), got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.ctaPlacement !== 'earnings_block') throw new Error(`expected ctaPlacement=earnings_block, got ${JSON.stringify(clicks[0].eventData)}`);
      if (clicks[0].eventData.cta_position !== 'calculator') throw new Error(`expected cta_position=calculator, got ${JSON.stringify(clicks[0].eventData)}`);
      assertSegmentationProps(clicks[0].eventData, 'garden_cta', 'calculator echo garden_cta pool_click');
    });

    // (4) hero garden_cta still fires pool_click(source=garden_cta, ctaPlacement=hero, cta_position=hero)
    await test('hero "Garden this pool" fires pool_click(source=garden_cta, ctaPlacement=hero, cta_position=hero)', async () => {
      await resetEvents(page);
      const hero = page.locator('.cta-button-primary').first();
      await hero.scrollIntoViewIfNeeded();
      await hero.click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=garden_cta), got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.ctaPlacement !== 'hero') throw new Error(`expected ctaPlacement=hero, got ${JSON.stringify(clicks[0].eventData)}`);
      if (clicks[0].eventData.cta_position !== 'hero') throw new Error(`expected cta_position=hero, got ${JSON.stringify(clicks[0].eventData)}`);
      assertSegmentationProps(clicks[0].eventData, 'garden_cta', 'hero garden_cta pool_click');
    });

    // (5) Non-vacuity: prove the count assertion actually distinguishes 1
    // from 2 — inject a second .cta-button-primary into the live DOM, assert
    // RED, remove it, assert GREEN again (byte-identical restore: the clone
    // is appended/removed, no source node is ever touched).
    await test('non-vacuity: injecting a second .cta-button-primary turns the count assertion red, removing it turns it green', async () => {
      const before = await countCtaClasses(page);
      assertExactlyOneOfEach(before, 'non-vacuity baseline');

      await page.evaluate(() => {
        const original = document.querySelector('.cta-button-primary');
        const clone = original.cloneNode(true);
        clone.setAttribute('data-nonvacuity-probe', '1');
        original.parentElement.appendChild(clone);
      });
      const withInjected = await countCtaClasses(page);
      let wentRed = false;
      try { assertExactlyOneOfEach(withInjected, 'with injected duplicate'); }
      catch (e) { wentRed = true; }
      if (!wentRed) throw new Error(`injecting a 2nd .cta-button-primary did NOT turn the count assertion red — counts: ${JSON.stringify(withInjected)}`);

      await page.evaluate(() => {
        document.querySelector('[data-nonvacuity-probe="1"]').remove();
      });
      const after = await countCtaClasses(page);
      assertExactlyOneOfEach(after, 'after restore');
    });

    // (6) no unexpected page/console errors
    await test('no unexpected page/console errors', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_repeat_cta.js: ${passed}/6 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
