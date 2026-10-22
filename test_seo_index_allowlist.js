/* test_seo_index_allowlist.js — thin-page noindex exemption for pages with proven
   search demand (config/seo-index-allowlist.json, Search Console evidence), and
   the sitemap/robots/manifest agreement that goes with it.

   Asserts, with a tiny offline fixture and the REAL generators run as child
   processes into a temp dir (nothing is written in the repo):
     1. allowlisted thin page            -> index,follow in en / ko (own list per language)
     2. non-allowlisted thin page        -> noindex,follow
     3. the allowlist never adds pt/es pages (head-scope = pool threshold alone)
     4. token sitemaps list every indexable allowlisted page and NO noindexed slug
        (en + ko); hreflang alternates never advertise a noindexed or missing page
     5. .noindex-slugs.json manifests are per language and match the robots metas
     6. renderTokenPage still refuses a thin page in pt/es
     7. sitemap-main.xml: no .html URLs, no /mcp, no ?lang=ko home alternate
     8. config file shape + gsc-index-allowlist.js extractSlugs (pure, no network)
   Run: node test_seo_index_allowlist.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = __dirname;
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-seo-allow-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_e) { /* best effort */ } });

const mk = (symbol, project, chain, tvl, apy, id) => ({ symbol, project, chain, tvlUsd: tvl, apyBase: apy, apyReward: 0, pool: id });
const FIXTURE = [
  // BIGA, BIGB: >= 3 pools -> indexable everywhere (incl. pt/es)
  mk('BIGA', 'aave-v3', 'Ethereum', 500e6, 4.1, 'biga-1'), mk('BIGA', 'compound-v3', 'Ethereum', 300e6, 3.9, 'biga-2'), mk('BIGA', 'morpho', 'Base', 200e6, 5.2, 'biga-3'),
  mk('BIGB', 'aave-v3', 'Ethereum', 90e6, 2.9, 'bigb-1'), mk('BIGB', 'spark', 'Ethereum', 80e6, 3.1, 'bigb-2'), mk('BIGB', 'morpho', 'Base', 70e6, 3.7, 'bigb-3'),
  // THINEN: 1 pool, allowlisted en only      THINKO: 2 pools (head), allowlisted ko only
  // THINBOTH: 1 pool, allowlisted en+ko      THINNO: 2 pools (head), not allowlisted   THINONE: 1 pool, not allowlisted
  mk('THINEN', 'aave-v3', 'Ethereum', 5e6, 6.2, 'thinen-1'),
  mk('THINKO', 'aave-v3', 'Ethereum', 9e6, 6.2, 'thinko-1'), mk('THINKO', 'spark', 'Ethereum', 8e6, 5.2, 'thinko-2'),
  mk('THINBOTH', 'aave-v3', 'Base', 4e6, 3.2, 'thinboth-1'),
  mk('THINNO', 'aave-v3', 'Ethereum', 7e6, 6.2, 'thinno-1'), mk('THINNO', 'spark', 'Ethereum', 6e6, 5.2, 'thinno-2'),
  mk('THINONE', 'aave-v3', 'Ethereum', 3e6, 6.2, 'thinone-1')
];
const fixturePath = path.join(TMP, 'fixture.json');
fs.writeFileSync(fixturePath, JSON.stringify(FIXTURE));
const allowPath = path.join(TMP, 'allow.json');
fs.writeFileSync(allowPath, JSON.stringify({
  source: 'test', generated: '2026-10-22',
  en: ['thinen', 'thinboth', 'not-in-data'], ko: ['thinko', 'thinboth', 'biga']
}));
const stubPath = path.join(TMP, 'stub-og.js');
fs.writeFileSync(stubPath, `
const Module = require('module');
const orig = Module._load;
Module._load = function (request) {
  if (/generate-og-images(\\.js)?$/.test(request)) {
    const ogRelPath = (kind, slug) => 'og/' + kind + '/' + slug + '.png';
    return { ogRelPath, FALLBACK_REL_PATH: 'og-image.png',
      generateOgImages: (records, kind) => new Map(records.map(r => [r.slug, ogRelPath(kind, r.slug)])) };
  }
  return orig.apply(this, arguments);
};
`);
const r = cp.spawnSync(process.execPath, ['-r', stubPath, path.join(ROOT, 'generate-token-pages.js'),
  '--out', path.join(TMP, 'tokens'), '--sitemap', path.join(TMP, 'sitemap-token-pages.xml'), '--fixture', fixturePath], {
  cwd: ROOT, encoding: 'utf8', timeout: 150000, maxBuffer: 64 * 1024 * 1024, env: Object.assign({}, process.env, { SEO_INDEX_ALLOWLIST: allowPath })
});
if (r.status !== 0) { console.error((r.stderr || r.stdout || '').slice(-1500)); process.exit(1); }

