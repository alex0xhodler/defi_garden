/* test_pool_score_pages.js — W1 static scored pool pages
   (generate-pool-score-pages.js, pool-page-links.js, permissioned-projects.js).
   Plain node, assert-style. Run: node test_pool_score_pages.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gen = require('./generate-pool-score-pages.js');
const links = require('./pool-page-links.js');
const tokenGen = require('./generate-token-pages.js');
const chainGen = require('./generate-chain-pages.js');
const { PERMISSIONED_PROJECT_LIST } = require('./permissioned-projects.js');
const { formatApy, formatUsd, SITE_URL } = tokenGen;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

let seq = 0;
function uuid() { seq++; const h = String(seq).padStart(12, '0'); return `aaaaaaaa-bbbb-4ccc-8ddd-${h}`; }
function mk(over) {
  return Object.assign({
    pool: uuid(), chain: 'Base', project: 'aave-v3', symbol: 'USDC', tvlUsd: 50000000,
    apyBase: 3.2, apyReward: 0.8, apyMean30d: 3.5, poolMeta: null, exposure: 'single', ilRisk: 'no',
    kpis: { historyPoints: 30, firstSeen: '2026-09-05', apyStdev: 0.1, apyMean: 3.5, tvlTrend: 0.05 },
    forecast: { horizonDays: 14, p10: 3.1, p50: 3.9, p90: 4.6, crashRisk: 'LOW', predictedTvlUsd: 51000000, predictedTvlDelta: 0.02, trajectory: Array.from({ length: 14 }, (_, i) => 3.9 + i * 0.001) },
    defiScore: { score: 91.6, rating: 'AAA', pillarsPct: { stability: 98, sustainability: 89, stickiness: 84, liquidity: 94 } }
  }, over || {});
}
const SNAP = '2026-10-04T21:16:57.774Z';

// ---- eligibility ----
console.log('eligibility gate');
test('a good pool qualifies', () => assert.ok(gen.isEligibleScoredPool(mk())));
test('TVL below $10M is rejected, exactly $10M passes', () => {
  assert.ok(!gen.isEligibleScoredPool(mk({ tvlUsd: gen.W1_MIN_TVL_USD - 1 })));
  assert.ok(gen.isEligibleScoredPool(mk({ tvlUsd: gen.W1_MIN_TVL_USD })));
});
test('history < 30 points is rejected', () => {
  assert.ok(!gen.isEligibleScoredPool(mk({ kpis: { historyPoints: 29 } })));
  assert.ok(!gen.isEligibleScoredPool(mk({ kpis: null })));
});
test('missing defiScore or forecast is rejected', () => {
  assert.ok(!gen.isEligibleScoredPool(mk({ defiScore: null })));
  assert.ok(!gen.isEligibleScoredPool(mk({ forecast: null })));
});
test('anomalous APY (> APY_SANITY_LIMIT) is rejected via the shared trust rail', () => {
  assert.ok(!gen.isEligibleScoredPool(mk({ apyBase: tokenGen.APY_SANITY_LIMIT + 1, apyReward: 0 })));
  assert.ok(!gen.isEligibleScoredPool(mk({ apyBase: 600, apyReward: 600 })));
});
test('yield floor is the named constant 0.5 (a page-selection rule, not a trust rail)', () => {
  assert.strictEqual(gen.W1_MIN_APY_PCT, 0.5);
  assert.strictEqual(tokenGen.APY_SANITY_LIMIT, 1000);
});
test('(a) zero-yield high-TVL pool (live and 30d mean ~0) is excluded', () => {
  assert.ok(!gen.isEligibleScoredPool(mk({ tvlUsd: 5e9, apyBase: 0.003, apyReward: 0, apyMean30d: 0.004 })));
  assert.ok(!gen.isEligibleScoredPool(mk({ tvlUsd: 5e9, apyBase: 0, apyReward: 0, apyMean30d: 0 })));
});
test('(b) feed gap: live 0 but 30d mean 4% is excluded', () => {
  assert.ok(!gen.isEligibleScoredPool(mk({ apyBase: 0, apyReward: 0, apyMean30d: 4.1 })));
});
test('(c) live 4% but 30d mean 0.2% is excluded', () => {
  assert.ok(!gen.isEligibleScoredPool(mk({ apyBase: 4, apyReward: 0, apyMean30d: 0.2 })));
  assert.ok(!gen.isEligibleScoredPool(mk({ apyBase: 4, apyReward: 0, apyMean30d: null })));
});
test('(d) 0.6% live and 0.6% 30d mean is included; floor is inclusive; base+reward counts', () => {
  assert.ok(gen.isEligibleScoredPool(mk({ apyBase: 0.6, apyReward: 0, apyMean30d: 0.6 })));
  assert.ok(gen.isEligibleScoredPool(mk({ apyBase: 0.5, apyReward: 0, apyMean30d: 0.5 })));
  assert.ok(gen.isEligibleScoredPool(mk({ apyBase: 0.3, apyReward: 0.3, apyMean30d: 0.6 })));
  assert.ok(!gen.isEligibleScoredPool(mk({ apyBase: 0.49, apyReward: 0, apyMean30d: 3 })));
});
test('zero-yield pools free their slot for the next eligible pool by TVL', () => {
  const dead = mk({ tvlUsd: 9e9, apyBase: 0, apyReward: 0, apyMean30d: 0 });
  const live = mk({ tvlUsd: 2e7, apyBase: 2, apyReward: 0, apyMean30d: 2 });
  const { selected, eligibleCount } = gen.selectPoolPages([dead, live], 1);
  assert.strictEqual(eligibleCount, 1);
  assert.strictEqual(selected[0].pool, live.pool);
});
test('redirects: every dropped slug gets a permanent chain-hub redirect (EN + KO); requalified slugs lose theirs', () => {
  const prev = [{ slug: 'a-usdc-base', pool: 'u1' }, { slug: 'b-wbtc-ethereum', pool: 'u2' }, { slug: 'keep-me', pool: 'u3' }, { slug: 'gone-chain', pool: 'u4' }];
  const chainOfPool = new Map([['u1', 'base'], ['u2', 'ethereum'], ['u3', 'base'], ['u4', 'nochain']]);
  const chainSlugs = new Set(['base', 'ethereum']);
  const r = gen.computePoolRedirects(new Map(), prev, new Set(['keep-me']), chainOfPool, chainSlugs);
  assert.deepStrictEqual(Array.from(r.entries()).sort(), [['a-usdc-base', 'base'], ['b-wbtc-ethereum', 'ethereum'], ['gone-chain', null]]);
  const base = fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8').replace(/    \{\n      "source": "\/(?:ko\/)?pools\/(?!index")[a-z0-9-]+",[^}]*\},\n/g, '');
  const txt = gen.syncPoolRedirectsText(base, prev, new Set(['keep-me']), chainOfPool, chainSlugs);
  const reds = JSON.parse(txt).redirects;
  const find = src => reds.find(x => x.source === src);
  prev.filter(e => e.slug !== 'keep-me').forEach(e => {
    const cs = chainOfPool.get(e.pool);
    const en = find('/pools/' + e.slug), ko = find('/ko/pools/' + e.slug);
    assert.ok(en && en.permanent === true && ko && ko.permanent === true, e.slug);
    assert.strictEqual(en.destination, chainSlugs.has(cs) ? '/chains/' + cs : '/pools');
    assert.strictEqual(ko.destination, chainSlugs.has(cs) ? '/ko/chains/' + cs : '/ko/pools');
  });
  assert.ok(!find('/pools/keep-me'));
  assert.ok(find('/pools/index'), 'hand-written /pools/index redirect untouched');
  // idempotent, and a later requalification removes the redirect again
  assert.strictEqual(gen.syncPoolRedirectsText(txt, [], new Set(['keep-me']), chainOfPool, chainSlugs), txt);
  const back = JSON.parse(gen.syncPoolRedirectsText(txt, [], new Set(['keep-me', 'a-usdc-base']), chainOfPool, chainSlugs)).redirects;
  assert.ok(!back.find(x => x.source === '/pools/a-usdc-base') && back.find(x => x.source === '/pools/b-wbtc-ethereum'));
});
test('committed vercel.json: every committed-manifest slug that has no page has no redirect and vice versa', () => {
  const reds = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')).redirects;
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/pool-pages.json'), 'utf8')).pages;
  manifest.forEach(e => assert.ok(!reds.some(x => x.source === '/pools/' + e.slug || x.source === '/ko/pools/' + e.slug), 'live page shadowed by redirect: ' + e.slug));
  reds.filter(x => /^\/(ko\/)?pools\/[a-z0-9-]+$/.test(x.source) && !/\/index$/.test(x.source)).forEach(x => {
    assert.ok(x.permanent === true);
    const dest = x.destination.replace(/^\/ko/, '');
    assert.ok(dest === '/pools' || fs.existsSync(path.join(__dirname, (x.destination.startsWith('/ko/') ? 'ko' : '') + x.destination.replace(/^\/ko/, '') + '.html')) || fs.existsSync(path.join(__dirname, x.destination.slice(1) + '.html')), 'dead redirect target ' + x.destination);
  });
});
test('against the committed snapshot the gate keeps pools and every one passes the rails', () => {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/pools-snapshot.json'), 'utf8'));
  const { eligibleCount, selected } = gen.selectPoolPages(snap.pools, 0);
  assert.ok(eligibleCount > 100 && selected.length === eligibleCount);
  selected.forEach(p => assert.ok(p.tvlUsd >= 1e7 && p.kpis.historyPoints >= 30 && !tokenGen.isAnomalousApy(p)));
});

// ---- selection / limit ----
console.log('selection + limit');
const many = Array.from({ length: 12 }, (_, i) => mk({ tvlUsd: 20000000 + i * 1000000, symbol: 'T' + i }));
test('default limit is the named constant 100', () => {
  assert.strictEqual(gen.W1_PAGE_LIMIT, 100);
  assert.strictEqual(gen.parseArgs([]).limit, 100);
  assert.strictEqual(gen.selectPoolPages(many).selected.length, 12);
});
test('--limit caps the set and keeps highest TVL first', () => {
  assert.strictEqual(gen.parseArgs(['--limit', '5']).limit, 5);
  const { selected, eligibleCount } = gen.selectPoolPages(many, 5);
  assert.strictEqual(selected.length, 5);
  assert.strictEqual(eligibleCount, 12);
  for (let i = 1; i < 5; i++) assert.ok(selected[i - 1].tvlUsd >= selected[i].tvlUsd);
  assert.strictEqual(selected[0].tvlUsd, 31000000);
});
test('--limit 0 means no cap', () => assert.strictEqual(gen.selectPoolPages(many, 0).selected.length, 12));

// ---- slugs ----
console.log('slugs');
test('slug is <project>-<symbol>-<chain>, lowercased and collapsed', () => {
  assert.strictEqual(links.poolSlugBase(mk()), 'aave-v3-usdc-base');
  assert.strictEqual(links.poolSlugBase(mk({ project: 'Ether.fi Stake', symbol: 'WEETH', chain: 'Ethereum' })), 'ether-fi-stake-weeth-ethereum');
});
test('assignment is deterministic and input-order independent', () => {
  const a = mk({ tvlUsd: 9e7 }), b = mk({ tvlUsd: 5e7 }), c = mk({ tvlUsd: 3e7, symbol: 'DAI' });
  const m1 = links.assignPoolSlugs([a, b, c]), m2 = links.assignPoolSlugs([c, b, a]);
  assert.deepStrictEqual(Array.from(m1.entries()).sort(), Array.from(m2.entries()).sort());
});
test('collision: highest TVL keeps the clean slug, the duplicate gets a uuid prefix', () => {
  const hi = mk({ tvlUsd: 9e7 }), lo = mk({ tvlUsd: 2e7 });
  const m = links.assignPoolSlugs([lo, hi]);
  assert.strictEqual(m.get(hi.pool), 'aave-v3-usdc-base');
  assert.strictEqual(m.get(lo.pool), `aave-v3-usdc-base-${lo.pool.replace(/-/g, '').slice(0, 6)}`);
});
test('collision with poolMeta uses the readable poolMeta suffix', () => {
  const hi = mk({ tvlUsd: 9e7 }), lo = mk({ tvlUsd: 2e7, poolMeta: 'Isolated Market' });
  assert.strictEqual(links.assignPoolSlugs([hi, lo]).get(lo.pool), 'aave-v3-usdc-base-isolated-market');
});
test('slugs are unique, valid and never look like a uuid (real snapshot)', () => {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/pools-snapshot.json'), 'utf8'));
  const m = links.assignPoolSlugs(snap.pools);
  const vals = Array.from(m.values());
  assert.strictEqual(new Set(vals).size, vals.length, 'duplicate slug');
  vals.forEach(s => { assert.ok(links.isValidSlug(s), s); assert.ok(!links.UUID_RE.test(s), s); });
});
test('a slug never depends on the page limit (assigned over the full list)', () => {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/pools-snapshot.json'), 'utf8'));
  const all = links.assignPoolSlugs(snap.pools);
  const top = gen.selectPoolPages(snap.pools, 100).selected;
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/pool-pages.json'), 'utf8'));
  assert.strictEqual(manifest.count, manifest.pages.length);
  top.forEach(p => assert.ok(all.get(p.pool)));
});

// ---- page rendering ----
console.log('page content');
const hi = mk({ tvlUsd: 80000000, symbol: 'USDC' });
const sib = mk({ tvlUsd: 60000000, symbol: 'USDC', chain: 'Arbitrum' });
const selected = [hi, sib];
const slugOf = links.assignPoolSlugs(selected);
const series = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(5 + i).padStart(2, '0')}`, apy: 3 + i * 0.02 }));
const ctx = { slug: slugOf.get(hi.pool), slugOf, selected, snapshotIso: SNAP, series, protocolUrls: { 'aave-v3': 'https://aave.com' }, chainSlugs: new Set(['base']), hasAccuracyPage: false };
const html = gen.renderPoolScorePage(hi, ctx, 'en');
const ko = gen.renderPoolScorePage(hi, ctx, 'ko');

test('no raw translation key leaks into the visible text (EN + KO)', () => {
  [html, ko].forEach(h => {
    const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    assert.ok(!/\b(psp|uwPillar|tcp)[A-Z]\w*/.test(text), 'raw key: ' + (text.match(/\b(psp|uwPillar|tcp)[A-Z]\w*/) || [])[0]);
  });
  assert.ok(html.includes('Yield stability') && ko.includes('수익률 안정성'));
});
test('canonical tag points at /pools/<slug>', () => {
  assert.ok(html.includes(`<link rel="canonical" href="${SITE_URL}/pools/${ctx.slug}">`));
  assert.ok(ko.includes(`<link rel="canonical" href="${SITE_URL}/ko/pools/${ctx.slug}">`));
  assert.ok(html.includes('hreflang="ko"'));
});
test('title <= 60 chars, honest and dated; H1 matches the brief', () => {
  const title = html.match(/<title>(.*)<\/title>/)[1];
  assert.ok(title.length <= 60, title);
  assert.ok(/Aave V3 USDC APY on Base \(Oct 2026\)/.test(title), title);
  assert.ok(html.includes('<h1>Aave V3 USDC on Base: APY, DeFi Score &amp; 14-day forecast</h1>'));
  const long = mk({ project: 'some-very-long-protocol-name-v3', symbol: 'LONGSYMBOL-TOKEN-X', chain: 'Ethereum' });
  assert.ok(gen.pageTitle(long, require('./translations.js').createTranslationFunction('en'), 'Oct 2026').length <= 60);
});
test('no letter rating appears anywhere (EN + KO)', () => {
  [html, ko].forEach(h => {
    assert.ok(!/\bAAA\b|\bBBB\b|HIGH RISK|\brating\b/i.test(h), 'rating vocabulary leaked');
  });
});
test('exactly one primary CTA, nofollow, to the Decision Terminal; at most one quiet secondary', () => {
  assert.strictEqual((html.match(/class="btn btn--primary[^"]*psp-cta"/g) || []).length, 1);
  assert.ok(html.includes(`<a class="btn btn--primary btn--lg btn--full-width psp-cta" rel="nofollow" href="${SITE_URL}/?pool=${hi.pool}#src=seo_pool">`));
  assert.ok((html.match(/class="[^"]*psp-secondary"/g) || []).length <= 1);
  assert.ok(html.includes('https://aave.com/?ref=defi.garden'));
  const noProto = gen.renderPoolScorePage(hi, Object.assign({}, ctx, { protocolUrls: {} }), 'en');
  assert.ok(noProto.includes(`href="${SITE_URL}/chains/base"`) && (noProto.match(/class="[^"]*psp-secondary"/g) || []).length === 1);
  const none = gen.renderPoolScorePage(hi, Object.assign({}, ctx, { protocolUrls: {}, chainSlugs: new Set() }), 'en');
  assert.strictEqual((none.match(/class="[^"]*psp-secondary"/g) || []).length, 0);
});
test('every number equals the snapshot value formatted en-US', () => {
  const total = hi.apyBase + hi.apyReward;
  [formatApy(total), formatApy(hi.apyMean30d), formatApy(hi.apyBase), formatApy(hi.apyReward), formatUsd(hi.tvlUsd),
   formatApy(hi.forecast.p10), formatApy(hi.forecast.p50), formatApy(hi.forecast.p90),
   'Score 91.6 / 100', '98 / 100', '89 / 100', '84 / 100', '94 / 100', 'October 4, 2026', formatUsd(hi.forecast.predictedTvlUsd)
  ].forEach(s => assert.ok(html.includes(s), `missing ${s}`));
  assert.ok(ko.includes('98 / 100') && ko.includes(formatUsd(hi.tvlUsd)));
  assert.ok(html.includes('aria-valuemax="100"'));
});
test('pillars render by name only when pillarsPct is absent; no weights/maxima leak into the page', () => {
  const bare = gen.renderPoolScorePage(mk({ defiScore: { score: 70.1, rating: 'AA', breakdown: { stability: 34.2, sustainability: 22.2, stickiness: 21.1, liquidity: 14.1 } } }), ctx, 'en');
  ['Yield stability', 'Sustainability', 'Capital stickiness', 'Exit liquidity'].forEach(n => assert.ok(bare.includes(n), n));
  assert.ok(!/ \/ (35|25|15)\b/.test(bare) && !bare.includes('34.2') && !/aria-valuemax="(35|25|15)"/.test(bare));
  assert.ok(!/\/ (35|25|15)\b/.test(html) && !/TimesFM|timesfm|Alchemy/i.test(html));
  assert.ok(!gen.SCORE_PILLARS.some(p => 'max' in p), 'no pillar maxima in public code');
});
test('inline SVG chart: present, accessible, no script, token-coloured', () => {
  const svg = html.match(/<svg class="psp-chart"[\s\S]*?<\/svg>/);
  assert.ok(svg, 'svg missing');
  assert.ok(/role="img"/.test(svg[0]) && /aria-labelledby="psp-chart-title"/.test(svg[0]) && /<title id="psp-chart-title">[^<]+<\/title>/.test(svg[0]));
  assert.ok(/<polyline class="psp-line"/.test(svg[0]) && /<polygon class="psp-band"/.test(svg[0]));
  assert.ok(!/<script/.test(svg[0]) && !/#[0-9a-fA-F]{3,6}\b/.test(svg[0]), 'hard-coded colour or script in svg');
  assert.ok(html.includes('stroke: var(--cert-green)') && html.includes('fill: var(--cert-green-wash-strong)'));
});
test('chart survives a flat series, an empty series and no trajectory', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  const flat = mk({ apyBase: 2, apyReward: 0, forecast: { horizonDays: 14, p10: 2, p50: 2, p90: 2, crashRisk: 'LOW' } });
  assert.ok(!/NaN|Infinity/.test(gen.renderApyChartSvg(flat, [{ date: 'a', apy: 2 }, { date: 'b', apy: 2 }], t, 'x')));
  assert.ok(!/NaN|Infinity/.test(gen.renderApyChartSvg(flat, [], t, 'x')));
});
test('access block: permissionless vs permissioned uses the shared list', () => {
  assert.ok(html.includes('Permissionless — anyone with a wallet'));
  const proj = Array.from(PERMISSIONED_PROJECT_LIST)[0];
  const restricted = gen.renderPoolScorePage(mk({ project: proj }), Object.assign({}, ctx, { slug: 'x', slugOf: new Map([[hi.pool, 'x']]) }), 'en');
  assert.ok(restricted.includes('Permissioned / KYC only') && !restricted.includes('Permissionless — anyone'));
});
test('api/mcp.js and the generators share one permissioned list', () => {
  assert.ok(/require\('\.\.\/permissioned-projects\.js'\)/.test(fs.readFileSync(path.join(__dirname, 'api/mcp.js'), 'utf8')));
  assert.ok(!/blackrock-buidl/.test(fs.readFileSync(path.join(__dirname, 'api/mcp.js'), 'utf8')));
  assert.strictEqual(tokenGen.PERMISSIONED_PROJECTS, PERMISSIONED_PROJECT_LIST);
});
test('risk flags are data-derived (IL, reward share, TVL trend, volatility, crash)', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  const quiet = gen.riskItems(mk(), t);
  assert.strictEqual(quiet.length, 1, 'only the standing smart-contract risk when nothing is flagged');
  const loud = gen.riskItems(mk({ ilRisk: 'yes', apyBase: 1, apyReward: 4, kpis: { historyPoints: 30, apyStdev: 3, tvlTrend: -0.4 }, forecast: Object.assign({}, hi.forecast, { crashRisk: 'HIGH' }) }), t);
  assert.strictEqual(loud.length, 6);
});
test('forecast-accuracy link only when the page exists', () => {
  assert.ok(!html.includes('/forecast-accuracy'));
  assert.ok(gen.renderPoolScorePage(hi, Object.assign({}, ctx, { hasAccuracyPage: true }), 'en').includes(`${SITE_URL}/forecast-accuracy`));
});
test('JSON-LD: BreadcrumbList + Dataset, similar pools link to generated pages only', () => {
  const blocks = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []).map(b => JSON.parse(b.replace(/<[^>]+>/g, '')));
  const types = blocks.map(b => b['@type']).sort();
  assert.deepStrictEqual(types, ['BreadcrumbList', 'Dataset']);
  assert.strictEqual(blocks.find(b => b['@type'] === 'Dataset').url, `${SITE_URL}/pools/${ctx.slug}`);
  assert.ok(html.includes(`href="${SITE_URL}/pools/${slugOf.get(sib.pool)}"`));
  assert.ok(html.includes(`>Home</a>`) && html.includes('>Chains</a>'));
});
test('hostile strings are escaped', () => {
  const evil = mk({ symbol: '<img src=x onerror=1>', poolMeta: '"><script>1</script>' });
  const s = new Map([[evil.pool, 'evil']]);
  const out = gen.renderPoolScorePage(evil, { slug: 'evil', slugOf: s, selected: [evil], snapshotIso: SNAP, series: [], protocolUrls: {}, chainSlugs: new Set() }, 'en');
  assert.ok(!out.includes('<img src=x') && !out.includes('<script>1</script>'));
});

// ---- hub, sitemap, manifest, IO ----
console.log('hub, sitemap, manifest, stale deletion');
test('hub groups pools by chain and links every page', () => {
  const h = gen.renderPoolsHubPage(selected, ctx, 'en');
  assert.ok(h.includes('<h2 class="dt-panel-label">Base</h2>') && h.includes('<h2 class="dt-panel-label">Arbitrum</h2>'));
  selected.forEach(p => assert.ok(h.includes(`href="${SITE_URL}/pools/${slugOf.get(p.pool)}"`)));
  assert.ok(h.includes(`<link rel="canonical" href="${SITE_URL}/pools">`));
});
test('sitemap lists hub + pages with the snapshot date as lastmod (EN and KO)', () => {
  const x = gen.renderPoolsSitemap(selected, slugOf, '2026-10-04', 'en');
  assert.ok(x.includes(`<loc>${SITE_URL}/pools</loc>`) && x.includes(`<loc>${SITE_URL}/pools/${ctx.slug}</loc>`));
  assert.strictEqual((x.match(/<lastmod>2026-10-04<\/lastmod>/g) || []).length, 3);
  assert.ok(gen.renderPoolsSitemap(selected, slugOf, '2026-10-04', 'ko').includes(`${SITE_URL}/ko/pools/${ctx.slug}`));
});
test('generate-sitemap.js registers and protects the pool sitemaps', () => {
  const s = fs.readFileSync(path.join(__dirname, 'generate-sitemap.js'), 'utf8');
  // The list and the index entries are derived per language from languages.js
  // (en, ko, pt, es) rather than spelled out per file.
  const foreign = require('./generate-sitemap.js').FOREIGN_PAGE_SITEMAPS;
  ['sitemap-pool-pages.xml', 'sitemap-pool-pages-ko.xml', 'sitemap-pool-pages-pt.xml', 'sitemap-pool-pages-es.xml'].forEach(f => {
    assert.ok(foreign.includes(f), 'not in FOREIGN_PAGE_SITEMAPS: ' + f);
  });
  assert.ok(s.includes('sitemap-${kind}-pages${suffix}.xml') && s.includes("['token', 'chain', 'pool']"), 'pool sitemaps not joined to the index');
  const idx = fs.readFileSync(path.join(__dirname, 'sitemap.xml'), 'utf8');
  if (fs.existsSync(path.join(__dirname, 'sitemap-pool-pages.xml'))) assert.ok(idx.includes('sitemap-pool-pages.xml'), 'regenerate sitemap.xml');
});
test('manifest shape', () => {
  const m = gen.buildManifest(selected, slugOf, SNAP);
  assert.deepStrictEqual(Object.keys(m), ['generatedAt', 'count', 'pages']);
  assert.deepStrictEqual(m.pages[0], { slug: ctx.slug, pool: hi.pool });
});
test('stale page deletion removes only owned pages, never .md/.json twins or foreign html', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'w1-stale-'));
  try {
    const base = { slugOf, selected, snapshotIso: SNAP, protocolUrls: {}, chainSlugs: new Set() };
    gen.writeSet(d, 'en', [hi, sib], base, []);
    fs.writeFileSync(path.join(d, 'stale-pool.html'), gen.renderPoolScorePage(hi, Object.assign({}, base, { slug: 'stale-pool' }), 'en'));
    const uuidTwin = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';
    fs.writeFileSync(path.join(d, `${uuidTwin}.md`), '# twin');
    fs.writeFileSync(path.join(d, `${uuidTwin}.json`), '{}');
    fs.writeFileSync(path.join(d, 'hand-made.html'), '<html>not ours</html>');
    gen.writeSet(d, 'en', [hi], base, []); // sib drops out of the set
    const files = fs.readdirSync(d).sort();
    assert.ok(!files.includes('stale-pool.html'), 'stale owned page survived');
    assert.ok(!files.includes(`${slugOf.get(sib.pool)}.html`), 'dropped pool page survived');
    assert.ok(files.includes(`${uuidTwin}.md`) && files.includes(`${uuidTwin}.json`), 'twin deleted');
    assert.ok(files.includes('hand-made.html'), 'foreign html deleted');
    assert.ok(files.includes(`${ctx.slug}.html`) && files.includes('index.html'));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
test('committed output matches the manifest, the gate and the limit', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/pool-pages.json'), 'utf8'));
  assert.ok(m.count > 0 && m.count <= 300);
  m.pages.forEach(e => {
    assert.ok(fs.existsSync(path.join(__dirname, 'pools', `${e.slug}.html`)), e.slug);
    assert.ok(fs.existsSync(path.join(__dirname, 'ko/pools', `${e.slug}.html`)), 'ko ' + e.slug);
  });
});

// ---- repointed chain/token links ----
console.log('repointed chain/token links');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures/pools-sample.json'), 'utf8'));
const chainRec = chainGen.rankTopChains(fixture)[0];
const tokenRec = tokenGen.rankTopTokens(fixture)[0];
const linkedId = chainRec.pools[0].pool;
test('a pool with a static page links to /pools/<slug>: no tracking param, followable', () => {
  links.setPoolPageManifest(new Map([[linkedId, 'fixture-pool-slug']]));
  try {
    const ch = chainGen.renderChainPage(chainRec);
    assert.ok(ch.includes(`<a class="cp-pool-link" href="${SITE_URL}/pools/fixture-pool-slug">`), 'chain row not repointed');
    assert.ok(!ch.includes(`?pool=${linkedId}`), 'old uuid link survived');
    assert.ok(ch.includes('"url":"https://www.defi.garden/pools/fixture-pool-slug"'), 'ItemList JSON-LD not repointed');
    const ko = chainGen.renderChainPage(chainRec, [], undefined, [], 'ko');
    assert.ok(ko.includes(`href="${SITE_URL}/ko/pools/fixture-pool-slug"`), 'KO row should link the KO pool page');
    const other = chainRec.pools[1].pool;
    assert.ok(ch.includes(`rel="nofollow" href="${SITE_URL}/?pool=${other}#src=seo_chain"`), 'pool without a page must keep the old behaviour');
    const md = chainGen.renderChainPageMarkdown(chainRec);
    assert.ok(md.includes(`${SITE_URL}/pools/fixture-pool-slug`));
    assert.strictEqual(tokenGen.poolHrefFor({ pool: linkedId }, 'fb', 'seo_token'), `${SITE_URL}/pools/fixture-pool-slug`);
    assert.strictEqual(tokenGen.poolHrefFor({ pool: 'zzz' }, 'fb', 'seo_token'), `${SITE_URL}/?pool=zzz#src=seo_token`);
    assert.strictEqual(tokenGen.poolRelAttr({ pool: linkedId }), '');
    assert.strictEqual(tokenGen.poolRelAttr({ pool: 'zzz' }), ' rel="nofollow"');
  } finally { links.setPoolPageManifest(null); }
});
test('token pages repoint too, and keep nofollow on app-bound rows', () => {
  const id = tokenRec.pools[0].pool;
  links.setPoolPageManifest(new Map([[id, 'tok-slug']]));
  try {
    const tk = tokenGen.renderTokenPage(tokenRec);
    assert.ok(tk.includes(`<a class="tp-pool-link" href="${SITE_URL}/pools/tok-slug">`));
    assert.ok(!tk.includes(`?pool=${id}`));
  } finally { links.setPoolPageManifest(null); }
});
test('with no manifest entry the pre-W1 output is unchanged', () => {
  links.setPoolPageManifest(new Map());
  try {
    const ch = chainGen.renderChainPage(chainRec);
    assert.ok(!ch.includes('/pools/'.concat('fixture')));
    assert.ok(ch.includes(`rel="nofollow" href="${SITE_URL}/?pool=${linkedId}#src=seo_chain"`));
  } finally { links.setPoolPageManifest(null); }
});

test('forecast disclaimer carries no track-record numbers (they live only on /forecast-accuracy)', () => {
  assert.ok(html.includes('Experimental model: not yet shown to be more accurate'));
  assert.ok(!/resolved test runs|\d+ of \d+/.test(html));
  assert.ok(!require('fs').readFileSync(require('path').join(__dirname, 'generate-pool-score-pages.js'), 'utf8').includes('forecast-evaluations.json'));
});

console.log(`\n${passed} passed, ${failed} failed`);
