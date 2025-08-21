// Comprehensive Analytics tracking utilities for Umami
const Analytics = {
  // Session management
  sessionId: null,
  pageLoadTime: Date.now(),
  lastEventTime: Date.now(),
  viewStartTime: Date.now(),
  
  // Initialize session
  init() {
    this.sessionId = this.generateSessionId();
    this.pageLoadTime = Date.now();
    this.lastEventTime = Date.now();
    this.viewStartTime = Date.now();
  },

  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  // Get base context for all events
  getBaseContext() {
    return {
      session_id: this.sessionId,
      timestamp: Date.now(),
      user_agent: navigator.userAgent.substring(0, 100), // Truncated for privacy
      screen_resolution: `${screen.width}x${screen.height}`,
      viewport_size: `${window.innerWidth}x${window.innerHeight}`,
      viewport_category: this.getViewportCategory(),
      language: navigator.language,
      page_url: window.location.href,
      referrer: document.referrer || 'direct',
      time_since_load: Date.now() - this.pageLoadTime,
      time_since_last_event: Date.now() - this.lastEventTime
    };
  },

  getViewportCategory() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  },

  // Core tracking function with enhanced context
  track(eventName, eventData = {}) {
    if (typeof umami !== 'undefined') {
      const enrichedData = {
        ...this.getBaseContext(),
        ...eventData
      };
      
      // Update last event time
      this.lastEventTime = Date.now();
      
      umami.track(eventName, enrichedData);
    }
  },

  // Enhanced page view tracking
  trackPageView(path, properties = {}) {
    this.track('page_view', {
      path,
      view_duration_previous: Date.now() - this.viewStartTime,
      ...properties
    });
    
    // Reset view timer
    this.viewStartTime = Date.now();
  },

  // Search Analytics - Enhanced
  
  // Track when users type in search (debounced)
  trackSearchInput(query, resultsCount, context = {}) {
    const searchType = this.classifySearchType(query);
    
    this.track('search_input', {
      query_text: query.toLowerCase(),
      query_length: query.length,
      search_type: searchType.type,
      is_natural_language: searchType.isNatural,
      contains_token: searchType.containsToken,
      contains_chain: searchType.containsChain,
      contains_protocol: searchType.containsProtocol,
      results_count: resultsCount,
      has_results: resultsCount > 0,
      current_chain_filter: context.selectedChain || null,
      current_token_filter: context.selectedToken || null,
      current_filters_active: this.getFiltersActiveCount(context),
      user_language: context.language || 'en'
    });
  },

  // Track successful search (when token/chain is selected)
  trackSearchSuccess(query, selectedResult, resultsCount, context = {}) {
    this.track('search_success', {
      original_query: query.toLowerCase(),
      selected_result: selectedResult.toLowerCase(),
      selected_result_type: context.chainMode ? 'chain' : 'token',
      results_count: resultsCount,
      search_to_selection_time: Date.now() - (context.searchStartTime || this.lastEventTime),
      position_in_results: context.position || -1,
      user_language: context.language || 'en'
    });
  },

  // Track search abandonment
  trackSearchAbandonment(query, timeSpent, context = {}) {
    if (query && query.length > 0) {
      this.track('search_abandonment', {
        query_text: query.toLowerCase(),
        query_length: query.length,
        time_spent_ms: timeSpent,
        results_available: context.resultsCount > 0,
        results_count: context.resultsCount || 0,
        user_language: context.language || 'en'
      });
    }
  },

  // Track autocomplete interactions
  trackAutocomplete(action, query, suggestion, position) {
    this.track('autocomplete_interaction', {
      action, // 'show', 'select', 'dismiss'
      query_text: query.toLowerCase(),
      suggestion_selected: suggestion ? suggestion.toLowerCase() : null,
      suggestion_position: position || -1,
      query_length: query.length
    });
  },

  // Enhanced Pool Analytics
  
  trackPoolView(pool, context = {}) {
    const poolAnalytics = this.enrichPoolData(pool, context);
    
    this.track('pool_view', {
      ...poolAnalytics,
      source_view: context.sourceView || 'search',
      source_position: context.position || -1,
      search_query: context.searchQuery || null,
      active_filters: this.serializeFilters(context.filters || {}),
      time_to_view: context.searchStartTime ? Date.now() - context.searchStartTime : null
    });
  },

  trackPoolClick(pool, clickType, context = {}) {
    const poolAnalytics = this.enrichPoolData(pool, context);
    
    this.track('pool_click', {
      ...poolAnalytics,
      click_type: clickType,
      time_spent_viewing_ms: context.viewStartTime ? Date.now() - context.viewStartTime : null,
      investment_amount_set: context.investmentAmount || null,
      yield_calculated: !!context.yieldCalculated,
      source_position: context.position || -1
    });
  },

  trackYieldCalculation(amount, pool, context = {}) {
    const poolAnalytics = this.enrichPoolData(pool, context);
    const yields = context.calculatedYields || {};
    
    this.track('yield_calculation', {
      ...poolAnalytics,
      investment_amount: amount,
      amount_category: this.categorizeAmount(amount),
      daily_yield: yields.dailyGain || null,
      monthly_yield: yields.monthlyGain || null,
      apy_at_calculation: ((pool.apyBase || 0) + (pool.apyReward || 0)),
      calculation_trigger: context.trigger || 'manual_input' // 'manual_input', 'preset_button', 'slider'
    });
  },

  // Filter Analytics - Enhanced
  
  trackFilterChange(filterType, value, resultsCount, fullFilterState = {}) {
    this.track('filter_change', {
      filter_type: filterType,
      filter_value: String(value),
      results_count_after: resultsCount,
      filters_state: this.serializeFilters(fullFilterState),
      filters_active_count: this.getFiltersActiveCount(fullFilterState),
      filter_effectiveness: this.calculateFilterEffectiveness(resultsCount, fullFilterState.previousResultsCount)
    });
  },

  trackFilterCombination(activeFilters, resultsCount) {
    const combination = this.serializeFilters(activeFilters);
    
    this.track('filter_combination', {
      filters_combination: combination,
      filters_count: this.getFiltersActiveCount(activeFilters),
      results_count: resultsCount,
      combination_effectiveness: resultsCount > 0 ? 'effective' : 'ineffective'
    });
  },

  trackFiltersReset(previousFilters, previousResultsCount) {
    this.track('filters_reset', {
      previous_filters: this.serializeFilters(previousFilters),
      previous_results_count: previousResultsCount,
      filters_were_effective: previousResultsCount > 0
    });
  },

  // Navigation Analytics
  
  trackNavigation(fromView, toView, method, context = {}) {
    this.track('navigation', {
      from_view: fromView,
      to_view: toView,
      navigation_method: method, // 'click', 'back_button', 'browser_back', 'url_direct'
      time_in_previous_view_ms: Date.now() - this.viewStartTime,
      deep_link: method === 'url_direct',
      pool_id: context.poolId || null,
      search_active: !!context.searchQuery
    });
    
    // Reset view timer
    this.viewStartTime = Date.now();
  },

  // User Engagement Analytics
  
  trackEngagement(action, context = {}) {
    this.track('user_engagement', {
      engagement_type: action,
      time_spent_ms: context.duration || null,
      interaction_depth: context.depth || 1, // How deep into the flow
      feature_used: context.feature || null,
      success: context.success !== undefined ? context.success : true
    });
  },

  // Language and Localization
  
  trackLanguageChange(fromLang, toLang, context = {}) {
    this.track('language_change', {
      from_language: fromLang,
      to_language: toLang,
      change_method: context.method || 'manual', // 'auto_detect', 'manual', 'url_param'
      user_region: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  },

  // Performance Tracking
  
  trackPerformance(metric, value, context = {}) {
    this.track('performance_metric', {
      metric_name: metric,
      metric_value: value,
      metric_category: this.categorizePerformanceMetric(metric),
      page_context: context.page || 'unknown',
      connection_type: navigator.connection ? navigator.connection.effectiveType : 'unknown',
      is_slow_device: this.isSlowDevice()
    });
  },

  // Error Tracking
  
  trackError(error, context = {}) {
    this.track('error_occurred', {
      error_message: String(error.message || error).substring(0, 200),
      error_type: error.name || 'unknown',
      error_stack: error.stack ? error.stack.substring(0, 500) : null,
      error_context: context.context || 'unknown',
      user_action: context.userAction || null,
      can_recover: context.recoverable !== undefined ? context.recoverable : true,
      retry_count: context.retryCount || 0
    });
  },

  // Utility Functions
  
  classifySearchType(query) {
    const lowerQuery = query.toLowerCase();
    const tokens = ['eth', 'btc', 'usdc', 'usdt', 'dai', 'weth', 'wbtc', 'matic', 'avax', 'sol'];
    const chains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche', 'binance'];
    const protocols = ['aave', 'compound', 'uniswap', 'curve', 'morpho', 'euler', 'venus'];
    
    const containsToken = tokens.some(token => lowerQuery.includes(token));
    const containsChain = chains.some(chain => lowerQuery.includes(chain));
    const containsProtocol = protocols.some(protocol => lowerQuery.includes(protocol));
    
    const isNatural = query.split(' ').length > 1 || 
                      /\b(best|highest|top|yield|yields|lending|staking|farming|opportunities|on|for)\b/i.test(query);
    
    let type = 'unknown';
    if (containsToken && containsChain) type = 'token_and_chain';
    else if (containsToken) type = 'token_search';
    else if (containsChain) type = 'chain_search';
    else if (containsProtocol) type = 'protocol_search';
    else if (isNatural) type = 'natural_language';
    else if (query.length <= 5) type = 'token_symbol';
    else type = 'text_search';
    
    return {
      type,
      isNatural,
      containsToken,
      containsChain,
      containsProtocol
    };
  },

  enrichPoolData(pool, context = {}) {
    const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
    
    return {
      pool_id: pool.pool,
      pool_symbol: pool.symbol,
      pool_project: pool.project,
      pool_chain: pool.chain,
      pool_type: this.getPoolType(pool),
      total_apy: Math.round(totalApy * 100) / 100,
      base_apy: Math.round((pool.apyBase || 0) * 100) / 100,
      reward_apy: Math.round((pool.apyReward || 0) * 100) / 100,
      tvl_usd: pool.tvlUsd,
      tvl_category: this.categorizeTVL(pool.tvlUsd),
      apy_category: this.categorizeAPY(totalApy),
      has_rewards: (pool.apyReward || 0) > 0,
      pool_risk_score: this.calculateRiskScore(pool),
      is_stablecoin_pool: this.isStablecoinPool(pool.symbol)
    };
  },

  getPoolType(pool) {
    // Simplified version - can be expanded
    if (!pool.project) return 'unknown';
    
    const project = pool.project.toLowerCase();
    if (['aave', 'compound', 'morpho', 'euler'].some(p => project.includes(p))) return 'lending';
    if (['uniswap', 'curve', 'balancer', 'sushiswap'].some(p => project.includes(p))) return 'dex_lp';
    if (['lido', 'rocket', 'ether.fi'].some(p => project.includes(p))) return 'staking';
    return 'yield_farming';
  },

  serializeFilters(filters) {
    const active = [];
    if (filters.selectedChain) active.push(`chain:${filters.selectedChain}`);
    if (filters.selectedToken) active.push(`token:${filters.selectedToken}`);
    if (filters.minTvl > 0) active.push(`tvl:${filters.minTvl}`);
    if (filters.minApy > 0) active.push(`apy:${filters.minApy}`);
    if (filters.selectedPoolTypes?.length > 0) active.push(`types:${filters.selectedPoolTypes.join(',')}`);
    if (filters.selectedProtocols?.length > 0) active.push(`protocols:${filters.selectedProtocols.join(',')}`);
    
    return active.join('|') || 'none';
  },

  getFiltersActiveCount(filters) {
    let count = 0;
    if (filters.selectedChain) count++;
    if (filters.selectedToken) count++;
    if (filters.minTvl > 0) count++;
    if (filters.minApy > 0) count++;
    if (filters.selectedPoolTypes?.length > 0) count++;
    if (filters.selectedProtocols?.length > 0) count++;
    return count;
  },

  calculateFilterEffectiveness(newCount, oldCount) {
    if (!oldCount) return 'initial';
    if (newCount === 0) return 'over_filtered';
    if (newCount > oldCount) return 'expanded_results';
    if (newCount < oldCount) return 'narrowed_results';
    return 'no_change';
  },

  categorizeAmount(amount) {
    if (amount < 100) return 'micro';
    if (amount < 1000) return 'small';
    if (amount < 10000) return 'medium';
    if (amount < 100000) return 'large';
    return 'whale';
  },

  categorizeTVL(tvl) {
    if (tvl < 1000000) return 'low';
    if (tvl < 10000000) return 'medium';
    if (tvl < 100000000) return 'high';
    return 'very_high';
  },

  categorizeAPY(apy) {
    if (apy < 2) return 'low';
    if (apy < 5) return 'medium';
    if (apy < 10) return 'high';
    return 'very_high';
  },

  calculateRiskScore(pool) {
    let risk = 0;
    
    // TVL factor (lower TVL = higher risk)
    if (pool.tvlUsd < 1000000) risk += 2;
    else if (pool.tvlUsd < 10000000) risk += 1;
    
    // APY factor (higher APY = higher risk)
    const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
    if (totalApy > 15) risk += 2;
    else if (totalApy > 8) risk += 1;
    
    return Math.min(risk, 3); // Cap at 3
  },

  isStablecoinPool(symbol) {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'sUSD', 'BUSD'];
    return stablecoins.some(stable => (symbol || '').toUpperCase().includes(stable));
  },

  categorizePerformanceMetric(metric) {
    if (metric.includes('load') || metric.includes('fetch')) return 'loading';
    if (metric.includes('render') || metric.includes('paint')) return 'rendering';
    if (metric.includes('api') || metric.includes('request')) return 'network';
    return 'other';
  },

  isSlowDevice() {
    return navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
  },

  // Session and Journey tracking
  startSession() {
    if (!this.sessionId) {
      this.init();
    }
    
    this.track('session_start', {
      entry_point: this.getEntryPoint(),
      is_returning_user: this.isReturningUser(),
      device_memory: navigator.deviceMemory || 'unknown',
      connection_type: navigator.connection ? navigator.connection.effectiveType : 'unknown'
    });
  },

  getEntryPoint() {
    const url = new URL(window.location.href);
    if (url.searchParams.get('token')) return 'token_direct';
    if (url.searchParams.get('chain')) return 'chain_direct';
    if (url.searchParams.get('pool')) return 'pool_direct';
    if (document.referrer) return 'external_referrer';
    return 'direct';
  },

  isReturningUser() {
    const hasVisited = localStorage.getItem('defi_garden_visited');
    if (!hasVisited) {
      localStorage.setItem('defi_garden_visited', Date.now().toString());
      return false;
    }
    return true;
  }
};

// Auto-initialize on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    Analytics.init();
    Analytics.startSession();
  });

  // Track page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      Analytics.track('page_focus');
    } else {
      Analytics.track('page_blur', {
        time_on_page: Date.now() - Analytics.viewStartTime
      });
    }
  });

  // Track errors
  window.addEventListener('error', (event) => {
    Analytics.trackError(event.error, {
      context: 'global_error',
      filename: event.filename,
      lineno: event.lineno
    });
  });
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Analytics;
}