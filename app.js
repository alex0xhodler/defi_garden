const { useState, useEffect, useMemo } = React;

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
  const [minTvl, setMinTvl] = useState(0);
  const [minApy, setMinApy] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showFilters, setShowFilters] = useState(false);

  const debouncedSearchInput = useDebounce(searchInput, 300);
  const itemsPerPage = 10;

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
      
      // Filter by minimum TVL
      const tvlMatch = pool.tvlUsd >= minTvl;
      
      // Filter by minimum APY
      const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
      const apyMatch = totalApy >= minApy;
      
      return hasToken && chainMatch && tvlMatch && apyMatch && pool.tvlUsd > 0;
    });

    // Sort by total APY (base + reward) descending
    filtered.sort((a, b) => {
      const apyA = (a.apyBase || 0) + (a.apyReward || 0);
      const apyB = (b.apyBase || 0) + (b.apyReward || 0);
      return apyB - apyA;
    });

    setFilteredPools(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [selectedToken, selectedChain, minTvl, minApy, pools]);

  // Handle token selection
  const handleTokenSelect = (token) => {
    setSelectedToken(token);
    setSearchInput(token);
    setShowAutocomplete(false);
    setShowFilters(true); // Show filters after token selection
    setHighlightedIndex(-1);
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
      setShowFilters(false);
    }
    
    // Show autocomplete if there's input
    setShowAutocomplete(value.length > 0);
    setHighlightedIndex(-1);
  };

  // Handle input focus
  const handleInputFocus = () => {
    if (searchInput.length > 0) {
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
    setMinTvl(0);
    setMinApy(0);
    setFilteredPools([]);
    setCurrentPage(1);
    setShowAutocomplete(false);
    setShowFilters(false);
    setHighlightedIndex(-1);
    setError('');
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

  return React.createElement('div', { className: 'app' },
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
            placeholder: 'Search for token symbol (e.g., USDC, ETH, BTC)...',
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