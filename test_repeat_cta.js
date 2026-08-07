/* Rendered Playwright test for backlog 125 — repeat CTA block, now inside the
   earnings block (spec 210 moved it there from the page bottom).

   210 rationale for what changed here (see specs/210-notes.md for the full
   line-by-line justification): the repeat CTA used to sit AFTER Pool
   Information ("can convert without scrolling back up"). 210 relocates it to
   the END of the merged calculator-compact "your garden" earnings block —
   the moment the user has parameterised the projection with their own
   amount, which 210's evidence identified as the actual intent peak. It is
   now BEFORE `.pool-info-section` in DOM order, and its `ctaPlacement`
   changed from `'repeat_footer'` to `'earnings_block'` so hero-vs-earnings-
   block click share stays readable from the existing event (load-bearing
   per 210's acceptance criteria — keeping the old string would silently
   un-measure the move).

   This test proves, against a REAL chromium render of a `?pool=<id>` landing
   (not source reading):
   (1) exactly TWO `.cta-button-primary` render (hero + repeat), the repeat
       one appears BEFORE `.pool-info-section` in DOM order (inside the
       earnings block), and NO CTA renders after `.pool-info-section`;
   (2) clicking the REPEAT "Garden this pool" fires exactly one
       `pool_click{source=garden_cta, ctaPlacement=earnings_block}` with
       non-empty segmentation props;
   (3) clicking the REPEAT "Start Earning on <protocol>" fires exactly one
       `pool_click{source=protocol_link, ctaPlacement=earnings_block}`, no nav;
   (4) the HERO "Garden this pool" still fires
       `pool_click{source=garden_cta, ctaPlacement=hero}` (no regression);
   (5) no unexpected page/console errors.

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
// their native browser action (the "Garden this pool" CTA is a real <a href>
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
      if (e.target.closest('.cta-button-primary, .cta-button-protocol')) e.preventDefault();
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

    // (1) exactly TWO .cta-button-primary; the 2nd is BEFORE .pool-info-section
    // (210: relocated inside the earnings block), and NO CTA renders after
    // .pool-info-section (the page must not end on a verbatim repeat).
    await test('exactly 2 .cta-button-primary render; repeat one is BEFORE .pool-info-section (earnings block), none after', async () => {
      const count = await page.locator('.cta-button-primary').count();
      if (count !== 2) throw new Error(`expected exactly 2 .cta-button-primary (hero + repeat), got ${count}`);
      const result = await page.evaluate(() => {
        const primaries = Array.from(document.querySelectorAll('.cta-button-primary'));
        // The Pool Information collapsible section (the LAST .pool-info-section
        // — there is also a hero left-column .pool-info-section). Use the last one.
        const infoSections = Array.from(document.querySelectorAll('.pool-info-section'));
        const poolInfo = infoSections[infoSections.length - 1];
        const repeat = primaries[1];
        // Node.DOCUMENT_POSITION_FOLLOWING (4): repeat is followed by poolInfo,
        // i.e. repeat comes BEFORE poolInfo in DOM order.
        const repeatBeforeInfo = !!(repeat.compareDocumentPosition(poolInfo) & Node.DOCUMENT_POSITION_FOLLOWING);
        // No .cta-button-primary/.cta-button-protocol may render after poolInfo.
        const anyCtaAfterInfo = Array.from(document.querySelectorAll('.cta-button-primary, .cta-button-protocol'))
          .some((cta) => !!(poolInfo.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING));
        return { repeatBeforeInfo, anyCtaAfterInfo };
      });
      if (!result.repeatBeforeInfo) throw new Error('the 2nd (repeat) .cta-button-primary is NOT before .pool-info-section in DOM order');
      if (result.anyCtaAfterInfo) throw new Error('a CTA renders AFTER .pool-info-section — the page must not end on a verbatim repeat (210)');
    });

    // (2) repeat garden_cta fires pool_click{source=garden_cta, ctaPlacement=earnings_block}
    await test('repeat "Garden this pool" fires pool_click(source=garden_cta, ctaPlacement=earnings_block) with segmentation props', async () => {
      await resetEvents(page);
      const repeat = page.locator('.cta-button-primary').nth(1);
      await repeat.scrollIntoViewIfNeeded();
      await repeat.click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=garden_cta), got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.ctaPlacement !== 'earnings_block') throw new Error(`expected ctaPlacement=earnings_block, got ${JSON.stringify(clicks[0].eventData)}`);
      assertSegmentationProps(clicks[0].eventData, 'garden_cta', 'repeat garden_cta pool_click');
    });

    // (3) repeat protocol_link fires pool_click{source=protocol_link, ctaPlacement=earnings_block}, no nav
    await test('repeat "Start Earning on <protocol>" fires pool_click(source=protocol_link, ctaPlacement=earnings_block), no navigation', async () => {
      await resetEvents(page);
      const link = page.locator('.cta-button-protocol').nth(1);
      if ((await page.locator('.cta-button-protocol').count()) !== 2) throw new Error('expected exactly 2 .cta-button-protocol (hero + repeat) for a pool with a known protocol URL (lido)');
      await link.scrollIntoViewIfNeeded();
      await link.click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'protocol_link');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=protocol_link), got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.ctaPlacement !== 'earnings_block') throw new Error(`expected ctaPlacement=earnings_block, got ${JSON.stringify(clicks[0].eventData)}`);
      assertSegmentationProps(clicks[0].eventData, 'protocol_link', 'repeat protocol_link pool_click');
      if (page.url().includes('lido.fi')) throw new Error('protocol_link click navigated the test page away — window.open was not intercepted');
    });

    // (4) hero garden_cta still fires pool_click{source=garden_cta, ctaPlacement=hero}
    await test('hero "Garden this pool" fires pool_click(source=garden_cta, ctaPlacement=hero)', async () => {
      await resetEvents(page);
      const hero = page.locator('.cta-button-primary').nth(0);
      await hero.scrollIntoViewIfNeeded();
      await hero.click();
      const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta'), 5000);
      const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'garden_cta');
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=garden_cta), got ${JSON.stringify(clicks)}`);
      if (clicks[0].eventData.ctaPlacement !== 'hero') throw new Error(`expected ctaPlacement=hero, got ${JSON.stringify(clicks[0].eventData)}`);
      assertSegmentationProps(clicks[0].eventData, 'garden_cta', 'hero garden_cta pool_click');
    });

    // (5) no unexpected page/console errors
    await test('no unexpected page/console errors', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_repeat_cta.js: ${passed}/5 tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
