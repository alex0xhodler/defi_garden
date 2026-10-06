/* test_i18n_pt_es_static.js — Portuguese (Brazil) + Spanish for the STATIC SEO
   estate only (tokens/, chains/, pools/ pages, hubs, sitemaps).

   Asserts the PLUMBING (not translation quality — scripts/i18n-key-inventory.js
   is the translation done-check):
     (a) languages.js config shape (order, prefixes, hreflang, scopes).
     (b) i18n/ lookup: own value wins, per-key fallback to EN, never a raw key
         for a known key, Node-only.
     (c) the browser bundle is untouched: translations.js / translations.min.js
         carry no pt/es, never reference i18n/ or languages.js, are byte-identical
         to origin/main when that ref is resolvable, and home.html / plan.html
         never load the i18n files.
     (d) generated output (tiny offline fixture -> temp dir, real generators run
         as child processes): per-language page counts and the head-scope rule
         (thin tokens are NEVER generated for pt/es), hreflang reciprocity on a
         head token, a thin token, a chain and a pool page, <html lang>,
         canonical = own URL, the language switcher lists only the versions that
         exist (current one is a non-link with aria-current), per-language
         sitemaps carry the same reciprocal alternates, no .md twins in pt/es.
     (e) vercel.json / .vercelignore / CI wiring.

   Nothing is written inside the repo: every generator runs with --out into an
   os.tmpdir() directory, and a tiny OG-image stub is preloaded so the run needs
   no canvas. Run: node test_i18n_pt_es_static.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = __dirname;
const SITE = 'https://www.defi.garden';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
const read = (p) => fs.readFileSync(p, 'utf8');

const L = require('./languages.js');

// ---------------------------------------------------------------------------
console.log('(a) languages.js config');
test('ordered list is en, ko, pt, es with the agreed prefixes / htmlLang / hreflang / scope', () => {
  const rows = L.LANGUAGES.map(l => [l.code, l.pathPrefix, l.htmlLang, l.hreflang, l.label, l.short, l.scope]);
  assert.deepStrictEqual(rows, [
    ['en', '', 'en', 'en', 'English', 'EN', 'all'],
    ['ko', '/ko', 'ko', 'ko', '한국어', 'KO', 'all'],
    ['pt', '/pt', 'pt-BR', 'pt', 'Português', 'PT', 'head'],
    ['es', '/es', 'es', 'es', 'Español', 'ES', 'head']
  ]);
  assert.ok(Object.isFrozen(L.LANGUAGES), 'LANGUAGES must be frozen');
});
test('helpers: langPath / langUrl / langDir / normalizeLang / orderCodes', () => {
  assert.strictEqual(L.langPath('en', '/chains/x'), '/chains/x');
  assert.strictEqual(L.langPath('pt', '/chains/x'), '/pt/chains/x');
  assert.strictEqual(L.langUrl(SITE + '/', 'es', '/tokens'), SITE + '/es/tokens');
  assert.strictEqual(L.langDir('en'), '');
  assert.strictEqual(L.langDir('pt'), 'pt');
  assert.strictEqual(L.normalizeLang('fr'), 'en');
  assert.deepStrictEqual(L.orderCodes(['es', 'en', 'zz', 'en']), ['en', 'es']);
  assert.deepStrictEqual(L.FULL_SCOPE_CODES, ['en', 'ko']);
  assert.deepStrictEqual(L.HEAD_SCOPE_CODES, ['pt', 'es']);
});

// ---------------------------------------------------------------------------
console.log('(b) i18n lookup (Node-only dictionaries, per-key EN fallback)');
const i18n = require('./i18n/index.js');
const { translations } = require('./translations.js');
test('translations.js still carries exactly en + ko', () => {
  assert.deepStrictEqual(Object.keys(translations).sort(), ['en', 'ko']);
});
test('pt / es dictionaries are flat { key: string|function } objects with the same key set', () => {
  const pt = require('./i18n/pt.js');
  const es = require('./i18n/es.js');
  const ptKeys = Object.keys(pt);
  const esKeys = Object.keys(es);
  assert.ok(ptKeys.length > 100, 'pt dictionary suspiciously small: ' + ptKeys.length);
  assert.deepStrictEqual(ptKeys, esKeys, 'pt and es must carry the same keys in the same (alphabetical) order');
  assert.deepStrictEqual(ptKeys, ptKeys.slice().sort(), 'keys must be alphabetical');
  ptKeys.concat(esKeys).forEach(() => {});
  [pt, es].forEach(d => Object.keys(d).forEach(k => {
    assert.ok(typeof d[k] === 'string' || typeof d[k] === 'function', k + ' must be a string or function');
  }));
});
test('own value wins; a key missing from pt falls back to the EN value (per key, not per dictionary)', () => {
  const pt = require('./i18n/pt.js');
  const key = Object.keys(pt).find(k => typeof pt[k] === 'string' && !k.includes('.'));
  assert.ok(key, 'need a plain string key');
  const t = i18n.createTranslationFunction('pt');
  const original = pt[key];
  try {
    pt[key] = '@@PT-SENTINEL@@';
    assert.strictEqual(t(key), '@@PT-SENTINEL@@');
    delete pt[key];
    const en = i18n.createTranslationFunction('en')(key);
    assert.notStrictEqual(en, key, 'EN must define ' + key);
    assert.strictEqual(t(key), en, 'missing pt key must render the EN string, not the raw key');
  } finally {
    pt[key] = original;
  }
  assert.strictEqual(t('definitely.not.a.key'), 'definitely.not.a.key');
});
test('function-valued entries receive pinned en-US params (no locale-formatted digits)', () => {
  const t = i18n.createTranslationFunction('es');
  const en = i18n.createTranslationFunction('en');
  // tcpMonthYear(monthShortEn, month, year): pass year as a string, never 2,026.
  assert.strictEqual(en('tcpMonthYear', 'Oct', '10', '2026'), 'Oct 2026');
  assert.ok(/2026/.test(t('tcpMonthYear', 'Oct', '10', '2026')));
  assert.ok(!/2,026/.test(t('tcpMonthYear', 'Oct', '10', '2026')));
});
test('unknown language normalises to EN (same as the old (lang===ko)?ko:en ternary)', () => {
  const t = i18n.createTranslationFunction('fr');
  const en = i18n.createTranslationFunction('en');
  assert.strictEqual(t('browseTokens'), en('browseTokens'));
});

// ---------------------------------------------------------------------------
console.log('(c) browser bundle untouched');
const BUNDLES = ['translations.js', 'translations.min.js'];
test('translations.js / translations.min.js never reference i18n/, languages.js or pt/es dictionaries', () => {
  BUNDLES.forEach(f => {
    const src = read(path.join(ROOT, f));
    assert.ok(!/i18n\/(?:pt|es|static-en-ko|index)/.test(src), f + ' references the Node-only i18n layer');
    assert.ok(!/languages\.js/.test(src), f + ' references languages.js');
    assert.ok(!/Português|Español|pt-BR/.test(src), f + ' carries Portuguese content');
  });
});
test('home.html / plan.html (the interactive app shells) never load the i18n files or languages.js', () => {
  ['home.html', 'plan.html'].forEach(f => {
    const html = read(path.join(ROOT, f));
    assert.ok(!/i18n\//.test(html), f + ' references i18n/');
    assert.ok(!/languages\.js/.test(html), f + ' references languages.js');
    assert.ok(!/\/(?:pt|es)\/(?:tokens|chains|pools)/.test(html), f + ' links the pt/es static estate');
  });
});
// The static pt/es work must add ZERO bytes to the browser bundle. The header
// language menu (lang-menu.js, a separate script) later needed three EN+KO keys
// and the landing <title> was de-staled, so "byte-identical" became "identical
// except for this explicit allow-list": every key the baseline had must have the
// same value, and the ONLY additions/changes are the entries below. A pt/es
// dictionary, or any other drift, still fails. Update the list only for an
// intentional, separately-reviewed translations.js change (or set
// I18N_SKIP_BUNDLE_BASELINE=1).
const ALLOWED_NEW_KEYS = ['langMenuLabel', 'langNameEn', 'langNameKo'];          // top-level, en + ko
const ALLOWED_REMOVED_LANDING_KEYS = ['languageEnglish', 'languageKorean'];       // old EN<->KO toggle's aria strings
const ALLOWED_CHANGED = ['landing.pageTitle', 'landing.metaDescription'];           // planner-era title/description -> the HTML <title>/<meta>
test('translations.js is identical to origin/main except the allow-listed language-menu keys / landing title', () => {
  const ref = process.env.I18N_BUNDLE_BASELINE_REF || 'origin/main';
  if (process.env.I18N_SKIP_BUNDLE_BASELINE === '1') { console.log('    (skipped: I18N_SKIP_BUNDLE_BASELINE=1)'); return; }
  const rev = cp.spawnSync('git', ['rev-parse', '--verify', '--quiet', ref + '^{commit}'], { cwd: ROOT, encoding: 'utf8' });
  if (rev.status !== 0) { console.log('    (skipped: ' + ref + ' is not resolvable in this checkout)'); return; }
  const baseSrc = cp.spawnSync('git', ['show', ref + ':translations.js'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  if (baseSrc.status !== 0) return; // file did not exist at the baseline
  const load = (src) => { const m = { exports: {} }; new Function('module', 'exports', 'require', String(src))(m, m.exports, require); return m.exports.translations; };
  const base = load(baseSrc.stdout);
  const now = load(fs.readFileSync(path.join(ROOT, 'translations.js')));
  assert.deepStrictEqual(Object.keys(now), Object.keys(base), 'language set changed');
  Object.keys(base).forEach(lang => {
    const flat = (d) => { const o = {}; Object.keys(d).forEach(k => { if (k === 'landing') Object.keys(d.landing).forEach(lk => { o['landing.' + lk] = d.landing[lk]; }); else o[k] = d[k]; }); return o; };
    const b = flat(base[lang]); const n = flat(now[lang]);
    Object.keys(b).forEach(k => {
      if (ALLOWED_REMOVED_LANDING_KEYS.some(r => k === 'landing.' + r)) return;
      assert.ok(k in n, lang + '.' + k + ' was removed (not allow-listed)');
      if (ALLOWED_CHANGED.includes(k)) return;
      assert.strictEqual(String(n[k]), String(b[k]), lang + '.' + k + ' changed (not allow-listed)');
    });
    Object.keys(n).forEach(k => {
      if (!(k in b)) assert.ok(ALLOWED_NEW_KEYS.includes(k), lang + '.' + k + ' is a new key outside the allow-list — the static pt/es work must not grow the browser bundle');
    });
    ALLOWED_NEW_KEYS.forEach(k => assert.ok(typeof n[k] === 'string' && n[k], lang + '.' + k + ' missing'));
  });
});

// ---------------------------------------------------------------------------
// (d) generate a tiny offline estate into a temp dir
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-i18n-pt-es-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_e) { /* best effort */ } });

