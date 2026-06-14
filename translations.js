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

    // Garden Planner v2
    planner: {
      // Page meta
      pageTitle: "Garden Planner 🌱 | Plan your DeFi savings by goal — DeFi Garden",
      metaDescription: "A goal-first DeFi savings planner. Tell us what you're saving for and how much you can set aside each month — we'll show what live, real pool rates could grow it into. Every number is live DefiLlama data. Education, not advice.",

      // Header
      title: "Garden Planner",
      tagline: "Plant a goal. Watch it grow.",
      startFresh: "Start fresh",
      back: "Back",
      myGarden: "My garden",

      // Thinking indicator
      thinking: "Growing your answer…",

      // Step 1 — goal
      step1Question: "Let's grow something. What are you saving for?",
      catSubscriptions: "Subscriptions",
      catGadgets: "Gadgets",
      catLife: "Big goals",
      goalSpotify: "Spotify",
      goalNetflix: "Netflix",
      goalClaude: "Claude Pro",
      goalMobile: "Mobile plan",
      goalRetirement: "Retirement",
      goalHome: "A home",
      goalSneakers: "Fresh sneakers",
      goalIphone: "New iPhone",
      freeTextPlaceholder: "…or tell me in your own words",
      freeTextNudge: "I want to get this right — let's start with one of these for now. You can always change it.",
      youPicked: (goal) => `Saving for ${goal}`,
      sharedPlanIntro: "Someone shared their garden — make it yours.",

      // Step 2 — monthly
      step2Question: (goal) => `Lovely — ${goal.toLowerCase()} it is. How much could you set aside each month?`,
      step2QuestionPlain: "How much could you set aside each month?",
      customAmount: "Custom amount",
      monthlyChosen: (amt) => `${amt} every month`,

      // Step 3 — horizon (growth archetype only; DeFi-honest max 10 years)
      step3Question: "How long can it grow? In DeFi, we plan in seasons — up to 10 years.",
      years: (n) => `${n} yr${n !== 1 ? 's' : ''}`,
      yearsShort: "yrs",
      horizonChosen: (n) => `Growing for ${n} years`,

      // Step 4 — strategy personas (renamed from temperament)
      step4Question: "Last thing — where should your money work?",
      personaStableTitle: "Established Stablecoins",
      personaStableDesc: "Stablecoin pools on battle-tested lending & staking protocols, TVL ≥ $50M. Steady 3–8%, boring on purpose.",
      personaStableRisk: "Risk: depeg + contract bug — low odds, never zero.",
      personaRwaTitle: "RWA & Fresh Entries",
      personaRwaDesc: "Tokenized treasuries, real-world-asset yields, and newer-but-credible entries. TradFi yields moving onchain — the fastest-growing corner of DeFi.",
      personaRwaRisk: "Risk: newer instruments, issuer & regulatory risk, thinner history.",
      personaDegenTitle: "Degen LPs",
      personaDegenDesc: "High-APY LP farms, TVL ≥ $10M. These rates are real today and typically last days-to-weeks, requiring active farm-hopping.",
      personaDegenRisk: "Honest: projected at ⅓ of headline rate — farm rates decay fast. For money you can watch wobble.",
      tempChosen: (t) => `${t} pace`,

      // Backward compat aliases for old temperament keys
      tempSleepTitle: "Established Stablecoins",
      tempSleepDesc: "Stablecoin pools on battle-tested protocols.",
      tempSleepRisk: "Risk: depeg + contract bug — low odds, never zero.",
      tempBalancedTitle: "RWA & Fresh Entries",
      tempBalancedDesc: "TradFi yields moving onchain.",
      tempBalancedRisk: "Risk: newer instruments, thinner history.",
      tempBoldTitle: "Degen LPs",
      tempBoldDesc: "High-APY farms — projected at ⅓ headline rate.",
      tempBoldRisk: "Only money you can watch wobble.",

      // Hero answers by archetype
      heroTarget: (goal, date) => `${goal} — yours by ${date}`,
      heroTargetInstant: (goal) => `You could buy ${goal} today — or let yield pay for it`,
      heroTargetSub: (yieldAmt, targetAmt) => `yield chips in ${yieldAmt} of the ${targetAmt}`,
      heroSubscription: (goal, date) => `From ${date}, yield pays for ${goal} — forever`,
      heroSubscriptionFar: (amt) => `Save ${amt} — then yield pays the bill forever`,
      heroSubscriptionForever: (amt, apy) => `The forever number: ${amt} at ${apy} blended`,

      // The bloom
      bloomBuilding: "Planting your garden…",
      bloomHeadline: (amt, years) => `≈ ${amt} in ${years} years`,
      bloomInYears: (years) => `in ${years} years`,
      bloomVsBank: (amt) => `vs ${amt} in a typical 0.5% savings account`,
      bloomDeposited: (amt) => `You'd have deposited ${amt} of your own money`,
      bloomCurveYou: "Your garden",
      bloomCurveBank: "Bank account",

      // Make it yours
      makeItYours: "Make it yours",
      makeItMonthly: "Monthly amount",
      makeItYears: "Time horizon",

      // Primary CTA
      ctaStart: (project) => `Start growing on ${project}`,
      ctaMicrocopy: "Opens protocol • Wallet required",

      // Engine room — pools
      poolsHeading: "The engine behind this plan",
      blendedBadge: (apy) => `Blended rate: ${apy}`,
      degenHaircutNote: (headline) => `Projected at ⅓ haircut (${headline} headline) — farm rates decay. Active management required.`,
      poolApy: "APY",
      poolTvl: "TVL",
      viewPool: "View pool →",
      noPools: "No pools clear this safety bar right now — try a different pace. We only ever show real, live rates.",

      // What-if (legacy, kept for backward compat)
      whatIfHeading: "What if…",
      whatIfMore: "+$200/month",
      whatIfLonger: "+2 years",
      whatIfSafer: "Safer",
      whatIfBolder: "Bolder",

      // Ask box — always-visible chips + curated answers
      askPlaceholder: "Ask anything about this plan…",
      askChipSafe: "Is this safe?",
      askChipRatesDrop: "What if rates drop?",
      askChipCatch: "What's the catch?",
      askChipWithdraw: "Can I withdraw anytime?",
      askChipStop: "What if I stop depositing?",
      askRatesDrop: "Honestly? They will move — these are live rates that change daily. If your blended rate fell by half, your projection would land closer to the bank line but still well ahead over time. That's why we spread across three pools and keep a safety floor.",
      askSafe: "Nothing in DeFi is risk-free, and we'd never pretend otherwise. Established stablecoins sticks to the largest, most-battle-tested protocols to lower the odds — but a depeg or a contract bug is always possible. Never deposit money you can't afford to lose.",
      askCatch: "The catch is real: rates change daily, sometimes dramatically. The projected numbers assume consistency that markets don't guarantee. We show it anyway because even at half the rate, compounding over years beats a 0.5% savings account. Education, not promises.",
      askWithdraw: "These pools are generally liquid — you can usually withdraw any time, though rates aren't locked in and can change the moment you do. Always check the protocol's own terms before depositing.",
      askStop: "If you stop depositing, the money you've already placed keeps earning yield — the compounding just slows because no new capital is joining. Your plan timeline will extend, but the money is still working.",
      askHow: "Every number here comes straight from live DefiLlama pool data, blended and run through our safety filters. We never invent a rate. Pools with absurd APY are filtered out entirely.",
      askApy: "APY means Annual Percentage Yield — how much your deposit earns over a year if the rate holds constant. In DeFi, rates change daily based on supply and demand, so today's APY is a snapshot, not a contract.",
      askAdvice: "This is not financial advice — and we want to be clear about that. We're a calculator that shows what live, public pool rates could theoretically do to your savings. Talk to a financial professional before making real decisions.",
      askFallback: "I'm a gardener, not a guru — here's what I can answer well:",

      disclaimer: "Estimates from live pool rates — they change daily. Education, not advice.",
      share: "Share my garden",
      sharePrepping: "Drawing…",
      shareLink: "Copy link",
      shareLinkCopied: "Copied!",
      shareNative: "Share",
      shareSubline: (amt, years) => `${amt} / month  ·  ${years} years`,
      shareFooter: "Estimates from live pool rates — education, not advice.",
      tendGarden: "Tend your garden",

      // Persona intros
      presetIntro: (name) => `Planning like ${name} — adjust anything to make it yours.`,

      // Return visit — Garden Report (fixed: shows without API)
      reportTitle: "Your garden",
      reportSince: (date) => `Your garden since ${date}`,
      reportOnTrack: "Still on track — your rates are holding steady.",
      reportAhead: "Ahead of plan — rates ticked up since you planted this.",
      reportDipped: "Rates dipped a little — here's the honest impact.",
      reportUpdating: "Checking live rates…",
      reportRateUp: "up",
      reportRateDown: "down",
      reportRateFlat: "steady",
      reportProjectionNow: (amt) => `Now projecting ≈ ${amt}`,
      reportProjectionWas: (amt) => `(was ${amt} when you planted it)`,
      reportTend: "Tend your garden",
      reportFresh: "Start fresh",
      reportPoolGone: "This pool is no longer in the live data — we won't guess its rate.",
      reportHolding: "holding",

      // v3.1 — journey stepper
      journeyPlanted: (date) => `Planted ${date}`,
      journeyGrowing: "Growing now",
      journeyHolding: "rates holding steady",
      journeyMoved: (delta) => `rates moved ${delta}`,

      // v3 yield-funded — funding mode step
      fundingModeQuestion: "How do you want to fund it?",
      fundingCapitalCard: "I have money that could work",
      fundingCapitalDesc: "Put a lump sum to work — your yield pays for it, you keep your money",
      fundingMonthlyCard: "I'll build it monthly",
      fundingMonthlyDesc: "Chip in monthly — we'll show what your garden covers",
      fundingCapitalPrompt: "How much could you put to work?",
      deadlineQuestion: "When do you want it?",
      deadlineNoRush: "No rush",
      deadlineSixMonths: "6 months",
      deadlineThisYear: "This year",

      // v3 — TARGET hero (capital path)
      heroTargetFlip: (capital, goal, date) => `Park ${capital} — your ${goal} pays for itself by ${date}`,
      heroTargetFlipKeep: (capital) => `And you keep the ${capital}.`,
      heroTargetYieldCovers: (pct) => `Your garden covers ${pct}% of the cost`,
      heroTargetFeasibilityTitle: (deadline) => `No honest pool gets you there by ${deadline}.`,
      heroTargetFeasibilityWhat: "What's real:",

      // v3 — persona ladder
      ladderStables: (date) => `Established stables → ${date}`,
      ladderRwa: (date) => `RWA & fresh → ${date}`,
      ladderDegen: (date) => `Degen LPs* → ${date}`,
      ladderDegenNote: "*projected at ⅓ haircut — farm rates decay",

      // v3 — scale-matched comparisons
      comparisonCreditCard: (goal, financed) => `Financed at 24% APR over a year, this ${goal} costs ~${financed} — gardened, it costs $0 of your principal.`,
      comparisonMoneyGone: (target, dateStr, goal) => `Spend ${target} today and it's gone. Garden it and ${dateStr}-you has the ${goal} AND the money.`,

      // v3 — tangibility
      tangibilityLine: (daily, unit) => `Your garden grows ≈ ${daily}/day — a ${unit} every other day`,
      tangibilityCoffee: "coffee",

      // v3 — SUBSCRIPTION hero + ladder
      subHeroWin: (goal) => `Your money pays for ${goal}. Forever. Starting now.`,
      subHeroWinEyebrow: "∞ Forever unlocked",
      subHeroWinCovers: (foreverAmt, billMo, apyStr) => `≈${foreverAmt} covers the ${billMo} bill at ${apyStr} — and you keep every dollar.`,
      subHeroWinSurplus: (amt) => `≈${amt} still growing on top.`,
      subHeroProgress: (pct, goal) => `${pct}% of the way to free ${goal}`,
      subHeroMonthly: (date) => `At +$100/mo you cross in ${date}`,
      subLadderTitle: "What your money covers — forever",
      subLadderUnlocked: "unlocked",
      subLadderProgress: (pct) => `${pct}% there`,
      ladderPlus: (label) => `+ ${label}`,
      ladderYouAreHere: "← you're here",
      hybridDiscount: (pct) => `A permanent ${pct}% discount your money earns you`,

      // v3 — ladder item labels
      ladderSpotify: "Spotify",
      ladderNetflix: "Netflix",
      ladderClaude: "Claude Pro",
      ladderGym: "Gym membership",
      ladderPhoneBill: "Phone bill",

      // v3 — share card
      shareTargetNew: (goal, date) => `My ${goal} is buying itself — by ${date} 🤯`,
      shareSubWin: (goal) => `My yield pays my ${goal} now 🤖💸`,

      // v3 — plan strip
      stripCapital: (amt) => `${amt} capital`,

      // v3.1 — funding context + chip hints
      fundingContextSub: (goal, bill, apy, foreverAmt) => `${goal} costs ${bill}. At ${apy}, you'd need ≈${foreverAmt} parked to cover it forever — and keep your money.`,
      fundingContextTarget: (goal, price) => `${goal} costs ${price}. Park enough capital and the yield buys it — you keep the money.`,
      fundingContextIllustrative: "(illustrative 5.5% — live rates loading)",
      fundingCapitalSubline: "Park a lump sum — the yield pays, you keep the money",
      fundingMonthlySubline: "Grow into it bit by bit",
      chipHintForever: "forever ✓",
      chipHintPctToForever: (pct) => `${pct}% to forever`,
      chipHintYoursBy: (date) => `yours by ${date}`,
      chipHintForeverBy: (date) => `forever by ${date}`,

      // Engine filter chips (pool swap/filter UI)
      engineFilterChain: "Chain",
      engineFilterToken: "Token",
      engineAll: "All",
      engineSwap: "Swap",
      engineSwapAlt: "Pick this pool",
      engineSwapClose: "Close",

      // Return-visit dashboard — elapsed + estimated growth
      reportElapsedDays: (n) => n === 1 ? 'Planted 1 day ago' : `Planted ${n} days ago`,
      reportEarnedEst: (amt) => `≈${amt} grown so far (estimate)`,

      // Return-visit dashboard — subscription covers + next rung
      reportCovers: (list) => `Covered forever: ${list}`,
      reportNext: (label, amt) => `Next: + ${label} at ≈${amt}`,
      reportNextPct: (pct, label) => `${pct}% toward covering ${label}`
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
    // 가든 플래너 v2
    planner: {
      pageTitle: "가든 플래너 🌱 | 목표 중심 DeFi 저축 계획 — DeFi Garden",
      metaDescription: "목표부터 시작하는 DeFi 저축 플래너. 무엇을 위해 매달 얼마를 모을 수 있는지 알려주시면, 실시간 풀 수익률로 얼마나 키울 수 있는지 보여드립니다. 모든 숫자는 DefiLlama 실시간 데이터입니다. 투자 조언이 아닌 교육용입니다.",

      title: "가든 플래너",
      tagline: "목표를 심고, 자라는 걸 지켜보세요.",
      startFresh: "처음부터 다시",
      back: "뒤로",
      myGarden: "내 정원",

      thinking: "답을 키우는 중…",

      step1Question: "함께 무언가를 키워봐요. 무엇을 위해 모으고 계신가요?",
      catSubscriptions: "구독 서비스",
      catGadgets: "가젯",
      catLife: "큰 목표",
      goalSpotify: "스포티파이",
      goalNetflix: "넷플릭스",
      goalClaude: "Claude Pro",
      goalMobile: "통신 요금제",
      goalRetirement: "은퇴 자금",
      goalHome: "내 집 마련",
      goalSneakers: "새 운동화",
      goalIphone: "새 아이폰",
      freeTextPlaceholder: "…아니면 직접 말씀해 주세요",
      freeTextNudge: "제대로 도와드리고 싶어요 — 우선 이 중에서 하나 골라볼까요? 언제든 바꿀 수 있어요.",
      youPicked: (goal) => `${goal} 모으기`,
      sharedPlanIntro: "누군가 정원을 공유했어요 — 내 것으로 만들어 보세요.",

      step2Question: (goal) => `좋아요 — ${goal}이군요. 매달 얼마나 따로 모을 수 있을까요?`,
      step2QuestionPlain: "매달 얼마나 따로 모을 수 있을까요?",
      customAmount: "직접 입력",
      monthlyChosen: (amt) => `매달 ${amt}`,

      step3Question: "얼마나 오래 키울 수 있나요? DeFi에서는 시즌 단위로 계획해요 — 최대 10년.",
      years: (n) => `${n}년`,
      yearsShort: "년",
      horizonChosen: (n) => `${n}년 동안 키우기`,

      step4Question: "마지막으로 — 내 돈이 어디서 일하면 좋을까요?",
      personaStableTitle: "검증된 스테이블코인",
      personaStableDesc: "검증된 대출·스테이킹 프로토콜의 스테이블코인 풀, TVL ≥ $50M. 꾸준히 3~8%, 의도적으로 평범하게.",
      personaStableRisk: "위험: 디페그 + 컨트랙트 버그 — 낮은 확률, 0은 아님.",
      personaRwaTitle: "RWA & 신흥 프로토콜",
      personaRwaDesc: "토큰화된 국채, 실물 자산 수익률, 신뢰할 수 있는 신규 항목. TradFi 수익률이 온체인으로 — DeFi에서 가장 빠르게 성장하는 영역.",
      personaRwaRisk: "위험: 새로운 금융상품, 발행자·규제 리스크, 얇은 역사.",
      personaDegenTitle: "디젠 LP",
      personaDegenDesc: "고수익 LP 팜, TVL ≥ $10M. 이 수익률은 지금 실재하며 보통 며칠~몇 주 지속돼요. 적극적인 농장 이동이 필요합니다.",
      personaDegenRisk: "솔직히: 헤드라인 수익률의 ⅓로 투영 — 팜 수익률은 빠르게 감소. 흔들려도 괜찮은 돈으로만.",
      tempChosen: (t) => `${t} 속도`,

      tempSleepTitle: "검증된 스테이블코인",
      tempSleepDesc: "검증된 프로토콜의 스테이블코인 풀만.",
      tempSleepRisk: "위험: 디페그 + 컨트랙트 버그.",
      tempBalancedTitle: "RWA & 신흥 프로토콜",
      tempBalancedDesc: "TradFi 수익률이 온체인으로.",
      tempBalancedRisk: "위험: 새로운 금융상품, 얇은 역사.",
      tempBoldTitle: "디젠 LP",
      tempBoldDesc: "고수익 팜 — 헤드라인 수익률의 ⅓로 투영.",
      tempBoldRisk: "흔들려도 괜찮은 돈으로만.",

      heroTarget: (goal, date) => `${goal} — ${date}까지 모아요`,
      heroTargetInstant: (goal) => `${goal}은 지금 바로 살 수 있어요 — 수익률로 내도록 할 수도 있어요`,
      heroTargetSub: (yieldAmt, targetAmt) => `${targetAmt} 중 ${yieldAmt}은 수익률이 내줘요`,
      heroSubscription: (goal, date) => `${date}부터 수익률이 ${goal}을 영원히 내줘요`,
      heroSubscriptionFar: (amt) => `${amt}만 모으면 — 수익률이 영구적으로 비용을 내줘요`,
      heroSubscriptionForever: (amt, apy) => `영원한 수: ${apy} 수익률에서 ${amt}`,

      bloomBuilding: "정원을 심는 중…",
      bloomHeadline: (amt, years) => `${years}년 후 약 ${amt}`,
      bloomInYears: (years) => `${years}년 후`,
      bloomVsBank: (amt) => `일반 0.5% 예금이라면 ${amt}`,
      bloomDeposited: (amt) => `직접 넣은 원금은 ${amt}`,
      bloomCurveYou: "내 정원",
      bloomCurveBank: "예금 계좌",

      makeItYours: "내 것으로 만들기",
      makeItMonthly: "월 금액",
      makeItYears: "기간",

      ctaStart: (project) => `${project}에서 키우기 시작`,
      ctaMicrocopy: "프로토콜 열기 • 지갑 필요",

      poolsHeading: "이 계획을 떠받치는 엔진",
      blendedBadge: (apy) => `혼합 수익률: ${apy}`,
      degenHaircutNote: (headline) => `⅓ 할인 적용 (헤드라인 ${headline}) — 팜 수익률은 빠르게 감소. 적극적 관리 필요.`,
      poolApy: "APY",
      poolTvl: "TVL",
      viewPool: "풀 보기 →",
      noPools: "지금은 이 안전 기준을 통과하는 풀이 없어요 — 다른 속도를 골라보세요. 저희는 언제나 실시간 수익률만 보여드립니다.",

      whatIfHeading: "만약에…",
      whatIfMore: "+매달 $200",
      whatIfLonger: "+2년",
      whatIfSafer: "더 안전하게",
      whatIfBolder: "더 과감하게",

      askPlaceholder: "이 계획에 대해 무엇이든 물어보세요…",
      askChipSafe: "안전한가요?",
      askChipRatesDrop: "수익률이 떨어지면?",
      askChipCatch: "단점이 뭔가요?",
      askChipWithdraw: "언제든 출금 가능한가요?",
      askChipStop: "입금을 멈추면?",
      askRatesDrop: "솔직히요? 수익률은 움직입니다 — 매일 변하는 실시간 수치예요. 혼합 수익률이 절반으로 떨어져도, 예측치는 예금 선에 가까워지지만 시간이 지나면 여전히 훨씬 앞섭니다. 그래서 세 개 풀에 나누고 안전 기준선을 둡니다.",
      askSafe: "DeFi에 위험이 전혀 없는 건 없고, 그렇게 꾸미지 않겠습니다. 검증된 스테이블코인은 가장 큰 프로토콜의 풀만 골라 가능성을 낮추지만, 디페그나 컨트랙트 버그는 언제든 생길 수 있어요. 잃어도 괜찮은 돈만 넣으세요.",
      askCatch: "단점은 실재해요: 수익률은 매일, 때로는 급격하게 변합니다. 예측 숫자는 시장이 보장하지 않는 일관성을 가정해요. 그래도 보여드리는 이유는 절반의 수익률에서도 수년간의 복리는 0.5% 예금을 이깁니다. 약속이 아닌 교육이에요.",
      askWithdraw: "이 풀들은 대체로 유동성이 좋아 보통 언제든 출금할 수 있어요. 다만 수익률은 고정이 아니라 출금하는 순간에도 바뀔 수 있습니다. 입금 전에 항상 프로토콜 약관을 확인하세요.",
      askStop: "입금을 멈춰도 이미 넣은 돈은 계속 수익을 내요 — 새 자금이 없으니 복리 속도만 느려질 뿐입니다. 계획 기간이 늘어나지만 돈은 계속 일해요.",
      askHow: "여기 모든 숫자는 DefiLlama 실시간 풀 데이터를 그대로 가져와 혼합하고 안전 필터를 거친 값입니다. 수익률을 지어내지 않아요. 말도 안 되게 높은 APY 풀은 아예 걸러냅니다.",
      askApy: "APY는 연간 수익률 — 수익률이 일정하게 유지될 때 예금이 1년에 얼마나 버는지를 의미해요. DeFi에서는 수요와 공급에 따라 수익률이 매일 바뀌므로, 오늘의 APY는 스냅샷이지 계약이 아닙니다.",
      askAdvice: "이것은 투자 조언이 아닙니다 — 명확히 말씀드리고 싶어요. 저희는 실시간 공개 풀 수익률이 저축에 이론상 어떤 영향을 미치는지 보여주는 계산기입니다. 실제 결정 전에 금융 전문가와 상담하세요.",
      askFallback: "저는 전문가가 아니라 정원사예요 — 제가 잘 답할 수 있는 것들:",

      disclaimer: "실시간 풀 수익률 기반 추정치이며 매일 변동됩니다. 투자 조언이 아닌 교육용입니다.",
      share: "내 정원 공유하기",
      sharePrepping: "그리는 중…",
      shareLink: "링크 복사",
      shareLinkCopied: "복사됨!",
      shareNative: "공유",
      shareSubline: (amt, years) => `매달 ${amt}  ·  ${years}년`,
      shareFooter: "실시간 풀 수익률 기반 추정치 — 투자 조언이 아닌 교육용입니다.",
      tendGarden: "내 정원 가꾸기",

      presetIntro: (name) => `${name}님처럼 계획해 봐요 — 무엇이든 바꿔 내 것으로 만드세요.`,

      reportTitle: "내 정원",
      reportSince: (date) => `${date}부터 키운 내 정원`,
      reportOnTrack: "여전히 순조로워요 — 수익률이 안정적으로 유지되고 있어요.",
      reportAhead: "계획보다 앞서가요 — 심은 뒤로 수익률이 올랐어요.",
      reportDipped: "수익률이 조금 내렸어요 — 솔직한 영향을 보여드릴게요.",
      reportUpdating: "실시간 수익률 확인 중…",
      reportRateUp: "상승",
      reportRateDown: "하락",
      reportRateFlat: "유지",
      reportProjectionNow: (amt) => `현재 예측 약 ${amt}`,
      reportProjectionWas: (amt) => `(심었을 땐 ${amt})`,
      reportTend: "내 정원 가꾸기",
      reportFresh: "처음부터 다시",
      reportPoolGone: "이 풀은 더 이상 실시간 데이터에 없어요 — 수익률을 추측하지 않겠습니다.",
      reportHolding: "유지 중",

      // v3.1 — journey stepper
      journeyPlanted: (date) => `${date}에 심었어요`,
      journeyGrowing: "자라는 중",
      journeyHolding: "수익률이 안정적이에요",
      journeyMoved: (delta) => `수익률이 ${delta} 변동됐어요`,

      // v3 yield-funded — funding mode step
      fundingModeQuestion: "어떻게 마련할 건가요?",
      fundingCapitalCard: "굴릴 돈이 있어요",
      fundingCapitalDesc: "목돈을 굴리세요 — 수익이 목표를 채우고, 원금은 그대로예요",
      fundingMonthlyCard: "매달 조금씩 넣을게요",
      fundingMonthlyDesc: "매달 적립하면 정원이 얼마나 채워주는지 보여드려요",
      fundingCapitalPrompt: "얼마나 굴릴 수 있나요?",
      deadlineQuestion: "언제까지 갖고 싶으세요?",
      deadlineNoRush: "여유있게",
      deadlineSixMonths: "6개월 안에",
      deadlineThisYear: "올해 안에",

      // v3 — TARGET hero (capital path)
      heroTargetFlip: (capital, goal, date) => `${capital}을 굴리면 — ${date}에 ${goal}이 저절로 생겨요`,
      heroTargetFlipKeep: (capital) => `그리고 ${capital}은 그대로 남아 있어요.`,
      heroTargetYieldCovers: (pct) => `정원이 비용의 ${pct}%를 채워줘요`,
      heroTargetFeasibilityTitle: (deadline) => `${deadline}까지는 어떤 풀도 솔직히 불가능해요.`,
      heroTargetFeasibilityWhat: "현실적으로는:",

      // v3 — persona ladder
      ladderStables: (date) => `안정 스테이블 → ${date}`,
      ladderRwa: (date) => `RWA & 신규 → ${date}`,
      ladderDegen: (date) => `데겐 LP* → ${date}`,
      ladderDegenNote: "*수익률의 ⅓로 예상 — 팜 수익은 금방 줄어들어요",

      // v3 — scale-matched comparisons
      comparisonCreditCard: (goal, financed) => `24% APR 할부로 구매하면 이 ${goal}은 ${financed} — 정원을 가꾸면 원금 $0으로 얻어요.`,
      comparisonMoneyGone: (target, dateStr, goal) => `지금 ${target}을 쓰면 사라져요. 정원을 가꾸면 ${dateStr}에 ${goal}도 생기고 돈도 남아요.`,

      // v3 — tangibility
      tangibilityLine: (daily, unit) => `지금 내 정원은 하루 약 ${daily}씩 자라요 — 이틀에 ${unit} 한 번`,
      tangibilityCoffee: "커피",

      // v3 — SUBSCRIPTION hero + ladder
      subHeroWin: (goal) => `내 돈이 ${goal}을 영원히 내줘요. 지금 바로.`,
      subHeroWinEyebrow: "∞ 영구 달성",
      subHeroWinCovers: (foreverAmt, billMo, apyStr) => `≈${foreverAmt}이 ${apyStr}로 ${billMo} 요금을 커버해요 — 원금은 그대로예요.`,
      subHeroWinSurplus: (amt) => `≈${amt}는 추가로 불어나는 중이에요.`,
      subHeroProgress: (pct, goal) => `무료 ${goal}까지 ${pct}% 왔어요`,
      subHeroMonthly: (date) => `매달 +$100 추가하면 ${date}에 달성해요`,
      subLadderTitle: "내 돈이 영원히 내주는 것들",
      subLadderUnlocked: "달성",
      subLadderProgress: (pct) => `${pct}% 달성`,
      ladderPlus: (label) => `+ ${label}`,
      ladderYouAreHere: "← 여기예요",
      hybridDiscount: (pct) => `내 돈이 벌어주는 영구 ${pct}% 할인`,

      // v3 — ladder item labels
      ladderSpotify: "Spotify",
      ladderNetflix: "Netflix",
      ladderClaude: "Claude Pro",
      ladderGym: "헬스장 회원권",
      ladderPhoneBill: "휴대폰 요금",

      // v3 — share card
      shareTargetNew: (goal, date) => `내 ${goal}이 저절로 사지고 있어요 — ${date}까지 🤯`,
      shareSubWin: (goal) => `이제 수익이 내 ${goal}을 내줘요 🤖💸`,

      // v3 — plan strip
      stripCapital: (amt) => `${amt} 원금`,

      // v3.1 — funding context + chip hints
      fundingContextSub: (goal, bill, apy, foreverAmt) => `${goal}은 ${bill}이에요. ${apy} 수익률에서 ${foreverAmt}을 굴리면 영원히 낼 수 있어요 — 원금은 그대로예요.`,
      fundingContextTarget: (goal, price) => `${goal}은 ${price}예요. 충분한 자본을 굴리면 수익이 사줘요 — 원금은 남아요.`,
      fundingContextIllustrative: "(예시 5.5% — 실시간 수익률 로딩 중)",
      fundingCapitalSubline: "목돈을 굴려요 — 수익이 내주고, 원금은 그대로",
      fundingMonthlySubline: "매달 조금씩 키워가요",
      chipHintForever: "영구 달성 ✓",
      chipHintPctToForever: (pct) => `달성까지 ${pct}%`,
      chipHintYoursBy: (date) => `${date}에 내 것`,
      chipHintForeverBy: (date) => `${date}에 영구 달성`,

      // Engine filter chips (pool swap/filter UI)
      engineFilterChain: "체인",
      engineFilterToken: "토큰",
      engineAll: "전체",
      engineSwap: "교체",
      engineSwapAlt: "이 풀로 바꾸기",
      engineSwapClose: "닫기",

      // Return-visit dashboard — elapsed + estimated growth
      reportElapsedDays: (n) => n === 1 ? '심은 지 1일 됐어요' : `심은 지 ${n}일 됐어요`,
      reportEarnedEst: (amt) => `지금까지 약 ${amt} 자란 것으로 추정돼요`,

      // Return-visit dashboard — subscription covers + next rung
      reportCovers: (list) => `영구 커버: ${list}`,
      reportNext: (label, amt) => `다음: + ${label} (≈${amt} 필요)`,
      reportNextPct: (pct, label) => `${label} 커버까지 ${pct}%`
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