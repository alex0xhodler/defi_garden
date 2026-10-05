'use strict';

/**
 * i18n/pt.js — Portuguese (Brazil) strings for the STATIC SEO pages (tokens/, chains/,
 * pools/ pages, hubs and sitemaps under /pt/). Node-only: read by the
 * generators through i18n/index.js, never shipped to a browser.
 *
 * Shape: { key: string | function } — the same keys, parameters and
 * semantics as the EN entries in translations.js / i18n/static-en-ko.js.
 * Missing keys fall back to EN per key. Every entry starts as the EN value
 * marked `// TODO-TRANSLATE`; translate it and delete the marker.
 * `node scripts/i18n-key-inventory.js` is the done-check.
 *
 * Rules for translators
 *  - Parameters arrive already formatted (en-US numbers, "$1.2M", "12.34%").
 *    Print each one exactly as received: never reformat, round or localise it,
 *    and never use toLocaleString / Intl in here.
 *  - Keep every number that is written into a string (35%, 25%, 15%, "5" ...).
 *  - Entries that contain HTML or Markdown syntax keep it intact.
 *  - Brand/ticker/technical terms (DeFi Garden, DefiLlama, DeFi Score, APY,
 *    TVL, USDC ...) stay as they are.
 *  - 'landing.*' and 'planner.*' keys are the nested namespaces of
 *    translations.js, flattened.
 */
