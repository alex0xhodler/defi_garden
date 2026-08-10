/* Rendered Playwright test for backlog 258 — `surface` names the RENDERING
   CONTEXT (results grid / empty-state alternatives / dead-pool alternatives)
   on `pool_click` and `pool_view`, threaded from `renderPoolCard` through
   `handlePoolClick`/`handleCalculateYield` into `analytics.js`'s
   `trackPoolView`/`trackPoolClick`, guarded and explicit (never a `...context`
   spread — playbooks/analytics-regression-triage.md, 214 addendum).

   Two independent legs, per the 214 addendum's step 3 ("a correct call site
   is not evidence the property reaches Mixpanel; wrap the choke-point every
   track* helper funnels through"):

   LEG A — static, source-derived population check (no browser). Parses
   app.js at test time for every `renderPoolCard(` CALL SITE (never the
   `const renderPoolCard = (...) => {` definition — that line never contains
   the literal substring "renderPoolCard(") and asserts each one passes a
   literal string as its 5th (surface) argument. This is the RAZOR-shaped
   guard the spec demands: a fourth grid added later with a missing surface
   argument fails THIS check immediately, with no browser or fixture needed.
   The set of surface values is READ from those literals, never hardcoded.

   LEG B — rendered, spying at the Analytics.track boundary (never
   trackPoolView/trackPoolClick's own arguments — the 214 defect was exactly
   a correct call site sitting above an emitter that silently dropped the
   key). Structure copied from test_pool_view_calculator_path.js: fixture-
   routed unpkg React/Babel + yields.llama.fi, snapshot 404'd to force the
   live path, chromium at /opt/pw-browsers/chromium, one browser context per
   scenario (mirrors test_dead_pool.js's newCtx). Drives all three contexts
   on the REAL app:
     - results grid:              ?token=USDC (matches the fixture pool)
     - empty-state alternatives:  ?token=<non-matching> (item 012/072 rescue
       grid, `emptyAlternatives`/`getEmptyStateAlternatives`, app.js:~2554)
     - dead-pool alternatives:    ?pool=<dead id> (spec 072, the same
       `getEmptyStateAlternatives` fixture test_dead_pool.js already builds)
   Each scenario clicks `.calculate-yield-btn-new` (handleCalculateYield) —
   the ONLY renderPoolCard interaction that fires BOTH pool_click AND
   pool_view in one action (handlePoolClick/card-body click fires pool_view
   only) — and asserts both captured events carry the surface literal LEG A
   derived for that grid's call site, with EVERY pre-existing key unchanged
   and `surface` the only addition.

   "The assembled payload" (spec 258 AC) is read at the same boundary
   test_pool_view_calculator_path.js and the 214 addendum use: the object
   trackPoolView/trackPoolClick hand to `this.track(eventName, payload)`,
   captured by wrapping `Analytics.track` itself (before its own body's
   getBaseContext() merge/host-gate/mixpanel.track ever run) — i.e. exactly
   the object the code this spec touches assembles, which is what "diff the
   assembled payloads, not the source lines" is asking to diff. The
   "pre-existing key set" is derived the same way LEG A derives surface
   values: parsed out of analytics.js's own trackPoolView/trackPoolClick
   payload-literal and enrichPoolData()'s return-literal at test time, never
   a hand-typed golden list.

   Run: node test_pool_click_surface.js */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8980; // distinct from other test_* files (8791-8979 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log('  \u2713 ' + name); }
  catch (err) { console.error('  \u2717 ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// LEG A helpers — pure source parsing, no browser, no fixtures.
// ---------------------------------------------------------------------------

// Depth-aware substring splitter: splits `str` on top-level commas only,
// tracking (), [], {} nesting AND '/"/` string state (so a comma inside
// `(currentPage - 1) * itemsPerPage + index` or inside a template literal
// never causes a false split). General-purpose on purpose — the population
// check must not quietly stop working the day a call site's argument list
// grows more complex.
function splitTopLevelArgs(str) {
  const args = [];
  let depth = 0;
  let cur = '';
  let inSingle = false, inDouble = false, inBacktick = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const prev = str[i - 1];
    if (inSingle) { cur += c; if (c === "'" && prev !== '\\') inSingle = false; continue; }
    if (inDouble) { cur += c; if (c === '"' && prev !== '\\') inDouble = false; continue; }
    if (inBacktick) { cur += c; if (c === '`' && prev !== '\\') inBacktick = false; continue; }
    if (c === "'") { inSingle = true; cur += c; continue; }
    if (c === '"') { inDouble = true; cur += c; continue; }
    if (c === '`') { inBacktick = true; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim().length) args.push(cur.trim());
  return args;
}

// Finds every CALL to `renderPoolCard(` in `src` (never the
// `const renderPoolCard = (...) => {` definition, which never contains the
// literal substring "renderPoolCard(" — the identifier is followed by " = ("
// there, not "("), extracts its full, depth-balanced argument list, and
// returns one record per call site: the raw args, the split args, whether
// the LAST arg is a bare single-quoted string literal (the shape a surface
// value must have), and that literal's value when it is.
function parseRenderPoolCardCallSites(src) {
  const sites = [];
  const needle = 'renderPoolCard(';
  let searchFrom = 0;
  for (;;) {
    const start = src.indexOf(needle, searchFrom);
    if (start === -1) break;
    const openParen = start + needle.length - 1; // index of the '('
    // Walk forward from just after '(' tracking depth (reusing the same
    // string-aware state machine as splitTopLevelArgs) until the matching ')'.
    let depth = 1;
    let i = openParen + 1;
    let inSingle = false, inDouble = false, inBacktick = false;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      const prev = src[i - 1];
      if (inSingle) { if (c === "'" && prev !== '\\') inSingle = false; continue; }
      if (inDouble) { if (c === '"' && prev !== '\\') inDouble = false; continue; }
      if (inBacktick) { if (c === '`' && prev !== '\\') inBacktick = false; continue; }
      if (c === "'") { inSingle = true; continue; }
      if (c === '"') { inDouble = true; continue; }
      if (c === '`') { inBacktick = true; continue; }
      if (c === '(') { depth++; continue; }
      if (c === ')') { depth--; continue; }
    }
    const closeParen = i - 1; // index of the matching ')'
    const argsRaw = src.slice(openParen + 1, closeParen);
    const args = splitTopLevelArgs(argsRaw);
    const lastArg = args.length ? args[args.length - 1] : '';
    const literalMatch = /^'([^'\\]*)'$/.exec(lastArg);
    // Nearest preceding `.map((pool` invocation identifies WHICH grid this
    // call site belongs to (paginatedPools = the real results grid,
    // emptyAlternatives.items = item 012/072's rescue grid,
    // deadPoolAlternatives.items = spec 072's rescue grid) — read from the
    // source, not asserted a priori, so the mapping self-documents rather
    // than hardcoding "there are 3 call sites in this order". Uses the LAST
    // match in a wide lookbehind window (not "must be immediately adjacent")
    // because a comment block (e.g. the "Key is the pool id ALONE..." note
    // above the results-grid call site) legitimately sits between the
    // `.map((pool...) =>` header and the `renderPoolCard(` call itself.
    const before = src.slice(Math.max(0, start - 600), start);
    const mapMatches = [...before.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\.map\(\s*\(pool[^)]*\)\s*=>/g)];
    const mapMatch = mapMatches.length ? mapMatches[mapMatches.length - 1] : null;
    sites.push({
      start,
      argsRaw,
      args,
      lastArg,
      isStringLiteral: !!literalMatch,
      value: literalMatch ? literalMatch[1] : null,
      mapAnchor: mapMatch ? mapMatch[1] : null
    });
    searchFrom = closeParen + 1;
  }
  return sites;
}