// HEADA / HEADB: >= 3 qualifying pools (indexable -> exist in all four languages)
// THIN: 1 qualifying pool (noindexed -> en + ko only)
const mk = (symbol, project, chain, tvl, apy, id) => ({ symbol, project, chain, tvlUsd: tvl, apyBase: apy, apyReward: 0, pool: id });
const FIXTURE = [
  mk('HEADA', 'aave-v3', 'Ethereum', 500e6, 4.1, 'heada-1'),
  mk('HEADA', 'compound-v3', 'Ethereum', 300e6, 3.9, 'heada-2'),
  mk('HEADA', 'morpho', 'Base', 200e6, 5.2, 'heada-3'),
  mk('HEADA', 'aave-v3', 'Arbitrum', 100e6, 3.5, 'heada-4'),
  mk('HEADB', 'aave-v3', 'Ethereum', 90e6, 2.9, 'headb-1'),
  mk('HEADB', 'spark', 'Ethereum', 80e6, 3.1, 'headb-2'),
  mk('HEADB', 'morpho', 'Base', 70e6, 3.7, 'headb-3'),
  mk('THIN', 'aave-v3', 'Ethereum', 5e6, 6.2, 'thin-1')
];
const fixturePath = path.join(TMP, 'fixture.json');
fs.writeFileSync(fixturePath, JSON.stringify(FIXTURE));
const stubPath = path.join(TMP, 'stub-og.js');
fs.writeFileSync(stubPath, `
const Module = require('module');
const orig = Module._load;
Module._load = function (request) {
  if (/generate-og-images(\\.js)?$/.test(request)) {
    const ogRelPath = (kind, slug) => 'og/' + kind + '/' + slug + '.png';
    return { ogRelPath, FALLBACK_REL_PATH: 'og-image.png',
      generateOgImages: (records, kind, labelOf) => new Map(records.map(r => [r.slug, ogRelPath(kind, r.slug)])) };
  }
  return orig.apply(this, arguments);
};
`);
function runGen(script, args) {
  const r = cp.spawnSync(process.execPath, ['-r', stubPath, path.join(ROOT, script)].concat(args), {
    cwd: ROOT, encoding: 'utf8', timeout: 150000, maxBuffer: 64 * 1024 * 1024
  });
  if (r.status !== 0) throw new Error(script + ' exited ' + r.status + ': ' + (r.stderr || r.stdout || '').slice(-1500));
  return r;
}
let generated = null;
try {
  runGen('generate-token-pages.js', ['--out', path.join(TMP, 'tokens'), '--sitemap', path.join(TMP, 'sitemap-token-pages.xml'), '--fixture', fixturePath]);
  runGen('generate-chain-pages.js', ['--out', path.join(TMP, 'chains'), '--sitemap', path.join(TMP, 'sitemap-chain-pages.xml'), '--fixture', fixturePath]);
  runGen('generate-pool-score-pages.js', ['--out', path.join(TMP, 'pools'), '--limit', '3', '--no-vercel',
    '--manifest', path.join(TMP, 'pool-pages.json'), '--sitemap', path.join(TMP, 'sitemap-pool-pages.xml')]);
  generated = true;
} catch (e) {
  console.error('  ✗ generating the temp estate failed\n    ' + e.message);
  process.exitCode = 1;
}

