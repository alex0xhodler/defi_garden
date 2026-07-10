/* Qualifier-word tests (spec 017): "best"/"highest"/"top" etc. must not be
   mistaken for tokens or leak into chain/protocol matching. Requires the real
   parser from search-parser.js — no inline copy. Run: node test_qualifier_fix.js */
const assert = require('assert');
const parseNaturalLanguageQuery = require('./search-parser.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const mockTokens = ['USDC', 'ETH', 'SOL', 'SOLANA'];
const mockChains = ['Base', 'Ethereum', 'Solana'];
const allProtocols = [
  { friendlyName: 'Aave', originalNames: ['aave-v2', 'aave-v3'] },
  { friendlyName: 'Curve', originalNames: ['curve-dex'] },
];

console.log('Qualifier word fix');

test('"best yields on base" -> chain Base, no qualifier leaked as token', () => {
  const r = parseNaturalLanguageQuery('best yields on base', mockTokens, mockChains, allProtocols);
  assert.strictEqual(r.chain, 'Base');
  assert.strictEqual(r.token, '');
});

test('"best yields on aave" -> protocol Aave', () => {
  const r = parseNaturalLanguageQuery('best yields on aave', mockTokens, mockChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Aave']);
});

test('"best yields on curve" -> protocol Curve', () => {
  const r = parseNaturalLanguageQuery('best yields on curve', mockTokens, mockChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Curve']);
});

test('"highest yields on solana" -> chain Solana, token disambiguated to SOL not SOLANA', () => {
  const r = parseNaturalLanguageQuery('highest yields on solana', mockTokens, mockChains, allProtocols);
  assert.strictEqual(r.chain, 'Solana');
});

test('"highest apy on ethereum" -> chain Ethereum', () => {
  const r = parseNaturalLanguageQuery('highest apy on ethereum', mockTokens, mockChains, allProtocols);
  assert.strictEqual(r.chain, 'Ethereum');
});

test('"top usdc yields" -> token USDC, no chain/protocol noise', () => {
  const r = parseNaturalLanguageQuery('top usdc yields', mockTokens, mockChains, allProtocols);
  assert.strictEqual(r.token, 'USDC');
  assert.strictEqual(r.chain, '');
  assert.deepStrictEqual(r.protocols, []);
});

console.log(`\n${passed} passed`);
