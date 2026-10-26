/* test_protocol_pages.js — W4 static protocol pages
   (generate-protocol-pages.js + generate-protocol-pages-core.js), fixtures only.
   Plain node, assert-style. Run: node test_protocol_pages.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const core = require('./generate-protocol-pages-core.js');
const gen = require('./generate-protocol-pages.js');
const poolGen = require('./generate-pool-score-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

let seq = 0;
function mk(over) {
  seq++;
  return Object.assign({
    pool: `aaaaaaaa-bbbb-4ccc-8ddd-${String(seq).padStart(12, '0')}`, chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC',
    tvlUsd: 3000000, apyBase: 3.2, apyReward: 0.8, apyMean30d: 3.5, poolMeta: null,
    forecast: { horizonDays: 14, p10: 3.1, p50: 3.9, p90: 4.6 },
    defiScore: { score: 88.4, rating: 'AA', pillarsPct: { stability: 98 }, pillarsTier: { stability: 'High', sustainability: 'Medium', stickiness: 'High', liquidity: 'Low' } }
  }, over || {});
}
/** n pools of a project, each with the given TVL. */
function proj(project, n, tvl, over) {
  return Array.from({ length: n }, () => mk(Object.assign({ project, tvlUsd: tvl }, over || {})));
}
const SNAP = '2026-10-26T04:00:00.000Z';
const ctx = { snapshotIso: SNAP };
const slugs = (pools, limit) => core.selectProtocols(pools, limit).selected.map(r => r.project);

console.log('gating');
test('thresholds are the named, owner-set constants', () => {
  assert.strictEqual(core.PROTOCOL_MIN_POOLS, 3);
  assert.strictEqual(core.PROTOCOL_MIN_TVL_USD, 5000000);
  assert.strictEqual(core.PROTOCOL_PAGE_LIMIT, 80);
});
test('3 pools and exactly $5M qualifies', () => {
  assert.deepStrictEqual(slugs([mk({ project: 'p-a', tvlUsd: 2000000 }), mk({ project: 'p-a', tvlUsd: 2000000 }), mk({ project: 'p-a', tvlUsd: 1000000 })]), ['p-a']);
});
test('2 pools, however large, gets no page', () => assert.deepStrictEqual(slugs(proj('p-b', 2, 1e9)), []));
test('3 pools with $4.9M total gets no page', () => {
  assert.deepStrictEqual(slugs([mk({ project: 'p-c', tvlUsd: 2000000 }), mk({ project: 'p-c', tvlUsd: 2000000 }), mk({ project: 'p-c', tvlUsd: 900000 })]), []);
});
test('pools failing the rails do not count toward the gate', () => {
  const pools = proj('p-d', 3, 2000000).concat([mk({ project: 'p-d', tvlUsd: 99999 })]);
  assert.strictEqual(core.selectProtocols(pools).selected[0].pools.length, 3); // sub-floor pool excluded
  const anomalous = proj('p-e', 2, 3000000).concat([mk({ project: 'p-e', tvlUsd: 3000000, apyBase: 1001, apyReward: 0 })]);
  assert.deepStrictEqual(slugs(anomalous), []);
  const unscored = proj('p-f', 2, 3000000).concat([mk({ project: 'p-f', tvlUsd: 3000000, defiScore: null })]);
  assert.deepStrictEqual(slugs(unscored), []);
});
test('capped at the top N by TVL', () => {
  const pools = [];
  for (let i = 0; i < 6; i++) pools.push(...proj('proto-' + i, 3, 2000000 + i * 100000));
  assert.deepStrictEqual(slugs(pools, 2), ['proto-5', 'proto-4']);
  const r = core.selectProtocols(pools, 2);
  assert.strictEqual(r.eligibleCount, 6);
});
test('slugs are url-safe (dots etc. collapse) and unique', () => {
  const r = core.selectProtocols(proj('ether.fi-stake', 3, 2000000).concat(proj('ether-fi-stake', 3, 1900000))).selected;
  assert.deepStrictEqual(r.map(x => x.slug), ['ether-fi-stake', 'ether-fi-stake-2']);
});
test('display name keeps the version lowercase', () => assert.strictEqual(core.protocolDisplayName('aave-v3'), 'Aave v3'));