const dirOf = (code, kind) => path.join(TMP, L.langDir(code), kind);
const htmlFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html').map(f => f.slice(0, -5)).sort() : []);
const pageOf = (code, kind, slug) => read(path.join(dirOf(code, kind), slug + '.html'));

/** [{hreflang, href}] of every <link rel="alternate" hreflang> in the page. */
function alternatesOf(html) {
  const out = [];
  (html.match(/<link\b[^>]*>/gi) || []).forEach(tag => {
    if (!/\brel="alternate"/i.test(tag)) return;
    const hl = /\bhreflang="([^"]*)"/i.exec(tag);
    const hr = /\bhref="([^"]*)"/i.exec(tag);
    if (hl && hr) out.push({ hreflang: hl[1], href: hr[1] });
  });
  return out;
}
const canonicalOf = (html) => { const m = /<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]*)"/i.exec(html); return m ? m[1] : null; };
const htmlLangOf = (html) => { const m = /<html\b[^>]*\blang="([^"]*)"/i.exec(html); return m ? m[1] : null; };
/** file of an absolute estate URL inside TMP, or null */
function fileOfUrl(href) {
  assert.ok(href.startsWith(SITE + '/'), 'unexpected alternate host: ' + href);
  const p = href.slice(SITE.length).replace(/\/$/, '');
  const asPage = path.join(TMP, p + '.html');
  // hub URLs (/tokens, /ko/chains, ...) are <dir>/index.html
  return fs.existsSync(asPage) ? asPage : path.join(TMP, p, 'index.html');
}
/** Reciprocity: every alternate of `html` resolves to an existing page whose own
 *  alternate set is identical, whose canonical is itself, and whose <html lang>
 *  matches its hreflang. Returns the sorted hreflang list. */
