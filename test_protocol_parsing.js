// Simple test for protocol parsing functionality
// This is a standalone test file to verify the protocol parsing logic

// Mock the getFriendlyProtocolName function for testing
const getFriendlyProtocolName = (protocolName) => {
  if (!protocolName) return protocolName;
  
  const protocolNameMap = {
    'aave-v2': 'Aave',
    'aave-v3': 'Aave',
    'aave': 'Aave',
    'compound-v2': 'Compound',
    'compound-v3': 'Compound', 
    'compound': 'Compound',
    'uniswap-v2': 'Uniswap',
    'uniswap-v3': 'Uniswap',
    'uniswap': 'Uniswap',
  };
  return protocolNameMap[protocolName.toLowerCase()] || 
         protocolName.charAt(0).toUpperCase() + protocolName.slice(1).replace(/-/g, ' ');
};

// Copy the parseNaturalLanguageQuery function for testing
const parseNaturalLanguageQuery = (query, allTokens = [], allChains = [], allProtocols = []) => {
  const lowerQuery = query.toLowerCase();
  let token = '';
  let chain = '';
  let poolTypes = [];
  let protocols = [];

  // Simplified protocol parsing for testing
  const protocolAliases = {
    'aave': ['aave', 'aave-v2', 'aave-v3'],
    'compound': ['compound', 'compound-v2', 'compound-v3', 'comp'],
    'uniswap': ['uniswap', 'uniswap-v2', 'uniswap-v3', 'uni'],
    'curve': ['curve', 'curve-dex', 'crv'],
    'euler': ['euler'],
    'venus': ['venus'],
  };

  const protocolKeywords = ['on', 'via', 'using', 'through', 'from', 'with', 'in'];
  
  // Method 1: Look for protocols after context keywords
  const words = lowerQuery.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    if (protocolKeywords.includes(words[i])) {
      const protocolCandidate = words[i + 1];
      
      for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
        if (aliases.some(alias => alias === protocolCandidate || protocolCandidate.includes(alias))) {
          protocols.push(friendlyName);
          break;
        }
      }
    }
  }
  
  // Method 2: Direct protocol name detection (fallback)
  if (protocols.length === 0) {
    for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
      if (aliases.some(alias => lowerQuery.includes(alias))) {
        const aliasMatch = aliases.find(alias => lowerQuery.includes(alias));
        const wordBoundaryRegex = new RegExp(`\\b${aliasMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        
        if (wordBoundaryRegex.test(lowerQuery)) {
          protocols.push(friendlyName);
        }
      }
    }
  }
  
  // Method 3: Protocol-first detection (e.g., "aave on arbitrum")
  if (protocols.length === 0) {
    const firstWord = words[0];
    if (firstWord) {
      for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
        if (aliases.includes(firstWord)) {
          protocols.push(friendlyName);
          break;
        }
      }
    }
  }
  
  // Parse token (simplified)
  const tokens = ['USDC', 'USDT', 'ETH', 'BTC'];
  for (const t of tokens) {
    if (lowerQuery.includes(t.toLowerCase())) {
      token = t;
      break;
    }
  }
  
  return { token, chain, poolTypes, protocols };
};

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