// Test the qualifier word fix
// The real parser — single source of truth, see search-parser.js (spec 017).
const parseNaturalLanguageQuery = require('./search-parser.js');

// Test cases
console.log('=== Testing Qualifier Word Fix ===\n');

const testCases = [
  'best yields on base',
  'best yields on aave', 
  'best yields on curve',
  'highest yields on solana',
  'highest apy on ethereum',
  'top usdc yields'
];

const mockTokens = ['USDC', 'ETH', 'SOL', 'SOLANA']; // Added SOL/SOLANA to test disambiguation
const mockChains = ['Base', 'Ethereum', 'Solana'];

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: "${testCase}"`);
  const result = parseNaturalLanguageQuery(testCase, mockTokens, mockChains, []);
  console.log('Result:', JSON.stringify(result, null, 2));
  console.log('---\n');
});