function assertReciprocal(html, label) {
  const alts = alternatesOf(html);
  const set = alts.map(a => a.hreflang + ' ' + a.href).sort();
  const langs = alts.filter(a => a.hreflang !== 'x-default');
  assert.ok(langs.length >= 2, label + ': expected >= 2 language alternates, got ' + langs.length);
  const xd = alts.find(a => a.hreflang === 'x-default');
  const en = alts.find(a => a.hreflang === 'en');
  assert.ok(xd && en && xd.href === en.href, label + ': x-default must point at the EN URL');
  assert.strictEqual(new Set(langs.map(a => a.hreflang)).size, langs.length, label + ': duplicate hreflang');
  langs.forEach(a => {
    const lang = L.LANGUAGES.find(l => l.hreflang === a.hreflang);
    assert.ok(lang, label + ': unknown hreflang ' + a.hreflang);
    const f = fileOfUrl(a.href);
    assert.ok(fs.existsSync(f), label + ': alternate ' + a.hreflang + ' -> ' + a.href + ' does not exist on disk');
    const other = read(f);
    assert.deepStrictEqual(alternatesOf(other).map(x => x.hreflang + ' ' + x.href).sort(), set,
      label + ': alternate set of ' + a.href + ' is not reciprocal');
    assert.strictEqual(canonicalOf(other), a.href, label + ': canonical of ' + a.href + ' must be its own URL');
    assert.strictEqual(htmlLangOf(other), lang.htmlLang, label + ': <html lang> of ' + a.href);
  });
  return langs.map(a => a.hreflang).sort();
}
/** Parsed language switcher: { current: [short], links: [{short, href, hreflang, lang}] } */
function switcherOf(html) {
  const nav = /<nav\b[^>]*class="[^"]*\blang-switch\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/i.exec(html);
  if (!nav) return null;
  const current = [];
  const links = [];
  (nav[1].match(/<li>[\s\S]*?<\/li>/gi) || []).forEach(li => {
    const text = li.replace(/<[^>]+>/g, '').trim();
    const a = /<a\b([^>]*)>/i.exec(li);
    if (a) {
      links.push({
        short: text,
        href: (/\bhref="([^"]*)"/i.exec(a[1]) || [])[1],
        hreflang: (/\bhreflang="([^"]*)"/i.exec(a[1]) || [])[1],
        lang: (/\blang="([^"]*)"/i.exec(a[1]) || [])[1]
      });
    } else {
      assert.ok(/aria-current="true"/.test(li), 'the current language must carry aria-current="true"');
      current.push(text);
    }
  });
  return { current, links };
}
function assertSwitcher(html, code, existingCodes, neutralPath, label) {
  const sw = switcherOf(html);
  assert.ok(sw, label + ': language switcher missing');
  const want = L.orderCodes(existingCodes);
  assert.deepStrictEqual(sw.current, [L.getLanguage(code).short], label + ': exactly the current language is a non-link');
  const others = want.filter(c => c !== code);
  assert.deepStrictEqual(sw.links.map(l => l.short), others.map(c => L.getLanguage(c).short),
    label + ': switcher must list only the versions that exist, in config order');
  sw.links.forEach((l, i) => {
    const lang = L.getLanguage(others[i]);
    assert.strictEqual(l.href, L.langUrl(SITE, lang.code, neutralPath), label + ': switcher href');
    assert.strictEqual(l.hreflang, lang.hreflang, label + ': switcher hreflang attr');
    assert.strictEqual(l.lang, lang.htmlLang, label + ': switcher lang attr');
  });
}

