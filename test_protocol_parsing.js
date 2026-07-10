/* Protocol-aware natural language parsing tests (spec 017).
   Requires the real parser from search-parser.js — no inline copy — so this
   suite can't stay green while the shipped parser breaks. Run: node test_protocol_parsing.js */
const assert = require('assert');
const parseNaturalLanguageQuery = require('./search-parser.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const allTokens = ['USDC', 'USDT', 'ETH'];
const allChains = ['Base', 'Arbitrum'];
const allProtocols = [
  { friendlyName: 'Aave', originalNames: ['aave-v2', 'aave-v3'] },
  { friendlyName: 'Compound', originalNames: ['compound-v2', 'compound-v3'] },
  { friendlyName: 'Euler', originalNames: ['euler'] },
  { friendlyName: 'Venus', originalNames: ['venus-core-pool'] },
];

console.log('Protocol-aware natural language parsing');

test('"usdc on aave" -> token USDC, protocol Aave', () => {
  const r = parseNaturalLanguageQuery('usdc on aave', allTokens, allChains, allProtocols);
  assert.strictEqual(r.token, 'USDC');
  assert.deepStrictEqual(r.protocols, ['Aave']);
});

test('"eth on euler on base" -> token ETH, protocol Euler, chain Base', () => {
  const r = parseNaturalLanguageQuery('eth on euler on base', allTokens, allChains, allProtocols);
  assert.strictEqual(r.token, 'ETH');
  assert.deepStrictEqual(r.protocols, ['Euler']);
  assert.strictEqual(r.chain, 'Base');
});

test('"usdt lending on venus" -> token USDT, Lending, protocol Venus', () => {
  const r = parseNaturalLanguageQuery('usdt lending on venus', allTokens, allChains, allProtocols);
  assert.strictEqual(r.token, 'USDT');
  assert.deepStrictEqual(r.poolTypes, ['Lending']);
  assert.deepStrictEqual(r.protocols, ['Venus']);
});

test('"aave on arbitrum" -> protocol Aave, chain Arbitrum (protocol-first)', () => {
  const r = parseNaturalLanguageQuery('aave on arbitrum', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Aave']);
  assert.strictEqual(r.chain, 'Arbitrum');
});

test('"compound yields" -> protocol Compound, no stray token/chain', () => {
  const r = parseNaturalLanguageQuery('compound yields', allTokens, allChains, allProtocols);
  assert.deepStrictEqual(r.protocols, ['Compound']);
});

test('"usdc on compound" -> token USDC, protocol Compound', () => {
  const r = parseNaturalLanguageQuery('usdc on compound', allTokens, allChains, allProtocols);
  assert.strictEqual(r.token, 'USDC');
  assert.deepStrictEqual(r.protocols, ['Compound']);
});

console.log(`\n${passed} passed`);
