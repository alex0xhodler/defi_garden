/* Unit tests for the per-page OG image generator (spec 051).
   Runs the real @napi-rs/canvas render against crafted/reused fixtures and
   asserts on the actual PNG bytes + the token/chain page templates that
   consume them. Run: node test_og_images.js

   Trust rail (mirrors test_token_pages.js/test_chain_pages.js): the ANOM
   fixture record carries a real $2M/6% pool plus an anomalous $900M/2100%
   pool. rankTopTokens/rankTopChains already strip the anomalous pool out of
   rec.pools before this module ever sees it — these tests confirm the OG
   generator's own APY computation inherits that gate, not just that the
   page's HTML table does. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const og = require('./generate-og-images.js');
const tp = require('./generate-token-pages.js');
const cp = require('./generate-chain-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const tokenRanked = tp.rankTopTokens(pools);
const chainRanked = cp.rankTopChains(pools);
const tokenBySym = Object.fromEntries(tokenRanked.map(r => [r.symbol, r]));

function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
// PNG dimensions live in the IHDR chunk, bytes 16-23 (big-endian width/height).
function pngDims(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

console.log('renderOgCard — real PNG output');
test('renders a valid 1200x630 PNG', () => {
  const buf = og.renderOgCard({ label: 'USDC', bestApy: 6.42, poolCount: 3 });
  assert.ok(isPng(buf), 'output is not a PNG');
  const { width, height } = pngDims(buf);
  assert.strictEqual(width, og.CARD_W);
  assert.strictEqual(height, og.CARD_H);
});
test('does not throw on a long label (truncated instead)', () => {
  assert.doesNotThrow(() => og.renderOgCard({ label: 'SOMEVERYLONGTOKENNAME', bestApy: 1.5, poolCount: 1 }));
});

console.log('ogRelPath — path convention');
test('token path is og/tokens/<slug>.png', () => {
  assert.strictEqual(og.ogRelPath('tokens', 'usdc'), 'og/tokens/usdc.png');
});
test('chain path is og/chains/<slug>.png', () => {
  assert.strictEqual(og.ogRelPath('chains', 'ethereum'), 'og/chains/ethereum.png');
});

console.log('trust rail — anomaly exclusion (051 AC #2, mirrors 027s share-card fix)');
test('ANOM token record: rec.pools the OG generator reads never contains the $900M/2100% pool', () => {
  const rec = tokenBySym['ANOM'];
  assert.ok(rec, 'fixture must include an ANOM token record');
  assert.ok(!rec.pools.some(p => p.tvlUsd === 900000000), 'anomalous pool leaked into rec.pools');
});
test('ANOM token record: the APY the card would show is the real 6% pool, never the 2100% one', () => {
  const rec = tokenBySym['ANOM'];
  const bestApy = Math.max(...rec.pools.map(tp.poolTotalApy));
  assert.strictEqual(bestApy, 6);
});

console.log('generateOgImages — writes real files, cleans stale ones, falls back on failure');
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-images-test-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('writes one real PNG per qualifying token, keyed by slug', () => {
  withTmpDir(dir => {
    const paths = og.generateOgImages(tokenRanked, 'tokens', rec => rec.symbol, dir);
    tokenRanked.forEach(rec => {
      const filePath = path.join(dir, 'og', 'tokens', `${rec.slug}.png`);
      assert.ok(fs.existsSync(filePath), `missing ${filePath}`);
      assert.ok(isPng(fs.readFileSync(filePath)));
      assert.strictEqual(paths.get(rec.slug), `og/tokens/${rec.slug}.png`);
    });
  });
});
test('writes one real PNG per qualifying chain, keyed by slug', () => {
  withTmpDir(dir => {
    const paths = og.generateOgImages(chainRanked, 'chains', rec => rec.chain, dir);
    chainRanked.forEach(rec => {
      const filePath = path.join(dir, 'og', 'chains', `${rec.slug}.png`);
      assert.ok(fs.existsSync(filePath));
      assert.strictEqual(paths.get(rec.slug), `og/chains/${rec.slug}.png`);
    });
  });
});
test('removes a stale image left by a token no longer in the ranked set', () => {
  withTmpDir(dir => {
    fs.mkdirSync(path.join(dir, 'og', 'tokens'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'og', 'tokens', 'delisted.png'), Buffer.from([0]));
    og.generateOgImages(tokenRanked, 'tokens', rec => rec.symbol, dir);
    assert.ok(!fs.existsSync(path.join(dir, 'og', 'tokens', 'delisted.png')));
  });
});
test('a per-record render failure falls back to the shared image, other records unaffected (AC #3/#4)', () => {
  withTmpDir(dir => {
    const broken = { symbol: 'BROKEN', slug: 'broken', qualifyingCount: 1, pools: null }; // .map throws
    const records = [tokenBySym['MID'], broken];
    const paths = og.generateOgImages(records, 'tokens', rec => rec.symbol, dir);
    assert.strictEqual(paths.get('broken'), og.FALLBACK_REL_PATH);
    assert.ok(!fs.existsSync(path.join(dir, 'og', 'tokens', 'broken.png')));
    assert.strictEqual(paths.get(tokenBySym['MID'].slug), `og/tokens/${tokenBySym['MID'].slug}.png`);
    assert.ok(fs.existsSync(path.join(dir, 'og', 'tokens', `${tokenBySym['MID'].slug}.png`)));
  });
});

console.log('CI timebox sanity — fixture-set generation stays fast (full-set CI cost is out of scope here)');
test('generating images for the whole fixture token set completes in well under the 5-min foreground cap', () => {
  withTmpDir(dir => {
    const start = Date.now();
    og.generateOgImages(tokenRanked, 'tokens', rec => rec.symbol, dir);
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 5000, `${elapsedMs}ms for ${tokenRanked.length} records — investigate before scaling to the live set`);
  });
});

console.log('renderTokenPage / renderChainPage — per-slug og:image wiring (051 AC #1)');
test('token page references its own og/tokens/<slug>.png when an image map is passed', () => {
  const rec = tokenBySym['BIG'];
  const ogImagePaths = new Map([[rec.slug, `og/tokens/${rec.slug}.png`]]);
  const html = tp.renderTokenPage(rec, [], '2026-07-12', [], 'en', ogImagePaths);
  assert.ok(html.includes(`<meta property="og:image" content="${tp.SITE_URL}/og/tokens/${rec.slug}.png">`));
  assert.ok(html.includes(`<meta name="twitter:image" content="${tp.SITE_URL}/og/tokens/${rec.slug}.png">`));
});
test('token page falls back to the shared og-image.png when no image map is passed', () => {
  const rec = tokenBySym['BIG'];
  const html = tp.renderTokenPage(rec, [], '2026-07-12', [], 'en');
  assert.ok(html.includes(`<meta property="og:image" content="${tp.SITE_URL}/${tp.OG_FALLBACK_REL_PATH}">`));
});
test('token page falls back when the map exists but has no entry for this slug', () => {
  const rec = tokenBySym['BIG'];
  const html = tp.renderTokenPage(rec, [], '2026-07-12', [], 'en', new Map());
  assert.ok(html.includes(`<meta property="og:image" content="${tp.SITE_URL}/${tp.OG_FALLBACK_REL_PATH}">`));
});
test('token page sets twitter:title/twitter:description matching the page title/description', () => {
  const rec = tokenBySym['BIG'];
  const html = tp.renderTokenPage(rec, [], '2026-07-12', [], 'en');
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const descMatch = html.match(/<meta name="description" content="(.*?)">/);
  assert.ok(html.includes(`<meta name="twitter:title" content="${titleMatch[1]}">`));
  assert.ok(html.includes(`<meta name="twitter:description" content="${descMatch[1]}">`));
});
test('chain page references its own og/chains/<slug>.png when an image map is passed', () => {
  const rec = chainRanked.find(r => r.chain === 'Big') || chainRanked[0];
  const ogImagePaths = new Map([[rec.slug, `og/chains/${rec.slug}.png`]]);
  const html = cp.renderChainPage(rec, [], '2026-07-12', [], 'en', ogImagePaths);
  assert.ok(html.includes(`<meta property="og:image" content="${cp.SITE_URL}/og/chains/${rec.slug}.png">`));
  assert.ok(html.includes(`<meta name="twitter:image" content="${cp.SITE_URL}/og/chains/${rec.slug}.png">`));
});
test('chain page falls back to the shared og-image.png when no image map is passed', () => {
  const rec = chainRanked[0];
  const html = cp.renderChainPage(rec, [], '2026-07-12', [], 'en');
  assert.ok(html.includes(`<meta property="og:image" content="${cp.SITE_URL}/og-image.png">`));
});
test('hub/A-Z pages (no per-page record) keep the shared og-image.png untouched', () => {
  const azGroups = tp.groupTokensAZ(tokenRanked);
  const hubHtml = tp.renderTokenHubPage(tokenRanked, azGroups);
  assert.ok(hubHtml.includes(`<meta property="og:image" content="${tp.SITE_URL}/og-image.png">`));
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