if (generated) {
  console.log('(d) generated estate (temp dir, offline fixture)');
  const headTokens = ['heada', 'headb'];
  test('token pages: en + ko carry every token; pt + es only the indexable (>=3 qualifying pools) ones', () => {
    assert.deepStrictEqual(htmlFiles(dirOf('en', 'tokens')).filter(s => !s.startsWith('az')), ['heada', 'headb', 'thin']);
    assert.deepStrictEqual(htmlFiles(dirOf('ko', 'tokens')), ['heada', 'headb', 'thin']);
    assert.deepStrictEqual(htmlFiles(dirOf('pt', 'tokens')), headTokens);
    assert.deepStrictEqual(htmlFiles(dirOf('es', 'tokens')), headTokens);
  });
  test('thin (noindexed) tokens are never generated for pt / es, and EN thin stays noindex', () => {
    ['pt', 'es'].forEach(c => assert.ok(!fs.existsSync(path.join(dirOf(c, 'tokens'), 'thin.html')), c + '/tokens/thin.html must not exist'));
    assert.ok(/<meta[^>]+name="robots"[^>]+noindex/i.test(pageOf('en', 'tokens', 'thin')), 'EN thin token must stay noindex');
    ['pt', 'es'].forEach(c => htmlFiles(dirOf(c, 'tokens')).forEach(s =>
      assert.ok(!/noindex/i.test(pageOf(c, 'tokens', s)), c + '/tokens/' + s + ' must be indexable')));
  });
  test('chain + pool pages: pt / es mirror everything EN generates', () => {
    const enChains = htmlFiles(dirOf('en', 'chains'));
    assert.ok(enChains.length >= 3, 'fixture should yield >= 3 chains');
    ['ko', 'pt', 'es'].forEach(c => assert.deepStrictEqual(htmlFiles(dirOf(c, 'chains')), enChains, c + ' chains'));
    const enPools = htmlFiles(dirOf('en', 'pools'));
    assert.ok(enPools.length >= 1, 'expected at least one pool page');
    ['ko', 'pt', 'es'].forEach(c => assert.deepStrictEqual(htmlFiles(dirOf(c, 'pools')), enPools, c + ' pools'));
  });
  test('hubs exist for every language and list only pages that exist in that language', () => {
    ['en', 'ko', 'pt', 'es'].forEach(c => ['tokens', 'chains', 'pools'].forEach(k =>
      assert.ok(fs.existsSync(path.join(dirOf(c, k), 'index.html')), c + '/' + k + '/index.html')));
    ['pt', 'es'].forEach(c => {
      const hub = read(path.join(dirOf(c, 'tokens'), 'index.html'));
      assert.ok(hub.includes('/' + c + '/tokens/heada'), c + ' hub must link heada');
      assert.ok(!hub.includes('/tokens/thin'), c + ' hub must not link the thin token');
      assert.ok(!new RegExp('href="/(?!' + c + '/)(?:ko/)?tokens/heada"').test(hub), c + ' hub must not link EN token pages');
    });
    assert.ok(read(path.join(dirOf('en', 'tokens'), 'index.html')).includes('/tokens/thin'), 'EN hub keeps listing every token');
  });
  test('Laso partner card block: EN + KO keep it, pt + es render nothing (US-only card pitch is misleading outside the US)', () => {
    assert.strictEqual(L.hasLasoCard('en'), true);
    assert.strictEqual(L.hasLasoCard('ko'), true);
    assert.strictEqual(L.hasLasoCard('pt'), false);
    assert.strictEqual(L.hasLasoCard('es'), false);
    ['en', 'ko'].forEach(c => ['tokens', 'chains'].forEach(k =>
      assert.ok(/hub-waitlist/.test(read(path.join(dirOf(c, k), 'index.html'))), c + '/' + k + ' hub keeps the card waitlist (byte-identical)')));
    ['en', 'ko'].forEach(c => {
      const html = pageOf(c, 'tokens', 'heada');
      assert.ok(html.includes('id="token-card-section"') && html.includes('laso.finance?ref='), c + ' token page must keep the Laso block');
      assert.ok(html.includes('Zero issuance fee'), c + ' output must stay byte-identical (Laso copy unchanged)');
    });
    const LASO = /laso|token-card-section|token-laso|virtual-visa-card|visa-card|issuance|Zero issuance|Sponsored partner/i;
    ['pt', 'es'].forEach(c => {
      htmlFiles(dirOf(c, 'tokens')).forEach(slug => {
        const html = pageOf(c, 'tokens', slug);
        assert.ok(!LASO.test(html), c + '/tokens/' + slug + ' must not contain any Laso / card-block markup');
        assert.ok(!/-waitlist\b/.test(html), c + '/tokens/' + slug + ' must not carry the waitlist wrapper or its scoped CSS');
        assert.ok(!/dg_laso_token_/.test(html), c + '/tokens/' + slug + ' must not carry the Laso sessionStorage script');
      });
      htmlFiles(dirOf(c, 'chains')).forEach(slug =>
        assert.ok(!LASO.test(pageOf(c, 'chains', slug)), c + '/chains/' + slug + ' must not mention Laso'));
      htmlFiles(dirOf(c, 'pools')).forEach(slug =>
        assert.ok(!LASO.test(pageOf(c, 'pools', slug)), c + '/pools/' + slug + ' must not mention Laso'));
      // card waitlist (+ decorative card mock, scoped CSS) is gated by the same flag
      const WAITLIST = /waitlist|virtual-visa-card|visa-card|DEFI GARDEN METAL|YIELD-FUNDED|plan\.html\?waitlist/i;
      const hubFiles = ['tokens', 'chains', 'pools'].map(k => path.join(dirOf(c, k), 'index.html'))
        .concat(fs.readdirSync(path.join(dirOf(c, 'tokens'), 'az')).filter(f => f.endsWith('.html')).map(f => path.join(dirOf(c, 'tokens'), 'az', f)));
      assert.ok(hubFiles.length >= 4, c + ': expected hubs + A-Z pages');
      hubFiles.forEach(f => assert.ok(!WAITLIST.test(read(f)), c + ': ' + path.relative(TMP, f) + ' must not carry the card waitlist / card mock'));
      ['tokens', 'chains', 'pools'].forEach(k => {
        const hub = read(path.join(dirOf(c, k), 'index.html'));
        assert.ok(!/laso\.finance|token-laso|Zero issuance|Sponsored partner/i.test(hub), c + '/' + k + ' hub must not mention Laso');
      });
    });
  });
  test('pt / es dictionaries are fully translated: no TODO-TRANSLATE marker, no EN leftovers on a rendered head token page', () => {
    ['pt', 'es'].forEach(c => {
      assert.ok(!/TODO-TRANSLATE/.test(read(path.join(ROOT, 'i18n', c + '.js'))), c + ' dictionary still has TODO-TRANSLATE');
      const html = pageOf(c, 'tokens', 'heada');
      assert.ok(!/TODO-TRANSLATE/.test(html), c + ' page must not carry a marker');
      const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
        .replace(/<head>[\s\S]*?<\/head>/i, ' ').replace(/<[^>]+>/g, ' ');
      ['The highest honest', 'live pools', 'TVL floor', 'Frequently asked', 'Education, not', 'Related tokens', 'Honest yields'].forEach(en =>
        assert.ok(!text.includes(en), c + ' page still shows English: ' + en));
    });
  });
  test('pool-type category links: anchor text is translated for pt / es, the poolTypes query value and EN / KO labels are untouched', () => {
    const tp = i18n.createTranslationFunction('pt'), te = i18n.createTranslationFunction('es');
    assert.strictEqual(tp('tcpPoolTypeLabel', 'Lending'), 'Empréstimos');
    assert.strictEqual(te('tcpPoolTypeLabel', 'Lending'), 'Préstamos');
    assert.strictEqual(tp('tcpPoolTypeLabel', 'Something New'), 'Something New', 'an unmapped taxonomy value passes through');
    ['en', 'ko'].forEach(c => assert.strictEqual(i18n.createTranslationFunction(c)('tcpPoolTypeLabel', 'Lending'), 'Lending'));
  });
  test('no Markdown twins in pt / es (and none are advertised)', () => {
    ['pt', 'es'].forEach(c => ['tokens', 'chains', 'pools'].forEach(k => {
      const dir = dirOf(c, k);
      const md = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      assert.deepStrictEqual(md, [], c + '/' + k + ' must have no .md twins');
    }));
    assert.ok(fs.existsSync(path.join(dirOf('ko', 'chains'), 'ethereum.md')), 'ko keeps its markdown twins');
  });

  test('head token page: reciprocal hreflang en/ko/pt/es + x-default, own canonical, <html lang>', () => {
    const html = pageOf('pt', 'tokens', 'heada');
    assert.deepStrictEqual(assertReciprocal(html, 'heada'), ['en', 'es', 'ko', 'pt']);
    assert.strictEqual(canonicalOf(html), SITE + '/pt/tokens/heada');
    assert.strictEqual(htmlLangOf(html), 'pt-BR');
    assert.strictEqual(htmlLangOf(pageOf('es', 'tokens', 'heada')), 'es');
    assert.strictEqual(canonicalOf(pageOf('es', 'tokens', 'heada')), SITE + '/es/tokens/heada');
    assert.strictEqual(canonicalOf(pageOf('en', 'tokens', 'heada')), SITE + '/tokens/heada');
    assert.strictEqual(canonicalOf(pageOf('ko', 'tokens', 'heada')), SITE + '/ko/tokens/heada');
  });
  test('thin token page: hreflang set is exactly en + ko (+ x-default) — never a pt/es URL that does not exist', () => {
    const en = pageOf('en', 'tokens', 'thin');
    assert.deepStrictEqual(assertReciprocal(en, 'thin'), ['en', 'ko']);
    assert.ok(!/\/(?:pt|es)\/tokens\/thin/.test(en), 'EN thin page must not mention pt/es URLs');
    assert.deepStrictEqual(alternatesOf(pageOf('ko', 'tokens', 'thin')).map(a => a.hreflang).sort(), ['en', 'ko', 'x-default']);
  });
  test('chain page: reciprocal hreflang for all four languages in every language version', () => {
    ['en', 'ko', 'pt', 'es'].forEach(c =>
      assert.deepStrictEqual(assertReciprocal(pageOf(c, 'chains', 'ethereum'), 'chain/' + c), ['en', 'es', 'ko', 'pt']));
    assert.strictEqual(htmlLangOf(pageOf('pt', 'chains', 'ethereum')), 'pt-BR');
    assert.strictEqual(htmlLangOf(pageOf('es', 'chains', 'ethereum')), 'es');
  });
  test('pool page: reciprocal hreflang for all four languages in every language version', () => {
    const slug = htmlFiles(dirOf('en', 'pools'))[0];
    ['en', 'ko', 'pt', 'es'].forEach(c =>
      assert.deepStrictEqual(assertReciprocal(pageOf(c, 'pools', slug), 'pool/' + c), ['en', 'es', 'ko', 'pt']));
    assert.strictEqual(htmlLangOf(pageOf('pt', 'pools', slug)), 'pt-BR');
  });
  test('hubs + A–Z pages carry reciprocal hreflang; an A–Z letter with no indexable token has no pt/es page', () => {
    ['tokens', 'chains', 'pools'].forEach(k =>
      ['en', 'ko', 'pt', 'es'].forEach(c =>
        assert.deepStrictEqual(assertReciprocal(read(path.join(dirOf(c, k), 'index.html')), 'hub ' + k + '/' + c), ['en', 'es', 'ko', 'pt'])));
    const azFiles = (c) => fs.readdirSync(path.join(dirOf(c, 'tokens'), 'az')).filter(f => f.endsWith('.html'));
    assert.ok(azFiles('en').includes('t.html'), 'EN has the T letter page (THIN)');
    ['pt', 'es'].forEach(c => {
      assert.ok(!azFiles(c).includes('t.html'), c + ' must not have a T letter page (only a thin token starts with T)');
      assert.ok(azFiles(c).includes('h.html'), c + ' has the H letter page');
    });
    assert.deepStrictEqual(assertReciprocal(read(path.join(dirOf('en', 'tokens'), 'az', 'h.html')), 'az/h'), ['en', 'es', 'ko', 'pt']);
    assert.deepStrictEqual(assertReciprocal(read(path.join(dirOf('en', 'tokens'), 'az', 't.html')), 'az/t'), ['en', 'ko']);
  });

  test('switcher lists only existing versions: head token (EN KO PT ES), thin token (EN KO), chain, pool, hub', () => {
    ['en', 'ko', 'pt', 'es'].forEach(c => {
      assertSwitcher(pageOf(c, 'tokens', 'heada'), c, ['en', 'ko', 'pt', 'es'], '/tokens/heada', 'head token ' + c);
      assertSwitcher(pageOf(c, 'chains', 'ethereum'), c, ['en', 'ko', 'pt', 'es'], '/chains/ethereum', 'chain ' + c);
      const slug = htmlFiles(dirOf('en', 'pools'))[0];
      assertSwitcher(pageOf(c, 'pools', slug), c, ['en', 'ko', 'pt', 'es'], '/pools/' + slug, 'pool ' + c);
    });
    ['en', 'ko'].forEach(c => assertSwitcher(pageOf(c, 'tokens', 'thin'), c, ['en', 'ko'], '/tokens/thin', 'thin token ' + c));
    assertSwitcher(read(path.join(dirOf('en', 'tokens'), 'az', 't.html')), 'en', ['en', 'ko'], '/tokens/az/t', 'az t');
  });
  test('switcher markup: compact EN · KO · PT · ES labels, aria-label, tokens-only styling, 360px-safe', () => {
    const html = pageOf('en', 'chains', 'ethereum');
    const nav = /<nav\b[^>]*class="[^"]*\blang-switch\b[^"]*"[^>]*>/i.exec(html);
    assert.ok(nav && /aria-label="[^"]+"/.test(nav[0]), 'nav.lang-switch needs an aria-label');
    const sw = switcherOf(html);
    assert.deepStrictEqual([].concat(sw.current, sw.links.map(l => l.short)), ['EN', 'KO', 'PT', 'ES']);
    const css = (/\.lang-switch[^{]*\{[^}]*\}/g.exec(html) || [''])[0];
    assert.ok(css, '.lang-switch CSS must be emitted');
    const styleBlock = html.split('</style>').find(b => b.includes('.lang-switch')) || '';
    const rules = styleBlock.slice(styleBlock.indexOf('.lang-switch'));
    assert.ok(/var\(--ui-/.test(rules), 'switcher styling must use --ui-* tokens');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(rules.split('}').filter(r => r.includes('.lang-switch')).join('}')), 'no hard-coded colours in switcher rules');
    assert.ok(!/--neuro-/.test(rules), 'never a --neuro-* token');
    assert.ok(/flex-wrap:\s*wrap/.test(rules), 'switcher must wrap so it fits at 360px');
    assert.ok(/prefers-reduced-motion/.test(rules) || !/transition/.test(rules), 'transitions must respect reduced motion');
  });
  test('no stray locale formatting: pt/es pages never render grouped numbers in a non-en-US style', () => {
    ['pt', 'es'].forEach(c => {
      const text = pageOf(c, 'chains', 'ethereum').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
      assert.ok(!/\d\.\d{3},\d/.test(text), c + ': found a pt/es-style number (1.234,5)');
      assert.ok(!/\d \d{3},\d/.test(text), c + ': found a space-grouped number');
    });
  });

  console.log('(d) per-language sitemaps');
  const locsOf = (xml) => (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, ''));
  test('sitemap-<kind>-pages-pt.xml / -es.xml exist and carry only that language\'s URLs', () => {
    ['pt', 'es'].forEach(c => ['token', 'chain', 'pool'].forEach(kind => {
      const f = path.join(TMP, `sitemap-${kind}-pages-${c}.xml`);
      assert.ok(fs.existsSync(f), path.basename(f) + ' missing');
      const locs = locsOf(read(f));
      assert.ok(locs.length > 0, path.basename(f) + ' is empty');
      locs.forEach(u => assert.ok(u.startsWith(SITE + '/' + c + '/'), path.basename(f) + ' has a foreign URL: ' + u));
    }));
    locsOf(read(path.join(TMP, 'sitemap-token-pages-pt.xml'))).forEach(u =>
      assert.ok(!/\/tokens\/thin$/.test(u), 'thin token must not be in the pt token sitemap'));
  });
  test('every sitemap <url> carries the same reciprocal alternates as its page (existing languages only)', () => {
    ['', '-ko', '-pt', '-es'].forEach(suffix => ['token', 'chain', 'pool'].forEach(kind => {
      const f = path.join(TMP, `sitemap-${kind}-pages${suffix}.xml`);
      const xml = read(f);
      const blocks = xml.split('<url>').slice(1);
      assert.ok(blocks.length > 0, path.basename(f) + ' empty');
      blocks.forEach(b => {
        const loc = /<loc>([^<]+)<\/loc>/.exec(b)[1];
        const alts = (b.match(/<xhtml:link\b[^>]*>/g) || []).map(tag => ({
          hreflang: /hreflang="([^"]*)"/.exec(tag)[1], href: /href="([^"]*)"/.exec(tag)[1]
        }));
        assert.ok(alts.some(a => a.href === loc), path.basename(f) + ': ' + loc + ' must list itself');
        alts.forEach(a => {
          if (a.hreflang === 'x-default') return;
          assert.ok(fs.existsSync(fileOfUrl(a.href)), path.basename(f) + ': alternate ' + a.href + ' does not exist');
        });
        const xd = alts.find(a => a.hreflang === 'x-default');
        const en = alts.find(a => a.hreflang === 'en');
        assert.ok(xd && en && xd.href === en.href, path.basename(f) + ': x-default -> EN for ' + loc);
        // same set as the page itself
        const pageFile = fileOfUrl(loc);
        if (fs.existsSync(pageFile)) {
          assert.deepStrictEqual(alts.map(a => a.hreflang + ' ' + a.href).sort(),
            alternatesOf(read(pageFile)).map(a => a.hreflang + ' ' + a.href).sort(), path.basename(f) + ': ' + loc + ' alternates differ from the page');
        }
      });
    }));
  });
}

