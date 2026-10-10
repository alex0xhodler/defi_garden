/* test_lang_menu.js — the header language menu (EN · KO · PT · ES) and the
   landing's one-line language suggestion, plus the landing <title>/description.

   Contract under test (lang-menu.js, landing.js, app.js, translations.js):
     (a) static: translations.js has en/ko/pt/es with identical key sets; the
         supported list and html-lang map are right; normalizeLanguageCode maps
         regional tags (pt-BR -> pt, es-MX -> es, fr-FR -> null); `t` falls back
         to EN per key; lang-menu.js builds no <a> items; the landing's EN JS
         title equals home.html's static <title>/og:title.
     (b) the menu, on the landing, the analytics grid and pool detail: exactly one
         trigger; closed = no panel; open = 4 items, all <button>s with
         data-lang en | ko | pt | es, in that order; the current language carries
         aria-current; Escape closes and returns focus to the trigger; an outside
         press closes; Tab out closes.
     (c) every item switches the app IN-APP: <html lang> (en, ko, pt-BR, es),
         ?lang=<code> (en drops the param), localStorage 'defi-garden-lang', the
         trigger text (EN/KO/PT/ES), and the UI text. No navigation.
     (d) 360px: no horizontal overflow, panel fully inside the viewport, with the
         menu open, light and dark (landing and app).
     (e) landing title + meta description come from the active language's
         dictionary (EN default, ?lang=ko, ?lang=pt, ?lang=es).
     (f) suggestion banner (landing only): shows when the first supported browser
         language differs from the current app language; pt-BR and es-MX show it;
         en-US, ko-KR (auto-detected as ko, so no difference) and fr-FR do not.
         Its button switches the app in-app; the dismiss button persists
         defi-garden-lang-suggest-dismissed=1 (inside try/catch). It adds zero
         layout, and the app grid never renders it.
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

const { translations, SUPPORTED_LANGUAGES, normalizeLanguageCode, HTML_LANG, createTranslationFunction } = require('./translations.js');

const EN_TITLE = 'DeFi Yields Scored & Forecasted: Live Rates Above $100K TVL | DeFi Garden';
const CODES = ['en', 'ko', 'pt', 'es'];
const HTML_LANG_OF = { en: 'en', ko: 'ko', pt: 'pt-BR', es: 'es' };
const TRIGGER_TEXT = { en: 'EN', ko: 'KO', pt: 'PT', es: 'ES' };
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
    type: el.getAttribute('type'),
    href: el.getAttribute('href'),
    current: el.getAttribute('aria-current')
  })));
}

function assertMenuShape(items, current) {
  assert.deepStrictEqual(items.map((i) => i.code), CODES, 'menu order EN, KO, PT, ES');
  assert.deepStrictEqual(items.map((i) => i.tag), ['button', 'button', 'button', 'button'], 'all four items are buttons (in-app switches)');
  assert.deepStrictEqual(items.map((i) => i.type), ['button', 'button', 'button', 'button']);
  assert.ok(items.every((i) => i.href === null), 'no item carries an href');
  assert.deepStrictEqual(items.map((i) => i.text), ['English', '한국어', 'Português', 'Español']);
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

  // Outside press closes (checked first, from a clean open, see the header note).
  await page.mouse.click(5, 400);
  await page.waitForFunction(() => !document.querySelector('.lang-menu-panel'), null, { timeout: 3000 }).catch(() => {});
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 0, label + ': outside press closes');
  await trigger.click();
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 1, label + ': reopens');

  // Escape closes and returns focus to the trigger (focus first moved inside).
  await page.locator('.lang-menu-item').first().focus();
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 0, label + ': Escape closes');
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('lang-menu-trigger')), label + ': focus returns to trigger');

  // Keyboard open (Enter on the focused trigger), Tab walks the four items, Tab out closes.
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 1, label + ': Enter opens');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  assert.strictEqual(await page.evaluate(() => document.activeElement.getAttribute('data-lang')), 'es', label + ': Tab reaches the last item');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => !document.querySelector('.lang-menu-panel'), null, { timeout: 3000 }).catch(() => {});
  assert.strictEqual(await page.locator('.lang-menu-panel').count(), 0, label + ': tabbing out closes');
}

// Switch language via the header menu and assert the full in-app contract.
async function switchVia(page, code) {
  await page.locator('.lang-menu-trigger').click();
  await page.locator(`.lang-menu-item[data-lang="${code}"]`).click();
  await page.waitForFunction((h) => document.documentElement.lang === h, HTML_LANG_OF[code]);
  const url = new URL(page.url());
  assert.strictEqual(url.pathname.endsWith('/home.html'), true, 'stays on home.html (no navigation): ' + url.pathname);
  assert.strictEqual(url.searchParams.get('lang'), code === 'en' ? null : code, '?lang for ' + code);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('defi-garden-lang')), code, 'localStorage for ' + code);
  assert.strictEqual((await page.locator('.lang-menu-trigger').innerText()).trim(), TRIGGER_TEXT[code], 'trigger text for ' + code);
}

// Landing <title>, og:title and meta description must come from the active dictionary.
async function assertLandingCopy(page, code) {
  const want = translations[code].landing;
  await page.waitForFunction((t) => document.title === t, want.pageTitle, { timeout: 5000 });
  const got = await page.evaluate(() => ({
    title: document.title,
    og: document.querySelector('meta[property="og:title"]').content,
    desc: document.querySelector('meta[name="description"]').content,
    ogDesc: document.querySelector('meta[property="og:description"]').content
  }));
  assert.strictEqual(got.title, want.pageTitle, code + ' document.title');
  assert.strictEqual(got.og, want.pageTitle, code + ' og:title');
  assert.strictEqual(got.desc, want.metaDescription, code + ' meta description');
  assert.strictEqual(got.ogDesc, want.metaDescription, code + ' og:description');
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    // ---- (a) static ------------------------------------------------------
    console.log('(a) static contract');
    await test('translations.js: en/ko/pt/es have identical key sets (flattened paths)', () => {
      const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v)) ? flat(v, p + k + '.') : [p + k]);
      const ref = flat(translations.en).sort();
      CODES.forEach((c) => {
        const keys = flat(translations[c]).sort();
        const missing = ref.filter((k) => !keys.includes(k));
        const extra = keys.filter((k) => !ref.includes(k));
        assert.deepStrictEqual({ missing: missing.slice(0, 5), extra: extra.slice(0, 5) }, { missing: [], extra: [] }, c + ' key parity vs en');
      });
    });
    await test('translations.js: supported list, html-lang map, and menu names (langNamePt/langNameEs) are right', () => {
      assert.deepStrictEqual(SUPPORTED_LANGUAGES, CODES);
      assert.deepStrictEqual(HTML_LANG, HTML_LANG_OF);
      CODES.forEach((c) => {
        assert.strictEqual(translations[c].langNamePt, 'Português', c + ' langNamePt');
        assert.strictEqual(translations[c].langNameEs, 'Español', c + ' langNameEs');
        assert.strictEqual(translations[c].langNameKo, '한국어', c + ' langNameKo');
      });
      assert.ok(/[가-힣]/.test(translations.ko.landing.pageTitle), 'KO landing title is Korean');
    });
    await test('normalizeLanguageCode: pt-BR -> pt, es-MX -> es, ko-KR -> ko, fr-FR -> null', () => {
      assert.strictEqual(normalizeLanguageCode('pt-BR'), 'pt');
      assert.strictEqual(normalizeLanguageCode('es-MX'), 'es');
      assert.strictEqual(normalizeLanguageCode('ko-KR'), 'ko');
      assert.strictEqual(normalizeLanguageCode('fr-FR'), null);
    });
    await test('t(): pt resolves its own string; a key missing from pt falls back to EN per key', () => {
      const tPt = createTranslationFunction('pt');
      assert.strictEqual(tPt('langMenuLabel'), translations.pt.langMenuLabel);
      const saved = translations.pt.langMenuLabel;
      try {
        delete translations.pt.langMenuLabel;
        assert.strictEqual(createTranslationFunction('pt')('langMenuLabel'), translations.en.langMenuLabel, 'per-key EN fallback');
      } finally { translations.pt.langMenuLabel = saved; }
    });
    await test('lang-menu.js builds no <a> items (no hrefs, no hub links) and home.html title/og:title are the EN title', () => {
      const menuSrc = fs.readFileSync(path.join(ROOT, 'lang-menu.js'), 'utf8');
      assert.ok(!/e\('a'/.test(menuSrc), 'no anchor items created');
      assert.ok(!/\bhreflang\s*:/.test(menuSrc), 'no hreflang attributes');
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
      await test('landing: EN -> KO switches in-app (html lang, ?lang, localStorage, Korean UI), then back to EN', async () => {
        await switchVia(page, 'ko');
        assert.ok(/[가-힣]/.test(await page.locator('.landing-nav').innerText()), 'nav is Korean');
        assert.ok(/언어/.test(await page.locator('.lang-menu-trigger').getAttribute('aria-label')), 'trigger name is Korean');
        await page.locator('.lang-menu-trigger').click();
        assertMenuShape(await readItems(page), 'ko');
        await page.keyboard.press('Escape');
        await switchVia(page, 'en');
        assert.ok(/Search yields/.test(await page.locator('.landing-nav').innerText()), 'nav back to English');
      });
      await test('landing: EN -> PT switches in-app; title and meta description come from the pt dictionary', async () => {
        await switchVia(page, 'pt');
        await assertLandingCopy(page, 'pt');
        await switchVia(page, 'en');
      });
      await test('landing: EN -> ES switches in-app; title and meta description come from the es dictionary', async () => {
        await switchVia(page, 'es');
        await assertLandingCopy(page, 'es');
        await switchVia(page, 'en');
        await assertLandingCopy(page, 'en');
      });
      await test('landing: no page errors', async () => { assert.deepStrictEqual(errors, []); });
      await ctx.close();
    }

    // ---- (e) landing title on load ----------------------------------------
    console.log('(e) landing title on load');
    for (const [q, code] of [['', 'en'], ['?lang=ko', 'ko'], ['?lang=pt', 'pt'], ['?lang=es', 'es']]) {
      const { ctx, page } = await newPage(browser);
      await test(`landing ${q || '(EN default)'}: document.title, og:title, meta description from the ${code} dictionary`, async () => {
        await openLanding(page, q);
        await assertLandingCopy(page, code);
        if (code === 'en') {
          assert.strictEqual(translations.en.landing.pageTitle, EN_TITLE);
          const html = fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8');
          const m = html.match(/<meta name="description" content="([^"]+)"/);
          assert.strictEqual(translations.en.landing.metaDescription, m[1], 'EN meta description equals home.html static description');
        }
        assert.ok(!/savings calculator|저축 계산기/.test(translations[code].landing.metaDescription), 'meta description is not planner-era copy');
      });
      await ctx.close();
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
        await switchVia(page, 'ko');
        assert.ok(/[가-힣]/.test(await page.evaluate(() => document.body.innerText)), 'grid UI is Korean');
        await switchVia(page, 'en');
      });
      await test('app grid: EN -> PT and EN -> ES switch in-app (html lang, ?lang, localStorage, trigger)', async () => {
        await switchVia(page, 'pt');
        await switchVia(page, 'es');
        await switchVia(page, 'en');
      });
      await test('app grid: never renders the suggestion banner', async () => { assert.strictEqual(await page.locator('[data-testid="lang-suggest"]').count(), 0); });
      await test('app grid: no page errors', async () => { assert.deepStrictEqual(errors, []); });
      await ctx.close();
    }
    {
      const { ctx, page, errors } = await newPage(browser);
      await openApp(page, '?pool=probe-pool-0');
      await test('pool detail: same header menu (4 buttons, EN/KO/PT/ES), one trigger', async () => {
        await page.waitForSelector('.pool-detail-view', { timeout: 20000 });
        await page.locator('.lang-menu-trigger').click();
        assertMenuShape(await readItems(page), 'en');
        assert.strictEqual(await page.locator('.lang-menu-trigger').count(), 1);
      });
      await test('pool detail: no page errors', async () => { assert.deepStrictEqual(errors, []); });
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

    // ---- (f) suggestion banner -------------------------------------------
    console.log('(f) suggestion banner');
    const rectOf = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }, sel);
    for (const [locale, code, text] of [['pt-BR', 'pt', 'Ver em português →'], ['es-MX', 'es', 'Ver en español →']]) {
      const { ctx, page, errors } = await newPage(browser, { locale });
      // A bare visit auto-detects the browser language (landing.js detectLanguage),
      // so the app is already in pt/es and there is nothing to suggest. The banner
      // only appears when the app is pinned to another language, so these cases pin en.
      await test(`${locale}: bare visit renders ${code} with no banner (suggestion never offers the language already shown)`, async () => {
        await openLanding(page);
        assert.strictEqual(await page.evaluate(() => document.documentElement.lang), HTML_LANG_OF[code]);
        assert.strictEqual(await page.locator('[data-testid="lang-suggest"]').count(), 0);
      });
      await test(`${locale}: banner shows when pinned to en (button, no href, no redirect); dismiss persists across reload`, async () => {
        await openLanding(page, '?lang=en');
        await page.waitForSelector('[data-testid="lang-suggest"]');
        assert.ok(new URL(page.url()).pathname.endsWith('/home.html'), 'no redirect');
        assert.strictEqual(new URL(page.url()).searchParams.get('lang'), 'en', 'banner does not rewrite the pinned ?lang by itself');
        const link = page.locator('.lang-suggest-link');
        assert.strictEqual(await link.evaluate((el) => el.tagName), 'BUTTON');
        assert.strictEqual(await link.getAttribute('href'), null);
        assert.strictEqual((await link.innerText()).trim(), text);
        const dismiss = page.locator('.lang-suggest-dismiss');
        assert.ok((await dismiss.getAttribute('aria-label')).length > 3, 'dismiss has an accessible name');
        await dismiss.click();
        assert.strictEqual(await page.locator('[data-testid="lang-suggest"]').count(), 0);
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('defi-garden-lang-suggest-dismissed')), '1');
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('.landing-header .lang-menu-trigger');
        assert.strictEqual(await page.locator('[data-testid="lang-suggest"]').count(), 0, 'stays dismissed after reload');
      });
      await test(`${locale}: clicking the suggestion switches the app in-app to ${code} (no navigation)`, async () => {
        await openLanding(page, '?lang=en');
        await page.evaluate(() => localStorage.removeItem('defi-garden-lang-suggest-dismissed'));
        await page.reload({ waitUntil: 'load' });
        await page.waitForSelector('[data-testid="lang-suggest"]');
        await page.locator('.lang-suggest-link').click();
        await page.waitForFunction((h) => document.documentElement.lang === h, HTML_LANG_OF[code]);
        assert.strictEqual(new URL(page.url()).searchParams.get('lang'), code);
        assert.strictEqual(await page.evaluate(() => localStorage.getItem('defi-garden-lang')), code);
        assert.strictEqual(await page.locator('[data-testid="lang-suggest"]').count(), 0, 'banner gone once app language matches');
        assert.strictEqual((await page.locator('.lang-menu-trigger').innerText()).trim(), TRIGGER_TEXT[code]);
        await page.evaluate(() => localStorage.removeItem('defi-garden-lang'));
      });
      await test(`${locale}: still works when localStorage throws (dismiss is in-session, nothing crashes)`, async () => {
        const c2 = await newPage(browser, { locale });
        await c2.ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        await c2.page.goto(`${base()}/home.html?lang=en`, { waitUntil: 'load' });
        await c2.page.waitForSelector('[data-testid="lang-suggest"]');
        await c2.page.locator('.lang-suggest-dismiss').click();
        assert.strictEqual(await c2.page.locator('[data-testid="lang-suggest"]').count(), 0);
        assert.deepStrictEqual(c2.errors, []);
        await c2.ctx.close();
      });
      await test(`${locale}: no page errors`, async () => { assert.deepStrictEqual(errors, []); });
      await ctx.close();
    }
    for (const locale of ['en-US', 'ko-KR', 'fr-FR']) {
      const { ctx, page } = await newPage(browser, { locale });
      await test(`${locale}: renders no banner (${locale === 'ko-KR' ? 'auto-detected ko, so no difference' : 'no supported difference'})`, async () => {
        await openLanding(page);
        await page.waitForTimeout(300);
        assert.strictEqual(await page.locator('[data-testid="lang-suggest"]').count(), 0);
        const want = locale === 'ko-KR' ? 'ko' : 'en';
        assert.strictEqual(await page.evaluate(() => document.documentElement.lang), HTML_LANG_OF[want]);
      });
      await ctx.close();
    }
    for (const [w, h] of [[360, 740], [1280, 800]]) {
      await test(`${w}x${h}: banner adds zero layout — hero card rect identical with and without it, no scroll jump`, async () => {
        const withB = await newPage(browser, { width: w, height: h, locale: 'pt-BR' });
        const without = await newPage(browser, { width: w, height: h, locale: 'en-US' });
        await openLanding(withB.page, '?lang=en'); await openLanding(without.page);
        await withB.page.waitForSelector('[data-testid="lang-suggest"]');
        await withB.page.waitForSelector('[data-testid="landing-underwriting-card"]');
        await withB.page.waitForTimeout(600); await without.page.waitForTimeout(600);
        const a = await rectOf(withB.page, '.landing-hero-underwriting');
        const b = await rectOf(without.page, '.landing-hero-underwriting');
        assert.deepStrictEqual(a, b, 'hero rect differs with banner: ' + JSON.stringify({ a, b }));
        const sa = await rectOf(withB.page, '[data-testid="lang-suggest"]');
        const hdr = await rectOf(withB.page, '.landing-header');
        assert.ok(sa.y >= hdr.y + hdr.h - 1, 'banner sits under the header');
        assert.ok(sa.x >= 0 && sa.x + sa.w <= w, 'banner inside viewport width');
        assert.ok(sa.h <= 40, 'banner is one compact line, got ' + sa.h);
        assert.strictEqual(await withB.page.evaluate(() => window.scrollY), 0, 'no scroll jump (snap layout)');
        assert.ok(await withB.page.evaluate(() => document.documentElement.scrollWidth) <= w, 'no horizontal overflow');
        // The banner must not cover the hero headline or the status line.
        const overlap = await withB.page.evaluate(() => {
          const s = document.querySelector('[data-testid="lang-suggest"]').getBoundingClientRect();
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
