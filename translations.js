// Multi-language translation system
//
// backlog 254: the shared source of truth for the two trust-rail-stating
// leaves below (landing.trustFloor, planner.personaDegenDesc, en+ko) — see
// trust-rails.js's own header for why. This file is BOTH a plain browser
// <script> (no module system there — reads `window.TRUST_RAILS`, set by a
// synchronous, non-deferred `<script src="trust-rails.js">` tag placed
// before this one in home.html/plan.html's <head>, same load-order
// guarantee canonical.js already relies on) AND a Node-requireable module
// (see the `module.exports` guard at the bottom of this file) — this guard
// mirrors that duality in the opposite direction.
const TRUST_RAILS = (typeof module !== 'undefined' && module.exports)
  ? require('./trust-rails.js')
  : (typeof window !== 'undefined' ? window.TRUST_RAILS : null);

const translations = {
  en: {
    // Search
    searchPlaceholder: "Search for a token...",
    searchHint: "Try searching for 'ETH on Arbitrum' or 'USDC lending'",
    tokenSearch: "Token search",
    feelingDegen: "I'm feeling degen",
    
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

    // Nav category tabs
    navCatAll: "All",
    navCatLending: "Lending",
    navCatStaking: "Staking",
    navCatLpDex: "LP/DEX",
    navCatRwa: "RWA",
    navCatYieldDerivatives: "Yield Derivatives",

    // Nav filter buttons (default/unselected labels)
    navFilterChains: "Chains",
    navFilterTvl: "TVL",
    navFilterProtocols: "Protocols",
    navFilterApy: "APY",

    // Results
    // 241: string-safe plurality check — count arrives pre-formatted en-US
    // (a string, e.g. "1,976") via the accessor's formatCount mapping, so a
    // numeric `!== 1` would always be true and this would never say "1 pool".
    showingResults: (count) => `${count} pool${String(count) !== '1' ? 's' : ''} found`,
    chainYields: (chain) => `${chain} DeFi Yields`,
    tokenYields: (token, chain) => `Yields for ${token}${chain ? ` on ${chain}` : ''}`,
    sortByLabel: "Sort by:",
    // 225 round 3 increment (a): results panel column labels + sort-control text
    resultsColPool: "Pool",
    resultsColApy: "APY",
    resultsColTvl: "TVL",

    // Pool card labels
    totalApy: "Total APY",
    baseApy: "Base APY:",
    rewardApy: "Reward APY:",
    baseApyBreakdown: (apy) => `${apy}% Base`,
    rewardApyBreakdown: (apy) => `+ ${apy}% Rewards`,
    rateVolatilityNote: (current, mean) => `This pool's rate moves a lot: ${current} right now vs a ${mean} 30-day average. Reward emissions change daily — projections on this page use the current rate and will move with it.`,
    rateTrackRecordNew: "We're still building this pool's rate history — not a long enough track record yet to judge how steady it is. A longer history makes a rate easier to trust.",
    rateTrackRecordSteady: (hp) => `Steady so far: across the ${hp} days we've tracked it, this pool's rate has stayed close to level. Steadier rates are easier to plan a garden around.`,
    rateTrackRecordTracked: (hp) => `We've been tracking this pool's rate for ${hp} days. Watching how a rate holds up over time is one honest way to judge it.`,
    rateHistoryUnavailable: "We don't have a rate history for this pool — we track rates day by day only for the largest pools, so there's nothing here to judge how steady this one has been. The rate above is live from DefiLlama.",
    sortByRiskAdjusted: "Risk-adjusted",
    rateMomentumRising: (delta, hp) => `This pool's rate has climbed about ${delta} over the ${hp} days we've tracked it. Rates that rose can slip back just as easily — this page projects on today's rate, not the climb.`,
    rateMomentumFalling: (delta, hp) => `This pool's rate has eased down about ${delta} over the ${hp} days we've tracked it. Falling rates are normal once reward emissions taper — worth knowing before you plan a garden around today's number.`,
    tvlTrendShrinking: (pct, hp) => `This pool's deposits have shrunk about ${pct} over the ${hp} days we've tracked it. A pool can keep clearing our $10M size floor while quietly losing deposits — worth watching for a garden you plan to hold for years.`,
    tvlTrendGrowing: (pct, hp) => `This pool's deposits have grown about ${pct} over the ${hp} days we've tracked it. More deposits isn't a guarantee, but a pool that's holding or gaining size is one honest sign of staying power.`,
    opensProtocol: "Opens protocol • Wallet required",
    gardenThisPoolCta: "Garden this pool →",
    repeatCtaHeading: "Ready to start this garden?",
    plannerCtaHint: "No wallet needed",
    protocol: "Protocol↗",
    calculateYield: "View & calculate →",
    startEarning: "Start Earning",
    startEarningOn: (protocol) => `Start Earning on ${protocol}`,
    // spec 182 leg B/D — honest DefiLlama fallback for the true-null CTA case
    // (no protocol URL resolves in any tier). Must not impersonate the
    // protocol CTA above: different copy, names DefiLlama as the destination.
    viewOnDefillama: "View this pool on DefiLlama",
    opensDefillamaFallback: "No protocol link available · Opens DefiLlama, our data source",

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
    // 241: the accessor chokepoint (createTranslationFunction) already
    // formats a raw numeric `amount` en-US via the shared formatCount before
    // this function ever runs — re-parsing an already-formatted "1,234"-
    // shaped string with Number(amount).toLocaleString() turns it into "NaN"
    // (Number() cannot parse a comma-grouped string). formatCount(amount) is
    // idempotent (identity on an already-formatted string) and still formats
    // a raw number for any caller that reaches this entry directly, bypassing
    // the accessor — same shared formatter, not re-implemented.
    dailyEarningsSubLabel: (amount) => `on $${formatCount(amount) || 0}`,
    monthlyEarningsSubLabel: (amount) => `on $${formatCount(amount) || 0}`,
    estimatedEarnings: "Estimated Earnings",
    estimatedDailyEarnings: "Estimated Daily Earnings",
    estimatedMonthlyEarnings: "Estimated Monthly Earnings",
    
    // Empty states and errors
    loadingYields: "Loading live pools…",
    noYieldsFound: (token) => `No yields found for ${token}`,
    noYieldsFoundChain: (chain) => `No yields found on ${chain} with current filters`,
    adjustFilters: "Try adjusting your filters or searching for a different token",
    adjustFiltersChain: "Try adjusting your TVL or APY filters, or select a different chain",
    resetFilters: "Reset Filters",
    showSmallerPools: "Show pools with lower TVL",
    loadingError: "Failed to load yield data. Please try again later.",
    tvlTrendShrinking: (pct, hp) => `This pool's deposits have shrunk about ${pct} over the ${hp} days we've tracked it. A pool can keep clearing our $100K size floor while quietly losing deposits — worth watching for a garden you plan to hold for years.`,
    emptyStateExplanation: (token) => `No live pools for ${token} clear our $100K minimum-TVL safety floor today.`,
    emptyStateExplanationChain: (chain) => `No live pools on ${chain} clear our $100K minimum-TVL safety floor today.`,
    poolNotFoundTitle: "This pool is no longer tracked",
    poolNotFoundExplanation: "This pool may have been delisted or migrated by its protocol. Here are trustworthy alternatives that clear our $100K safety floor.",
    emptyStateAltHeadingChain: (chain) => `Live pools on ${chain} above the $100K floor`,
    emptyStateAltHeadingStable: "Popular stablecoin pools above the $100K floor",
    deadPoolRecoveryPrompt: "Looking for active yields? Explore top assets & protocols:",
    deadPoolAltHeading: "Verified alternatives clearing our $100K safety floor:",

    // Navigation
    backToSearch: "← Back to Search",
    
    // Pool detail labels
    poolInformation: "Pool Information",
    poolType: "Pool Type", 
    underlyingAssets: "Underlying Assets",
    calculateYourEarnings: "Calculate Your Earnings",
    calcSubPrompt: "See your daily, weekly & monthly returns",
    // 241: see dailyEarningsSubLabel's comment above — formatCount() reused,
    // not re-parsed via Number().
    basedOnInvestment: (amount) => `Based on $${formatCount(amount) || 0} investment`,
    verified: "✓ Verified",
    // 225 round 3 increment (a): plain secondary metadata line, sentence
    // case, middle-dot separator — no "on " prefix, no bullet glyph, no
    // link arrow (the row already navigates on click; the arrow implied an
    // outbound link this text never was).
    onProtocolChain: (protocol, chain) => `${protocol} · ${chain}`,
    poolProtocolLogoAlt: (project) => `${project} logo`,
    poolChainLogoAlt: (chain) => `${chain} logo`,
    tvl: "TVL",
    noSupplyYield: "No supply yield",
    apyMean30d: "30d Mean APY",
    exposure: "Exposure",
    ilRisk: "IL Risk",
    yes: "Yes",
    no: "No",

    // Honest mini-projection (pool-detail)
projectionHeading: "The long game",
    // 241: see dailyEarningsSubLabel's comment above — formatCount() reused,
    // not re-parsed via Number(). `amount` (the compounded projection figure)
    // must arrive already rounded to a whole dollar from the caller — see
    // PoolDetail.js / generate-pool-pages.js's Math.round() at the t() call
    // site — since formatCount doesn't itself apply maximumFractionDigits:0.
    projectionBody: (principal, years, amount) => `$${formatCount(principal) || 0} in this pool grows to ~$${formatCount(amount) || 0} in ${years}y at current rates.`,
    // 165: anomalous-rate replacement for projectionBody — no numbers to rail.
    projectionBodyOutOfRange: "This rate is too far outside normal ranges to project a dollar amount from — the number would be fiction, not a forecast.",
    projectionKeepNote: "Your deposit stays yours — you keep your money, and it keeps working.",
    // 241: see projectionBody's comment above (same whole-dollar-rounding contract).
    gardenThisPoolCtaConcrete: (amount, years) => `Garden this pool → ~$${formatCount(amount) || 0} in ${years}y`,
    poolDegenHaircutNote: (headline) => `Projected at ⅓ haircut (${headline} headline) — farm rates decay. Active management required.`,

    // Calculator disclaimers
    calcDisclaimer: "Estimates based on current rates — yields change constantly. Not financial advice.",
    calcAnomalyWarning: "⚠ This rate is anomalous and almost certainly unsustainable.",

    // Footer
    poweredBy: "Powered by",
    defillamaApi: "DefiLlama API",
    footerSignOff: "Education, not advice.",
    browseTokens: "Browse tokens",
    browseChains: "Browse chains",

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

    // Search-first landing
    landing: {
      pageTitle: "DeFi Garden 🌱 | Find your next yield",
      metaDescription: "Search live DeFi yields across every chain, then plant a garden around what you want to grow. Education, not advice.",
      navSearch: "Search yields",
      navGarden: "My garden",
      navHowItWorks: "How it works",
      navPrimary: "Primary navigation",
      navMobile: "Mobile navigation",
      navMenu: "Open menu",
      navClose: "Close menu",
      themeLight: "Switch to light mode",
      themeDark: "Switch to dark mode",
      languageEnglish: "Switch to English",
      languageKorean: "Switch to Korean",
      heroTitleBefore: "Find yield with a",
      heroTitleAccent: "little more clarity.",
      heroBody: "Search live DeFi pools across every chain, then plant a garden around what you want to grow.",
      searchLabel: "Search live DeFi yields",
      searchPlaceholder: "Try USDC, ETH on Arbitrum, or lending…",
      searchSubmit: "Search yields",
      examplesLabel: "Start with a search",
      exampleUsdc: "USDC on Base",
      examplePendle: "Pendle PTs",
      exampleMorpho: "Morpho vaults",
      exampleKamino: "Kamino lending",
      gardenTitle: "Have a goal in mind?",
      gardenBody: "Plant a garden and see what honest, live rates could grow over time.",
      gardenCta: "Plant a garden",
      gardenNote: "No wallet needed to plan",
      trustLive: "Live DefiLlama data",
      // backlog 254: derives from TRUST_RAILS (trust-rails.js) so this never
      // re-drifts from DEFAULT_MIN_TVL the way the hand-typed "$10M" did.
      // Function leaf so the existing dictionary mechanism needs no change
      // (createTranslationFunction already applies params to function
      // leaves) — resolves omitted/nullish input to the live value so every
      // existing zero-arg call site renders correctly without reducing Function.length.
      trustFloor: (floor) => {
        const value = floor == null ? TRUST_RAILS && TRUST_RAILS.formatTvlFloor(TRUST_RAILS.DEFAULT_MIN_TVL) : floor;
        return `${value} minimum TVL`;
      },
      trustEducation: "Education, not advice",
      trustHeading: "A calmer way to explore yield.",
      trustBody: "Clear entry points, honest numbers, and a next step that makes sense.",
      searchFallback: "Search",
      returnCaption: "Welcome back",
      returnStatus: (date) => `Planted ${date}`,
      returnCta: "Tend your garden"
    },

    // Garden Planner v2
    planner: {
      // Page meta
      pageTitle: "Garden Planner 🌱 | Plan your DeFi savings by goal — DeFi Garden",
      metaDescription: "A goal-first DeFi savings planner. Tell us what you're saving for and how much you can set aside each month — we'll show what live, real pool rates could grow it into. Every number is live DefiLlama data. Education, not advice.",

      // Header
      title: "Pay your bills with yield, forever",
      tagline: "Tell us what you need. Live DeFi yield covers it automatically.",
      startFresh: "Start fresh",
      back: "Back",
      myGarden: "My garden",

      // Thinking indicator
      thinking: "Growing your answer…",

      // Step 1 — goal
      step1Question: "Let's grow something. What are you saving for?",
      splashHook: "Park money once — its yield pays the bill forever, and you keep every dollar.",
      splashHookLive: (apy) => `Park money once — at today's ${apy} blended rate, the yield pays your bill forever and you keep every dollar.`,
      catSubscriptions: "Subscriptions",
      catBills: "Monthly bills",
      catGadgets: "Gadgets",
      catLife: "Big goals",
      goalSpotify: "Spotify",
      goalNetflix: "Netflix",
      goalClaude: "Claude Pro",
      goalAmazonPrime: "Amazon Prime",
      goalDisney: "Disney+",
      goalYouTubePremium: "YouTube Premium",
      goalMax: "Max",
      goalHulu: "Hulu",
      goalAppleTV: "Apple TV+",
      goalChatGPT: "ChatGPT Plus",
      goalGamePass: "Game Pass",
      goalParamount: "Paramount+",
      goalPeacock: "Peacock",
      goalDoorDash: "DoorDash",
      goalUberOne: "Uber One",
      goalAudible: "Audible",
      goalWalmart: "Walmart+",
      goalMore: "More…",
      goalLess: "Show less",
      goalRetirement: "Retirement",
      goalHome: "A home",
      goalSneakers: "Fresh sneakers",
      goalIphone: "New iPhone",
      goalWatches: "A nice watch",
      goalRent: "Rent",
      goalPhoneBill: "Phone bill",
      freeTextPlaceholder: "…or tell me in your own words",
      freeTextNudge: "I want to get this right — let's start with one of these for now. You can always change it.",
      youPicked: (goal) => `Saving for ${goal}`,
      sharedPlanIntro: "Someone shared their garden — make it yours.",
      sharedPlanIntroPool: "Prefilled from the pool you picked — make it yours.",

      // Step 2 — monthly
      step2Question: (goal) => `Lovely — ${goal.toLowerCase()} it is. How much could you set aside each month?`,
      step2QuestionPlain: "How much could you set aside each month?",
      customAmount: "Custom amount",
      monthlyChosen: (amt) => `${amt} every month`,

      // Step 3 — horizon (growth archetype only; DeFi-honest max 10 years)
      step3Question: "How long can it grow? In DeFi, we plan in seasons — up to 10 years.",
      // 241: string-safe (see showingResults above) — n arrives pre-formatted.
      years: (n) => `${n} yr${String(n) !== '1' ? 's' : ''}`,
      yearsShort: "yrs",
      horizonChosen: (n) => `Growing for ${n} years`,

      // Step 4 — strategy personas (renamed from temperament)
      step4Question: "Last thing — where should your money work?",
      personaStableShort: "Sleep-easy",
      personaRwaShort: "Balanced",
      personaDegenShort: "Bold",
      personaStableTitle: "Safe & Steady",
      personaStableDesc: "Stablecoin pools on battle-tested lending & staking protocols, TVL ≥ $50M. Steady 3–8%, boring on purpose.",
      personaStableRisk: "Very low risk — rare chance of stablecoin depeg or contract bug",
      personaRwaTitle: "Diversified",
      personaRwaDesc: "Tokenized treasuries, real-world-asset yields, and newer-but-credible entries. TradFi yields moving onchain — the fastest-growing corner of DeFi.",
      personaRwaRisk: "Moderate risk — some regulatory uncertainty on newer products",
      personaDegenTitle: "High Yield",
      // backlog 254: see landing.trustFloor above — same TRUST_RAILS derivation.
      personaDegenDesc: (floor) => {
        const value = floor == null ? TRUST_RAILS && TRUST_RAILS.formatTvlFloor(TRUST_RAILS.DEFAULT_MIN_TVL) : floor;
        return `High-APY LP farms, TVL ≥ ${value}. These rates are real today and typically last days-to-weeks, requiring active farm-hopping.`;
      },
      personaDegenRisk: "Honest: projected at ⅓ of shown rate — high yields decay fast",
      personaProj: (amt, yrs, apy) => `≈ ${amt} in ${yrs} yrs at ${apy}%`,
      personaProjYield: (yld, apy) => `≈ ${yld}/mo at ${apy}%`,
      personaApyLabel: "effective APY",
      monthlyChipHint: (amt, yrs) => `→ ${amt} in ${yrs} yrs`,
      checkoutYourPlan: "Your plan",
      checkoutCapital: "Capital needed",
      checkoutApy: "Blended APY",
      checkoutMonthlyYield: "Monthly yield",
      checkoutYouKeep: "You keep",
      checkoutYouKeepVal: "Your capital + gains",
      checkoutMonthly: "Monthly deposit",
      checkoutTimeline: "Timeline",
      checkoutProjected: "Projected value",
      checkoutPriceLabelCapital: "one-time capital",
      checkoutPriceLabelMonthly: "monthly deposit",
      checkoutModeOneTime: "One-time",
      checkoutModeMonthly: "Monthly",
      checkoutHeroSub: (yld) => `generates ${yld}/mo — yours to keep`,
      checkoutHeroGrowth: (amt, yrs) => `grows to ${amt} in ${yrs} yrs`,
      trustSelfCustody: "Self-custody",
      trustYourKeys: "Your keys",
      trustWithdraw: "Withdraw anytime",
      checkoutNote: "Live rates from DefiLlama · Education, not advice",
      arrivalBannerText: "Someone sent you this garden — it's already set up and ready to grow.",
      arrivalBannerTextPool: "Here's your plan, prefilled from the pool you picked — make it yours.",
      arrivalBannerCta: "Make it mine",
      arrivalBannerDismiss: "Close",
      riskEdit: "Customize",
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
      planConfidenceSteady: (days) => `This garden is built on pools whose rates have held steady across the ${days} days we've tracked them — steadier rates make a plan easier to trust.`,
      planConfidencePartial: (n, total) => `${n} of the ${total} pools behind this plan have a steady track record so far; we're still building history for the rest.`,
      planConfidenceBuilding: "We're still building a track record for the pools behind this plan — a longer history makes a blended rate easier to trust.",
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

      caveatRates: "Today's rates are live and change every day — your real numbers will move with them.",
      caveatHack: "No protocol is hack-proof. Smart contracts can fail or be exploited, and you could lose funds. Education, not advice.",
      // 241: string-safe (see showingResults above) — months arrives pre-formatted.
      speedupDisciplined: (amt, months) => `Tuck away ${amt}/mo on top and you'd reach it about ${months} month${String(months) === '1' ? '' : 's'} sooner.`,

      disclaimer: "Estimates from live pool rates — they change daily. Education, not advice.",
      pressFeatureLabel: "As featured on",
      pressFeatureName: "Leviathan News",
      share: "Share my garden",
      sharePrepping: "Drawing…",
      shareLink: "Copy link",
      shareLinkCopied: "Copied!",
      shareNative: "Share",
      shareSubline: (amt, years) => `${amt} / month  ·  ${years} years`,
      shareFooter: "Estimates from live pool rates — education, not advice.",
      sharePromptHeadline: "Send this garden to someone",
      shareTextLinkCopy: "or copy the link",
      shareTextLinkNative: "or share the link",
      shareLinkPrimaryCta: "🔗 Copy your garden link",
      shareLinkPrimaryNative: "🔗 Share your garden link",
      shareTextLinkImage: "or save as an image",
      tendGarden: "Tend your garden",
      tendReminderCta: "🗓️ Remind me to tend this monthly",
      tendReminderNote: "We'll never email you — this adds a private monthly reminder to your own calendar.",
      reportShareCta: "🔗 Share my garden",
      reportShareNote: "Copies a working link that rebuilds this exact garden for whoever you send it to.",
      tendReminderTitle: "Tend your DeFi Garden — check your rates",
      tendReminderDesc: "Time to check in on your garden and see how your rates are doing.",

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
      subHeroWin: (goal) => `Your money pays for ${goal}. Starting now.`,
      subHeroWinBundle: (list) => `Your money pays for ${list}. Starting now.`,
      subHeroWinBundleMany: (list) => `Your money pays for ${list}.`,
      stripMore: (n) => `+${n} more`,
      subHeroWinEyebrow: "∞ Forever unlocked",
      subHeroWinCovers: (foreverAmt, billMo, apyStr) => `≈${foreverAmt} covers ${billMo}/mo of bills at ${apyStr} — and you keep every dollar.`,
      subHeroWinSurplus: (amt) => `≈${amt} still growing on top.`,
      subHeroTowardNext: (amt, label) => `≈${amt} toward also covering ${label}.`,
      subHeroProgress: (pct, goal) => `${pct}% of the way to free ${goal}`,
      subHeroMonthly: (date) => `At +$100/mo you cross in ${date}`,
      subLadderTitle: "What your money covers — forever",
      ladderTapHint: "Tap a row to choose what your money covers",
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
      shareSubBundle: (list) => `🌱 My yield covers ${list} — forever`,
      shareSubSubline: (capital, apy, monthly) => `≈${capital} working at ${apy} · ${monthly}/mo covered forever`,

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

      // v3.2 — subscription amount step (replaces lump-vs-monthly fork)
      amountQuestion: "How much can you put in?",
      amountContextSub: (goal, bill, apy, minAmt) => `${goal} is ${bill}/mo. The minimum to cover it forever is ≈${minAmt} — and you keep your money.`,
      amountMinimumTag: "minimum",
      coversForever: (goal) => `covers ${goal} forever`,
      coversPlus: (label) => `+ ${label} too`,

      // Engine filter chips (pool swap/filter UI)
      engineFilterChain: "Chain",
      engineFilterToken: "Token",
      engineAll: "All",
      engineSwap: "Swap",
      engineSwapAlt: "Pick this pool",
      engineSwapClose: "Close",

      // Return-visit dashboard — elapsed + estimated growth
      // 241: string-safe (see showingResults above) — n arrives pre-formatted.
      reportElapsedDays: (n) => String(n) === '1' ? 'Planted 1 day ago' : `Planted ${n} days ago`,
      reportEarnedEst: (amt) => `≈${amt} grown so far (estimate)`,

      // Return-visit dashboard — subscription covers + next rung
      reportCovers: (list) => `Covered forever: ${list}`,
      reportNext: (label, amt) => `Next: + ${label} at ≈${amt}`,
      reportNextPct: (pct, label) => `${pct}% toward covering ${label}`,

      // YOUR PLAN card (subscription bloom consolidation)
      planCardTitle: "Your plan",
      planCoverLabel: "What it covers",
      capitalLabel: "Capital",
      riskLabel: "Risk",

      // Mix toggle UI
      mixHint: "Tap to add or remove what your money covers",
      mixTotal: (amt, monthly) => `≈${amt} covers ${monthly}/mo — forever`,
      mixEmpty: "Pick at least one to cover",
      mixHeroEmpty: "Pick what your money covers",
      mixCaveatStable: "until rates drop or there's a DeFi doomsday",
      mixCaveatRwa: "until rates drop or there's a big hack",
      mixCaveatDegen: "until rates drop or decentralization rugs",

      // Waitlist CTA
      ctaWaitlist: "Join the waitlist →",
      ctaWaitlistMicro: "Free to join • Card doesn't exist yet • We'll email you when it does",

      // Plan-checkout CTA — archetype-aware endings (bet A, backlog 139).
      // TARGET/GROWTH plans route to the plan's top pool instead of the
      // card waitlist (that copy only fits SUBSCRIPTION); the waitlist
      // demotes to this secondary early-access ask.
      startGrowingCta: (project) => `Start growing on ${project} →`,
      startGrowingCtaMicro: "No wallet needed to explore",
      ctaWaitlistSecondary: "Want this automated one day? Get early access →",

      // Waitlist modal — step 1
      waitlistTitle: "Get early access to the card",
      waitlistBenefits: "Join early access — once it's ready, your garden's yield pays your subscription automatically through a simple card. Your money always stays yours; no wallet or crypto experience needed to sign up.",
      waitlistTitleB: "Your subscriptions, paid by your yield",
      waitlistBenefitsB: "Pay a subscription the normal way and the money's gone. We're building a card that pays it from your garden's yield instead — the deposit stays yours the whole time. It doesn't exist yet: join the waitlist and we'll email you the moment it's ready. No wallet or crypto experience needed to sign up.",
      waitlistTitleC: "Yield pays the bill — the money stays yours",
      waitlistBenefitsC: "We're building a card that pays your subscription straight from your garden's yield. The deposit itself is never spent, and you can withdraw it anytime. The card isn't live yet — join the waitlist and you're first in line when it is. No wallet or crypto experience needed to sign up.",
      // TARGET/GROWTH waitlist modal copy (bet A, backlog 139) — the card-
      // pays-your-subscription framing above is wrong for a one-time
      // purchase or a decades-out goal, so this never mentions "subscription"
      // or claims the card pays anything. Honest early-access ask only;
      // nothing here exists yet.
      waitlistTitleEarlyAccess: "Get early access to what's next",
      waitlistBenefitsEarlyAccess: "We're building tools to make growing toward your goal even easier — automated tending, smarter rebalancing, more. Nothing's live yet. Join early access and we'll email you the moment it is. No wallet or crypto experience needed to sign up.",
      waitlistGarden: (labels, monthly) => `Your garden already covers ${labels} — a card funded by ≈${monthly}/mo of yield could pay it forever.`,
      waitlistJoin: "Save my spot",
      waitlistEmailPlaceholder: "your@email.com",
      waitlistError: "Something went wrong — please try again.",

      // Waitlist modal — step 2
      waitlistAccepted: "You're on the list 🌱",
      waitlistNextSteps: "We'll email you when your spot opens up. Setup takes about 10 minutes and we walk you through every step.",
      waitlistJumpLine: "Share your plan and help a friend join too.",

      // Referral
      referralHandleLabel: "Your referral handle",
      referralValidating: "Checking…",
      referralValid: "✓ Available",
      referralLinkLabel: "Your referral link",
      referralCopy: "Copy",
      referralCopied: "Copied!",

      // Share
      shareOnX: "Share on X",
      shareTweet: (labels) => `My yield pays for ${labels} — forever 🌱 Join me on DeFi Garden:`,
      // Non-subscription (TARGET/GROWTH) tweet frame (spec 146) — shareTweet's
      // "My yield pays for X — forever" phrasing is subscription-only; this
      // wraps the archetype-correct share headline instead.
      shareTweetGeneric: (headline) => `${headline} 🌱 Join me on DeFi Garden:`,
      downloadCard: "Download garden card",
      waitlistClose: "Close",

      // Waitlist — email step
      waitlistNoSpam: "No spam — one email when it's your turn.",

      // Waitlist — step indicator
      waitlistStepLabel: function (n) { return 'Step ' + n + ' of 2'; },

      // Share — image path confirmation (spec 005)
      shareImageSaved: "Image saved — link copied!"
    },

    // Static token/chain landing pages (spec 050) — copy-only strings for
    // generate-token-pages.js / generate-chain-pages.js. Numbers/pool data
    // are NOT translated here (en-US formatted, identical en/ko — CLAUDE.md).
    tcpTokenTitle: (sym) => `${sym} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱`,
    tcpChainTitle: (chain) => `${chain} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱`,
    // 174: floorStr is ALWAYS the caller's formatUsd(MIN_POOL_TVL) — never a
    // re-typed literal, so a verifier changing MIN_POOL_TVL sees this copy
    // move with it. "clears this page's floor" replaces "clears DeFi
    // Garden's floor" — the floor is this page's listing bar, not a claim
    // about the product's overall trust filters (spec 174).
    // 241: string-safe plurality checks (see showingResults above) — count/
    // chainCount/tokenCount arrive pre-formatted en-US via the accessor.
    tcpTokenDescription: (sym, count, apy, chainCount, floorStr) =>
      `${count} live ${sym} ${String(count) === '1' ? 'pool' : 'pools'} above the ${floorStr} TVL floor, up to ${apy} APY, across ${chainCount} ${String(chainCount) === '1' ? 'chain' : 'chains'}. Honest yields from DefiLlama data — no anomalous rates.`,
    tcpChainDescription: (chain, count, apy, tokenCount, floorStr) =>
      `${count} live ${String(count) === '1' ? 'pool' : 'pools'} on ${chain} above the ${floorStr} TVL floor, up to ${apy} APY, across ${tokenCount} ${String(tokenCount) === '1' ? 'token' : 'tokens'}. Honest yields from DefiLlama data — no anomalous rates.`,
    // 241: string-safe plurality checks (see showingResults above).
    tcpTokenIntro: (sym, project, chain, apy, tvl, count, chainCount, totalTvl, floorStr) =>
      `${sym}'s largest live pool is ${project} on ${chain} at ${apy} (${tvl} TVL). ${count} ${sym} ${String(count) === '1' ? 'pool' : 'pools'} across ${chainCount} ${String(chainCount) === '1' ? 'chain' : 'chains'} clear this page's ${floorStr} TVL floor, ${totalTvl} in total.`,
    tcpChainIntro: (chain, project, symbol, apy, tvl, count, tokenCount, totalTvl, floorStr) =>
      `${chain}'s largest live pool is ${project} (${symbol}) at ${apy} (${tvl} TVL). ${count} ${String(count) === '1' ? 'pool' : 'pools'} across ${tokenCount} ${String(tokenCount) === '1' ? 'token' : 'tokens'} clear this page's ${floorStr} TVL floor, ${totalTvl} in total.`,
    tcpTokenHeading: (sym) => `${sym} DeFi Yields`,
    tcpChainHeading: (chain) => `${chain} DeFi Yields`,
    // 241: string-safe (see showingResults above).
    tcpSubLine: (count, floorStr) => `${count} live ${String(count) === '1' ? 'pool' : 'pools'} above the ${floorStr} TVL floor · ranked by TVL`,
    tcpTokenCta: (sym) => `See live ${sym} pools →`,
    tcpChainCta: (chain) => `See live pools on ${chain} →`,
    // Waitlist CTA (062) — flat top-level keys (like every other tcp* string)
    // so the Node generators' createTranslationFunction can reach them; the
    // client app's own waitlistTitle/ctaWaitlist/ctaWaitlistMicro live under
    // the nested `planner` key instead and use identical copy on purpose.
    tcpWaitlistPitchToken: (sym) => `A card that spends your ${sym} yield — never your ${sym} itself. Join the waitlist and be first when it's ready.`,
    tcpWaitlistPitchChain: (chain) => `A card that spends the yield from your ${chain} positions — never the principal. Join the waitlist and be first when it's ready.`,
    // Generic hub/A-Z pitch (079) — no subject, since a hub spans mixed
    // tokens/chains; same honest framing as the per-subject pitches above.
    tcpWaitlistPitchHub: "A card that spends your DeFi yield — never your principal. Join the waitlist and be first when it's ready.",
    // Yield headline (066) — honest per-token custom KPI, computed live from
    // the SAME blended-rate/forever-number math the planner itself uses.
    tcpYieldHeadline: (sym, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Your idle ${sym} could earn ~${apyStr} — park ${foreverAmtStr} and it could run a $${monthly}/mo ${subLabel} subscription, forever.`,
    // Yield headline for chain pages (075) — same honest math, chain-scoped:
    // a chain has no single token, so this frames it as "idle assets on <Chain>".
    tcpYieldHeadlineChain: (chain, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Idle assets on ${chain} could earn ~${apyStr} — park ${foreverAmtStr} and it could run a $${monthly}/mo ${subLabel} subscription, forever.`,
    tcpWaitlistHeading: "Get early access to the card",
    tcpWaitlistCta: "Join the waitlist →",
    tcpWaitlistMicro: "Free to join • Card doesn't exist yet • We'll email you when it does",
    tcpColProtocol: "Protocol",
    tcpColChain: "Chain",
    tcpColToken: "Token",
    tcpColApy: "APY",
    tcpColTvl: "TVL",
    // 174: floorStr is ALWAYS the caller's formatUsd(MIN_POOL_TVL) — never a
    // re-typed literal. This note states THIS PAGE's own listing bar, not a
    // claim about "DeFi Garden's trust filters" as a whole (the app's real
    // savings-plan floor is DEFAULT_MIN_TVL = $10M, see CLAUDE.md).
    tcpTrustNote: (floorStr) => `Yields are live from DefiLlama. Pools on this page clear a ${floorStr} minimum TVL and exclude anomalous rates — that's this page's listing bar, not a safety guarantee. Education only, not financial advice.`,
    tcpLastUpdated: (date) => `Last updated ${date}`,
    tcpFooterTagline: "plan your DeFi savings by goal.",
    tcpItemListName: (project, chain) => `${project} on ${chain}`,
    tcpDatasetTokenName: (sym) => `${sym} DeFi Yields Dataset`,
    tcpDatasetTokenDescription: (sym, floorStr) => `Live DefiLlama yield data for ${sym} pools on DeFi Garden, filtered by a ${floorStr} TVL floor and anomalous-APY exclusion.`,
    tcpDatasetChainName: (chain) => `${chain} DeFi Yields Dataset`,
    tcpDatasetChainDescription: (chain, floorStr) => `Live DefiLlama yield data for ${chain} pools on DeFi Garden, filtered by a ${floorStr} TVL floor and anomalous-APY exclusion.`,
    tcpBreadcrumbHome: "Home",
    tcpBreadcrumbTokens: "Tokens",
    tcpBreadcrumbChains: "Chains",
    tcpChainsAriaLabel: "Chains",
    tcpPoolCategoriesAriaLabel: "Pool categories",
    tcpFaqHeading: "Frequently asked questions",
    // 241: string-safe (see showingResults above).
    tcpAnswer: (label, apyStr, project, chain, count, floorStr) =>
      `The highest honest ${label} yield right now is ${apyStr} on ${project} (${chain}), among ${count} ${String(count) === '1' ? 'pool' : 'pools'} above the ${floorStr} TVL floor. Rates are live from DefiLlama and exclude anomalous (>1000% APY) pools.`,
    tcpFaqQ1: (label) => `What's the highest ${label} yield today?`,
    tcpFaqA1: (apyStr, project, chain) => `${apyStr} APY on ${project} (${chain}), based on live DefiLlama data.`,
    tcpFaqQ2: (label) => `How many ${label} pools clear the TVL floor?`,
    // 174: "this page's floor", not "DeFi Garden's floor" — see tcpTokenIntro's comment above.
    // 241: string-safe (see showingResults above).
    tcpFaqA2: (count, tvlStr, floorStr) => `${count} live ${String(count) === '1' ? 'pool' : 'pools'} clear this page's ${floorStr} TVL floor, ${tvlStr} in total.`,
    tcpFaqQ3: "Are these rates safe?",
    // 174: this was "Every rate shown passes DeFi Garden's trust filters — a
    // $100K minimum TVL...", stated as an answer to "Are these rates safe?".
    // That attributed the PAGE's own $100K listing floor to the product's
    // trust filters, when the app's real savings-plan floor is $10M
    // (DEFAULT_MIN_TVL, app.js) — a 100x false safety claim (spec 174).
    // floorStr is ALWAYS the caller's formatUsd(MIN_POOL_TVL), never re-typed.
    tcpFaqA3: (floorStr) => `Pools listed on this page clear a ${floorStr} minimum TVL and exclude anomalous (>1000% APY) rates — that is this page's listing bar, not a safety guarantee. This is education, not financial advice; DeFi carries smart-contract and market risk regardless of the rate shown.`,
    tcpRateStabilityHeading: "Rate stability from APY history",
    tcpRateStabilityFaqQ: (symbol) => `Which ${symbol} pools have the most stable APY history?`,
    tcpRateStabilityCandidate: (project, chain, apyStr, tvlStr, href) =>
      `${project} (${chain}), ${apyStr} APY, ${tvlStr} TVL, ${href}`,
    tcpRateStabilityRankedAnswer: (symbol, candidates) =>
      `Based on APY history only, ${symbol}'s lower-variability candidates are ${candidates}. This comparison does not measure protocol, exploit, depeg, liquidity, governance, or principal-loss risk.`,
    tcpRateStabilityInsufficientAnswer: (symbol) =>
      `There is not enough qualifying APY history to rank ${symbol} pools. This view covers APY history only and does not measure protocol, exploit, depeg, liquidity, governance, or principal-loss risk.`,
    tcpRateStabilityColRank: "Rank",
    // "How this rate has behaved" depth section (item 232) — head-set pages
    // only. Every count/rate string these wrap is computed by
    // rateBehaviourFor() from the SAME railed rec.pools the table above
    // already shows; never re-typed here.
    tcpDepthHeading: "How this rate has behaved",
    tcpDepthSpread: (symbol, poolCount, lowApyStr, highApyStr, chainCount) =>
      `${symbol} shows up in ${poolCount} ${poolCount === 1 ? 'pool' : 'pools'} here, with rates from ${lowApyStr} to ${highApyStr} APY across ${chainCount} ${chainCount === 1 ? 'chain' : 'chains'} — the rate depends on which protocol and chain you pick, not just the token.`,
    // Verb agreement keys on the NUMERATOR (meanCount/rewardCount/ilCount),
    // never the denominator poolCount — "1 of 8 pools blends", not "blend"
    // (coordinator review, defect 1). The noun ("pool"/"pools") still keys on
    // poolCount, since poolCount IS what it counts. tcpDepthMixAllBase is
    // unaffected: poolCount there is genuinely both the noun's and the verb's
    // subject, so it correctly keys on poolCount alone — leave it.
    tcpDepthMean: (meanCount, poolCount, medianMeanStr) =>
      `${meanCount} of these ${poolCount} ${Number(poolCount) === 1 ? 'pool' : 'pools'} ${Number(meanCount) === 1 ? 'has' : 'have'} a trustworthy 30-day average on file, with a median of ${medianMeanStr} — a useful check against today's number for whether the rate is steady or just having a good day.`,
    tcpDepthMixIncentives: (rewardCount, poolCount) =>
      `${rewardCount} of ${poolCount} ${Number(poolCount) === 1 ? 'pool' : 'pools'} ${Number(rewardCount) === 1 ? 'blends' : 'blend'} in incentive or reward APY on top of the base rate. Incentive yield decays over time as reward programs run down — the base rate is the more durable number.`,
    tcpDepthMixAllBase: (poolCount) =>
      `All ${poolCount} ${Number(poolCount) === 1 ? 'pool pays' : 'pools pay'} a plain base rate right now — no incentive or reward APY mixed in.`,
    tcpDepthIlExposure: (ilCount, poolCount) =>
      `${ilCount} of ${poolCount} ${Number(poolCount) === 1 ? 'pool' : 'pools'} ${Number(ilCount) === 1 ? 'carries' : 'carry'} impermanent-loss risk, meaning a two-sided position can lose value against just holding, even while it earns yield.`,
    tcpDepthColMix: "Yield mix",
    tcpDepthMixBaseCell: "Base rate",
    tcpDepthMixIncentiveCell: (shareStr) => `${shareStr} incentives`,
    tcpDepthNote: (floorStr) =>
      `The 30-day average comes straight from DefiLlama and only appears when it passes the same sanity rail as every other number on this page — a dash means it didn't clear that bar, not that it's being hidden. Every pool here already clears a ${floorStr} minimum TVL. Rates move daily, so treat this as a snapshot, not a promise.`,
    tcpRelatedTokensHeading: "Related tokens",
    tcpRelatedChainsHeading: "Related chains",
    tcpAvailableOnHeading: "Available on",
    tcpByCategoryHeading: "By category",
    tcpTopTokensOnHeading: (chain) => `Top tokens on ${chain}`,
    tcpTokenHubTitle: "Every DeFi Token's Live Yields | DeFi Garden 🌱",
    tcpTokenHubDescription: (count) => `${count} tokens with live, trust-filtered DeFi yield data — top pools by TVL, browsable by name. Honest yields from DefiLlama, no anomalous rates.`,
    tcpTokenHubHeading: "All Token Yield Pages",
    tcpTokenHubSub: (count) => `${count} tokens with live, trust-filtered yield data`,
    // 174: "a ${floorStr} TVL floor", not "our $100K floor" — the floor is
    // the listing bar every linked page applies, not a DeFi-Garden-wide claim.
    tcpTokenHubIntro: (floorStr) => `Every DeFi Garden token page in one place — live pools ranked by TVL, filtered through a ${floorStr} TVL floor and anomaly rails. Start with the top tokens by TVL, or jump straight to a letter.`,
    tcpHubBackCta: "← Back to DeFi Garden",
    tcpTopTokensByTvlHeading: "Top tokens by TVL",
    tcpBrowseAZHeading: "Browse all tokens A–Z",
    tcpChainHubTitle: "Every Chain's Live DeFi Yields | DeFi Garden 🌱",
    tcpChainHubDescription: (count) => `${count} chains with live, trust-filtered DeFi yield data, ranked by TVL. Honest yields from DefiLlama, no anomalous rates.`,
    tcpChainHubHeading: "All Chain Yield Pages",
    tcpChainHubSub: (count) => `${count} chains with live, trust-filtered yield data`,
    tcpChainHubIntro: (floorStr) => `Every DeFi Garden chain page in one place — live pools ranked by TVL, filtered through a ${floorStr} TVL floor and anomaly rails.`,
    tcpAllChainsHeading: "All chains",
    tcpAzTitle: (letter) => `Tokens starting with ${letter} | DeFi Garden 🌱`,
    tcpAzDescription: (letter, count) => `${count} DeFi tokens starting with "${letter}" with live, trust-filtered yield data on DeFi Garden.`,
    tcpAzHeading: (letter) => `Tokens starting with ${letter}`,
    tcpAzSub: (count) => `${count} tokens`,
    tcpAzBackCta: "← All tokens",

    // Yield-Funded Virtual Card Terminal (PRD Design 3)
    yieldCardBadge: "EARLY ACCESS",
    yieldCardTitle: "Yield-Funded Virtual Card",
    yieldCardSubtitle: "Translate idle pool yield into real software and lifestyle subscriptions — deposit stays 100% yours.",
    yieldCardSimulatedDeposit: "Simulated Deposit",
    yieldCardMonthlyYieldGenerated: "Monthly Yield Generated",
    yieldCardPerMonth: "/ month",
    yieldCardStatusCovered: "✓ COVERED",
    yieldCardStatusLocked: "LOCKED",
    yieldCardRequiresCapital: (cap) => `Requires ${cap}`,
    yieldCardReserveTitle: "Reserve Virtual Card For This Pool",
    yieldCardReserveSubtitle: "Free to join • Card spends yield, never principal • No wallet required",
    yieldCardEmailPlaceholder: "Enter developer / user email...",
    yieldCardSubmitBtn: "Issue My Card at Launch →",
    yieldCardSubmitting: "Reserving spot...",
    yieldCardInvalidEmail: "Please enter a valid email address.",
    yieldCardReceiptTitle: "Waitlist Spot Reserved 🌱",
    yieldCardSpotNumber: (num) => `Waitlist Spot #${num}`,
    yieldCardReceiptNote: "We'll email you the moment merchant-locked virtual cards launch for this pool.",
    yieldCardShareLink: "Copy share link",
    yieldCardLinkCopied: "Copied to clipboard!",
    yieldCardFundedSuffix: "FUNDED",
    yieldCardDedicatedSuffix: "결제 전용",
    yieldCardCardCap: (amount) => `CAP: $${amount}/MO`,
    yieldCardCardCapKrw: (amount) => `월 한도: ₩${amount}`,
    yieldCardLiveApyFunded: "YIELD FUNDED",
    yieldCardLiveApyDirect: "이자 직결",
    yieldCardCoveredFree: "완전 무료",
    yieldCardClickToUnlock: "Click to auto-adjust deposit",
    'yieldCard.badge': "EARLY ACCESS",
    'yieldCard.title': "Yield-Funded Virtual Card",
    'yieldCard.subtitle': "Translate idle pool yield into real software and lifestyle subscriptions — deposit stays 100% yours.",
    'yieldCard.simulatedDeposit': "Simulated Deposit",
    'yieldCard.monthlyYield': "Monthly Yield Generated",
    'yieldCard.monthlyYieldGenerated': "Monthly Yield Generated",
    'yieldCard.perMonth': "/ month",
    'yieldCard.statusCovered': "✓ COVERED",
    'yieldCard.statusLocked': "LOCKED",
    'yieldCard.covered': "✓ COVERED",
    'yieldCard.locked': "LOCKED",
    'yieldCard.requiresCapital': (cap) => `Requires ${cap}`,
    'yieldCard.requires': (cap) => `Requires ${cap}`,
    'yieldCard.reserveTitle': "Reserve Virtual Card For This Pool",
    'yieldCard.reserveSubtitle': "Free to join • Card spends yield, never principal • No wallet required",
    'yieldCard.emailPlaceholder': "Enter developer / user email...",
    'yieldCard.submitBtn': "Issue My Card at Launch →",
    'yieldCard.reserve': "Issue My Card at Launch →",
    'yieldCard.submitting': "Reserving spot...",
    'yieldCard.invalidEmail': "Please enter a valid email address.",
    'yieldCard.receiptTitle': "Waitlist Spot Reserved 🌱",
    'yieldCard.spotNumber': (num) => `Waitlist Spot #${num}`,
    'yieldCard.receiptNote': "We'll email you the moment merchant-locked virtual cards launch for this pool.",
    'yieldCard.shareLink': "Copy share link",
    'yieldCard.linkCopied': "Copied to clipboard!",
    'yieldCard.cardCap': (amount) => `CAP: $${amount}/MO`,
    'yieldCard.cardCapKrw': (amount) => `월 한도: ₩${amount}`,
    'yieldCard.cardFundedSuffix': "FUNDED",
    'yieldCard.cardDedicatedSuffix': "결제 전용",
    'yieldCard.fundedSuffix': "FUNDED",
    'yieldCard.dedicatedSuffix': "결제 전용",
    'yieldCard.liveApyFunded': "YIELD FUNDED",
    'yieldCard.liveApyDirect': "이자 직결",
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

    // Nav category tabs
    navCatAll: "전체",
    navCatLending: "대출",
    navCatStaking: "스테이킹",
    navCatLpDex: "LP/DEX",
    navCatRwa: "RWA",
    navCatYieldDerivatives: "이자 파생상품",

    // Nav filter buttons (default/unselected labels)
    navFilterChains: "체인",
    navFilterTvl: "TVL",
    navFilterProtocols: "프로토콜",
    navFilterApy: "APY",

    // Results
    showingResults: (count) => `${count}개 풀 발견`,
    chainYields: (chain) => `${chain} DeFi 수익률`,
    tokenYields: (token, chain) => `${token} 수익률${chain ? ` (${chain})` : ''}`,
    sortByLabel: "정렬:",
    // 225 round 3 increment (a): results panel column labels + sort-control text
    resultsColPool: "풀",
    resultsColApy: "APY",
    resultsColTvl: "TVL",

    // Pool card labels
    totalApy: "총 APY",
    baseApy: "기본 APY:",
    rewardApy: "보상 APY:",
    baseApyBreakdown: (apy) => `${apy}% 기본`,
    rewardApyBreakdown: (apy) => `+ ${apy}% 보상`,
    rateVolatilityNote: (current, mean) => `이 풀의 이율은 변동이 큽니다: 현재 ${current}, 30일 평균 ${mean}. 보상 배출량은 매일 바뀌므로, 이 페이지의 예상치는 현재 이율을 기준으로 하며 이율에 따라 함께 변합니다.`,
    rateTrackRecordNew: "아직 이 풀의 이율 기록을 쌓아가는 중입니다 — 얼마나 안정적인지 판단하기에는 기록이 충분히 길지 않습니다. 기록이 길수록 이율을 더 믿을 수 있습니다.",
    rateTrackRecordSteady: (hp) => `지금까지 안정적입니다: 추적한 ${hp}일 동안 이 풀의 이율은 거의 일정하게 유지되었습니다. 이율이 안정적일수록 가든을 계획하기가 더 쉽습니다.`,
    rateTrackRecordTracked: (hp) => `이 풀의 이율을 ${hp}일 동안 추적해 왔습니다. 시간이 지나면서 이율이 어떻게 유지되는지 지켜보는 것은 이율을 판단하는 정직한 방법 중 하나입니다.`,
    rateHistoryUnavailable: "이 풀은 이율 기록이 없습니다 — 규모가 큰 풀만 매일 이율을 기록하고 있어서, 이 풀의 이율이 얼마나 안정적이었는지 판단할 자료가 없습니다. 위의 이율은 DefiLlama에서 실시간으로 가져온 값입니다.",
    sortByRiskAdjusted: "위험 조정",
    rateMomentumRising: (delta, hp) => `추적한 ${hp}일 동안 이 풀의 이율이 약 ${delta} 올랐습니다. 오른 이율은 그만큼 쉽게 다시 내려갈 수 있습니다 — 이 페이지는 오른 폭이 아니라 오늘의 이율을 기준으로 예상합니다.`,
    rateMomentumFalling: (delta, hp) => `추적한 ${hp}일 동안 이 풀의 이율이 약 ${delta} 내렸습니다. 보상 배출량이 줄어들면 이율이 내려가는 것은 자연스러운 일이니, 오늘의 숫자로 가든을 계획하기 전에 알아 두는 것이 좋습니다.`,
    tvlTrendShrinking: (pct, hp) => `추적한 ${hp}일 동안 이 풀의 예치금이 약 ${pct} 줄었습니다. 풀은 예치금이 조용히 빠져나가는 중에도 우리의 $10M 규모 기준을 계속 통과할 수 있습니다 — 여러 해 동안 가꿀 가든이라면 지켜볼 만합니다.`,
    tvlTrendGrowing: (pct, hp) => `추적한 ${hp}일 동안 이 풀의 예치금이 약 ${pct} 늘었습니다. 예치금이 많다고 지속력이 보장되는 것은 아니지만, 규모를 유지하거나 키우는 풀은 지속력을 보여주는 정직한 신호 중 하나입니다.`,
    opensProtocol: "프로토콜 열기 • 지갑 필요",
    gardenThisPoolCta: "이 풀 가든하기 →",
    repeatCtaHeading: "이 가든을 시작할 준비가 되셨나요?",
    plannerCtaHint: "지갑 불필요",
    protocol: "프로토콜↗",
    calculateYield: "보기 및 계산 →",
    startEarning: "수익 시작",
    startEarningOn: (protocol) => `${protocol}에서 수익 시작`,
    // spec 182 leg B/D — 프로토콜 링크가 아예 없을 때(모든 단계에서 URL을 찾지
    // 못한 경우)의 정직한 DefiLlama 폴백. 위의 프로토콜 CTA를 흉내 내지 않도록
    // 문구를 다르게 하고, 목적지가 DefiLlama임을 명확히 밝힙니다.
    viewOnDefillama: "DefiLlama에서 이 풀 보기",
    opensDefillamaFallback: "프로토콜 링크 없음 · 데이터 출처인 DefiLlama가 열립니다",

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
    // 241: see EN dailyEarningsSubLabel's comment above — formatCount() reused, not re-parsed.
    dailyEarningsSubLabel: (amount) => `$${formatCount(amount) || 0} 기준`,
    monthlyEarningsSubLabel: (amount) => `$${formatCount(amount) || 0} 기준`,
    estimatedEarnings: "예상 수익",
    estimatedDailyEarnings: "예상 일일 수익",
    estimatedMonthlyEarnings: "예상 월간 수익",
    
    // Empty states and errors
    loadingYields: "실시간 풀 불러오는 중…",
    noYieldsFound: (token) => `${token}에 대한 수익률을 찾을 수 없습니다`,
    noYieldsFoundChain: (chain) => `현재 필터로 ${chain}에서 수익률을 찾을 수 없습니다`,
    adjustFilters: "필터를 조정하거나 다른 토큰을 검색해보세요",
    adjustFiltersChain: "TVL 또는 APY 필터를 조정하거나 다른 체인을 선택해보세요",
    resetFilters: "필터 초기화",
    showSmallerPools: "TVL이 낮은 풀도 보기",
    loadingError: "수익률 데이터를 불러오지 못했습니다. 다시 시도해주세요.",
    tvlTrendShrinking: (pct, hp) => `추적한 ${hp}일 동안 이 풀의 예치금이 약 ${pct} 줄었습니다. 풀은 예치금이 조용히 빠져나가는 중에도 우리의 $100K 규모 기준을 계속 통과할 수 있습니다 — 여러 해 동안 가꿀 가든이라면 지켜볼 만합니다.`,
    emptyStateExplanation: (token) => `현재 ${token}에서 최소 TVL $100K 기준을 통과하는 라이브 풀이 없습니다.`,
    emptyStateExplanationChain: (chain) => `현재 ${chain}에는 최소 TVL $100K 기준을 통과하는 라이브 풀이 없습니다.`,
    poolNotFoundTitle: "더 이상 추적되지 않는 풀입니다",
    poolNotFoundExplanation: "프로토콜에서 상장 폐지되었거나 마이그레이션되었을 가능성이 높습니다. $100K 안전 기준을 통과하는 신뢰할 수 있는 대안을 아래에 안내합니다.",
    emptyStateAltHeadingStable: "$100K 기준을 통과한 인기 스테이블코인 풀",
    deadPoolRecoveryPrompt: "활성 수익률을 찾고 계신가요? 인기 자산 및 프로토콜을 둘러보세요:",
    deadPoolAltHeading: "$100K 안전 기준을 통과한 검증된 대체 풀:",

    // Navigation
    backToSearch: "← 검색으로 돌아가기",
    
    // Pool detail labels
    poolInformation: "풀 정보",
    poolType: "풀 유형",
    underlyingAssets: "기초 자산",
    calculateYourEarnings: "수익 계산하기",
    calcSubPrompt: "일간·주간·월간 수익을 확인하세요",
    // 241: see EN basedOnInvestment's comment above.
    basedOnInvestment: (amount) => `$${formatCount(amount) || 0} 투자 기준`,
    verified: "✓ 인증됨",
    // 225 round 3 increment (a): matches EN — plain metadata line, middle dot, no arrow.
    onProtocolChain: (protocol, chain) => `${protocol} · ${chain}`,
    poolProtocolLogoAlt: (project) => `${project} 로고`,
    poolChainLogoAlt: (chain) => `${chain} 로고`,
    tvl: "TVL",
    noSupplyYield: "공급 이자 없음",
    apyMean30d: "30일 평균 APY",
    exposure: "익스포저",
    ilRisk: "비영구적 손실 위험",
    yes: "있음",
    no: "없음",

    // Honest mini-projection (pool-detail)
    projectionHeading: "장기적으로 보면",
    // 241: see EN projectionBody's comment above (same whole-dollar-rounding contract).
    projectionBody: (principal, years, amount) => `이 풀에 $${formatCount(principal) || 0}을 넣으면 ${years}년 후 현재 수익률 기준 약 $${formatCount(amount) || 0}이 됩니다.`,
    projectionBodyOutOfRange: "이 수익률은 정상 범위를 크게 벗어나 있어 금액을 예측해 보여드리지 않습니다 — 그런 숫자는 예측이 아니라 허구에 가깝기 때문입니다.",
    projectionKeepNote: "예치금은 그대로 내 것 — 돈은 지키면서 계속 일하게 하세요.",
    // 241: see EN gardenThisPoolCtaConcrete's comment above.
    gardenThisPoolCtaConcrete: (amount, years) => `이 풀 가든하기 → ${years}년 후 약 $${formatCount(amount) || 0}`,
    poolDegenHaircutNote: (headline) => `⅓ 할인 적용 (헤드라인 ${headline}) — 팜 수익률은 빠르게 감소. 적극적 관리 필요.`,

    // Calculator disclaimers
    calcDisclaimer: "현재 수익률 기준 추정치이며 수시로 변동됩니다. 투자 조언이 아닙니다.",
    calcAnomalyWarning: "⚠ 이 수익률은 비정상적이며 거의 지속 불가능합니다.",

    // Footer
    poweredBy: "데이터 제공:",
    defillamaApi: "DefiLlama API",
    footerSignOff: "투자 조언이 아닙니다.",
    browseTokens: "토큰 둘러보기",
    browseChains: "체인 둘러보기",

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

    // Search-first landing
    landing: {
      pageTitle: "DeFi Garden 🌱 | 다음 수익률 찾기",
      metaDescription: "모든 체인의 실시간 DeFi 수익률을 검색하고, 키우고 싶은 목표를 위한 정원을 심어보세요. 투자 조언이 아닙니다.",
      navSearch: "수익률 찾기",
      navGarden: "내 정원",
      navHowItWorks: "이용 방법",
      navPrimary: "주요 메뉴",
      navMobile: "모바일 메뉴",
      navMenu: "메뉴 열기",
      navClose: "메뉴 닫기",
      themeLight: "라이트 모드로 전환",
      themeDark: "다크 모드로 전환",
      languageEnglish: "영어로 전환",
      languageKorean: "한국어로 전환",
      heroTitleBefore: "수익률을,",
      heroTitleAccent: "조금 더 선명하게.",
      heroBody: "모든 체인의 실시간 DeFi 풀을 검색하고, 키우고 싶은 목표를 위한 정원을 심어보세요.",
      searchLabel: "실시간 DeFi 수익률 검색",
      searchPlaceholder: "USDC, Arbitrum의 ETH, 대출을 검색해보세요…",
      searchSubmit: "수익률 찾기",
      examplesLabel: "이렇게 시작해보세요",
      exampleUsdc: "Base의 USDC",
      examplePendle: "Pendle PTs",
      exampleMorpho: "Morpho vaults",
      exampleKamino: "Kamino 대출",
      gardenTitle: "목표가 있나요?",
      gardenBody: "정원을 심고 정직한 실시간 수익률로 얼마나 자랄 수 있는지 확인해보세요.",
      gardenCta: "정원 심기",
      gardenNote: "계획에는 지갑이 필요하지 않아요",
      trustLive: "DefiLlama 실시간 데이터",
      // backlog 254: bare Latin "$100K" form (spec's Open Questions judgment
      // call — matches the KO strings 6fceca79bb already shipped, e.g.
      // "최소 TVL $100K 기준" (emptyStateExplanation above), rather than a
      // Hangul numeral like "10만 달러"). See translations.en.landing.trustFloor.
      trustFloor: (floor) => {
        const value = floor == null ? TRUST_RAILS && TRUST_RAILS.formatTvlFloor(TRUST_RAILS.DEFAULT_MIN_TVL) : floor;
        return `최소 TVL ${value}`;
      },
      trustEducation: "투자 조언이 아닙니다",
      trustHeading: "더 차분하게 수익률을 탐색하세요.",
      trustBody: "명확한 시작점, 정직한 숫자, 그리고 다음 행동을 안내합니다.",
      searchFallback: "검색",
      returnCaption: "다시 오셨네요",
      returnStatus: (date) => `${date}에 심었어요`,
      returnCta: "정원 돌보기"
    },

    // Garden Planner
    // 가든 플래너 v2
    planner: {
      pageTitle: "가든 플래너 🌱 | 목표 중심 DeFi 저축 계획 — DeFi Garden",
      metaDescription: "목표부터 시작하는 DeFi 저축 플래너. 무엇을 위해 매달 얼마를 모을 수 있는지 알려주시면, 실시간 풀 수익률로 얼마나 키울 수 있는지 보여드립니다. 모든 숫자는 DefiLlama 실시간 데이터입니다. 투자 조언이 아닌 교육용입니다.",

      title: "수익이 요금을 내줘요 — 영원히",
      tagline: "필요한 걸 알려주세요. 실시간 DeFi 수익이 알아서 내드려요.",
      startFresh: "처음부터 다시",
      back: "뒤로",
      myGarden: "내 정원",

      thinking: "답을 키우는 중…",

      step1Question: "함께 무언가를 키워봐요. 무엇을 위해 모으고 계신가요?",
      splashHook: "한 번 넣어두면 — 수익이 요금을 영원히 내주고, 원금은 고스란히 남아요.",
      splashHookLive: (apy) => `한 번 넣어두면 — 오늘 기준 혼합 수익률 ${apy}로 수익이 요금을 영원히 내주고, 원금은 고스란히 남아요.`,
      catSubscriptions: "구독 서비스",
      catBills: "고정 지출",
      catGadgets: "가젯",
      catLife: "큰 목표",
      goalSpotify: "스포티파이",
      goalNetflix: "넷플릭스",
      goalClaude: "Claude Pro",
      goalAmazonPrime: "아마존 프라임",
      goalDisney: "디즈니+",
      goalYouTubePremium: "유튜브 프리미엄",
      goalMax: "Max",
      goalHulu: "Hulu",
      goalAppleTV: "Apple TV+",
      goalChatGPT: "ChatGPT Plus",
      goalGamePass: "게임 패스",
      goalParamount: "파라마운트+",
      goalPeacock: "Peacock",
      goalDoorDash: "DoorDash",
      goalUberOne: "Uber One",
      goalAudible: "Audible",
      goalWalmart: "Walmart+",
      goalMore: "더 보기…",
      goalLess: "접기",
      goalRetirement: "은퇴 자금",
      goalHome: "내 집 마련",
      goalSneakers: "새 운동화",
      goalIphone: "새 아이폰",
      goalWatches: "고급 시계",
      goalRent: "월세",
      goalPhoneBill: "휴대폰 요금",
      freeTextPlaceholder: "…아니면 직접 말씀해 주세요",
      freeTextNudge: "제대로 도와드리고 싶어요 — 우선 이 중에서 하나 골라볼까요? 언제든 바꿀 수 있어요.",
      youPicked: (goal) => `${goal} 모으기`,
      sharedPlanIntro: "누군가 정원을 공유했어요 — 내 것으로 만들어 보세요.",
      sharedPlanIntroPool: "선택한 풀을 기반으로 미리 설정했어요 — 내 것으로 만들어 보세요.",

      step2Question: (goal) => `좋아요 — ${goal}이군요. 매달 얼마나 따로 모을 수 있을까요?`,
      step2QuestionPlain: "매달 얼마나 따로 모을 수 있을까요?",
      customAmount: "직접 입력",
      monthlyChosen: (amt) => `매달 ${amt}`,

      step3Question: "얼마나 오래 키울 수 있나요? DeFi에서는 시즌 단위로 계획해요 — 최대 10년.",
      years: (n) => `${n}년`,
      yearsShort: "년",
      horizonChosen: (n) => `${n}년 동안 키우기`,

      step4Question: "마지막으로 — 내 돈이 어디서 일하면 좋을까요?",
      personaStableShort: "안심 수익",
      personaRwaShort: "균형",
      personaDegenShort: "과감하게",
      personaStableTitle: "안전 & 안정",
      personaStableDesc: "검증된 대출·스테이킹 프로토콜의 스테이블코인 풀, TVL ≥ $50M. 꾸준히 3~8%, 의도적으로 평범하게.",
      personaStableRisk: "매우 낮은 위험 — 스테이블코인 디페그 또는 컨트랙트 버그 가능성은 드뭄",
      personaRwaTitle: "분산형",
      personaRwaDesc: "토큰화된 국채, 실물 자산 수익률, 신뢰할 수 있는 신규 항목. TradFi 수익률이 온체인으로 — DeFi에서 가장 빠르게 성장하는 영역.",
      personaRwaRisk: "중간 위험 — 신규 상품에 대한 규제 불확실성 존재",
      personaDegenTitle: "고수익",
      // backlog 254: see translations.en.planner.personaDegenDesc above.
      personaDegenDesc: (floor) => {
        const value = floor == null ? TRUST_RAILS && TRUST_RAILS.formatTvlFloor(TRUST_RAILS.DEFAULT_MIN_TVL) : floor;
        return `고수익 LP 팜, TVL ≥ ${value}. 이 수익률은 지금 실재하며 보통 며칠~몇 주 지속돼요. 적극적인 농장 이동이 필요합니다.`;
      },
      personaDegenRisk: "솔직히: 표시된 수익률의 ⅓로 투영 — 고수익률은 빠르게 감소",
      personaProj: (amt, yrs, apy) => `≈ ${amt} · ${yrs}년 · ${apy}%`,
      personaProjYield: (yld, apy) => `≈ 월 ${yld} · ${apy}%`,
      personaApyLabel: "실효 수익률",
      monthlyChipHint: (amt, yrs) => `→ ${amt} · ${yrs}년`,
      checkoutYourPlan: "내 플랜",
      checkoutCapital: "필요 자본",
      checkoutApy: "혼합 수익률",
      checkoutMonthlyYield: "월 수익",
      checkoutYouKeep: "보유 유지",
      checkoutYouKeepVal: "원금 + 수익",
      checkoutMonthly: "월 납입",
      checkoutTimeline: "기간",
      checkoutProjected: "예상 금액",
      checkoutPriceLabelCapital: "일회성 자본",
      checkoutPriceLabelMonthly: "월 납입",
      checkoutModeOneTime: "일회 입금",
      checkoutModeMonthly: "월 납입",
      checkoutHeroSub: (yld) => `월 ${yld} 수익 — 원금은 그대로`,
      checkoutHeroGrowth: (amt, yrs) => `${yrs}년 후 ${amt}로 성장`,
      trustSelfCustody: "셀프 커스터디",
      trustYourKeys: "내 키",
      trustWithdraw: "언제든 출금",
      checkoutNote: "DefiLlama 실시간 데이터 · 교육 목적, 금융 조언 아님",
      arrivalBannerText: "누군가 이 정원을 보냈어요 — 이미 준비가 끝나서 바로 자랄 수 있어요.",
      arrivalBannerTextPool: "선택한 풀을 기반으로 미리 준비한 계획이에요 — 내 것으로 만들어 보세요.",
      arrivalBannerCta: "내 것으로 만들기",
      arrivalBannerDismiss: "닫기",
      riskEdit: "설정",
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
      planConfidenceSteady: (days) => `이 정원은 저희가 지켜본 ${days}일 동안 수익률이 꾸준히 유지된 풀들로 이루어져 있어요 — 수익률이 안정적일수록 계획을 믿기 쉬워집니다.`,
      planConfidencePartial: (n, total) => `이 계획을 떠받치는 풀 ${total}개 중 ${n}개는 지금까지 꾸준한 기록을 보여줬어요; 나머지는 아직 기록을 쌓아가는 중이에요.`,
      planConfidenceBuilding: "이 계획을 떠받치는 풀들의 기록을 아직 쌓아가는 중이에요 — 기록이 길수록 혼합 수익률을 믿기 쉬워집니다.",
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

      caveatRates: "오늘의 수익률은 실시간이며 매일 바뀝니다 — 실제 숫자도 함께 달라집니다.",
      caveatHack: "해킹으로부터 완전히 안전한 프로토콜은 없습니다. 스마트 컨트랙트는 실패하거나 공격당할 수 있고, 자금을 잃을 수도 있습니다. 투자 조언이 아닌 교육용 정보입니다.",
      speedupDisciplined: (amt, months) => `매달 ${amt}씩 더 모으면 약 ${months}개월 더 빨리 도달합니다.`,

      disclaimer: "실시간 풀 수익률 기반 추정치이며 매일 변동됩니다. 투자 조언이 아닌 교육용입니다.",
      pressFeatureLabel: "소개된 곳",
      pressFeatureName: "Leviathan News",
      share: "내 정원 공유하기",
      sharePrepping: "그리는 중…",
      shareLink: "링크 복사",
      shareLinkCopied: "복사됨!",
      shareNative: "공유",
      shareSubline: (amt, years) => `매달 ${amt}  ·  ${years}년`,
      shareFooter: "실시간 풀 수익률 기반 추정치 — 투자 조언이 아닌 교육용입니다.",
      sharePromptHeadline: "이 정원을 누군가에게 보내 보세요",
      shareTextLinkCopy: "또는 링크 복사",
      shareTextLinkNative: "또는 링크 공유",
      shareLinkPrimaryCta: "🔗 정원 링크 복사하기",
      shareLinkPrimaryNative: "🔗 정원 링크 공유하기",
      shareTextLinkImage: "또는 이미지로 저장",
      tendGarden: "내 정원 가꾸기",
      tendReminderCta: "🗓️ 매달 가꾸도록 알림 추가",
      tendReminderNote: "이메일은 절대 보내지 않아요 — 내 캘린더에 매달 반복되는 개인 알림만 추가돼요.",
      reportShareCta: "🔗 내 정원 공유하기",
      reportShareNote: "보내는 사람 누구에게나 이 정원을 그대로 다시 열어주는 링크를 복사해요.",
      tendReminderTitle: "내 DeFi Garden 가꾸기 — 수익률 확인하기",
      tendReminderDesc: "정원을 살펴보고 수익률이 어떤지 확인할 시간이에요.",

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
      subHeroWin: (goal) => `내 돈이 ${goal} 요금을 내줘요. 지금 바로.`,
      subHeroWinBundle: (list) => `내 돈이 ${list} 요금을 내줘요. 지금 바로.`,
      subHeroWinBundleMany: (list) => `내 돈이 ${list} 요금을 내줘요.`,
      stripMore: (n) => `+${n}개 더`,
      subHeroWinEyebrow: "∞ 영구 달성",
      subHeroWinCovers: (foreverAmt, billMo, apyStr) => `≈${foreverAmt}이 ${apyStr}로 월 ${billMo} 요금을 커버해요 — 원금은 그대로예요.`,
      subHeroWinSurplus: (amt) => `≈${amt}는 추가로 불어나는 중이에요.`,
      subHeroTowardNext: (amt, label) => `≈${amt}는 ${label} 추가 달성을 향해 불어나는 중이에요.`,
      subHeroProgress: (pct, goal) => `무료 ${goal}까지 ${pct}% 왔어요`,
      subHeroMonthly: (date) => `매달 +$100 추가하면 ${date}에 달성해요`,
      subLadderTitle: "내 돈이 영원히 내주는 것들",
      ladderTapHint: "행을 탭해서 내 돈이 내줄 항목을 골라보세요",
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
      shareSubBundle: (list) => `🌱 수익이 ${list}을 영원히 내줘요`,
      shareSubSubline: (capital, apy, monthly) => `≈${capital} · ${apy} 수익률 · 매달 ${monthly} 영구 달성`,

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

      // v3.2 — subscription amount step (replaces lump-vs-monthly fork)
      amountQuestion: "얼마나 넣을 수 있나요?",
      amountContextSub: (goal, bill, apy, minAmt) => `${goal}은 월 ${bill}이에요. 영원히 내려면 최소 ≈${minAmt}만 있으면 돼요 — 원금은 그대로예요.`,
      amountMinimumTag: "최소",
      coversForever: (goal) => `${goal} 영구 달성`,
      coversPlus: (label) => `+ ${label}도`,

      // Engine filter chips (pool swap/filter UI)
      engineFilterChain: "체인",
      engineFilterToken: "토큰",
      engineAll: "전체",
      engineSwap: "교체",
      engineSwapAlt: "이 풀로 바꾸기",
      engineSwapClose: "닫기",

      // Return-visit dashboard — elapsed + estimated growth
      // 241: string-safe (see EN reportElapsedDays above) — n arrives pre-formatted.
      reportElapsedDays: (n) => String(n) === '1' ? '심은 지 1일 됐어요' : `심은 지 ${n}일 됐어요`,
      reportEarnedEst: (amt) => `지금까지 약 ${amt} 자란 것으로 추정돼요`,

      // Return-visit dashboard — subscription covers + next rung
      reportCovers: (list) => `영구 커버: ${list}`,
      reportNext: (label, amt) => `다음: + ${label} (≈${amt} 필요)`,
      reportNextPct: (pct, label) => `${label} 커버까지 ${pct}%`,

      // YOUR PLAN card (subscription bloom consolidation)
      planCardTitle: "내 계획",
      planCoverLabel: "내주는 것들",
      capitalLabel: "원금",
      riskLabel: "위험도",

      // Mix toggle UI
      mixHint: "탭해서 내 돈이 내줄 항목을 추가하거나 빼세요",
      mixTotal: (amt, monthly) => `≈${amt}로 월 ${monthly} 영구 커버`,
      mixEmpty: "항목을 최소 하나 선택해 주세요",
      mixHeroEmpty: "내 돈이 내줄 항목을 골라보세요",
      mixCaveatStable: "금리가 떨어지거나 디파이 대재앙이 오기 전까지",
      mixCaveatRwa: "금리가 떨어지거나 대형 해킹이 터지기 전까지",
      mixCaveatDegen: "금리가 떨어지거나 탈중앙화가 무너지기 전까지",

      // Waitlist CTA
      ctaWaitlist: "대기자 명단에 등록 →",
      ctaWaitlistMicro: "무료 가입 • 카드는 아직 없어요 • 준비되면 이메일로 알려드려요",

      // 체크아웃 CTA — 목표 유형별 엔딩 (bet A, backlog 139)
      // TARGET/GROWTH 플랜은 카드 대기자 명단 대신 이 플랜의 상위 풀로
      // 연결돼요 (해당 카피는 SUBSCRIPTION에만 맞아요); 대기자 명단은
      // 이 보조 얼리 액세스 안내로 격하돼요.
      startGrowingCta: (project) => `${project}에서 가든 시작하기 →`,
      startGrowingCtaMicro: "지갑 없이도 둘러볼 수 있어요",
      ctaWaitlistSecondary: "언젠가 자동화되면 좋겠나요? 얼리 액세스 신청 →",

      // Waitlist modal — step 1
      waitlistTitle: "카드 얼리 액세스 신청하기",
      waitlistBenefits: "얼리 액세스에 가입하는 거예요 — 준비되면 내 정원의 수익으로 구독료가 자동 결제되는 카드를 받게 돼요. 예치금은 항상 내 소유이고, 가입에 지갑이나 크립토 경험은 필요 없어요.",
      waitlistTitleB: "구독료, 내 수익이 대신 내줘요",
      waitlistBenefitsB: "구독료를 그냥 내면 돈은 사라져요. 우리가 만들고 있는 카드는 내 정원의 수익으로 구독료를 대신 내줘요 — 예치금은 그대로 내 것이고요. 아직 출시 전이에요. 웨이트리스트에 등록하면 준비되는 순간 이메일로 알려드려요. 가입에 지갑이나 크립토 경험은 필요 없어요.",
      waitlistTitleC: "수익이 결제하고, 원금은 내 것",
      waitlistBenefitsC: "내 정원의 수익으로 구독료를 바로 결제해주는 카드를 만들고 있어요. 예치금 자체는 절대 쓰이지 않고, 언제든 출금할 수 있어요. 카드는 아직 출시 전이에요 — 웨이트리스트에 등록하면 준비되는 대로 가장 먼저 알려드려요. 가입에 지갑이나 크립토 경험은 필요 없어요.",
      // TARGET/GROWTH 대기자 모달 카피 (bet A, backlog 139) — 위 "구독료를
      // 대신 내주는 카드" 프레이밍은 일회성 구매나 수십 년짜리 목표에는
      // 맞지 않아서, "구독료"를 언급하거나 카드가 뭔가를 대신 내준다고
      // 말하지 않아요. 정직한 얼리 액세스 안내만 담아요 — 아직 아무것도
      // 출시되지 않았어요.
      waitlistTitleEarlyAccess: "다음 기능 얼리 액세스 신청하기",
      waitlistBenefitsEarlyAccess: "목표를 향해 더 쉽게 성장할 수 있는 도구를 준비 중이에요 — 자동 관리, 스마트 리밸런싱 등이요. 아직 출시 전이에요. 얼리 액세스에 등록하면 준비되는 순간 이메일로 알려드려요. 가입에 지갑이나 크립토 경험은 필요 없어요.",
      waitlistGarden: (labels, monthly) => `내 정원은 이미 ${labels}를 커버해요 — 월 ≈${monthly}의 수익으로 결제되는 카드가 영구히 대신 내줄 수 있어요.`,
      waitlistJoin: "자리 확보",
      waitlistEmailPlaceholder: "이메일@주소.com",
      waitlistError: "오류가 발생했어요 — 다시 시도해 주세요.",

      // Waitlist modal — step 2
      waitlistAccepted: "명단에 등록됐어요 🌱",
      waitlistNextSteps: "자리가 생기면 이메일로 알려드려요. 설정은 약 10분이면 되고 단계별로 안내해드려요.",
      waitlistJumpLine: "플랜을 공유해서 친구도 함께 초대해요.",

      // Referral
      referralHandleLabel: "추천인 핸들",
      referralValidating: "확인 중…",
      referralValid: "✓ 사용 가능",
      referralLinkLabel: "내 추천 링크",
      referralCopy: "복사",
      referralCopied: "복사됨!",

      // Share
      shareOnX: "X에 공유",
      shareTweet: (labels) => `수익이 ${labels} 요금을 영원히 내줘요 🌱 DeFi Garden에서 함께해요:`,
      shareTweetGeneric: (headline) => `${headline} 🌱 DeFi Garden에서 함께해요:`,
      downloadCard: "정원 카드 다운로드",
      waitlistClose: "닫기",

      // Waitlist — position + skip
      // Waitlist — email step
      waitlistNoSpam: "스팸 없어요 — 순서가 되면 이메일 한 통만 보내드려요.",

      // Waitlist — step indicator
      waitlistStepLabel: function (n) { return n + ' / 2 단계'; },

      // Share — image path confirmation (spec 005)
      shareImageSaved: "이미지 저장됨 — 링크 복사됨!"
    },

    // Static token/chain landing pages (spec 050) — copy-only strings for
    // generate-token-pages.js / generate-chain-pages.js. Numbers/pool data
    // are NOT translated here (en-US formatted, identical en/ko — CLAUDE.md).
    tcpTokenTitle: (sym) => `${sym} 디파이 수익률 — TVL 기준 실시간 풀 | DeFi Garden 🌱`,
    tcpChainTitle: (chain) => `${chain} 디파이 수익률 — TVL 기준 실시간 풀 | DeFi Garden 🌱`,
    // 174: floorStr은 항상 호출부의 formatUsd(MIN_POOL_TVL) 값이며, 절대 문자열로 다시 적지 않아요.
    // "DeFi Garden의 기준" 대신 "이 페이지의 기준"으로 — 이 기준은 이 페이지의 게재
    // 기준일 뿐, 제품 전체의 신뢰 기준에 대한 주장이 아니에요 (spec 174).
    tcpTokenDescription: (sym, count, apy, chainCount, floorStr) =>
      `${floorStr} TVL 기준을 넘는 실시간 ${sym} 풀 ${count}개, 최고 APY ${apy}, ${chainCount}개 체인에서 확인할 수 있어요. DefiLlama 데이터 기반의 정직한 수익률 — 이상 수치는 제외했어요.`,
    tcpChainDescription: (chain, count, apy, tokenCount, floorStr) =>
      `${chain}에서 ${floorStr} TVL 기준을 넘는 실시간 풀 ${count}개, 최고 APY ${apy}, ${tokenCount}개 토큰에서 확인할 수 있어요. DefiLlama 데이터 기반의 정직한 수익률 — 이상 수치는 제외했어요.`,
    tcpTokenIntro: (sym, project, chain, apy, tvl, count, chainCount, totalTvl, floorStr) =>
      `${sym}의 가장 큰 실시간 풀은 ${chain}의 ${project}로, APY ${apy}(TVL ${tvl})예요. ${sym} 풀 ${count}개가 ${chainCount}개 체인에 걸쳐 이 페이지의 ${floorStr} TVL 기준을 통과했고, 합산 TVL은 ${totalTvl}이에요.`,
    tcpChainIntro: (chain, project, symbol, apy, tvl, count, tokenCount, totalTvl, floorStr) =>
      `${chain}의 가장 큰 실시간 풀은 ${project}(${symbol})로, APY ${apy}(TVL ${tvl})예요. 풀 ${count}개가 ${tokenCount}개 토큰에 걸쳐 이 페이지의 ${floorStr} TVL 기준을 통과했고, 합산 TVL은 ${totalTvl}이에요.`,
    tcpTokenHeading: (sym) => `${sym} 디파이 수익률`,
    tcpChainHeading: (chain) => `${chain} 디파이 수익률`,
    tcpSubLine: (count, floorStr) => `${floorStr} TVL 기준을 넘는 실시간 풀 ${count}개 · TVL 순 정렬`,
    tcpTokenCta: (sym) => `${sym} 실시간 풀 보기 →`,
    tcpChainCta: (chain) => `${chain}의 실시간 풀 보기 →`,
    tcpWaitlistPitchToken: (sym) => `내 ${sym} 수익으로 결제되는 카드예요 — ${sym} 원금은 그대로 남아있어요. 대기자 명단에 등록하고 준비되면 가장 먼저 알림을 받아보세요.`,
    tcpWaitlistPitchChain: (chain) => `${chain} 포지션의 수익으로 결제되는 카드예요 — 원금은 그대로 남아있어요. 대기자 명단에 등록하고 준비되면 가장 먼저 알림을 받아보세요.`,
    // Generic hub/A-Z pitch (079) — no subject, since a hub spans mixed
    // tokens/chains; same honest framing as the per-subject pitches above.
    tcpWaitlistPitchHub: "내 디파이 수익으로 결제되는 카드예요 — 원금은 그대로 남아있어요. 대기자 명단에 등록하고 준비되면 가장 먼저 알림을 받아보세요.",
    // Yield headline (066) — honest per-token custom KPI, computed live from
    // the SAME blended-rate/forever-number math the planner itself uses.
    tcpYieldHeadline: (sym, apyStr, foreverAmtStr, monthly, subLabel) =>
      `유휴 ${sym}으로 약 ${apyStr}의 수익을 낼 수 있어요 — ${foreverAmtStr}를 예치하면 월 $${monthly} ${subLabel} 구독료를 영원히 낼 수 있어요.`,
    // Yield headline for chain pages (075) — same honest math, chain-scoped:
    // a chain has no single token, so this frames it as "idle assets on <Chain>".
    tcpYieldHeadlineChain: (chain, apyStr, foreverAmtStr, monthly, subLabel) =>
      `${chain}의 유휴 자산으로 약 ${apyStr}의 수익을 낼 수 있어요 — ${foreverAmtStr}를 예치하면 월 $${monthly} ${subLabel} 구독료를 영원히 낼 수 있어요.`,
    tcpWaitlistHeading: "카드 얼리 액세스 신청하기",
    tcpWaitlistCta: "대기자 명단에 등록 →",
    tcpWaitlistMicro: "무료 가입 • 카드는 아직 없어요 • 준비되면 이메일로 알려드려요",
    tcpColProtocol: "프로토콜",
    tcpColChain: "체인",
    tcpColToken: "토큰",
    tcpColApy: "APY",
    tcpColTvl: "TVL",
    // 174: floorStr은 항상 호출부의 formatUsd(MIN_POOL_TVL) 값이며, 절대 문자열로 다시 적지 않아요.
    tcpTrustNote: (floorStr) => `수익률은 DefiLlama의 실시간 데이터예요. 이 페이지의 풀은 최소 TVL ${floorStr} 기준을 충족하고 이상 수치는 제외했어요 — 이는 이 페이지의 게재 기준일 뿐, 안전을 보장하는 것은 아니에요. 투자 조언이 아닌 교육 목적의 정보예요.`,
    tcpLastUpdated: (date) => `마지막 업데이트: ${date}`,
    tcpFooterTagline: "목표에 맞춰 디파이 저축을 계획해요.",
    tcpItemListName: (project, chain) => `${chain}의 ${project}`,
    tcpDatasetTokenName: (sym) => `${sym} 디파이 수익률 데이터셋`,
    tcpDatasetTokenDescription: (sym, floorStr) => `DeFi Garden에 있는 ${sym} 풀의 실시간 DefiLlama 수익률 데이터예요. ${floorStr} TVL 기준과 이상 APY 제외 필터를 통과했어요.`,
    tcpDatasetChainName: (chain) => `${chain} 디파이 수익률 데이터셋`,
    tcpDatasetChainDescription: (chain, floorStr) => `DeFi Garden에 있는 ${chain} 풀의 실시간 DefiLlama 수익률 데이터예요. ${floorStr} TVL 기준과 이상 APY 제외 필터를 통과했어요.`,
    tcpBreadcrumbHome: "홈",
    tcpBreadcrumbTokens: "토큰",
    tcpBreadcrumbChains: "체인",
    tcpChainsAriaLabel: "체인",
    tcpPoolCategoriesAriaLabel: "풀 카테고리",
    tcpFaqHeading: "자주 묻는 질문",
    tcpAnswer: (label, apyStr, project, chain, count, floorStr) =>
      `현재 ${label}의 가장 높은 정직한 수익률은 ${chain}의 ${project}에서 ${apyStr}이며, ${floorStr} TVL 기준을 넘는 ${count}개 풀 중 최고예요. 수익률은 DefiLlama의 실시간 데이터이며 이상 수치(APY 1000% 초과) 풀은 제외했어요.`,
    tcpFaqQ1: (label) => `오늘 ${label}의 가장 높은 수익률은 얼마인가요?`,
    tcpFaqA1: (apyStr, project, chain) => `DefiLlama 실시간 데이터 기준, ${chain}의 ${project}에서 APY ${apyStr}예요.`,
    tcpFaqQ2: (label) => `${label} 풀 중 TVL 기준을 통과한 풀은 몇 개인가요?`,
    // 174: "이 페이지의 기준" — "DeFi Garden의 기준"이 아니에요 (위 tcpTokenIntro 주석 참고).
    tcpFaqA2: (count, tvlStr, floorStr) => `이 페이지의 ${floorStr} TVL 기준을 통과한 실시간 풀은 ${count}개이며, 합산 TVL은 ${tvlStr}예요.`,
    tcpFaqQ3: "이 수익률은 안전한가요?",
    // 174: floorStr은 항상 호출부의 formatUsd(MIN_POOL_TVL) 값이며, 절대 문자열로 다시 적지 않아요.
    tcpFaqA3: (floorStr) => `이 페이지에 표시된 풀은 최소 TVL ${floorStr} 기준을 충족하고 이상 수치(APY 1000% 초과)인 풀을 제외했어요 — 이는 이 페이지의 게재 기준일 뿐, 안전을 보장하는 것은 아니에요. 이는 투자 조언이 아닌 교육 목적의 정보이며, 표시된 수익률과 무관하게 디파이에는 스마트 컨트랙트 및 시장 위험이 따라요.`,
    tcpRateStabilityHeading: "APY 이력 기반 수익률 안정성",
    tcpRateStabilityFaqQ: (symbol) => `${symbol} 풀 중 APY 이력이 가장 안정적인 후보는 무엇인가요?`,
    tcpRateStabilityCandidate: (project, chain, apyStr, tvlStr, href) =>
      `${chain}의 ${project}, APY ${apyStr}, TVL ${tvlStr}, ${href}`,
    tcpRateStabilityRankedAnswer: (symbol, candidates) =>
      `APY 이력만 기준으로 비교한 ${symbol}의 변동성 낮은 후보는 ${candidates}예요. 이 비교는 프로토콜, 익스플로잇, 디페그, 유동성, 거버넌스 또는 원금 손실 위험을 측정하지 않아요.`,
    tcpRateStabilityInsufficientAnswer: (symbol) =>
      `비교할 수 있는 ${symbol} 풀의 APY 이력이 충분하지 않아요. 이 내용은 APY 이력만 다루며 프로토콜, 익스플로잇, 디페그, 유동성, 거버넌스 또는 원금 손실 위험을 측정하지 않아요.`,
    tcpRateStabilityColRank: "순위",
    // "이 수익률은 어떻게 움직였을까요" 심층 섹션 (item 232) — 헤드 페이지에만 표시돼요.
    // 아래 문자열이 감싸는 수치는 전부 rateBehaviourFor()가 위 표와 같은,
    // 안전 기준을 통과한 rec.pools에서 계산한 값이며 여기서 다시 타이핑하지 않아요.
    tcpDepthHeading: "이 수익률은 어떻게 움직였을까요",
    // defect 3 (coordinator review): no ambiguous slashed-particle pair
    // (topic/object/subject marker written both ways, parenthesized) —
    // "풀은" is a fixed noun+particle that never varies with the interpolated
    // symbol's batchim, same structural fix tcpTokenIntro/tcpSubLine already
    // use elsewhere in this catalog.
    tcpDepthSpread: (symbol, poolCount, lowApyStr, highApyStr, chainCount) =>
      `${symbol} 풀은 여기 ${poolCount}개가 있고, ${chainCount}개 체인에서 APY가 ${lowApyStr}부터 ${highApyStr}까지 나타나요 — 같은 토큰이라도 어떤 프로토콜과 체인을 고르느냐에 따라 수익률이 달라져요.`,
    tcpDepthMean: (meanCount, poolCount, medianMeanStr) =>
      `${poolCount}개 풀 중 ${meanCount}개는 믿을 수 있는 30일 평균값이 있고, 중앙값은 ${medianMeanStr}예요 — 오늘 수익률과 비교하면 꾸준한 편인지 일시적으로 튄 값인지 가늠할 수 있어요.`,
    tcpDepthMixIncentives: (rewardCount, poolCount) =>
      `${poolCount}개 풀 중 ${rewardCount}개는 기본 금리에 인센티브·리워드 APY가 더해져 있어요. 인센티브 수익률은 보상 프로그램이 줄어들면서 시간이 지나면 낮아지는 경향이 있으니, 기본 금리가 더 오래가는 숫자예요.`,
    tcpDepthMixAllBase: (poolCount) =>
      `현재 ${poolCount}개 풀 모두 인센티브 없이 순수 기본 금리만 지급하고 있어요.`,
    tcpDepthIlExposure: (ilCount, poolCount) =>
      `${poolCount}개 풀 중 ${ilCount}개는 비영구적 손실(IL) 위험이 있어요 — 두 자산을 맞춰 넣는 포지션은 수익이 나는 중에도 그냥 들고 있는 것보다 가치가 줄어들 수 있어요.`,
    tcpDepthColMix: "수익 구성",
    tcpDepthMixBaseCell: "기본 금리",
    tcpDepthMixIncentiveCell: (shareStr) => `인센티브 ${shareStr}`,
    tcpDepthNote: (floorStr) =>
      `30일 평균은 DefiLlama의 데이터를 그대로 가져오며, 이 페이지의 다른 모든 숫자와 같은 안전 기준을 통과했을 때만 표시돼요 — 대시(—)는 숨긴 게 아니라 그 기준을 통과하지 못했다는 뜻이에요. 여기 풀은 모두 최소 TVL ${floorStr} 기준을 충족해요. 수익률은 매일 바뀌니 이건 예측이 아니라 지금 이 순간의 스냅샷이에요.`,
    tcpRelatedTokensHeading: "관련 토큰",
    tcpRelatedChainsHeading: "관련 체인",
    tcpAvailableOnHeading: "이용 가능한 체인",
    tcpByCategoryHeading: "카테고리별",
    tcpTopTokensOnHeading: (chain) => `${chain}의 인기 토큰`,
    tcpTokenHubTitle: "모든 디파이 토큰의 실시간 수익률 | DeFi Garden 🌱",
    tcpTokenHubDescription: (count) => `실시간, 신뢰 기준을 통과한 디파이 수익률 데이터를 보유한 토큰 ${count}개 — TVL 기준 상위 풀을 이름별로 찾아보세요. DefiLlama 기반의 정직한 수익률, 이상 수치 없음.`,
    tcpTokenHubHeading: "전체 토큰 수익률 페이지",
    tcpTokenHubSub: (count) => `실시간, 신뢰 기준을 통과한 수익률 데이터를 보유한 토큰 ${count}개`,
    // 174: "${floorStr} TVL 기준" — "$100K 기준"으로 다시 적지 않아요.
    tcpTokenHubIntro: (floorStr) => `DeFi Garden의 모든 토큰 페이지를 한곳에 모았어요 — ${floorStr} TVL 기준과 이상 수치 필터를 통과한 실시간 풀을 TVL 순으로 정렬했어요. TVL 상위 토큰부터 살펴보거나, 알파벳으로 바로 찾아보세요.`,
    tcpHubBackCta: "← DeFi Garden으로 돌아가기",
    tcpTopTokensByTvlHeading: "TVL 상위 토큰",
    tcpBrowseAZHeading: "전체 토큰 A–Z 보기",
    tcpChainHubTitle: "모든 체인의 실시간 디파이 수익률 | DeFi Garden 🌱",
    tcpChainHubDescription: (count) => `실시간, 신뢰 기준을 통과한 디파이 수익률 데이터를 보유한 체인 ${count}개, TVL 순으로 정렬했어요. DefiLlama 기반의 정직한 수익률, 이상 수치 없음.`,
    tcpChainHubHeading: "전체 체인 수익률 페이지",
    tcpChainHubSub: (count) => `실시간, 신뢰 기준을 통과한 수익률 데이터를 보유한 체인 ${count}개`,
    tcpChainHubIntro: (floorStr) => `DeFi Garden의 모든 체인 페이지를 한곳에 모았어요 — ${floorStr} TVL 기준과 이상 수치 필터를 통과한 실시간 풀을 TVL 순으로 정렬했어요.`,
    tcpAllChainsHeading: "전체 체인",
    tcpAzTitle: (letter) => `${letter}로 시작하는 토큰 | DeFi Garden 🌱`,
    tcpAzDescription: (letter, count) => `"${letter}"로 시작하는 디파이 토큰 ${count}개, 실시간 신뢰 기준을 통과한 수익률 데이터를 DeFi Garden에서 확인하세요.`,
    tcpAzHeading: (letter) => `${letter}로 시작하는 토큰`,
    tcpAzSub: (count) => `토큰 ${count}개`,
    tcpAzBackCta: "← 전체 토큰",

    // Yield-Funded Virtual Card Terminal (PRD Design 3)
    yieldCardBadge: "얼리 액세스",
    yieldCardTitle: "수익 기반 가상 카드",
    yieldCardSubtitle: "예치금 원금은 100% 그대로 지키고, 발생하는 이자로만 구독 서비스를 자동 결제하세요.",
    yieldCardSimulatedDeposit: "시뮬레이션 예치금",
    yieldCardMonthlyYieldGenerated: "월 예상 발생 수익",
    yieldCardPerMonth: "/ 월",
    yieldCardStatusCovered: "✓ 완전 무료",
    yieldCardStatusLocked: "잠김",
    yieldCardRequiresCapital: (cap) => `필요 예치금 ${cap}`,
    yieldCardReserveTitle: "이 풀의 수익으로 가상 카드 예약하기",
    yieldCardReserveSubtitle: "무료 등록 • 원금은 절대 건드리지 않고 이자로만 결제 • 지갑 불필요",
    yieldCardEmailPlaceholder: "이메일 주소를 입력하세요...",
    yieldCardSubmitBtn: "출시 시 카드 발급 신청 →",
    yieldCardSubmitting: "예약 등록 중...",
    yieldCardInvalidEmail: "올바른 이메일 주소를 입력해주세요.",
    yieldCardReceiptTitle: "웨이트리스트 등록 완료 🌱",
    yieldCardSpotNumber: (num) => `대기 순번 #${num}`,
    yieldCardReceiptNote: "이 풀에 대한 가상 카드 발급이 시작되면 가장 먼저 이메일로 알려드립니다.",
    yieldCardShareLink: "공유 링크 복사",
    yieldCardLinkCopied: "클립보드에 복사됨!",
    yieldCardFundedSuffix: "결제 전용",
    yieldCardDedicatedSuffix: "결제 전용",
    yieldCardCardCap: (amount) => `월 한도: $${amount}`,
    yieldCardCardCapKrw: (amount) => `월 한도: ₩${amount}`,
    yieldCardLiveApyFunded: "이자 직결",
    yieldCardLiveApyDirect: "이자 직결",
    yieldCardCoveredFree: "완전 무료",
    yieldCardClickToUnlock: "클릭 시 필요 예치금으로 자동 설정",
    'yieldCard.badge': "얼리 액세스",
    'yieldCard.title': "수익 기반 가상 카드",
    'yieldCard.subtitle': "예치금 원금은 100% 그대로 지키고, 발생하는 이자로만 구독 서비스를 자동 결제하세요.",
    'yieldCard.simulatedDeposit': "시뮬레이션 예치금",
    'yieldCard.monthlyYield': "월 예상 발생 수익",
    'yieldCard.monthlyYieldGenerated': "월 예상 발생 수익",
    'yieldCard.perMonth': "/ 월",
    'yieldCard.statusCovered': "✓ 완전 무료",
    'yieldCard.statusLocked': "잠김",
    'yieldCard.covered': "✓ 완전 무료",
    'yieldCard.locked': "잠김",
    'yieldCard.requiresCapital': (cap) => `필요 예치금 ${cap}`,
    'yieldCard.requires': (cap) => `필요 예치금 ${cap}`,
    'yieldCard.reserveTitle': "이 풀의 수익으로 가상 카드 예약하기",
    'yieldCard.reserveSubtitle': "무료 등록 • 원금은 절대 건드리지 않고 이자로만 결제 • 지갑 불필요",
    'yieldCard.emailPlaceholder': "이메일 주소를 입력하세요...",
    'yieldCard.submitBtn': "출시 시 카드 발급 신청 →",
    'yieldCard.reserve': "출시 시 카드 발급 신청 →",
    'yieldCard.submitting': "예약 등록 중...",
    'yieldCard.invalidEmail': "올바른 이메일 주소를 입력해주세요.",
    'yieldCard.receiptTitle': "웨이트리스트 등록 완료 🌱",
    'yieldCard.spotNumber': (num) => `대기 순번 #${num}`,
    'yieldCard.receiptNote': "이 풀에 대한 가상 카드 발급이 시작되면 가장 먼저 이메일로 알려드립니다.",
    'yieldCard.shareLink': "공유 링크 복사",
    'yieldCard.linkCopied': "클립보드에 복사됨!",
    'yieldCard.cardCap': (amount) => `월 한도: $${amount}`,
    'yieldCard.cardCapKrw': (amount) => `월 한도: ₩${amount}`,
    'yieldCard.cardFundedSuffix': "결제 전용",
    'yieldCard.cardDedicatedSuffix': "결제 전용",
    'yieldCard.fundedSuffix': "결제 전용",
    'yieldCard.dedicatedSuffix': "결제 전용",
    'yieldCard.liveApyFunded': "이자 직결",
    'yieldCard.liveApyDirect': "이자 직결",
  }
};

// Language detection helper
function detectUserLanguage() {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.startsWith('ko')) return 'ko';
  return 'en';
}

// 241: the ONE pinned en-US formatter for numbers that reach the dictionary.
// Identity for anything that is not a finite number, so it is safe to apply to
// parameters callers have already formatted (the majority — `amt`, `apy`, `tvl`
// arrive as pre-formatted strings).
function formatCount(value) {
  return (typeof value === 'number' && Number.isFinite(value))
    ? value.toLocaleString('en-US')
    : value;
}

// Translation helper function
function createTranslationFunction(language) {
  return function t(key, ...params) {
    // 241: pin every numeric param en-US at this one accessor chokepoint —
    // the entry never sees a raw number, so a bare `${count}` interpolation
    // inside the dictionary can no longer render an unformatted digit run.
    const mappedParams = params.map(formatCount);
    const translation = translations[language][key];
    if (!translation) {
      // Fallback to English if translation missing
      const fallback = translations['en'][key];
      return fallback ? (typeof fallback === 'function' ? fallback(...mappedParams) : fallback) : key;
    }
    if (typeof translation === 'function') {
      return translation(...mappedParams);
    }
    return translation;
  };
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translations,
    detectUserLanguage,
    createTranslationFunction,
    formatCount
  };
}