// Locates a function's own body by its exact signature text (unique per
// function in this file), returning the index right at the start of the
// signature — used as a floor so the object-literal search below can never
// wander backward into a PRIOR function's identically-named object literal
// (both trackPoolView and trackPoolClick have their own "const payload = {").
function findFunctionStart(src, signatureMarker) {
  const idx = src.indexOf(signatureMarker);
  if (idx === -1) throw new Error(`findFunctionStart: signature not found: ${signatureMarker}`);
  return idx;
}

// Extracts the top-level `key:` names out of the brace-delimited object
// literal that OPENS at the '{' ending `literalOpenMarker` (e.g. 'return {'
// or 'const payload = {'), searching for that marker no earlier than
// `searchFrom` (see findFunctionStart) — used on enrichPoolData's
// `return { ... }` and trackPoolView/trackPoolClick's `const payload = { ... }`.
// Matched to its own closing `}` by depth, so nested calls like
// `this.serializeFilters(context.filters || {})` never confuse the boundary.
// Skips comment lines and the `...spread` line (neither starts with `\w+:`
// at column 0 of a trimmed line) and any conditionally-appended key (the
// `if (context.surface !== undefined) payload.surface = ...` line lives
// OUTSIDE the object literal by construction, so it is never picked up here
// — that is precisely what makes it possible to assert "surface is the only
// added key" without hand-maintaining either key list).
function extractObjectLiteralKeys(src, searchFrom, literalOpenMarker) {
  const markerIdx = src.indexOf(literalOpenMarker, searchFrom);
  if (markerIdx === -1) throw new Error(`extractObjectLiteralKeys: marker "${literalOpenMarker}" not found at/after index ${searchFrom}`);
  const openBrace = markerIdx + literalOpenMarker.length - 1; // literalOpenMarker itself ends in '{'
  let depth = 1;
  let i = openBrace + 1;
  let inSingle = false, inDouble = false, inBacktick = false, inLineComment = false;
  for (; i < src.length && depth > 0; i++) {
    const c = src[i];
    const prev = src[i - 1];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inSingle) { if (c === "'" && prev !== '\\') inSingle = false; continue; }
    if (inDouble) { if (c === '"' && prev !== '\\') inDouble = false; continue; }
    if (inBacktick) { if (c === '`' && prev !== '\\') inBacktick = false; continue; }
    if (c === "'") { inSingle = true; continue; }
    if (c === '"') { inDouble = true; continue; }
    if (c === '`') { inBacktick = true; continue; }
    if (c === '/' && src[i + 1] === '/') { inLineComment = true; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
  }
  const body = src.slice(openBrace + 1, i - 1);
  const keys = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('...')) continue;
    const m = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// LEG B helpers — rendered Playwright, reused verbatim from
