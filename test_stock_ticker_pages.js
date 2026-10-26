/* Offline gate for the static /stocks/<ticker> pages (generate-stock-ticker-pages.js):
   eligibility (>= 2 VERIFIED versions), no unverified tokens, no pillar numbers,
   valid JSON-LD, title <= 60, H1 long form, routing next to stocks.html, sitemap
   and llms wiring. Fixtures are built in-test; the real data/stocks-versions.json
   is also checked when present (generated + gitignored).
   Run: node test_stock_ticker_pages.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const gen = require('./generate-stock-ticker-pages.js');

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + (err && err.message || err));
    process.exitCode = 1;
  }
}

const UNV_SYMBOL = 'ZZUNVERIFIEDTOK';
const UNV_ADDR = '0xdeadbeef00000000000000000000000000c0ffee';
const POOL = '6f7708a9-58d0-4941-a06a-b83e91b06903';

function version(over) {
  return Object.assign({
    key: 'base:0xaaa', issuerSlug: 'xstocks', issuer: 'xStocks', chain: 'Solana', address: '0xaaa', symbol: 'AAAX',
    assetClass: 'equity', priceUsd: 100.5, priceTs: '2026-10-26T10:52:51.000Z', multiplier: 1, supplyUsd: 1234567,
    liquidity: { tvlUsd: 2500000, lpTvlUsd: 1000000, pools: 3, depth2pctUsd: 45000, depthSource: 'rpc' },
    bestYield: {
      lp: { pool: POOL, project: 'raydium-amm', tier: 1, tvlUsd: 1000, headlineApy: 9.1, honestProjection: 7.82, flags: [],
        defiScore: { score: 59.9, rating: 'A', pillarsPct: { stability: 77.7123 }, breakdown: { x: 12.3456 }, pillarsTier: { stability: 'Low', sustainability: 'High', stickiness: 'Medium', liquidity: 'Low' } } },
      lending: null
    },
    risk: { legalEntity: 'Backed Assets (JE) Limited', jurisdiction: 'Jersey', structure: 'SPV token, 1:1 collateralised', usPersons: false, mintRedeemHours: '24/5', redemptionMinUsd: null },
    cex: [{ exchange: 'kraken', pair: 'AAAx/USD', priceUsd: 100.1, volume24hUsd: 5 }],
    premiumVsClosePct: null, spreadVsMedianPct: 0.2
  }, over || {});
}
const data = {
  schemaVersion: 1, generatedAt: '2026-10-26T11:24:19.118Z', priceSource: 'DefiLlama coins (aggregated on-chain prices)',
  cexSources: [{ id: 'kraken', name: 'Kraken' }, { id: 'bybit', name: 'Bybit' }],
  issuers: {
    xstocks: { name: 'xStocks', sources: ['https://docs.xstocks.fi'], structureSource: 'https://docs.xstocks.fi', usPersonsSource: null, mintRedeemHoursSource: 'https://docs.xstocks.fi' },
    coinbase: { name: 'Coinbase', sources: ['https://api.coinbase.com/v1/tokenized-stocks'], structureSource: null }
  },
  tickers: {
    AAA: {
      name: 'A&B <i>Corp', referenceClose: { price: 100, ts: '2026-10-23T20:00:00.000Z', date: '2026-10-23', source: 'pyth' }, medianNormalizedPrice: 100.3,
      versions: [
        version({ premiumVsClosePct: 0.5 }),
        version({ key: 'k2', issuerSlug: 'coinbase', issuer: 'Coinbase', chain: 'Base', symbol: 'AAAC', multiplier: 1.0005, spreadVsMedianPct: -0.1,
          risk: { legalEntity: 'CB SPV', jurisdiction: 'ADGM', structure: null, usPersons: null, mintRedeemHours: null, redemptionMinUsd: 5 } }),
        version({ key: 'k3', issuerSlug: 'xstocks', issuer: 'xStocks', chain: 'Hyperliquid L1', symbol: 'WAAAX', multiplier: null, multiplierUnknown: true, spreadVsMedianPct: null, wrapper: true, supplyUsd: null })
      ],
      unverified: [version({ key: 'u1', issuerSlug: 'unverified', issuer: 'unverified', symbol: UNV_SYMBOL, address: UNV_ADDR })]
    },
    BBB: { name: 'B Corp', referenceClose: null, medianNormalizedPrice: 10, versions: [version({ symbol: 'BBBX' })], unverified: [version({ key: 'u2', issuerSlug: 'unverified', issuer: 'unverified', symbol: UNV_SYMBOL, address: UNV_ADDR })] },
    LONG: {
      name: 'Long Co', referenceClose: null, medianNormalizedPrice: 5,
      versions: ['Alphabetical Issuer', 'Bravo Securities Group', 'Charlie Tokenization', 'Delta Onchain Assets', 'Echo Markets', 'Foxtrot Capital'].map((n, i) =>
        version({ key: 'l' + i, issuerSlug: 's' + i, issuer: n, symbol: 'LONG' + i }))
    },
    'BRK.B': { name: 'Berkshire', referenceClose: null, versions: [version({ key: 'b1', symbol: 'BRK1' }), version({ key: 'b2', issuerSlug: 'coinbase', issuer: 'Coinbase', symbol: 'BRK2' })] }
  }
};

console.log('test_stock_ticker_pages');

const pages = gen.buildAll(data);
const bySlug = {};
pages.forEach((p) => { bySlug[p.slug] = p; });

check('eligibility: >= 2 verified versions only (AAA, LONG, BRK.B), BBB (1 verified + unverified) gets no page', () => {
  assert.deepStrictEqual(pages.map((p) => p.ticker).sort(), ['AAA', 'BRK.B', 'LONG']);
  assert.ok(!bySlug.bbb);
  assert.strictEqual(bySlug['brk-b'].slug, 'brk-b', 'dots become dashes in the slug');
  assert.ok(pages.every((p) => /^[a-z0-9-]+$/.test(p.slug) && p.slug !== 'index'));
});

check('unverified tokens never appear anywhere (symbol, address)', () => {
  pages.forEach((p) => {
    assert.ok(!p.html.includes(UNV_SYMBOL), p.ticker);
    assert.ok(!p.html.toLowerCase().includes(UNV_ADDR));
    assert.ok(!/unverified/i.test(p.html), 'no unverified wording either');
  });
});

check('no pillar numbers: only High / Medium / Low tiers, never pillarsPct / breakdown', () => {
  const html = bySlug.aaa.html;
  assert.ok(!/pillarsPct|pillars_pct|breakdown/.test(html));
  assert.ok(!html.includes('77.7123') && !html.includes('12.3456'));
  assert.ok(!/\b\d{1,3}(?:\.\d+)?\s*\/\s*(?:35|25|15|100)\b/.test(html), 'no x / max pillar pattern');
  assert.ok(/Yield stability Low/.test(html) && /Sustainability High/.test(html) && /Capital stickiness Medium/.test(html));
  assert.ok(!html.includes('59.9'), 'no numeric score is printed');
  assert.ok(/DeFi Score A\b/.test(html));
  const src = fs.readFileSync(path.join(__dirname, 'generate-stock-ticker-pages.js'), 'utf8');
  assert.ok(!/pillarsPct|\.breakdown/.test(src), 'generator never reads the hidden fields');
});

check('title <= 60 chars for every fixture ticker, ends with the brand', () => {
  pages.forEach((p) => {
    assert.ok(p.title.length <= 60, p.title.length + ' ' + p.title);
    assert.ok(p.title.endsWith(' | DeFi Garden') && p.title.startsWith(p.ticker + ' tokenized stock'));
    assert.ok(p.html.includes('<title>' + p.title + '</title>'));
  });
  assert.ok(gen.buildTitle('ZZZZZZZZZZ', [{ issuer: 'Averyveryveryverylongissuername' }, { issuer: 'Anotherveryveryverylongissuer' }]).length <= 60);
});

check('H1 is the long form with verified issuers in table order', () => {
  assert.strictEqual(bySlug.aaa.h1, 'AAA tokenized stock: xStocks vs Coinbase — price, spread, liquidity, yield');
  assert.ok(bySlug.aaa.html.includes('<h1>' + bySlug.aaa.h1 + '</h1>'));
  assert.ok(bySlug.long.h1.startsWith('LONG tokenized stock: Alphabetical Issuer vs Bravo Securities Group vs '));
});

check('canonical, OG, Twitter, robots, EN only (no hreflang)', () => {
  const h = bySlug.aaa.html;
  assert.ok(h.includes('<link rel="canonical" href="https://www.defi.garden/stocks/aaa">'));
  assert.ok(h.includes('property="og:image" content="https://www.defi.garden/og-image.png"'));
  assert.ok(h.includes('property="og:title"') && h.includes('property="og:url" content="https://www.defi.garden/stocks/aaa"'));
  assert.ok(h.includes('name="twitter:card"') && h.includes('name="twitter:title"') && h.includes('name="twitter:image"'));
  assert.ok(h.includes('<meta name="robots" content="index,follow">'));
  assert.ok(!/hreflang/.test(h));
  assert.ok(h.includes('<html lang="en">'));
});

check('meta description built from the data (counts, spread range, date)', () => {
  const d = bySlug.aaa.description;
  assert.ok(/3 verified tokenized versions from 2 issuers on 3 chains/.test(d), d);
  assert.ok(/2026-10-26/.test(d));
  assert.ok(/Education, not advice/.test(d));
  assert.ok(d.length <= 300);
});

check('JSON-LD: BreadcrumbList + Dataset parse, ISO dates, names-only variables, no "<"', () => {
  pages.forEach((p) => {
    const blocks = [...p.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.strictEqual(blocks.length, 2);
    blocks.forEach((b) => assert.ok(!b.includes('<'), 'escaped <'));
    const docs = blocks.map((b) => JSON.parse(b));
    const types = docs.map((d) => d['@type']).sort();
    assert.deepStrictEqual(types, ['BreadcrumbList', 'Dataset']);
    const bc = docs.find((d) => d['@type'] === 'BreadcrumbList');
    assert.deepStrictEqual(bc.itemListElement.map((i) => i.name), ['DeFi Garden', 'Stocks', p.ticker]);
    const ds = docs.find((d) => d['@type'] === 'Dataset');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(ds.dateModified) && /^\d{4}-\d{2}-\d{2}$/.test(ds.datePublished));
    assert.strictEqual(ds.dateModified, '2026-10-26');
    assert.strictEqual(ds.isAccessibleForFree, true);
    assert.strictEqual(ds.url, 'https://www.defi.garden/stocks/' + p.slug);
    assert.ok(ds.creator.name === 'DeFi Garden' && ds.publisher.name === 'DeFi Garden');
    assert.ok(!('license' in ds));
    assert.ok(ds.variableMeasured.length > 3 && ds.variableMeasured.every((v) => v.name && !('value' in v)));
    assert.ok(Array.isArray(ds.keywords) && ds.keywords.length);
  });
});

check('HTML-escapes all text (underlying name with & and <)', () => {
  const h = bySlug.aaa.html;
  assert.ok(h.includes('A&amp;B &lt;i&gt;Corp'));
  assert.ok(!h.includes('<i>Corp'));
});

check('table is server-rendered with the required columns and exact spread label', () => {
  const h = bySlug.aaa.html;
  ['Issuer', 'Chain', 'Price', 'Spread vs median of token versions', 'Premium vs the real share', 'Supply (USD)', 'Liquidity', 'Best yield', 'CEX', 'Structure / redemption']
    .forEach((c) => assert.ok(h.includes('<th scope="col"' + (c === 'Issuer' ? ' class="st-first"' : '') + '>' + c + '</th>'), c));
  assert.ok(/NOT a premium|<strong>not<\/strong> a premium vs the real share/.test(h));
  assert.ok(h.includes('Backed Assets (JE) Limited, Jersey') && h.includes('US persons: not eligible') && h.includes('US persons: not confirmed'));
  assert.ok(h.includes('$100.50') && h.includes('$1,234,567') && h.includes('$2,500,000'));
  assert.ok(h.includes('±2% depth $45,000'));
  assert.ok(h.includes('7.82%') && h.includes('href="/?pool=' + POOL + '"'));
  assert.ok(h.includes('Kraken: <strong>$100.10</strong>'));
  assert.ok(h.includes('href="/stocks?ticker=AAA"') && h.includes('href="/stocks"'));
  assert.ok(h.includes('href="/stocks/brk-b"') && !h.includes('href="/stocks/aaa"'), 'sibling links exclude self');
  assert.ok(h.includes('overflow-x: auto') && h.includes('role="region"'));
});

check('premium: dash with accessible note when null, value + reference kind otherwise', () => {
  const rows = bySlug.aaa.html.split('<tr><th scope="row"').slice(1);
  assert.strictEqual(rows.length, 3);
  assert.ok(rows[0].includes('+0.50%') && rows[0].includes('vs last close 2026-10-23'));
  assert.ok(rows[1].includes('title="Reference price unavailable"') && rows[1].includes('Reference price unavailable</span>'));
});

check('unknown multiplier: shown, but no spread', () => {
  const rows = bySlug.aaa.html.split('<tr><th scope="row"').slice(1);
  assert.ok(rows[2].includes('WAAAX') && rows[2].includes('No spread (multiplier unknown)'));
  assert.ok(!/<td><strong>[+-]\d/.test(rows[2].split('</td>')[2] || ''), 'no signed spread in the spread cell');
  assert.ok(rows[0].includes('+0.20%') && rows[1].includes('-0.10%'));
});

check('"What differs" uses registry facts only and skips nulls', () => {
  const h = bySlug.aaa.html;
  const block = h.split('What differs between versions')[1].split('<h2>')[0];
  assert.ok(block.includes('Issued by Backed Assets (JE) Limited (Jersey).') && block.includes('Not offered to US persons.'));
  assert.ok(block.includes('Mint and redeem: 24/5.') && block.includes('Multiplier: 1.0005 shares per token.'));
  assert.ok(!/null|undefined|NaN/.test(h));
});

check('static chrome: nav, footer, disclaimer, tokens only, no emojis, no FAQ markup', () => {
  const h = bySlug.aaa.html;
  assert.ok(h.includes('<a href="/?app=1">Search</a>') && h.includes('<a href="/stocks" aria-current="true">Stocks</a>'));
  assert.ok(h.includes('<a href="/methodology">Methodology</a>') && h.includes('<a href="/mcp">API</a>'));
  assert.ok(h.includes('<a href="/tokens">Browse tokens</a>') && h.includes('<a href="/chains">Browse chains</a>'));
  assert.ok(/Education, not advice/.test(h));
  assert.ok(!/FAQPage|itemtype/i.test(h));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(h), 'no emoji');
  const css = h.split('<style>')[1].split('</style>')[0];
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css) && !/box-shadow:\s*[^v;]*\d/.test(css), 'tokens only, no hard-coded colours or shadows');
  assert.ok(!/<script src|fetch\(/.test(h), 'no JS dependency');
});

check('stale-page cleanup and no stocks/index.html (CLI)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-pages-'));
  try {
    const dataFile = path.join(tmp, 'v.json');
    fs.writeFileSync(dataFile, JSON.stringify(data));
    const out = path.join(tmp, 'stocks');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'old.html'), 'x');
    fs.writeFileSync(path.join(out, 'index.html'), 'x');
    execFileSync('node', [path.join(__dirname, 'generate-stock-ticker-pages.js'), '--out', out, '--data', dataFile], { stdio: 'ignore' });
    assert.deepStrictEqual(fs.readdirSync(out).sort(), ['aaa.html', 'brk-b.html', 'long.html']);
    // unreadable data leaves the directory untouched
    execFileSync('node', [path.join(__dirname, 'generate-stock-ticker-pages.js'), '--out', out, '--data', path.join(tmp, 'missing.json')], { stdio: 'ignore' });
    assert.strictEqual(fs.readdirSync(out).length, 3);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

check('routing: stocks.html and stocks/<t>.html map to distinct clean URLs, vercel.json does not catch /stocks/*', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
  assert.strictEqual(vercel.cleanUrls, true);
  assert.strictEqual(vercel.trailingSlash, false);
  assert.ok(fs.existsSync(path.join(__dirname, 'stocks.html')));
  assert.ok(!fs.existsSync(path.join(__dirname, 'stocks', 'index.html')), 'stocks/index.html must never exist');
  pages.forEach((p) => assert.notStrictEqual(p.slug, 'index'));
  const clean = (f) => '/' + f.replace(/\.html$/, '');
  assert.deepStrictEqual([clean('stocks.html'), clean('stocks/nvda.html')], ['/stocks', '/stocks/nvda']);
  const sources = []
    .concat(vercel.rewrites || [], vercel.redirects || [])
    .map((r) => ({ source: r.source, has: r.has }));
  sources.forEach((r) => assert.ok(!/^\/stocks/.test(r.source), 'no rewrite/redirect for ' + r.source));
  sources.filter((r) => /^\/(:\w+\*|\(\.\*\))/.test(r.source)).forEach((r) => assert.ok(r.has && r.has.length, 'catch-all ' + r.source + ' must be conditional (host)'));
  const ignore = fs.readFileSync(path.join(__dirname, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  assert.ok(!ignore.some((l) => /^\/?stocks(\.html|\/|\/\*.*)?$/.test(l) || /^\/?\*\*?\/?\*?\.html$/.test(l)), '.vercelignore must keep stocks/ and stocks.html served');
});

check('generated-output registration: site-outputs.txt and .gitignore carry stocks/', () => {
  const outputs = fs.readFileSync(path.join(__dirname, 'scripts', 'site-outputs.txt'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(outputs.includes('stocks'));
  const gi = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(gi.includes('/stocks/'));
  assert.ok(!gi.includes('stocks.html') && !gi.includes('/stocks*'));
});

check('CI step runs after the versions step and is non-fatal', () => {
  const wf = fs.readFileSync(path.join(__dirname, '.github', 'workflows', 'sitemap-update.yml'), 'utf8');
  const iv = wf.indexOf('node generate-stocks-versions.js');
  const ip = wf.indexOf('node generate-stock-ticker-pages.js');
  const is = wf.indexOf('node generate-sitemap.js');
  assert.ok(iv > 0 && ip > iv && is > ip, 'order: versions < ticker pages < sitemap');
  assert.ok(/continue-on-error: true\s+run: \|\s+node generate-stock-ticker-pages\.js/.test(wf));
});

check('llms: Tokenized Stocks section lists ticker page URLs (tickers + URLs only)', () => {
  const llms = require('./generate-llms.js');
  const meta = { baseUrl: 'https://www.defi.garden', stockPages: [{ ticker: 'AAA', slug: 'aaa' }, { ticker: 'BRK.B', slug: 'brk-b' }] };
  const concise = llms.buildStocksSection(meta).join('\n');
  const full = llms.buildStocksSection(meta, { full: true }).join('\n');
  assert.ok(concise.includes('AAA https://www.defi.garden/stocks/aaa') && concise.includes('https://www.defi.garden/stocks/brk-b'));
  assert.ok(full.includes('- AAA tokenized stock, verified token versions compared side by side: https://www.defi.garden/stocks/aaa'));
  assert.ok(!/\d+\.\d+%/.test(full));
  assert.ok(llms.buildStocksSection({ baseUrl: 'https://x', stockPages: [] }).join('\n').indexOf('/stocks/') === -1);
});

const realFile = path.join(__dirname, 'data', 'stocks-versions.json');
if (fs.existsSync(realFile)) {
  check('real data/stocks-versions.json: every eligible ticker builds a page with title <= 60 and no unverified token', () => {
    const real = JSON.parse(fs.readFileSync(realFile, 'utf8'));
    const built = gen.buildAll(real);
    assert.strictEqual(built.length, gen.eligibleTickers(real).length);
    assert.ok(built.length >= 1);
    built.forEach((p) => {
      assert.ok(p.title.length <= 60, p.title);
      assert.ok(p.h1.startsWith(p.ticker + ' tokenized stock: ') && p.h1.endsWith(' — price, spread, liquidity, yield'));
      (real.tickers[p.ticker].unverified || []).forEach((u) => {
        if (u.symbol) assert.ok(!new RegExp('>' + u.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<').test(p.html), u.symbol + ' leaked into ' + p.ticker);
        if (u.address) assert.ok(!p.html.toLowerCase().includes(String(u.address).toLowerCase()));
      });
      assert.ok(!/pillarsPct|breakdown|undefined|NaN|null/.test(p.html), p.ticker);
      JSON.parse(p.html.split('application/ld+json">')[1].split('</script>')[0]);
    });
  });
} else {
  console.log('  - real data/stocks-versions.json absent (gitignored), skipped');
}

const sitemapDone = (async () => {
  const name = 'sitemap-stock-pages.xml lists exactly the eligible tickers, English only';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-sitemap-'));
  const cwd = process.cwd();
  const realLog = console.log;
  try {
    fs.mkdirSync(path.join(tmp, 'data'));
    fs.writeFileSync(path.join(tmp, 'data', 'stocks-versions.json'), JSON.stringify(data));
    process.chdir(tmp);
    console.log = () => {};
    const { generateSitemapSuite } = require('./generate-sitemap.js');
    await generateSitemapSuite([{ pool: 'p1', chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', tvlUsd: 5e8, apyBase: 4, apyReward: 0 }]);
    console.log = realLog;
    const xml = fs.readFileSync(path.join(tmp, 'sitemap-stock-pages.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(locs, ['https://www.defi.garden/stocks/aaa', 'https://www.defi.garden/stocks/brk-b', 'https://www.defi.garden/stocks/long']);
    assert.ok(!/xhtml:link|hreflang/.test(xml.split('<urlset')[1]));
    assert.ok(xml.includes('<lastmod>2026-10-26T11:24:19.118Z</lastmod>'));
    assert.ok(/sitemap-stock-pages\.xml/.test(fs.readFileSync(path.join(tmp, 'sitemap.xml'), 'utf8')), 'listed in the sitemap index');
    passed++; console.log('  \u2713 ' + name);
  } catch (err) {
    console.log = realLog;
    console.error('  \u2717 ' + name + '\n    ' + (err && err.message || err));
    process.exitCode = 1;
  } finally { console.log = realLog; process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
})();

sitemapDone.then(() => console.log('\n' + passed + ' checks passed' + (process.exitCode ? ' (with failures)' : '')));
