/* Unit tests for Korean static token/chain pages + hreflang (spec 050).
   Runs the generators' pure functions against the shared fixtures and
   asserts on the emitted en/ko HTML: hreflang reciprocity, ko-copy-from-
   catalog (no English UI-string leakage), and en/ko pool-parity (identical
   pool data — translation is copy-only, per CLAUDE.md's number-formatting
   rule). Run: node test_i18n_pages.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tp = require('./generate-token-pages.js');
const cp = require('./generate-chain-pages.js');
const { translations } = require('./translations.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const HANGUL = /[가-힣]/;
// English UI copy that must NEVER appear in a ko-rendered page — if any of
// these leak through, some template string bypassed the translation catalog.
const EN_LEAK_PHRASES = [
  'Related tokens', 'Related chains', 'Available on', 'By category',
  'Frequently asked questions', 'See live', 'Top tokens by TVL',
  'Browse all tokens', 'plan your DeFi savings by goal', 'Last updated ',
  'Yields are live from DefiLlama and pass', 'Back to DeFi Garden',
  'All Token Yield Pages', 'All Chain Yield Pages', 'Every DeFi', "Every Chain's",
  'Tokens starting with', 'All tokens', 'All chains', 'Are these rates safe',
  "What's the highest", 'How many'
];

function assertNoEnglishLeak(html, label) {
  EN_LEAK_PHRASES.forEach(phrase => {
    assert.ok(!html.includes(phrase), `${label}: leaked untranslated English phrase "${phrase}"`);
  });
}

const tokenPools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-sample.json'), 'utf8'));
const rankedTokens = tp.rankTopTokens(tokenPools);
const bySym = Object.fromEntries(rankedTokens.map(r => [r.symbol, r]));
const generatedChainSlugs = new Set(cp.rankTopChains(tokenPools, 0).map(c => c.slug));

const chainPools = JSON.parse(fs.readFileSync(path.join(__dirname, 'test_fixtures', 'pools-chain-sample.json'), 'utf8'));
const rankedChains = cp.rankTopChains(chainPools);
const byChain = Object.fromEntries(rankedChains.map(r => [r.chain, r]));
const generatedTokenSlugs = new Set(tp.rankTopTokens(chainPools, 0).map(t => t.slug));

console.log('translation catalog parity — every en key has a ko counterpart');
test('en/ko tcp* key sets are identical', () => {
  const enKeys = Object.keys(translations.en).filter(k => k.startsWith('tcp')).sort();
  const koKeys = Object.keys(translations.ko).filter(k => k.startsWith('tcp')).sort();
  assert.deepStrictEqual(koKeys, enKeys, 'ko catalog is missing/has extra tcp* keys vs en');
});

console.log('renderTokenPage — Korean variant');
const enTokenHtml = tp.renderTokenPage(bySym['BIG'], tp.relatedFor(bySym['BIG'], rankedTokens), '2026-07-12',
  tp.chainLinksFor(bySym['BIG'], generatedChainSlugs));
const koTokenHtml = tp.renderTokenPage(bySym['BIG'], tp.relatedFor(bySym['BIG'], rankedTokens), '2026-07-12',
  tp.chainLinksFor(bySym['BIG'], generatedChainSlugs), 'ko');

test('ko page declares <html lang="ko">, en page declares <html lang="en">', () => {
  assert.ok(koTokenHtml.startsWith('<!DOCTYPE html>\n<html lang="ko">'), 'ko page missing lang="ko"');
  assert.ok(enTokenHtml.startsWith('<!DOCTYPE html>\n<html lang="en">'), 'en page missing lang="en"');
});
test('ko page is self-canonical to /ko/tokens/<slug>, en to /tokens/<slug>', () => {
  assert.ok(koTokenHtml.includes('<link rel="canonical" href="https://www.defi.garden/ko/tokens/big">'));
  assert.ok(enTokenHtml.includes('<link rel="canonical" href="https://www.defi.garden/tokens/big">'));
});
test('reciprocal hreflang: both variants declare en, ko, and x-default pointing at the same URL pair', () => {
  [enTokenHtml, koTokenHtml].forEach(html => {
    assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://www.defi.garden/tokens/big">'));
    assert.ok(html.includes('<link rel="alternate" hreflang="ko" href="https://www.defi.garden/ko/tokens/big">'));
    assert.ok(html.includes('<link rel="alternate" hreflang="x-default" href="https://www.defi.garden/tokens/big">'),
      'x-default must point at the en URL (Google default-language guidance)');
  });
});
test('ko page carries Korean (Hangul) copy in the heading and intro', () => {
  assert.ok(HANGUL.test(koTokenHtml.match(/<h1>(.*?)<\/h1>/)[1]), 'H1 has no Hangul');
  assert.ok(HANGUL.test(koTokenHtml.match(/class="intro">(.*?)<\/p>/)[1]), 'intro paragraph has no Hangul');
});
test('ko page has no untranslated English UI-copy leakage', () => {
  assertNoEnglishLeak(koTokenHtml, 'token page (ko)');
});
test('en page is unaffected (no Korean leaked into the default-language page)', () => {
  assert.ok(!HANGUL.test(enTokenHtml), 'en page unexpectedly contains Hangul');
});
test('en/ko pool-parity: identical pool rows (same project/chain/APY/TVL) — translation is copy-only', () => {
  const rowsOf = (html) => (html.match(/<tr>\s*<td>.*?<\/tr>/gs) || []).filter(r => r.includes('tp-pool-link'));
  const enRows = rowsOf(enTokenHtml);
  const koRows = rowsOf(koTokenHtml);
  assert.strictEqual(enRows.length, koRows.length, 'row count differs between en/ko');
  assert.ok(enRows.length > 0, 'fixture produced zero rows — test is vacuous');
  enRows.forEach((row, i) => {
    const enNums = row.match(/\$[0-9.,]+[MBK]?|[0-9.]+%/g);
    const koNums = koRows[i].match(/\$[0-9.,]+[MBK]?|[0-9.]+%/g);
    assert.deepStrictEqual(koNums, enNums, `row ${i}: numbers differ between en/ko (must be en-US formatted in both)`);
  });
});
test('the $100K TVL floor / 1000% APY sanity-rail figures stay en-US formatted in the ko page (CLAUDE.md)', () => {
  assert.ok(koTokenHtml.includes('$100K'), 'ko page must render the TVL floor as "$100K", not a localized numeral');
  assert.ok(koTokenHtml.includes('1000%'), 'ko page must render the APY sanity limit as "1000%"');
});
test('FAQPage JSON-LD mainEntity is byte-for-byte the visible ko FAQ text (040 kevin invariant holds per-language)', () => {
  const scriptMatch = koTokenHtml.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  const block = JSON.parse(scriptMatch[1]);
  block.mainEntity.forEach(item => {
    assert.ok(koTokenHtml.includes(`<h3 class="tp-faq-q">${item.name}</h3>`), 'FAQ question not visible verbatim: ' + item.name);
  });
});

console.log('renderChainPage — Korean variant');
const enChainHtml = cp.renderChainPage(byChain['Big'], cp.relatedChainsFor(byChain['Big'], rankedChains), '2026-07-12',
  cp.topTokensOnChain(byChain['Big'], generatedTokenSlugs));
const koChainHtml = cp.renderChainPage(byChain['Big'], cp.relatedChainsFor(byChain['Big'], rankedChains), '2026-07-12',
  cp.topTokensOnChain(byChain['Big'], generatedTokenSlugs), 'ko');

test('ko chain page declares lang="ko", self-canonical to /ko/chains/<slug>', () => {
  assert.ok(koChainHtml.startsWith('<!DOCTYPE html>\n<html lang="ko">'));
  assert.ok(koChainHtml.includes('<link rel="canonical" href="https://www.defi.garden/ko/chains/big">'));
});
test('reciprocal hreflang on chain pages too', () => {
  [enChainHtml, koChainHtml].forEach(html => {
    assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://www.defi.garden/chains/big">'));
    assert.ok(html.includes('<link rel="alternate" hreflang="ko" href="https://www.defi.garden/ko/chains/big">'));
    assert.ok(html.includes('<link rel="alternate" hreflang="x-default" href="https://www.defi.garden/chains/big">'));
  });
});
test('ko chain page has no untranslated English UI-copy leakage', () => {
  assertNoEnglishLeak(koChainHtml, 'chain page (ko)');
});
test('en/ko chain pool-parity: identical table numbers', () => {
  const numsOf = (html) => (html.match(/<div class="scroll">.*?<\/table>/s) || [''])[0].match(/\$[0-9.,]+[MBK]?|[0-9.]+%/g);
  assert.deepStrictEqual(numsOf(koChainHtml), numsOf(enChainHtml));
});

console.log('renderTokenHubPage / renderTokenAzPage / renderChainHubPage — Korean variants');
const azGroups = tp.groupTokensAZ(rankedTokens);
const koHubHtml = tp.renderTokenHubPage(rankedTokens, azGroups, 'ko');
const koAzHtml = tp.renderTokenAzPage(azGroups[0], 'ko');
const koChainHubHtml = cp.renderChainHubPage(rankedChains, 'ko');

test('ko tokens hub is self-canonical to /ko/tokens with reciprocal hreflang, no English leakage', () => {
  assert.ok(koHubHtml.includes('<link rel="canonical" href="https://www.defi.garden/ko/tokens">'));
  assert.ok(koHubHtml.includes('hreflang="en" href="https://www.defi.garden/tokens">'));
  assertNoEnglishLeak(koHubHtml, 'tokens hub (ko)');
  assert.ok(koHubHtml.includes('href="https://www.defi.garden/ko/tokens/'), 'hub links must point at ko token pages');
});
test('ko A–Z sub-hub is self-canonical, links ko token pages, no English leakage', () => {
  assert.ok(/<link rel="canonical" href="https:\/\/www\.defi\.garden\/ko\/tokens\/az\/[a-z0-9-]+">/.test(koAzHtml));
  assertNoEnglishLeak(koAzHtml, 'tokens A-Z (ko)');
});
test('ko chains hub is self-canonical, no English leakage', () => {
  assert.ok(koChainHubHtml.includes('<link rel="canonical" href="https://www.defi.garden/ko/chains">'));
  assertNoEnglishLeak(koChainHubHtml, 'chains hub (ko)');
});

console.log('sitemap ko coverage (050)');
test('renderTokenSitemap(lang="ko") emits /ko/tokens/<slug> URLs; default (en) unaffected', () => {
  const koXml = tp.renderTokenSitemap(rankedTokens, '2026-07-12', [], 'ko');
  assert.ok(koXml.includes('<loc>https://www.defi.garden/ko/tokens/big</loc>'));
  const enXml = tp.renderTokenSitemap(rankedTokens, '2026-07-12');
  assert.ok(enXml.includes('<loc>https://www.defi.garden/tokens/big</loc>'));
  assert.ok(!enXml.includes('/ko/tokens/'), 'default-language sitemap must not include ko URLs');
});
test('renderChainSitemap(lang="ko") emits /ko/chains/<slug> URLs; default (en) unaffected', () => {
  const koXml = cp.renderChainSitemap(rankedChains, '2026-07-12', [], 'ko');
  assert.ok(koXml.includes('<loc>https://www.defi.garden/ko/chains/big</loc>'));
  const enXml = cp.renderChainSitemap(rankedChains, '2026-07-12');
  assert.ok(!enXml.includes('/ko/chains/'), 'default-language sitemap must not include ko URLs');
});

console.log(`${passed} i18n assertions passed`);
