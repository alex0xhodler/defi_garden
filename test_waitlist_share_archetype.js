/* Playwright + Node behavior gate for spec 146: the post-waitlist share path
   (doWaitlistShare / doWaitlistDownload) was hardcoded to the SUBSCRIPTION
   archetype's copy for every plan archetype — so a TARGET plan (e.g. iPhone)
   downloaded a card reading "My yield covers iphone — forever" over a
   "$1,100.00/mo covered forever" subline (GOALS.iphone.target, the ONE-TIME
   item price, misread as a monthly figure by mixStats' unguarded GOALS
   fallback), leaked the raw lowercase id instead of the translated label, and
   shipped with NO plan URL attached at all.

   This test asserts, against the REAL rendered plan.html UI (2026-07-11
   standing decision — Playwright, never fixture strings alone):
     AC1 — TARGET "Download card": the canvas strings actually drawn (spied via
           CanvasRenderingContext2D.prototype.fillText, installed before the
           click) are archetype-correct — translated goal label present, no
           raw id, no "/mo covered forever" subscription subline, no
           $1,100-family figure from GOALS.iphone.target read as monthly.
     AC2 — TARGET "Share on X": the intercepted window.open tweet URL's
           decoded `text` is archetype-appropriate, no raw id.
     AC3 — SUBSCRIPTION (goal=claude) path is BYTE-IDENTICAL to the pre-change
           baseline: exact bundle headline + "covered forever" subline on the
           card, exact tweet text.
     AC4 — root cause: window.GardenPlanner.mixStats(['iphone'], 8) no longer
           misreads the one-time item price as a monthly cost;
           mixStats(['claude'], 8) is unchanged.
     AC5 — the waitlist card carries the plan link: after "Download card" the
           plan URL leaves the device (clipboard write, forced by stubbing
           navigator.share away) and contains goal=iphone + the funding params.

   Harness mirrors test_subscription_mix_seed.js / test_share_mix_roundtrip.js:
   local static server, real Chromium, vendored React/Babel + a routed pools
   fixture (browser-originated HTTPS to unpkg.com / yields.llama.fi is BLOCKED
   at the proxy in this sandbox), formspree routed 200 (test_waitlist_funnel.js
   pattern) so the real waitlist step-1 -> step-2 transition is reachable.

   Run: node test_waitlist_share_archetype.js */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8861; // distinct from other test_* files (8791-8860 taken)
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// One stable USDC lending pool clears the `stable` persona rails
// (planner.js PERSONAS.stable: minTvl 50M, stableOnly) — same fixture pool
// test_subscription_mix_seed.js / test_share_mix_roundtrip.js use, apy=8.5%.
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('stable-usdc-eth', 'aave-v3', 'USDC', 'Ethereum', 60_000_000, 8.5)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

