// Test the qualifier word fix
const parseNaturalLanguageQuery = (query, allTokens = [], allChains = [], allProtocols = []) => {
  const lowerQuery = query.toLowerCase();
  let token = '';
  let chain = '';
  let poolTypes = [];
  let protocols = [];

  // --- Parse Token ---
  if (allTokens && allTokens.length > 0) {
    const exactTokenMatch = allTokens.find(t => t.toLowerCase() === lowerQuery);
    if (exactTokenMatch) {
        token = exactTokenMatch;
    } else {
        // Split query into words for context analysis
        const words = lowerQuery.split(/\s+/);
        
        // Filter out qualifier words that aren't tokens
        const qualifierWords = ['best', 'highest', 'top', 'good', 'great', 'yields', 'yield', 'farming', 'opportunities', 'rates', 'apy'];
        const filteredWords = words.filter(word => !qualifierWords.includes(word));
        
        console.log('Original words:', words);
        console.log('Filtered words:', filteredWords);
        
        // Find chain context indicators to exclude words after them
        const chainIndicators = ['on', 'chain', 'network', 'blockchain'];
        let tokenCandidateWords = [];
        
        for (let i = 0; i < filteredWords.length; i++) {
            if (chainIndicators.includes(filteredWords[i])) {
                // Stop including words after chain indicators
                tokenCandidateWords = filteredWords.slice(0, i);
                break;
            }
        }
        
        // If no chain indicators found, use first few filtered words (typically tokens come first)
        if (tokenCandidateWords.length === 0) {
            tokenCandidateWords = filteredWords.slice(0, Math.min(3, filteredWords.length));
        }
        
        const tokenCandidateText = tokenCandidateWords.join(' ');
        console.log('Token candidate text:', tokenCandidateText);
    }
  }

  // --- Parse Chain ---
  const chainAliases = {
      'base': 'Base',
      'ethereum': 'Ethereum',
      'arbitrum': 'Arbitrum',
      'solana': 'Solana'
  };

  if (allChains && allChains.length > 0) {
    for (const alias in chainAliases) {
        if (lowerQuery.includes(alias)) {
            const matchedChain = chainAliases[alias];
            if (allChains.includes(matchedChain)) {
                chain = matchedChain;
                break;
            }
        }
    }
  }

  // --- Parse Protocols ---
  const protocolAliases = {
    'aave': ['aave', 'aave-v2', 'aave-v3'],
    'compound': ['compound', 'compound-v2', 'compound-v3'],
    'curve': ['curve', 'curve-dex']
  };

  const protocolKeywords = ['on', 'via', 'using', 'through', 'from', 'with', 'in'];
  
  // Method 1: Look for protocols after context keywords
  const words = lowerQuery.split(/\s+/);
  const qualifierWords = ['best', 'highest', 'top', 'good', 'great', 'yields', 'yield', 'farming', 'opportunities', 'rates', 'apy'];
  const filteredWords = words.filter(word => !qualifierWords.includes(word));
  
  for (let i = 0; i < filteredWords.length - 1; i++) {
    if (protocolKeywords.includes(filteredWords[i])) {
      const protocolCandidate = filteredWords[i + 1];
      
      for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
        if (aliases.some(alias => alias === protocolCandidate || protocolCandidate.includes(alias))) {
          protocols.push(friendlyName);
          break;
        }
      }
    }
  }

  // Pool types
  if (lowerQuery.includes('lending')) {
      poolTypes.push('Lending');
  }
  if (lowerQuery.includes('yield') || lowerQuery.includes('farming')) {
      poolTypes.push('Yield Farming');
  }

  return { token, chain, poolTypes, protocols };
};

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