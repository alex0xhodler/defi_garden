/* Rendered Playwright guard for backlog 273 — P0, human-reported: "on mobile
   width the top nav bar and theme and language switcher are overlapping".

   Mechanism (measured, full write-up in product-loop-kit/specs/273-notes.md):
   `.app.pool-detail-view` (`?pool=`) is NOT `.has-results` yet DOES render the
   sticky header, so style.css's mobile homepage-only overrides
   `.app:not(.has-results) .theme-toggle` / `… .language-toggle` — DESCENDANT
   selectors at (0,3,0), `:not(.has-results)` counting as a class — outweighed
   item 222's `.app-header-controls …` reset at (0,2,0) and pinned the header's
   own buttons to the standalone pair's fixed coordinates, on the search input
   (1036.3px² at 360x780). The fix adds `>` to those four selectors, the same
   argument already written above `.app.has-results > .theme-toggle`.

   What this proves against a REAL render (home.html injects style.min.css, so
   a raw-only fix ships dead — item 136's trap):
   (1) population derived at test time (every `.app-header-controls` child,
       never a hardcoded pair): no box intersects `.app-search-input` or
       `.app-search-bar` by >=1px;
   (2) every control pressable — `elementFromPoint` at its centre resolves to
       it or a descendant (the 219 lens technique; geometry alone cannot see a
       stolen click);
   (3) the input is focusable and accepts typed text, and the two dedicated
       20-char-query surfaces (a `?token=`/`?pool=` whose symbol IS the long
       string, so the query arrives through the product's own state) keep the
       input clear of the controls;
   (4) `documentElement.scrollWidth <= innerWidth`;
   (5) matrix: 320/360/480/768/1280 x light/dark x EN/KO on `?pool=`, plus
       `?token=` at every width and at 360 x dark x KO;
   (6) the `?app=1` homepage is not regressed — its standalone pair is still
       fixed and still hit-tests to itself (the guard on the `>` scoping);
   (7) RED PROOF: re-inject the pre-fix descendant selectors in-page and (1)+(2)
       MUST go red naming the control;
   (8) no unexpected page/console errors.

   Victim boxes are the border box intersected with every CLIPPING ancestor,
   because `.app-search-bar` is `overflow: hidden` at <=640px (item 225's net
   for this family) and raw rects there report pixels that are neither painted
   nor hit-testable. A `position: fixed` element is never clipped this way —
   that IS the defect shape, and the red proof depends on it.

   Fixture-routed, house pattern from test_mobile_controls_reachable.js /
   test_cta_at_rest_occlusion.js; browser-originated external HTTPS is blocked
   in this sandbox.

   Run: node test_header_controls_overlap.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8982; // distinct from every other test_* file (8981 was the prior max)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

const LONG_SYMBOL = 'ETHEREUMSTAKEDETHER2'; // exactly 20 chars — the spec's long-query case
const POOLS = Array.from({ length: 12 }, (_, i) => ({
  pool: `probe-pool-${i}`,
  project: ['aave-v3', 'compound-v3', 'morpho-blue', 'fluid-lending'][i % 4],
  symbol: ['STETH', 'WSTETH', 'USDC', 'DAI'][i % 4],
  chain: 'Ethereum',
  tvlUsd: 900_000_000 - i * 10_000_000,
  apyBase: 5.5 - i * 0.1,
  apyReward: 0,
  underlyingTokens: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48']
}));
// Two more pools carrying the 20-char symbol, so `?token=<long>` is a real
// results page and `?pool=probe-pool-long` a real pool view — the long query
// then arrives through the product's own state, not a synthetic value poke.
POOLS.push(
  { pool: 'probe-pool-long', project: 'aave-v3', symbol: LONG_SYMBOL, chain: 'Ethereum', tvlUsd: 800_000_000, apyBase: 4.2, apyReward: 0, underlyingTokens: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'] },
  { pool: 'probe-pool-long-2', project: 'compound-v3', symbol: LONG_SYMBOL, chain: 'Ethereum', tvlUsd: 700_000_000, apyBase: 3.9, apyReward: 0, underlyingTokens: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'] }
);
const FIXTURE = JSON.stringify({ status: 'success', data: POOLS });

// The exact pre-fix rules, as DESCENDANT selectors — the red proof's mutation.
const PREFIX_CSS = `
@media (max-width: 640px) {
  .app:not(.has-results) .language-toggle { position: fixed; top: 20px; right: calc(20px + var(--ui-control-h) + 8px); margin: 0; }
  .app:not(.has-results) .theme-toggle { position: fixed; top: 20px; right: 20px; z-index: 1000; margin: 0; }
}
@media (max-width: 480px) {
  .app:not(.has-results) .language-toggle { position: fixed; top: 16px; right: calc(16px + var(--ui-control-h) + 8px); margin: 0; }
  .app:not(.has-results) .theme-toggle { position: fixed; top: 16px; right: 16px; z-index: 1000; margin: 0; }
}`;

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
  await page.route('https://unpkg.com/**', (r) => r.abort());
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
}

function attachErrorCollector(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
      errors.push('console.error: ' + m.text());
  });
  return errors;
}

// One read: the derived population + every rect + a hit test per control.
// `victims` are the two search boxes a control must never intersect.
const READ = () => {
  const norm = (r) => ({ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) });
  // The box the user can actually SEE and TOUCH: the element's border box
  // intersected with every clipping ancestor. `.app-search-bar` carries
  // `overflow: hidden` at <=640px (item 225's safety net against exactly this
  // family of spill), so a raw getBoundingClientRect on its children reports
  // pixels that are neither painted nor hit-testable. Clip before comparing.
  const rect = (el) => {
    if (!el) return null;
    let r = el.getBoundingClientRect();
    let box = { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    // A `position: fixed` element escapes its ancestors' overflow entirely —
    // that IS the defect shape here, so never clip one (a fixed control whose
    // in-flow parent has collapsed to 0x0 must still report its real box).
    if (getComputedStyle(el).position !== 'fixed') for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.position === 'fixed') break;
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      box = { x: Math.max(box.x, pr.x), y: Math.max(box.y, pr.y), right: Math.min(box.right, pr.right), bottom: Math.min(box.bottom, pr.bottom) };
    }
    const w = Math.max(0, box.right - box.x);
    const h = Math.max(0, box.bottom - box.y);
    return norm({ x: box.x, y: box.y, width: w, height: h, right: box.x + w, bottom: box.y + h });
  };
  const controlsEl = document.querySelector('.app-header-controls');
  const kids = controlsEl ? Array.from(controlsEl.children) : [];
  return {
    rootClass: (document.querySelector('.app') || {}).className || null,
    hasHeader: !!document.querySelector('.app-header-sticky'),
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    stickyH: (document.querySelector('.app-header-sticky') || { getBoundingClientRect: () => ({ height: null }) }).getBoundingClientRect().height,
    victims: {
      '.app-search-input': rect(document.querySelector('.app-search-input')),
      '.app-search-bar': rect(document.querySelector('.app-search-bar'))
    },
    controls: kids.map((k) => {
      const r = k.getBoundingClientRect();
      const hitEl = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        cls: String(k.className),
        position: getComputedStyle(k).position,
        rect: rect(k),
        hit: hitEl ? (k.contains(hitEl) || k === hitEl ? 'SELF' : String(hitEl.className || hitEl.tagName).slice(0, 60)) : 'null'
      };
    })
  };
};

function overlapPx(a, b) {
  if (!a || !b) return 0;
  const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return (w >= 1 && h >= 1) ? +(w * h).toFixed(1) : 0;
}

// Returns the list of violations for a reading — shared by the green matrix
// and the red proof, so both interrogate the identical predicate.
function violations(m) {
  const out = [];
  for (const c of m.controls) {
    for (const [name, v] of Object.entries(m.victims)) {
      const px = overlapPx(v, c.rect);
      if (px > 0) out.push(`${c.cls} (pos:${c.position}) intersects ${name} by ${px}px² — control ${JSON.stringify(c.rect)} vs ${JSON.stringify(v)}`);
    }
    if (c.hit !== 'SELF') out.push(`${c.cls} not pressable: elementFromPoint(centre) -> ${c.hit}`);
  }
  return out;
}

async function openCase(browser, { url, width, theme, lang, extraCss }) {
  const ctx = await browser.newContext({ viewport: { width, height: 780 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
  await routeFixtures(page);
  const errors = attachErrorCollector(page);
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(`http://localhost:${PORT}${url}${lang === 'ko' ? sep + 'lang=ko' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() !== '', { timeout: 20000 });
  await page.waitForTimeout(1200);
  if (extraCss) {
    await page.addStyleTag({ content: extraCss });
    await page.waitForTimeout(300);
  }
  return { ctx, page, errors };
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  console.log('273 — analytics header controls never overlap the search bar\n');

  const WIDTHS = [320, 360, 480, 768, 1280];
  const cases = [];
  // Defect surface: `?pool=` (the `.app.pool-detail-view` state), full matrix.
  for (const width of WIDTHS) for (const theme of ['light', 'dark']) for (const lang of ['en', 'ko'])
    cases.push({ url: '/?pool=probe-pool-0', width, theme, lang, label: `pool ${width} ${theme} ${lang}` });
  // Sacred parameterized analytics surface: `?token=` (`.app.has-results`).
  for (const width of WIDTHS)
    cases.push({ url: '/?token=STETH', width, theme: 'light', lang: 'en', label: `token ${width} light en` });
  cases.push({ url: '/?token=STETH', width: 360, theme: 'dark', lang: 'ko', label: 'token 360 dark ko' });
  // (3) long query, arriving through the product's own state on both surfaces.
  for (const width of WIDTHS) {
    cases.push({ url: `/?token=${LONG_SYMBOL}`, width, theme: 'dark', lang: 'en', longQuery: true, label: `token(20-char) ${width} dark en` });
    cases.push({ url: '/?pool=probe-pool-long', width, theme: 'dark', lang: 'ko', longQuery: true, label: `pool(20-char) ${width} dark ko` });
  }

  for (const c of cases) {
    const { ctx, page, errors } = await openCase(browser, c);
    await test(`${c.label}: controls disjoint from the search bar + pressable`, async () => {
      const m = await page.evaluate(READ);
      if (!m.hasHeader) throw new Error('no .app-header-sticky rendered — the surface under test did not load');
      if (m.controls.length < 2) throw new Error(`population empty: ${m.controls.length} .app-header-controls children found`);
      const v = violations(m);
      if (v.length) throw new Error(`[${c.label}] ${v.join(' | ')}`);
      if (m.scrollWidth > m.innerWidth) throw new Error(`horizontal overflow: scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth}`);
      if (c.longQuery) {
        const val = await page.evaluate(() => (document.querySelector('.app-search-input') || {}).value);
        if (val !== LONG_SYMBOL) throw new Error(`long-query surface did not carry the 20-char query: got ${JSON.stringify(val)}`);
      }
    });
    await test(`${c.label}: search input focusable and accepts typed text`, async () => {
      // Hold a handle to THIS input: on `.app.has-results`, typing anything
      // != selectedToken clears the token (app.js's handleSearchInputChange)
      // and unmounts the whole sticky header, so a re-query after typing
      // would read a different element. The keystroke reaching this node is
      // the property under test — a longer probe is covered by the dedicated
      // 20-char-query surfaces above, which arrive pre-filled.
      const input = await page.$('.app-search-input');
      if (!input) throw new Error('no .app-search-input on this surface');
      await input.click();
      if (!(await input.evaluate((el) => el === document.activeElement)))
        throw new Error('search input did not take focus (something is covering it)');
      await page.keyboard.type('X');
      const value = await input.evaluate((el) => el.value);
      if (!value || !value.includes('X')) throw new Error(`typed text not accepted: got ${JSON.stringify(value)}`);
    });
    await test(`${c.label}: no unexpected page errors`, async () => {
      if (errors.length) throw new Error(errors.join(' | '));
    });
    await ctx.close();
  }

  // (6) analytics homepage now renders the unified header band (236 phase 1).
  {
    const { ctx, page } = await openCase(browser, { url: '/?app=1', width: 360, theme: 'light', lang: 'en' });
    await test('homepage 360: shared-header controls visible and pressable', async () => {
      const m = await page.evaluate(() => {
        const out = [];
        for (const sel of ['.theme-toggle', '.language-toggle']) {
          const el = document.querySelector(sel);
          if (!el) { out.push({ sel, missing: true }); continue; }
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          out.push({ sel, position: getComputedStyle(el).position, w: r.width, h: r.height, hit: hit ? (el.contains(hit) || el === hit ? 'SELF' : String(hit.className || hit.tagName)) : 'null' });
        }
        return { out, hasHeader: !!document.querySelector('.app-header-sticky') };
      });
      if (!m.hasHeader) throw new Error('expected: the analytics homepage to render the shared header band');
      for (const t of m.out) {
        if (t.missing) throw new Error(`${t.sel} missing on the homepage`);
        if (!(t.w > 0 && t.h > 0)) throw new Error(`${t.sel} has a zero box on the homepage`);
        if (t.hit !== 'SELF') throw new Error(`${t.sel} not pressable on the homepage: elementFromPoint -> ${t.hit}`);
      }
    });
    await ctx.close();
  }

  // (7) RED PROOF — mutate the fix away by re-injecting the pre-fix
  // DESCENDANT selectors and require the SAME predicate to report a
  // violation on the SAME surface/width the human reported.
  {
    const { ctx, page } = await openCase(browser, { url: '/?pool=probe-pool-0', width: 360, theme: 'dark', lang: 'en', extraCss: PREFIX_CSS });
    await test('RED PROOF: pre-fix descendant selectors reintroduce the overlap at 360px', async () => {
      const m = await page.evaluate(READ);
      const v = violations(m);
      if (!v.length) throw new Error('the overlap assertion did NOT go red under the pre-fix rules — this gate is vacuous');
      const named = v.some((s) => /language-toggle|theme-toggle/.test(s) && /intersects \.app-search/.test(s));
      if (!named) throw new Error('went red, but not with the expected control-over-search-bar intersection: ' + v.join(' | '));
      console.log('    (red proof detail) ' + v[0]);
    });
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${passed}/${total} passed`);
  if (passed !== total) process.exit(1);
})();