console.log('yield floor');
test('MIN_PAGE_APY is the named 0.1 constant; pools under it never count', () => {
  assert.strictEqual(core.MIN_PAGE_APY, 0.1);
  assert.ok(core.isQualifyingScoredPool(mk({ apyBase: 0.1, apyReward: 0 })));
  assert.ok(core.isQualifyingScoredPool(mk({ apyBase: 0.06, apyReward: 0.04 })));
  assert.ok(!core.isQualifyingScoredPool(mk({ apyBase: 0.09, apyReward: 0 })));
  // 3 zero-yield mega pools + 2 yielding: no page (gate applies after the filter)
  const pools = proj('zy', 3, 1e9, { apyBase: 0, apyReward: 0 }).concat(proj('zy', 2, 3000000));
  assert.deepStrictEqual(slugs(pools), []);
});
test('stats, ratings, table and JSON-LD use only qualifying pools; median on qualifying pools', () => {
  const pools = proj('mix', 3, 2000000, { apyBase: 4, apyReward: 0 })
    .concat(proj('mix', 5, 9e8, { apyBase: 0.02, apyReward: 0, defiScore: { score: 95, rating: 'AAA', pillarsTier: {} } }));
  const r = core.selectProtocols(pools).selected[0];
  assert.strictEqual(r.pools.length, 3);
  const st = gen.protocolStats(r);
  assert.strictEqual(st.medApy, 4);
  assert.deepStrictEqual(st.ratings, { AA: 3 });
  const h = gen.renderProtocolPage(r, ctx, 'en');
  const apys = [...h.matchAll(/<td class="num">(\d[\d,.]*)%<\/td>\s*<td class="num">[\d.]+%–/g)].map(m => parseFloat(m[1]));
  assert.strictEqual(apys.length, 3);
  assert.ok(apys.every(a => a >= core.MIN_PAGE_APY));
  assert.ok(!/AAA<\/span> <b>/.test(h), 'excluded AAA pools leaked into the distribution');
  assert.ok(h.includes('Pools under 0.1% APY, such as collateral-only markets, are not listed.'));
  const il = JSON.parse([...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1])[2]);
  assert.strictEqual(il.itemListElement.length, 3);
});

console.log('generated output');
const rec = core.selectProtocols(
  proj('aave-v3', 4, 3000000, { chain: 'Base' }).concat(proj('aave-v3', 2, 2000000, { chain: 'Ethereum', defiScore: { score: 70.1, rating: 'A', pillarsTier: { stability: 'Low' } } }))
).selected[0];
const html = gen.renderProtocolPage(rec, ctx, 'en');
const ko = gen.renderProtocolPage(rec, ctx, 'ko');
const hub = gen.renderProtocolsHub([rec], ctx, 'en');
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

