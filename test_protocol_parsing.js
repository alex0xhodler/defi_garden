// Simple test for protocol parsing functionality
// This is a standalone test file to verify the protocol parsing logic

// The real parser — single source of truth, see search-parser.js (spec 017).
const parseNaturalLanguageQuery = require('./search-parser.js');

// Test cases
const testCases = [
  'usdc on aave',
  'eth on euler on base',
  'usdt lending on venus',
  'aave on arbitrum', 
  'compound yields',
  'usdc on compound'
];

console.log('Testing Protocol-Aware Natural Language Parsing:');
console.log('='.repeat(50));

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: "${testCase}"`);
  const result = parseNaturalLanguageQuery(testCase, ['USDC', 'USDT', 'ETH'], ['Base', 'Arbitrum'], []);
  console.log('Result:', JSON.stringify(result, null, 2));
});