let passed = 0;
async function test(name, fn) {
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

async function main() {
  console.log('network: unpkg.com BLOCKED (using local vendored React/Babel), yields.llama.fi BLOCKED (using fixture pool), formspree.io ROUTED 200');

  // --- AC4: root cause, in-process (no browser needed — planner.js exports
  // pure helpers via module.exports when required under Node). ---
  await test('AC4: mixStats(["iphone"]) no longer misreads the one-time item price as a monthly cost; mixStats(["claude"]) unchanged', () => {
    // Fresh require each run isn't necessary (no state), but keep it local/explicit.
    delete require.cache[require.resolve('./planner.js')];
    const gp = require('./planner.js');
    const iphoneStats = gp.mixStats(['iphone'], 8);
    assert.strictEqual(iphoneStats.count, 0, 'iphone count should be 0, got ' + JSON.stringify(iphoneStats));
    assert.strictEqual(iphoneStats.combinedMonthly, 0, 'iphone combinedMonthly should be 0, got ' + JSON.stringify(iphoneStats));
    assert.strictEqual(iphoneStats.neededCapital, 0, 'iphone neededCapital should be 0, got ' + JSON.stringify(iphoneStats));

    const claudeStats = gp.mixStats(['claude'], 8);
    assert.strictEqual(claudeStats.count, 1, 'claude count should stay 1, got ' + JSON.stringify(claudeStats));
    assert.strictEqual(claudeStats.combinedMonthly, 20, 'claude combinedMonthly should stay 20, got ' + JSON.stringify(claudeStats));
  });

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const pageErrors = [];
    const nodeModules = path.join(ROOT, 'node_modules');
    const vendored = {
      'https://unpkg.com/react@18/umd/react.production.min.js':
        path.join(nodeModules, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js':
        path.join(nodeModules, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js':
        path.join(nodeModules, '@babel/standalone/babel.min.js')
    };

    async function routedPage(tag) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      // Spy fillText (observes the ACTUAL rendered card strings), force the
      // clipboard-copy share path (native share stubbed away so behavior is
      // deterministic in headless Chromium), and capture window.open URLs
      // (the "Share on X" tweet intent) — all installed before any app code
      // runs, same pattern as test_share_mix_roundtrip.js / test_repeat_cta.js.
      await ctx.addInitScript(() => {
        window.__fillTextCalls = [];
        const proto = CanvasRenderingContext2D.prototype;
        const origFillText = proto.fillText;
        proto.fillText = function (text) {
          window.__fillTextCalls.push(text);
          return origFillText.apply(this, arguments);
        };
        window.__openCalls = [];
        window.open = function (url) { window.__openCalls.push(url); return null; };
        window.__copiedUrl = null;
        try { Object.defineProperty(navigator, 'share', { get: () => undefined, configurable: true }); } catch (e) {}
        try {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            get: () => ({ writeText: (txt) => { window.__copiedUrl = txt; return Promise.resolve(); } })
          });
        } catch (e) {}
      });
      const pg = await ctx.newPage();
      pg.on('pageerror', (err) => pageErrors.push('pageerror' + tag + ': ' + err.message));
      pg.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const source = (msg.location() && msg.location().url) || '';
        if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
          pageErrors.push('console.error' + tag + ': ' + msg.text() + (source ? ' (' + source + ')' : ''));
        }
      });
      for (const [url, localPath] of Object.entries(vendored)) {
        await pg.route(url, (route) => route.fulfill({
          status: 200, contentType: 'application/javascript', body: fs.readFileSync(localPath)
        }));
      }
      await pg.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
      await pg.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
      }));
      await pg.route('**formspree.io/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      return { ctx, page: pg };
    }

    // Open the waitlist from wherever the page currently is (checkout
    // panel's opener — primary CTA for subscription, since no curated-pool
    // link exists for that archetype; secondary link for target/growth,
    // since the curated pool link is primary there) and submit -> step 2.
    // Split out from navigation so a test can toggle UI state (e.g. the mix)
    // BEFORE opening the waitlist without a reload wiping it.
    async function openWaitlistAndSubmit(page) {
      const opener = page.locator('button.gp-checkout-cta, button.gp-checkout-waitlist-secondary').first();
      await opener.waitFor({ state: 'visible', timeout: 15000 });
      await opener.click();
      await page.waitForSelector('.gp-waitlist-backdrop', { timeout: 5000 });
      await page.locator('.gp-waitlist-email-input').fill('grower@example.com');
      await page.click('.gp-waitlist-submit');
      await page.waitForSelector('.gp-waitlist-next-steps', { timeout: 5000 });
    }

    // Reach the waitlist step-2 (card + tweet actions) for a given goal via
    // the real UI: shared-plan-style URL fast-forwards to bloom (same pattern
    // as test_subscription_mix_seed.js), then openWaitlistAndSubmit.
    async function reachWaitlistStep2(page, goal) {
      const url = `http://localhost:${PORT}/plan.html?goal=${goal}&pace=stable&capital=5000&fm=capital`;
      await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      await openWaitlistAndSubmit(page);
    }

    async function clickDownload(page) {
      await page.evaluate(() => { window.__fillTextCalls = []; window.__copiedUrl = null; });
      const dl = page.locator('.gp-waitlist-action-btn:not(.gp-waitlist-share-primary)');
      await dl.click();
      await page.waitForFunction(() => window.__copiedUrl !== null, { timeout: 5000 });
      return page.evaluate(() => window.__fillTextCalls.join(' | '));
    }

    async function clickShareOnX(page) {
      await page.evaluate(() => { window.__openCalls = []; });
      const shareBtn = page.locator('.gp-waitlist-share-primary');
      await shareBtn.click();
      await page.waitForFunction(() => window.__openCalls.length > 0, { timeout: 5000 });
      const calls = await page.evaluate(() => window.__openCalls);
      return calls[calls.length - 1];
    }

    // ---- TARGET (iphone) ----
    const tgt = await routedPage('(target)');
    let targetCardText, targetTweetText;
    await test('AC1: TARGET (iphone) download card is archetype-correct — translated label, no raw id, no subscription "/mo covered forever" subline, no $1,100-family monthly figure', async () => {
      await reachWaitlistStep2(tgt.page, 'iphone');
      targetCardText = await clickDownload(tgt.page);
      if (targetCardText.indexOf('iPhone') === -1) {
        throw new Error('expected translated goal label "iPhone" in drawn card strings, got: ' + targetCardText);
      }
      if (targetCardText.indexOf('iphone') !== -1) {
        throw new Error('raw lowercase id "iphone" leaked into drawn card strings: ' + targetCardText);
      }
      if (targetCardText.indexOf('covered forever') !== -1) {
        throw new Error('subscription-only "covered forever" subline leaked onto a TARGET card: ' + targetCardText);
      }
      if (targetCardText.indexOf('1,100') !== -1) {
        throw new Error('GOALS.iphone.target ($1,100 one-time price) leaked in as a monthly figure: ' + targetCardText);
      }
    });

    await test('AC2: TARGET (iphone) "Share on X" tweet text is archetype-appropriate, no raw id', async () => {
      const tweetUrl = await clickShareOnX(tgt.page);
      targetTweetText = decodeURIComponent(new URL(tweetUrl).searchParams.get('text') || '');
      if (targetTweetText.indexOf('iPhone') === -1) {
        throw new Error('expected translated goal label "iPhone" in tweet text, got: ' + targetTweetText);
      }
      if (targetTweetText.indexOf('iphone') !== -1) {
        throw new Error('raw lowercase id "iphone" leaked into tweet text: ' + targetTweetText);
      }
      if (targetTweetText.indexOf('1,100') !== -1) {
        throw new Error('GOALS.iphone.target leaked as a monthly figure into tweet text: ' + targetTweetText);
      }
    });

    await test('AC5: TARGET (iphone) download card carries the plan link (clipboard) with goal + funding params', async () => {
      const copiedUrl = await tgt.page.evaluate(() => window.__copiedUrl);
      if (!copiedUrl) throw new Error('expected a plan URL to leave the device (clipboard write) — got null');
      const u = new URL(copiedUrl);
      if (u.searchParams.get('goal') !== 'iphone') {
        throw new Error('expected goal=iphone in the attached plan URL, got: ' + copiedUrl);
      }
      if (u.searchParams.get('capital') !== '5000' || u.searchParams.get('fm') !== 'capital') {
        throw new Error('expected the funding params (capital=5000&fm=capital) in the attached plan URL, got: ' + copiedUrl);
      }
    });
    await tgt.ctx.close();

    // ---- SUBSCRIPTION (claude) — must stay BYTE-IDENTICAL to pre-change baseline ----
    const sub = await routedPage('(subscription)');
    await test('AC3: SUBSCRIPTION (claude) download card + tweet are byte-identical to the pre-change baseline', async () => {
      await reachWaitlistStep2(sub.page, 'claude');
      const cardText = await clickDownload(sub.page);
      // The headline ("🌱 My yield covers Claude Pro — forever") is wider
      // than the card and wraps to two fillText calls (canvas measureText-
      // driven, same for pre/post — this is renderShareImage's own wrap
      // logic, unrelated to the archetype-copy fix), so assert its two
      // halves rather than one un-wrapped literal.
      const expectedHeadlineHalf1 = '🌱 My yield covers';
      const expectedHeadlineHalf2 = 'Claude Pro — forever';
      const expectedSubline = '≈$2,900 working at 8.5% · $20/mo covered forever';
      if (cardText.indexOf(expectedHeadlineHalf1) === -1 || cardText.indexOf(expectedHeadlineHalf2) === -1) {
        throw new Error('expected baseline bundle headline "🌱 My yield covers Claude Pro — forever" (wrapped) in drawn card strings, got: ' + cardText);
      }
      if (cardText.indexOf(expectedSubline) === -1) {
        throw new Error('expected baseline "covered forever" subline "' + expectedSubline + '" in drawn card strings, got: ' + cardText);
      }

      const tweetUrl = await clickShareOnX(sub.page);
      const tweetText = decodeURIComponent(new URL(tweetUrl).searchParams.get('text') || '');
      const expectedTweet = 'My yield pays for Claude Pro — forever 🌱 Join me on DeFi Garden:';
      if (tweetText !== expectedTweet) {
        throw new Error('expected baseline tweet text "' + expectedTweet + '", got: ' + tweetText);
      }
    });
    await sub.ctx.close();

    // ---- AC3b: SUBSCRIPTION with a manually-TOGGLED mix — the scenario the
    // orchestrator flagged: doWaitlistShare/doWaitlistDownload must label the
    // user's ACTUAL selectedSubs mix, not what buildShareCopy's
    // coveredBundle(capital, apy, goal) would separately imply (those two can
    // diverge once selectedSubs is edited away from the untouched anchor
    // seed). Toggling Spotify on before opening the waitlist must still show
    // BOTH services on the card/tweet. ----
    const sub2 = await routedPage('(subscription-mix)');
    await test('AC3b: SUBSCRIPTION with Spotify manually toggled into the mix — card + tweet reflect the FULL selected mix (not just what capital covers)', async () => {
      const url = `http://localhost:${PORT}/plan.html?goal=claude&pace=stable&capital=5000&fm=capital`;
      await sub2.page.goto(url, { waitUntil: 'load', timeout: 20000 });
      await sub2.page.waitForSelector('.gp-mix-row', { timeout: 15000 });
      const spotifyRow = sub2.page.locator('.gp-mix-row', { has: sub2.page.locator('.gp-mix-label', { hasText: 'Spotify' }) });
      await spotifyRow.click();
      await sub2.page.waitForFunction(() => {
        const el = document.querySelector('.gp-mix-total');
        return el && el.textContent.indexOf('$32/mo') !== -1;
      }, { timeout: 5000 });

      await openWaitlistAndSubmit(sub2.page); // no reload — preserves the just-toggled mix
      const cardText = await clickDownload(sub2.page);
      if (cardText.indexOf('Claude Pro + Spotify') === -1) {
        throw new Error('expected the FULL toggled mix "Claude Pro + Spotify" in drawn card strings (headline or row label), got: ' + cardText);
      }
      if (cardText.indexOf('$32/mo covered forever') === -1) {
        throw new Error('expected the toggled mix\'s combined $32/mo in the subline, got: ' + cardText);
      }

      const tweetUrl = await clickShareOnX(sub2.page);
      const tweetText = decodeURIComponent(new URL(tweetUrl).searchParams.get('text') || '');
      const expectedTweet = 'My yield pays for Claude Pro + Spotify — forever 🌱 Join me on DeFi Garden:';
      if (tweetText !== expectedTweet) {
        throw new Error('expected toggled-mix tweet text "' + expectedTweet + '", got: ' + tweetText);
      }
    });
    await sub2.ctx.close();

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passed} waitlist-share-archetype assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('test_waitlist_share_archetype crashed: ' + err.message);
  process.exit(1);
});
