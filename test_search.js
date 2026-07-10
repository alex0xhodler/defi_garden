/* Unit tests for search-parser.js (spec 017: "every advertised typing-example
 * must actually parse"). Pins every string the typing-animation ad copy shows
 * (searchPhrases in app.js ~776) plus the human-reported query classes as
 * hard fixtures, so a future edit can't silently reintroduce a broken
 * advertised search. Run: node test_search.js
 */
const assert = require('assert');
const parseNaturalLanguageQuery = require('./search-parser.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

// Realistic fixture lists — mirrors what availableTokens/allAvailableChains
// look like once pools have loaded, and availableProtocols.all as it
// actually is at search time: empty, since no token/chain filter is selected
// yet (see search-parser.js's fallback-alias comment for why).
const ALL_TOKENS = ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'BTC', 'WBTC', 'SOL', 'CRV', 'AAVE', 'COMP', 'MKR', 'MORPHO', 'UNI', 'LINK'];
const ALL_CHAINS = ['Ethereum', 'Arbitrum', 'Polygon', 'Optimism', 'Base', 'BNB Chain', 'Avalanche', 'Solana', 'Fantom', 'Linea', 'Gnosis', 'Celo', 'Moonbeam', 'Cronos', 'zkSync Era', 'Plasma'];
const ALL_PROTOCOLS = [];

function parse(query) {
  return parseNaturalLanguageQuery(query, ALL_TOKENS, ALL_CHAINS, ALL_PROTOCOLS);
}

console.log('Advertised typing-animation examples (app.js searchPhrases)');
test('"USDC on Base" -> token USDC, chain Base', () => {
  const r = parse('USDC on Base');
  assert.strictEqual(r.token, 'USDC');
  assert.strictEqual(r.chain, 'Base');
});
test('"Lending on Plasma" -> chain Plasma, poolTypes Lending', () => {
  const r = parse('Lending on Plasma');
  assert.strictEqual(r.chain, 'Plasma');
  assert.ok(r.poolTypes.includes('Lending'), 'expected Lending poolType, got ' + JSON.stringify(r.poolTypes));
});
test('"CRV LP on Curve" -> token CRV, poolTypes LP/DEX, protocol Curve', () => {
  const r = parse('CRV LP on Curve');
  assert.strictEqual(r.token, 'CRV');
  assert.ok(r.poolTypes.includes('LP/DEX'), 'expected LP/DEX poolType, got ' + JSON.stringify(r.poolTypes));
  assert.deepStrictEqual(r.protocols, ['Curve']);
});
test('"Kamino lending" -> protocol Kamino, poolTypes Lending', () => {
  const r = parse('Kamino lending');
  assert.deepStrictEqual(r.protocols, ['Kamino']);
  assert.ok(r.poolTypes.includes('Lending'), 'expected Lending poolType, got ' + JSON.stringify(r.poolTypes));
});

console.log('Human-reported classes: bare chains');
test('"solana" -> chain Solana', () => {
  assert.strictEqual(parse('solana').chain, 'Solana');
});
test('"base" -> chain Base', () => {
  assert.strictEqual(parse('base').chain, 'Base');
});

console.log('Human-reported classes: protocol names');
test('"kamino" -> protocol Kamino', () => {
  assert.deepStrictEqual(parse('kamino').protocols, ['Kamino']);
});
test('"curve" -> protocol Curve', () => {
  assert.deepStrictEqual(parse('curve').protocols, ['Curve']);
});
test('"convex" -> protocol Convex', () => {
  assert.deepStrictEqual(parse('convex').protocols, ['Convex']);
});

console.log('Human-reported classes: protocol+category combos');
test('"kamino lenders" -> protocol Kamino, poolTypes Lending', () => {
  const r = parse('kamino lenders');
  assert.deepStrictEqual(r.protocols, ['Kamino']);
  assert.ok(r.poolTypes.includes('Lending'), 'expected Lending poolType, got ' + JSON.stringify(r.poolTypes));
});

console.log('Novel same-class queries (root-cause fix, not per-string hacks)');
test('"arbitrum" -> chain Arbitrum', () => {
  assert.strictEqual(parse('arbitrum').chain, 'Arbitrum');
});
test('"morpho lending" -> protocol Morpho, poolTypes Lending', () => {
  const r = parse('morpho lending');
  assert.deepStrictEqual(r.protocols, ['Morpho']);
  assert.ok(r.poolTypes.includes('Lending'), 'expected Lending poolType, got ' + JSON.stringify(r.poolTypes));
});
test('"aave" -> protocol Aave', () => {
  assert.deepStrictEqual(parse('aave').protocols, ['Aave']);
});

console.log('Regression: chain word must not leak into token (matching-order fix)');
test('"solana" does not pick up a stray token', () => {
  assert.strictEqual(parse('solana').token, '');
});

console.log(passed + ' search-parser assertions passed');