// test_pool_view_calculator_path.js's spy pattern.
// ---------------------------------------------------------------------------

async function installTrackSpy(page) {
  await page.addInitScript(() => {
    window.__events = [];
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

const RESULTS_POOL = {
  pool: 'usdc-arbitrum-surface-258', project: 'aave-v3', symbol: 'USDC', chain: 'Arbitrum',
  tvlUsd: 32_000_000, apyBase: 3.8, apyReward: 0
};
// Stablecoin pools well above the trust-rail floor: the alternatives set
// (getEmptyStateAlternatives, app.js:~2554) both the empty-state-alternatives
// and dead-pool-alternatives scenarios pull from. Neither pool's symbol
// contains "USDC", so a `?token=ZZZNOPE` search matches none of the three —
// exercising the SAME `emptyAlternatives`/`getEmptyStateAlternatives` rescue
// path item 012/072 built.
const STABLE_ALT_1 = {
  pool: 'usdt-eth-surface-258', project: 'compound-v3', symbol: 'USDT', chain: 'Ethereum',
  tvlUsd: 400_000_000, apyBase: 5, apyReward: 0
};
const STABLE_ALT_2 = {
  pool: 'dai-eth-surface-258', project: 'morpho-blue', symbol: 'DAI', chain: 'Ethereum',
  tvlUsd: 250_000_000, apyBase: 6, apyReward: 0
};
const FIXTURE_POOLS = [RESULTS_POOL, STABLE_ALT_1, STABLE_ALT_2];
const FIXTURE_RESPONSE = JSON.stringify({ status: 'success', data: FIXTURE_POOLS });
const DEAD_ID = 'definitely-not-a-real-pool-id-258';
const NO_MATCH_TOKEN = 'ZZZNOPE258'; // matches no fixture pool's symbol substring

async function newCtx(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installTrackSpy(context);
  await context.route('https://icons.llamao.fi/**', (r) => r.abort());
  // Force the live path deterministically (matches test_northstar_cta_fires.js
  // / test_pool_view_calculator_path.js / test_dead_pool.js) — the committed
  // snapshot would otherwise silently satisfy the grid load.
  await context.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
  await context.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE_RESPONSE }));
  const nm = path.join(ROOT, 'node_modules');
  for (const [url, lp] of Object.entries({
    'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
    'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
  })) {
    await context.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
  }
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      pageErrors.push('console.error: ' + m.text());
  });
  return { context, page, pageErrors };
}

// Drives one scenario end to end: navigate, wait for a calculate-yield button
// inside `cardScopeSelector`, click it (fires BOTH pool_click and pool_view —
// see header comment), and return the two captured events plus page errors.
async function runScenario(browser, { url, cardScopeSelector }) {
  const { context, page, pageErrors } = await newCtx(browser);
  await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForSelector(`${cardScopeSelector} .calculate-yield-btn-new`, { timeout: 15000 });
  const btn = page.locator(`${cardScopeSelector} .calculate-yield-btn-new`).first();
  await btn.click();
  await page.waitForSelector('.pool-detail-view', { timeout: 10000 });
  const events = await pollEvents(page, (evs) =>
    evs.some((e) => e.eventName === 'pool_view') && evs.some((e) => e.eventName === 'pool_click'), 5000);
  await context.close();
  return { events, pageErrors };
}