module.exports = {
  "aiAgents": "AI Agents & MCP",  // TODO-TRANSLATE
  "apyMean30d": "30d Mean APY",  // TODO-TRANSLATE
  "browseChains": "Browse chains",  // TODO-TRANSLATE
  "browseTokens": "Browse tokens",  // TODO-TRANSLATE
  "defillamaApi": "DefiLlama API",  // TODO-TRANSLATE
  "footerSignOff": "Education, not advice.",  // TODO-TRANSLATE
  "landing.navAgents": "AI Agents & MCP",  // TODO-TRANSLATE
  "landing.navClose": "Close menu",  // TODO-TRANSLATE
  "landing.navMenu": "Open menu",  // TODO-TRANSLATE
  "landing.navMobile": "Mobile navigation",  // TODO-TRANSLATE
  "landing.navPlanner": "Savings Planner",  // TODO-TRANSLATE
  "landing.navPrimary": "Primary navigation",  // TODO-TRANSLATE
  "landing.navSearch": "Search yields",  // TODO-TRANSLATE
  "landing.themeDark": "Switch to dark mode",  // TODO-TRANSLATE
  "landing.themeLight": "Switch to light mode",  // TODO-TRANSLATE
  "planner.ladderClaude": "Claude Pro",  // TODO-TRANSLATE
  "poweredBy": "Powered by",  // TODO-TRANSLATE
  "pspAccessHeading": "Who can access it",  // TODO-TRANSLATE
  "pspAccessOpen": "Permissionless — anyone with a wallet",  // TODO-TRANSLATE
  "pspAccessOpenNote": "This project is not on DeFi Garden's list of restricted (KYC or accredited-only) projects. The protocol's own terms and regional restrictions can still apply.",  // TODO-TRANSLATE
  "pspAccessRestricted": "Permissioned / KYC only",  // TODO-TRANSLATE
  "pspAccessRestrictedNote": "This project is on DeFi Garden's list of restricted projects (KYC, accredited or qualified-purchaser access). Most retail users cannot deposit directly.",  // TODO-TRANSLATE
  "pspAccuracyLink": "See how past forecasts performed",  // TODO-TRANSLATE
  "pspBaseApy": "Base APY",  // TODO-TRANSLATE
  "pspBreadcrumbPools": "Pools",  // TODO-TRANSLATE
  "pspChartCaption": "Solid line: daily APY from DefiLlama. Shaded area: the model's p10 to p90 range, drawn as a straight fan from today's rate to the end of the forecast horizon (not daily quantiles). Dashed line: the model's median path.",  // TODO-TRANSLATE
  "pspChartHeading": "APY history and forecast",  // TODO-TRANSLATE
  "pspChartHorizon": (days) => `+${days}d`,  // TODO-TRANSLATE
  "pspChartTitle": (name, sym, chain, histDays, horizon, p10, p90) =>
      `${name} ${sym} on ${chain}: APY over the last ${histDays} days, then a ${horizon}-day forecast band from ${p10} to ${p90}`,  // TODO-TRANSLATE
  "pspChartToday": "today",  // TODO-TRANSLATE
  "pspCrashRisk": (level) => ({ LOW: "Low crash risk", MEDIUM: "Medium crash risk", HIGH: "High crash risk" }[level] || `Crash risk: ${level}`),  // TODO-TRANSLATE
  "pspCta": "Open in the Decision Terminal →",  // TODO-TRANSLATE
  "pspDataAsOf": (date) => `Data as of ${date}. Source: DefiLlama pool data; score and forecast computed by DeFi Garden.`,  // TODO-TRANSLATE
  "pspDatasetDescription": (name, sym, chain) => `Live DefiLlama yield data for ${name} ${sym} on ${chain}, with the DeFi Garden DeFi Score breakdown and a 14-day model forecast band.`,  // TODO-TRANSLATE
  "pspDatasetName": (name, sym, chain) => `${name} ${sym} on ${chain}: APY, DeFi Score and 14-day forecast`,  // TODO-TRANSLATE
  "pspDescription": (name, sym, chain, apy, mean30, tvl, score, p10, p90, date) =>
      `${name} ${sym} on ${chain}: ${apy} APY live, ${mean30} 30-day mean, ${tvl} TVL, DeFi Score ${score}/100, 14-day model forecast ${p10} to ${p90}. Data as of ${date}.`,  // TODO-TRANSLATE
  "pspExposureMulti": "Exposure: multiple assets.",  // TODO-TRANSLATE
  "pspExposureSingle": "Exposure: a single asset.",  // TODO-TRANSLATE
  "pspForecastDisclaimer": (totalRuns, noBetter, evaluated) => {
      if (!totalRuns || Number(totalRuns) <= 0) return "Experimental model: not yet shown to be more accurate than assuming today's rate holds. Past evaluation is publicly documented.";
      let s = `Experimental model: across ${totalRuns} resolved test runs`;
      if (noBetter != null && evaluated != null) s += `, in ${noBetter} of ${evaluated} assuming today's rate holds was at least as accurate`;
      return s + '. Past multi-run evaluation is publicly documented.';
    },  // TODO-TRANSLATE
  "pspForecastFlat": (cur, p50) => `Read: the model expects the rate to stay roughly flat, from ${cur} today to about ${p50}.`,  // TODO-TRANSLATE
  "pspForecastHeading": "14-day forecast band (experimental)",  // TODO-TRANSLATE
  "pspForecastHigher": (cur, p50) => `Read: the model expects the rate to drift higher, from ${cur} today to about ${p50}.`,  // TODO-TRANSLATE
  "pspForecastLead": (days, p50, p10, p90) => `Model forecast for the next ${days} days: median ${p50}, range ${p10} to ${p90} (p10 to p90).`,  // TODO-TRANSLATE
  "pspForecastLower": (cur, p50) => `Read: the model expects the rate to drift lower, from ${cur} today to about ${p50}.`,  // TODO-TRANSLATE
  "pspH1": (name, sym, chain) => `${name} ${sym} on ${chain}: APY, DeFi Score & 14-day forecast`,  // TODO-TRANSLATE
  "pspHubDescription": (count) => `${count} large DeFi pools with live APY, a DeFi Score breakdown and a 14-day forecast band.`,  // TODO-TRANSLATE
  "pspHubHeading": "Scored DeFi pools",  // TODO-TRANSLATE
  "pspHubIntro": "Each page shows the live rate, the DeFi Score pillars, a 14-day model forecast band, who can access the pool and the main risks. Numbers come from DefiLlama; scores and forecasts are model outputs.",  // TODO-TRANSLATE
  "pspHubLink": "Browse scored pools →",  // TODO-TRANSLATE
  "pspHubSub": (count, tvlFloor) => `${count} pools with at least ${tvlFloor} TVL and 30 days of history.`,  // TODO-TRANSLATE
  "pspHubTitle": "Scored DeFi Pools: APY, DeFi Score & Forecast | DeFi Garden",  // TODO-TRANSLATE
  "pspIlNo": "DefiLlama flags no impermanent-loss risk for this pool.",  // TODO-TRANSLATE
  "pspIlYes": "DefiLlama flags impermanent-loss risk for this pool.",  // TODO-TRANSLATE
  "pspLegendBand": "Forecast p10 to p90",  // TODO-TRANSLATE
  "pspLegendHistory": "Observed APY",  // TODO-TRANSLATE
  "pspLegendMedian": "Forecast median",  // TODO-TRANSLATE
  "pspLiveApy": "Live APY",  // TODO-TRANSLATE
  "pspMean30": "30-day mean APY",  // TODO-TRANSLATE
  "pspMethodologyLink": "Score and forecast details (MCP server)",  // TODO-TRANSLATE
  "pspNotAdvice": "Education, not financial advice. DeFi carries smart-contract, market and regulatory risk, and you can lose money.",  // TODO-TRANSLATE
  "pspP10": "Low case (p10)",  // TODO-TRANSLATE
  "pspP50": "Median (p50)",  // TODO-TRANSLATE
  "pspP90": "High case (p90)",  // TODO-TRANSLATE
  "pspPillarLiquidity": "Exit liquidity",  // TODO-TRANSLATE
  "pspPillarStability": "Yield stability",  // TODO-TRANSLATE
  "pspPillarStickiness": "Capital stickiness",  // TODO-TRANSLATE
  "pspPillarSustainability": "Sustainability",  // TODO-TRANSLATE
  "pspPoolMeta": (meta) => `Pool variant: ${meta}.`,  // TODO-TRANSLATE
  "pspRewardApy": "Reward APY",  // TODO-TRANSLATE
  "pspRiskContract": "Smart-contract risk: a bug or exploit in the protocol or its dependencies can lose deposited funds.",  // TODO-TRANSLATE
  "pspRiskCrash": (label) => `Model flag: ${label} for the next 14 days.`,  // TODO-TRANSLATE
  "pspRiskIl": "Impermanent loss: this pool's value can fall behind simply holding the assets if their prices diverge.",  // TODO-TRANSLATE
  "pspRiskNone": "No pool-specific warning flags in the data beyond the standing risks above.",  // TODO-TRANSLATE
  "pspRiskReward": (pct) => `Reward decay: ${pct} of the headline APY is paid in emitted tokens, which can shrink or stop.`,  // TODO-TRANSLATE
  "pspRiskTvlDown": (pct) => `Shrinking deposits: TVL changed ${pct} over the tracked window, so capital is leaving.`,  // TODO-TRANSLATE
  "pspRiskTvlUp": (pct) => `Growing deposits: TVL changed ${pct} over the tracked window. That is one sign of demand, not a guarantee, and a rising TVL can dilute rewards.`,  // TODO-TRANSLATE
  "pspRiskVol": (stdev, apy) => `Volatile rate: the 30-day standard deviation is ${stdev} against a ${apy} current rate.`,  // TODO-TRANSLATE
  "pspRisksHeading": "Risks",  // TODO-TRANSLATE
  "pspScoreHeading": "DeFi Score: Yield Quality",  // TODO-TRANSLATE
  "pspScoreNote": "The score evaluates yield quality across four pillars (stability, fee sustainability, depositor stickiness, exit liquidity). Note: capital stickiness incorporates default estimates where on-chain wallet distribution is unindexed.",  // TODO-TRANSLATE
  "pspScoreValue": (score) => `Score ${score} / 100`,  // TODO-TRANSLATE
  "pspSecondaryChain": (chain) => `More ${chain} pools →`,  // TODO-TRANSLATE
  "pspSecondaryProtocol": (name) => `Go to ${name} →`,  // TODO-TRANSLATE
  "pspSimilarHeading": "Similar pools",  // TODO-TRANSLATE
  "pspSimilarItem": (name, sym, chain, tvl) => `${name} ${sym} on ${chain} (${tvl} TVL)`,  // TODO-TRANSLATE
  "pspSourceBase": (apy, pct) => `${apy} (${pct} of the total) is base yield: trading fees or interest paid by the protocol's users.`,  // TODO-TRANSLATE
  "pspSourceHeading": "What produces this yield",  // TODO-TRANSLATE
  "pspSourceNone": "DefiLlama reports no base or reward APY for this pool right now.",  // TODO-TRANSLATE
  "pspSourceReward": (apy, pct) => `${apy} (${pct} of the total) comes from reward tokens the protocol emits to attract deposits. Emissions can be cut or end.`,  // TODO-TRANSLATE
  "pspSummaryHeading": "Summary",  // TODO-TRANSLATE
  "pspTitleBare": (name, sym, chain) => `${name} ${sym} APY on ${chain}`,  // TODO-TRANSLATE
  "pspTitleDated": (name, sym, chain, date) => `${name} ${sym} APY on ${chain} (${date}) | DeFi Garden`,  // TODO-TRANSLATE
  "pspTitleUndated": (name, sym, chain) => `${name} ${sym} APY on ${chain} | DeFi Garden`,  // TODO-TRANSLATE
  "pspTvl": "TVL",  // TODO-TRANSLATE
  "pspWithdrawGeneric": "Lock-ups, cooldowns and withdrawal queues are set by the protocol's contracts and are not in the DefiLlama feed. Check the protocol's documentation before depositing.",  // TODO-TRANSLATE
  "pspWithdrawHeading": "Withdrawal notes",  // TODO-TRANSLATE
  "pspWithdrawLiquidity": (tvl, score, max) => `Exit liquidity pillar: ${score} / ${max}, with ${tvl} in the pool.`,  // TODO-TRANSLATE
  "pspWithdrawTvlForecast": (pred, delta) => `The model projects TVL of ${pred} in 14 days (${delta}).`,  // TODO-TRANSLATE
  "tcpAllChainsHeading": "All chains",  // TODO-TRANSLATE
  "tcpAnswer": (label, apyStr, project, chain, count, floorStr) =>
      `The highest honest ${label} yield right now is ${apyStr} on ${project} (${chain}), among ${count} ${String(count) === '1' ? 'pool' : 'pools'} above the ${floorStr} TVL floor. Rates are live from DefiLlama and exclude anomalous (>1000% APY) pools.`,  // TODO-TRANSLATE
  "tcpAvailableOnHeading": "Available on",  // TODO-TRANSLATE
  "tcpAzBackCta": "← All tokens",  // TODO-TRANSLATE
  "tcpAzDescription": (letter, count) => `${count} DeFi tokens starting with "${letter}" with live, trust-filtered yield data on DeFi Garden.`,  // TODO-TRANSLATE
  "tcpAzHeading": (letter) => `Tokens starting with ${letter}`,  // TODO-TRANSLATE
  "tcpAzSub": (count) => `${count} tokens`,  // TODO-TRANSLATE
  "tcpAzTitle": (letter) => `Tokens starting with ${letter} | DeFi Garden 🌱`,  // TODO-TRANSLATE
  "tcpBreadcrumbChains": "Chains",  // TODO-TRANSLATE
  "tcpBreadcrumbHome": "Home",  // TODO-TRANSLATE
  "tcpBreadcrumbTokens": "Tokens",  // TODO-TRANSLATE
  "tcpBrowseAZHeading": "Browse all tokens A–Z",  // TODO-TRANSLATE
  "tcpByCategoryHeading": "By category",  // TODO-TRANSLATE
  "tcpChainCta": (chain) => `See live pools on ${chain} →`,  // TODO-TRANSLATE
  "tcpChainDescription": (chain, count, apy, tokenCount, floorStr) =>
      `${count} live ${String(count) === '1' ? 'pool' : 'pools'} on ${chain} above the ${floorStr} TVL floor, up to ${apy} APY, across ${tokenCount} ${String(tokenCount) === '1' ? 'token' : 'tokens'}. Honest yields from DefiLlama data — no anomalous rates.`,  // TODO-TRANSLATE
  "tcpChainHeading": (chain) => `${chain} DeFi Yields`,  // TODO-TRANSLATE
  "tcpChainHubDescription": (count) => `${count} chains with live, trust-filtered DeFi yield data, ranked by TVL. Honest yields from DefiLlama, no anomalous rates.`,  // TODO-TRANSLATE
  "tcpChainHubHeading": "All Chain Yield Pages",  // TODO-TRANSLATE
  "tcpChainHubIntro": (floorStr) => `Every DeFi Garden chain page in one place — live pools ranked by TVL, filtered through a ${floorStr} TVL floor and anomaly rails.`,  // TODO-TRANSLATE
  "tcpChainHubSub": (count) => `${count} chains with live, trust-filtered yield data`,  // TODO-TRANSLATE
  "tcpChainHubTitle": "Every Chain's Live DeFi Yields | DeFi Garden 🌱",  // TODO-TRANSLATE
  "tcpChainIntro": (chain, project, symbol, apy, tvl, count, tokenCount, totalTvl, floorStr) =>
      `${chain}'s largest live pool is ${project} (${symbol}) at ${apy} (${tvl} TVL). ${count} ${String(count) === '1' ? 'pool' : 'pools'} across ${tokenCount} ${String(tokenCount) === '1' ? 'token' : 'tokens'} clear this page's ${floorStr} TVL floor, ${totalTvl} in total.`,  // TODO-TRANSLATE
  "tcpChainTitle": (chain, dateStr) => dateStr
      ? `Best ${chain} Yield Rates (${dateStr}) — Live Pools Compared | DeFi Garden`
      : `${chain} DeFi Yields — Live Pools by TVL | DeFi Garden`,  // TODO-TRANSLATE
  "tcpChainsAriaLabel": "Chains",  // TODO-TRANSLATE
  "tcpColApy": "APY",  // TODO-TRANSLATE
  "tcpColChain": "Chain",  // TODO-TRANSLATE
  "tcpColProtocol": "Protocol",  // TODO-TRANSLATE
  "tcpColToken": "Token",  // TODO-TRANSLATE
  "tcpColTvl": "TVL",  // TODO-TRANSLATE
  "tcpDatasetChainDescription": (chain, floorStr) => `Live DefiLlama yield data for ${chain} pools on DeFi Garden, filtered by a ${floorStr} TVL floor and anomalous-APY exclusion.`,  // TODO-TRANSLATE
  "tcpDatasetChainName": (chain) => `${chain} DeFi Yields Dataset`,  // TODO-TRANSLATE
  "tcpDatasetTokenDescription": (sym, floorStr) => `Live DefiLlama yield data for ${sym} pools on DeFi Garden, filtered by a ${floorStr} TVL floor and anomalous-APY exclusion.`,  // TODO-TRANSLATE
  "tcpDatasetTokenName": (sym) => `${sym} DeFi Yields Dataset`,  // TODO-TRANSLATE
  "tcpDepthColMix": "Yield mix",  // TODO-TRANSLATE
  "tcpDepthHeading": "How this rate has behaved",  // TODO-TRANSLATE
  "tcpDepthIlExposure": (ilCount, poolCount) =>
      `${ilCount} of ${poolCount} ${Number(poolCount) === 1 ? 'pool' : 'pools'} ${Number(ilCount) === 1 ? 'carries' : 'carry'} impermanent-loss risk, meaning a two-sided position can lose value against just holding, even while it earns yield.`,  // TODO-TRANSLATE
  "tcpDepthMean": (meanCount, poolCount, medianMeanStr) =>
      `${meanCount} of these ${poolCount} ${Number(poolCount) === 1 ? 'pool' : 'pools'} ${Number(meanCount) === 1 ? 'has' : 'have'} a trustworthy 30-day average on file, with a median of ${medianMeanStr} — a useful check against today's number for whether the rate is steady or just having a good day.`,  // TODO-TRANSLATE
  "tcpDepthMixAllBase": (poolCount) =>
      `All ${poolCount} ${Number(poolCount) === 1 ? 'pool pays' : 'pools pay'} a plain base rate right now — no incentive or reward APY mixed in.`,  // TODO-TRANSLATE
  "tcpDepthMixBaseCell": "Base rate",  // TODO-TRANSLATE
  "tcpDepthMixIncentiveCell": (shareStr) => `${shareStr} incentives`,  // TODO-TRANSLATE
  "tcpDepthMixIncentives": (rewardCount, poolCount) =>
      `${rewardCount} of ${poolCount} ${Number(poolCount) === 1 ? 'pool' : 'pools'} ${Number(rewardCount) === 1 ? 'blends' : 'blend'} in incentive or reward APY on top of the base rate. Incentive yield decays over time as reward programs run down — the base rate is the more durable number.`,  // TODO-TRANSLATE
  "tcpDepthNote": (floorStr) =>
      `The 30-day average comes straight from DefiLlama and only appears when it passes the same sanity rail as every other number on this page — a dash means it didn't clear that bar, not that it's being hidden. Every pool here already clears a ${floorStr} minimum TVL. Rates move daily, so treat this as a snapshot, not a promise.`,  // TODO-TRANSLATE
  "tcpDepthSpread": (symbol, poolCount, lowApyStr, highApyStr, chainCount) =>
      `${symbol} shows up in ${poolCount} ${poolCount === 1 ? 'pool' : 'pools'} here, with rates from ${lowApyStr} to ${highApyStr} APY across ${chainCount} ${chainCount === 1 ? 'chain' : 'chains'} — the rate depends on which protocol and chain you pick, not just the token.`,  // TODO-TRANSLATE
  "tcpFaqA1": (apyStr, project, chain) => `${apyStr} APY on ${project} (${chain}), based on live DefiLlama data.`,  // TODO-TRANSLATE
  "tcpFaqA2": (count, tvlStr, floorStr) => `${count} live ${String(count) === '1' ? 'pool' : 'pools'} clear this page's ${floorStr} TVL floor, ${tvlStr} in total.`,  // TODO-TRANSLATE
  "tcpFaqA3": (floorStr) => `Pools listed on this page clear a ${floorStr} minimum TVL and exclude anomalous (>1000% APY) rates — that is this page's listing bar, not a safety guarantee. This is education, not financial advice; DeFi carries smart-contract and market risk regardless of the rate shown.`,  // TODO-TRANSLATE
  "tcpFaqHeading": "Frequently asked questions",  // TODO-TRANSLATE
  "tcpFaqQ1": (label) => `What's the highest ${label} yield today?`,  // TODO-TRANSLATE
  "tcpFaqQ2": (label) => `How many ${label} pools clear the TVL floor?`,  // TODO-TRANSLATE
  "tcpFaqQ3": "Are these rates safe?",  // TODO-TRANSLATE
  "tcpFooterTagline": "plan your DeFi savings by goal.",  // TODO-TRANSLATE
  "tcpHubBackCta": "← Back to DeFi Garden",  // TODO-TRANSLATE
  "tcpItemListName": (project, chain) => `${project} on ${chain}`,  // TODO-TRANSLATE
  "tcpLanguageLabel": "Language",  // TODO-TRANSLATE
  "tcpLastUpdated": (date) => `Last updated ${date}`,  // TODO-TRANSLATE
  "tcpMonthYear": (monthShortEn, month, year) => `${monthShortEn} ${year}`,  // TODO-TRANSLATE
  "tcpPoolCategoriesAriaLabel": "Pool categories",  // TODO-TRANSLATE
  "tcpRateStabilityCandidate": (project, chain, apyStr, tvlStr, href) =>
      `${project} (${chain}), ${apyStr} APY, ${tvlStr} TVL, ${href}`,  // TODO-TRANSLATE
  "tcpRateStabilityColRank": "Rank",  // TODO-TRANSLATE
  "tcpRateStabilityFaqQ": (symbol) => `Which ${symbol} pools have the most stable APY history?`,  // TODO-TRANSLATE
  "tcpRateStabilityHeading": "Rate stability from APY history",  // TODO-TRANSLATE
  "tcpRateStabilityInsufficientAnswer": (symbol) =>
      `There is not enough qualifying APY history to rank ${symbol} pools. This view covers APY history only and does not measure protocol, exploit, depeg, liquidity, governance, or principal-loss risk.`,  // TODO-TRANSLATE
  "tcpRateStabilityRankedAnswer": (symbol, candidates) =>
      `Based on APY history only, ${symbol}'s lower-variability candidates are ${candidates}. This comparison does not measure protocol, exploit, depeg, liquidity, governance, or principal-loss risk.`,  // TODO-TRANSLATE
  "tcpRelatedChainsHeading": "Related chains",  // TODO-TRANSLATE
  "tcpRelatedTokensHeading": "Related tokens",  // TODO-TRANSLATE
  "tcpRestrictedAccessTitle": "Restricted access (KYC/accredited)",  // TODO-TRANSLATE
  "tcpSubLine": (count, floorStr) => `${count} live ${String(count) === '1' ? 'pool' : 'pools'} above the ${floorStr} TVL floor · ranked by TVL`,  // TODO-TRANSLATE
  "tcpTokenCta": (sym) => `See live ${sym} pools →`,  // TODO-TRANSLATE
  "tcpTokenDescription": (sym, count, apy, chainCount, floorStr) =>
      `${count} live ${sym} ${String(count) === '1' ? 'pool' : 'pools'} above the ${floorStr} TVL floor, up to ${apy} APY, across ${chainCount} ${String(chainCount) === '1' ? 'chain' : 'chains'}. Honest yields from DefiLlama data — no anomalous rates.`,  // TODO-TRANSLATE
  "tcpTokenHeading": (sym) => `${sym} DeFi Yields`,  // TODO-TRANSLATE
  "tcpTokenHubDescription": (count) => `${count} tokens with live, trust-filtered DeFi yield data — top pools by TVL, browsable by name. Honest yields from DefiLlama, no anomalous rates.`,  // TODO-TRANSLATE
  "tcpTokenHubHeading": "All Token Yield Pages",  // TODO-TRANSLATE
  "tcpTokenHubIntro": (floorStr) => `Every DeFi Garden token page in one place — live pools ranked by TVL, filtered through a ${floorStr} TVL floor and anomaly rails. Start with the top tokens by TVL, or jump straight to a letter.`,  // TODO-TRANSLATE
  "tcpTokenHubSub": (count) => `${count} tokens with live, trust-filtered yield data`,  // TODO-TRANSLATE
  "tcpTokenHubTitle": "Every DeFi Token's Live Yields | DeFi Garden 🌱",  // TODO-TRANSLATE
  "tcpTokenIntro": (sym, project, chain, apy, tvl, count, chainCount, totalTvl, floorStr) =>
      `${sym}'s largest live pool is ${project} on ${chain} at ${apy} (${tvl} TVL). ${count} ${sym} ${String(count) === '1' ? 'pool' : 'pools'} across ${chainCount} ${String(chainCount) === '1' ? 'chain' : 'chains'} clear this page's ${floorStr} TVL floor, ${totalTvl} in total.`,  // TODO-TRANSLATE
  "tcpTokenTitle": (sym) => `${sym} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱`,  // TODO-TRANSLATE
  "tcpTopScoredHeading": (subject) => `Top ${subject} Yields by DeFi Score (Lowest Risk)`,  // TODO-TRANSLATE
  "tcpTopScoredSub": "Top 5 retail-accessible pools ranked by quantitative stability (35%), fee sustainability (25%), capital stickiness (25%), and liquidity depth (15%). No permissioned or accredited-only vaults.",  // TODO-TRANSLATE
  "tcpTopTokensByTvlHeading": "Top tokens by TVL",  // TODO-TRANSLATE
  "tcpTopTokensOnHeading": (chain) => `Top tokens on ${chain}`,  // TODO-TRANSLATE
  "tcpTrustNote": (floorStr) => `Yields are live from DefiLlama. Pools on this page clear a ${floorStr} minimum TVL and exclude anomalous rates — that's this page's listing bar, not a safety guarantee. Education only, not financial advice.`,  // TODO-TRANSLATE
  "tcpWaitlistCta": "Join the waitlist →",  // TODO-TRANSLATE
  "tcpWaitlistHeading": "Get early access to the card",  // TODO-TRANSLATE
  "tcpWaitlistMicro": "Free to join • Card doesn't exist yet • We'll email you when it does",  // TODO-TRANSLATE
  "tcpWaitlistPitchChain": (chain) => `A card that spends the yield from your ${chain} positions — never the principal. Join the waitlist and be first when it's ready.`,  // TODO-TRANSLATE
  "tcpWaitlistPitchHub": "A card that spends your DeFi yield — never your principal. Join the waitlist and be first when it's ready.",  // TODO-TRANSLATE
  "tcpWaitlistPitchToken": (sym) => `A card that spends your ${sym} yield — never your ${sym} itself. Join the waitlist and be first when it's ready.`,  // TODO-TRANSLATE
  "tcpYieldHeadline": (sym, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Your idle ${sym} could earn ~${apyStr} — park ${foreverAmtStr} and it could run a $${monthly}/mo ${subLabel} subscription, forever.`,  // TODO-TRANSLATE
  "tcpYieldHeadlineChain": (chain, apyStr, foreverAmtStr, monthly, subLabel) =>
      `Idle assets on ${chain} could earn ~${apyStr} — park ${foreverAmtStr} and it could run a $${monthly}/mo ${subLabel} subscription, forever.`,  // TODO-TRANSLATE
  "tokenHeadTitle": (sym, count, dateStr) => dateStr
      ? `Best ${sym} Yields (${dateStr}) — ${count} Live Pools Compared | DeFi Garden`
      : `Best ${sym} Yield Rates Today — ${count} Live Pools Compared | DeFi Garden`,  // TODO-TRANSLATE
  "tokenHowBaseReward": "Total APY reflects two distinct components: base APY (apyBase), earned directly from borrower interest or trading fees paid in the underlying asset, and reward APY (apyReward), distributed in secondary governance or incentive tokens that fluctuate independently.",  // TODO-TRANSLATE
  "tokenHowRisk": "All DeFi yields carry inherent risk. Smart contract vulnerabilities, protocol economic exploits, stablecoin depeg events, and liquidation cascades can result in loss of principal. DeFi products are not bank deposits and are not insured by the FDIC, SIPC, or any government entity. Information provided is for educational purposes only and does not constitute financial advice.",  // TODO-TRANSLATE
  "tokenHowSources": (sym) => `Yield on ${sym} comes from four primary on-chain mechanisms: lending spreads paid by borrowers on money markets, trading fees distributed to automated market maker (AMM) liquidity providers, native consensus or liquid staking rewards where applicable, and protocol incentives designed to attract liquidity.`,  // TODO-TRANSLATE
  "tokenHowTitle": (sym) => `How ${sym} Yield is Generated`,  // TODO-TRANSLATE
  "tokenUpdated": (date) => `Pool data verified from DefiLlama at generation time: ${date}. Rates change continuously.`,  // TODO-TRANSLATE
};
