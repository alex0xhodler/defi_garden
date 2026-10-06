/* test_lang_menu.js — the header language menu (EN · KO · PT · ES) and the
   landing's pt/es suggestion banner, plus the landing <title>.

   Contract under test (lang-menu.js, landing.js, app.js, home.html):
     (a) static: lang-menu.js's PT/ES hrefs/hreflang/lang agree with
         languages.js; translations.js carries the new menu keys in en AND ko;
         the landing's EN JS title equals home.html's static <title>/og:title
         (the planner-era pageTitle used to overwrite it) and KO is Korean.
     (b) the menu, on the landing AND on the analytics grid AND on pool detail:
         exactly one trigger; closed = no panel; open = 4 items — EN/KO are
         <button>s, PT/ES are real <a href> to /pt/tokens and /es/tokens with
         hreflang + lang + an accessible name that says Portuguese/Spanish pages;
         the current language carries aria-current; Escape closes and returns
         focus to the trigger; an outside press closes; Tab out closes.
     (c) EN -> KO still switches in-app (<html lang>, ?lang, localStorage
         defi-garden-lang, Korean UI text) and back; PT/ES do NOT switch the app.
     (d) 360px: no horizontal overflow, panel fully inside the viewport, with
         the menu open, light and dark.
     (e) landing title: EN equals the HTML title (and og:title); ?lang=ko is the
         KO title.
     (f) suggestion banner (landing only): pt-BR -> /pt/tokens, es-MX ->
         /es/tokens, en-US / ko-KR / fr -> nothing in the DOM; dismiss persists
         across reload; it adds zero layout (hero card rect identical with and
         without it; no scroll jump on the desktop snap layout); the app grid
         never renders it.
     (g) no page errors.

   Fixture-routed like the other header tests (house pattern: icons aborted,
   snapshot 404, yields.llama.fi fulfilled with a small fixture).
   Run: node test_lang_menu.js */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8983;
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|pools-snapshot|Failed to load resource/i;

const EN_TITLE = 'DeFi Yields Scored & Forecasted: Live Rates Above $100K TVL | DeFi Garden';
const POOLS = Array.from({ length: 12 }, (_, i) => ({
  pool: `probe-pool-${i}`,
  project: ['aave-v3', 'compound-v3', 'morpho-blue', 'fluid-lending'][i % 4],
  symbol: ['USDC', 'STEAKUSDC', 'USDT', 'DAI'][i % 4],
  chain: 'Ethereum',
  tvlUsd: 900_000_000 - i * 10_000_000,
  apyBase: 5.5 - i * 0.1,
  apyReward: 0,
  underlyingTokens: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48']
}));
const FIXTURE = JSON.stringify({ status: 'success', data: POOLS });

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

async function newPage(browser, { width = 1280, height = 800, locale = 'en-US', theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale, colorScheme: theme });
  await ctx.addInitScript((th) => { try { if (!localStorage.getItem('theme')) localStorage.setItem('theme', th); } catch (e) { /* ignore */ } }, theme);
  const page = await ctx.newPage();
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());
  await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
  await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text())) errors.push('console.error: ' + m.text());
  });
  return { ctx, page, errors };
}

const base = () => `http://localhost:${PORT}`;
async function openLanding(page, query = '') {
  await page.goto(`${base()}/home.html${query}`, { waitUntil: 'load' });
  await page.waitForSelector('.landing-header .lang-menu-trigger', { timeout: 15000 });
}
async function openApp(page, query = '?token=USDC') {
  await page.goto(`${base()}/home.html${query}`, { waitUntil: 'load' });
  await page.waitForSelector('.app-header-controls .lang-menu-trigger', { timeout: 20000 });
}

async function readItems(page) {
  return page.$$eval('.lang-menu-panel li > *', (els) => els.map((el) => ({
    tag: el.tagName.toLowerCase(),
    code: el.getAttribute('data-lang'),
    text: el.firstElementChild ? el.firstElementChild.textContent : '',
    href: el.getAttribute('href'),
    hreflang: el.getAttribute('hreflang'),
    lang: el.getAttribute('lang'),
    aria: el.getAttribute('aria-label'),
    current: el.getAttribute('aria-current')
  })));
}