// ---------------------------------------------------------------------------

async function main() {
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const analyticsSrc = fs.readFileSync(path.join(ROOT, 'analytics.js'), 'utf8');

  // === LEG A: static population check (no browser) =========================
  const callSites = parseRenderPoolCardCallSites(appSrc);

  await test('LEG A population: renderPoolCard( is called at least once (sanity — a check that never runs is not a check)', () => {
    if (callSites.length < 1) throw new Error('parseRenderPoolCardCallSites found zero call sites — parser or app.js drifted');
  });

  await test('LEG A population: EVERY renderPoolCard( call site passes a literal string surface argument (RAZOR — the 4th-grid guard)', () => {
    const bad = callSites.filter((s) => !s.isStringLiteral);
    if (bad.length) {
      const detail = bad.map((s) => `argsRaw="${s.argsRaw}" lastArg="${s.lastArg}"`).join('; ');
      throw new Error(`${bad.length}/${callSites.length} renderPoolCard( call site(s) have no literal-string surface argument: ${detail}`);
    }
  });

  // Derived (not hardcoded) surface-value set: the literals actually found
  // at the call sites above.
  const derivedSurfaceValues = callSites.map((s) => s.value);
  console.log(`  (derived surface values from app.js: ${JSON.stringify(derivedSurfaceValues)})`);

  await test('LEG A population: derived surface values are non-empty distinct strings (no accidental duplicate/blank surface)', () => {
    const nonEmpty = derivedSurfaceValues.every((v) => typeof v === 'string' && v.length > 0);
    if (!nonEmpty) throw new Error(`expected every derived surface value to be a non-empty string, got ${JSON.stringify(derivedSurfaceValues)}`);
    const distinct = new Set(derivedSurfaceValues);
    if (distinct.size !== derivedSurfaceValues.length) throw new Error(`expected all derived surface values distinct, got ${JSON.stringify(derivedSurfaceValues)}`);
  });

  // Map each call site to the surface value FOR THE GRID IT RENDERS (derived
  // from the nearest `.map((pool...` anchor above it, not hand-paired) — used
  // below so LEG B's per-scenario expectations are read out of app.js rather
  // than re-typed as literals.
  const surfaceByAnchor = {};
  for (const site of callSites) {
    if (site.mapAnchor) surfaceByAnchor[site.mapAnchor] = site.value;
  }
  await test('LEG A: every call site\'s grid anchor (paginatedPools / emptyAlternatives.items / deadPoolAlternatives.items) resolved', () => {
    const anchors = callSites.map((s) => s.mapAnchor);
    if (anchors.some((a) => !a)) throw new Error(`could not resolve a .map((pool...) anchor for every call site: ${JSON.stringify(callSites.map((s) => ({ argsRaw: s.argsRaw, mapAnchor: s.mapAnchor })))}`);
  });

  const EXPECT_RESULTS = surfaceByAnchor['paginatedPools'];
  const EXPECT_EMPTY_ALT = surfaceByAnchor['emptyAlternatives.items'];
  const EXPECT_DEAD_ALT = surfaceByAnchor['deadPoolAlternatives.items'];

  // === analytics.js emitter key-set derivation (also source-derived) =======
  const enrichStart = findFunctionStart(analyticsSrc, 'enrichPoolData(pool, context = {}) {');
  const enrichKeys = extractObjectLiteralKeys(analyticsSrc, enrichStart, 'return {');
  const viewStart = findFunctionStart(analyticsSrc, 'trackPoolView(pool, context = {}) {');
  const poolViewOwnKeys = extractObjectLiteralKeys(analyticsSrc, viewStart, 'const payload = {');
  const clickStart = findFunctionStart(analyticsSrc, 'trackPoolClick(pool, clickType, context = {}) {');
  const poolClickOwnKeys = extractObjectLiteralKeys(analyticsSrc, clickStart, 'const payload = {');
  const expectedPoolViewKeys = new Set([...enrichKeys, ...poolViewOwnKeys]);
  const expectedPoolClickKeys = new Set([...enrichKeys, ...poolClickOwnKeys]);

  await test('LEG A: derived key sets are non-trivial and neither contains "surface" (surface must be OUTSIDE the base literal, added only by the guarded `if`)', () => {
    if (expectedPoolViewKeys.size < 5) throw new Error(`expectedPoolViewKeys suspiciously small: ${JSON.stringify([...expectedPoolViewKeys])}`);
    if (expectedPoolClickKeys.size < 5) throw new Error(`expectedPoolClickKeys suspiciously small: ${JSON.stringify([...expectedPoolClickKeys])}`);
    if (expectedPoolViewKeys.has('surface')) throw new Error('trackPoolView\'s own object literal already contains "surface" — the guarded if-append is required to be OUTSIDE the literal, this indicates a structural drift the parser should re-check');
    if (expectedPoolClickKeys.has('surface')) throw new Error('trackPoolClick\'s own object literal already contains "surface" — see above');
  });

  function assertPayloadShape(label, eventData, expectedKeys, expectedSurface) {
    const actualKeys = new Set(Object.keys(eventData));
    const missing = [...expectedKeys].filter((k) => !actualKeys.has(k));
    if (missing.length) throw new Error(`${label}: missing pre-existing key(s) ${JSON.stringify(missing)} — got keys ${JSON.stringify([...actualKeys])}`);
    const added = [...actualKeys].filter((k) => !expectedKeys.has(k));
    if (added.length !== 1 || added[0] !== 'surface') {
      throw new Error(`${label}: expected exactly one added key ("surface"), got added key(s) ${JSON.stringify(added)} — full payload ${JSON.stringify(eventData)}`);
    }
    if (eventData.surface !== expectedSurface) {
      throw new Error(`${label}: expected surface="${expectedSurface}", got "${eventData.surface}" — full payload ${JSON.stringify(eventData)}`);
    }
  }

  // === LEG B: rendered, three contexts =======================================
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    await test(`results grid (surface="${EXPECT_RESULTS}"): pool_click AND pool_view both carry it, all pre-existing keys unchanged`, async () => {
      const { events, pageErrors } = await runScenario(browser, {
        // '.results-section' wraps EITHER the primary grid (list or grid
        // viewMode — 'pools-list'/'pools-grid') OR the empty state, never
        // both at once, so scoping to it (rather than the viewMode-specific
        // class) is robust to the default viewMode.
        url: `/home.html?token=USDC`,
        cardScopeSelector: '.results-section .pool-card'
      });
      const views = events.filter((e) => e.eventName === 'pool_view');
      const clicks = events.filter((e) => e.eventName === 'pool_click');
      if (views.length !== 1) throw new Error(`expected exactly one pool_view, got ${JSON.stringify(views)}`);
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click, got ${JSON.stringify(clicks)}`);
      assertPayloadShape('results pool_view', views[0].eventData, expectedPoolViewKeys, EXPECT_RESULTS);
      assertPayloadShape('results pool_click', clicks[0].eventData, expectedPoolClickKeys, EXPECT_RESULTS);
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
    });

    await test(`empty-state alternatives (surface="${EXPECT_EMPTY_ALT}"): pool_click AND pool_view both carry it, all pre-existing keys unchanged`, async () => {
      const { events, pageErrors } = await runScenario(browser, {
        url: `/home.html?token=${NO_MATCH_TOKEN}`,
        cardScopeSelector: '.empty-state-alternatives .pool-card'
      });
      const views = events.filter((e) => e.eventName === 'pool_view');
      const clicks = events.filter((e) => e.eventName === 'pool_click');
      if (views.length !== 1) throw new Error(`expected exactly one pool_view, got ${JSON.stringify(views)}`);
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click, got ${JSON.stringify(clicks)}`);
      assertPayloadShape('empty-state-alt pool_view', views[0].eventData, expectedPoolViewKeys, EXPECT_EMPTY_ALT);
      assertPayloadShape('empty-state-alt pool_click', clicks[0].eventData, expectedPoolClickKeys, EXPECT_EMPTY_ALT);
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
    });

    await test(`dead-pool alternatives (surface="${EXPECT_DEAD_ALT}"): pool_click AND pool_view both carry it, all pre-existing keys unchanged`, async () => {
      const { events, pageErrors } = await runScenario(browser, {
        url: `/home.html?pool=${DEAD_ID}`,
        cardScopeSelector: '.empty-state-alternatives .pool-card'
      });
      const views = events.filter((e) => e.eventName === 'pool_view');
      const clicks = events.filter((e) => e.eventName === 'pool_click');
      if (views.length !== 1) throw new Error(`expected exactly one pool_view, got ${JSON.stringify(views)}`);
      if (clicks.length !== 1) throw new Error(`expected exactly one pool_click, got ${JSON.stringify(clicks)}`);
      assertPayloadShape('dead-pool-alt pool_view', views[0].eventData, expectedPoolViewKeys, EXPECT_DEAD_ALT);
      assertPayloadShape('dead-pool-alt pool_click', clicks[0].eventData, expectedPoolClickKeys, EXPECT_DEAD_ALT);
      if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\ntest_pool_click_surface.js: ${passed}/${total} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