test('title is <= 60 chars in every language and follows the pattern', () => {
  const m = /<title>([^<]*)<\/title>/.exec(html)[1];
  assert.strictEqual(m, 'Aave v3 yields: DeFi Score, 14-day forecast | DeFi Garden');
  [html, ko, hub, gen.renderProtocolsHub([rec], ctx, 'ko')].forEach(h => assert.ok(/<title>([^<]*)<\/title>/.exec(h)[1].length <= 60));
  const long = { project: 'some-extremely-long-protocol-name-v3-final', slug: 'x', pools: rec.pools, tvl: rec.tvl };
  assert.ok(/<title>([^<]*)<\/title>/.exec(gen.renderProtocolPage(long, ctx, 'en'))[1].length <= 60);
});
test('summary numbers come from the data', () => {
  const st = gen.protocolStats(rec);
  assert.strictEqual(st.count, 6);
  assert.strictEqual(st.chainCount, 2);
  assert.deepStrictEqual(st.ratings, { AA: 4, A: 2 });
  assert.ok(html.includes('6 Aave v3 pools across 2 chains'));
  assert.ok(html.includes('$16M') || html.includes('$16'));
  assert.ok(/AA<\/span> <b>4<\/b>/.test(html) && /A<\/span> <b>2<\/b>/.test(html));
  assert.ok(html.includes('Lending'));
});
test('medians: odd/even/null', () => {
  assert.strictEqual(gen.median([3, 1, 2]), 2);
  assert.strictEqual(gen.median([1, 2, 3, 4]), 2.5);
  assert.strictEqual(gen.median([]), null);
});
test('table rows are capped and link to the app filter', () => {
  const big = core.selectProtocols(proj('big', 70, 1000000)).selected[0];
  const h = gen.renderProtocolPage(big, ctx, 'en');
  assert.strictEqual((h.match(/<td class="num">\$1M<\/td>\s*<\/tr>/g) || []).length, core.PROTOCOL_TABLE_MAX_ROWS);
  assert.ok(h.includes('Showing the 50 largest of 70 pools'));
  assert.ok(h.includes('/?protocols=big#src=seo_protocol'));
});
test('pool rows link to /pools/<slug> if a static page exists, else /?pool=<id>', () => {
  assert.ok(html.includes('/?pool=aaaaaaaa-bbbb-4ccc-8ddd-'));
  const linksMod = require('./pool-page-links.js');
  linksMod.setPoolPageManifest(new Map([[rec.pools[0].pool, 'aave-v3-usdc-base']]));
  try { assert.ok(gen.renderProtocolPage(rec, ctx, 'en').includes('/pools/aave-v3-usdc-base')); }
  finally { linksMod.setPoolPageManifest(null); }
});
test('pillars render as tiers, never numbers, weights, cutoffs or model names', () => {
  assert.ok(!/pillarsPct|pillars_pct/.test(html + ko + hub));
  assert.ok(html.includes('Yield stability: High'));
  assert.ok(!/timesfm|alchemy|\b(35|25|15)\s*%|\/\s*(35|25|15)\b|breakdown/i.test(text(html)));
  assert.ok(!/\b98\b/.test(text(html)), 'a pillar number leaked');
});
test('no safety / audit claims', () => {
  [html, ko, hub].forEach(h => assert.ok(!/\bsafe(ty|ly)?\b|audit|hack|exploit/i.test(text(h)), 'claim found'));
});
test('bands are called model output, not a credit rating; methodology + not-advice present', () => {
  assert.ok(/not a credit rating/.test(html));
  assert.ok(html.includes('/methodology'));
  assert.ok(/Education, not advice/.test(html));
});
test('permissioned protocol carries the access label; open one does not', () => {
  const perm = core.selectProtocols(proj('blackrock-buidl', 3, 2000000)).selected[0];
  assert.strictEqual(perm.permissioned, true);
  assert.ok(gen.renderProtocolPage(perm, ctx, 'en').includes('Permissioned / KYC only'));
  assert.ok(!html.includes('Permissioned / KYC only'));
  assert.ok(!/\bbest\b/i.test(text(gen.renderProtocolPage(perm, ctx, 'en'))));
  assert.ok(hub.includes('prp-table'));
});
test('JSON-LD: valid, BreadcrumbList + Dataset (ISO date, free) + ItemList', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const types = blocks.map(b => b['@type']);
  assert.deepStrictEqual(types, ['BreadcrumbList', 'Dataset', 'ItemList']);
  const ds = blocks[1];
  assert.strictEqual(ds.isAccessibleForFree, true);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(ds.dateModified));
  assert.ok(ds.variableMeasured.every(v => v.name && v.value === undefined));
  assert.strictEqual(blocks[2].itemListElement.length, 6);
});
test('canonical, hreflang (en/ko/x-default) and OG tags', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/protocols/aave-v3">'));
  assert.ok(ko.includes('<link rel="canonical" href="https://www.defi.garden/ko/protocols/aave-v3">'));
  ['en', 'ko', 'x-default'].forEach(l => assert.ok(html.includes(`hreflang="${l}"`)));
  assert.ok(!html.includes('hreflang="pt"'));
  assert.ok(html.includes('property="og:title"') && html.includes('property="og:url"'));
  assert.ok(html.includes('<meta name="robots" content="index,follow">'));
});
test('KO page is localised', () => assert.ok(/수익률/.test(ko) && /<html lang="ko">/.test(ko)));
test('hub lists every selected protocol with a link', () => assert.ok(hub.includes('href="https://www.defi.garden/protocols/aave-v3"')));