function assertMenuShape(items, current) {
  assert.deepStrictEqual(items.map((i) => i.code), ['en', 'ko', 'pt', 'es'], 'menu order EN, KO, PT, ES');
  assert.deepStrictEqual(items.map((i) => i.tag), ['button', 'button', 'a', 'a'], 'EN/KO are buttons, PT/ES are real links');
  assert.deepStrictEqual(items.map((i) => i.text), ['English', '한국어', 'Português', 'Español']);
  const pt = items[2]; const es = items[3];
  assert.strictEqual(pt.href, '/pt/tokens');
  assert.strictEqual(es.href, '/es/tokens');
  assert.strictEqual(pt.hreflang, 'pt');
  assert.strictEqual(es.hreflang, 'es');
  assert.strictEqual(pt.lang, 'pt-BR');
  assert.strictEqual(es.lang, 'es');
  assert.ok(/Portugu/.test(pt.aria) && /p[áa]ginas/.test(pt.aria), 'PT accessible name says Portuguese pages: ' + pt.aria);
  assert.ok(/Espa/.test(es.aria) && /p[áa]ginas/.test(es.aria), 'ES accessible name says Spanish pages: ' + es.aria);
  items.forEach((i) => {
    if (i.code === current) assert.strictEqual(i.current, 'true', i.code + ' should be aria-current');
    else assert.strictEqual(i.current, null, i.code + ' must not be aria-current');
  });
}

