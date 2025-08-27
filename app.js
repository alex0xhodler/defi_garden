const { useState, useEffect, useMemo } = React;

// Import translation system (script tag will load translations.js before app.js)
// translations, formatKoreanCurrency, detectUserLanguage, createTranslationFunction are available globally

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
  const [activeDropdown, setActiveDropdown] = useState(null); // 'chains', 'tvl', 'apy', or null
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showYieldCalculator, setShowYieldCalculator] = useState(false);
  const [selectedPool, setSelectedPool] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState(1000);
  const [dynamicProtocolUrls, setDynamicProtocolUrls] = useState({});
  const [animationsTriggered, setAnimationsTriggered] = useState(false);
  const [chainMode, setChainMode] = useState(false); // Track if we're in chain-first mode
  const [currentView, setCurrentView] = useState('search'); // 'search' or 'pool-detail'
  const [detailPool, setDetailPool] = useState(null); // Pool being viewed in detail

  // Language state management
  const [language, setLanguage] = useState(() => {
    // Check for saved language preference first
    const savedLang = localStorage.getItem('defi-garden-lang');
    if (savedLang && ['en', 'ko'].includes(savedLang)) {
      return savedLang;
    }
    
    // Check URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam && ['en', 'ko'].includes(langParam)) {
      return langParam;
    }
    
    // Auto-detect browser language
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('ko')) {
      return 'ko';
    }
    return 'en';
  });

  // Create translation function for current language
  const t = createTranslationFunction(language);

  const debouncedSearchInput = useDebounce(searchInput, 300);
  const itemsPerPage = 9;

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
    
    // Add language parameter if not English (default)
    if (language !== 'en') {
      params.set('lang', language);
    }
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
    
    // Update page title with localized text
    if (chain && chainMode && !token) {
      document.title = t('chainPageTitle', chain);
    } else if (token) {
      document.title = t('tokenPageTitle', token);
    } else {
      document.title = t('pageTitle');
    }
  };

  // Language management functions
  const changeLanguage = (newLang) => {
    const oldLang = language;
    setLanguage(newLang);
    localStorage.setItem('defi-garden-lang', newLang);
    
    // Analytics tracking for language change
    Analytics.trackLanguageChange(oldLang, newLang);
    
    // Update URL with new language
    const url = new URL(window.location);
    if (newLang === 'en') {
      url.searchParams.delete('lang');
    } else {
      url.searchParams.set('lang', newLang);
    }
    window.history.replaceState({}, '', url);
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
        // Browser back navigation analytics disabled temporarily
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
  }, [currentView, detailPool]);
  // Background fetch pools data after UI loads
  useEffect(() => {
    const fetchPoolsInBackground = async () => {
      const startTime = Date.now();
      try {
        setError('');
        const response = await fetch('https://yields.llama.fi/pools');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setPools(data.data || []);
        
        // Track successful data load
        Analytics.trackPerformance('data_load_time', Date.now() - startTime, {
          pools_count: data.data?.length || 0
        });
      } catch (err) {
        setError('Failed to load yield data. Please try again later.');
        console.error('Error fetching pools:', err);
        Analytics.trackError(err, { context: 'data_fetching' });
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
    if (pools.length > 0 && !detailPool && currentView !== 'pool-detail') {
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
  }, [pools, detailPool, currentView]);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeDropdown && !event.target.closest('.filter-dropdown-container')) {
        setActiveDropdown(null);
      }
    };
    
    if (activeDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeDropdown]);

  // Enhanced scroll detection for horizontal dropdown containers
  useEffect(() => {
    const handleScroll = (container) => {
      const scrollLeft = container.scrollLeft;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      
      // Add scrolled class if scrolled past start (show left fade)
      if (scrollLeft > 10) {
        container.classList.add('scrolled');
      } else {
        container.classList.remove('scrolled');
      }
      
      // Add scrolled-end class if scrolled near end (hide right fade)
      if (scrollLeft >= scrollWidth - clientWidth - 10) {
        container.classList.add('scrolled-end');
      } else {
        container.classList.remove('scrolled-end');
      }
    };

    const attachScrollListeners = () => {
      const containers = document.querySelectorAll('.global-filter-dropdown .filter-pills-grid, .global-filter-dropdown .filter-chips-container');
      containers.forEach(container => {
        // Initial scroll position check
        handleScroll(container);
        
        // Add scroll listener for real-time updates
        const scrollHandler = () => handleScroll(container);
        container.addEventListener('scroll', scrollHandler, { passive: true });
        
        // Store handler reference for cleanup
        container._scrollHandler = scrollHandler;
      });
    };

    // Attach listeners when any dropdown opens
    if (activeDropdown) {
      // Small delay to ensure DOM elements are fully rendered
      const timeoutId = setTimeout(attachScrollListeners, 100);
      return () => {
        clearTimeout(timeoutId);
        // Clean up all scroll listeners
        const containers = document.querySelectorAll('.global-filter-dropdown .filter-pills-grid, .global-filter-dropdown .filter-chips-container');
        containers.forEach(container => {
          if (container._scrollHandler) {
            container.removeEventListener('scroll', container._scrollHandler);
            container._scrollHandler = null;
            container.classList.remove('scrolled', 'scrolled-end');
          }
        });
      };
    }
  }, [activeDropdown]);

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

  // Search input analytics disabled temporarily to fix render issues
  // TODO: Re-enable with proper safety checks

  // Track page views when view changes
  useEffect(() => {
    if (!isInitialLoad) {
      if (currentView === 'search') {
        if (selectedToken) {
          Analytics.trackPageView(`/search/${selectedToken}`, {
            token: selectedToken,
            chain: selectedChain,
            language
          });
        } else if (selectedChain) {
          Analytics.trackPageView(`/chain/${selectedChain}`, {
            chain: selectedChain,
            language
          });
        } else {
          Analytics.trackPageView('/', { language });
        }
      }
    }
  }, [currentView, selectedToken, selectedChain, isInitialLoad, language]);

  // Track initial page load
  useEffect(() => {
    if (pools.length > 0 && isInitialLoad) {
      // Track initial page load after data is ready
      if (selectedToken) {
        Analytics.trackPageView(`/search/${selectedToken}`, {
          token: selectedToken,
          chain: selectedChain,
          language,
          initial_load: true
        });
      } else if (selectedChain) {
        Analytics.trackPageView(`/chain/${selectedChain}`, {
          chain: selectedChain,
          language,
          initial_load: true
        });
      } else {
        Analytics.trackPageView('/', { 
          language,
          initial_load: true 
        });
      }
    }
  }, [pools.length, selectedToken, selectedChain, isInitialLoad, language]);

  // Track filter combinations when filters change
  useEffect(() => {
    if (!isInitialLoad && filteredPools.length >= 0) {
      const activeFilters = {
        selectedChain,
        selectedToken,
        minTvl,
        minApy,
        selectedPoolTypes,
        selectedProtocols
      };
      
      const filtersActive = Analytics.getFiltersActiveCount(activeFilters);
      if (filtersActive > 1) {
        // Analytics disabled: Analytics.trackFilterCombination(activeFilters, filteredPools.length);
      }
    }
  }, [selectedChain, selectedToken, minTvl, minApy, selectedPoolTypes, selectedProtocols, filteredPools.length, isInitialLoad]);

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

  // Language management effect
  useEffect(() => {
    // Apply language to document root
    document.documentElement.lang = language;
    
    // Update page title with localized text
    if (chainMode && selectedChain && !selectedToken) {
      document.title = t('chainPageTitle', selectedChain);
    } else if (selectedToken) {
      document.title = t('tokenPageTitle', selectedToken);
    } else {
      document.title = t('pageTitle');
    }
    
    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content = t('metaDescription');
    }
    
    // Add body class for language-specific styling
    document.body.className = document.body.className.replace(/lang-\w+/g, '');
    document.body.classList.add(`lang-${language}`);
  }, [language, selectedToken, selectedChain, chainMode, t]);

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
    
    // Safety check for availableTokens
    if (!availableTokens || availableTokens.length === 0) {
      return [];
    }
    
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
      
      // Chain mode: include pools based on selected chain (including special categories)
      if (chainMode && selectedChain && !selectedToken) {
        if (selectedChain === 'All') {
          includePool = true; // Include all chains
        } else if (selectedChain === 'Popular') {
          // Define popular chains (same as in filtering logic)
          const popularChains = ['Ethereum', 'Arbitrum', 'Polygon', 'Optimism', 'Base', 'BNB Chain', 'Avalanche', 'Solana', 'Fantom', 'Linea', 'Gnosis', 'Celo', 'Moonbeam', 'Cronos', 'zkSync Era'];
          includePool = popularChains.includes(pool.chain);
        } else {
          includePool = pool.chain === selectedChain; // Regular chain match
        }
      }
      // Token mode: include pools with selected token
      else if (selectedToken && pool.symbol) {
        const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
        includePool = symbols.some(symbol => symbol === selectedToken.toUpperCase());
        
        // Also check chain filter if both token and chain are selected
        if (includePool && selectedChain) {
          if (selectedChain === 'All') {
            includePool = true; // Keep all chains for token
          } else if (selectedChain === 'Popular') {
            const popularChains = ['Ethereum', 'Arbitrum', 'Polygon', 'Optimism', 'Base', 'BNB Chain', 'Avalanche', 'Solana', 'Fantom', 'Linea', 'Gnosis', 'Celo', 'Moonbeam', 'Cronos', 'zkSync Era'];
            includePool = popularChains.includes(pool.chain);
          } else {
            includePool = pool.chain === selectedChain; // Regular chain match
          }
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
    
    // Get top 50 protocols by TVL - comprehensive list including single-chain giants
    const popular = allProtocols.slice(0, 50);
    
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
    // Don't run filtering logic when in pool detail view
    if (currentView === 'pool-detail') {
      return;
    }
    
    // Special chain categories: handle "All" and "Popular" as predefined filters
    if (!selectedToken && (selectedChain === 'All' || selectedChain === 'Popular')) {
      // Define popular chains (top 15 by TVL/activity)
      const popularChains = ['Ethereum', 'Arbitrum', 'Polygon', 'Optimism', 'Base', 'BNB Chain', 'Avalanche', 'Solana', 'Fantom', 'Linea', 'Gnosis', 'Celo', 'Moonbeam', 'Cronos', 'zkSync Era'];
      
      let filtered = pools.filter(pool => {
        // Chain filter: either all chains or popular chains only
        const chainMatch = selectedChain === 'All' || 
          (selectedChain === 'Popular' && popularChains.includes(pool.chain));
        
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
    
    // Chain-first mode: filter by chain only (including special categories)
    if (chainMode && selectedChain && !selectedToken) {
      // Define popular chains (same as above for consistency)
      const popularChains = ['Ethereum', 'Arbitrum', 'Polygon', 'Optimism', 'Base', 'BNB Chain', 'Avalanche', 'Solana', 'Fantom', 'Linea', 'Gnosis', 'Celo', 'Moonbeam', 'Cronos', 'zkSync Era'];
      
      let filtered = pools.filter(pool => {
        // Filter by selected chain (handle special categories)
        let chainMatch;
        if (selectedChain === 'All') {
          chainMatch = true; // Include all chains
        } else if (selectedChain === 'Popular') {
          chainMatch = popularChains.includes(pool.chain);
        } else {
          chainMatch = pool.chain === selectedChain; // Regular chain match
        }
        
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
    const isFeelingDegen = chainName === 'Popular' && !selectedToken && minTvl >= 1000000;
    if (isFeelingDegen) {
      Analytics.trackFeelingDegen();
    }
    Analytics.trackSearch('', {
      selected_chain: chainName,
      input_method: isFeelingDegen ? 'feeling_degen_button' : 'chain_selection',
      language
    });
    
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
    
    // Simple search tracking - capture the full search input at search completion
    Analytics.trackSearch(searchInput || token, {
      selected_token: token,
      input_method: showAutocomplete ? 'autocomplete' : 'direct_input',
      language
    });
    
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
    const previousValue = searchInput;
    
    // Search abandonment analytics disabled temporarily
    // TODO: Re-enable with proper safety checks
    
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
    // Analytics tracking for filter reset
    const previousFilters = {
      selectedChain,
      selectedToken,
      minTvl,
      minApy,
      selectedPoolTypes,
      selectedProtocols
    };
    // Analytics disabled: Analytics.trackFiltersReset(previousFilters, filteredPools.length);
    
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
  const handlePoolClick = (pool, e, position = -1) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Simple pool view tracking
    Analytics.trackPoolView(pool, {
      position: position,
      search_query: selectedToken || selectedChain || 'browse',
      selected_chain: selectedChain,
      selected_token: selectedToken
    });
    
    // Set the pool for detail view
    setDetailPool(pool);
    setCurrentView('pool-detail');
    // Scroll to top when navigating to pool details
    window.scrollTo(0, 0);
    
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
    // Analytics tracking for navigation
    // Analytics disabled: Analytics.trackNavigation('pool-detail', 'search', 'back_button');
    
    // Remove pool parameter from URL first
    const params = new URLSearchParams(window.location.search);
    params.delete('pool');
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
    
    // Then update the state - React will batch these
    setCurrentView('search');
    setDetailPool(null);
    
    // Restore previous title and scroll position
    setTimeout(() => {
      if (chainMode && selectedChain && !selectedToken) {
        document.title = `${selectedChain} DeFi Yields | DeFi Garden 🌱`;
      } else if (selectedToken) {
        document.title = `${selectedToken.toUpperCase()} Yields | DeFi Garden 🌱`;
      } else {
        document.title = 'DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains';
      }
      
      // Ensure we scroll back to the top of search results
      window.scrollTo(0, 0);
    }, 0);
  };

  // Handle yield calculator - navigate to pool details page
  const handleCalculateYield = (pool, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Analytics tracking for yield calculation
    Analytics.trackPoolClick(pool, 'yield_calculator');
    
    // Set the pool for detail view (same logic as handlePoolClick)
    setDetailPool(pool);
    setCurrentView('pool-detail');
    // Scroll to top when navigating to pool details
    window.scrollTo(0, 0);
  };

  // Handle pool type selection (multi-select)
  const handlePoolTypeToggle = (poolType) => {
    setSelectedPoolTypes(prev => {
      const newTypes = prev.includes(poolType) 
        ? prev.filter(type => type !== poolType)
        : [...prev, poolType];
      
      // Analytics tracking for pool type filter
      const fullFilterState = {
        selectedChain,
        selectedToken,
        minTvl,
        minApy,
        selectedPoolTypes: newTypes,
        selectedProtocols,
        previousResultsCount: filteredPools.length
      };
      // Analytics disabled: Analytics.trackFilterChange('pool_type', poolType, filteredPools.length, fullFilterState);
      
      return newTypes;
    });
  };

  // Handle protocol selection (multi-select)
  const handleProtocolToggle = (protocolFriendlyName) => {
    setSelectedProtocols(prev => {
      const newProtocols = prev.includes(protocolFriendlyName)
        ? prev.filter(p => p !== protocolFriendlyName)
        : [...prev, protocolFriendlyName];
      
      // Analytics tracking for protocol filter
      const fullFilterState = {
        selectedChain,
        selectedToken,
        minTvl,
        minApy,
        selectedPoolTypes,
        selectedProtocols: newProtocols,
        previousResultsCount: filteredPools.length
      };
      // Analytics disabled: Analytics.trackFilterChange('protocol', protocolFriendlyName, filteredPools.length, fullFilterState);
      
      return newProtocols;
    });
  };

  // Handle popular protocols selection (replaces current selection)
  const handlePopularProtocols = () => {
    const popularProtocolNames = availableProtocols.popular.map(p => p.friendlyName);
    setSelectedProtocols(popularProtocolNames);
  };

  // Handle TVL selection
  const handleTvlSelect = (tvlValue) => {
    // Analytics tracking for TVL filter
    const fullFilterState = {
      selectedChain,
      selectedToken,
      minTvl: tvlValue,
      minApy,
      selectedPoolTypes,
      selectedProtocols,
      previousResultsCount: filteredPools.length
    };
    // Analytics disabled: Analytics.trackFilterChange('min_tvl', tvlValue, filteredPools.length, fullFilterState);
    setMinTvl(tvlValue);
  };

  // Handle APY selection
  const handleApySelect = (apyValue) => {
    // Analytics tracking for APY filter
    const fullFilterState = {
      selectedChain,
      selectedToken,
      minTvl,
      minApy: apyValue,
      selectedPoolTypes,
      selectedProtocols,
      previousResultsCount: filteredPools.length
    };
    // Analytics disabled: Analytics.trackFilterChange('min_apy', apyValue, filteredPools.length, fullFilterState);
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

  // Render Pool Detail View if active
  if (currentView === 'pool-detail' && detailPool) {
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

      // Language Toggle  
      React.createElement('button', {
        className: 'language-toggle',
        onClick: () => changeLanguage(language === 'en' ? 'ko' : 'en'),
        'aria-label': `Switch to ${language === 'en' ? 'Korean' : 'English'}`
      }, language === 'en' ? 'KO' : 'EN'),
      
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
          isDarkMode: isDarkMode,
          t: t
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
    // Google-style sticky header - ONLY show when we have results
    (selectedToken || (chainMode && selectedChain)) && React.createElement('div', { 
      className: 'google-header-sticky'
    },
      React.createElement('div', { className: 'google-header-content' },
        // Logo (compact, clickable)
        React.createElement('div', { 
          className: 'google-logo',
          onClick: resetApp
        }, '🌱 DeFi Garden'),
        
        // Persistent search bar
        React.createElement('div', { className: 'google-search-container' },
          React.createElement('div', { className: 'google-search-bar' },
            React.createElement('input', {
              type: 'text',
              className: 'google-search-input',
              placeholder: selectedToken ? selectedToken : (selectedChain ? selectedChain : t('searchPlaceholder')),
              value: searchInput,
              onChange: handleSearchInputChange,
              onKeyDown: handleKeyDown,
              onFocus: handleInputFocus,
              onBlur: handleInputBlur
            }),
            React.createElement('button', {
              className: 'google-search-button',
              onClick: () => {
                if (searchInput.length > 0 && autocompleteTokens.length > 0) {
                  handleTokenSelect(autocompleteTokens[0]);
                }
              }
            }, '🔍')
          )
        ),
        
        // Controls (theme, language) 
        React.createElement('div', { className: 'google-header-controls' },
          React.createElement('button', {
            className: 'google-control-btn language-toggle',
            onClick: () => changeLanguage(language === 'en' ? 'ko' : 'en'),
            'aria-label': `Switch to ${language === 'en' ? 'Korean' : 'English'}`
          }, language === 'en' ? 'KO' : 'EN'),
          React.createElement('button', {
            className: 'google-control-btn theme-toggle',
            onClick: toggleTheme,
            'aria-label': `Switch to ${isDarkMode ? 'light' : 'dark'} mode`
          }, isDarkMode ? '☀️' : '🌙')
        )
      ),
      
      // Google-style navigation tabs - part of the header
      React.createElement('div', { className: 'google-nav-row' },
        React.createElement('div', { className: 'google-nav-tabs' },
          React.createElement('button', {
            className: `google-nav-tab ${!selectedPoolTypes.length ? 'active' : ''}`,
            onClick: () => setSelectedPoolTypes([])
          }, 'All'),
          React.createElement('button', {
            className: `google-nav-tab ${selectedPoolTypes.includes('Lending') && selectedPoolTypes.length === 1 ? 'active' : ''}`,
            onClick: () => setSelectedPoolTypes(['Lending'])
          }, 'Lending'),
          React.createElement('button', {
            className: `google-nav-tab ${selectedPoolTypes.includes('Staking') && selectedPoolTypes.length === 1 ? 'active' : ''}`,
            onClick: () => setSelectedPoolTypes(['Staking'])
          }, 'Staking'),
          React.createElement('button', {
            className: `google-nav-tab ${selectedPoolTypes.includes('LP/DEX') && selectedPoolTypes.length === 1 ? 'active' : ''}`,
            onClick: () => setSelectedPoolTypes(['LP/DEX'])
          }, 'LP/DEX'),
          
          // Quick filter buttons 
          React.createElement('button', {
            className: `google-filter-btn ${selectedChain ? 'has-selection' : ''} ${activeDropdown === 'chains' ? 'active' : ''}`,
            onClick: () => setActiveDropdown(activeDropdown === 'chains' ? null : 'chains'),
            id: 'chains-btn'
          }, selectedChain || 'Chains'),
          
          React.createElement('button', {
            className: `google-filter-btn ${minTvl > 0 ? 'has-selection' : ''} ${activeDropdown === 'tvl' ? 'active' : ''}`,
            onClick: () => setActiveDropdown(activeDropdown === 'tvl' ? null : 'tvl'),
            id: 'tvl-btn'
          }, minTvl > 0 ? `$${minTvl >= 1000000 ? (minTvl/1000000) + 'M+' : (minTvl/1000) + 'K+'}` : 'TVL'),
          
          React.createElement('button', {
            className: `google-filter-btn ${selectedProtocols.length > 0 ? 'has-selection' : ''} ${activeDropdown === 'protocols' ? 'active' : ''}`,
            onClick: () => setActiveDropdown(activeDropdown === 'protocols' ? null : 'protocols'),
            id: 'protocols-btn'
          }, selectedProtocols.length > 0 ? `${selectedProtocols.length} Protocol${selectedProtocols.length > 1 ? 's' : ''}` : 'Protocols'),

          React.createElement('button', {
            className: `google-filter-btn ${minApy > 0 ? 'has-selection' : ''} ${activeDropdown === 'apy' ? 'active' : ''}`,
            onClick: () => setActiveDropdown(activeDropdown === 'apy' ? null : 'apy'),
            id: 'apy-btn'
          }, minApy > 0 ? `${minApy}%+` : 'APY')
        ),
        
        // Results count only
        React.createElement('div', { className: 'google-tools-section' },
          React.createElement('span', { className: 'google-results-count' },
            `${filteredPools.length.toLocaleString()} results`
          )
        )
      )
    ),

    // Theme Toggle (original - keep for homepage)
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

    // Language Toggle
    React.createElement('button', {
      className: 'language-toggle', 
      onClick: () => changeLanguage(language === 'en' ? 'ko' : 'en'),
      'aria-label': `Switch to ${language === 'en' ? 'Korean' : 'English'}`
    }, language === 'en' ? 'KO' : 'EN'),

    React.createElement('div', { className: 'container' },
      // Header - only show when no results
      !(selectedToken || (chainMode && selectedChain)) && React.createElement('div', { 
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
            placeholder: t('searchPlaceholder'),
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
              React.createElement('span', { className: 'button-text' }, t('tokenSearch'))
            ),
            React.createElement('button', {
              className: 'search-button feeling-degen',
              onClick: () => {
                // Set Popular category with 1M TVL for degen-level opportunities
                setSelectedChain('Popular');
                setChainMode(true);
                setShowFilters(true);
                setMinTvl(1000000); // $1M TVL for degen mode
                setShowAutocomplete(false);
                
                // Analytics tracking for feeling degen
                Analytics.trackFeelingDegen();
                Analytics.trackSearch('', {
                  selected_chain: 'Popular',
                  input_method: 'feeling_degen_button',
                  language
                });
                
                // Update URL for degen mode
                updateUrl('', 'Popular', selectedPoolTypes, selectedProtocols, 1000000, minApy);
                
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
              }
            },
              React.createElement('span', { className: 'button-icon' }, '🚀'),
              React.createElement('span', { className: 'button-text' }, t('feelingDegen'))
            )
          )
        )
      ),

      // Error State
      error && React.createElement('div', { className: 'error-state' },
        React.createElement('div', { className: 'error-message' }, error)
      ),


      // Results Section - show for both token mode and chain mode
      (selectedToken || (chainMode && selectedChain)) && React.createElement('div', { className: 'results-section animate-on-mount' },
        filteredPools.length > 0 ? [
          React.createElement('div', { className: 'results-header', key: 'header' },
            React.createElement('h2', { className: 'results-title' },
              chainMode && selectedChain && !selectedToken
                ? t('chainYields', selectedChain)
                : t('tokenYields', selectedToken, selectedChain)
            ),
            React.createElement('div', { className: 'results-count' },
              t('showingResults', filteredPools.length)
            )
          ),

          React.createElement('div', { className: 'pools-grid', key: 'pools' },
            paginatedPools.map((pool, index) => {
              const protocolUrl = getProtocolUrl(pool);
              const quickPreview = getQuickPreview(pool);
              return React.createElement('div', {
                key: `${pool.pool}-${index}`,
                className: `pool-card animate-on-mount clickable`,
                onClick: (e) => handlePoolClick(pool, e, (currentPage - 1) * itemsPerPage + index)
              },
                // Header: Symbol + Protocol info + APY
                React.createElement('div', { className: 'pool-header-new' },
                  React.createElement('div', { className: 'pool-left-section' },
                    React.createElement('div', { className: 'pool-symbol' },
                      pool.symbol
                    ),
                    React.createElement('div', { className: 'pool-context-inline' },
                      t('onProtocolChain', pool.project, pool.chain, protocolUrl)
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
                  React.createElement('div', { className: 'tvl-label' }, t('tvl')),
                  React.createElement('div', { className: 'tvl-value' },
                    formatCurrency(pool.tvlUsd)
                  )
                ),
                
                // Progressive disclosure for APY breakdown (only show when BOTH Base and Reward APY exist)
                (pool.apyBase > 0 && pool.apyReward > 0) && React.createElement('div', { className: 'pool-details-expanded' },
                  pool.apyBase > 0 && React.createElement('div', { className: 'apy-breakdown' },
                    React.createElement('span', { className: 'breakdown-label' }, t('baseApy')),
                    React.createElement('span', { className: 'breakdown-value' }, `${pool.apyBase.toFixed(2)}%`)
                  ),
                  pool.apyReward > 0 && React.createElement('div', { className: 'apy-breakdown' },
                    React.createElement('span', { className: 'breakdown-label' }, t('rewardApy')),
                    React.createElement('span', { className: 'breakdown-value' }, `${pool.apyReward.toFixed(2)}%`)
                  )
                ),
                
                // Primary CTA - Calculate Yield (full width, prominent)
                React.createElement('div', { className: 'pool-cta-section' },
                  React.createElement('button', {
                    className: 'calculate-yield-btn-new',
                    onClick: (e) => handleCalculateYield(pool, e)
                  }, t('calculateYield'))
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
              ? t('noYieldsFoundChain', selectedChain)
              : t('noYieldsFound', selectedToken)
          ),
          React.createElement('div', { className: 'empty-submessage' },
            chainMode && selectedChain && !selectedToken
              ? t('adjustFiltersChain')
              : t('adjustFilters')
          ),
          React.createElement('button', {
            className: 'reset-filters-btn',
            onClick: resetApp
          }, t('resetFilters'))
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
      ),

      // Global dropdowns - rendered at top level to avoid any container overflow issues
      activeDropdown === 'chains' && availableChains.length > 1 && React.createElement('div', { 
        className: 'global-filter-dropdown chains-dropdown',
        style: {
          position: 'fixed',
          top: '128px',
          left: document.getElementById('chains-btn')?.getBoundingClientRect().left + 'px' || '0px',
          zIndex: 99999
        }
      },
        React.createElement('div', { className: 'filter-pills-grid' },
          React.createElement('button', {
            className: `filter-pill chain-pill ${selectedChain === 'All' ? 'active' : ''}`,
            onClick: () => {
              setSelectedChain('All');
              setChainMode(true); // Enable chain mode for All category
              setActiveDropdown(null);
              setShowFilters(true);
              
              // Set reasonable default filters for All chains
              if (minTvl === 0) setMinTvl(10000); // $10k default TVL for all chains
              
              // Update URL
              updateUrl('', 'All', selectedPoolTypes, selectedProtocols, minTvl || 10000, minApy);
            }
          }, 'All'),
          React.createElement('button', {
            className: `filter-pill chain-pill ${selectedChain === 'Popular' ? 'active' : ''}`,
            onClick: () => {
              setSelectedChain('Popular');
              setChainMode(true); // Enable chain mode for Popular category  
              setActiveDropdown(null);
              setShowFilters(true);
              
              // Set reasonable default filters for Popular chains
              if (minTvl === 0) setMinTvl(50000); // $50k default TVL for popular chains
              
              // Update URL
              updateUrl('', 'Popular', selectedPoolTypes, selectedProtocols, minTvl || 50000, minApy);
            }
          }, 'Popular'),
          availableChains.map(chain => 
            React.createElement('button', {
              key: chain,
              className: `filter-pill chain-pill ${selectedChain === chain ? 'active' : ''}`,
              onClick: () => {
                setSelectedChain(chain);
                setActiveDropdown(null);
              },
              style: {
                '--chain-color': getChainColor(chain)
              }
            }, chain)
          )
        )
      ),

      // Protocols dropdown
      activeDropdown === 'protocols' && availableProtocols.all.length > 0 && React.createElement('div', { 
        className: 'global-filter-dropdown protocols-dropdown',
        style: {
          position: 'fixed',
          top: '128px',
          left: document.getElementById('protocols-btn')?.getBoundingClientRect().left + 'px' || '0px',
          zIndex: 99999
        }
      },
        React.createElement('div', { className: 'filter-pills-grid' },
          React.createElement('button', {
            className: `filter-pill protocol-pill ${selectedProtocols.length === 0 ? 'active' : ''}`,
            onClick: () => {
              setSelectedProtocols([]);
              setActiveDropdown(null);
            }
          }, 'All Protocols'),
          availableProtocols.popular.length > 0 && React.createElement('button', {
            className: `filter-pill protocol-pill popular ${
              availableProtocols.popular.every(p => selectedProtocols.includes(p.friendlyName)) &&
              selectedProtocols.length === availableProtocols.popular.length ? 'active' : ''
            }`,
            onClick: () => {
              handlePopularProtocols();
              setActiveDropdown(null);
            }
          }, 'Popular'),
          availableProtocols.all.slice(0, 10).map(protocol => 
            React.createElement('button', {
              key: protocol.friendlyName,
              className: `filter-pill protocol-pill ${selectedProtocols.includes(protocol.friendlyName) ? 'active' : ''}`,
              onClick: () => {
                handleProtocolToggle(protocol.friendlyName);
                setActiveDropdown(null);
              }
            }, protocol.friendlyName)
          )
        )
      ),

      // TVL dropdown
      activeDropdown === 'tvl' && React.createElement('div', { 
        className: 'global-filter-dropdown tvl-dropdown',
        style: {
          position: 'fixed',
          top: '128px',
          left: document.getElementById('tvl-btn')?.getBoundingClientRect().left + 'px' || '0px',
          zIndex: 99999
        }
      },
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
              onClick: () => {
                handleTvlSelect(tvl.value);
                setActiveDropdown(null);
              }
            }, tvl.label)
          )
        )
      ),

      // APY dropdown
      activeDropdown === 'apy' && React.createElement('div', { 
        className: 'global-filter-dropdown apy-dropdown',
        style: {
          position: 'fixed',
          top: '128px',
          left: document.getElementById('apy-btn')?.getBoundingClientRect().left + 'px' || '0px',
          zIndex: 99999
        }
      },
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
              onClick: () => {
                handleApySelect(apy.value);
                setActiveDropdown(null);
              }
            }, apy.label)
          )
        )
      )
    )
  );
}

// Render the app
ReactDOM.render(React.createElement(App), document.getElementById('root'));