console.log('sitemap + files');
test('sitemap entries match the generated pages (hub + one per protocol), with alternates', () => {
  const sm = gen.renderProtocolsSitemap([rec], '2026-10-26', 'en');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepStrictEqual(locs, ['https://www.defi.garden/protocols', 'https://www.defi.garden/protocols/aave-v3']);
  assert.ok(sm.includes('hreflang="ko"'));
  const kosm = gen.renderProtocolsSitemap([rec], '2026-10-26', 'ko');
  assert.ok(kosm.includes('<loc>https://www.defi.garden/ko/protocols/aave-v3</loc>'));
});
test('writeSet writes pages, removes only its own stale pages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prp-'));
  try {
    fs.writeFileSync(path.join(dir, 'gone.html'), gen.GENERATOR_MARKER + '\n<html></html>');
    fs.writeFileSync(path.join(dir, 'foreign.html'), '<html>not ours</html>');
    const removed = gen.writeSet(dir, 'en', [rec], ctx);
    assert.strictEqual(removed, 1);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['aave-v3.html', 'foreign.html', 'index.html']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('manifest lists the same pages', () => {
  const m = gen.buildManifest([rec], SNAP);
  assert.strictEqual(m.count, 1);
  assert.strictEqual(m.pages[0].slug, 'aave-v3');
});
test('outputs registered: site-outputs, gitignore, sitemap index, workflow, proprietary surface', () => {
  const r = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  assert.ok(/^protocols$/m.test(r('scripts/site-outputs.txt')) && /^data\/protocol-pages\.json$/m.test(r('scripts/site-outputs.txt')));
  assert.ok(/^\/protocols\/$/m.test(r('.gitignore')));
  assert.ok(r('generate-sitemap.js').includes("'protocol'"));
  assert.ok(r('.github/workflows/sitemap-update.yml').includes('node generate-protocol-pages.js'));
  assert.ok(r('test_proprietary_surface.js').includes('generate-protocol-pages.js'));
});

console.log('cross-links');
test('pool score page links to its protocol page only when that page exists (en/ko)', () => {
  const pool = mk({ project: 'aave-v3' });
  const base = { slug: 'aave-v3-usdc-base', slugOf: new Map(), selected: [pool], snapshotIso: SNAP, series: [], protocolUrls: {}, chainSlugs: new Set(), hasAccuracyPage: false };
  const withP = poolGen.renderPoolScorePage(pool, Object.assign({}, base, { protocolSlugs: new Map([['aave-v3', 'aave-v3']]) }), 'en');
  assert.ok(withP.includes('href="https://www.defi.garden/protocols/aave-v3">Protocol: Aave v3 →'));
  assert.ok(poolGen.renderPoolScorePage(pool, Object.assign({}, base, { protocolSlugs: new Map([['aave-v3', 'aave-v3']]) }), 'ko').includes('/ko/protocols/aave-v3'));
  assert.ok(!poolGen.renderPoolScorePage(pool, Object.assign({}, base, { protocolSlugs: new Map() }), 'en').includes('/protocols/'));
  assert.ok(!poolGen.renderPoolScorePage(pool, Object.assign({}, base, { protocolSlugs: new Map([['aave-v3', 'aave-v3']]) }), 'pt').includes('/protocols/'));
});

console.log(`\n${passed} passed`);
