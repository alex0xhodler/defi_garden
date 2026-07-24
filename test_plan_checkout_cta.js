/* Rendered Playwright test for backlog 139 — bet A: archetype-aware planner
   endings (docs/strategy-2026-07-23-pretraffic-bets.md §3). Every archetype's
   Bloom checkout panel used to show ONE primary CTA: the card waitlist, with
   copy that only makes sense for SUBSCRIPTION ("your garden's yield pays
   your subscription automatically through a simple card"). For a
   retirement/iPhone/sneakers plan that's goal-incoherent — this test proves,
   against REAL renders, that:

   (1) GROWTH and TARGET plans show a pool-first primary CTA ("Start growing
       on <project> →") linking to /?pool=<id> of the plan's top curated
       pool, with the waitlist demoted to a secondary text link;
   (2) clicking that primary CTA fires pool_click(source=plan_checkout) with
       non-empty pool segmentation props + the plan's archetype, and does
       NOT navigate away (spec: instrumentation is mandatory);
   (3) the demoted waitlist secondary still opens the modal and still fires
       waitlist_opened (existing tracking preserved);
   (4) SUBSCRIPTION is UNCHANGED — waitlist stays primary, no pool CTA, no
       secondary link (acceptance criterion: zero behavioral change);
   (5) the waitlist modal copy branches by archetype — growth/target text
       never mentions "subscription"-payment framing, subscription keeps its
       existing copy;
   (6) edge case: when no pool is curated yet, GROWTH/TARGET fall back to the
       waitlist-primary layout (never a dead pool link).

   Reaches Bloom via a share-plan URL (?goal=&pace=&monthly=&years=), which
   planner.js fast-forwards straight to the bloom step once goal/persona/
   (years|monthly|capital) are present (see planner.js "Shared plan
   fast-forward to bloom") — no need to drive the conversational flow.

   Spy point + fixture-routing pattern: same as test_northstar_cta_fires.js
   (the freshest convention in this repo) — wrap Analytics.track, force the
   live pools path by 404ing the snapshot meta, fulfill yields.llama.fi with
   a fixture pool that clears the 'stable' persona's trust rails (stableOnly,
   $50M TVL floor). plan.html self-hosts React (no unpkg interception
   needed); icons.llamao.fi is aborted like the sibling test.

   Run: node test_plan_checkout_cta.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8851; // distinct from other test_* files (8791-8850 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// One fixture pool clearing the 'stable' persona's trust rails (stableOnly
// symbol, TVL >= $50M floor, lending — a preferred type) so it's guaranteed
// to be curated[0] regardless of which archetype/persona requests it.
const TOP_POOL = {
  pool: 'usdc-ethereum-aave-checkout-test',
  project: 'aave-v3', symbol: 'USDC', chain: 'Ethereum',
  tvlUsd: 60_000_000, apyBase: 4.5, apyReward: 0
};
const FIXTURE = JSON.stringify({ status: 'success', data: [TOP_POOL] });
const EMPTY_FIXTURE = JSON.stringify({ status: 'success', data: [] });

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

// Same spy technique as test_northstar_cta_fires.js: wrap Analytics.track
// (the pre-mixpanel choke point) so every event's fully-enriched payload is
// observable. Also intercepts the checkout CTA at capture phase to
// preventDefault real navigation (the pool-primary CTA is a real <a href>)
// without stopPropagation, so React's own onClick (and the trackPoolClick
// call inside it) still fires normally.
async function installSpy(page) {
  await page.addInitScript(() => {
    window.__events = [];
    document.addEventListener('click', (e) => {
      if (e.target.closest('.gp-checkout-cta')) e.preventDefault();
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

async function resetEvents(page) {
  await page.evaluate(() => { window.__events = []; });
}

async function gotoPlan(page, query) {
  await page.goto(`http://localhost:${PORT}/plan.html?${query}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector('.gp-checkout-panel', { timeout: 15000 });
}

// Waits for the checkout CTA to settle into pool-primary shape (an <a> with
// an href) once the async pools fetch resolves and curated[] populates —
// on first paint (before the fetch resolves) it's still the waitlist
// fallback, which is correct behavior (spec's own empty-pool-list case).
async function waitForPoolPrimary(page, timeoutMs) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.gp-checkout-cta');
    return !!(el && el.tagName === 'A' && el.getAttribute('href'));
  }, { timeout: timeoutMs });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    async function newPage(fixtureBody) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
      await page.route('https://icons.llamao.fi/**', (r) => r.abort());
      await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
      await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: fixtureBody }));
      await installSpy(page);
      return { context, page, pageErrors };
    }

    // ---------------------------------------------------------------
    // GROWTH — retirement, monthly path, 10y horizon
    // ---------------------------------------------------------------
    {
      const { context, page } = await newPage(FIXTURE);
      await test('GROWTH: Bloom shows the pool-first primary CTA with a real /?pool= href matching the top curated pool', async () => {
        await gotoPlan(page, 'goal=retirement&pace=stable&monthly=500&years=10');
        await waitForPoolPrimary(page, 10000);
        const cta = page.locator('.gp-checkout-cta');
        const tag = await cta.evaluate((el) => el.tagName);
        if (tag !== 'A') throw new Error('expected primary CTA to be an <a>, got ' + tag);
        const href = await cta.getAttribute('href');
        const expected = '/?pool=' + encodeURIComponent(TOP_POOL.pool);
        if (href !== expected) throw new Error(`expected href="${expected}", got "${href}"`);
        const text = (await cta.textContent()) || '';
        if (!text.includes(TOP_POOL.project)) throw new Error(`expected CTA text to include project "${TOP_POOL.project}", got "${text}"`);
      });

      await test('GROWTH: waitlist renders as a demoted secondary text link (not the primary button)', async () => {
        const secondary = page.locator('.gp-checkout-waitlist-secondary');
        if ((await secondary.count()) !== 1) throw new Error('expected exactly one demoted waitlist secondary link');
        const primaryText = (await page.locator('.gp-checkout-cta').textContent()) || '';
        if (/waitlist/i.test(primaryText)) throw new Error('primary CTA still mentions the waitlist: ' + primaryText);
      });

      await test('GROWTH: clicking the primary CTA fires pool_click(source=plan_checkout, archetype=growth) with segmentation props, no navigation', async () => {
        await resetEvents(page);
        await page.locator('.gp-checkout-cta').click();
        const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'plan_checkout'), 5000);
        const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'plan_checkout');
        if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=plan_checkout), got ${JSON.stringify(clicks)}`);
        const d = clicks[0].eventData;
        if (!d.pool_id || !d.pool_project || !d.pool_chain || !d.total_apy) throw new Error('missing segmentation props: ' + JSON.stringify(d));
        if (d.archetype !== 'growth') throw new Error('expected archetype=growth, got ' + JSON.stringify(d.archetype));
        if (page.url().includes('?pool=')) throw new Error('primary CTA click navigated the test page away — preventDefault did not hold');
      });

      await test('GROWTH: waitlist secondary still opens the modal and fires waitlist_opened(archetype=growth)', async () => {
        await resetEvents(page);
        await page.locator('.gp-checkout-waitlist-secondary').click();
        await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
        const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'waitlist_opened'), 5000);
        const opened = events.find((e) => e.eventName === 'waitlist_opened');
        if (!opened) throw new Error('waitlist_opened did not fire from the secondary link');
        if (opened.eventData.archetype !== 'growth') throw new Error('expected archetype=growth on waitlist_opened, got ' + JSON.stringify(opened.eventData));
      });

      await test('GROWTH: waitlist modal copy is the honest early-access framing — no "subscription"-payment phrasing', async () => {
        const title = (await page.locator('.gp-waitlist-title').textContent()) || '';
        const benefits = (await page.locator('.gp-waitlist-benefits').textContent()) || '';
        if (/subscription/i.test(title) || /subscription/i.test(benefits)) {
          throw new Error(`GROWTH modal copy still mentions "subscription": title="${title}" benefits="${benefits}"`);
        }
        if (!benefits || benefits.length < 10) throw new Error('expected non-empty early-access benefits copy, got: ' + JSON.stringify(benefits));
      });

      await context.close();
    }

    // ---------------------------------------------------------------
    // TARGET — iPhone, monthly path
    // ---------------------------------------------------------------
    {
      const { context, page } = await newPage(FIXTURE);
      await test('TARGET: Bloom shows the pool-first primary CTA with a real /?pool= href matching the top curated pool', async () => {
        await gotoPlan(page, 'goal=iphone&pace=stable&monthly=200');
        await waitForPoolPrimary(page, 10000);
        const cta = page.locator('.gp-checkout-cta');
        const tag = await cta.evaluate((el) => el.tagName);
        if (tag !== 'A') throw new Error('expected primary CTA to be an <a>, got ' + tag);
        const href = await cta.getAttribute('href');
        const expected = '/?pool=' + encodeURIComponent(TOP_POOL.pool);
        if (href !== expected) throw new Error(`expected href="${expected}", got "${href}"`);
      });

      await test('TARGET: waitlist renders as a demoted secondary text link', async () => {
        const secondary = page.locator('.gp-checkout-waitlist-secondary');
        if ((await secondary.count()) !== 1) throw new Error('expected exactly one demoted waitlist secondary link');
      });

      await test('TARGET: clicking the primary CTA fires pool_click(source=plan_checkout, archetype=target) with segmentation props, no navigation', async () => {
        await resetEvents(page);
        await page.locator('.gp-checkout-cta').click();
        const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'pool_click' && e.eventData.source === 'plan_checkout'), 5000);
        const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'plan_checkout');
        if (clicks.length !== 1) throw new Error(`expected exactly one pool_click(source=plan_checkout), got ${JSON.stringify(clicks)}`);
        const d = clicks[0].eventData;
        if (!d.pool_id || !d.pool_project || !d.pool_chain || !d.total_apy) throw new Error('missing segmentation props: ' + JSON.stringify(d));
        if (d.archetype !== 'target') throw new Error('expected archetype=target, got ' + JSON.stringify(d.archetype));
        if (page.url().includes('?pool=')) throw new Error('primary CTA click navigated the test page away');
      });

      await test('TARGET: waitlist modal copy is the honest early-access framing — no "subscription"-payment phrasing', async () => {
        await page.locator('.gp-checkout-waitlist-secondary').click();
        await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
        const title = (await page.locator('.gp-waitlist-title').textContent()) || '';
        const benefits = (await page.locator('.gp-waitlist-benefits').textContent()) || '';
        if (/subscription/i.test(title) || /subscription/i.test(benefits)) {
          throw new Error(`TARGET modal copy still mentions "subscription": title="${title}" benefits="${benefits}"`);
        }
        // Trust-bug guard (found during this item, gated shut here): the
        // subscription-only "garden already covers X — a card funded by
        // .../mo of yield" line must never render for a TARGET goal, since
        // mixStats() misreads a TARGET goal's one-time price as a monthly
        // subscription cost (item price, not $/mo) — see 139-notes.md.
        const gardenLine = await page.locator('.gp-waitlist-garden-line').count();
        if (gardenLine !== 0) throw new Error('TARGET modal must not render the subscription-mix "garden already covers" line');
      });

      await context.close();
    }

    // ---------------------------------------------------------------
    // SUBSCRIPTION — Claude Pro, capital path (unchanged behavior — pinned)
    // ---------------------------------------------------------------
    {
      const { context, page } = await newPage(FIXTURE);
      await test('SUBSCRIPTION: waitlist STAYS the primary CTA (button, not a pool link) — zero behavioral change', async () => {
        await gotoPlan(page, 'goal=claude&pace=stable&monthly=50');
        // Give the pools fetch time to resolve so this isn't just an
        // unresolved-fetch false negative (mirrors the GROWTH/TARGET wait).
        await page.waitForTimeout(1500);
        const cta = page.locator('.gp-checkout-cta');
        const tag = await cta.evaluate((el) => el.tagName);
        if (tag !== 'BUTTON') throw new Error('expected primary CTA to stay a <button>, got ' + tag);
        const text = (await cta.textContent()) || '';
        if (!/waitlist/i.test(text)) throw new Error('expected primary CTA text to mention the waitlist, got: ' + text);
      });

      await test('SUBSCRIPTION: no demoted secondary link renders (nothing to demote)', async () => {
        const secondary = await page.locator('.gp-checkout-waitlist-secondary').count();
        if (secondary !== 0) throw new Error('expected zero .gp-checkout-waitlist-secondary elements for SUBSCRIPTION');
      });

      await test('SUBSCRIPTION: clicking the primary CTA opens the waitlist modal with the EXISTING card copy (unchanged)', async () => {
        await resetEvents(page);
        await page.locator('.gp-checkout-cta').click();
        await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
        const events = await pollEvents(page, (evs) => evs.some((e) => e.eventName === 'waitlist_opened'), 5000);
        const opened = events.find((e) => e.eventName === 'waitlist_opened');
        if (!opened) throw new Error('waitlist_opened did not fire');
        if (opened.eventData.archetype !== 'subscription') throw new Error('expected archetype=subscription, got ' + JSON.stringify(opened.eventData));
        const benefits = (await page.locator('.gp-waitlist-benefits').textContent()) || '';
        if (!/subscription/i.test(benefits)) throw new Error('expected SUBSCRIPTION modal copy to keep mentioning "subscription", got: ' + benefits);
        const clicks = events.filter((e) => e.eventName === 'pool_click' && e.eventData.source === 'plan_checkout');
        if (clicks.length !== 0) throw new Error('SUBSCRIPTION must never fire pool_click(source=plan_checkout)');
      });

      await context.close();
    }

    // ---------------------------------------------------------------
    // Edge case — empty pool list falls back to the waitlist-primary layout
    // ---------------------------------------------------------------
    {
      const { context, page } = await newPage(EMPTY_FIXTURE);
      await test('GROWTH with no curated pools: falls back to the waitlist-primary layout (never a dead pool link)', async () => {
        await gotoPlan(page, 'goal=retirement&pace=stable&monthly=500&years=10');
        // No pool will ever arrive (empty fixture) — give the fetch a beat
        // to resolve and settle, then assert the fallback held.
        await page.waitForTimeout(1500);
        const cta = page.locator('.gp-checkout-cta');
        const tag = await cta.evaluate((el) => el.tagName);
        if (tag !== 'BUTTON') throw new Error('expected fallback primary CTA to be a <button> (waitlist), got ' + tag);
        const secondary = await page.locator('.gp-checkout-waitlist-secondary').count();
        if (secondary !== 0) throw new Error('expected no demoted secondary link when falling back to waitlist-primary');
      });
      await context.close();
    }

    console.log(`test_plan_checkout_cta.js: ${passed}/${total} tests passed`);
    if (process.exitCode) process.exit(process.exitCode);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