// ---------------------------------------------------------------------------
console.log('(e) wiring: sitemap index, indexnow, vercel.json, .vercelignore, CI, smoke test');
test('generate-sitemap.js: per-language page sitemaps are protected from stale cleanup', () => {
  const sm = require('./generate-sitemap.js');
  ['pt', 'es'].forEach(c => ['token', 'chain', 'pool'].forEach(kind =>
    assert.ok(sm.FOREIGN_PAGE_SITEMAPS.includes(`sitemap-${kind}-pages-${c}.xml`), c + ' ' + kind)));
  ['sitemap-token-pages.xml', 'sitemap-token-pages-ko.xml', 'sitemap-pool-pages-ko.xml'].forEach(f =>
    assert.ok(sm.FOREIGN_PAGE_SITEMAPS.includes(f), f + ' must stay protected'));
});
test('indexnow-ping.js: estate dirs are derived from languages.js (en/ko order preserved, pt/es added)', () => {
  const idx = require('./indexnow-ping.js');
  assert.ok(Array.isArray(idx.ESTATE_DIRS), 'ESTATE_DIRS must stay exported');
  ['pt/tokens', 'es/tokens', 'pt/tokens/az', 'es/chains', 'pt/pools', 'es/pools'].forEach(d => assert.ok(idx.ESTATE_DIRS.includes(d), d));
  const enko = idx.ESTATE_DIRS.filter(d => !/^(pt|es)\//.test(d));
  assert.deepStrictEqual(enko, ['tokens', 'ko/tokens', 'tokens/az', 'ko/tokens/az', 'chains', 'ko/chains', 'pools', 'ko/pools']);
});
test('vercel.json: valid JSON; pt/es /index redirects mirror ko; NO markdown-negotiation rules for pt/es', () => {
  const v = JSON.parse(read(path.join(ROOT, 'vercel.json')));
  const redirects = v.redirects || [];
  ['tokens', 'chains', 'pools'].forEach(k => ['ko', 'pt', 'es'].forEach(c => {
    const r = redirects.find(x => x.source === `/${c}/${k}/index`);
    assert.ok(r, `missing redirect /${c}/${k}/index`);
    assert.strictEqual(r.destination, `/${c}/${k}`);
    assert.strictEqual(r.permanent, true);
  }));
  const text = JSON.stringify(v);
  assert.ok(!/"\/(?:pt|es)\/(?:tokens|chains)\/:slug/.test(text), 'no pt/es markdown rewrites/header rules');
  assert.ok(!/\/(?:pt|es)\/[^"]*\.md/.test(text), 'no pt/es .md references in vercel.json');
});
test('.vercelignore keeps /i18n/ (Node-only dictionaries) off the deploy', () => {
  assert.ok(/^\/i18n\/\s*$/m.test(read(path.join(ROOT, '.vercelignore'))), '/i18n/ missing from .vercelignore');
});
test('sitemap-update.yml commits pt/ es/ and the new sitemaps; cron unchanged', () => {
  const y = read(path.join(ROOT, '.github', 'workflows', 'sitemap-update.yml'));
  const add = y.split('\n').find(l => /^\s*git add vercel\.json/.test(l));
  assert.ok(add, 'git add line not found');
  [' pt ', ' es '].forEach(d => assert.ok(add.includes(d), 'git add must include' + d));
  ['pt', 'es'].forEach(c => ['token', 'chain', 'pool'].forEach(kind =>
    assert.ok(add.includes(`sitemap-${kind}-pages-${c}.xml`), `git add must include sitemap-${kind}-pages-${c}.xml`)));
  assert.ok(/cron: '0 2 \* \* \*'/.test(y), 'cron must be unchanged');
});
test('test_mcp_post_deploy_smoke.js checks /pt/chains/ethereum and /es/chains/ethereum', () => {
  const s = read(path.join(ROOT, 'test_mcp_post_deploy_smoke.js'));
  assert.ok(s.includes('/pt/chains/ethereum') && s.includes('/es/chains/ethereum'));
  assert.ok(s.includes("'pt-BR'") && s.includes('hreflang'));
  cp.execFileSync(process.execPath, ['--check', path.join(ROOT, 'test_mcp_post_deploy_smoke.js')]);
});
test('package.json registers this test in test:serial', () => {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  assert.ok(pkg.scripts['test:serial'].includes('node test_i18n_pt_es_static.js'));
});

console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
