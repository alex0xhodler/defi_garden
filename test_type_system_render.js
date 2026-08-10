/* Playwright rendered-acceptance gate for backlog 238 — "retire the terminal
   skin, one type system on the Quiet base." Per the 2026-07-11 standing
   decision, unit fixtures over CSS source text are not acceptance for a UX
   item; this drives the REAL rendered UI in chromium, both themes, and reads
   getComputedStyle().

   Three things asserted, all against the ACTUAL rendered app (not source):

   A. `.logo:hover` no longer scale-pops. The `.logo` <h1> wordmark (app.js)
      only renders in the App component's "no results yet" header — i.e. the
      analytics app's OWN blank/search state, reached via `/?app` (the router
      treats `app` as an ANALYTICS_PARAMS key, home.html:88). It is NOT
      present on `/?token=USDC` (that query hides the `.logo` header and
      shows the differently-classed `.app-logo` compact header instead —
      confirmed by reading app.js's render condition
      `!(selectedToken || (chainMode && selectedChain))` around the `.logo`
      h1). `/?app` is the correct analytics-app URL for the state where
      `.logo` actually exists in the DOM; asserting on `/?token=USDC` would
      silently no-op (selector never found) rather than test anything, which
      RAZOR.md's non-vacuity standard forbids. `data-app-mode="analytics"` is
      asserted alongside the selector so the surface really is the analytics
      app, not a fallback.

   B. `.gp-journey-status` resolves through --font-family-mono. It renders
      inside GardenReport (planner.js), which only mounts with a saved plan
      in localStorage['garden-plan'] — seeded here exactly like
      test_tend_reminder.js seeds it, on /plan.html.

      238 finding 4 (verifier): the getComputedStyle leg ALONE is VACUOUS —
      the verifier reverted planner-styles.css:1785 to
      `var(--font-family-mono, ui-monospace, monospace)` (the exact dead
      fallback this diff removed), re-minified, and the computed-style
      assertion below stayed GREEN in both themes, because
      `--font-family-mono` is always defined on :root so the fallback never
      resolves — a fixed and an unfixed declaration are computationally
      indistinguishable via getComputedStyle. Rather than drop the leg, it
      is made non-vacuous by ALSO asserting the DECLARED value straight out
      of planner-styles.min.css (the prod-loaded file this whole test
      insists on prod-parity for) carries no fallback stack at all — see
      the second assertion inside the B test below. That declared-value
      check is what actually distinguishes fixed from unfixed; the
      getComputedStyle check is kept alongside it because it still proves
      the token itself resolves to a real, non-empty font family in a live
      browser (a source-text check alone can't prove that).

      `.gp-waitlist-link-text` has NO render call site anywhere in the
      current JS (grep across the repo turns up only planner-styles.css,
      planner-styles.min.css, and the spec file itself) — it is genuinely
      unreachable without inventing a flow that doesn't exist, so per the
      build brief this file does not assert on it and this comment
      documents the gap rather than faking coverage.

   C. `.pool-info-item .value.token-pair` (style.css:4471, analytics surface)
      resolves through --font-family-mono. 238 finding 4 (verifier): this is
      the ONLY one of the three 238 mono fixes that changes what a user
      actually sees (platform `monospace` default → the Berkeley Mono
      token) and it had NO rendered assertion at all before this fix.

      IMPORTANT DEVIATION, stated plainly per the fix brief's own "state
      what you could not verify" instruction: the brief asks to "drive the
      real UI" to this element via "a pool modal/detail interaction." That
      element is JSX that DOES exist in app.js (~line 3667, inside the
      `showYieldCalculator && selectedPool && ...` "Yield Calculator Modal"
      block) but the modal is dead code in the CURRENT app — confirmed by
      exhaustive grep: `setShowYieldCalculator(true)` is never called
      anywhere in app.js (only the `useState` declaration and two
      `setShowYieldCalculator(false)` calls exist), and `setSelectedPool`
      is never called with an actual pool anywhere either. The one button
      that used to open this modal (`handleCalculateYield`,
      app.js:~2782) was migrated by a prior spec to navigate to
      `.pool-detail-view` instead — its own comment literally reads
      "Handle yield calculator - navigate to pool details page"
      (app.js:2781) — and no `?pool=`/other URL param sets
      `showYieldCalculator`/`selectedPool` either (both grep-confirmed).
      So there is no click, no deep link, and no state transition anywhere
      in current app.js that mounts this modal; "driving the real UI to it"
      would require inventing a flow that does not exist, which is exactly
      what this codebase's own `.gp-waitlist-link-text` precedent (see B,
      above) says not to do. Fixing app.js to rewire the modal is out of
      scope — this task's allowed diff is the two test files only.

      What this test does instead, so the fix still gets real coverage
      rather than none: it opens the analytics surface for real
      (`/?token=USDC`, confirmed via `data-app-mode="analytics"`, which
      loads the SAME style.min.css the dead modal would use if it were
      reachable) and then injects the EXACT DOM shape app.js's JSX would
      produce — `<div class="pool-info-item"><span class="value
      token-pair">USDC</span></div>` — as a plain `document.createElement`
      fragment, and reads `getComputedStyle()` on it. This is a genuinely
      RENDERED assertion against the REAL loaded stylesheet cascade (not a
      source-text regex) — the only thing it does not do is click a button,
      because no button reaches this state. Proven non-vacuous the same way
      as every other leg in this file: see the build report's
      revert/re-minify/restore transcript for style.css:4471.

      For BOTH B and C, the expected family is DERIVED at runtime from
      getComputedStyle(document.documentElement).getPropertyValue(
      '--font-family-mono') — never a hardcoded "Berkeley Mono" string — so
      this test tracks the token if it's ever re-themed.

   All three assertions run in light AND dark theme (data-theme attr).

   Prod loads *.min.css (home.html's style.min.css, plan.html's
   style.min.css + planner-styles.min.css) — this test's server serves the
   repo root as-is, i.e. those exact *.min.css files, so `npm run minify`
   MUST have been re-run before this test is meaningful (a stale min sheet
   would silently test yesterday's CSS). See test_list_polish.js /
   test_boot_barrier.js for the same prod-parity note this codebase already
   documents elsewhere.

   Harness mirrors test_boot_barrier.js / test_tend_reminder.js: local http
   static server over the repo root (home.html rewrite for "/"), chromium at
   /opt/pw-browsers/chromium when present, fixture-routed yields.llama.fi +
   pools-snapshot + aborted decorative hosts, ignorable console/page-error
   filter, addInitScript to seed localStorage before any page script runs.

   Run: node test_type_system_render.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 9701; // next free after the highest claimed test_*.js PORT (9700)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml'
};
const IGNORABLE_ERROR_PATTERN = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons|Failed to load resource/i;

const POOLS_URL = 'https://yields.llama.fi/pools';
function makePool(id, project, symbol, chain, tvlUsd, apyBase) {
  return { pool: id, project, symbol, chain, tvlUsd, apyBase: apyBase || 0, apyReward: 0 };
}
const FIXTURE_POOLS = [
  makePool('usdc-base-aave', 'aave-v3', 'USDC', 'Base', 45_000_000, 4.2),
  makePool('usdc-eth-morpho', 'morpho-blue', 'USDC', 'Ethereum', 55_000_000, 5.9)
];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });

// Mirrors test_tend_reminder.js's SAVED_PLAN — the minimum shape GardenReport
// needs to mount, PLAN_VERSION asserted against planner.js below so a future
// bump breaks this test loudly rather than silently no-op-ing.
const PLAN_VERSION = 3;
const SAVED_PLAN = {
  version: PLAN_VERSION,
  goal: 'retirement',
  monthly: 200,
  years: 10,
  persona: 'stable',
  temperament: 'cautious',
  pools: [{ pool: 'usdc-eth-morpho', symbol: 'USDC', project: 'morpho-blue', chain: 'Ethereum', apy: 5.9 }],
  blendedApy: 5.9,
  effectiveApy: 5.9,
  projection: 35000,
  fundingMode: 'monthly',
  capital: null,
  deadline: null,
  archetype: 'growth',
  target: null,
  savedAt: new Date(Date.now() - 40 * 864e5).toISOString(),
  poolFilters: null,
  mix: null
};

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

async function routeFixtures(page) {
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  await page.route('https://www.google.com/s2/**', (r) => r.abort());
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"schemaVersion":1,"generatedAt":"2020-01-01T00:00:00.000Z","count":1,"bytes":100}'
  }));
  await page.route(POOLS_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
}

// Reads a declared property value straight out of a minified stylesheet
// (238 finding 4 — the .gp-journey-status computed-style leg can't tell a
// fixed declaration from an unfixed one, since --font-family-mono is always
// defined and the dead fallback it used to carry never resolves; the
// declared SOURCE value can tell the difference, so this reads it directly
// from the prod-loaded *.min.css this whole test insists on prod-parity
// for). Minified selectors/declarations have no incidental whitespace
// clean-css wouldn't itself produce, so a literal (escaped) match is exact.
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function readDeclaredValueFromMinCss(minCssRelPath, selectorLiteral, prop) {
  const css = fs.readFileSync(path.join(ROOT, minCssRelPath), 'utf8');
  const ruleMatch = css.match(new RegExp(escapeRegExp(selectorLiteral) + '\\{([^}]*)\\}'));
  if (!ruleMatch) return null;
  const declMatch = ruleMatch[1].match(new RegExp('(?:^|;)' + escapeRegExp(prop) + ':([^;]+)'));
  return declMatch ? declMatch[1].trim() : null;
}

function newErrorCollector(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const source = msg.location()?.url || '';
    if (!IGNORABLE_ERROR_PATTERN.test(source) && !IGNORABLE_ERROR_PATTERN.test(msg.text())) {
      errors.push('console.error: ' + msg.text() + (source ? ' (' + source + ')' : ''));
    }
  });
  return errors;
}

// Seeds localStorage BEFORE any page script runs (addInitScript), matching
// test_tend_reminder.js's pattern exactly.
function seedInitScript(theme, planJson) {
  return `(${function (t, pj) {
    try { window.localStorage.setItem('theme', t); } catch (e) {}
    try { if (pj) window.localStorage.setItem('garden-plan', pj); } catch (e) {}
  }.toString()})(${JSON.stringify(theme)}, ${JSON.stringify(planJson || null)})`;
}

async function main() {
  // Guard: PLAN_VERSION must match planner.js, else GardenReport wouldn't mount.
  const plannerSrc = fs.readFileSync(path.join(ROOT, 'planner.js'), 'utf8');
  const pv = plannerSrc.match(/var PLAN_VERSION\s*=\s*(\d+)/);
  if (!pv || Number(pv[1]) !== PLAN_VERSION) {
    console.error('PLAN_VERSION mismatch: planner.js=' + (pv && pv[1]) + ' test=' + PLAN_VERSION);
    process.exitCode = 1;
    return;
  }

  // Documented, not silently skipped: confirm .gp-waitlist-link-text truly
  // has no render call site anywhere outside CSS/spec text before claiming
  // it's unreachable in the report below. Excludes test_*.js (this file and
  // test_type_system_contract.js both mention the class name in comments,
  // which would otherwise self-match).
  const jsFiles = fs.readdirSync(ROOT).filter((f) => /\.js$/.test(f) && !/\.min\.js$/.test(f) && !/\.compiled\.js$/.test(f) && !/^test_/.test(f));
  const anyJsRendersIt = jsFiles.some((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('gp-waitlist-link-text'));
  console.log('  (info) .gp-waitlist-link-text referenced by any source .js file: ' + anyJsRendersIt + ' — ' +
    (anyJsRendersIt ? 'unexpected, re-check the assertion plan' : 'confirms it is dead/unreachable in the current UI; not asserted (see header comment).'));

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    for (const theme of ['light', 'dark']) {
      // --- A. .logo hover, analytics app blank state (/?app) ---
      await test(`[${theme}] analytics app (/?app): .logo present, data-app-mode=analytics`, async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
        const errors = newErrorCollector(page);
        await page.addInitScript(seedInitScript(theme));
        await routeFixtures(page);
        await page.goto(`http://localhost:${PORT}/?app`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.logo', { timeout: 15000 });
        const mode = await page.evaluate(() => document.documentElement.getAttribute('data-app-mode'));
        const visible = await page.isVisible('.logo');
        await page.close();
        if (mode !== 'analytics') throw new Error(`data-app-mode="${mode}" !== "analytics"`);
        if (!visible) throw new Error('.logo not visible');
        if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      });

      await test(`[${theme}] analytics app (/?app): hovering .logo yields computed transform "none" (scale-pop removed)`, async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
        const errors = newErrorCollector(page);
        await page.addInitScript(seedInitScript(theme));
        await routeFixtures(page);
        await page.goto(`http://localhost:${PORT}/?app`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.logo', { timeout: 15000 });

        const before = await page.evaluate(() => getComputedStyle(document.querySelector('.logo')).transform);
        await page.hover('.logo');
        // .logo carries `transition: all 0.2s ease` (color/border only, no
        // transform target survives this diff) — settle past it regardless.
        await page.waitForTimeout(350);
        const during = await page.evaluate(() => getComputedStyle(document.querySelector('.logo')).transform);
        await page.mouse.move(0, 0);
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => getComputedStyle(document.querySelector('.logo')).transform);
        await page.close();

        if (before !== 'none') throw new Error(`expected pre-hover transform "none", got "${before}"`);
        if (during !== 'none') throw new Error(`expected hovered transform "none" (scale-pop must be gone), got "${during}"`);
        if (after !== 'none') throw new Error(`expected post-hover transform "none", got "${after}"`);
        if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      });

      // --- B. .gp-journey-status resolves through --font-family-mono ---
      await test(`[${theme}] planner report (/plan.html, seeded plan): .gp-journey-status computed font-family contains --font-family-mono's first family`, async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
        const errors = newErrorCollector(page);
        await page.addInitScript(seedInitScript(theme, JSON.stringify(SAVED_PLAN)));
        await routeFixtures(page);
        await page.goto(`http://localhost:${PORT}/plan.html`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.gp-journey-status', { timeout: 15000 });

        const result = await page.evaluate(() => {
          const raw = getComputedStyle(document.documentElement).getPropertyValue('--font-family-mono').trim();
          const firstFamily = raw.split(',')[0].trim().replace(/^["']|["']$/g, '');
          const computed = getComputedStyle(document.querySelector('.gp-journey-status')).fontFamily;
          return { raw, firstFamily, computed };
        });
        await page.close();

        if (!result.firstFamily) throw new Error('could not derive a first family from --font-family-mono (raw="' + result.raw + '")');
        if (!result.computed.includes(result.firstFamily)) {
          throw new Error(`.gp-journey-status computed font-family "${result.computed}" does not contain token first-family "${result.firstFamily}" (--font-family-mono raw: "${result.raw}")`);
        }

        // Non-vacuity fix (238 finding 4): the computed-style check above
        // can't tell a fixed declaration from the exact dead fallback this
        // diff removed (`var(--font-family-mono, ui-monospace, monospace)`)
        // because the token is always defined, so the fallback never
        // resolves either way. This declared-value check reads the SOURCE
        // text of the prod-loaded planner-styles.min.css directly and
        // requires it to be the bare token reference with no fallback
        // stack — THIS is what actually goes red if the dead fallback is
        // reintroduced.
        const declared = readDeclaredValueFromMinCss('planner-styles.min.css', '.gp-journey-status', 'font-family');
        if (declared !== 'var(--font-family-mono)') {
          throw new Error(`.gp-journey-status declared font-family in planner-styles.min.css is "${declared}" — expected the bare token reference "var(--font-family-mono)" with no fallback stack`);
        }
        if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      });

      // --- C. .pool-info-item .value.token-pair resolves through
      // --font-family-mono (analytics surface). See the header comment's
      // section C for why this is a synthetic-DOM injection against the
      // real loaded stylesheet rather than a click-driven interaction: the
      // modal that JSX belongs to is dead code in current app.js (grep-
      // confirmed no call site ever sets showYieldCalculator=true with a
      // populated selectedPool), so there is no real UI path to drive to
      // it without inventing one. ---
      await test(`[${theme}] analytics surface (/?token=USDC): synthetic .pool-info-item .value.token-pair computed font-family contains --font-family-mono's first family`, async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
        const errors = newErrorCollector(page);
        await page.addInitScript(seedInitScript(theme));
        await routeFixtures(page);
        await page.goto(`http://localhost:${PORT}/?token=USDC`, { waitUntil: 'load', timeout: 20000 });
        await page.waitForSelector('.pool-card', { timeout: 15000 });

        const result = await page.evaluate(() => {
          const mode = document.documentElement.getAttribute('data-app-mode');
          // Inject the EXACT DOM shape app.js's dead-but-still-styled JSX
          // produces (app.js ~line 3663-3667:
          // <div class="pool-info-item"><span class="value token-pair">
          // {selectedPool.symbol}</span></div>), so the real loaded
          // style.min.css cascade — not a source-text regex — resolves it.
          const container = document.createElement('div');
          container.className = 'pool-info-item';
          const span = document.createElement('span');
          span.className = 'value token-pair';
          span.textContent = 'USDC';
          container.appendChild(span);
          document.body.appendChild(container);

          const raw = getComputedStyle(document.documentElement).getPropertyValue('--font-family-mono').trim();
          const firstFamily = raw.split(',')[0].trim().replace(/^["']|["']$/g, '');
          const computed = getComputedStyle(span).fontFamily;

          document.body.removeChild(container);
          return { mode, raw, firstFamily, computed };
        });
        await page.close();

        if (result.mode !== 'analytics') throw new Error(`data-app-mode="${result.mode}" !== "analytics"`);
        if (!result.firstFamily) throw new Error('could not derive a first family from --font-family-mono (raw="' + result.raw + '")');
        if (!result.computed.includes(result.firstFamily)) {
          throw new Error(`.pool-info-item .value.token-pair computed font-family "${result.computed}" does not contain token first-family "${result.firstFamily}" (--font-family-mono raw: "${result.raw}")`);
        }
        if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
      });
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\ntest_type_system_render.js: ${passed}/${total} tests passed`);
  console.log('NOTE: .gp-waitlist-link-text is not asserted — it has no render call site in current source (see the (info) line above and the header comment).');
  console.log('NOTE: .pool-info-item .value.token-pair is asserted via synthetic DOM injection against the real loaded stylesheet, not a click — the modal it belongs to is dead code in current app.js (see header comment section C).');
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('test_type_system_render.js crashed: ' + err.message);
  process.exitCode = 1;
});