const read = (...p) => fs.readFileSync(path.join(TMP, ...p), 'utf8');
const robots = (dir, slug) => (/name="robots" content="([^"]+)"/.exec(read(dir, slug + '.html')) || [])[1];
const locs = (f) => [...read(f).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const dirs = { en: 'tokens', ko: path.join('ko', 'tokens'), pt: path.join('pt', 'tokens'), es: path.join('es', 'tokens') };
const smFile = { en: 'sitemap-token-pages.xml', ko: 'sitemap-token-pages-ko.xml', pt: 'sitemap-token-pages-pt.xml', es: 'sitemap-token-pages-es.xml' };
const slugsIn = (lang) => locs(smFile[lang]).map(l => l.split('/tokens/')[1]).filter(s => s && !s.startsWith('az/'));

console.log('robots meta');
test('allowlisted thin page is index,follow in the language whose list has it', () => {
  assert.strictEqual(robots(dirs.en, 'thinen'), 'index,follow');
  assert.strictEqual(robots(dirs.ko, 'thinko'), 'index,follow');
  assert.strictEqual(robots(dirs.en, 'thinboth'), 'index,follow');
  assert.strictEqual(robots(dirs.ko, 'thinboth'), 'index,follow');
});
test('allowlist is per language (en-only slug stays noindex in ko, and vice versa)', () => {
  assert.strictEqual(robots(dirs.ko, 'thinen'), 'noindex,follow');
  assert.strictEqual(robots(dirs.en, 'thinko'), 'noindex,follow');
});
test('non-allowlisted thin pages stay noindex,follow', () => {
  ['thinno', 'thinone'].forEach(s => { assert.strictEqual(robots(dirs.en, s), 'noindex,follow'); assert.strictEqual(robots(dirs.ko, s), 'noindex,follow'); });
});
test('pool-threshold pages stay index,follow', () => {
  ['biga', 'bigb'].forEach(s => { assert.strictEqual(robots(dirs.en, s), 'index,follow'); assert.strictEqual(robots(dirs.ko, s), 'index,follow'); });
});

console.log('pt/es never grow');
test('pt and es contain exactly the pool-threshold pages, even for allowlisted slugs', () => {
  ['pt', 'es'].forEach(l => {
    const files = fs.readdirSync(path.join(TMP, dirs[l])).filter(f => f.endsWith('.html') && f !== 'index.html').map(f => f.slice(0, -5)).sort();
    assert.deepStrictEqual(files, ['biga', 'bigb'], l + ' pages: ' + files);
    assert.deepStrictEqual(slugsIn(l).sort(), ['biga', 'bigb'], l + ' sitemap');
  });
});
test('renderTokenPage still refuses a thin page in a head-scope language, allowlisted or not', () => {
  const gen = require('./generate-token-pages.js');
  const rec = { symbol: 'THIN', slug: 'thin', qualifyingCount: 1, totalTvl: 5e6, chains: new Set(['Ethereum']), pools: [mk('THIN', 'aave-v3', 'Ethereum', 5e6, 6.2, 'x')] };
  const allowlist = { en: new Set(['thin']), ko: new Set(['thin']), pt: new Set(['thin']), es: new Set(['thin']) };
  ['pt', 'es'].forEach(l => assert.throws(() => gen.renderTokenPage(rec, [], undefined, [], l, undefined, { allowlist }), /refusing to render noindexed thin token page/));
  assert.strictEqual(gen.isIndexableToken(rec, 'pt', allowlist), false);
  assert.strictEqual(gen.isIndexableToken(rec, 'en', allowlist), true);
  assert.strictEqual(gen.isIndexableToken(Object.assign({}, rec, { qualifyingCount: 0 }), 'en', allowlist), false, 'qualifyingCount >= 1 guard');
});

console.log('sitemaps');
test('en/ko token sitemaps list no noindexed slug and every indexable head/allowlisted page', () => {
  ['en', 'ko'].forEach(l => {
    const listed = slugsIn(l);
    listed.forEach(s => assert.ok(robots(dirs[l], s).startsWith('index'), `${l} sitemap lists noindexed ${s}`));
    const expected = ['biga', 'bigb', 'thinboth'].concat(l === 'en' ? ['thinen'] : ['thinko']).sort();
    assert.deepStrictEqual(listed.slice().sort(), expected, l + ' sitemap slugs');
  });
});
test('hreflang alternates (sitemap and page) only name indexable, existing versions', () => {
  const xml = read(smFile.en);
  const entry = (slug) => new RegExp(`<url>\\s*<loc>[^<]*/tokens/${slug}</loc>([\\s\\S]*?)</url>`).exec(xml)[1];
  const hrefs = (s) => [...s.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(hrefs(entry('thinen')).sort(), ['en', 'x-default'], 'thinen: ko is noindex -> not advertised');
  assert.deepStrictEqual(hrefs(entry('thinboth')).sort(), ['en', 'ko', 'x-default']);
  assert.deepStrictEqual(hrefs(entry('biga')).sort(), ['en', 'es', 'ko', 'pt', 'x-default']);
  const page = read(dirs.en, 'thinen.html');
  assert.ok(!/hreflang="ko"/.test(page.split('</head>')[0]), 'thinen page head must not advertise the noindexed ko');
  const koOnly = read(dirs.ko, 'thinko.html').split('</head>')[0];
  assert.ok(/hreflang="ko"/.test(koOnly) && !/hreflang="en"/.test(koOnly), 'thinko: only ko advertised (en is noindex)');
  assert.ok(/hreflang="x-default" href="[^"]*\/ko\/tokens\/thinko"/.test(koOnly), 'x-default falls back to ko when en is noindex');
});

console.log('noindex manifests');
test('manifests are per language and equal the set of noindex,follow pages', () => {
  ['en', 'ko'].forEach(l => {
    const manifest = JSON.parse(read(dirs[l], '.noindex-slugs.json')).sort();
    const actual = fs.readdirSync(path.join(TMP, dirs[l])).filter(f => f.endsWith('.html') && f !== 'index.html')
      .map(f => f.slice(0, -5)).filter(s => robots(dirs[l], s).startsWith('noindex')).sort();
    assert.deepStrictEqual(manifest, actual, l + ' manifest');
  });
  assert.ok(!JSON.parse(read(dirs.en, '.noindex-slugs.json')).includes('thinen'));
  assert.ok(JSON.parse(read(dirs.ko, '.noindex-slugs.json')).includes('thinen'));
});

console.log('consumers');
test('indexnow honours the per-language manifest', () => {
  const { collectEstateUrls } = require('./indexnow-ping.js');
  const urls = collectEstateUrls(TMP, { skipNoindex: true });
  const has = (p) => urls.some(u => new URL(u).pathname === p);
  assert.ok(has('/tokens/thinen'), 'en thinen submitted');
  assert.ok(!has('/ko/tokens/thinen'), 'ko thinen (noindex) not submitted');
  assert.ok(has('/ko/tokens/thinko'), 'ko thinko submitted');
  assert.ok(!has('/tokens/thinko'), 'en thinko (noindex) not submitted');
});

console.log('config + refresh script');
test('config/seo-index-allowlist.json: header + sorted unique slug arrays', () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'seo-index-allowlist.json'), 'utf8'));
  assert.ok(j.source && j.generated);
  ['en', 'ko'].forEach(l => {
    assert.ok(Array.isArray(j[l]) && j[l].length > 0);
    assert.deepStrictEqual(j[l], Array.from(new Set(j[l])).sort(), l + ' sorted+unique');
  });
});
test('gsc-index-allowlist.extractSlugs: en/ko token pages with >=1 impression only', () => {
  const { extractSlugs, windowDates } = require('./scripts/gsc-index-allowlist.js');
  const row = (u, i) => ({ keys: ['https://www.defi.garden' + u], impressions: i });
  const out = extractSlugs([row('/tokens/wgram', 60), row('/ko/tokens/cc', 3), row('/tokens/zero', 0), row('/tokens/az/a', 9),
    row('/tokens', 5), row('/chains/base', 7), row('/pt/tokens/usdc', 4), row('/tokens/wgram/', 2)]);
  assert.deepStrictEqual(out, { en: ['wgram'], ko: ['cc'] });
  const w = windowDates(new Date('2026-10-22T00:00:00Z'));
  assert.deepStrictEqual(w, { startDate: '2026-07-21', endDate: '2026-10-19' });
});