async function menuBehaviour(page, label) {
  const trigger = page.locator('.lang-menu-trigger');
  assert.strictEqual(await trigger.count(), 1, label + ': exactly one language trigger');
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 0, label + ': closed menu renders no panel');
  assert.strictEqual(await trigger.getAttribute('aria-expanded'), 'false');
  assert.ok(/Language/.test(await trigger.getAttribute('aria-label')), label + ': trigger has an accessible name');

  await trigger.click();
  assert.strictEqual(await trigger.getAttribute('aria-expanded'), 'true');
  assertMenuShape(await readItems(page), 'en');

  // Escape closes and returns focus to the trigger (focus first moved inside).
  await page.locator('.lang-menu-item').first().focus();
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 0, label + ': Escape closes');
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('lang-menu-trigger')), label + ': focus returns to trigger');

  // Keyboard open (Enter on the focused trigger), Tab walks the four items, Tab out closes.
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 1, label + ': Enter opens');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement.getAttribute('data-lang')) === 'es', label + ': Tab reaches the last item');
  await page.keyboard.press('Tab');
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 0, label + ': tabbing out closes');

  // Outside press closes.
  await trigger.click();
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 1);
  await page.mouse.click(5, 400);
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 0, label + ': outside press closes');
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // ---- (a) static ------------------------------------------------------
    console.log('(a) static contract');
    const langs = require('./languages.js');
    const menuSrc = fs.readFileSync(path.join(ROOT, 'lang-menu.js'), 'utf8');
    await test('lang-menu.js PT/ES entries agree with languages.js (prefix, hreflang, htmlLang) and link to the hubs', () => {
      ['pt', 'es'].forEach((code) => {
        const l = langs.getLanguage(code);
        assert.ok(menuSrc.includes(`href: '${l.pathPrefix}/tokens'`), code + ' href');
        assert.ok(menuSrc.includes(`hreflang: '${l.hreflang}'`), code + ' hreflang');
        assert.ok(menuSrc.includes(`lang: '${l.htmlLang}'`), code + ' lang');
        assert.ok(menuSrc.includes(`name: '${l.label}'`), code + ' native name');
        assert.ok(fs.existsSync(path.join(ROOT, l.pathPrefix.slice(1), 'tokens', 'index.html')), code + ' hub exists on disk');
      });
    });
    await test('translations.js: menu keys exist in en AND ko; landing JS title is the HTML title (EN) and Korean (KO)', () => {
      const { translations } = require('./translations.js');
      ['langMenuLabel', 'langNameEn', 'langNameKo'].forEach((k) => {
        assert.ok(translations.en[k] && translations.ko[k], k + ' in both dictionaries');
      });
      assert.notStrictEqual(translations.en.langMenuLabel, translations.ko.langMenuLabel, 'KO menu label is translated');
      assert.strictEqual(translations.en.landing.pageTitle, EN_TITLE);
      assert.ok(/[가-힣]/.test(translations.ko.landing.pageTitle), 'KO landing title is Korean');
      const html = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8').replace(/&amp;/g, '&');
      assert.ok(html.includes('<title>' + EN_TITLE + '</title>'), 'home.html <title> is the expected EN title');
      assert.ok(html.includes('og:title" content="' + EN_TITLE + '"'), 'home.html og:title is the expected EN title');
    });

    // ---- (b)/(c) landing menu --------------------------------------------
    console.log('(b)/(c) landing');
    {
      const { ctx, page, errors } = await newPage(browser);
      await openLanding(page);
      await test('landing: menu shape, Escape / Tab-out / outside-press behaviour', async () => { await menuBehaviour(page, 'landing'); });
      await test('landing: EN -> KO switches in-app (html lang, ?lang, localStorage, Korean UI), then back', async () => {
        await page.locator('.lang-menu-trigger').click();
        await page.locator('.lang-menu-item[data-lang="ko"]').click();
        await page.waitForFunction(() => document.documentElement.lang === 'ko');
        assert.strictEqual(new URL(page.url()).searchParams.get('lang'), 'ko');
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('defi-garden-lang')), 'ko');
        assert.ok(/[가-힣]/.test(await page.locator('.landing-nav').innerText()), 'nav is Korean');
        assert.strictEqual((await page.locator('.lang-menu-trigger').innerText()).trim(), 'KO');
        assert.ok(/언어/.test(await page.locator('.lang-menu-trigger').getAttribute('aria-label')), 'trigger name is Korean');
        await page.locator('.lang-menu-trigger').click();
        const items = await readItems(page);
        assertMenuShape(items, 'ko');
        await page.locator('.lang-menu-item[data-lang="en"]').click();
        await page.waitForFunction(() => document.documentElement.lang === 'en');
        assert.strictEqual(new URL(page.url()).searchParams.get('lang'), null);
        assert.strictEqual((await page.locator('.lang-menu-trigger').innerText()).trim(), 'EN');
        assert.ok(/Search yields/.test(await page.locator('.landing-nav').innerText()));
      });
      await test('landing: PT/ES items navigate (real links), they do not switch the app language', async () => {
        await page.locator('.lang-menu-trigger').click();
        const href = await page.locator('.lang-menu-item[data-lang="pt"]').getAttribute('href');
        assert.strictEqual(href, '/pt/tokens');
        assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'en');
      });
      await test('landing: no page errors', async () => { assert.deepStrictEqual(errors, []); });
      await ctx.close();
    }

    // ---- (e) landing title -------------------------------------------------
    console.log('(e) landing title');
    for (const [q, expectKo] of [['', false], ['?lang=ko', true]]) {
      const { ctx, page } = await newPage(browser);
      await test(`landing ${q || '(EN)'}: document.title + og:title`, async () => {
        await openLanding(page, q);
        await page.waitForFunction((ko) => ko ? /[가-힣]/.test(document.title) : document.title.length > 0, expectKo);
        const got = await page.evaluate(() => ({ title: document.title, og: document.querySelector('meta[property="og:title"]').content }));
        if (expectKo) {
          const { translations } = require('./translations.js');
          assert.strictEqual(got.title, translations.ko.landing.pageTitle);
          assert.ok(/[가-힣]/.test(got.title));
        } else {
          assert.strictEqual(got.title, EN_TITLE);
        }
        assert.strictEqual(got.og, got.title, 'og:title matches document.title');
      });
      await ctx.close();
    }

    // ---- (d) 360px landing + app, light + dark ----------------------------
    console.log('(d) 360px');
    for (const theme of ['light', 'dark']) {
      for (const [name, open] of [['landing', openLanding], ['app', openApp]]) {
        const { ctx, page } = await newPage(browser, { width: 360, height: 740, theme });
        await test(`${name} 360px ${theme}: menu open has no horizontal overflow and the panel is inside the viewport`, async () => {
          await open(page);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 360, 'closed overflow');
          await page.locator('.lang-menu-trigger').click();
          await page.waitForSelector('.lang-menu-panel');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 360, 'open overflow');
          const r = await page.locator('.lang-menu-panel').boundingBox();
          assert.ok(r.x >= 0 && r.x + r.width <= 360, 'panel inside viewport: ' + JSON.stringify(r));
          // The panel paints on top: its centre hit-tests to a menu item.
          const hit = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('.lang-menu-panel')); }, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
          assert.ok(hit, 'panel is not covered by other content');
        });
        await ctx.close();
      }
    }

    // ---- (b)/(c) analytics grid + pool detail ----------------------------
    console.log('(b)/(c) analytics grid and pool detail');
    {
      const { ctx, page, errors } = await newPage(browser);
      await openApp(page);
      await test('app grid: menu shape + keyboard behaviour; trigger keeps the .language-toggle hook', async () => {
        assert.strictEqual(await page.locator('.language-toggle').count(), 1);
        await menuBehaviour(page, 'app');
      });
      await test('app grid: EN -> KO switches in-app and back (UI text, ?lang, localStorage)', async () => {
        await page.locator('.lang-menu-trigger').click();
        await page.locator('.lang-menu-item[data-lang="ko"]').click();
        await page.waitForFunction(() => document.documentElement.lang === 'ko');
        assert.strictEqual(new URL(page.url()).searchParams.get('lang'), 'ko');
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('defi-garden-lang')), 'ko');
        assert.ok(/[가-힣]/.test(await page.evaluate(() => document.body.innerText)), 'grid UI is Korean');
        assert.strictEqual((await page.locator('.lang-menu-trigger').innerText()).trim(), 'KO');
        await page.locator('.lang-menu-trigger').click();
        await page.locator('.lang-menu-item[data-lang="en"]').click();
        await page.waitForFunction(() => document.documentElement.lang === 'en');
        assert.strictEqual(new URL(page.url()).searchParams.get('lang'), null);
      });
      await test('app grid: never renders the suggestion banner', async () => { assert.strictEqual(await page.locator('.lang-suggest').count(), 0); });
      await test('app grid: no page errors', async () => { assert.deepStrictEqual(errors, []); });
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await newPage(browser);
      await openApp(page, '?pool=probe-pool-0');
      await test('pool detail: same header menu (4 items, PT/ES links), one trigger', async () => {
        await page.waitForSelector('.pool-detail-view', { timeout: 20000 });
        await page.locator('.lang-menu-trigger').click();
        assertMenuShape(await readItems(page), 'en');
        assert.strictEqual(await page.locator('.lang-menu-trigger').count(), 1);
      });
      await test('pool detail: no page errors', async () => { assert.deepStrictEqual(errors, []); });
      await ctx.close();
    }

    // ---- (f) suggestion banner -------------------------------------------
    console.log('(f) suggestion banner');
    const rectOf = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
    for (const [locale, href, text] of [['pt-BR', '/pt/tokens', 'Ver rendimentos em português →'], ['es-MX', '/es/tokens', 'Ver rendimientos en español →']]) {
      const { ctx, page, errors } = await newPage(browser, { locale });
      await test(`${locale}: banner shows with link ${href}; dismiss persists across reload; no redirect`, async () => {
        await openLanding(page);
        await page.waitForSelector('.lang-suggest');
        assert.ok(new URL(page.url()).pathname.endsWith('/home.html'), 'no redirect');
        const link = page.locator('.lang-suggest-link');
        assert.strictEqual(await link.getAttribute('href'), href);
        assert.strictEqual((await link.innerText()).trim(), text);
        assert.ok(await link.getAttribute('hreflang'));
        const dismiss = page.locator('.lang-suggest-dismiss');
        assert.ok((await dismiss.getAttribute('aria-label')).length > 3, 'dismiss has an accessible name');
        await dismiss.click();
        assert.strictEqual(await page.locator('.lang-suggest').count(), 0);
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('.landing-header .lang-menu-trigger');
        assert.strictEqual(await page.locator('.lang-suggest').count(), 0, 'stays dismissed after reload');
      });
      await test(`${locale}: still works when localStorage throws (dismiss is in-session, nothing crashes)`, async () => {
        const c2 = await newPage(browser, { locale });
        await c2.ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        await c2.page.goto(`${base()}/home.html`, { waitUntil: 'load' });
        await c2.page.waitForSelector('.lang-suggest');
        await c2.page.locator('.lang-suggest-dismiss').click();
        assert.strictEqual(await c2.page.locator('.lang-suggest').count(), 0);
        await c2.ctx.close();
      });
      await test(`${locale}: no page errors`, async () => { assert.deepStrictEqual(errors, []); });
      await ctx.close();
    }
    for (const locale of ['en-US', 'ko-KR', 'fr-FR']) {
      const { ctx, page } = await newPage(browser, { locale });
      await test(`${locale}: renders nothing (no banner in the DOM)`, async () => {
        await openLanding(page);
        await page.waitForTimeout(300);
        assert.strictEqual(await page.locator('.lang-suggest').count(), 0);
      });
      await ctx.close();
    }
    for (const [w, h] of [[360, 740], [1280, 800]]) {
      await test(`${w}x${h}: banner adds zero layout — hero card rect identical with and without it, no scroll jump`, async () => {
        const withB = await newPage(browser, { width: w, height: h, locale: 'pt-BR' });
        const without = await newPage(browser, { width: w, height: h, locale: 'en-US' });
        await openLanding(withB.page); await openLanding(without.page);
        await withB.page.waitForSelector('.lang-suggest');
        await withB.page.waitForSelector('[data-testid="landing-underwriting-card"]');
        await withB.page.waitForTimeout(600); await without.page.waitForTimeout(600);
        const a = await rectOf(withB.page, '.landing-hero-underwriting');
        const b = await rectOf(without.page, '.landing-hero-underwriting');
        assert.deepStrictEqual(a, b, 'hero rect differs with banner: ' + JSON.stringify({ a, b }));
        const sa = await rectOf(withB.page, '.lang-suggest');
        const hdr = await rectOf(withB.page, '.landing-header');
        assert.ok(sa.y >= hdr.y + hdr.h - 1, 'banner sits under the header');
        assert.ok(sa.x >= 0 && sa.x + sa.w <= w, 'banner inside viewport width');
        assert.ok(sa.h <= 40, 'banner is one compact line, got ' + sa.h);
        assert.strictEqual(await withB.page.evaluate(() => window.scrollY), 0, 'no scroll jump (snap layout)');
        assert.ok(await withB.page.evaluate(() => document.documentElement.scrollWidth) <= w, 'no horizontal overflow');
        // The banner must not cover the hero headline or the status line.
        const overlap = await withB.page.evaluate(() => {
          const s = document.querySelector('.lang-suggest').getBoundingClientRect();
          return ['.landing-uw-status', '#landing-uw-title'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return !(r.bottom <= s.top || r.top >= s.bottom || r.right <= s.left || r.left >= s.right); });
        });
        assert.deepStrictEqual(overlap, [false, false], 'banner overlaps hero copy');
        await withB.ctx.close(); await without.ctx.close();
      });
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed}/${total} passed`);
  if (passed !== total) process.exitCode = 1;
})().catch((err) => { console.error(err); process.exit(1); });
