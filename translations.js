// Multi-language translation system
const translations = {
  en: {
    // Search
    searchPlaceholder: "Search for a token...",
    searchHint: "Try searching for 'ETH on Arbitrum' or 'USDC lending'",
    tokenSearch: "Token Search",
    feelingDegen: "I'm Feeling Degen",
    
    // Filter labels
    chains: "Chains",
    allChains: "All Chains",
    protocols: "Protocols",
    popular: "Popular",
    allProtocols: "All Protocols",
    poolTypes: "Pool Types",
    minTvl: "Minimum TVL",
    minApy: "Minimum APY",
    noMin: "No Min",
    
    // Results
    showingResults: (count) => `${count} pool${count !== 1 ? 's' : ''} found`,
    chainYields: (chain) => `${chain} DeFi Yields`,
    tokenYields: (token, chain) => `Yields for ${token}${chain ? ` on ${chain}` : ''}`,
    
    // Pool card labels
    totalApy: "Total APY",
    baseApy: "Base APY:",
    rewardApy: "Reward APY:",
    baseApyBreakdown: (apy) => `${apy}% Base`,
    rewardApyBreakdown: (apy) => `+ ${apy}% Rewards`,
    opensProtocol: "Opens protocol • Wallet required",
    protocol: "Protocol↗",
    calculateYield: "Calculate Yield",
    startEarning: "Start Earning",
    startEarningOn: (protocol) => `Start Earning on ${protocol}`,
    
    // Pool details
    daily: "Daily",
    monthly: "Monthly",
    riskAssessment: "Risk Assessment",
    lowRisk: "Low",
    mediumRisk: "Medium", 
    highRisk: "High",
    
    // Numbers and earnings
    dailyEarnings: (amount) => `$${amount}/day`,
    monthlyEarnings: (amount) => `Monthly ($${amount.toLocaleString()})`,
    estimatedEarnings: "Estimated Earnings",
    estimatedDailyEarnings: "Estimated Daily Earnings",
    estimatedMonthlyEarnings: "Estimated Monthly Earnings",
    
    // Empty states and errors
    noYieldsFound: (token) => `No yields found for ${token}`,
    noYieldsFoundChain: (chain) => `No yields found on ${chain} with current filters`,
    adjustFilters: "Try adjusting your filters or searching for a different token",
    adjustFiltersChain: "Try adjusting your TVL or APY filters, or select a different chain",
    resetFilters: "Reset Filters",
    loadingError: "Failed to load yield data. Please try again later.",
    
    // Navigation
    backToSearch: "← Back to Search",
    
    // Pool detail labels
    poolInformation: "Pool Information",
    poolType: "Pool Type", 
    underlyingAssets: "Underlying Assets",
    calculateYourEarnings: "Calculate Your Earnings",
    quickEstimate: (amount, daily) => `Quick estimate for $${amount.toLocaleString()}: $${daily}/day`,
    basedOnInvestment: (amount) => `Based on $${amount.toLocaleString()} investment`,
    verified: "✓ Verified",
    onProtocolChain: (protocol, chain, hasUrl) => `on ${protocol} • ${chain}${hasUrl ? ' ↗' : ''}`,
    tvl: "TVL",
    
    // Footer
    poweredBy: "Powered by",
    madeWith: "Made with AI & Degen Love.",
    
    // Page titles (for SEO)
    pageTitle: "DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains",
    tokenPageTitle: (token) => `${token.toUpperCase()} Yields | DeFi Garden 🌱`,
    chainPageTitle: (chain) => `${chain} DeFi Yields | DeFi Garden 🌱`,
    poolPageTitle: (symbol, project) => `${symbol} on ${project} | DeFi Garden 🌱`,
    
    // Meta descriptions
    metaDescription: "Find the best DeFi yields for your tokens with DeFi Garden. Compare lending, staking, and LP rewards across 50+ protocols and all major chains. Real-time APY data from Defillama API with intelligent filtering by token, chain, TVL, and pool type."
  },
  
  ko: {
    // Search
    searchPlaceholder: "토큰 검색...",
    searchHint: "'Arbitrum ETH' 또는 'USDC 대출'로 검색해보세요",
    tokenSearch: "토큰 검색",
    feelingDegen: "디젠 모드",
    
    // Filter labels
    chains: "체인",
    allChains: "모든 체인",
    protocols: "프로토콜",
    popular: "인기",
    allProtocols: "모든 프로토콜",
    poolTypes: "풀 유형",
    minTvl: "최소 TVL",
    minApy: "최소 APY",
    noMin: "제한 없음",
    
    // Results
    showingResults: (count) => `${count}개 풀 발견`,
    chainYields: (chain) => `${chain} DeFi 수익률`,
    tokenYields: (token, chain) => `${token} 수익률${chain ? ` (${chain})` : ''}`,
    
    // Pool card labels
    totalApy: "총 APY",
    baseApy: "기본 APY:",
    rewardApy: "보상 APY:",
    baseApyBreakdown: (apy) => `${apy}% 기본`,
    rewardApyBreakdown: (apy) => `+ ${apy}% 보상`,
    opensProtocol: "프로토콜 열기 • 지갑 필요",
    protocol: "프로토콜↗",
    calculateYield: "수익 계산",
    startEarning: "수익 시작",
    startEarningOn: (protocol) => `${protocol}에서 수익 시작`,
    
    // Pool details
    daily: "일일",
    monthly: "월간",
    riskAssessment: "위험도 평가",
    lowRisk: "낮음",
    mediumRisk: "보통",
    highRisk: "높음",
    
    // Numbers and earnings
    dailyEarnings: (amount) => `${formatKoreanCurrency(amount)}/일`,
    monthlyEarnings: (amount) => `월간 (${formatKoreanCurrency(amount)})`,
    estimatedEarnings: "예상 수익",
    estimatedDailyEarnings: "예상 일일 수익",
    estimatedMonthlyEarnings: "예상 월간 수익",
    
    // Empty states and errors
    noYieldsFound: (token) => `${token}에 대한 수익률을 찾을 수 없습니다`,
    noYieldsFoundChain: (chain) => `현재 필터로 ${chain}에서 수익률을 찾을 수 없습니다`,
    adjustFilters: "필터를 조정하거나 다른 토큰을 검색해보세요",
    adjustFiltersChain: "TVL 또는 APY 필터를 조정하거나 다른 체인을 선택해보세요",
    resetFilters: "필터 초기화",
    loadingError: "수익률 데이터를 불러오지 못했습니다. 다시 시도해주세요.",
    
    // Navigation
    backToSearch: "← 검색으로 돌아가기",
    
    // Pool detail labels
    poolInformation: "풀 정보",
    poolType: "풀 유형",
    underlyingAssets: "기초 자산",
    calculateYourEarnings: "수익 계산하기",
    quickEstimate: (amount, daily) => `${formatKoreanCurrency(amount)} 예상: ${formatKoreanCurrency(parseFloat(daily.replace('$', '').replace(',', '')) * 1200)}/일`,
    basedOnInvestment: (amount) => `${formatKoreanCurrency(amount)} 투자 기준`,
    verified: "✓ 인증됨",
    onProtocolChain: (protocol, chain, hasUrl) => `${protocol}에서 • ${chain}${hasUrl ? ' ↗' : ''}`,
    tvl: "TVL",
    
    // Footer
    poweredBy: "제공:",
    madeWith: "AI와 디젠 사랑으로 제작.",
    
    // Page titles (for SEO)
    pageTitle: "DeFi Garden 🌱 | 모든 체인에서 최고 수익률 찾기",
    tokenPageTitle: (token) => `${token.toUpperCase()} 수익률 | DeFi Garden 🌱`,
    chainPageTitle: (chain) => `${chain} DeFi 수익률 | DeFi Garden 🌱`,
    poolPageTitle: (symbol, project) => `${symbol} (${project}) | DeFi Garden 🌱`,
    
    // Meta descriptions
    metaDescription: "DeFi Garden으로 토큰의 최고 DeFi 수익률을 찾아보세요. 50개 이상의 프로토콜에서 대출, 스테이킹, LP 보상을 비교하세요. Defillama API의 실시간 APY 데이터와 토큰, 체인, TVL, 풀 타입별 지능형 필터링."
  }
};

// Helper function for Korean currency formatting (만/억)
function formatKoreanCurrency(num) {
  if (num >= 100000000) return `${(num/100000000).toFixed(1)}억원`;
  if (num >= 10000) return `${(num/10000).toFixed(1)}만원`;
  return `${Math.round(num).toLocaleString()}원`;
}

// Language detection helper
function detectUserLanguage() {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('ko')) return 'ko';
  return 'en';
}

// Translation helper function
function createTranslationFunction(language) {
  return function t(key, ...params) {
    const translation = translations[language][key];
    if (!translation) {
      // Fallback to English if translation missing
      const fallback = translations['en'][key];
      return fallback ? (typeof fallback === 'function' ? fallback(...params) : fallback) : key;
    }
    if (typeof translation === 'function') {
      return translation(...params);
    }
    return translation;
  };
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translations,
    formatKoreanCurrency,
    detectUserLanguage,
    createTranslationFunction
  };
}