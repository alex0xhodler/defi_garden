const { useState, useEffect, useMemo } = React;

// Pool type categorization
const LENDING_PROTOCOLS = [
  'aave', 'aave-v2', 'aave-v3', 'compound', 'compound-v2', 'compound-v3',
  'morpho', 'morpho-blue', 'spark', 'sparklend', 'maple', 'euler', 'radiant',
  'iron-bank', 'cream', 'benqi-lending', 'venus', 'tectonic', 'moonwell',
  'strike', 'granary', 'pac-finance', 'dforce', 'annex'
];

const DEX_LP_PROTOCOLS = [
  'uniswap', 'uniswap-v2', 'uniswap-v3', 'curve', 'curve-dex', 'balancer',
  'balancer-v2', 'pancakeswap', 'pancakeswap-v2', 'pancakeswap-v3', 'sushiswap',
  'quickswap', 'traderjoe', 'spookyswap', 'spiritswap', 'honeyswap', 'dfyn',
  'viperswap', 'pangolin', 'lydia', 'defiswap', 'varen', 'levinswap',
  'aerodrome', 'aerodrome-slipstream', 'velodrome', 'solidly', 'bancor',
  'kyberswap', 'dodoex', '1inch', 'osmosis', 'raydium', 'orca'
];

const STAKING_PROTOCOLS = [
  'lido', 'rocket-pool', 'rocketpool', 'ether.fi', 'ether.fi-stake', 'stakewise',
  'jito', 'jito-liquid-staking', 'marinade', 'binance-staked-eth', 'coinbase-wrapped-staked-eth',
  'frax', 'frax-ether', 'benqi', 'benqi-staked-avax', 'staked-frax-ether',
  'ankr', 'pstake', 'stader', 'chorus-one', 'figment'
];

// Enhanced Protocol URL mapping with more protocols
const PROTOCOL_URLS = {
  "lido": "https://lido.fi",
  "aave-v3": "https://app.aave.com",
  "aave-v2": "https://app.aave.com",
  "aave": "https://app.aave.com",
  "compound-v3": "https://app.compound.finance",
  "compound-v2": "https://app.compound.finance",
  "compound": "https://app.compound.finance",
  "uniswap-v3": "https://app.uniswap.org",
  "uniswap-v2": "https://app.uniswap.org",
  "uniswap": "https://app.uniswap.org",
  "balancer-v2": "https://app.balancer.fi",
  "balancer": "https://app.balancer.fi",
  "curve": "https://curve.fi",
  "curve-dex": "https://curve.fi",
  "yearn-finance": "https://yearn.fi",
  "yearn": "https://yearn.fi",
  "convex-finance": "https://www.convexfinance.com",
  "convex": "https://www.convexfinance.com",
  "ether.fi-stake": "https://ether.fi",
  "ether.fi": "https://ether.fi",
  "binance-staked-eth": "https://www.binance.com",
  "coinbase-wrapped-staked-eth": "https://www.coinbase.com",
  "rocket-pool": "https://rocketpool.net",
  "rocketpool": "https://rocketpool.net",
  "frax-ether": "https://frax.finance",
  "frax": "https://frax.finance",
  "jito-liquid-staking": "https://www.jito.network",
  "jito": "https://www.jito.network",
  "maple": "https://maple.finance",
  "spark": "https://spark.fi",
  "sparklend": "https://spark.fi",
  "morpho-blue": "https://morpho.org",
  "morpho": "https://morpho.org",
  "ethena-usde": "https://ethena.fi",
  "ethena": "https://ethena.fi",
  "benqi-staked-avax": "https://benqi.fi",
  "benqi": "https://benqi.fi",
  "aerodrome-slipstream": "https://aerodrome.finance",
  "aerodrome": "https://aerodrome.finance",
  "pancakeswap-v3": "https://pancakeswap.finance",
  "pancakeswap-v2": "https://pancakeswap.finance",
  "pancakeswap": "https://pancakeswap.finance",
  "sushiswap": "https://sushi.com",
  "sushi": "https://sushi.com",
  "quickswap": "https://quickswap.exchange",
  "traderjoe": "https://traderjoexyz.com",
  "bancor": "https://bancor.network",
  "olympus": "https://olympusdao.finance",
  "stakewise": "https://stakewise.io"
};

// Pool type classification function
const getPoolType = (pool) => {
  if (!pool.project) return 'Yield Farming';
  
  const projectName = pool.project.toLowerCase().replace(/\s+/g, '-');
  
  // Check for lending pool indicators
  if (pool.poolMeta && pool.poolMeta.toLowerCase().includes('lending')) {
    return 'Lending';
  }
  
  // Check against protocol categories
  if (LENDING_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'Lending';
  }
  
  if (DEX_LP_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'LP/DEX';
  }
  
  if (STAKING_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'Staking';
  }
  
  // Default to yield farming for unmatched pools
  return 'Yield Farming';
};

