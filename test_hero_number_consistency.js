/* Regression test for a live production bug (human ticket 2026-07-14, spec 099):
   on the subscription bloom the checkout HERO card showed a DIFFERENT
   forever-number than the headline + forever line for the SAME single pick.
   Screenshot: only ChatGPT Plus ($20/mo) selected, blended APY 10.58% →
   headline + bottom line correctly said "≈$2,300 covers $20/mo", but the
   right-hand hero card showed "$4,800" ONE-TIME / "generates $42/mo" (~2× the
   picked bill). Inconsistent money numbers on the conversion page (the
   waitlist_submitted funnel top) directly damage the trust-rail moat.

   Cause: the subscription pick seeds `capital` upstream with
   foreverNumber(target, guidanceApy) (~5.5% stable guidance, planner.js
   ~L3863), but the bloom recomputes coverage at the LIVE blended apy. The
   headline + forever line use the live-apy currentMixStats.neededCapital; the
   checkout hero card used the STALE seeded slideCapital. The slideCapital⇄mix
   sync effect only ran after the user TOUCHED the mix (a `mixTouched` gate), so
   the untouched default state diverged. Fix: drop the gate — slideCapital tracks
   the live-apy neededCapital from the initial seed on, giving the hero card,
   headline and forever line ONE source of truth. No user input is lost (the
   amount step is skipped for subscriptions; dragging the capital slider still
   wins — it changes slideCapital without changing neededCapital, so the effect
   never refires).

   Fixture APY is 10% so every surface lands on clean, float-safe figures:
   foreverNumber($20/mo @ 10%) = $2,400 exactly → neededCapital $2,400, and
   $2,400 yields exactly $20/mo. The URL seeds capital=5000 (≠ $2,400): pre-fix
   the hero showed "$5,000 / generates $42/mo" (the exact production symptom),
   post-fix it converges to "$2,400 / $20/mo" like the headline + forever line.

   Drives the REAL rendered plan.html UI (2026-07-11 standing decision — never
   fixture strings alone). Mirrors test_subscription_mix_seed.js's harness
   (local static server, real Chromium, vendored React/Babel + a routed pools
   fixture; browser-originated HTTPS to unpkg.com / yields.llama.fi is blocked
   at the proxy in this sandbox).

   Run: node test_hero_number_consistency.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8803; // 8791-8802 already claimed by prior test_* files
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|google\.com\/s2\/favicons/i;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

// One stable USDC lending pool at 10% clears the `stable` persona rails
// (planner.js PERSONAS.stable: minTvl 50M, stableOnly, maxApy = sanity limit)
// and blends to exactly 10% (single pool, no haircut). See header for why 10%.
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('stable-usdc-eth', 'aave-v3', 'USDC', 'Ethereum', 60_000_000, 10)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

const SEEDED_CAPITAL = '$5,000';   // the stale URL/guidance-rate seed (pre-fix hero)
const EXPECTED_CAPITAL = '$2,400'; // live-apy neededCapital for $20/mo @ 10%
const EXPECTED_MONTHLY = '$20/mo'; // the picked ChatGPT Plus bill

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

// First "$1,234" / "$99" style figure in a string (the capital), ignoring the
// "/mo" bill that follows it.
function capitalIn(text) {
  const m = String(text || '').match(/\$[\d,]+(?!\/mo)/);
  return m ? m[0] : null;
}
// The "$99/mo" figure in a string (the bill / yield-per-month).
function monthlyIn(text) {
  const m = String(text || '').match(/\$[\d,]+\/mo/);
  return m ? m[0] : null;
}

// Read the three money surfaces on the subscription bloom:
//   hero      — checkout card price + value-prop ("generates $X/mo")
//   headline  — the instant-win sub ("≈$X covers $Y/mo of bills at ...")
//   forever   — the mix-total line ("≈$X covers $Y/mo — forever")
async function readSurfaces(page) {
  return page.evaluate(() => {
    const q = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
    return {
      heroPrice: q('.gp-checkout-price'),
      heroValueProp: q('.gp-checkout-value-prop'),
      headlineSub: q('.gp-instant-win .gp-headline-sub'),
      mixTotal: q('.gp-mix-total')
    };
  });
}

async function main() {
  console.log('network: unpkg.com BLOCKED (using local vendored React/Babel), yields.llama.fi BLOCKED (using fixture pool @ 10%)');

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
      // spec 059: serve a STALE snapshot so the FE falls back to the fixtured LIVE endpoint deterministically.
      await pg.route('**/data/pools-snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}' }));
      await pg.route('https://yields.llama.fi/pools', (route) => route.fulfill({
        status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE
      }));
      return { ctx: ctx, page: pg };
    }

    // Reach the subscription bloom via a share-style URL. capital=5000 seeds the
    // (pre-fix) stale hero value; fm=capital puts the checkout card in one-time
    // mode. The live 10% fixture makes the true coverage $2,400.
    const chatgptUrl = `http://localhost:${PORT}/plan.html?goal=chatgpt&pace=stable&capital=5000&fm=capital`;

    // (a) the core bug: single ChatGPT Plus pick, untouched — the hero card,
    // headline and forever line must ALL show the live-apy coverage ($2,400),
    // not the stale seed ($5,000), and all agree on the $20/mo bill.
    const a = await routedPage('(a)');
    await test('(a) untouched single pick — hero, headline & forever line converge on the live coverage (one source of truth)', async () => {
      await a.page.goto(chatgptUrl, { waitUntil: 'load', timeout: 20000 });
      // Wait for the live apy to load and the hero to converge on the headline's
      // capital (proves the stale seed was corrected, not just a lucky first paint).
      await a.page.waitForFunction((seeded) => {
        const q = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
        const cap = (t) => { const m = String(t || '').match(/\$[\d,]+(?!\/mo)/); return m ? m[0] : null; };
        const price = q('.gp-checkout-price');
        const head = cap(q('.gp-instant-win .gp-headline-sub'));
        const mix = cap(q('.gp-mix-total'));
        return price && head && mix && price === head && price === mix && price !== seeded;
      }, SEEDED_CAPITAL, { timeout: 15000 });

      const s = await readSurfaces(a.page);
      const heroCap = capitalIn(s.heroPrice);
      const headCap = capitalIn(s.headlineSub);
      const mixCap = capitalIn(s.mixTotal);
      const heroMo = monthlyIn(s.heroValueProp);
      const headMo = monthlyIn(s.headlineSub);
      const mixMo = monthlyIn(s.mixTotal);

      // Capital — the number that was 2× wrong — agrees across all three surfaces.
      if (!(heroCap && heroCap === headCap && heroCap === mixCap)) {
        throw new Error('capital mismatch across surfaces: hero=' + heroCap + ' headline=' + headCap + ' forever=' + mixCap + ' — surfaces: ' + JSON.stringify(s));
      }
      // And it is the LIVE-apy coverage, not the stale guidance-rate seed.
      if (heroCap !== EXPECTED_CAPITAL) {
        throw new Error('expected live-apy coverage ' + EXPECTED_CAPITAL + ', got ' + heroCap + ' — surfaces: ' + JSON.stringify(s));
      }
      if (heroCap === SEEDED_CAPITAL) {
        throw new Error('hero still showing the stale seed ' + SEEDED_CAPITAL + ' — surfaces: ' + JSON.stringify(s));
      }
      // Monthly bill agrees too (at 10% the $2,400 yields exactly the $20 bill).
      if (!(heroMo && heroMo === headMo && heroMo === mixMo)) {
        throw new Error('monthly mismatch across surfaces: hero=' + heroMo + ' headline=' + headMo + ' forever=' + mixMo + ' — surfaces: ' + JSON.stringify(s));
      }
      if (heroMo !== EXPECTED_MONTHLY) {
        throw new Error('expected monthly ' + EXPECTED_MONTHLY + ', got ' + heroMo + ' — surfaces: ' + JSON.stringify(s));
      }
    });
    await a.ctx.close();

    // (b) interaction integrity: toggling a second sub ON re-derives coverage;
    // the hero card must STILL match the headline + forever line (the one source
    // of truth follows the mix, on interaction too). ChatGPT+Spotify = $32/mo →
    // coverage recomputes; we assert cross-surface capital agreement (the exact
    // figure follows the live rate + ceil-to-$100 rounding, so we compare the
    // surfaces to each other rather than hardcode it).
    await test('(b) after toggling a second sub, hero card still agrees with headline & forever line', async () => {
      const b = await routedPage('(b)');
      await b.page.goto(chatgptUrl, { waitUntil: 'load', timeout: 20000 });
      // settle the untouched state first
      await b.page.waitForFunction((seeded) => {
        const el = document.querySelector('.gp-checkout-price');
        return el && el.textContent.trim() !== seeded && /\$[\d,]+/.test(el.textContent);
      }, SEEDED_CAPITAL, { timeout: 15000 });

      const spotifyRow = b.page.locator('.gp-mix-row', { has: b.page.locator('.gp-mix-label', { hasText: 'Spotify' }) });
      await spotifyRow.click();
      // combined bill becomes $32/mo — wait for the forever line to reflect it.
      await b.page.waitForFunction(() => {
        const el = document.querySelector('.gp-mix-total');
        return el && el.textContent.indexOf('$32/mo') !== -1;
      }, { timeout: 5000 });
      // and wait for the hero card to re-converge on the headline's capital.
      await b.page.waitForFunction(() => {
        const q = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
        const cap = (t) => { const m = String(t || '').match(/\$[\d,]+(?!\/mo)/); return m ? m[0] : null; };
        const price = q('.gp-checkout-price');
        const head = cap(q('.gp-instant-win .gp-headline-sub'));
        const mix = cap(q('.gp-mix-total'));
        return price && head && mix && price === head && price === mix;
      }, { timeout: 5000 });

      const s = await readSurfaces(b.page);
      const heroCap = capitalIn(s.heroPrice);
      const headCap = capitalIn(s.headlineSub);
      const mixCap = capitalIn(s.mixTotal);
      if (!(heroCap && heroCap === headCap && heroCap === mixCap)) {
        throw new Error('post-toggle capital mismatch: hero=' + heroCap + ' headline=' + headCap + ' forever=' + mixCap + ' — surfaces: ' + JSON.stringify(s));
      }
      // it must have moved off the single-pick coverage (proves it re-derived)
      if (heroCap === EXPECTED_CAPITAL) {
        throw new Error('coverage did not grow after adding Spotify (still ' + heroCap + ') — surfaces: ' + JSON.stringify(s));
      }
      await b.ctx.close();
    });

    if (pageErrors.length) {
      console.error('page errors during run:\n' + pageErrors.join('\n'));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
  const total = 2;
  console.log(passed + '/' + total + ' hero-number-consistency assertions passed');
}

main().catch((err) => {
  console.error('test_hero_number_consistency crashed: ' + err.message);
  process.exitCode = 1;
});
