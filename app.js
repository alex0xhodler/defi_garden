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

// Main App Component
function App() {
  const [pools, setPools] = useState([]);
  const [filteredPools, setFilteredPools] = useState([]);
  const [selectedToken, setSelectedToken] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedChain, setSelectedChain] = useState('');
  const [selectedPoolType, setSelectedPoolType] = useState('All');
  const [minTvl, setMinTvl] = useState(0);
  const [minApy, setMinApy] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [placeholderText, setPlaceholderText] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);

  const debouncedSearchInput = useDebounce(searchInput, 300);
  const itemsPerPage = 10;

  // Popular tokens for typing animation
  const POPULAR_TOKENS = ['ETH', 'BTC', 'SOL', 'XRP', 'HYPE', 'USDE', 'USDC', 'AVAX', 'MATIC', 'DOT', 'LINK', 'UNI', 'AAVE', 'CRV'];

  // URL parameter utilities
  const getUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      token: params.get('token') || '',
      chain: params.get('chain') || '',
      poolType: params.get('poolType') || 'All',
      minTvl: parseInt(params.get('minTvl') || '0', 10),
      minApy: parseInt(params.get('minApy') || '0', 10)
    };
  };

  const updateUrl = (token, chain, poolType, minTvl, minApy) => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (chain) params.set('chain', chain);
    if (poolType && poolType !== 'All') params.set('poolType', poolType);
    if (minTvl > 0) params.set('minTvl', minTvl.toString());
    if (minApy > 0) params.set('minApy', minApy.toString());
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
    
    // Update page title
    if (token) {
      document.title = `${token.toUpperCase()} Yields | DeFi Garden 🌱`;
    } else {
      document.title = 'DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains';
    }
  };

  // Typing animation for placeholder
  useEffect(() => {
    if (isInputFocused || selectedToken || searchInput) {
      setPlaceholderText('Search for token symbol (e.g., USDC, ETH, BTC)...');
      return;
    }

    let currentTokenIndex = 0;
    let currentCharIndex = 0;
    let isTyping = true;
    let timeoutId;

    const typeText = () => {
      const currentToken = POPULAR_TOKENS[currentTokenIndex];
      const baseText = 'Searching for ';
      
      if (isTyping) {
        // Typing phase
        setPlaceholderText(baseText + currentToken.substring(0, currentCharIndex) + '|');
        
        if (currentCharIndex < currentToken.length) {
          currentCharIndex++;
          timeoutId = setTimeout(typeText, 150 + Math.random() * 100); // Human-like typing speed with variation
        } else {
          // Pause at end with full token visible
          timeoutId = setTimeout(() => {
            isTyping = false;
            typeText();
          }, 2000); // Longer pause to read the token
        }
      } else {
        // Erasing phase
        if (currentCharIndex > 0) {
          currentCharIndex--;
          setPlaceholderText(baseText + currentToken.substring(0, currentCharIndex) + '|');
          timeoutId = setTimeout(typeText, 60 + Math.random() * 40); // Natural erasing speed with variation
        } else {
          // Move to next token
          currentTokenIndex = (currentTokenIndex + 1) % POPULAR_TOKENS.length;
          isTyping = true;
          currentCharIndex = 0; // Reset to start of new token
          timeoutId = setTimeout(typeText, 800); // Longer pause before starting next token
        }
      }
    };

    // Start the animation
    typeText();

    // Cleanup on unmount or dependencies change
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isInputFocused, selectedToken, searchInput, POPULAR_TOKENS]);

  // Initialize state from URL parameters on mount
  useEffect(() => {
    const urlParams = getUrlParams();
    if (urlParams.token) {
      setSelectedToken(urlParams.token);
      setSearchInput(urlParams.token);
      setShowFilters(true);
      setShowAutocomplete(false); // Explicitly hide autocomplete for URL loads
      document.title = `${urlParams.token.toUpperCase()} Yields | DeFi Garden 🌱`;
    }
    if (urlParams.chain) setSelectedChain(urlParams.chain);
    if (urlParams.poolType) setSelectedPoolType(urlParams.poolType);
    if (urlParams.minTvl) setMinTvl(urlParams.minTvl);
    if (urlParams.minApy) setMinApy(urlParams.minApy);
    
    // Mark initial load as complete after a brief delay
    setTimeout(() => setIsInitialLoad(false), 100);
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = getUrlParams();
      
      // Update state to match URL
      setSelectedToken(urlParams.token);
      setSearchInput(urlParams.token);
      setSelectedChain(urlParams.chain);
      setSelectedPoolType(urlParams.poolType);
      setMinTvl(urlParams.minTvl);
      setMinApy(urlParams.minApy);
      setShowFilters(!!urlParams.token);
      setShowAutocomplete(false); // Always hide autocomplete on navigation
      setHighlightedIndex(-1);
      
      // Update page title
      if (urlParams.token) {
        document.title = `${urlParams.token.toUpperCase()} Yields | DeFi Garden 🌱`;
      } else {
        document.title = 'DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains';
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  // Fetch pools data on mount
  useEffect(() => {
    const fetchPools = async () => {
      try {
        setLoading(true);
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

    fetchPools();
  }, []);

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
          if (symbol && symbol.length > 0 && symbol.length < 20) { // Reasonable length check
            tokenSet.add(symbol);
          }
        });
      }
    });
    
    const tokens = Array.from(tokenSet).sort();
    return tokens;
  }, [pools]);

  // Filter tokens for autocomplete with smart ordering
  const autocompleteTokens = useMemo(() => {
    if (!debouncedSearchInput || debouncedSearchInput.length < 1) {
      return [];
    }
    
    const searchTerm = debouncedSearchInput.toUpperCase();
    
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
  }, [availableTokens, debouncedSearchInput]);

  // Get available chains for selected token
  const availableChains = useMemo(() => {
    if (!selectedToken || !filteredPools.length) return [];
    const chainSet = new Set();
    filteredPools.forEach(pool => {
      if (pool.chain) {
        chainSet.add(pool.chain);
      }
    });
    return Array.from(chainSet).sort();
  }, [selectedToken, filteredPools]);

  // Get pool type counts for selected token (before other filters)
  const poolTypeCounts = useMemo(() => {
    if (!selectedToken || !pools.length) return {};
    
    const counts = { 'All': 0, 'Lending': 0, 'LP/DEX': 0, 'Staking': 0, 'Yield Farming': 0 };
    
    pools.forEach(pool => {
      if (!pool.symbol) return;
      
      // Check if any symbol in the pool matches the selected token
      const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
      const hasToken = symbols.some(symbol => symbol === selectedToken.toUpperCase());
      
      if (hasToken && pool.tvlUsd > 0) {
        const poolType = getPoolType(pool);
        counts[poolType]++;
        counts['All']++;
      }
    });
    
    return counts;
  }, [selectedToken, pools]);

  // Filter and sort pools when token, chain, TVL, or APY selection changes
  useEffect(() => {
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
      const poolTypeMatch = selectedPoolType === 'All' || getPoolType(pool) === selectedPoolType;
      
      // Filter by minimum TVL
      const tvlMatch = pool.tvlUsd >= minTvl;
      
      // Filter by minimum APY
      const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
      const apyMatch = totalApy >= minApy;
      
      return hasToken && chainMatch && poolTypeMatch && tvlMatch && apyMatch && pool.tvlUsd > 0;
    });

    // Sort by total APY (base + reward) descending
    filtered.sort((a, b) => {
      const apyA = (a.apyBase || 0) + (a.apyReward || 0);
      const apyB = (b.apyBase || 0) + (b.apyReward || 0);
      return apyB - apyA;
    });

    setFilteredPools(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [selectedToken, selectedChain, selectedPoolType, minTvl, minApy, pools]);

  // Update URL when filters change (but not during initial load or popstate events)
  useEffect(() => {
    if (!isInitialLoad && selectedToken) {
      updateUrl(selectedToken, selectedChain, selectedPoolType, minTvl, minApy);
    }
  }, [selectedToken, selectedChain, selectedPoolType, minTvl, minApy, isInitialLoad]);
  // Handle token selection
  const handleTokenSelect = (token) => {
    setSelectedToken(token);
    setSearchInput(token);
    setShowAutocomplete(false);
    setShowFilters(true); // Show filters after token selection
    setHighlightedIndex(-1);
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
      setSelectedPoolType('All');
      setShowFilters(false);
    }
    
    // Show autocomplete if there's input
    setShowAutocomplete(value.length > 0);
    setHighlightedIndex(-1);
  };

  // Handle input focus
  const handleInputFocus = () => {
    setIsInputFocused(true);
    // Only show autocomplete if there's input AND no token is selected (user is searching)
    if (searchInput.length > 0 && !selectedToken) {
      setShowAutocomplete(true);
    }
  };

  // Handle input blur to close autocomplete
  const handleInputBlur = () => {
    setIsInputFocused(false);
    // Delay hiding to allow for clicks on autocomplete items
    setTimeout(() => {
      setShowAutocomplete(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  // Handle keyboard navigation in autocomplete
  const handleKeyDown = (e) => {
    if (!showAutocomplete || autocompleteTokens.length === 0) return;

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
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleTokenSelect(autocompleteTokens[highlightedIndex]);
        } else if (autocompleteTokens.length === 1) {
          handleTokenSelect(autocompleteTokens[0]);
        }
        break;
      case 'Escape':
        setShowAutocomplete(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Reset application state
  const resetApp = () => {
    setSelectedToken('');
    setSearchInput('');
    setSelectedChain('');
    setSelectedPoolType('All');
    setMinTvl(0);
    setMinApy(0);
    setFilteredPools([]);
    setCurrentPage(1);
    setShowAutocomplete(false);
    setShowFilters(false);
    setHighlightedIndex(-1);
    setError('');
    
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
    
    // Fallback to protocol mapping
    if (!pool.project) return null;
    const key = pool.project.toLowerCase().replace(/\s+/g, '-');
    return PROTOCOL_URLS[key] || null;
  };

  // Get paginated results
  const paginatedPools = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPools.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPools, currentPage]);

  const totalPages = Math.ceil(filteredPools.length / itemsPerPage);

  // Handle pool click with protocol URL
  const handlePoolClick = (pool, e) => {
    e.preventDefault();
    e.stopPropagation();
    const protocolUrl = getProtocolUrl(pool);
    if (protocolUrl) {
      window.open(protocolUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Render loading state
  if (loading && pools.length === 0) {
    return React.createElement('div', { className: 'app' },
      React.createElement('div', { className: 'container' },
        React.createElement('div', { className: 'loading-state' },
          React.createElement('div', { className: 'loading-spinner' }),
          React.createElement('div', { className: 'empty-message' }, 'Loading yield opportunities...')
        )
      )
    );
  }

  return React.createElement('div', { 
    className: `app ${selectedToken && filteredPools.length > 0 ? 'has-results' : ''}` 
  },
    React.createElement('div', { className: 'container' },
      // Header
      React.createElement('div', { className: 'header' },
        React.createElement('h1', { 
          className: 'logo', 
          onClick: resetApp
        }, 'DeFi Garden'),
        React.createElement('p', { className: 'subtitle' }, 
          'Find the best yields for your tokens across all chains'
        )
      ),

      // Search Section
      React.createElement('div', { className: 'search-section' },
        React.createElement('div', { className: 'search-container' },
          React.createElement('input', {
            type: 'text',
            className: 'search-input',
            placeholder: placeholderText || 'Search for token symbol (e.g., USDC, ETH, BTC)...',
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
            )
        )
      ),

      // Error State
      error && React.createElement('div', { className: 'error-state' },
        React.createElement('div', { className: 'error-message' }, error)
      ),

      // Filters Section
      showFilters && selectedToken && React.createElement('div', { className: 'filters-section' },
        React.createElement('div', { className: 'filters-grid' },
          // Chain Filter
          availableChains.length > 1 && React.createElement('div', { className: 'filter-group' },
            React.createElement('label', { className: 'filter-label' }, 'Chain'),
            React.createElement('select', {
              className: 'filter-select',
              value: selectedChain,
              onChange: (e) => setSelectedChain(e.target.value)
            },
              React.createElement('option', { value: '' }, 'All Chains'),
              availableChains.map(chain => 
                React.createElement('option', { key: chain, value: chain }, chain)
              )
            )
          ),

          // Pool Type Filter
          React.createElement('div', { className: 'filter-group' },
            React.createElement('label', { className: 'filter-label' }, 'Pool Type'),
            React.createElement('select', {
              className: 'filter-select',
              value: selectedPoolType,
              onChange: (e) => setSelectedPoolType(e.target.value)
            },
              React.createElement('option', { value: 'All' }, 
                `All Pool Types${poolTypeCounts['All'] ? ' (' + poolTypeCounts['All'] + ')' : ''}`),
              React.createElement('option', { value: 'Lending' }, 
                `Lending${poolTypeCounts['Lending'] ? ' (' + poolTypeCounts['Lending'] + ')' : ''}`),
              React.createElement('option', { value: 'LP/DEX' }, 
                `LP/DEX${poolTypeCounts['LP/DEX'] ? ' (' + poolTypeCounts['LP/DEX'] + ')' : ''}`),
              React.createElement('option', { value: 'Staking' }, 
                `Staking${poolTypeCounts['Staking'] ? ' (' + poolTypeCounts['Staking'] + ')' : ''}`),
              React.createElement('option', { value: 'Yield Farming' }, 
                `Yield Farming${poolTypeCounts['Yield Farming'] ? ' (' + poolTypeCounts['Yield Farming'] + ')' : ''}`)
            )
          ),

          // Min TVL Filter
          React.createElement('div', { className: 'filter-group' },
            React.createElement('label', { className: 'filter-label' }, 'Minimum TVL'),
            React.createElement('select', {
              className: 'filter-select',
              value: minTvl,
              onChange: (e) => setMinTvl(Number(e.target.value))
            },
              React.createElement('option', { value: 0 }, 'No minimum'),
              React.createElement('option', { value: 10000 }, '$10K+'),
              React.createElement('option', { value: 100000 }, '$100K+'),
              React.createElement('option', { value: 1000000 }, '$1M+'),
              React.createElement('option', { value: 10000000 }, '$10M+')
            )
          ),

          // Min APY Filter
          React.createElement('div', { className: 'filter-group' },
            React.createElement('label', { className: 'filter-label' }, 'Minimum APY'),
            React.createElement('select', {
              className: 'filter-select',
              value: minApy,
              onChange: (e) => setMinApy(Number(e.target.value))
            },
              React.createElement('option', { value: 0 }, 'No minimum'),
              React.createElement('option', { value: 1 }, '1%+'),
              React.createElement('option', { value: 5 }, '5%+'),
              React.createElement('option', { value: 10 }, '10%+'),
              React.createElement('option', { value: 20 }, '20%+')
            )
          )
        )
      ),

      // Results Section
      selectedToken && React.createElement('div', { className: 'results-section' },
        filteredPools.length > 0 ? [
          React.createElement('div', { className: 'results-header', key: 'header' },
            React.createElement('h2', { className: 'results-title' },
              `Yields for ${selectedToken}${selectedChain ? ` on ${selectedChain}` : ''}`
            ),
            React.createElement('div', { className: 'results-count' },
              `${filteredPools.length} pool${filteredPools.length !== 1 ? 's' : ''} found`
            )
          ),

          React.createElement('div', { className: 'pools-grid', key: 'pools' },
            paginatedPools.map((pool, index) => {
              const protocolUrl = getProtocolUrl(pool);
              return React.createElement('div', {
                key: `${pool.pool}-${index}`,
                className: `pool-card ${protocolUrl ? 'clickable' : ''}`,
                onClick: protocolUrl ? (e) => handlePoolClick(pool, e) : undefined
              },
                React.createElement('div', { className: 'pool-header' },
                  React.createElement('div', { className: 'pool-project' },
                    pool.project,
                    protocolUrl && React.createElement('span', { className: 'external-link' }, '↗')
                  ),
                  React.createElement('div', { className: 'pool-apy' },
                    formatAPY(pool.apyBase, pool.apyReward)
                  )
                ),
                
                React.createElement('div', { className: 'pool-details' },
                  React.createElement('div', { className: 'pool-detail' },
                    React.createElement('div', { className: 'pool-detail-label' }, 'TVL'),
                    React.createElement('div', { className: 'pool-detail-value' },
                      formatCurrency(pool.tvlUsd)
                    )
                  ),
                  React.createElement('div', { className: 'pool-detail' },
                    React.createElement('div', { className: 'pool-detail-label' }, 'Symbol'),
                    React.createElement('div', { className: 'pool-detail-value' }, pool.symbol)
                  )
                ),
                
                React.createElement('div', { className: 'pool-chain' }, pool.chain)
              );
            })
          ),

          // Pagination
          totalPages > 1 && React.createElement('div', { className: 'pagination', key: 'pagination' },
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
          React.createElement('div', { className: 'empty-message' }, `No yields found for ${selectedToken}`),
          React.createElement('div', { className: 'empty-submessage' },
            'Try adjusting your filters or searching for a different token'
          )
        )
      ),

    )
  );
}

// Render the app
ReactDOM.render(React.createElement(App), document.getElementById('root'));