// Custom hook for debouncing
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Natural Language Parsing Function
const parseNaturalLanguageQuery = (query, allTokens = [], allChains = [], allProtocols = []) => {
  const lowerQuery = query.toLowerCase();
  let token = '';
  let chain = '';
  let poolTypes = [];

  // --- Parse Token ---
  // Context-aware token extraction with position scoring
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
        
        // Find chain context indicators to exclude words after them
        const chainIndicators = ['on', 'chain', 'network', 'blockchain'];
        let tokenCandidateWords = [];
        let wordsAfterChainIndicators = [];
        
        for (let i = 0; i < filteredWords.length; i++) {
            if (chainIndicators.includes(filteredWords[i])) {
                // Stop including words after chain indicators
                tokenCandidateWords = filteredWords.slice(0, i);
                wordsAfterChainIndicators = filteredWords.slice(i + 1);
                break;
            }
        }
        
        // If no chain indicators found, use first few filtered words (typically tokens come first)
        if (tokenCandidateWords.length === 0) {
            tokenCandidateWords = filteredWords.slice(0, Math.min(3, filteredWords.length));
        }
        
        const tokenCandidateText = tokenCandidateWords.join(' ');
        
        // Common trading tokens (prioritize these)
        const commonTokens = ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'BTC', 'WBTC', 'UNI', 'LINK', 'AAVE', 'COMP', 'MKR'];
        
        // Score tokens based on context and priority
        const tokenScores = [];
        
        for (const t of allTokens) {
            const tokenLower = t.toLowerCase();
            const escapedToken = tokenLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordBoundaryRegex = new RegExp(`\\b${escapedToken}\\b`, 'i');
            
            // Skip if this token appears after chain indicators (likely it's being used as a chain name)
            if (wordsAfterChainIndicators.some(word => word.toLowerCase() === tokenLower)) {
                continue;
            }
            
            if (wordBoundaryRegex.test(tokenCandidateText)) {
                let score = 0;
                
                // Position scoring: earlier words get higher scores
                const tokenPosition = tokenCandidateText.toLowerCase().indexOf(tokenLower);
                score += Math.max(0, 100 - tokenPosition * 10);
                
                // Common token bonus
                if (commonTokens.includes(t)) {
                    score += 50;
                }
                
                // Length bonus (prefer longer, more specific tokens)
                score += t.length * 2;
                
                tokenScores.push({ token: t, score });
            }
        }
        
        // Sort by score and pick the highest
        if (tokenScores.length > 0) {
            tokenScores.sort((a, b) => b.score - a.score);
            token = tokenScores[0].token;
        }
        
        // Fallback: if no matches in candidate text, try token candidate text only (not full query)
        if (!token && tokenCandidateText) {
            for (const t of allTokens) {
                const tokenLower = t.toLowerCase();
                
                // Skip if this token appears after chain indicators (likely it's being used as a chain name)
                if (wordsAfterChainIndicators.some(word => word.toLowerCase() === tokenLower)) {
                    continue;
                }
                
                if (t.length >= 3 && tokenCandidateText.toLowerCase().includes(tokenLower)) {
                    // Double-check this isn't likely a chain name or qualifier word
                    const chainNames = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'fantom', 'solana'];
                    const qualifierWordsCheck = ['best', 'highest', 'top', 'good', 'great', 'yields', 'yield', 'farming', 'opportunities', 'rates', 'apy'];
                    if (!chainNames.includes(tokenLower) && !qualifierWordsCheck.includes(tokenLower)) {
                        token = t;
                        break;
                    }
                }
            }
        }
    }
  }

  // --- Parse Chain ---
  // Mapping for common chain aliases
  const chainAliases = {
      'eth': 'Ethereum',
      'ethereum': 'Ethereum',
      'polygon': 'Polygon',
      'matic': 'Polygon',
      'arb': 'Arbitrum',
      'arbitrum': 'Arbitrum',
      'op': 'Optimism',
      'optimism': 'Optimism',
      'bnb': 'BNB Chain',
      'bsc': 'BNB Chain',
      'binance': 'BNB Chain',
      'avax': 'Avalanche',
      'avalanche': 'Avalanche',
      'sol': 'Solana',
      'solana': 'Solana',
      'ftm': 'Fantom',
      'fantom': 'Fantom',
      'zksync': 'zkSync Era',
      'base': 'Base',
      'linea': 'Linea',
      'celo': 'Celo',
      'gnosis': 'Gnosis',
      'moonbeam': 'Moonbeam',
      'cronos': 'Cronos'
  };

  if (allChains && allChains.length > 0) {
    for (const alias in chainAliases) {
        if (lowerQuery.includes(alias)) {
            const matchedChain = chainAliases[alias];
            if (allChains.includes(matchedChain)) { // Ensure it's a valid, available chain
                chain = matchedChain;
                break;
            }
        }
    }
  }

  // --- Parse Pool Types ---
  if (lowerQuery.includes('lending')) {
      poolTypes.push('Lending');
  }
  if (lowerQuery.includes('lp') || lowerQuery.includes('dex')) {
      poolTypes.push('LP/DEX');
  }
  if (lowerQuery.includes('staking') || lowerQuery.includes('stake')) {
      poolTypes.push('Staking');
  }
  // Only add Yield Farming if it's explicitly mentioned as the main activity, not just descriptive
  if (lowerQuery.includes('farm') || lowerQuery.includes('farming')) {
      poolTypes.push('Yield Farming');
  }
  // Don't automatically add "Yield Farming" for generic "yield" mentions in queries like "best usdc yields"

  // Deduplicate pool types
  poolTypes = [...new Set(poolTypes)];

  // --- Parse Protocols ---
  let protocols = [];
  
  // Create protocol alias mapping for better matching
  const protocolAliases = {
    // Aave variants
    'aave': ['aave', 'aave-v2', 'aave-v3'],
    // Compound variants  
    'compound': ['compound', 'compound-v2', 'compound-v3', 'comp'],
    // Uniswap variants
    'uniswap': ['uniswap', 'uniswap-v2', 'uniswap-v3', 'uni'],
    // Curve variants
    'curve': ['curve', 'curve-dex', 'crv'],
    // Morpho variants
    'morpho': ['morpho', 'morpho-blue'],
    // Euler
    'euler': ['euler'],
    // Venus
    'venus': ['venus'],
    // Aerodrome variants
    'aerodrome': ['aerodrome', 'aerodrome-slipstream'],
    // PancakeSwap variants
    'pancakeswap': ['pancakeswap', 'pancakeswap-v2', 'pancakeswap-v3', 'pcs'],
    // Lido
    'lido': ['lido'],
    // Rocket Pool
    'rocket pool': ['rocket-pool', 'rocketpool', 'rpl'],
    // Ether.fi
    'ether.fi': ['ether.fi', 'ether.fi-stake', 'etherfi'],
    // Jito
    'jito': ['jito', 'jito-liquid-staking'],
    // Marinade
    'marinade': ['marinade'],
    // Raydium
    'raydium': ['raydium'],
    // Orca
    'orca': ['orca'],
    // Balancer
    'balancer': ['balancer', 'balancer-v2', 'bal']
    // Note: 'base' removed from protocol aliases to avoid conflict with Base chain
  };

  // Protocol context keywords that typically precede protocol names
  const protocolKeywords = ['on', 'via', 'using', 'through', 'from', 'with', 'in'];
  
  // Method 1: Look for protocols after context keywords
  const words = lowerQuery.split(/\s+/);
  const qualifierWords = ['best', 'highest', 'top', 'good', 'great', 'yields', 'yield', 'farming', 'opportunities', 'rates', 'apy'];
  const filteredWords = words.filter(word => !qualifierWords.includes(word));
  
  // Chain names to avoid protocol conflicts
  const chainNames = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'fantom', 'solana', 'binance', 'bnb'];
  
  for (let i = 0; i < filteredWords.length - 1; i++) {
    if (protocolKeywords.includes(filteredWords[i])) {
      const protocolCandidate = filteredWords[i + 1];
      
      // Skip if the candidate is likely a chain name
      if (chainNames.includes(protocolCandidate)) {
        continue;
      }
      
      // Find matching protocol
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
        // Additional check: avoid matching common words that might be part of other contexts
        const aliasMatch = aliases.find(alias => lowerQuery.includes(alias));
        
        // Skip if the alias is likely a chain name
        if (chainNames.includes(aliasMatch)) {
          continue;
        }
        
        const wordBoundaryRegex = new RegExp(`\\b${aliasMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        
        if (wordBoundaryRegex.test(lowerQuery)) {
          protocols.push(friendlyName);
        }
      }
    }
  }
  
  // Method 3: Protocol-first detection (e.g., "aave on arbitrum")
  if (protocols.length === 0) {
    const firstFilteredWord = filteredWords[0];
    if (firstFilteredWord) {
      for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
        if (aliases.includes(firstFilteredWord)) {
          protocols.push(friendlyName);
          break;
        }
      }
    }
  }
  
  // Deduplicate protocols
  protocols = [...new Set(protocols)];

  // --- Auto-set Chain for Protocol-Specific Contexts ---
  // If a protocol is detected but no chain is specified, auto-set the primary chain for that protocol
  if (protocols.length > 0 && !chain) {
    const protocolChainMapping = {
      'aerodrome': 'Base',
      'uniswap': 'Ethereum', // Default to mainnet for Uniswap
      'curve': 'Ethereum',   // Default to mainnet for Curve
      // Add more as needed
    };
    
    for (const protocol of protocols) {
      if (protocolChainMapping[protocol.toLowerCase()]) {
        chain = protocolChainMapping[protocol.toLowerCase()];
        break; // Use the first matching protocol's chain
      }
    }
  }

  return { token, chain, poolTypes, protocols };
};

// Helper function to normalize protocol names for consistent matching
const normalizeProtocolName = (protocolName) => {
  if (!protocolName) return protocolName;
  // Convert to title case - first letter uppercase, rest lowercase
  return protocolName.charAt(0).toUpperCase() + protocolName.slice(1).toLowerCase();
};

// Helper function to get chain brand colors
const getChainColor = (chainName) => {
  const chainColors = {
    'Ethereum': '#627EEA',
    'Polygon': '#8247E5',
    'Arbitrum': '#2D374B',
    'Optimism': '#FF0420',
    'BNB Chain': '#F3BA2F',
    'Avalanche': '#E84142',
    'Solana': '#14F195',
    'Fantom': '#1969FF',
    'zkSync Era': '#8C8DFC',
    'Base': '#0052FF',
    'Linea': '#121212',
    'Celo': '#FCFF52',
    'Gnosis': '#3E6957',
    'Moonbeam': '#53CBC9',
    'Cronos': '#002D74'
  };
  return chainColors[chainName] || '#6B7280'; // Default gray color
};

// Helper function to get friendly protocol names
const getFriendlyProtocolName = (protocolName) => {
  if (!protocolName) return protocolName;
  
  const protocolNameMap = {
    // Aave variants
    'aave-v2': 'Aave',
    'aave-v3': 'Aave',
    'aave': 'Aave',
    
    // Compound variants
    'compound-v2': 'Compound',
    'compound-v3': 'Compound',
    'compound': 'Compound',
    
    // Uniswap variants
    'uniswap-v2': 'Uniswap',
    'uniswap-v3': 'Uniswap',
    'uniswap': 'Uniswap',
    
    // Curve variants
    'curve-dex': 'Curve',
    'curve': 'Curve',
    
    // Balancer variants
    'balancer-v2': 'Balancer',
    'balancer': 'Balancer',
    
    // PancakeSwap variants
    'pancakeswap-v2': 'PancakeSwap',
    'pancakeswap-v3': 'PancakeSwap',
    'pancakeswap-amm': 'PancakeSwap',
    'pancakeswap': 'PancakeSwap',
    
    // Aerodrome variants
    'aerodrome-slipstream': 'Aerodrome',
    'aerodrome': 'Aerodrome',
    
    // Morpho variants
    'morpho-blue': 'Morpho',
    'morpho': 'Morpho',
    
    // Lido variants
    'lido': 'Lido',
    
    // Rocket Pool variants
    'rocket-pool': 'Rocket Pool',
    'rocketpool': 'Rocket Pool',
    
    // Ether.fi variants
    'ether.fi-stake': 'Ether.fi',
    'ether.fi': 'Ether.fi',
    
    // Jito variants
    'jito-liquid-staking': 'Jito',
    'jito': 'Jito',
    
    // Yearn variants
    'yearn-finance': 'Yearn',
    'yearn': 'Yearn',
    
    // Convex variants
    'convex-finance': 'Convex',
    'convex': 'Convex',
    
    // GMX variants
    'gmx-v2-perps': 'GMX',
    'gmx': 'GMX',
    
    // Camelot variants
    'camelot-v2': 'Camelot',
    'camelot-v3': 'Camelot',
    'camelot': 'Camelot',
    
    // Venus variants
    'venus-core-pool': 'Venus',
    'venus': 'Venus',
    
    // Pendle variants
    'pendle': 'Pendle',
    
    // Raydium variants
    'raydium': 'Raydium',
    
    // Orca variants
    'orca': 'Orca',
    
    // Marinade variants
    'marinade': 'Marinade'
  };
  
  // Return mapped name or capitalize first letter of original
  return protocolNameMap[protocolName.toLowerCase()] || 
         protocolName.charAt(0).toUpperCase() + protocolName.slice(1).replace(/-/g, ' ');
};

// Main App Component
function App() {
  const [pools, setPools] = useState([]);
  const [filteredPools, setFilteredPools] = useState([]);
  const [selectedToken, setSelectedToken] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedChain, setSelectedChain] = useState('');
  const [selectedPoolTypes, setSelectedPoolTypes] = useState([]); // Changed to array for multi-select
  const [selectedProtocols, setSelectedProtocols] = useState([]); // New state for protocol filtering
  const [minTvl, setMinTvl] = useState(0);
  const [minApy, setMinApy] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first, then fall back to system preference
    const saved = localStorage.getItem('theme');
    if (saved) {
      return saved === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [error, setError] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showYieldCalculator, setShowYieldCalculator] = useState(false);
  const [selectedPool, setSelectedPool] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState(1000);
  const [dynamicProtocolUrls, setDynamicProtocolUrls] = useState({});
  const [animationsTriggered, setAnimationsTriggered] = useState(false);
  const [chainMode, setChainMode] = useState(false); // Track if we're in chain-first mode
  const [currentView, setCurrentView] = useState('search'); // 'search' or 'pool-detail'
  const [detailPool, setDetailPool] = useState(null); // Pool being viewed in detail

  const debouncedSearchInput = useDebounce(searchInput, 300);
  const itemsPerPage = 10;

  // URL parameter utilities
  const getUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const poolTypesParam = params.get('poolTypes');
    const protocolsParam = params.get('protocols');
    return {
      token: params.get('token') || '',
      chain: params.get('chain') || '',
      poolTypes: poolTypesParam ? poolTypesParam.split(',') : [],
      protocols: protocolsParam ? protocolsParam.split(',') : [],
      minTvl: parseInt(params.get('minTvl') || '0', 10),
      minApy: parseInt(params.get('minApy') || '0', 10),
      pool: params.get('pool') || ''
    };
  };

  const updateUrl = (token, chain, poolTypes, protocols, minTvl, minApy) => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (chain) params.set('chain', chain);
    if (poolTypes && poolTypes.length > 0) params.set('poolTypes', poolTypes.join(','));
    if (protocols && protocols.length > 0) params.set('protocols', protocols.join(','));
    if (minTvl > 0) params.set('minTvl', minTvl.toString());
    if (minApy > 0) params.set('minApy', minApy.toString());
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
    
    // Update page title - prioritize chain-first mode
    if (chain && chainMode && !token) {
      document.title = `${chain} DeFi Yields | DeFi Garden 🌱`;
    } else if (token) {
      document.title = `${token.toUpperCase()} Yields | DeFi Garden 🌱`;
    } else {
      document.title = 'DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains';
    }
  };

  // Initialize state from URL parameters on mount
  useEffect(() => {
    const urlParams = getUrlParams();
    
    // Check for chain-first mode (chain parameter without token)
    if (urlParams.chain && !urlParams.token) {
      setChainMode(true);
      setSelectedChain(urlParams.chain);
      setShowFilters(true);
      setMinTvl(100000); // Default to $100k TVL for chain mode as per PRD
      setShowAutocomplete(false);
      document.title = `${urlParams.chain} DeFi Yields | DeFi Garden 🌱`;
    } else if (urlParams.token) {
      setSelectedToken(urlParams.token);
      setSearchInput(urlParams.token);
      setShowFilters(true);
      setShowAutocomplete(false);
      document.title = `${urlParams.token.toUpperCase()} Yields | DeFi Garden 🌱`;
    }
    
    if (urlParams.chain) setSelectedChain(urlParams.chain);
    if (urlParams.poolTypes) setSelectedPoolTypes(urlParams.poolTypes);
    if (urlParams.protocols) setSelectedProtocols(urlParams.protocols.map(normalizeProtocolName));
    if (urlParams.minTvl) setMinTvl(urlParams.minTvl);
    if (urlParams.minApy) setMinApy(urlParams.minApy);
    
    // Mark initial load as complete after a brief delay
    setTimeout(() => setIsInitialLoad(false), 100);
    
    // Trigger entry animations immediately
    setTimeout(() => setAnimationsTriggered(true), 50);
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const poolParam = params.get('pool');
      
      // Check if we're navigating away from pool detail view
      if (!poolParam && currentView === 'pool-detail') {
        setCurrentView('search');
        setDetailPool(null);
      }
      
      const urlParams = getUrlParams();
      
      // Determine mode based on URL parameters
      if (urlParams.chain && !urlParams.token) {
        // Chain-first mode
        setChainMode(true);
        setSelectedToken('');
        setSearchInput('');
        setSelectedChain(urlParams.chain);
        setShowFilters(true);
        setMinTvl(urlParams.minTvl || 100000);
        document.title = `${urlParams.chain} DeFi Yields | DeFi Garden 🌱`;
      } else if (urlParams.token) {
        // Token-first mode
        setChainMode(false);
        setSelectedToken(urlParams.token);
        setSearchInput(urlParams.token);
        setSelectedChain(urlParams.chain);
        setShowFilters(true);
        document.title = `${urlParams.token.toUpperCase()} Yields | DeFi Garden 🌱`;
      } else {
        // Homepage
        setChainMode(false);
        setSelectedToken('');
        setSearchInput('');
        setSelectedChain('');
        setShowFilters(false);
        document.title = 'DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains';
      }
      
      setSelectedPoolTypes(urlParams.poolTypes);
      setSelectedProtocols(urlParams.protocols.map(normalizeProtocolName));
      setMinApy(urlParams.minApy);
      setShowAutocomplete(false);
      setHighlightedIndex(-1);
    };

    // Only add popstate listener, don't call handler on mount since initial URL parsing handles that
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  // Background fetch pools data after UI loads
  useEffect(() => {
    const fetchPoolsInBackground = async () => {
      try {
        setError('');
        const response = await fetch('https://yields.llama.fi/pools');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setPools(data.data || []);
      } catch (err) {
        setError('Failed to load yield data. Please try again later.');
        console.error('Error fetching pools:', err);
      } finally {
        setLoading(false);
      }
    };

    // Start loading data immediately in background
    setLoading(true);
    fetchPoolsInBackground();
  }, []);

  // Handle pool detail URL parameter after pools are loaded
  useEffect(() => {
    if (pools.length > 0 && !detailPool) {
      const urlParams = getUrlParams();
      if (urlParams.pool) {
        // Find the pool by ID
        const foundPool = pools.find(pool => 
          pool.pool === urlParams.pool || 
          `${pool.project}-${pool.symbol}-${pool.chain}` === decodeURIComponent(urlParams.pool)
        );
        
        if (foundPool) {
          setDetailPool(foundPool);
          setCurrentView('pool-detail');
          document.title = `${foundPool.symbol} on ${foundPool.project} | DeFi Garden 🌱`;
        }
      }
    }
  }, [pools, detailPool]);

  // Background fetch protocols data after UI loads
  useEffect(() => {
    const fetchProtocolsInBackground = async () => {
      try {
        // Check localStorage first (permanent caching)
        const cached = localStorage.getItem('defi-protocols');
        if (cached) {
          const protocolsData = JSON.parse(cached);
          setDynamicProtocolUrls(protocolsData);
          return;
        }

        // Fetch from API if not cached
        const response = await fetch('https://api.llama.fi/protocols');
        if (!response.ok) return; // Fail silently, use static fallback

        const protocols = await response.json();
        
        // Build URL mapping from protocols data
        const urlMapping = {};
        protocols.forEach(protocol => {
          if (protocol.name && protocol.url) {
            // Map by name (for matching with pool.project)
            const key = protocol.name.toLowerCase().replace(/\s+/g, '-');
            urlMapping[key] = protocol.url;
            
            // Also map by slug if available
            if (protocol.slug && protocol.slug !== key) {
              urlMapping[protocol.slug] = protocol.url;
            }
          }
        });

        // Cache permanently and update state
        localStorage.setItem('defi-protocols', JSON.stringify(urlMapping));
        setDynamicProtocolUrls(urlMapping);
      } catch (error) {
        // Fail silently - static PROTOCOL_URLS will be used as fallback
        console.log('Background protocol fetch failed, using static fallback');
      }
    };

    // Let UI render first, then fetch in background
    const timer = setTimeout(fetchProtocolsInBackground, 100);
    return () => clearTimeout(timer);
  }, []);

  // Theme management effect
  useEffect(() => {
    // Apply theme to document root
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    
    // Save theme preference to localStorage
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    // Update meta theme-color for mobile browsers
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', isDarkMode ? '#1F2121' : '#2D5A3D');
    }
  }, [isDarkMode]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      // Only update if user hasn't set a preference
      if (!localStorage.getItem('theme')) {
        setIsDarkMode(e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Toggle theme function
  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  // Get unique tokens for autocomplete with smart sorting
  const availableTokens = useMemo(() => {
    if (!pools || pools.length === 0) {
      return [];
    }

    const tokenSet = new Set();
    pools.forEach(pool => {
      if (pool.symbol) {
        // Handle multiple symbols separated by dash or other separators
        const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
        symbols.forEach(symbol => {
          if (symbol && symbol.length >= 2 && symbol.length < 20) { // Filter out single-character tokens
            tokenSet.add(symbol);
          }
        });
      }
    });
    
    const tokens = Array.from(tokenSet).sort();
    return tokens;
  }, [pools]);

  // Filter tokens for autocomplete with smart ordering, and handle natural language detection
  const autocompleteTokens = useMemo(() => {
    if (!debouncedSearchInput || debouncedSearchInput.length < 1) {
      return [];
    }
    
    const searchTerm = debouncedSearchInput.toUpperCase();
    
    // Check if this looks like a natural language query
    const isNaturalLanguage = debouncedSearchInput.split(' ').length > 1 || 
                               /\b(best|highest|top|yield|yields|lending|staking|farming|opportunities|on|for|eth|btc|usdc|base|arbitrum|polygon|aave|compound|uniswap|curve|morpho|euler|venus)\b/i.test(debouncedSearchInput);
    
    if (isNaturalLanguage) {
      // For natural language, try to parse and provide relevant suggestions
      const { token, chain, poolTypes, protocols } = parseNaturalLanguageQuery(debouncedSearchInput, availableTokens, allAvailableChains, availableProtocols?.all || []);
      
      // Return suggestions based on parsed results
      const suggestions = [];
      
      // Build descriptive suggestion showing what was parsed
      let parsedComponents = [];
      if (token) parsedComponents.push(token);
      if (protocols.length > 0) parsedComponents.push(`on ${protocols.join(', ')}`);
      if (chain) parsedComponents.push(`(${chain})`);
      if (poolTypes.length > 0) parsedComponents.push(`[${poolTypes.join(', ')}]`);
      
      if (parsedComponents.length > 0) {
        suggestions.push(parsedComponents.join(' '));
      }
      
      // Add the primary token if detected
      if (token && !suggestions.includes(token)) {
        suggestions.push(token);
      }
      
      // Add related tokens if a token is partially matched but not exactly found
      if (!token && availableTokens && availableTokens.length > 0) {
        availableTokens.forEach(t => {
          if (debouncedSearchInput.toLowerCase().includes(t.toLowerCase()) && t.length >= 2) {
            suggestions.push(t);
          }
        });
      }
      
      return suggestions.slice(0, 5); // Limit natural language suggestions
    }
    
    // Standard token autocomplete logic
    const exactMatches = [];
    const startsWith = [];
    const contains = [];
    
    availableTokens.forEach(token => {
      if (token === searchTerm) {
        exactMatches.push(token);
      } else if (token.startsWith(searchTerm)) {
        startsWith.push(token);
      } else if (token.includes(searchTerm)) {
        contains.push(token);
      }
    });
    
    // Return prioritized results: exact matches first, then starts with, then contains
    const results = [...exactMatches, ...startsWith, ...contains];
    return results;
  }, [availableTokens, debouncedSearchInput, allAvailableChains, availableProtocols]);

  // Get all available chains from all pools (for natural language parsing)
  const allAvailableChains = useMemo(() => {
    if (!pools || pools.length === 0) return [];
    
    const chainSet = new Set();
    pools.forEach(pool => {
      if (pool.chain && pool.tvlUsd > 0) {
        chainSet.add(pool.chain);
      }
    });
    
    return Array.from(chainSet).sort();
  }, [pools]);

  // Get available chains sorted by TVL
  const availableChains = useMemo(() => {
    if (chainMode && pools.length > 0) {
      // In chain mode, show all available chains from the full pool dataset
      const chainTVL = {};
      pools.forEach(pool => {
        if (pool.chain && pool.tvlUsd > 0) {
          if (!chainTVL[pool.chain]) {
            chainTVL[pool.chain] = 0;
          }
          chainTVL[pool.chain] += pool.tvlUsd;
        }
      });
      
      // Sort chains by TVL descending
      return Object.entries(chainTVL)
        .sort(([,a], [,b]) => b - a)
        .map(([chain]) => chain);
        
    } else if (selectedToken && pools.length > 0) {
      // In token mode, show chains available for the selected token, sorted by TVL
      const chainTVL = {};
      
      pools.forEach(pool => {
        if (!pool.symbol || !pool.chain) return;
        
        // Check if any symbol in the pool matches the selected token
        const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
        const hasToken = symbols.some(symbol => symbol === selectedToken.toUpperCase());
        
        if (hasToken && pool.tvlUsd > 0) {
          if (!chainTVL[pool.chain]) {
            chainTVL[pool.chain] = 0;
          }
          chainTVL[pool.chain] += pool.tvlUsd;
        }
      });
      
      // Sort chains by TVL descending
      return Object.entries(chainTVL)
        .sort(([,a], [,b]) => b - a)
        .map(([chain]) => chain);
    }
    return [];
  }, [selectedToken, pools, chainMode]);


  // Get available protocols for selected token or chain (dynamically from current pools)
  const availableProtocols = useMemo(() => {
    if (!pools.length) return { popular: [], all: [] };
    
    const protocolStats = {};
    
    pools.forEach(pool => {
      if (!pool.project || !pool.tvlUsd || pool.tvlUsd <= 0) return;
      
      let includePool = false;
      
      // Chain mode: include pools on selected chain
      if (chainMode && selectedChain && !selectedToken) {
        includePool = pool.chain === selectedChain;
      }
      // Token mode: include pools with selected token
      else if (selectedToken && pool.symbol) {
        const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
        includePool = symbols.some(symbol => symbol === selectedToken.toUpperCase());
        
        // Also check chain filter if both token and chain are selected
        if (includePool && selectedChain) {
          includePool = pool.chain === selectedChain;
        }
      }
      
      if (includePool) {
        // Get friendly name and group protocols with same friendly name
        const friendlyName = getFriendlyProtocolName(pool.project);
        
        if (!protocolStats[friendlyName]) {
          protocolStats[friendlyName] = {
            friendlyName: friendlyName,
            originalNames: new Set([pool.project]), // Keep track of original names for filtering
            poolCount: 0,
            totalTvl: 0
          };
        } else {
          protocolStats[friendlyName].originalNames.add(pool.project);
        }
        
        protocolStats[friendlyName].poolCount++;
        protocolStats[friendlyName].totalTvl += pool.tvlUsd;
      }
    });
    
    // Convert originalNames Set to Array and sort protocols by TVL descending
    const allProtocols = Object.values(protocolStats)
      .map(protocol => ({
        ...protocol,
        originalNames: Array.from(protocol.originalNames)
      }))
      .sort((a, b) => b.totalTvl - a.totalTvl);
    
    // Get top 5 as "popular"
    const popular = allProtocols.slice(0, 5);
    
    return {
      popular,
      all: allProtocols
    };
  }, [selectedToken, selectedChain, chainMode, pools]);

  // Get pool type counts for selected token or chain (before other filters)
  const poolTypeCounts = useMemo(() => {
    if (!pools.length) return {};
    
    const counts = { 'All': 0, 'Lending': 0, 'LP/DEX': 0, 'Staking': 0, 'Yield Farming': 0 };
    
    pools.forEach(pool => {
      // Chain mode: count all pools on selected chain
      if (chainMode && selectedChain && !selectedToken) {
        if (pool.chain === selectedChain && pool.tvlUsd > 0) {
          const poolType = getPoolType(pool);
          counts[poolType]++;
          counts['All']++;
        }
        return;
      }
      
      // Token mode: count pools with selected token
      if (selectedToken && pool.symbol) {
        const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
        const hasToken = symbols.some(symbol => symbol === selectedToken.toUpperCase());
        
        if (hasToken && pool.tvlUsd > 0) {
          const poolType = getPoolType(pool);
          counts[poolType]++;
          counts['All']++;
        }
      }
    });
    
    return counts;
  }, [selectedToken, selectedChain, chainMode, pools]);

  // Filter and sort pools when token, chain, TVL, or APY selection changes
  useEffect(() => {
    console.log('Filter effect running - currentView:', currentView, 'selectedToken:', selectedToken, 'chainMode:', chainMode, 'selectedChain:', selectedChain);
    
    // Don't run filtering logic when in pool detail view
    if (currentView === 'pool-detail') {
      console.log('Skipping filter effect - in pool detail view');
      return;
    }
    
    // Chain-first mode: filter by chain only
    if (chainMode && selectedChain && !selectedToken) {
      let filtered = pools.filter(pool => {
        // Filter by selected chain
        const chainMatch = pool.chain === selectedChain;
        
        // Filter by pool type if selected
        const poolTypeMatch = selectedPoolTypes.length === 0 || selectedPoolTypes.includes(getPoolType(pool));
        
        // Filter by protocol if selected (check against friendly names)
        const protocolMatch = selectedProtocols.length === 0 || 
          selectedProtocols.some(selectedProtocol => {
            // Method 1: Find the protocol object with matching friendly name (case insensitive)
            const protocolObj = availableProtocols?.all?.find(p => 
              p?.friendlyName?.toLowerCase() === selectedProtocol?.toLowerCase()
            );
            if (protocolObj && protocolObj.originalNames.includes(pool.project)) {
              return true;
            }
            
            // Method 2: Direct fallback - check if pool project name contains the selected protocol
            const projectLower = pool.project?.toLowerCase() || '';
            const protocolLower = selectedProtocol?.toLowerCase() || '';
            return projectLower.includes(protocolLower) || projectLower.includes(protocolLower.replace(/\s+/g, '-'));
          });
        
        // Filter by minimum TVL
        const tvlMatch = pool.tvlUsd >= minTvl;
        
        // Filter by minimum APY
        const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
        const apyMatch = totalApy >= minApy;
        
        return chainMatch && poolTypeMatch && protocolMatch && tvlMatch && apyMatch && pool.tvlUsd > 0;
      });

      // Sort by total APY (base + reward) descending
      filtered.sort((a, b) => {
        const apyA = (a.apyBase || 0) + (a.apyReward || 0);
        const apyB = (b.apyBase || 0) + (b.apyReward || 0);
        return apyB - apyA;
      });

      setFilteredPools(filtered);
      setCurrentPage(1);
      return;
    }

    // Token-first mode: existing logic
    if (!selectedToken) {
      setFilteredPools([]);
      return;
    }

    let filtered = pools.filter(pool => {
      if (!pool.symbol) return false;
      
      // Check if any symbol in the pool matches the selected token
      const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
      const hasToken = symbols.some(symbol => symbol === selectedToken.toUpperCase());
      
      // Filter by chain if selected
      const chainMatch = !selectedChain || pool.chain === selectedChain;
      
      // Filter by pool type if selected
      const poolTypeMatch = selectedPoolTypes.length === 0 || selectedPoolTypes.includes(getPoolType(pool));
      
      // Filter by protocol if selected (check against friendly names)
      const protocolMatch = selectedProtocols.length === 0 || 
        selectedProtocols.some(selectedProtocol => {
          // Method 1: Find the protocol object with matching friendly name (case insensitive)
          const protocolObj = availableProtocols?.all?.find(p => 
            p?.friendlyName?.toLowerCase() === selectedProtocol?.toLowerCase()
          );
          if (protocolObj && protocolObj.originalNames.includes(pool.project)) {
            return true;
          }
          
          // Method 2: Direct fallback - check if pool project name contains the selected protocol
          const projectLower = pool.project?.toLowerCase() || '';
          const protocolLower = selectedProtocol?.toLowerCase() || '';
          return projectLower.includes(protocolLower) || projectLower.includes(protocolLower.replace(/\s+/g, '-'));
        });
      
      // Filter by minimum TVL
      const tvlMatch = pool.tvlUsd >= minTvl;
      
      // Filter by minimum APY
      const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
      const apyMatch = totalApy >= minApy;
      
      return hasToken && chainMatch && poolTypeMatch && protocolMatch && tvlMatch && apyMatch && pool.tvlUsd > 0;
    });

    // Sort by total APY (base + reward) descending
    filtered.sort((a, b) => {
      const apyA = (a.apyBase || 0) + (a.apyReward || 0);
      const apyB = (b.apyBase || 0) + (b.apyReward || 0);
      return apyB - apyA;
    });

    setFilteredPools(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [selectedToken, selectedChain, selectedPoolTypes, selectedProtocols, minTvl, minApy, pools, chainMode]);

  // Update URL when filters change (but not during initial load, popstate events, or pool detail view)
  useEffect(() => {
    if (!isInitialLoad && currentView !== 'pool-detail') {
      if (chainMode && selectedChain && !selectedToken) {
        // Chain-first mode URL updates
        updateUrl('', selectedChain, selectedPoolTypes, selectedProtocols, minTvl, minApy);
      } else if (selectedToken) {
        // Token-first mode URL updates
        updateUrl(selectedToken, selectedChain, selectedPoolTypes, selectedProtocols, minTvl, minApy);
      }
    }
  }, [selectedToken, selectedChain, selectedPoolTypes, selectedProtocols, minTvl, minApy, isInitialLoad, chainMode, currentView]);
  // Handle chain selection for chain-first mode
  const handleChainSelect = (chainName) => {
    setChainMode(true);
    setSelectedChain(chainName);
    setSelectedToken(''); // Clear token selection
    setSearchInput(''); // Clear search input
    setShowFilters(true);
    setMinTvl(100000); // Default to $100k TVL for chain mode
    setShowAutocomplete(false);
    
    // Analytics tracking for chain selection
    if (typeof gtag !== 'undefined') {
      gtag('event', 'chain_selected', {
        'event_category': 'engagement',
        'event_label': chainName,
        'custom_parameter': 'chain_discovery_mode'
      });
    }
    
    // Update URL for chain-first mode
    updateUrl('', chainName, selectedPoolTypes, selectedProtocols, 100000, minApy);
    
    // Scroll to results on mobile
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      setTimeout(() => {
        const resultsSection = document.querySelector('.results-section');
        if (resultsSection) {
          resultsSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          });
        }
      }, 100);
    }
  };


  // Handle token selection
  const handleTokenSelect = (token) => {
    setChainMode(false); // Switch to token-first mode
    setSelectedToken(token);
    setSearchInput(token);
    setShowAutocomplete(false);
    setShowFilters(true); // Show filters after token selection
    setHighlightedIndex(-1);
    
    // Reset TVL to default for token mode
    if (minTvl === 100000) {
      setMinTvl(0);
    }
    
    // Close mobile keyboard by blurring the input
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
      searchInput.blur();
    }
    
    // Scroll to results section only on mobile viewports (not desktop)
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      setTimeout(() => {
        const resultsSection = document.querySelector('.results-section');
        if (resultsSection) {
          resultsSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          });
        }
      }, 100);
    }
    
    // URL will be updated by the useEffect
  };

  // Handle search input changes
  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    
    // Clear selected token if input doesn't match
    if (value !== selectedToken) {
      setSelectedToken('');
      setFilteredPools([]);
      setSelectedChain('');
      setSelectedPoolTypes([]);
      setSelectedProtocols([]);
      setShowFilters(false);
    }
    
    // Show autocomplete if there's input
    setShowAutocomplete(value.length > 0);
    setHighlightedIndex(-1);
  };

  // Handle input focus
  const handleInputFocus = () => {
    // Only show autocomplete if there's input AND no token is selected (user is searching)
    if (searchInput.length > 0 && !selectedToken) {
      setShowAutocomplete(true);
    }
  };

  // Handle input blur to close autocomplete
  const handleInputBlur = () => {
    // Delay hiding to allow for clicks on autocomplete items
    setTimeout(() => {
      setShowAutocomplete(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  // Handle keyboard navigation in autocomplete and natural language parsing on Enter
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && showAutocomplete && autocompleteTokens.length > 0) {
        // If an autocomplete suggestion is highlighted, select it
        handleTokenSelect(autocompleteTokens[highlightedIndex]);
      } else {
        // Otherwise, attempt to parse natural language
        const query = searchInput.trim();
        if (query) {
          const { token, chain, poolTypes, protocols } = parseNaturalLanguageQuery(query, availableTokens, allAvailableChains, availableProtocols?.all || []);

          // Apply filters based on natural language parsing
          // Prioritize natural language over current state if found
          if (token) setSelectedToken(token);
          if (chain) setSelectedChain(chain);
          if (poolTypes.length > 0) setSelectedPoolTypes(poolTypes);
          if (protocols.length > 0) setSelectedProtocols(protocols.map(normalizeProtocolName));

          // Set chain mode if chain is detected and no token is specified, or if chain is dominant
          // If token is found, it's token-first mode.
          // If chain is found and no token, it's chain-first mode.
          if (chain && !token) {
            setChainMode(true);
            setMinTvl(100000); // Default TVL for chain-first mode
          } else {
            setChainMode(false);
          }
          
          setShowFilters(true); // Always show filters after a search
          setShowAutocomplete(false);
          setHighlightedIndex(-1);
          
          // Update URL immediately after parsing and setting state
          // The useEffect that listens to state changes will then push the URL
        }
      }
    } else if (showAutocomplete && autocompleteTokens.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => 
            prev < autocompleteTokens.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Escape':
          setShowAutocomplete(false);
          setHighlightedIndex(-1);
          break;
      }
    }
  };

  // Reset application state
  const resetApp = () => {
    setSelectedToken('');
    setSearchInput('');
    setSelectedChain('');
    setSelectedPoolTypes([]);
    setSelectedProtocols([]);
    setMinTvl(0);
    setMinApy(0);
    setFilteredPools([]);
    setCurrentPage(1);
    setShowAutocomplete(false);
    setShowFilters(false);
    setHighlightedIndex(-1);
    setError('');
    setChainMode(false);
    setCurrentView('search');
    setDetailPool(null);
    
    // Clear URL parameters and reset title
    window.history.pushState({}, '', window.location.pathname);
    document.title = 'DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains';
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (amount >= 1e9) {
      return `$${(amount / 1e9).toFixed(1)}B`;
    } else if (amount >= 1e6) {
      return `$${(amount / 1e6).toFixed(1)}M`;
    } else if (amount >= 1e3) {
      return `$${(amount / 1e3).toFixed(1)}K`;
    } else {
      return `$${amount?.toFixed(0) || '0'}`;
    }
  };

  // Format APY
  const formatAPY = (apyBase, apyReward) => {
    const total = (apyBase || 0) + (apyReward || 0);
    return `${total.toFixed(2)}%`;
  };

  // Get protocol URL with smart URL detection
  const getProtocolUrl = (pool) => {
    // First, try to use the pool URL from the API
    if (pool.url && pool.url.startsWith('http')) {
      return pool.url;
    }
    
    // Enhanced URL resolution with dynamic data
    if (!pool.project) return null;
    const key = pool.project.toLowerCase().replace(/\s+/g, '-');
    
    // Try dynamic protocol URLs first, then fallback to static
    return dynamicProtocolUrls[key] || 
           dynamicProtocolUrls[pool.project] || 
           PROTOCOL_URLS[key] || 
           null;
  };

  // Add referral parameter to protocol URL
  const getProtocolUrlWithRef = (pool) => {
    const baseUrl = getProtocolUrl(pool);
    if (!baseUrl) return null;
    
    try {
      const url = new URL(baseUrl);
      url.searchParams.set('ref', 'defi.garden');
      return url.toString();
    } catch (error) {
      // If URL parsing fails, return original URL
      return baseUrl;
    }
  };

  // Get paginated results
  const paginatedPools = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPools.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPools, currentPage]);

  const totalPages = Math.ceil(filteredPools.length / itemsPerPage);

  // Handle pool click to navigate to pool detail page
  const handlePoolClick = (pool, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('handlePoolClick called for:', pool.symbol);
    // Set the pool for detail view
    setDetailPool(pool);
    setCurrentView('pool-detail');
    console.log('Set currentView to pool-detail, detailPool to:', pool.symbol);
    
    // Update URL to include pool identifier
    const poolId = encodeURIComponent(pool.pool || `${pool.project}-${pool.symbol}-${pool.chain}`);
    const params = new URLSearchParams(window.location.search);
    params.set('pool', poolId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', newUrl);
    
    // Update page title
    document.title = `${pool.symbol} on ${pool.project} | DeFi Garden 🌱`;
    
    // Scroll to top
    window.scrollTo(0, 0);
  };

  // Handle navigation back from pool detail view
  const handleBackFromDetail = () => {
    setCurrentView('search');
    setDetailPool(null);
    
    // Remove pool parameter from URL
    const params = new URLSearchParams(window.location.search);
    params.delete('pool');
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
    
    // Restore previous title
    if (chainMode && selectedChain && !selectedToken) {
      document.title = `${selectedChain} DeFi Yields | DeFi Garden 🌱`;
    } else if (selectedToken) {
      document.title = `${selectedToken.toUpperCase()} Yields | DeFi Garden 🌱`;
    } else {
      document.title = 'DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains';
    }
  };

  // Handle yield calculator
  const handleCalculateYield = (pool, e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPool(pool);
    setShowYieldCalculator(true);
  };

  // Handle pool type selection (multi-select)
  const handlePoolTypeToggle = (poolType) => {
    setSelectedPoolTypes(prev => {
      if (prev.includes(poolType)) {
        return prev.filter(type => type !== poolType);
      } else {
        return [...prev, poolType];
      }
    });
  };

  // Handle protocol selection (multi-select)
  const handleProtocolToggle = (protocolFriendlyName) => {
    setSelectedProtocols(prev => {
      if (prev.includes(protocolFriendlyName)) {
        return prev.filter(p => p !== protocolFriendlyName);
      } else {
        return [...prev, protocolFriendlyName];
      }
    });
  };

  // Handle popular protocols selection (replaces current selection)
  const handlePopularProtocols = () => {
    const popularProtocolNames = availableProtocols.popular.map(p => p.friendlyName);
    setSelectedProtocols(popularProtocolNames);
  };

  // Handle TVL selection
  const handleTvlSelect = (tvlValue) => {
    setMinTvl(tvlValue);
  };

  // Handle APY selection
  const handleApySelect = (apyValue) => {
    setMinApy(apyValue);
  };

  // Calculate yields without compounding (simple interest)
  const calculateYields = (amount, apyPercent) => {
    const dailyRate = apyPercent / 365 / 100;
    const weeklyRate = apyPercent / 52.14 / 100; // More accurate weekly calculation
    
    return {
      oneDayGain: amount * dailyRate,
      oneWeekGain: amount * weeklyRate,
      dailyRate: dailyRate * 100,
      weeklyRate: weeklyRate * 100
    };
  };

  // Quick preview calculation for card display
  const getQuickPreview = (pool) => {
    const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
    const dailyRate = totalApy / 365 / 100;
    const dailyEarnings1k = 1000 * dailyRate; // Default $1000 preview
    return {
      dailyEarnings: dailyEarnings1k,
      previewAmount: 1000
    };
  };

  // Always render UI immediately - no blocking loading state

  // Add debug logging for pool detail view state
  console.log('App render - currentView:', currentView, 'detailPool:', detailPool ? detailPool.symbol : 'null');
  
  // Add a timer to check state after component should disappear
  if (currentView === 'pool-detail' && detailPool) {
    setTimeout(() => {
      console.log('After 2 seconds - currentView:', currentView, 'detailPool:', detailPool ? detailPool.symbol : 'null');
    }, 2000);
  }

  // Render Pool Detail View if active
  if (currentView === 'pool-detail' && detailPool) {
    console.log('Rendering pool detail view for:', detailPool.symbol);
    return React.createElement('div', { className: 'app pool-detail-view' },
      // Theme Toggle
      React.createElement('button', {
        className: 'theme-toggle',
        'data-theme': isDarkMode ? 'dark' : 'light',
        onClick: toggleTheme,
        'aria-label': `Switch to ${isDarkMode ? 'light' : 'dark'} mode`
      },
        React.createElement('div', { className: 'theme-toggle-icon' },
          isDarkMode ? '☀️' : '🌙'
        ),
        React.createElement('div', { className: 'theme-toggle-switch' },
          React.createElement('div', { className: 'theme-toggle-handle' })
        ),
        React.createElement('div', { className: 'theme-toggle-text' },
          isDarkMode ? 'Light' : 'Dark'
        )
      ),
      
      React.createElement('div', { className: 'container' },
        React.createElement(PoolDetail, {
          pool: detailPool,
          onBack: handleBackFromDetail,
          resetApp: resetApp,
          calculateYields: calculateYields,
          formatCurrency: formatCurrency,
          formatAPY: formatAPY,
          getProtocolUrl: getProtocolUrl,
          getProtocolUrlWithRef: getProtocolUrlWithRef,
          isDarkMode: isDarkMode
        })
      ),
      
      // Footer
      React.createElement('footer', { className: 'app-footer' },
        React.createElement('p', null,
          'Powered by ',
          React.createElement('a', {
            href: 'https://api-docs.defillama.com/',
            target: '_blank',
            rel: 'noopener noreferrer'
          }, 'Defillama API'),
          '. Made with AI & Degen Love.'
        )
      )
    );
  }

  return React.createElement('div', { 
    className: `app ${(selectedToken || (chainMode && selectedChain)) ? 'has-results' : ''}` 
  },
    // Theme Toggle
    React.createElement('button', {
      className: 'theme-toggle',
      'data-theme': isDarkMode ? 'dark' : 'light',
      onClick: toggleTheme,
      'aria-label': `Switch to ${isDarkMode ? 'light' : 'dark'} mode`
    },
      React.createElement('div', { className: 'theme-toggle-icon' },
        isDarkMode ? '☀️' : '🌙'
      ),
      React.createElement('div', { className: 'theme-toggle-switch' },
        React.createElement('div', { className: 'theme-toggle-handle' })
      ),
      React.createElement('div', { className: 'theme-toggle-text' },
        isDarkMode ? 'Light' : 'Dark'
      )
    ),
    React.createElement('div', { className: 'container' },
      // Header
      React.createElement('div', { 
        className: `header animate-on-mount`
      },
        
        React.createElement('h1', { 
          className: 'logo', 
          onClick: resetApp
        }, 'DeFi Garden'),
        React.createElement('p', { className: 'subtitle' }, 
          'Find the best yields for your tokens across all chains'
        )
      ),



      // Search Section - hide when in filtered state (both token and chain mode)
      !(selectedToken || (chainMode && selectedChain)) && React.createElement('div', { className: 'search-section animate-on-mount' },
        React.createElement('div', { className: 'search-container' },
          React.createElement('input', {
            type: 'text',
            className: 'search-input',
            placeholder: 'Search for a token...',
            value: searchInput,
            onChange: handleSearchInputChange,
            onKeyDown: handleKeyDown,
            onFocus: handleInputFocus,
            onBlur: handleInputBlur,
            autoFocus: true
          }),
          
          // Autocomplete Dropdown
          showAutocomplete && autocompleteTokens.length > 0 && 
            React.createElement('div', { className: 'autocomplete-dropdown' },
              autocompleteTokens.map((token, index) => 
                React.createElement('div', {
                  key: token,
                  className: `autocomplete-item ${index === highlightedIndex ? 'highlighted' : ''}`,
                  onMouseDown: (e) => {
                    e.preventDefault(); // Prevent input blur
                    handleTokenSelect(token);
                  }
                }, token)
              )
            ),

          // Two-Button Interface - show when no token is selected and not in chain mode
          !selectedToken && !chainMode && React.createElement('div', { className: 'search-buttons' },
            React.createElement('button', {
              className: `search-button token-search ${searchInput.length === 0 ? 'disabled' : ''}`,
              onClick: () => {
                if (searchInput.length > 0 && autocompleteTokens.length > 0) {
                  handleTokenSelect(autocompleteTokens[0]);
                }
              },
              disabled: searchInput.length === 0
            }, 
              React.createElement('span', { className: 'button-icon' }, '🔍'),
              React.createElement('span', { className: 'button-text' }, 'Token Search')
            ),
            React.createElement('button', {
              className: 'search-button feeling-degen',
              onClick: () => {
                handleChainSelect('Ethereum');
              }
            },
              React.createElement('span', { className: 'button-icon' }, '🚀'),
              React.createElement('span', { className: 'button-text' }, 'I\'m Feeling Degen')
            )
          )
        )
      ),

      // Error State
      error && React.createElement('div', { className: 'error-state' },
        React.createElement('div', { className: 'error-message' }, error)
      ),

      // Improved Horizontal Scrolling Filters Section
      showFilters && (selectedToken || chainMode) && React.createElement('div', { className: 'filters-section animate-on-mount' },
        React.createElement('div', { className: 'filters-container' },
          
          // Chain Pills Filter - Single Horizontal Row
          availableChains.length > 1 && React.createElement('div', { className: 'filter-section' },
            React.createElement('div', { className: 'filter-section-header' },
              React.createElement('label', { className: 'filter-label' }, 'Chains')
            ),
            React.createElement('div', { className: 'filter-row' },
              React.createElement('div', { className: 'filter-pills-container' },
                React.createElement('button', {
                  className: `filter-pill chain-pill ${!selectedChain ? 'active' : ''}`,
                  onClick: () => setSelectedChain('')
                }, 'All Chains'),
                availableChains.map(chain => 
                  React.createElement('button', {
                    key: chain,
                    className: `filter-pill chain-pill ${selectedChain === chain ? 'active' : ''}`,
                    onClick: () => setSelectedChain(chain),
                    style: {
                      '--chain-color': getChainColor(chain)
                    }
                  }, chain)
                )
              )
            )
          ),

          // Protocols Filter Row - only show when protocols are available
          availableProtocols.all.length > 0 && React.createElement('div', { className: 'filter-section' },
            React.createElement('div', { className: 'filter-section-header' },
              React.createElement('label', { className: 'filter-label' }, 'Protocols')
            ),
            React.createElement('div', { className: 'filter-row' },
              React.createElement('div', { className: 'filter-pills-container' },
                // Popular button
                availableProtocols.popular.length > 0 && React.createElement('button', {
                  className: `filter-pill protocol-pill popular ${
                    availableProtocols.popular.every(p => selectedProtocols.includes(p.friendlyName)) &&
                    selectedProtocols.length === availableProtocols.popular.length ? 'active' : ''
                  }`,
                  onClick: handlePopularProtocols
                }, 'Popular'),
                
                // All protocols button
                React.createElement('button', {
                  className: `filter-pill protocol-pill ${selectedProtocols.length === 0 ? 'active' : ''}`,
                  onClick: () => setSelectedProtocols([])
                }, 'All Protocols'),
                
                // Individual protocol pills (show top 10 to avoid overcrowding)
                availableProtocols.all.slice(0, 10).map(protocol => 
                  React.createElement('button', {
                    key: protocol.friendlyName,
                    className: `filter-pill protocol-pill ${selectedProtocols.includes(protocol.friendlyName) ? 'active' : ''}`,
                    onClick: () => handleProtocolToggle(protocol.friendlyName)
                  }, 
                    protocol.friendlyName,
                    React.createElement('span', { className: 'pill-count' }, `(${protocol.poolCount})`)
                  )
                )
              )
            )
          ),

          // Pool Type Buttons - Single Horizontal Row
          React.createElement('div', { className: 'filter-section' },
            React.createElement('div', { className: 'filter-section-header' },
              React.createElement('label', { className: 'filter-label' }, 'Pool Types')
            ),
            React.createElement('div', { className: 'filter-row' },
              React.createElement('div', { className: 'filter-buttons-group' },
                ['Lending', 'LP/DEX', 'Staking', 'Yield Farming'].map(poolType =>
                  React.createElement('button', {
                    key: poolType,
                    className: `filter-button pool-type-button ${selectedPoolTypes.includes(poolType) ? 'active' : ''}`,
                    onClick: () => handlePoolTypeToggle(poolType)
                  },
                    poolType,
                    poolTypeCounts[poolType] ? React.createElement('span', { className: 'count' }, `(${poolTypeCounts[poolType]})`) : null
                  )
                )
              )
            )
          ),

          // TVL Filter Row
          React.createElement('div', { className: 'filter-section' },
            React.createElement('div', { className: 'filter-section-header' },
              React.createElement('label', { className: 'filter-label' }, 'Minimum TVL')
            ),
            React.createElement('div', { className: 'filter-row' },
              React.createElement('div', { className: 'filter-chips-container' },
                [
                  { value: 0, label: 'No Min' },
                  { value: 10000, label: '$10K+' },
                  { value: 100000, label: '$100K+' },
                  { value: 1000000, label: '$1M+' },
                  { value: 10000000, label: '$10M+' }
                ].map(tvl =>
                  React.createElement('button', {
                    key: tvl.value,
                    className: `filter-chip tvl-chip ${minTvl === tvl.value ? 'active' : ''}`,
                    onClick: () => handleTvlSelect(tvl.value)
                  }, tvl.label)
                )
              )
            )
          ),

          // APY Filter Row
          React.createElement('div', { className: 'filter-section' },
            React.createElement('div', { className: 'filter-section-header' },
              React.createElement('label', { className: 'filter-label' }, 'Minimum APY')
            ),
            React.createElement('div', { className: 'filter-row' },
              React.createElement('div', { className: 'filter-chips-container' },
                [
                  { value: 0, label: 'No Min' },
                  { value: 1, label: '1%+' },
                  { value: 5, label: '5%+' },
                  { value: 10, label: '10%+' },
                  { value: 20, label: '20%+' }
                ].map(apy =>
                  React.createElement('button', {
                    key: apy.value,
                    className: `filter-chip apy-chip ${minApy === apy.value ? 'active' : ''}`,
                    onClick: () => handleApySelect(apy.value)
                  }, apy.label)
                )
              )
            )
          )
        )
      ),

      // Results Section - show for both token mode and chain mode
      (selectedToken || (chainMode && selectedChain)) && React.createElement('div', { className: 'results-section animate-on-mount' },
        filteredPools.length > 0 ? [
          React.createElement('div', { className: 'results-header', key: 'header' },
            React.createElement('h2', { className: 'results-title' },
              chainMode && selectedChain && !selectedToken
                ? `${selectedChain} DeFi Yields`
                : `Yields for ${selectedToken}${selectedChain ? ` on ${selectedChain}` : ''}`
            ),
            React.createElement('div', { className: 'results-count' },
              `${filteredPools.length} pool${filteredPools.length !== 1 ? 's' : ''} found`
            )
          ),

          React.createElement('div', { className: 'pools-grid', key: 'pools' },
            paginatedPools.map((pool, index) => {
              const protocolUrl = getProtocolUrl(pool);
              const quickPreview = getQuickPreview(pool);
              return React.createElement('div', {
                key: `${pool.pool}-${index}`,
                className: `pool-card animate-on-mount clickable`,
                onClick: (e) => handlePoolClick(pool, e)
              },
                // Header: Symbol + Protocol info + APY
                React.createElement('div', { className: 'pool-header-new' },
                  React.createElement('div', { className: 'pool-left-section' },
                    React.createElement('div', { className: 'pool-symbol' },
                      pool.symbol
                    ),
                    React.createElement('div', { className: 'pool-context-inline' },
                      `on ${pool.project} • ${pool.chain}${protocolUrl ? ' ↗' : ''}`
                    )
                  ),
                  React.createElement('div', { className: 'pool-apy-section' },
                    React.createElement('div', { className: 'pool-apy-hero' },
                      formatAPY(pool.apyBase, pool.apyReward)
                    ),
                    React.createElement('div', { className: 'pool-apy-preview' },
                      `$${quickPreview.dailyEarnings.toFixed(2)}/day`
                    )
                  )
                ),
                
                // TVL prominent display 
                React.createElement('div', { className: 'pool-tvl-section' },
                  React.createElement('div', { className: 'tvl-label' }, 'TVL'),
                  React.createElement('div', { className: 'tvl-value' },
                    formatCurrency(pool.tvlUsd)
                  )
                ),
                
                // Progressive disclosure for APY breakdown (only show when BOTH Base and Reward APY exist)
                (pool.apyBase > 0 && pool.apyReward > 0) && React.createElement('div', { className: 'pool-details-expanded' },
                  pool.apyBase > 0 && React.createElement('div', { className: 'apy-breakdown' },
                    React.createElement('span', { className: 'breakdown-label' }, 'Base APY:'),
                    React.createElement('span', { className: 'breakdown-value' }, `${pool.apyBase.toFixed(2)}%`)
                  ),
                  pool.apyReward > 0 && React.createElement('div', { className: 'apy-breakdown' },
                    React.createElement('span', { className: 'breakdown-label' }, 'Reward APY:'),
                    React.createElement('span', { className: 'breakdown-value' }, `${pool.apyReward.toFixed(2)}%`)
                  )
                ),
                
                // Primary CTA - Calculate Yield (full width, prominent)
                React.createElement('div', { className: 'pool-cta-section' },
                  React.createElement('button', {
                    className: 'calculate-yield-btn-new',
                    onClick: (e) => handleCalculateYield(pool, e)
                  }, 'Calculate Yield')
                )
              );
            })
          ),

          // Pagination
          totalPages > 1 && React.createElement('div', { className: 'pagination animate-on-mount', key: 'pagination' },
            React.createElement('button', {
              className: 'pagination-button',
              onClick: () => setCurrentPage(prev => Math.max(1, prev - 1)),
              disabled: currentPage === 1
            }, 'Previous'),
            
            React.createElement('div', { className: 'pagination-info' },
              `Page ${currentPage} of ${totalPages}`
            ),
            
            React.createElement('button', {
              className: 'pagination-button',
              onClick: () => setCurrentPage(prev => Math.min(totalPages, prev + 1)),
              disabled: currentPage === totalPages
            }, 'Next')
          )
        ] : React.createElement('div', { className: 'empty-state' },
          React.createElement('div', { className: 'empty-message' }, 
            chainMode && selectedChain && !selectedToken
              ? `No yields found on ${selectedChain} with current filters`
              : `No yields found for ${selectedToken}`
          ),
          React.createElement('div', { className: 'empty-submessage' },
            chainMode && selectedChain && !selectedToken
              ? 'Try adjusting your TVL or APY filters, or select a different chain'
              : 'Try adjusting your filters or searching for a different token'
          ),
          React.createElement('button', {
            className: 'reset-filters-btn',
            onClick: resetApp
          }, 'Reset Filters')
        )
      ),

      // Yield Calculator Modal
      showYieldCalculator && selectedPool && React.createElement('div', { 
        className: 'modal-overlay',
        onClick: (e) => {
          if (e.target === e.currentTarget) {
            setShowYieldCalculator(false);
          }
        }
      },
        React.createElement('div', { className: 'yield-calculator-modal' },
          React.createElement('div', { className: 'modal-header' },
            React.createElement('h3', { className: 'modal-title' }, 'Yield Calculator'),
            React.createElement('button', {
              className: 'modal-close',
              onClick: () => setShowYieldCalculator(false)
            }, '×')
          ),

          React.createElement('div', { className: 'modal-content' },
            React.createElement('div', { className: 'pool-info' },
              React.createElement('div', { className: 'pool-info-item' },
                React.createElement('span', { className: 'label' }, 'Protocol:'),
                React.createElement('span', { className: 'value' }, selectedPool.project)
              ),
              React.createElement('div', { className: 'pool-info-item' },
                React.createElement('span', { className: 'label' }, 'Token/Pair:'),
                React.createElement('span', { className: 'value token-pair' }, selectedPool.symbol)
              ),
              React.createElement('div', { className: 'pool-info-item' },
                React.createElement('span', { className: 'label' }, 'APY:'),
                React.createElement('span', { className: 'value apy' }, 
                  formatAPY(selectedPool.apyBase, selectedPool.apyReward)
                )
              ),
              React.createElement('div', { className: 'pool-info-item' },
                React.createElement('span', { className: 'label' }, 'Chain:'),
                React.createElement('span', { className: 'value' }, selectedPool.chain)
              )
            ),

            React.createElement('div', { className: 'investment-input' },
              React.createElement('label', { className: 'input-label' }, 'Investment Amount ($)'),
              React.createElement('input', {
                type: 'number',
                className: 'amount-input',
                value: investmentAmount,
                onChange: (e) => setInvestmentAmount(Number(e.target.value) || 0),
                min: '0',
                step: '100'
              })
            ),

            (() => {
              const totalApy = (selectedPool.apyBase || 0) + (selectedPool.apyReward || 0);
              const yields = calculateYields(investmentAmount, totalApy);
              
              return React.createElement('div', { className: 'yield-results' },
                React.createElement('div', { className: 'yield-result-item' },
                  React.createElement('div', { className: 'yield-period' }, '1 Day Yield'),
                  React.createElement('div', { className: 'yield-amount' }, 
                    `$${yields.oneDayGain.toFixed(2)}`
                  )
                ),
                React.createElement('div', { className: 'yield-result-item' },
                  React.createElement('div', { className: 'yield-period' }, '1 Week Yield'),
                  React.createElement('div', { className: 'yield-amount' }, 
                    `$${yields.oneWeekGain.toFixed(2)}`
                  )
                ),
                React.createElement('div', { className: 'yield-disclaimer' },
                  'Calculations based on simple interest, not compounded. Actual yields may vary.'
                )
              );
            })(),

            // Start Earning Button (only show if protocol URL is available)
            (() => {
              const protocolUrl = getProtocolUrlWithRef(selectedPool);
              if (!protocolUrl) return null;
              
              return React.createElement('div', { className: 'start-earning-section' },
                React.createElement('button', {
                  className: 'start-earning-btn',
                  onClick: () => {
                    window.open(protocolUrl, '_blank', 'noopener,noreferrer');
                  }
                }, 'Start Earning →')
              );
            })()
          )
        )
      )
    ),
    // Footer
    React.createElement('footer', { className: 'app-footer' },
      React.createElement('p', null,
        'Powered by ',
        React.createElement('a', {
          href: 'https://api-docs.defillama.com/',
          target: '_blank',
          rel: 'noopener noreferrer'
        }, 'Defillama API'),
        '. Made with AI & Degen Love.'
      )
    )
  );
}

// Render the app
ReactDOM.render(React.createElement(App), document.getElementById('root'));