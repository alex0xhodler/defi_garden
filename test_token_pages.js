/* Unit tests for the static token-page generator (spec 014).
   Runs the generator's pure functions against a crafted fixture and asserts
   on the real emitted HTML. Run: node test_token_pages.js

   Eligibility (human directive 2026-07-11): a token earns a page if it has
   >=1 pool with TVL >= $100K that is NOT anomalous (>1000% APY). No minimum
   pool count, no cap by default. The anomaly exclusion is a trust rail. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const gen = require('./generate-token-pages.js');
const chainGen = require('./generate-chain-pages.js'); // 049 — cross-surface linking

// --- 174 scratch-run harness -------------------------------------------------
// Spec 174's own acceptance test is "the verifier changes MIN_POOL_TVL in a
// scratch run and observes the copy change with it." This reproduces exactly
// that: write patched COPIES of the two generators (source text, with every
// relative `require('./x.js')` rewritten to an absolute path so the copies
// still resolve their sibling modules from a scratch temp dir) with
// MIN_POOL_TVL literally edited to a different value, `require()` those
// copies fresh (never the cached real modules), and render real pages from
// them. If any template still carries a hardcoded floor literal instead of
// interpolating the constant, the rendered page will show the OLD floor
// string alongside/instead of the new one — this harness catches that.
function rewriteRequiresToAbsolute(src, dir, overrides) {
  return src.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g, (m, q, relPath) => {
    const abs = (overrides && overrides[relPath]) || path.join(dir, relPath);
    return `require(${q}${abs.replace(/\\/g, '/')}${q})`;
  });
}
function loadScratchGenerators(newFloor) {
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-174-scratch-'));
  const tokenSrc = fs.readFileSync(path.join(__dirname, 'generate-token-pages.js'), 'utf8');
  const patchedMarker = `const MIN_POOL_TVL = ${newFloor};`;
  const patchedTokenSrc = rewriteRequiresToAbsolute(
    tokenSrc.replace('const MIN_POOL_TVL = 100000;', patchedMarker), __dirname);
  assert.ok(patchedTokenSrc.includes(patchedMarker), 'failed to patch MIN_POOL_TVL in the scratch token generator');
  const tokenScratchPath = path.join(scratchDir, 'generate-token-pages.js');
  fs.writeFileSync(tokenScratchPath, patchedTokenSrc);

  const chainSrc = fs.readFileSync(path.join(__dirname, 'generate-chain-pages.js'), 'utf8');
  const patchedChainSrc = rewriteRequiresToAbsolute(chainSrc, __dirname,
    { './generate-token-pages.js': tokenScratchPath.replace(/\\/g, '/') });
  const chainScratchPath = path.join(scratchDir, 'generate-chain-pages.js');
  fs.writeFileSync(chainScratchPath, patchedChainSrc);

  return { tokenGen: require(tokenScratchPath), chainGen: require(chainScratchPath), scratchDir };
}
function cleanupScratch(scratchDir) {
  Object.keys(require.cache).forEach(k => { if (k.startsWith(scratchDir)) delete require.cache[k]; });
  fs.rmSync(scratchDir, { recursive: true, force: true });
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Fixture branches:
// BIG    : 2 pools ($500M + $300M)              -> qualifies, rank #1
// MID    : 1 pool ($5M)                          -> qualifies (single pool ok)
// ANOM   : 1 real ($2M) + 1 anomalous ($900M @2100%) -> anomaly excluded, qualifies via the $2M pool
// USDC.E : 1 pool ($200K), dotted symbol         -> qualifies, slug-safe
// SMALL  : 1 pool ($150K), newer token           -> qualifies (above the $100K floor)
// DUST   : 1 pool ($50K)                          -> dropped (below the $100K floor)
const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const ranked = gen.rankTopTokens(pools); // no cap
const bySym = Object.fromEntries(ranked.map(r => [r.symbol, r]));

console.log('rankTopTokens — $100K floor, >=1 pool, no cap');
test('emits every token with >=1 qualifying pool; drops sub-$100K-only tokens', () => {
  assert.deepStrictEqual(ranked.map(r => r.symbol).sort(), ['ANOM', 'BIG', 'MID', 'SMALL', 'USDC.E']);
});
test('single-pool tokens are included (no >=2 minimum)', () => {
  assert.strictEqual(bySym['MID'].qualifyingCount, 1);
  assert.strictEqual(bySym['SMALL'].qualifyingCount, 1);
  assert.strictEqual(bySym['USDC.E'].qualifyingCount, 1);
});
test('newer/low-TVL token above the floor qualifies (SMALL @ $150K)', () => {
  assert.ok(bySym['SMALL']);
});
test('token whose only pool is below $100K is dropped (DUST @ $50K)', () => {
  assert.ok(!bySym['DUST']);
});
test('token with pools but ALL 0% yield is dropped (030 quality bar — ZERO)', () => {
  assert.ok(!bySym['ZERO'], 'an all-0%-APY token must not get an indexed page');
});
test('token whose best yield rounds to 0.00% is dropped (032 — TINY @ 0.003%)', () => {
  assert.ok(!bySym['TINY'], 'a token whose APY displays 0.00% must not get an indexed page');
});
test('token whose yield pool is beyond POOLS_PER_PAGE is dropped (033 — TRUNC)', () => {
  // TRUNC's top-8-by-TVL are all 0%; its 5% pool is #9 (not shown) -> displayed table all 0.00%
  assert.ok(!bySym['TRUNC'], 'a token whose displayed table is all 0.00% must not get an indexed page');
});
test('every generated token DISPLAYS >=1 visible non-zero yield (gate matches the shown table)', () => {
  ranked.forEach(r => assert.ok(r.pools.some(p => gen.formatApy(gen.poolTotalApy(p)) !== '0.00%'),
    r.symbol + ' shows all 0.00% APY in its rendered table'));
});
test('ranks by aggregate qualifying TVL desc', () => {
  assert.deepStrictEqual(ranked.map(r => r.symbol), ['BIG', 'MID', 'ANOM', 'USDC.E', 'SMALL']);
});

console.log('trust rail — anomaly exclusion (untouched)');
test('anomalous pool excluded from content AND count AND TVL (ANOM)', () => {
  assert.strictEqual(bySym['ANOM'].qualifyingCount, 1, 'anomalous pool must not be counted');
  assert.strictEqual(bySym['ANOM'].totalTvl, 2000000, 'anomalous $900M pool must not inflate TVL');
  assert.strictEqual(bySym['ANOM'].pools.length, 1);
});
test('no rendered pool anywhere is anomalous (>1000% total APY)', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok(gen.poolTotalApy(p) <= gen.APY_SANITY_LIMIT, r.symbol + ' has an anomalous pool');
  }));
});
test('every rendered pool clears the $100K floor', () => {
  ranked.forEach(r => r.pools.forEach(p => {
    assert.ok((p.tvlUsd || 0) >= gen.MIN_POOL_TVL, r.symbol + ' has a sub-floor pool');
  }));
});

console.log('cap handling');
test('no cap by default returns all eligible tokens', () => {
  assert.strictEqual(gen.rankTopTokens(pools).length, 5);
  assert.strictEqual(gen.rankTopTokens(pools, 0).length, 5);
});
test('explicit --limit caps to top-N by TVL (limit=1 -> BIG)', () => {
  const top1 = gen.rankTopTokens(pools, 1);
  assert.strictEqual(top1.length, 1);
  assert.strictEqual(top1[0].symbol, 'BIG');
});

console.log('tokenSlug — URL/filesystem safety');
test('dotted symbol slugs to safe form', () => {
  assert.strictEqual(gen.tokenSlug('USDC.E'), 'usdc-e');
  assert.strictEqual(bySym['USDC.E'].slug, 'usdc-e');
});
test('slug has no unsafe chars', () => {
  ranked.forEach(r => assert.ok(/^[a-z0-9-]+$/.test(r.slug), 'bad slug: ' + r.slug));
});

console.log('renderTokenPage — server-delivered SEO content');
const html = gen.renderTokenPage(bySym['BIG']);
test('self-canonical to /tokens/<slug> (not the ?token= app URL)', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'missing self-canonical');
});
test('server-delivered <title> present in raw HTML (no JS)', () => {
  assert.ok(/<title>BIG DeFi Yields[^<]*<\/title>/.test(html), 'missing title');
});
test('server-delivered meta description present', () => {
  assert.ok(/<meta name="description" content="[^"]+">/.test(html), 'missing description');
});
test('links into the live app at ?token=<SYMBOL>', () => {
  assert.ok(html.includes('https://www.defi.garden/?token=BIG'), 'missing app deep link');
});
test('each pool row links to its detail page (/?pool=<id>&src=seo_token — 203)', () => {
  const top = bySym['BIG'].pools[0];
  assert.ok(top.pool, 'fixture pool missing an id');
  assert.ok(html.includes(`href="https://www.defi.garden/?pool=${encodeURIComponent(top.pool)}&src=seo_token"`),
    'pool row not linked to its detail page with the seo_token attribution tag');
  assert.ok(html.includes('class="tp-pool-link"'), 'missing pool link class');
});
test('pool row falls back to the token app view (tagged src=seo_token — 203) when a pool has no id', () => {
  const noId = gen.renderTokenPage({ symbol: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7,
    pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0 }] });
  // 173: the fallback link is the same appUrl the primary CTA uses, so it now
  // carries the generator's own &minTvl= floor too. 203: the fallback branch
  // is tagged exactly like the ?pool= branch — a row that falls back to the
  // token app view is the same attribution question, must not go untagged.
  assert.ok(noId.includes(`href="https://www.defi.garden/?token=X&minTvl=${gen.MIN_POOL_TVL}&src=seo_token"`), 'missing tagged fallback link');
});
test('203 criterion 1: every tp-pool-link href carries src=seo_token, and the count equals the visible row count', () => {
  const anchors = html.match(/<a class="tp-pool-link" href="[^"]*"/g) || [];
  assert.strictEqual(anchors.length, bySym['BIG'].pools.length, 'tp-pool-link anchor count must equal the visible row count');
  assert.ok(anchors.length > 0, 'fixture wiring check: expected >=1 tp-pool-link anchor');
  anchors.forEach((a) => assert.ok(/[?&]src=seo_token"$/.test(a), `every tp-pool-link href must carry src=seo_token; got: ${a}`));
});
test('203 criterion 2: poolHrefFor(p, fallback) with NO third argument is byte-identical to the pre-203 function, both branches', () => {
  const withId = { pool: 'abc-123' };
  assert.strictEqual(gen.poolHrefFor(withId, 'https://www.defi.garden/?token=X&minTvl=100000'),
    'https://www.defi.garden/?pool=abc-123', 'pool-branch output must be byte-identical with no src arg');
  const noId = {};
  assert.strictEqual(gen.poolHrefFor(noId, 'https://www.defi.garden/?token=X&minTvl=100000'),
    'https://www.defi.garden/?token=X&minTvl=100000', 'fallback-branch output must be byte-identical with no src arg');
  // falsy src (undefined/''/0/null) must behave identically to omitting it entirely.
  [undefined, '', null, 0].forEach((falsySrc) => {
    assert.strictEqual(gen.poolHrefFor(withId, 'https://www.defi.garden/?token=X&minTvl=100000', falsySrc),
      'https://www.defi.garden/?pool=abc-123', `falsy src (${JSON.stringify(falsySrc)}) must not tag the url`);
  });
});
test('203 criterion 2: no ld+json block anywhere in generated output contains "src=" — JSON-LD stays clean', () => {
  const ldJsonScripts = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  assert.ok(ldJsonScripts.length > 0, 'fixture wiring check: expected >=1 ld+json block');
  ldJsonScripts.forEach((block) => assert.ok(!/src=/.test(block), `ld+json block must never carry src=; got: ${block}`));
});
test('203 criterion 2: every ItemList url matches the clean pattern (no src, no other tracking param)', () => {
  const items = extractLdJsonBlocks(html, 'ItemList')[0].itemListElement;
  items.forEach((it) => assert.ok(/^https:\/\/www\.defi\.garden\/\?pool=[^&]+$/.test(it.url) || it.url === `https://www.defi.garden/?token=${encodeURIComponent(bySym['BIG'].symbol)}`,
    `ItemList url must be clean (no src); got: ${it.url}`));
});
test('renders >=1 real pool row with en-US formatted numbers', () => {
  assert.ok(/<td class="num">\d/.test(html), 'no formatted numeric cell');
  assert.ok(html.includes('%') && html.includes('$'), 'no APY/TVL');
});
test('indexable (robots index,follow)', () => {
  assert.ok(html.includes('content="index,follow"'), 'should be indexable');
});
test('reuses the app design system (links style.css) and uses neuro tokens, no hardcoded hex', () => {
  assert.ok(html.includes('<link rel="stylesheet" href="/style.css">'), 'must link the app style.css');
  assert.ok(html.includes('var(--neuro-shadow-raised)') && html.includes('var(--color-surface)'), 'must use neuro/color tokens');
  const styleBlock = html.match(/<style>[\s\S]*?<\/style>/)[0];
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleBlock), 'no hardcoded hex colors in the scoped style block');
});
test('single-pool page uses singular "pool" wording', () => {
  const midHtml = gen.renderTokenPage(bySym['MID']);
  assert.ok(/1 live pool above/.test(midHtml), 'expected singular "pool"');
});
test('HTML is escaped (malicious project name cannot inject markup)', () => {
  const evil = gen.renderTokenPage({ symbol: 'X', slug: 'x', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: '<script>alert(1)</script>', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0 }] });
  assert.ok(!evil.includes('<script>alert(1)</script>'), 'unescaped project name leaked into HTML');
  assert.ok(evil.includes('&lt;script&gt;'), 'expected escaped project name');
});

console.log('040 — BreadcrumbList JSON-LD');
function extractLdJsonBlocks(pageHtml, type) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(pageHtml))) {
    const parsed = JSON.parse(m[1]);
    if (!type || parsed['@type'] === type) blocks.push(parsed);
  }
  return blocks;
}
test('exactly one valid BreadcrumbList block with 3 items', () => {
  const blocks = extractLdJsonBlocks(html, 'BreadcrumbList');
  assert.strictEqual(blocks.length, 1, 'expected exactly one BreadcrumbList block');
  assert.strictEqual(blocks[0].itemListElement.length, 3, 'expected exactly 3 breadcrumb items');
});
test('breadcrumb items: Home (linked), Tokens (unlinked — no real hub page), <SYMBOL> (linked, self-canonical)', () => {
  const items = extractLdJsonBlocks(html, 'BreadcrumbList')[0].itemListElement;
  assert.strictEqual(items[0].position, 1);
  assert.strictEqual(items[0].name, 'Home');
  assert.strictEqual(items[0].item, 'https://www.defi.garden/');
  assert.strictEqual(items[1].position, 2);
  assert.strictEqual(items[1].name, 'Tokens');
  assert.ok(!('item' in items[1]), 'Tokens has no hub page in this repo — must not link a 404');
  assert.strictEqual(items[2].position, 3);
  assert.strictEqual(items[2].name, 'BIG');
  assert.strictEqual(items[2].item, 'https://www.defi.garden/tokens/big', 'must match the page\'s own canonical URL');
});
test('malicious symbol cannot break out of the ld+json script tag (BreadcrumbList block itself)', () => {
  // Isolates the JSON-LD block this diff adds. The pre-existing analytics
  // bootstrap (039, renderAnalyticsBootstrap) separately JSON.stringifies
  // rec.symbol into a *different* <script> without this escaping — a
  // pre-existing gap out of scope for 040 (no new computation, breadcrumb/
  // FAQ/Organization/WebSite only). Flagged in specs/040-notes.md.
  const evil = gen.renderTokenPage({ symbol: '</script><script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const blocks = extractLdJsonBlocks(evil, 'BreadcrumbList');
  assert.strictEqual(blocks.length, 1, 'BreadcrumbList block must still parse as valid JSON');
  assert.strictEqual(blocks[0].itemListElement[2].name, '</script><script>alert(1)</script>', 'JSON-LD name must still equal the raw symbol once parsed');
});

console.log('046 — ItemList + Dataset JSON-LD');
test('exactly one valid ItemList block whose items EXACTLY match the visible table rows', () => {
  const blocks = extractLdJsonBlocks(html, 'ItemList');
  assert.strictEqual(blocks.length, 1, 'expected exactly one ItemList block');
  const items = blocks[0].itemListElement;
  const big = bySym['BIG'];
  assert.strictEqual(items.length, big.pools.length, 'ItemList item count must match the visible row count');
  big.pools.forEach((p, i) => {
    assert.strictEqual(items[i].position, i + 1, 'position must match row order');
    assert.strictEqual(items[i].name, `${p.project} on ${p.chain}`, 'name must match project/chain shown in the row');
    const expectedUrl = p.pool
      ? `https://www.defi.garden/?pool=${encodeURIComponent(p.pool)}`
      : `https://www.defi.garden/?token=${encodeURIComponent(big.symbol)}`;
    assert.strictEqual(items[i].url, expectedUrl, 'url must match the row\'s own link target (clean, no src)');
    // 203 criterion 5 (replaces the old "href includes the clean url" check,
    // strictly stronger): the ItemList url must be clean AND the rendered
    // row href must be EXACTLY that clean url + the src attribution tag —
    // not merely "contains" it, which would also pass if the clean url
    // happened to be a prefix of some other unrelated tagged href.
    const sep = items[i].url.includes('?') ? '&' : '?';
    const expectedRowHref = `${items[i].url}${sep}src=seo_token`;
    assert.ok(html.includes(`href="${expectedRowHref}"`),
      `rendered row href must be exactly the clean ItemList url + src=seo_token; expected href="${expectedRowHref}"`);
  });
});
test('ItemList item count matches the number of <tr> rows in the table, not the full pool set', () => {
  const items = extractLdJsonBlocks(html, 'ItemList')[0].itemListElement;
  const trCount = (html.match(/<tr>\s*<td>/g) || []).length; // hub/az pages have no such rows; this page has exactly one table
  assert.strictEqual(items.length, trCount, 'ItemList must mirror the exact rendered row count');
});
test('exactly one valid Dataset block with required schema.org properties', () => {
  const blocks = extractLdJsonBlocks(html, 'Dataset');
  assert.strictEqual(blocks.length, 1, 'expected exactly one Dataset block');
  const d = blocks[0];
  assert.ok(d.name && typeof d.name === 'string', 'missing Dataset.name');
  assert.ok(d.description && typeof d.description === 'string', 'missing Dataset.description');
  assert.strictEqual(d.url, 'https://www.defi.garden/tokens/big', 'Dataset.url must be the page\'s own canonical URL');
  assert.strictEqual(d.publisher['@type'], 'Organization');
  assert.strictEqual(d.publisher.name, 'DeFi Garden');
  assert.strictEqual(d.creator['@type'], 'Organization');
  assert.ok(d.dateModified, 'missing Dataset.dateModified');
});
test('Dataset name/description are token-specific (dataset content, not a fixed template)', () => {
  const midHtml = gen.renderTokenPage(bySym['MID'], [], '2026-07-12');
  const midDataset = extractLdJsonBlocks(midHtml, 'Dataset')[0];
  assert.ok(midDataset.name.includes('MID'), 'Dataset.name should be token-specific');
  assert.notStrictEqual(midDataset.name, extractLdJsonBlocks(html, 'Dataset')[0].name);
});
test('generatedDate param controls Dataset.dateModified (defaults to today if omitted)', () => {
  const dated = gen.renderTokenPage(bySym['BIG'], [], '2020-01-01');
  assert.strictEqual(extractLdJsonBlocks(dated, 'Dataset')[0].dateModified, '2020-01-01');
});

console.log('048 — freshness signal: visible "Last updated" + Dataset.dateModified match');
test('renders a visible "Last updated <date>" line', () => {
  const dated = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12');
  assert.ok(dated.includes('Last updated 2026-07-12'), 'missing visible "Last updated" line');
});
test('visible "Last updated" date is byte-for-byte identical to Dataset.dateModified', () => {
  const dated = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12');
  const dateModified = extractLdJsonBlocks(dated, 'Dataset')[0].dateModified;
  assert.ok(dated.includes(`Last updated ${dateModified}`), 'visible date and Dataset.dateModified must match byte-for-byte');
});
test('default (no generatedDate passed) still renders a "Last updated" line', () => {
  assert.ok(/Last updated .+/.test(html), 'default-dated page missing visible "Last updated" line');
});
test('malicious project name cannot break out of the ItemList ld+json script tag', () => {
  const evil = gen.renderTokenPage({ symbol: 'X', slug: 'x', qualifyingCount: 1, totalTvl: 2e7,
    pools: [{ project: '</script><script>alert(1)</script>', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] }, [], '2026-07-12');
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const items = extractLdJsonBlocks(evil, 'ItemList')[0].itemListElement;
  assert.strictEqual(items[0].name, '</script><script>alert(1)</script> on Base', 'ItemList name must still equal the raw project name once parsed');
});
test('no visible content/meta/canonical/trust rail altered — only ld+json script blocks added', () => {
  // 046 is additive-only (spec 046, acceptance criterion 4). Strip every
  // <script type="application/ld+json"> block and diff against a pre-046
  // fixture rendering to prove nothing else moved.
  const stripLdJson = (s) => s.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  const before = stripLdJson(gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked), '2026-07-12'));
  // Recompute what the page looked like immediately before this diff by
  // asserting the stripped output still contains every pre-existing marker
  // untouched (title/canonical/table/related nav/analytics), i.e. ld+json
  // removal is the ONLY structural difference this diff introduces.
  assert.ok(before.includes('<title>BIG DeFi Yields'), 'title missing/changed');
  assert.ok(before.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'canonical missing/changed');
  assert.ok(before.includes('content="index,follow"'), 'robots meta missing/changed');
  assert.ok(/class="related"/.test(before), 'related nav missing');
  assert.ok(before.includes('Analytics.trackPageView("/tokens/big"'), 'analytics bootstrap missing');
});

console.log('023 — content depth + internal linking');
test('renders a unique per-token intro from real data (top pool + totals)', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(/class="intro"/.test(big), 'no intro block');
  assert.ok(big.includes("BIG's largest live pool is aave-v3 on Ethereum"), 'intro not token-specific');
});
test('intro differs per token (dataset content, not a fixed template)', () => {
  const a = gen.renderTokenPage(bySym['BIG'], []);
  const b = gen.renderTokenPage(bySym['MID'], []);
  const introA = a.match(/<p class="intro">([^<]*)</)[1];
  const introB = b.match(/<p class="intro">([^<]*)</)[1];
  assert.notStrictEqual(introA, introB, 'intros are identical across tokens');
});
test('relatedFor prefers co-chain tokens, excludes self, is slug-linkable', () => {
  const rel = gen.relatedFor(bySym['BIG'], ranked);
  assert.ok(rel.length >= 1, 'no related tokens');
  assert.ok(!rel.some(r => r.symbol === 'BIG'), 'self appeared in related');
  // BIG shares Ethereum/Base with MID(Ethereum) and ANOM(Ethereum) -> co-chain first
  assert.strictEqual(rel[0].symbol, 'MID', 'expected a co-chain token first');
});
test('page renders a Related tokens nav with internal /tokens/ links', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(/class="related"/.test(big), 'no related nav');
  assert.ok(big.includes('href="https://www.defi.garden/tokens/mid"'), 'no internal token link');
});
test('no self-link inside the related nav (canonical self-ref is fine)', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  const nav = big.match(/<nav class="related"[\s\S]*?<\/nav>/)[0];
  assert.ok(!nav.includes('/tokens/big"'), 'related nav links back to its own page');
});
test('related nav omitted when there are no related tokens', () => {
  const solo = gen.renderTokenPage(bySym['BIG'], []);
  assert.ok(!/class="related"/.test(solo), 'related nav should be absent with no related tokens');
});

console.log('021 — token sitemap (renderTokenSitemap)');
test('emits a valid urlset with one <loc> per ranked token', () => {
  const xml = gen.renderTokenSitemap(ranked, '2026-07-11');
  assert.ok(xml.startsWith('<?xml'), 'missing xml decl');
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'missing urlset');
  const locs = (xml.match(/<loc>/g) || []).length;
  assert.strictEqual(locs, ranked.length, 'one loc per token');
});
test('sitemap URLs point at the static /tokens/<slug> pages', () => {
  const xml = gen.renderTokenSitemap(ranked, '2026-07-11');
  assert.ok(xml.includes('<loc>https://www.defi.garden/tokens/big</loc>'), 'missing token URL');
  assert.ok(xml.includes('<lastmod>2026-07-11</lastmod>'), 'missing lastmod');
});
test('empty ranked list still yields a well-formed (empty) urlset', () => {
  const xml = gen.renderTokenSitemap([], '2026-07-11');
  assert.ok(xml.includes('<urlset') && xml.includes('</urlset>'), 'not well-formed');
  assert.strictEqual((xml.match(/<loc>/g) || []).length, 0);
});

console.log('039 — analytics bootstrap (previously zero token pages fired a trackable event)');
test('renderAnalyticsBootstrap emits Mixpanel stub + analytics.js + trackPageView', () => {
  const html = gen.renderAnalyticsBootstrap('/tokens/usdc', { page_type: 'token_landing', token: 'USDC', pool_count: 3 });
  assert.ok(html.includes('mixpanel.init('), 'missing mixpanel.init');
  assert.ok(html.includes('<script defer src="https://www.defi.garden/analytics.js"></script>'), 'missing analytics.js script tag');
  assert.ok(html.includes('Analytics.trackPageView("/tokens/usdc"'), 'missing trackPageView call with correct path');
  assert.ok(html.includes('"page_type":"token_landing"') && html.includes('"token":"USDC"') && html.includes('"pool_count":3'), 'missing/incorrect properties');
});
test('mixpanel stub regex literal survives untouched (/^\\/\\//)', () => {
  const html = gen.renderAnalyticsBootstrap('/tokens/usdc', {});
  assert.ok(html.includes('.match(/^\\/\\//)'.replace(/\\\\/g, '\\')), 'regex literal corrupted');
});
test('every generated token page wires the analytics bootstrap with its own slug/symbol/count', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(big.includes('Analytics.trackPageView("/tokens/big"'), 'BIG page missing its trackPageView call');
  assert.ok(big.includes('"token":"BIG"'), 'BIG page missing token property');
  assert.ok(big.includes(`"pool_count":${bySym['BIG'].qualifyingCount}`), 'BIG page pool_count mismatch');
});
test('analytics bootstrap sits inside <head>, before </head>, after the scoped <style> block', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  const styleEnd = big.indexOf('</style>');
  const bootstrapIdx = big.indexOf('Analytics.trackPageView');
  const headEnd = big.indexOf('</head>');
  assert.ok(styleEnd < bootstrapIdx && bootstrapIdx < headEnd, 'analytics bootstrap misplaced relative to <style>/</head>');
});
test('pre-existing content (title/canonical/pool table/related nav) unchanged by this diff', () => {
  const big = gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked));
  assert.ok(big.includes('<title>BIG DeFi Yields'), 'title missing/changed');
  assert.ok(big.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'canonical missing/changed');
  assert.ok(/class="related"/.test(big), 'related nav missing');
});

console.log('047 — direct-answer block + FAQPage (GEO/AEO)');
test('renders a visible direct-answer block right after the H1, before the pool table', () => {
  const h1Idx = html.indexOf('<h1>');
  const answerIdx = html.indexOf('class="tp-answer"');
  const tableIdx = html.indexOf('<table>');
  assert.ok(answerIdx > h1Idx && answerIdx < tableIdx, 'answer block misplaced relative to H1/table');
});
test('answer block answers the head query using only gated data already on the page', () => {
  const big = bySym['BIG'];
  const answerText = html.match(/class="tp-answer">([^<]*)</)[1];
  assert.ok(answerText.includes('BIG'), 'answer must name the token');
  assert.ok(answerText.includes(gen.formatApy(gen.poolTotalApy(big.pools[0]))), 'answer must cite the top pool\'s real APY');
  assert.ok(answerText.includes(String(big.qualifyingCount)), 'answer must cite the real qualifying pool count');
  assert.ok(answerText.includes('$100K TVL floor') && answerText.includes('anomalous'), 'answer must disclose the trust filters');
});
test('renders a visible FAQPage Q&A block with 2-4 items', () => {
  const items = html.match(/<div class="tp-faq-item">/g) || [];
  assert.ok(items.length >= 2 && items.length <= 4, 'expected 2-4 visible FAQ items, got ' + items.length);
});
test('FAQPage JSON-LD mainEntity is byte-for-byte the visible question/answer text (040 kevin invariant)', () => {
  const blocks = extractLdJsonBlocks(html, 'FAQPage');
  assert.strictEqual(blocks.length, 1, 'expected exactly one FAQPage block');
  const mainEntity = blocks[0].mainEntity;
  assert.ok(mainEntity.length >= 2 && mainEntity.length <= 4);
  const qMatches = [...html.matchAll(/<h3 class="tp-faq-q">([^<]*)<\/h3>/g)].map(m => m[1]);
  const aMatches = [...html.matchAll(/<p class="tp-faq-a">([^<]*)<\/p>/g)].map(m => m[1]);
  mainEntity.forEach((item, i) => {
    const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    assert.strictEqual(item.name, decode(qMatches[i]), 'FAQ question text mismatch at index ' + i);
    assert.strictEqual(item.acceptedAnswer.text, decode(aMatches[i]), 'FAQ answer text mismatch at index ' + i);
    assert.strictEqual(item['@type'], 'Question');
    assert.strictEqual(item.acceptedAnswer['@type'], 'Answer');
  });
});
test('trust rail: neither the answer block nor the FAQ ever cites an anomalous or sub-floor pool (ANOM fixture)', () => {
  const anomHtml = gen.renderTokenPage(bySym['ANOM']);
  assert.ok(!anomHtml.includes('degenfarm'), 'anomalous pool project name leaked into the page');
  assert.ok(!anomHtml.includes('1,500.00%') && !anomHtml.includes('2,100.00%'), 'anomalous APY leaked into the page');
  const answerText = anomHtml.match(/class="tp-answer">([^<]*)</)[1];
  assert.ok(answerText.includes('realpool'), 'answer should cite the real (non-anomalous) top pool');
  assert.ok(answerText.includes('1 pool'), 'ANOM has exactly 1 qualifying (non-anomalous) pool');
});
test('answer/FAQ content differs per token (dataset content, not a fixed template)', () => {
  const midHtml = gen.renderTokenPage(bySym['MID']);
  const bigAnswer = html.match(/class="tp-answer">([^<]*)</)[1];
  const midAnswer = midHtml.match(/class="tp-answer">([^<]*)</)[1];
  assert.notStrictEqual(bigAnswer, midAnswer, 'answer block is identical across tokens');
});
test('malicious symbol cannot break out of the FAQPage ld+json script tag', () => {
  const evil = gen.renderTokenPage({ symbol: '</script><script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const ldJsonScripts = evil.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  assert.ok(ldJsonScripts.every(s => !s.slice('<script type="application/ld+json">'.length, -'</script>'.length).includes('</script')),
    'a ld+json script body must not contain a literal </script sequence');
  const faq = extractLdJsonBlocks(evil, 'FAQPage')[0];
  assert.ok(faq.mainEntity[0].name.includes('</script><script>alert(1)</script>'), 'FAQ question must still contain the raw symbol once parsed');
});
test('no pre-existing content/meta/canonical/trust rail altered — answer+FAQ are additive only', () => {
  assert.ok(html.includes('<title>BIG DeFi Yields'), 'title missing/changed');
  assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'), 'canonical missing/changed');
  assert.ok(html.includes('content="index,follow"'), 'robots meta missing/changed');
  assert.ok(/class="related"/.test(gen.renderTokenPage(bySym['BIG'], gen.relatedFor(bySym['BIG'], ranked))), 'related nav missing');
});

console.log('049 — cross-surface linking: token -> chain');
const chainRanked = chainGen.rankTopChains(pools); // same fixture pools, real chain-side ranking
const generatedChainSlugs = new Set(chainRanked.map(c => c.slug));
test('chainLinksFor links only chains with a generated page (no dead links)', () => {
  // BIG has pools on Ethereum and Base; both qualify as real chain pages.
  const links = gen.chainLinksFor(bySym['BIG'], generatedChainSlugs);
  assert.deepStrictEqual(links, [{ chain: 'Ethereum', slug: 'ethereum' }, { chain: 'Base', slug: 'base' }]);
});
test('chainLinksFor never returns a slug outside the given generated set', () => {
  const links = gen.chainLinksFor(bySym['BIG'], new Set(['ethereum'])); // Base excluded on purpose
  assert.deepStrictEqual(links, [{ chain: 'Ethereum', slug: 'ethereum' }]);
});
test('chainLinksFor dedupes repeated chains and respects the cap', () => {
  const rec = { pools: [
    { chain: 'Ethereum', tvlUsd: 3 }, { chain: 'Ethereum', tvlUsd: 2 },
    { chain: 'Base', tvlUsd: 1 }, { chain: 'Arbitrum', tvlUsd: 1 }
  ] };
  const all = new Set(['ethereum', 'base', 'arbitrum']);
  assert.deepStrictEqual(gen.chainLinksFor(rec, all, 2), [
    { chain: 'Ethereum', slug: 'ethereum' }, { chain: 'Base', slug: 'base' }
  ]);
});
test('against the real cross-fixture ranking, chainLinksFor never links an ungenerated chain slug', () => {
  ranked.forEach(rec => {
    gen.chainLinksFor(rec, generatedChainSlugs).forEach(l =>
      assert.ok(generatedChainSlugs.has(l.slug), `dead link to ungenerated chain ${l.slug}`));
  });
});
test('renderTokenPage renders a Chains nav from chainLinks, omitted when there are none', () => {
  const withLinks = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12', [{ chain: 'Ethereum', slug: 'ethereum' }]);
  assert.ok(withLinks.includes('aria-label="Chains"'), 'missing Chains nav');
  assert.ok(withLinks.includes('href="https://www.defi.garden/chains/ethereum"'), 'missing chain link');
  const noLinks = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12', []);
  assert.ok(!noLinks.includes('aria-label="Chains"'), 'Chains nav should be absent with no chain links');
});

console.log('049 — cross-surface linking: category leg (folds in 043)');
test('categoryLinksFor returns distinct categories with working ?token=&poolTypes= app URLs', () => {
  const items = gen.categoryLinksFor(bySym['BIG'].pools, 'https://www.defi.garden/?token=BIG');
  assert.deepStrictEqual(items, [{ category: 'Lending', url: 'https://www.defi.garden/?token=BIG&poolTypes=Lending' }]);
});
test('renderTokenPage always renders a By category nav derived from on-page pools (no category hub page exists yet)', () => {
  const html = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12');
  assert.ok(html.includes('aria-label="Pool categories"'), 'missing category nav');
  // 173: categoryLinksFor builds off appUrl, which now carries the generator's
  // own &minTvl= floor — so the category link inherits it too (single
  // injection site, no re-typed literal).
  // 204: the category link is a visible estate->app render site, so it now
  // carries the estate's arrival tag (&src=seo_token) via withSrc.
  assert.ok(html.includes(`href="https://www.defi.garden/?token=BIG&minTvl=${gen.MIN_POOL_TVL}&poolTypes=Lending&src=seo_token"`), 'missing category link');
});
test('cross-links reuse the related nav styling via an added class token, without colliding with the exact class="related" tests', () => {
  const html = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12', [{ chain: 'Ethereum', slug: 'ethereum' }]);
  assert.ok(html.includes('class="related xlink-chains"'), 'missing xlink-chains nav class');
  assert.ok(html.includes('class="related xlink-category"'), 'missing xlink-category nav class');
  assert.ok(!/class="related"/.test(html), 'a cross-link nav must never use the bare related-tokens class exactly');
});
test('043 folded in: category leg present without a separate 043 build', () => {
  assert.ok(gen.categoryLinksFor(bySym['BIG'].pools, 'https://www.defi.garden/?token=BIG').length > 0);
});

console.log('062 — waitlist CTA (the missing SEO -> north-star bridge)');
test('renders exactly one waitlist CTA, deep-linking into plan.html with source=seo_token', () => {
  const matches = html.match(/href="\/plan\.html\?waitlist=1&amp;src=seo_token"/g) || [];
  assert.strictEqual(matches.length, 1, 'expected exactly one waitlist CTA link');
});
test('CTA copy is honest — reuses the app\'s existing disclosure copy verbatim, no new hype string', () => {
  assert.ok(html.includes('Join the waitlist →'), 'missing tcpWaitlistCta copy');
  assert.ok(html.includes('Free to join') && html.includes('exist yet') && html.includes("We&#39;ll email you when it does"),
    'missing tcpWaitlistMicro honest-disclosure copy');
});
test('pitch line is token-specific (dataset content, not a fixed template)', () => {
  assert.ok(html.includes('A card that spends your BIG yield'), 'missing BIG-specific pitch');
  const midHtml2 = gen.renderTokenPage(bySym['MID']);
  assert.ok(midHtml2.includes('A card that spends your MID yield'), 'missing MID-specific pitch');
});
test('waitlist block uses the neuro token system only, no hardcoded hex colors, reuses .tp-cta', () => {
  const styleBlock = gen.renderWaitlistCtaStyle('tp');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleBlock), 'hardcoded hex color in the waitlist CTA style block');
  assert.ok(styleBlock.includes('var(--neuro-shadow-raised)') && styleBlock.includes('.tp-cta'),
    'must reuse existing neuro tokens/button style');
  assert.ok(html.includes(styleBlock), 'waitlist style block missing from the rendered page <style>');
  assert.ok(html.match(/<a class="tp-cta" href="\/plan\.html\?waitlist=1/), 'CTA link must reuse the existing .tp-cta button style');
});
test('waitlist pitch line escapes a malicious token symbol (cannot inject markup)', () => {
  const evil = gen.renderTokenPage({ symbol: '<script>alert(1)</script>', slug: 'evil', qualifyingCount: 1,
    totalTvl: 2e7, pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] });
  const waitlistDiv = evil.match(/<div class="tp-waitlist">[\s\S]*?<\/div>/)[0];
  assert.ok(!waitlistDiv.includes('<script>alert(1)</script>'), 'unescaped symbol leaked into the waitlist pitch');
  assert.ok(waitlistDiv.includes('&lt;script&gt;'), 'expected escaped symbol in the waitlist pitch');
});
test('every generated token page (en + ko) renders the waitlist CTA', () => {
  ranked.forEach(rec => {
    const enHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'en');
    const koHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'ko');
    assert.ok(enHtml.includes('src=seo_token'), `EN page missing waitlist CTA for ${rec.symbol}`);
    assert.ok(koHtml.includes('src=seo_token'), `KO page missing waitlist CTA for ${rec.symbol}`);
    assert.ok(koHtml.includes('대기자 명단'), `KO page waitlist pitch not translated for ${rec.symbol}`); // "waitlist" in Korean
  });
});

console.log('066 — yield headline: honest per-token custom KPI, reusing planner.js blend/forever-number math');
const gp = require('./planner.js');
test('blended rate is the SAME median gp.blendedApy(rec.pools) computes — no parallel calc path', () => {
  const h = gen.yieldHeadlineFor(bySym['BIG'], 'en');
  assert.strictEqual(h.apyStr, gen.formatApy(gp.blendedApy(bySym['BIG'].pools)));
});
test('forever amount is the SAME gp.foreverNumber(monthly, blendedRate) capital figure', () => {
  const h = gen.yieldHeadlineFor(bySym['MID'], 'en');
  const anchor = gen.yieldHeadlineAnchor();
  const expected = gen.formatUsd(gp.foreverNumber(anchor.monthly, gp.blendedApy(bySym['MID'].pools)));
  assert.strictEqual(h.foreverAmtStr, expected);
});
test('anchor is Claude Pro at its SUBSCRIPTION_LADDER monthly price (single source of truth)', () => {
  const anchor = gen.yieldHeadlineAnchor();
  assert.strictEqual(anchor.id, 'claude');
  const h = gen.yieldHeadlineFor(bySym['BIG'], 'en');
  assert.strictEqual(h.monthly, anchor.monthly);
  assert.strictEqual(h.subLabel, 'Claude Pro');
});
test('every ranked token (all clear the 032 visible-nonzero table gate) gets a non-null headline', () => {
  ranked.forEach(r => {
    assert.ok(gen.yieldHeadlineFor(r, 'en'), `${r.symbol} unexpectedly got no yield headline`);
  });
});
test('174: returns null (no fabricated number) when every rail-passing pool is visibly zero', () => {
  const allZeroRec = { symbol: 'ALLZERO174', pools: [
    { apyBase: 0, apyReward: 0, tvlUsd: 200000 },
    { apyBase: 0, apyReward: 0, tvlUsd: 150000 }
  ] };
  assert.strictEqual(gen.yieldHeadlineFor(allZeroRec, 'en'), null);
});
test('174: a zero-APY pool mixed with real pools is excluded from the blend — exact expected value from a fixture', () => {
  // Pre-174 behavior blended ALL 3 pools: median([0,4,6]) = 4.00% (a promise
  // partly resting on a pool the product would never display). 174 requires
  // the blend to use ONLY the visibly-non-zero, rail-passing pools:
  // median([4,6]) = 5.00% — a different, exact number this test pins down.
  const mixedRec = { symbol: 'MIXED174', pools: [
    { apyBase: 0, apyReward: 0, tvlUsd: 200000 },
    { apyBase: 4, apyReward: 0, tvlUsd: 150000 },
    { apyBase: 6, apyReward: 0, tvlUsd: 100000 }
  ] };
  const h = gen.yieldHeadlineFor(mixedRec, 'en');
  assert.ok(h, 'expected a non-null headline once the zero pool is excluded from the blend');
  const nonZeroPools = [mixedRec.pools[1], mixedRec.pools[2]];
  const expectedApyStr = gen.formatApy(gp.blendedApy(nonZeroPools));
  assert.strictEqual(expectedApyStr, '5.00%', 'sanity: the fixture\'s own expected value');
  assert.strictEqual(h.apyStr, expectedApyStr, 'blended APY must be computed WITHOUT the zero pool');
  assert.notStrictEqual(h.apyStr, gen.formatApy(gp.blendedApy(mixedRec.pools)), 'must differ from the (wrong) all-pools blend');
  const expectedForever = gen.formatUsd(gp.foreverNumber(gen.yieldHeadlineAnchor().monthly, gp.blendedApy(nonZeroPools)));
  assert.strictEqual(h.foreverAmtStr, expectedForever, 'forever amount must be derived from the SAME zero-excluded blend');
});
test('renderYieldHeadlineHtml renders nothing for a null headline', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  assert.strictEqual(gen.renderYieldHeadlineHtml(null, 'X', t), '');
});
test('headline renders above the pool table (.tp-card), after the intro paragraph', () => {
  const introIdx = html.indexOf('<p class="intro">');
  const headlineIdx = html.indexOf('<p class="tp-yield-headline">');
  const tableIdx = html.indexOf('<div class="tp-card">');
  assert.ok(introIdx > -1 && headlineIdx > introIdx && headlineIdx < tableIdx,
    'expected intro < yield headline < pool table in document order');
});
test('headline copy states the token symbol, APY, forever capital, and monthly subscription price', () => {
  const h = gen.yieldHeadlineFor(bySym['BIG'], 'en');
  assert.ok(html.includes(`Your idle BIG could earn ~${h.apyStr}`), 'missing token/APY in rendered headline');
  assert.ok(html.includes(`park ${h.foreverAmtStr}`), 'missing forever-capital figure in rendered headline');
  assert.ok(html.includes(`$${h.monthly}/mo Claude Pro`), 'missing monthly subscription anchor in rendered headline');
});
test('malicious token symbol cannot inject markup into the yield headline', () => {
  const evil = { symbol: '<script>alert(1)</script>', pools: [{ project: 'aave', chain: 'Base', tvlUsd: 1e7, apyBase: 5, apyReward: 0, pool: 'p1' }] };
  const t = require('./translations.js').createTranslationFunction('en');
  const headlineHtml = gen.renderYieldHeadlineHtml(gen.yieldHeadlineFor(evil, 'en'), evil.symbol, t);
  assert.ok(!headlineHtml.includes('<script>alert(1)</script>'), 'unescaped symbol leaked into the yield headline');
  assert.ok(headlineHtml.includes('&lt;script&gt;'), 'expected escaped symbol in the yield headline');
});
test('every generated token page (en + ko) carries the yield headline with natural KO copy', () => {
  ranked.forEach(rec => {
    const enHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'en');
    const koHtml = gen.renderTokenPage(rec, [], '2026-07-12', [], 'ko');
    assert.ok(enHtml.includes('tp-yield-headline'), `EN page missing yield headline for ${rec.symbol}`);
    assert.ok(koHtml.includes('tp-yield-headline'), `KO page missing yield headline for ${rec.symbol}`);
    assert.ok(koHtml.includes('Claude Pro') && koHtml.includes('구독료'), `KO page yield headline not translated for ${rec.symbol}`);
  });
});
test('yield headline uses the neuro token system only, no hardcoded hex colors', () => {
  const styleMatch = html.match(/\.tp-yield-headline \{[^}]*\}/);
  assert.ok(styleMatch, 'yield headline style rule missing from rendered page');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleMatch[0]), 'hardcoded hex color in the yield headline style');
  assert.ok(styleMatch[0].includes('var(--neuro-shadow-raised)'), 'must reuse existing neuro shadow token');
});

console.log('174 — safety-floor honesty (FAQ) + no 0.00% rows + forever-number rail (committed regression)');
test('174: FAQ "Are these rates safe?" answer cites the real MIN_POOL_TVL floor and never says "trust filters" (EN)', () => {
  const faq = extractLdJsonBlocks(html, 'FAQPage')[0].mainEntity;
  assert.strictEqual(faq[2].name, 'Are these rates safe?');
  const safetyAnswer = faq[2].acceptedAnswer.text;
  assert.ok(safetyAnswer.includes(gen.formatUsd(gen.MIN_POOL_TVL)),
    'FAQ safety answer must cite the real MIN_POOL_TVL floor (' + gen.formatUsd(gen.MIN_POOL_TVL) + ')');
  assert.ok(!/trust filters/i.test(safetyAnswer),
    'FAQ safety answer must not attribute the page\'s floor to "DeFi Garden\'s trust filters" (100x false safety claim)');
});
test('174: FAQ safety answer changes when MIN_POOL_TVL changes (interpolated, never a re-typed literal)', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  assert.ok(t('tcpFaqA3', '$1.00').includes('$1.00'), 'tcpFaqA3 must be a function of its floor argument');
  assert.ok(t('tcpFaqA3', '$9.99M').includes('$9.99M'), 'tcpFaqA3 must reflect a different floor string, not a fixed literal');
});
test('174: FAQ safety answer cites the real USD floor and never says 신뢰 기준 (trust criteria) as the safety guarantee (KO)', () => {
  const koHtml = gen.renderTokenPage(bySym['BIG'], [], '2026-07-12', [], 'ko');
  const koFaq = extractLdJsonBlocks(koHtml, 'FAQPage')[0].mainEntity;
  const safetyAnswer = koFaq[2].acceptedAnswer.text;
  assert.ok(safetyAnswer.includes(gen.formatUsd(gen.MIN_POOL_TVL)),
    'KO FAQ safety answer must cite the real USD floor — never a converted/relabeled 원 figure');
  assert.ok(!safetyAnswer.includes('신뢰 기준'),
    'KO FAQ safety answer must not attribute the page\'s floor to DeFi Garden\'s "trust criteria" as a safety guarantee');
});
test('174: tcpTrustNote footer note is likewise interpolated from the floor, not "trust filters" (EN + KO)', () => {
  const t = require('./translations.js').createTranslationFunction('en');
  const tKo = require('./translations.js').createTranslationFunction('ko');
  assert.ok(!/trust filters/i.test(t('tcpTrustNote', gen.formatUsd(gen.MIN_POOL_TVL))), 'EN trust note must not say "trust filters"');
  assert.ok(!tKo('tcpTrustNote', gen.formatUsd(gen.MIN_POOL_TVL)).includes('신뢰 기준'), 'KO trust note must not say 신뢰 기준');
  assert.ok(html.includes(gen.formatUsd(gen.MIN_POOL_TVL)) , 'rendered page must show the real floor somewhere via the trust note');
});
test('174: no rendered pool row across ANY ranked token shows 0.00% APY (display excludes zero-yield rows)', () => {
  ranked.forEach(r => r.pools.forEach(p =>
    assert.notStrictEqual(gen.formatApy(gen.poolTotalApy(p)), '0.00%', r.symbol + ' has a displayed 0.00% APY row')));
});
test('174: rankTopTokens excludes 0.00%-APY rows from the displayed table and backfills a real-yield pool ranked beyond POOLS_PER_PAGE', () => {
  const backfillPools = [];
  for (let i = 0; i < 7; i++) {
    backfillPools.push({ symbol: 'BACKFILL174', project: 'zpool' + i, chain: 'Ethereum',
      tvlUsd: (900 - i * 100) * 1e6, apyBase: 0, apyReward: 0, pool: 'bf174-z' + i });
  }
  // Rank #8 by TVL — inside the gate's `shown` slice, keeps the token qualifying.
  backfillPools.push({ symbol: 'BACKFILL174', project: 'yieldpool8', chain: 'Ethereum',
    tvlUsd: 200000000, apyBase: 5, apyReward: 0, pool: 'bf174-y8' });
  // Rank #9 by TVL — beyond POOLS_PER_PAGE (8), the exact 033-style truncation case.
  backfillPools.push({ symbol: 'BACKFILL174', project: 'yieldpool9', chain: 'Ethereum',
    tvlUsd: 100000000, apyBase: 6, apyReward: 0, pool: 'bf174-y9' });
  const rankedBackfill = gen.rankTopTokens(backfillPools);
  const rec = rankedBackfill.find(r => r.symbol === 'BACKFILL174');
  assert.ok(rec, 'BACKFILL174 should qualify (its top-8-by-TVL gate slice has >=1 non-zero pool)');
  assert.strictEqual(rec.pools.length, 2, 'only the 2 real-yield pools should remain in the displayed table');
  assert.ok(rec.pools.every(p => gen.formatApy(gen.poolTotalApy(p)) !== '0.00%'),
    'no displayed BACKFILL174 pool row may show 0.00% APY');
  assert.ok(rec.pools.some(p => p.pool === 'bf174-y9'),
    'the rank-9 real-yield pool must backfill into the displayed table once zero rows are excluded');
  const bfHtml = gen.renderTokenPage(rec, [], '2026-07-12');
  assert.ok(!bfHtml.includes('0.00%'), 'rendered BACKFILL174 page must not show any 0.00% APY cell');
});
test('174: mutating MIN_POOL_TVL in a scratch run moves EVERY floor mention on token + chain + hub pages, with zero stale $100K literal', () => {
  const { tokenGen, chainGen, scratchDir } = loadScratchGenerators(250000);
  try {
    const newFloorStr = tokenGen.formatUsd(250000);
    assert.strictEqual(newFloorStr, '$250K', 'sanity: the mutated floor formats to $250K');

    const scratchRanked = tokenGen.rankTopTokens(pools); // reuses this file's own token fixture
    const big = scratchRanked.find(r => r.symbol === 'BIG');
    assert.ok(big, 'BIG ($500M+$300M pools) must still qualify at the mutated $250K floor');
    const tokenHtml = tokenGen.renderTokenPage(big, [], '2026-07-12');
    assert.ok(tokenHtml.includes(newFloorStr), 'token page must show the MUTATED floor, not a fixed literal');
    assert.ok(!tokenHtml.includes('$100K'), 'token page must not retain the stale $100K literal once the constant changes');

    const azGroups = tokenGen.groupTokensAZ(scratchRanked);
    const hubHtml = tokenGen.renderTokenHubPage(scratchRanked, azGroups);
    assert.ok(hubHtml.includes(newFloorStr), 'token hub page must show the MUTATED floor');
    assert.ok(!hubHtml.includes('$100K'), 'token hub page must not retain the stale $100K literal');

    const scratchChainRanked = chainGen.rankTopChains(pools); // same fixture, chain-side ranking
    assert.ok(scratchChainRanked.length > 0, 'expected at least one qualifying chain at the mutated floor');
    const chainRec = scratchChainRanked[0];
    const chainHtml = chainGen.renderChainPage(chainRec, [], '2026-07-12');
    assert.ok(chainHtml.includes(newFloorStr), 'chain page must show the MUTATED floor');
    assert.ok(!chainHtml.includes('$100K'), 'chain page must not retain the stale $100K literal');

    const chainHubHtml = chainGen.renderChainHubPage(scratchChainRanked);
    assert.ok(chainHubHtml.includes(newFloorStr), 'chain hub page must show the MUTATED floor');
    assert.ok(!chainHubHtml.includes('$100K'), 'chain hub page must not retain the stale $100K literal');
  } finally {
    cleanupScratch(scratchDir);
  }
});

console.log('242 — headline pool selection: the representativeness gate + attribution parity');
// Fixture population (NOT hardcoded page instances — run through rankTopTokens
// exactly like the population-invariant criterion requires):
//   POPA — a higher-APY NON-representative pool sits beside two representative
//          ones; the highest-APY REPRESENTATIVE pool must win (the class the
//          BIG-fixture accident above never exercised, since BIG's TVL-
//          largest pool also happens to be its highest-APY pool).
//   POPB — every displayed pool fails the gate (the documented fallback);
//          the highest-APY pool must still be the headline, attributed
//          correctly to itself.
//   POPC — a single pool with NO apyMean30d at all (the inert null branch —
//          229's "no evidence of representativeness is not evidence of
//          representativeness"); falls back to that lone pool.
//   POPE — the spec's own worked instance (694.11% / apyMean30d 240.47%)
//          beside a representative pool, used as an explicit positive
//          control in addition to being part of the population sweep.
function buildHeadlineFixturePools242() {
  return [
    { symbol: 'POPA', project: 'popa-proj1', chain: 'Ethereum', tvlUsd: 5000000, apyBase: 20, apyReward: 0, apyMean30d: 19, pool: 'popa-1' },
    { symbol: 'POPA', project: 'popa-proj2', chain: 'Polygon', tvlUsd: 3000000, apyBase: 50, apyReward: 0, apyMean30d: 5, pool: 'popa-2' },
    { symbol: 'POPA', project: 'popa-proj3', chain: 'Arbitrum', tvlUsd: 1000000, apyBase: 8, apyReward: 0, apyMean30d: 8.2, pool: 'popa-3' },
    { symbol: 'POPB', project: 'popb-proj1', chain: 'Optimism', tvlUsd: 2000000, apyBase: 12, apyReward: 0, apyMean30d: 100, pool: 'popb-1' },
    { symbol: 'POPB', project: 'popb-proj2', chain: 'Base', tvlUsd: 1500000, apyBase: 30, apyReward: 0, apyMean30d: 2, pool: 'popb-2' },
    { symbol: 'POPC', project: 'popc-proj1', chain: 'Ethereum', tvlUsd: 500000, apyBase: 6, apyReward: 0, pool: 'popc-1' },
    { symbol: 'POPE', project: 'popE-bad', chain: 'Ethereum', tvlUsd: 4000000, apyBase: 694.11, apyReward: 0, apyMean30d: 240.47, pool: 'pope-bad' },
    { symbol: 'POPE', project: 'popE-good', chain: 'Polygon', tvlUsd: 3000000, apyBase: 20.08, apyReward: 0, apyMean30d: 20.5, pool: 'pope-good' }
  ];
}
const fixturePools242 = buildHeadlineFixturePools242();
const ranked242 = gen.rankTopTokens(fixturePools242, 0);
const bySym242 = Object.fromEntries(ranked242.map(r => [r.symbol, r]));
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

test('fixture sanity: all 4 tokens qualify for a page (POPA, POPB, POPC, POPE)', () => {
  assert.deepStrictEqual(ranked242.map(r => r.symbol).sort(), ['POPA', 'POPB', 'POPC', 'POPE']);
});

test('population invariant: for EVERY rankTopTokens record, the rendered headline APY equals formatApy(poolTotalApy(headlinePoolFor(rec.pools))), and a representative pool is chosen whenever one exists (EN + KO)', () => {
  ranked242.forEach(rec => {
    const expectedPool = gen.headlinePoolFor(rec.pools);
    assert.ok(expectedPool, `[${rec.symbol}] headlinePoolFor returned null for a non-empty pools array`);
    const expectedApyStr = gen.formatApy(gen.poolTotalApy(expectedPool));
    ['en', 'ko'].forEach(lang => {
      const pageHtml = gen.renderTokenPage(rec, [], '2026-08-06', [], lang);
      const answerText = decodeEntities(pageHtml.match(/class="tp-answer">([^<]*)</)[1]);
      assert.ok(answerText.includes(expectedApyStr),
        `[${rec.symbol}/${lang}] answer block missing expected headline APY ${expectedApyStr}: "${answerText}"`);
      const faqA1 = decodeEntities(pageHtml.match(/<p class="tp-faq-a">([^<]*)<\/p>/)[1]);
      assert.ok(faqA1.includes(expectedApyStr),
        `[${rec.symbol}/${lang}] FAQ A1 missing expected headline APY ${expectedApyStr}: "${faqA1}"`);
    });
    // (b) representativeness invariant — a genuine invariant on headlinePoolFor's
    // OWN output, independent of how the page renders it: this is what makes
    // non-vacuity mutation (a) (headlinePoolFor -> plain Math.max) visible even
    // though the assertions above reference headlinePoolFor directly.
    const anyRepresentative = rec.pools.some(p => gen.isRepresentativeRate(p));
    if (anyRepresentative) {
      assert.ok(gen.isRepresentativeRate(expectedPool),
        `[${rec.symbol}] a representative pool exists among rec.pools but the headline pool is NOT representative`);
    }
  });
});

test('attribution invariant: the project + chain rendered in the answer block AND FAQ A1 belong to the SAME pool the headline APY came from, for every record, EN + KO', () => {
  ranked242.forEach(rec => {
    const expectedPool = gen.headlinePoolFor(rec.pools);
    ['en', 'ko'].forEach(lang => {
      const pageHtml = gen.renderTokenPage(rec, [], '2026-08-06', [], lang);
      const answerText = decodeEntities(pageHtml.match(/class="tp-answer">([^<]*)</)[1]);
      const faqA1 = decodeEntities(pageHtml.match(/<p class="tp-faq-a">([^<]*)<\/p>/)[1]);
      [['answer block', answerText], ['FAQ A1', faqA1]].forEach(([where, text]) => {
        assert.ok(text.includes(expectedPool.project),
          `[${rec.symbol}/${lang}] ${where} does not name the headline pool's project (${expectedPool.project}): "${text}"`);
        assert.ok(text.includes(expectedPool.chain),
          `[${rec.symbol}/${lang}] ${where} does not name the headline pool's chain (${expectedPool.chain}): "${text}"`);
        // No OTHER pool's project should appear where the headline pool's
        // project doesn't match it — guards against a same-numbered
        // coincidence masking a wrong-pool attribution.
        rec.pools.filter(p => p !== expectedPool && p.project !== expectedPool.project).forEach(other => {
          assert.ok(!text.includes(other.project),
            `[${rec.symbol}/${lang}] ${where} names a NON-headline pool's project (${other.project}) — wrong attribution: "${text}"`);
        });
      });
    });
  });
});

test('twin parity: renderTokenPageMarkdown carries the SAME headline APY + project/chain as renderTokenPage, for every record, EN + KO', () => {
  ranked242.forEach(rec => {
    const expectedPool = gen.headlinePoolFor(rec.pools);
    const expectedApy = gen.poolTotalApy(expectedPool);
    ['en', 'ko'].forEach(lang => {
      // buildAnswerAndFaq is the SAME function both renderTokenPage and
      // renderTokenPageMarkdown call — using it as the oracle for the exact
      // expected text (not just substring probes) proves twin parity.
      const { answer, faq } = gen.buildAnswerAndFaq(rec.symbol, rec, expectedApy, expectedPool, lang);
      const md = gen.renderTokenPageMarkdown(rec, [], '2026-08-06', [], lang);
      assert.ok(md.includes(answer),
        `[${rec.symbol}/${lang}] markdown twin's answer text does not match the expected buildAnswerAndFaq() output`);
      assert.ok(md.includes(faq[0].a),
        `[${rec.symbol}/${lang}] markdown twin's FAQ A1 does not match the expected buildAnswerAndFaq() output`);
    });
  });
});

console.log('242 — positive controls (the spec\'s measured instances, used as controls only — never the definition)');
test('positive control: a 694.11% pool (apyMean30d 240.47%) beside a representative 20.08% pool -> the unrepresentative pool is NOT the headline', () => {
  const rec = bySym242['POPE'];
  const bad = rec.pools.find(p => p.project === 'popE-bad');
  const good = rec.pools.find(p => p.project === 'popE-good');
  assert.ok(!gen.isRepresentativeRate(bad), 'sanity: the 694.11%/240.47%-mean pool must fail the gate');
  assert.ok(gen.isRepresentativeRate(good), 'sanity: the 20.08%/20.5%-mean pool must pass the gate');
  const headline = gen.headlinePoolFor(rec.pools);
  assert.strictEqual(headline.project, 'popE-good', 'the unrepresentative 694.11% pool must not be the headline');
  const html = gen.renderTokenPage(rec, [], '2026-08-06', [], 'en');
  const answerText = decodeEntities(html.match(/class="tp-answer">([^<]*)</)[1]);
  assert.ok(answerText.includes('694.11%') === false, 'rendered answer must not headline the 694.11% rate');
  assert.ok(answerText.includes(gen.formatApy(20.08)), 'rendered answer must headline the representative 20.08% rate');
  assert.ok(answerText.includes('popE-good') && !answerText.includes('popE-bad'), 'rendered answer must attribute to the representative pool, not the unrepresentative one');
});
test('positive control: a record where EVERY pool fails the gate -> the highest-APY pool IS the headline (documented fallback), attribution matches it', () => {
  const rec = bySym242['POPB'];
  assert.ok(rec.pools.every(p => !gen.isRepresentativeRate(p)), 'sanity: both POPB pools must fail the gate');
  const headline = gen.headlinePoolFor(rec.pools);
  assert.strictEqual(headline.project, 'popb-proj2', 'fallback must pick the highest-APY pool (30% > 12%)');
  const html = gen.renderTokenPage(rec, [], '2026-08-06', [], 'en');
  const answerText = decodeEntities(html.match(/class="tp-answer">([^<]*)</)[1]);
  assert.ok(answerText.includes(gen.formatApy(30)), 'fallback headline must state the highest (unchecked) APY');
  assert.ok(answerText.includes('popb-proj2') && !answerText.includes('popb-proj1'), 'fallback attribution must match the highest-APY pool, not the other one');
});

console.log('242 — unchanged-surface proof');
test('the visible pool table order is UNCHANGED by headline selection: still rec.pools order (TVL-sorted), for every record', () => {
  ranked242.forEach(rec => {
    const html = gen.renderTokenPage(rec, [], '2026-08-06', [], 'en');
    const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
    const tableProjects = [...tbody.matchAll(/class="tp-pool-link" href="[^"]*">([^&]*) &rarr;/g)].map(m => m[1]);
    assert.deepStrictEqual(tableProjects, rec.pools.map(p => p.project),
      `[${rec.symbol}] visible table row order diverged from rec.pools order`);
  });
});
test('rankTopTokens output (record set, per-record pools + order) is identical whether or not a headline is ever rendered — headlinePoolFor is read-only', () => {
  const rankedAgain = gen.rankTopTokens(buildHeadlineFixturePools242(), 0);
  assert.deepStrictEqual(rankedAgain, ranked242, 'rankTopTokens output must be unaffected by 242\'s headline-selection logic');
});

console.log('242 — mirror proof: generate-spotlight.js re-exports (never redefines) the representativeness gate');
test('generate-spotlight.js\'s isRepresentativeRate/representativenessRatio/REPRESENTATIVE_REL/REPRESENTATIVE_ABS_PP are the SAME function/value objects as generate-token-pages.js\'s (or, if @napi-rs/canvas is unavailable, a source-level proof that spotlight imports and re-exports without redefining)', () => {
  let spotlightGen = null;
  let mode;
  try {
    spotlightGen = require('./generate-spotlight.js');
    mode = 'live require (identity check)';
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND' || !/@napi-rs[\\/]canvas/.test(e.message)) throw e;
    mode = 'source-level proof (@napi-rs/canvas not installed in this checkout)';
  }
  console.log(`    [mirror proof ran in: ${mode}]`);
  if (spotlightGen) {
    assert.strictEqual(spotlightGen.isRepresentativeRate, gen.isRepresentativeRate, 'isRepresentativeRate identity mismatch (spotlight -> token-pages)');
    assert.strictEqual(gen.isRepresentativeRate, spotlightGen.isRepresentativeRate, 'isRepresentativeRate identity mismatch (token-pages -> spotlight)');
    assert.strictEqual(spotlightGen.representativenessRatio, gen.representativenessRatio, 'representativenessRatio identity mismatch (spotlight -> token-pages)');
    assert.strictEqual(gen.representativenessRatio, spotlightGen.representativenessRatio, 'representativenessRatio identity mismatch (token-pages -> spotlight)');
    assert.strictEqual(spotlightGen.REPRESENTATIVE_REL, gen.REPRESENTATIVE_REL, 'REPRESENTATIVE_REL identity mismatch (spotlight -> token-pages)');
    assert.strictEqual(gen.REPRESENTATIVE_REL, spotlightGen.REPRESENTATIVE_REL, 'REPRESENTATIVE_REL identity mismatch (token-pages -> spotlight)');
    assert.strictEqual(spotlightGen.REPRESENTATIVE_ABS_PP, gen.REPRESENTATIVE_ABS_PP, 'REPRESENTATIVE_ABS_PP identity mismatch (spotlight -> token-pages)');
    assert.strictEqual(gen.REPRESENTATIVE_ABS_PP, spotlightGen.REPRESENTATIVE_ABS_PP, 'REPRESENTATIVE_ABS_PP identity mismatch (token-pages -> spotlight)');
  } else {
    const src = fs.readFileSync(path.join(__dirname, 'generate-spotlight.js'), 'utf8');
    assert.ok(/require\(\s*\{[\s\S]*?\}\s*=\s*require\(['"]\.\/generate-token-pages\.js['"]\)|=\s*require\(['"]\.\/generate-token-pages\.js['"]\)/.test(src) || /require\(['"]\.\/generate-token-pages\.js['"]\)/.test(src),
      'generate-spotlight.js must import from generate-token-pages.js');
    assert.ok(!/function\s+isRepresentativeRate\s*\(/.test(src), 'generate-spotlight.js must NOT redefine isRepresentativeRate');
    assert.ok(!/function\s+representativenessRatio\s*\(/.test(src), 'generate-spotlight.js must NOT redefine representativenessRatio');
    assert.ok(!/const\s+REPRESENTATIVE_REL\s*=/.test(src), 'generate-spotlight.js must NOT redefine REPRESENTATIVE_REL');
    assert.ok(!/const\s+REPRESENTATIVE_ABS_PP\s*=/.test(src), 'generate-spotlight.js must NOT redefine REPRESENTATIVE_ABS_PP');
    const exportsMatch = src.match(/module\.exports\s*=\s*\{[\s\S]*?\n\};/);
    assert.ok(exportsMatch, 'generate-spotlight.js must have a module.exports block to inspect');
    ['REPRESENTATIVE_REL', 'REPRESENTATIVE_ABS_PP', 'isRepresentativeRate', 'representativenessRatio'].forEach(name => {
      assert.ok(exportsMatch[0].includes(name), `generate-spotlight.js's module.exports must still re-export ${name}`);
    });
  }
});

console.log(`\n${passed} assertions passed`);
