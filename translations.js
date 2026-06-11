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
    calculateYield: "View & calculate →",
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
    dailyEarnings: (amount) => `Daily earnings`,
    monthlyEarnings: (amount) => `Monthly earnings`,
    dailyEarningsSubLabel: (amount) => `on $${Number(amount || 0).toLocaleString('en-US')}`,
    monthlyEarningsSubLabel: (amount) => `on $${Number(amount || 0).toLocaleString('en-US')}`,
    estimatedEarnings: "Estimated Earnings",
    estimatedDailyEarnings: "Estimated Daily Earnings",
    estimatedMonthlyEarnings: "Estimated Monthly Earnings",
    
    // Empty states and errors
    noYieldsFound: (token) => `No yields found for ${token}`,
    noYieldsFoundChain: (chain) => `No yields found on ${chain} with current filters`,
    adjustFilters: "Try adjusting your filters or searching for a different token",
    adjustFiltersChain: "Try adjusting your TVL or APY filters, or select a different chain",
    resetFilters: "Reset Filters",
    showSmallerPools: "Show pools with lower TVL",
    loadingError: "Failed to load yield data. Please try again later.",
    
    // Navigation
    backToSearch: "← Back to Search",
    
    // Pool detail labels
    poolInformation: "Pool Information",
    poolType: "Pool Type", 
    underlyingAssets: "Underlying Assets",
    calculateYourEarnings: "Calculate Your Earnings",
    quickEstimate: (amount, dailyRaw) => `Quick estimate for $${Number(amount || 0).toLocaleString('en-US')}: $${Number(dailyRaw || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}/day`,
    basedOnInvestment: (amount) => `Based on $${Number(amount || 0).toLocaleString('en-US')} investment`,
    verified: "✓ Verified",
    onProtocolChain: (protocol, chain, hasUrl) => `on ${protocol} • ${chain}${hasUrl ? ' ↗' : ''}`,
    tvl: "TVL",
    
    // Calculator disclaimers
    calcDisclaimer: "Estimates based on current rates — yields change constantly. Not financial advice.",
    calcAnomalyWarning: "⚠ This rate is anomalous and almost certainly unsustainable.",

    // Footer
    poweredBy: "Powered by",
    madeWith: "Made with AI & Degen Love.",
    
    // Page titles (for SEO)
    pageTitle: "DeFi Garden 🌱 | Discover Highest Yield Farming Opportunities Across All Chains",
    tokenPageTitle: (token) => `${token.toUpperCase()} Yields | DeFi Garden 🌱`,
    chainPageTitle: (chain) => `${chain} DeFi Yields | DeFi Garden 🌱`,
    poolPageTitle: (symbol, project) => `${symbol} on ${project} | DeFi Garden 🌱`,
    
    // Meta descriptions
    metaDescription: "Find the best DeFi yields for your tokens with DeFi Garden. Compare lending, staking, and LP rewards across 50+ protocols and all major chains. Real-time APY data from Defillama API with intelligent filtering by token, chain, TVL, and pool type.",

    // Homepage Garden Planner entry
    plannerEntryQuestion: "What are you saving for?",
    plannerEntryCta: "Plan my garden →",

    // Garden Planner
    planner: {
      // Page meta
      pageTitle: "Garden Planner 🌱 | Plan your DeFi savings by goal — DeFi Garden",
      metaDescription: "A goal-first DeFi savings planner. Tell us what you're saving for and how much you can set aside each month — we'll show what live, real pool rates could grow it into. Every number is live DefiLlama data. Education, not advice.",

      // Header
      title: "Garden Planner",
      tagline: "Plant a goal. Watch it grow.",
      startFresh: "Start fresh",
      back: "Back",

      // Thinking indicator
      thinking: "Growing your answer…",

      // Step 1 — goal
      step1Question: "Let's grow something. What are you saving for?",
      goalRetirement: "Retirement",
      goalHome: "A home",
      goalEducation: "Education",
      goalRainy: "Rainy day",
      goalGrow: "Just grow it",
      freeTextPlaceholder: "…or tell me in your own words",
      freeTextNudge: "I want to get this right — let's start with one of these for now. You can always change it.",
      youPicked: (goal) => `Saving for ${goal}`,

      // Step 2 — monthly
      step2Question: (goal) => `Lovely — ${goal.toLowerCase()} it is. How much could you set aside each month?`,
      step2QuestionPlain: "How much could you set aside each month?",
      customAmount: "Custom amount",
      monthlyChosen: (amt) => `${amt} every month`,

      // Step 3 — horizon
      step3Question: "And how long can it grow? No rush — longer is gentler on you.",
      years: (n) => `${n} years`,
      horizonChosen: (n) => `Growing for ${n} years`,

      // Step 4 — temperament
      step4Question: "Last thing — how do you want to sleep at night?",
      tempSleepTitle: "Sleep well",
      tempSleepDesc: "Stablecoin pools only, on the largest, most-battle-tested protocols.",
      tempSleepRisk: "What can go wrong: a stablecoin could briefly lose its $1 peg, or a protocol could have a bug. Lower odds, never zero.",
      tempBalancedTitle: "Balanced",
      tempBalancedDesc: "A wider mix of solid pools, capped at moderate rates.",
      tempBalancedRisk: "What can go wrong: prices and rates swing more, and some assets aren't dollar-pegged. You trade calm for a bit more growth.",
      tempBoldTitle: "Adventurous",
      tempBoldDesc: "Higher-rate pools, still above our safety floor.",
      tempBoldRisk: "What can go wrong: real volatility, newer protocols, and rates that can vanish. Only money you can watch wobble.",
      tempChosen: (t) => `${t} pace`,

      // The bloom
      bloomBuilding: "Planting your garden…",
      bloomHeadline: (amt, years) => `≈ ${amt} in ${years} years`,
      bloomInYears: (years) => `in ${years} years`,
      bloomVsBank: (amt) => `vs ${amt} in a typical 0.5% savings account`,
      bloomDeposited: (amt) => `You'd have deposited ${amt} of your own money`,
      bloomCurveYou: "Your garden",
      bloomCurveBank: "Bank account",
      poolsHeading: "Three live pools behind this plan",
      poolApy: "APY",
      poolTvl: "TVL",
      viewPool: "View pool →",
      noPools: "No pools clear this safety bar right now — try a different pace and we'll only ever show you real, live rates.",

      // What-if
      whatIfHeading: "What if…",
      whatIfMore: "+$200/month",
      whatIfLonger: "+5 years",
      whatIfSafer: "Safer",
      whatIfBolder: "Bolder",

      // Ask box
      askPlaceholder: "Ask anything about this plan…",
      askRatesDrop: "Honestly? They will move — these are live rates that change daily. If your blended rate fell by half, your projection would land closer to the bank line but still well ahead of it over time. That's why we spread across three pools and keep a safety floor.",
      askSafe: "Nothing in DeFi is risk-free, and we'd never pretend otherwise. \"Sleep well\" sticks to stablecoin pools on the largest protocols to lower the odds — but a depeg or a contract bug is always possible. Never deposit money you can't afford to lose.",
      askWithdraw: "These pools are generally liquid — you can usually withdraw any time, though rates aren't locked in and can change the moment you do. Always check the protocol's own terms before depositing.",
      askHow: "Every number here comes straight from live DefiLlama pool data, blended and run through our safety filters. We never invent a rate. Pools with absurd APY are filtered out entirely.",
      askFallback: "I can't answer that one confidently yet — and I'd rather say so than guess. Try one of the what-if chips above to reshape the plan, or ask about rates, risk, or withdrawals.",

      disclaimer: "Estimates from live pool rates — they change daily. Education, not advice.",
      share: "Share my garden",
      sharePrepping: "Drawing…",
      tendGarden: "Tend your garden",

      // Persona intros
      presetIntro: (name) => `Planning like ${name} — adjust anything to make it yours.`,

      // Return visit — Garden Report
      reportTitle: "Your garden",
      reportSince: (date) => `Your garden since ${date}`,
      reportOnTrack: "Still on track — your rates are holding steady.",
      reportAhead: "Ahead of plan — rates ticked up since you planted this.",
      reportDipped: "Rates dipped a little — here's the honest impact.",
      reportRateUp: "up",
      reportRateDown: "down",
      reportRateFlat: "steady",
      reportProjectionNow: (amt) => `Now projecting ≈ ${amt}`,
      reportProjectionWas: (amt) => `(was ${amt} when you planted it)`,
      reportTend: "Tend your garden",
      reportFresh: "Start fresh",
      reportPoolGone: "This pool is no longer in the live data — we won't guess its rate."
    }
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
    calculateYield: "보기 및 계산 →",
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
    dailyEarnings: (amount) => `일일 수익`,
    monthlyEarnings: (amount) => `월 수익`,
    dailyEarningsSubLabel: (amount) => `${formatKoreanCurrency(amount)} 기준`,
    monthlyEarningsSubLabel: (amount) => `${formatKoreanCurrency(amount)} 기준`,
    estimatedEarnings: "예상 수익",
    estimatedDailyEarnings: "예상 일일 수익",
    estimatedMonthlyEarnings: "예상 월간 수익",
    
    // Empty states and errors
    noYieldsFound: (token) => `${token}에 대한 수익률을 찾을 수 없습니다`,
    noYieldsFoundChain: (chain) => `현재 필터로 ${chain}에서 수익률을 찾을 수 없습니다`,
    adjustFilters: "필터를 조정하거나 다른 토큰을 검색해보세요",
    adjustFiltersChain: "TVL 또는 APY 필터를 조정하거나 다른 체인을 선택해보세요",
    resetFilters: "필터 초기화",
    showSmallerPools: "TVL이 낮은 풀도 보기",
    loadingError: "수익률 데이터를 불러오지 못했습니다. 다시 시도해주세요.",
    
    // Navigation
    backToSearch: "← 검색으로 돌아가기",
    
    // Pool detail labels
    poolInformation: "풀 정보",
    poolType: "풀 유형",
    underlyingAssets: "기초 자산",
    calculateYourEarnings: "수익 계산하기",
    quickEstimate: (amount, dailyRaw) => `${formatKoreanCurrency(amount)} 예상: ${formatKoreanCurrency(Number(dailyRaw || 0))}/일`,
    basedOnInvestment: (amount) => `${formatKoreanCurrency(amount)} 투자 기준`,
    verified: "✓ 인증됨",
    onProtocolChain: (protocol, chain, hasUrl) => `${protocol}에서 • ${chain}${hasUrl ? ' ↗' : ''}`,
    tvl: "TVL",
    
    // Calculator disclaimers
    calcDisclaimer: "현재 수익률 기준 추정치이며 수시로 변동됩니다. 투자 조언이 아닙니다.",
    calcAnomalyWarning: "⚠ 이 수익률은 비정상적이며 거의 지속 불가능합니다.",

    // Footer
    poweredBy: "제공:",
    madeWith: "AI와 디젠 사랑으로 제작.",
    
    // Page titles (for SEO)
    pageTitle: "DeFi Garden 🌱 | 모든 체인에서 최고 수익률 찾기",
    tokenPageTitle: (token) => `${token.toUpperCase()} 수익률 | DeFi Garden 🌱`,
    chainPageTitle: (chain) => `${chain} DeFi 수익률 | DeFi Garden 🌱`,
    poolPageTitle: (symbol, project) => `${symbol} (${project}) | DeFi Garden 🌱`,
    
    // Meta descriptions
    metaDescription: "DeFi Garden으로 토큰의 최고 DeFi 수익률을 찾아보세요. 50개 이상의 프로토콜에서 대출, 스테이킹, LP 보상을 비교하세요. Defillama API의 실시간 APY 데이터와 토큰, 체인, TVL, 풀 타입별 지능형 필터링.",

    // Homepage Garden Planner entry
    plannerEntryQuestion: "무엇을 위해 모으고 계신가요?",
    plannerEntryCta: "내 정원 계획하기 →",

    // Garden Planner
    planner: {
      pageTitle: "가든 플래너 🌱 | 목표 중심 DeFi 저축 계획 — DeFi Garden",
      metaDescription: "목표부터 시작하는 DeFi 저축 플래너. 무엇을 위해 매달 얼마를 모을 수 있는지 알려주시면, 실시간 풀 수익률로 얼마나 키울 수 있는지 보여드립니다. 모든 숫자는 DefiLlama 실시간 데이터입니다. 투자 조언이 아닌 교육용입니다.",

      title: "가든 플래너",
      tagline: "목표를 심고, 자라는 걸 지켜보세요.",
      startFresh: "처음부터 다시",
      back: "뒤로",

      thinking: "답을 키우는 중…",

      step1Question: "함께 무언가를 키워봐요. 무엇을 위해 모으고 계신가요?",
      goalRetirement: "은퇴 자금",
      goalHome: "내 집 마련",
      goalEducation: "교육비",
      goalRainy: "비상금",
      goalGrow: "그냥 불리기",
      freeTextPlaceholder: "…아니면 직접 말씀해 주세요",
      freeTextNudge: "제대로 도와드리고 싶어요 — 우선 이 중에서 하나 골라볼까요? 언제든 바꿀 수 있어요.",
      youPicked: (goal) => `${goal} 모으기`,

      step2Question: (goal) => `좋아요 — ${goal}이군요. 매달 얼마나 따로 모을 수 있을까요?`,
      step2QuestionPlain: "매달 얼마나 따로 모을 수 있을까요?",
      customAmount: "직접 입력",
      monthlyChosen: (amt) => `매달 ${amt}`,

      step3Question: "그리고 얼마나 오래 키울 수 있나요? 서두르지 마세요 — 길수록 마음이 편해요.",
      years: (n) => `${n}년`,
      horizonChosen: (n) => `${n}년 동안 키우기`,

      step4Question: "마지막으로 — 어떻게 하면 발 뻗고 주무실 수 있나요?",
      tempSleepTitle: "편안하게",
      tempSleepDesc: "가장 크고 검증된 프로토콜의 스테이블코인 풀만.",
      tempSleepRisk: "무엇이 잘못될 수 있나: 스테이블코인이 잠시 $1 가치를 잃거나 프로토콜에 버그가 생길 수 있어요. 가능성은 낮지만 0은 아닙니다.",
      tempBalancedTitle: "균형 있게",
      tempBalancedDesc: "견고한 풀을 폭넓게 섞되 수익률은 적당한 선에서.",
      tempBalancedRisk: "무엇이 잘못될 수 있나: 가격과 수익률 변동이 더 크고, 일부 자산은 달러에 연동되지 않아요. 더 큰 성장을 위해 평온함을 조금 내어주는 셈입니다.",
      tempBoldTitle: "모험적으로",
      tempBoldDesc: "안전 기준선은 넘으면서 더 높은 수익률의 풀.",
      tempBoldRisk: "무엇이 잘못될 수 있나: 큰 변동성, 신생 프로토콜, 사라질 수 있는 수익률. 흔들려도 지켜볼 수 있는 돈으로만.",
      tempChosen: (t) => `${t} 속도`,

      bloomBuilding: "정원을 심는 중…",
      bloomHeadline: (amt, years) => `${years}년 후 약 ${amt}`,
      bloomInYears: (years) => `${years}년 후`,
      bloomVsBank: (amt) => `일반 0.5% 예금이라면 ${amt}`,
      bloomDeposited: (amt) => `직접 넣은 원금은 ${amt}`,
      bloomCurveYou: "내 정원",
      bloomCurveBank: "예금 계좌",
      poolsHeading: "이 계획을 떠받치는 실시간 풀 3개",
      poolApy: "APY",
      poolTvl: "TVL",
      viewPool: "풀 보기 →",
      noPools: "지금은 이 안전 기준을 통과하는 풀이 없어요 — 다른 속도를 골라보세요. 저희는 언제나 실시간 수익률만 보여드립니다.",

      whatIfHeading: "만약에…",
      whatIfMore: "+매달 $200",
      whatIfLonger: "+5년",
      whatIfSafer: "더 안전하게",
      whatIfBolder: "더 과감하게",

      askPlaceholder: "이 계획에 대해 무엇이든 물어보세요…",
      askRatesDrop: "솔직히요? 수익률은 움직입니다 — 매일 변하는 실시간 수치예요. 혼합 수익률이 절반으로 떨어져도, 예측치는 예금 선에 가까워지지만 시간이 지나면 여전히 훨씬 앞섭니다. 그래서 세 개 풀에 나누고 안전 기준선을 둡니다.",
      askSafe: "DeFi에 위험이 전혀 없는 건 없고, 그렇게 꾸미지 않겠습니다. '편안하게'는 가장 큰 프로토콜의 스테이블코인 풀만 골라 가능성을 낮추지만, 디페그나 컨트랙트 버그는 언제든 생길 수 있어요. 잃어도 괜찮은 돈만 넣으세요.",
      askWithdraw: "이 풀들은 대체로 유동성이 좋아 보통 언제든 출금할 수 있어요. 다만 수익률은 고정이 아니라 출금하는 순간에도 바뀔 수 있습니다. 입금 전에 항상 프로토콜 약관을 확인하세요.",
      askHow: "여기 모든 숫자는 DefiLlama 실시간 풀 데이터를 그대로 가져와 혼합하고 안전 필터를 거친 값입니다. 수익률을 지어내지 않아요. 말도 안 되게 높은 APY 풀은 아예 걸러냅니다.",
      askFallback: "그건 아직 자신 있게 답하기 어려워요 — 추측하기보다 솔직히 말씀드릴게요. 위의 '만약에' 칩으로 계획을 바꿔보거나 수익률, 위험, 출금에 대해 물어보세요.",

      disclaimer: "실시간 풀 수익률 기반 추정치이며 매일 변동됩니다. 투자 조언이 아닌 교육용입니다.",
      share: "내 정원 공유하기",
      sharePrepping: "그리는 중…",
      tendGarden: "내 정원 가꾸기",

      presetIntro: (name) => `${name}님처럼 계획해 봐요 — 무엇이든 바꿔 내 것으로 만드세요.`,

      reportTitle: "내 정원",
      reportSince: (date) => `${date}부터 키운 내 정원`,
      reportOnTrack: "여전히 순조로워요 — 수익률이 안정적으로 유지되고 있어요.",
      reportAhead: "계획보다 앞서가요 — 심은 뒤로 수익률이 올랐어요.",
      reportDipped: "수익률이 조금 내렸어요 — 솔직한 영향을 보여드릴게요.",
      reportRateUp: "상승",
      reportRateDown: "하락",
      reportRateFlat: "유지",
      reportProjectionNow: (amt) => `현재 예측 약 ${amt}`,
      reportProjectionWas: (amt) => `(심었을 땐 ${amt})`,
      reportTend: "내 정원 가꾸기",
      reportFresh: "처음부터 다시",
      reportPoolGone: "이 풀은 더 이상 실시간 데이터에 없어요 — 수익률을 추측하지 않겠습니다."
    }
  }
};

// Helper function for Korean currency formatting (만/억)
function formatKoreanCurrency(num) {
  if (num >= 100000000) return `${(num/100000000).toFixed(1)}억원`;
  if (num >= 10000) return `${(num/10000).toFixed(1)}만원`;
  return `${Math.round(num).toLocaleString('en-US')}원`;
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