console.log('sitemap-main (real generateSitemapSuite run in a temp cwd)');
const MAIN = (() => {
  const cwd0 = process.cwd();
  const sub = path.join(TMP, 'sm'); fs.mkdirSync(sub);
  const silent = console.log; console.log = () => {};
  try {
    process.chdir(sub);
    return require('./generate-sitemap.js').generateSitemapSuite(FIXTURE).then(() => { console.log = silent; process.chdir(cwd0); return fs.readFileSync(path.join(sub, 'sitemap-main.xml'), 'utf8'); });
  } catch (e) { console.log = silent; process.chdir(cwd0); throw e; }
})();
test('plan.html and stories/*.html canonicals are extensionless', () => {
  const files = ['plan.html', 'stories/tomoko.html', 'stories/kevin.html', 'stories/lucia.html'];
  files.forEach(f => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const head = html.split('</head>')[0];
    assert.ok(!/defi\.garden\/(?:plan|stories\/\w+)\.html/.test(head), f + ' still references a .html URL in <head>');
    assert.ok(/rel="canonical" href="https:\/\/www\.defi\.garden\/(?:plan|stories\/\w+)"/.test(head), f + ' canonical');
  });
});

MAIN.then((xml) => {
  test('sitemap-main: no .html URL, no /mcp, plan + stories extensionless', () => {
    const l = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    assert.ok(l.length > 5);
    assert.deepStrictEqual(l.filter(u => /\.html($|\?)/.test(u)), []);
    assert.ok(!l.some(u => new URL(u).pathname === '/mcp'), '/mcp listed');
    ['/plan', '/stories/tomoko', '/stories/kevin', '/stories/lucia'].forEach(p => assert.ok(l.some(u => new URL(u).pathname === p), p + ' missing'));
  });
  test('sitemap-main: home advertises no ?lang=ko alternate; other URLs keep their ko alternate', () => {
    const entry = (p) => new RegExp('<url>\\s*<loc>https://www\\.defi\\.garden' + p + '</loc>([\\s\\S]*?)</url>').exec(xml)[1];
    assert.ok(!/lang=ko/.test(entry('/')), 'home still has ?lang=ko alternate');
    assert.ok(/hreflang="x-default"/.test(entry('/')));
    assert.ok(/hreflang="ko"/.test(entry('/stocks')));
  });
  console.log('\n' + passed + ' passed');
}).catch((e) => { console.error(e); process.exit(1); });
