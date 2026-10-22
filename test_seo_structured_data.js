/* test_seo_structured_data.js — schema.org JSON-LD hygiene across the SEO estate.
   1. every date-like JSON-LD field is ISO 8601 (the VISIBLE date stays human-readable);
   2. token / chain / pool-score Dataset blocks carry isAccessibleForFree + variableMeasured
      (+ temporalCoverage), and any distribution.contentUrl is a file the generator really writes;
   3. /for/* Product blocks carry an `image` that is the page's own og:image;
   4. every JSON-LD block on a sample of generated pages parses (EN/KO/PT/ES).
   Run: node test_seo_structured_data.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tp = require('./generate-token-pages.js');
const chainGen = require('./generate-chain-pages.js');
const poolGen = require('./generate-pool-score-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INTERVAL = /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/;
const DATE_KEYS = ['dateModified', 'datePublished', 'dateCreated', 'uploadDate', 'temporalCoverage', 'validFrom', 'validThrough'];

function ldBlocks(html) {
  const out = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(JSON.parse(m[1])); // throws on invalid JSON
  return out;
}
function walkDates(node, cb) {
  if (Array.isArray(node)) return node.forEach(n => walkDates(n, cb));
  if (node && typeof node === 'object') {
    Object.keys(node).forEach(k => { if (DATE_KEYS.includes(k)) cb(k, node[k]); walkDates(node[k], cb); });
  }
}
function assertIsoDates(html, label) {
  const blocks = ldBlocks(html);
  assert.ok(blocks.length > 0, label + ': no JSON-LD found');
  walkDates(blocks, (k, v) => {
    assert.ok(typeof v === 'string' && (ISO_DATE.test(v) || ISO_INTERVAL.test(v) || /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(v)),
      `${label}: ${k} = ${JSON.stringify(v)} is not ISO 8601`);
  });
}
function dataset(html) { return ldBlocks(html).find(b => b['@type'] === 'Dataset'); }
function assertRichDataset(d, label) {
  assert.ok(d, label + ': no Dataset');
  assert.strictEqual(d.isAccessibleForFree, true, label + ': isAccessibleForFree');
  assert.ok(Array.isArray(d.variableMeasured) && d.variableMeasured.length >= 2, label + ': variableMeasured');
  d.variableMeasured.forEach(v => assert.ok(v['@type'] === 'PropertyValue' && v.name, label + ': PropertyValue.name'));
  assert.ok(d.description.length >= 50 && d.description.length <= 5000, label + ': description length');
  assert.ok(ISO_DATE.test(d.dateModified), label + ': dateModified');
}

console.log('toIsoDate');
test('converts the en-US long date, passes ISO through, rejects junk', () => {
  assert.strictEqual(tp.toIsoDate('October 22, 2026'), '2026-10-22');
  assert.strictEqual(tp.toIsoDate('January 1, 2027'), '2027-01-01');
  assert.strictEqual(tp.toIsoDate('2020-01-01'), '2020-01-01');
  assert.strictEqual(tp.toIsoDate('2026-10-04T21:16:57.774Z'), '2026-10-04');
  assert.strictEqual(tp.toIsoDate('soon'), null);
  assert.ok(ISO_DATE.test(tp.toIsoDate(tp.todayGeneratedDate())));
});

const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-chain-sample.json'), 'utf8'));
const tokenRanked = tp.rankTopTokens(JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8')));
const chainRanked = chainGen.rankTopChains(pools);
const GEN = 'October 22, 2026';

console.log('token pages');
['en', 'ko', 'pt', 'es'].forEach(lang => {
  const rec = Object.assign({}, tokenRanked[0], { qualifyingCount: 99 }); // force indexable so head-scope pt/es render
  assert.ok(tp.isIndexableToken(rec));
  const html = tp.renderTokenPage(rec, [], GEN, [], lang);
  test(`${lang}: ISO dates, rich Dataset, visible date stays human-readable`, () => {
    assertIsoDates(html, 'token ' + lang);
    const d = dataset(html);
    assertRichDataset(d, 'token ' + lang);
    assert.strictEqual(d.dateModified, '2026-10-22');
    assert.strictEqual(d.temporalCoverage, '2026-10-22');
    assert.ok(html.includes(GEN), 'visible human date missing');
    assert.ok(d.keywords.includes(rec.symbol));
  });
  test(`${lang}: distribution only where a .md twin is written (en/ko)`, () => {
    const d = dataset(html);
    if (lang === 'en' || lang === 'ko') {
      assert.strictEqual(d.distribution.length, 1);
      assert.strictEqual(d.distribution[0].encodingFormat, 'text/markdown');
      const prefix = lang === 'en' ? '' : '/' + lang;
      assert.strictEqual(d.distribution[0].contentUrl, `${tp.SITE_URL}${prefix}/tokens/${rec.slug}.md`);
    } else assert.strictEqual(d.distribution, undefined);
  });
});

console.log('chain pages');
['en', 'ko', 'pt', 'es'].forEach(lang => {
  const rec = chainRanked[0];
  const html = chainGen.renderChainPage(rec, [], GEN, [], lang);
  test(`${lang}: ISO dates + rich Dataset + conditional distribution`, () => {
    assertIsoDates(html, 'chain ' + lang);
    const d = dataset(html);
    assertRichDataset(d, 'chain ' + lang);
    assert.strictEqual(d.dateModified, '2026-10-22');
    if (lang === 'en' || lang === 'ko') {
      assert.strictEqual(d.distribution[0].contentUrl, d.url + '.md');
      assert.ok(/\/chains\//.test(d.distribution[0].contentUrl));
    } else assert.strictEqual(d.distribution, undefined);
  });
});

console.log('generators write the twins that distribution points at');
test('token and chain generators write <slug>.md for en and the all-scope languages', () => {
  const tsrc = fs.readFileSync(path.join(__dirname, 'generate-token-pages.js'), 'utf8');
  const csrc = fs.readFileSync(path.join(__dirname, 'generate-chain-pages.js'), 'utf8');
  [tsrc, csrc].forEach(src => {
    assert.ok(/\$\{rec\.slug\}\.md`\), render(Token|Chain)PageMarkdown\(.*'en'/.test(src), 'en .md twin write not found');
    assert.ok(/l\.scope === 'all'/.test(src), 'all-scope guard not found');
  });
  const { LANGUAGES } = require('./languages.js');
  LANGUAGES.forEach(l => assert.strictEqual(tp.markdownDistributionFor('https://x/y', l.code).length, l.scope === 'all' ? 1 : 0));
});

console.log('pool-score pages');
let seq = 0;
function mk(over) {
  seq++;
  return Object.assign({
    pool: `aaaaaaaa-bbbb-4ccc-8ddd-${String(seq).padStart(12, '0')}`, chain: 'Base', project: 'aave-v3', symbol: 'USDC', tvlUsd: 50000000,
    apyBase: 3.2, apyReward: 0.8, apyMean30d: 3.5, poolMeta: null, exposure: 'single', ilRisk: 'no',
    kpis: { historyPoints: 30, firstSeen: '2026-09-05', apyStdev: 0.1, apyMean: 3.5, tvlTrend: 0.05 },
    forecast: { horizonDays: 14, p10: 3.1, p50: 3.9, p90: 4.6, crashRisk: 'LOW', predictedTvlUsd: 51000000, predictedTvlDelta: 0.02, trajectory: Array.from({ length: 14 }, () => 3.9) },
    defiScore: { score: 91.6, rating: 'AAA', breakdown: { stability: 34.2, sustainability: 22.2, stickiness: 21.1, liquidity: 14.1 } }
  }, over || {});
}
const pool = mk();
const series = [{ date: '2026-09-20', apy: 3.9 }, { date: '2026-09-21', apy: 4.0 }, { date: '2026-10-04', apy: 4.0 }];
const slugOf = new Map([[pool.pool, 'aave-v3-usdc-base']]);
const ctx = { slug: 'aave-v3-usdc-base', slugOf, selected: [pool], snapshotIso: '2026-10-04T21:16:57.774Z', series, protocolUrls: {}, chainSlugs: new Set(), hasAccuracyPage: false };
['en', 'ko', 'pt', 'es'].forEach(lang => {
  test(`${lang}: ISO dates, rich Dataset, temporalCoverage = plotted history window, no distribution`, () => {
    const html = poolGen.renderPoolScorePage(pool, ctx, lang);
    assertIsoDates(html, 'pool ' + lang);
    const d = dataset(html);
    assertRichDataset(d, 'pool ' + lang);
    assert.strictEqual(d.dateModified, '2026-10-04');
    assert.strictEqual(d.temporalCoverage, '2026-09-20/2026-10-04');
    assert.strictEqual(d.distribution, undefined, 'no twin is guaranteed for every scored page');
    const names = d.variableMeasured.map(v => v.name);
    ['APY', 'Base APY', 'Reward APY', 'TVL', 'DeFi Score', '14-day APY forecast'].forEach(n => assert.ok(names.includes(n), n));
  });
});
test('pool-score: no 30-day mean claimed when the pool has none; no history -> snapshot date', () => {
  const p2 = mk({ apyMean30d: null });
  const html = poolGen.renderPoolScorePage(p2, Object.assign({}, ctx, { series: [], selected: [p2], slugOf: new Map([[p2.pool, 'x']]) }), 'en');
  const d = dataset(html);
  assert.ok(!d.variableMeasured.some(v => v.name === '30-day mean APY'));
  assert.strictEqual(d.temporalCoverage, '2026-10-04');
});

console.log('home.html static Dataset');
test('home Dataset parses and is free/measured', () => {
  const home = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
  const d = ldBlocks(home).find(b => b['@type'] === 'Dataset');
  assert.strictEqual(d.isAccessibleForFree, true);
  assert.ok(d.variableMeasured.length >= 2);
  assertIsoDates(home, 'home');
});

console.log('stories + guide JSON-LD dates');
test('committed stories and the guide use ISO dates', () => {
  ['stories/kevin.html', 'stories/lucia.html', 'stories/tomoko.html', 'guide/defi-yield-rates-explained.html'].forEach(f => {
    assertIsoDates(fs.readFileSync(path.join(__dirname, f), 'utf8'), f);
  });
});

console.log('/for/* intent portal pages');
test('every for/*.html Product has an image equal to its og:image; JSON-LD parses; no ratings/reviews', () => {
  const files = fs.readdirSync(path.join(__dirname, 'for')).filter(f => f.endsWith('.html'));
  assert.ok(files.length >= 23);
  files.forEach(f => {
    const html = fs.readFileSync(path.join(__dirname, 'for', f), 'utf8');
    const graph = ldBlocks(html).flatMap(b => b['@graph'] || [b]);
    const product = graph.find(n => n['@type'] === 'Product');
    assert.ok(product, f + ': no Product');
    const og = /<meta property="og:image" content="([^"]+)"/.exec(html)[1];
    assert.strictEqual(product.image, og, f + ': Product.image must equal og:image');
    assert.ok(/^https:\/\/www\.defi\.garden\//.test(product.image));
    assert.ok(fs.existsSync(path.join(__dirname, product.image.replace('https://www.defi.garden/', ''))), f + ': image file missing in repo');
    assert.ok(!('aggregateRating' in product) && !('review' in product), f + ': invented rating/review');
  });
});

console.log(`\n${passed} assertions passed`);
