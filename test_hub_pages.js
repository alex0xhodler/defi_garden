/* Unit tests for the /tokens and /chains hub pages (spec 045 — de-orphan the
   SEO surface). Runs the generators' pure functions against the shared
   fixture and asserts on the emitted HTML/sitemap, plus that home.html
   carries static (pre-JS) links into the surface. Run: node test_hub_pages.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tp = require('./generate-token-pages.js');
const cp = require('./generate-chain-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const pools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const rankedTokens = tp.rankTopTokens(pools); // BIG, MID, ANOM, USDC.E, SMALL
const rankedChains = cp.rankTopChains(pools);

console.log('groupTokensAZ — every ranked token in exactly one group');
test('every ranked token appears in exactly one A–Z group', () => {
  const groups = tp.groupTokensAZ(rankedTokens);
  const seen = groups.flatMap(g => g.records.map(r => r.symbol));
  assert.deepStrictEqual(seen.slice().sort(), rankedTokens.map(r => r.symbol).sort());
  assert.strictEqual(new Set(seen).size, seen.length, 'a token appeared in more than one group');
});
test('groups are keyed by uppercased first letter, non-letters bucketed as "0-9"', () => {
  const groups = tp.groupTokensAZ([{ symbol: '1INCH', slug: '1inch' }, { symbol: 'aave', slug: 'aave' }]);
  const keys = groups.map(g => g.key);
  assert.ok(keys.includes('0-9'), 'digit-led symbol not bucketed into 0-9');
  assert.ok(keys.includes('A'), 'letter-led symbol not bucketed into its letter');
});
test('group slugs are URL-safe and 0-9 is a stable slug', () => {
  const groups = tp.groupTokensAZ(rankedTokens);
  groups.forEach(g => assert.ok(/^[a-z0-9-]+$/.test(g.slug), 'bad group slug: ' + g.slug));
});

console.log('renderTokenHubPage — server-delivered /tokens hub');
const azGroups = tp.groupTokensAZ(rankedTokens);
const tokenHubHtml = tp.renderTokenHubPage(rankedTokens, azGroups);
test('self-canonical to /tokens (no trailing slash — matches vercel.json trailingSlash:false)', () => {
  assert.ok(tokenHubHtml.includes('<link rel="canonical" href="https://www.defi.garden/tokens">'), 'missing hub canonical');
});
test('indexable (robots index,follow)', () => {
  assert.ok(tokenHubHtml.includes('content="index,follow"'), 'hub should be indexable');
});
test('every ranked token is reachable within <=1 hop from the hub (direct link or via its A–Z page)', () => {
  const top = new Set(rankedTokens.slice(0, tp.HUB_TOP_N).map(r => r.slug));
  rankedTokens.forEach(r => {
    const directLink = tokenHubHtml.includes(`href="https://www.defi.garden/tokens/${r.slug}"`);
    const group = azGroups.find(g => g.records.some(rec => rec.slug === r.slug));
    const azLinkedFromHub = group && tokenHubHtml.includes(`href="https://www.defi.garden/tokens/az/${group.slug}"`);
    assert.ok(directLink || azLinkedFromHub, r.symbol + ' unreachable from the tokens hub');
    if (!top.has(r.slug)) assert.ok(azLinkedFromHub, r.symbol + ' not in top-N and not linked via its A–Z page');
  });
});
test('reuses the app design system (style.css + neuro/color tokens, no hardcoded hex)', () => {
  assert.ok(tokenHubHtml.includes('<link rel="stylesheet" href="/style.css">'), 'must link the app style.css');
  const styleBlock = tokenHubHtml.match(/<style>[\s\S]*?<\/style>/)[0];
  assert.ok(styleBlock.includes('var(--neuro-shadow-raised)') && styleBlock.includes('var(--color-surface)'), 'must use neuro/color tokens');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(styleBlock), 'no hardcoded hex colors in the scoped style block');
});
test('links back to the homepage', () => {
  assert.ok(tokenHubHtml.includes('href="https://www.defi.garden/"'), 'missing link back to home');
});

console.log('renderTokenAzPage — A–Z sub-hub');
const groupA = azGroups.find(g => g.key !== '0-9');
const azHtml = tp.renderTokenAzPage(groupA);
test('self-canonical to /tokens/az/<letter>', () => {
  assert.ok(azHtml.includes(`<link rel="canonical" href="https://www.defi.garden/tokens/az/${groupA.slug}">`), 'missing A–Z canonical');
});
test('lists exactly the tokens in this group, none from other groups', () => {
  groupA.records.forEach(r => assert.ok(azHtml.includes(`href="https://www.defi.garden/tokens/${r.slug}"`), 'missing ' + r.symbol));
  const otherGroup = azGroups.find(g => g !== groupA);
  if (otherGroup) otherGroup.records.forEach(r => assert.ok(!azHtml.includes(`href="https://www.defi.garden/tokens/${r.slug}"`), 'leaked ' + r.symbol + ' from another group'));
});
test('links back to the tokens hub', () => {
  assert.ok(azHtml.includes('href="https://www.defi.garden/tokens"'), 'missing link back to the hub');
});

console.log('renderTokenSitemap — hub + A–Z URLs discoverable (045)');
test('extraLocs (hub + A–Z pages) appear in the emitted urlset', () => {
  const hubUrls = ['https://www.defi.garden/tokens'].concat(azGroups.map(g => `https://www.defi.garden/tokens/az/${g.slug}`));
  const xml = tp.renderTokenSitemap(rankedTokens, '2026-07-12', hubUrls);
  hubUrls.forEach(u => assert.ok(xml.includes(`<loc>${u}</loc>`), 'missing ' + u));
  const locs = (xml.match(/<loc>/g) || []).length;
  assert.strictEqual(locs, rankedTokens.length + hubUrls.length, 'loc count mismatch');
});
test('omitting extraLocs behaves exactly as before 045 (backward compatible)', () => {
  const xml = tp.renderTokenSitemap(rankedTokens, '2026-07-12');
  assert.strictEqual((xml.match(/<loc>/g) || []).length, rankedTokens.length);
});

console.log('renderChainHubPage — server-delivered /chains hub');
const chainHubHtml = cp.renderChainHubPage(rankedChains);
test('self-canonical to /chains (no trailing slash)', () => {
  assert.ok(chainHubHtml.includes('<link rel="canonical" href="https://www.defi.garden/chains">'), 'missing hub canonical');
});
test('every ranked chain linked directly (chain surface is small enough for a flat hub)', () => {
  rankedChains.forEach(r => assert.ok(chainHubHtml.includes(`href="https://www.defi.garden/chains/${r.slug}"`), 'missing ' + r.chain));
});
test('indexable and reuses the design system', () => {
  assert.ok(chainHubHtml.includes('content="index,follow"'), 'hub should be indexable');
  assert.ok(chainHubHtml.includes('<link rel="stylesheet" href="/style.css">'), 'must link the app style.css');
});

console.log('renderChainSitemap — hub URL discoverable (045)');
test('extraLocs (hub) appear in the emitted urlset', () => {
  const xml = cp.renderChainSitemap(rankedChains, '2026-07-12', ['https://www.defi.garden/chains']);
  assert.ok(xml.includes('<loc>https://www.defi.garden/chains</loc>'), 'missing chains hub URL');
  assert.strictEqual((xml.match(/<loc>/g) || []).length, rankedChains.length + 1);
});
test('omitting extraLocs behaves exactly as before 045 (backward compatible)', () => {
  const xml = cp.renderChainSitemap(rankedChains, '2026-07-12');
  assert.strictEqual((xml.match(/<loc>/g) || []).length, rankedChains.length);
});

console.log('home.html — static (pre-JS) links into the SEO surface (045)');
const homeHtml = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
test('raw HTML contains a static anchor to /tokens', () => {
  assert.ok(homeHtml.includes('<a href="/tokens">'), 'missing static /tokens link in home.html source');
});
test('raw HTML contains a static anchor to /chains', () => {
  assert.ok(homeHtml.includes('<a href="/chains">'), 'missing static /chains link in home.html source');
});
test('the links sit outside #root/#planner-root, in real markup (not inside a <script> string)', () => {
  const footerIdx = homeHtml.indexOf('class="seo-hub-links"');
  assert.ok(footerIdx > -1, 'seo-hub-links footer missing');
  const rootIdx = homeHtml.indexOf('id="root"');
  const plannerRootIdx = homeHtml.indexOf('id="planner-root"');
  assert.ok(rootIdx > -1 && plannerRootIdx > -1 && footerIdx > rootIdx && footerIdx > plannerRootIdx,
    'footer must come after both app mount points in document order');
  // Not nested inside any <script>...</script> block.
  const before = homeHtml.slice(0, footerIdx);
  const openScripts = (before.match(/<script/g) || []).length;
  const closeScripts = (before.match(/<\/script>/g) || []).length;
  assert.strictEqual(openScripts, closeScripts, 'footer markup appears inside an open <script> block');
});
test('the router (__APP_MODE) and canonical logic are untouched by this diff', () => {
  assert.ok(homeHtml.includes("window.__APP_MODE = needsAnalytics ? 'analytics' : 'planner';"), 'router logic changed');
  assert.ok(homeHtml.includes('window.__canonicalFor(window.location.search)'), 'canonical logic changed');
});

console.log(`\n${passed} assertions passed`);
