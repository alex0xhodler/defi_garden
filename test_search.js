/* Spec 017: every advertised typing-animation example must actually parse.
   Hard fixtures for: (1) the literal search-box typing-animation examples
   (app.js searchPhrases, ~line 776), (2) the human's reported broken classes
   (bare chains, bare protocol names, protocol+category combos), and (3)
   novel same-class queries that prove the fixes are root-cause, not
   per-string hacks. Requires the real parser — search-parser.js is the
   single source of truth app.js itself calls. Run: node test_search.js */
const assert = require('assert');
const parseNaturalLanguageQuery = require('./search-parser.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Realistic fixture lists — shaped like the live data parseNaturalLanguageQuery
// actually receives from app.js (allAvailableChains / availableTokens /
// availableProtocols.all, the latter built by app.js's getFriendlyProtocolName).
const allTokens = ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'BTC', 'WBTC', 'SOL', 'CRV', 'KMNO', 'MORPHO', 'UNI', 'AAVE'];
const allChains = ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Solana', 'Avalanche', 'BNB Chain', 'Plasma'];
const allProtocols = [
  { friendlyName: 'Aave', originalNames: ['aave-v2', 'aave-v3'] },
  { friendlyName: 'Curve', originalNames: ['curve-dex', 'curve'] },
  { friendlyName: 'Convex', originalNames: ['convex-finance', 'convex'] },
  { friendlyName: 'Morpho', originalNames: ['morpho-blue', 'morpho'] },
  { friendlyName: 'Uniswap', originalNames: ['uniswap-v3'] },
  // kamino-lend + kamino-liquidity unify to one friendly name (app.js
  // getFriendlyProtocolName) — the root-cause fix for the "Kamino lending"
  // advertised example, which previously had no single-word "kamino" alias.
  { friendlyName: 'Kamino', originalNames: ['kamino-lend', 'kamino-liquidity'] },
];

console.log('Advertised typing-animation examples (app.js searchPhrases, verbatim)');

test('"USDC on Base" -> token USDC, chain Base', () => {
  const r = parseNaturalLanguageQuery('USDC on Base', allTokens, allChains, allProtocols);
  assert.strictEqual(r.token, 'USDC');
  assert.strictEqual(r.chain, 'Base');
});

test('"Lending on Plasma" -> Lending, chain Plasma (chain with no hardcoded alias)', () => {
  const r = parseNaturalLanguageQuery('Lending on Plasma', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.poolTypes, ['Lending']);
  assert.strictEqual(r.chain, 'Plasma');
});

test('"CRV LP on Curve" -> token CRV, LP/DEX, protocol Curve', () => {
  const r = parseNaturalLanguageQuery('CRV LP on Curve', allTokens, allChains, allProtocols);
  assert.strictEqual(r.token, 'CRV');
  assert.deepStrictEqual(r.poolTypes, ['LP/DEX']);
  assert.deepStrictEqual(r.protocols, ['Curve']);
});

test('"Kamino lending" -> Lending, protocol Kamino', () => {
  const r = parseNaturalLanguageQuery('Kamino lending', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.poolTypes, ['Lending']);
  assert.deepStrictEqual(r.protocols, ['Kamino']);
});

console.log('\nHuman-reported classes');

test('bare chain "solana" -> chain Solana', () => {
  const r = parseNaturalLanguageQuery('solana', allTokens, allChains, allProtocols);
  assert.strictEqual(r.chain, 'Solana');
});

test('bare chain "base" -> chain Base', () => {
  const r = parseNaturalLanguageQuery('base', allTokens, allChains, allProtocols);
  assert.strictEqual(r.chain, 'Base');
});

test('bare protocol name "kamino" -> protocol Kamino', () => {
  const r = parseNaturalLanguageQuery('kamino', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Kamino']);
});

test('bare protocol name "curve" -> protocol Curve', () => {
  const r = parseNaturalLanguageQuery('curve', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Curve']);
});

test('bare protocol name "convex" -> protocol Convex', () => {
  const r = parseNaturalLanguageQuery('convex', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Convex']);
});

test('protocol+category combo "kamino lenders" -> protocol Kamino, poolTypes Lending', () => {
  const r = parseNaturalLanguageQuery('kamino lenders', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Kamino']);
  assert.deepStrictEqual(r.poolTypes, ['Lending']);
});

console.log('\nNovel same-class queries (prove root-cause fixes, not per-string hacks)');

test('"arbitrum" -> chain Arbitrum', () => {
  const r = parseNaturalLanguageQuery('arbitrum', allTokens, allChains, allProtocols);
  assert.strictEqual(r.chain, 'Arbitrum');
});

test('"morpho lending" -> protocol Morpho, poolTypes Lending', () => {
  const r = parseNaturalLanguageQuery('morpho lending', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Morpho']);
  assert.deepStrictEqual(r.poolTypes, ['Lending']);
});

test('"aave" -> protocol Aave', () => {
  const r = parseNaturalLanguageQuery('aave', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Aave']);
});

console.log(`\n${passed} passed`);
