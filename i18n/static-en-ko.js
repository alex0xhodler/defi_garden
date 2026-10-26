'use strict';

/**
 * i18n/static-en-ko.js — EN + KO strings that ONLY the static SEO generators
 * use. They used to be inline `language === 'ko' ? '...' : '...'` ternaries in
 * generate-token-pages.js / generate-chain-pages.js / generate-pool-score-pages.js;
 * they are keys now so pt/es get a per-key slot (and a TODO-TRANSLATE in the
 * scaffolded dictionaries) like every other string.
 *
 * Kept OUT of translations.js on purpose: that file ships to browsers
 * (translations.min.js) and these keys are never read there. Merged in Node by
 * i18n/index.js; the values are byte-for-byte what the inline ternaries
 * produced, so EN/KO page output is unchanged.
 *
 * Numeric parameters arrive pre-formatted as STRINGS where a bare number would
 * be en-US grouped by formatCount (a year must never render as "2,026").
 */
module.exports = {
  en: {
    // "Oct 2026" — token/chain page <title> date, pool page month label.
    // (monthShortEn, monthNumber, year) — the English short month is supplied
    // by the generator (toLocaleString('en-US')); other languages may ignore it
    // and use monthNumber to pick their own month name.
    tcpMonthYear: (monthShortEn, month, year) => `${monthShortEn} ${year}`,
    // Head-token "Top 5 by DeFi Score" table (token + chain pages).
    tcpTopScoredHeading: (subject) => `Top ${subject} Yields by DeFi Score (Lowest Risk)`,
    // The 35/25/25/15 weights mirror SCORE_PILLARS in generate-pool-score-pages.js
    // (stability / fee sustainability / capital stickiness / liquidity depth).
    tcpTopScoredSub: `Top 5 retail-accessible pools ranked by quantitative stability, fee sustainability, capital stickiness and liquidity depth. No permissioned or accredited-only vaults.`,
    // title="" tooltip on the lock icon next to a permissioned pool's name.
    tcpRestrictedAccessTitle: 'Restricted access (KYC/accredited)',
    // aria-label of the language switcher <nav>.
    tcpLanguageLabel: 'Language',
    // Visible label of a pool-type category link (the app's poolTypes taxonomy
    // value is also the link's query param and is NEVER translated — only the
    // anchor text is). EN/KO keep the taxonomy value byte-for-byte.
    tcpPoolTypeLabel: (type) => type,
    // --- protocol pages (generate-protocol-pages.js, W4) ---
    prpTitle: (name) => `${name} yields: DeFi Score, 14-day forecast | DeFi Garden`,
    prpTitleShort: (name) => `${name} yields | DeFi Garden`,
    prpH1: (name) => `${name} yields: DeFi Score and 14-day forecast by pool`,
    prpDescription: (name, n, chains, tvl, apy, date) => `${name}: ${n} scored pools on ${chains} ${Number(String(chains).replace(/,/g, '')) === 1 ? 'chain' : 'chains'}, ${tvl} TVL, median APY ${apy}. DeFi Score and 14-day forecast range per pool. Data as of ${date}.`,
    prpSummary: (name, n, chains, tvl, date) => `As of ${date}, DeFi Garden scores ${n} ${name} pools across ${chains} ${Number(String(chains).replace(/,/g, '')) === 1 ? 'chain' : 'chains'}, with ${tvl} in combined TVL.`,
    prpSummaryApy: (apy) => `The median APY across these pools is ${apy}.`,
    prpSummaryForecast: (fc) => `The median 14-day central forecast is ${fc}.`,
    prpTypesLine: (list) => `Pool types present: ${list}.`,
    prpBreadcrumbProtocols: 'Protocols',
    prpStatPools: 'Scored pools',
    prpStatChains: 'Chains',
    prpStatTvl: 'Total TVL',
    prpStatMedApy: 'Median APY',
    prpStatMedForecast: 'Median 14-day forecast',
    prpRatingHeading: 'Rating distribution',
    prpRatingLead: (name, n) => `How the ${n} scored ${name} pools are distributed across DeFi Garden's score bands.`,
    prpRatingNote: "Bands (AAA, AA, A, BBB, HIGH RISK) are DeFi Garden's own model output, not a credit rating from a registered credit rating agency. The distribution describes yield quality as modelled, not the protocol's security record.",
    prpMethodologyLink: 'How the DeFi Score and forecast work →',
    prpPoolsHeading: 'Scored pools',
    prpPoolsCap: (shown, total) => `Showing the ${shown} largest of ${total} pools by TVL.`,
    prpPoolsAll: 'See all in the app →',
    prpColPool: 'Pool',
    prpColChain: 'Chain',
    prpColType: 'Type',
    prpColApy: 'APY now',
    prpColRange: '14-day range',
    prpColCentral: '14-day central',
    prpColScore: 'DeFi Score',
    prpColTiers: 'Pillar tiers',
    prpColTvl: 'TVL',
    prpColCount: 'Pools',
    prpColMedApy: 'Median APY',
    prpTiersLegend: 'Pillar tiers, in order: yield stability, sustainability, capital stickiness, exit liquidity. H = High, M = Medium, L = Low.',
    prpTierLetterHigh: 'H',
    prpTierLetterMedium: 'M',
    prpTierLetterLow: 'L',
    prpByChain: 'By chain',
    prpByType: 'By pool type',
    prpAccessLead: (name) => `${name} is on DeFi Garden's list of permissioned projects. The pools below are shown for information, not as options open to everyone.`,
    prpDisclaimer: 'Figures come from DefiLlama pool data; scores and forecasts are computed by DeFi Garden and can be wrong.',
    prpDataNote: (date) => `Data as of ${date}. Source: DefiLlama; pools below the TVL floor or above the APY sanity limit are excluded.`,
    prpLinkFromPool: (name) => `Protocol: ${name} →`,
    prpHubTitle: 'DeFi protocols: DeFi Score and yields | DeFi Garden',
    prpHubH1: 'DeFi protocols by DeFi Score and yield',
    prpHubDescription: (n) => `${n} DeFi protocols with their DeFi Score distribution, median APY and 14-day forecast, from DefiLlama data. Education, not advice.`,
    prpHubIntro: (n, minPools, minTvl) => `${n} protocols with at least ${minPools} scored pools and ${minTvl} in combined TVL, ranked by TVL. Pages exist only for protocols that clear both bars.`,
    prpColProtocol: 'Protocol',
    prpColMix: 'Rating mix',
    prpColAccess: 'Access',
    prpAccessPermissioned: 'Permissioned',
    prpAccessOpen: '—',
    prpHubLinkFromPools: 'Browse protocols →'
  },
  ko: {
    tcpMonthYear: (monthShortEn, month, year) => `${year}년 ${month}월`,
    tcpTopScoredHeading: (subject) => `${subject} 리스크 평가 최고 등급 풀 (DeFi Score)`,
    tcpTopScoredSub: `수익 안정성, 수수료 지속가능성, 자금 고착도, 유동성 깊이 기준 상위 5개 풀입니다. 누구나 접근 가능한 공개 풀만 포함됩니다.`,
    // Pre-existing: the tooltip was hard-coded English on every language
    // variant, KO included. Kept byte-identical here (not a regression).
    tcpRestrictedAccessTitle: 'Restricted access (KYC/accredited)',
    tcpLanguageLabel: '언어',
    tcpPoolTypeLabel: (type) => type,
    // --- 프로토콜 페이지 (generate-protocol-pages.js, W4) ---
    prpTitle: (name) => `${name} 수익률: DeFi Score, 14일 전망 | DeFi Garden`,
    prpTitleShort: (name) => `${name} 수익률 | DeFi Garden`,
    prpH1: (name) => `${name} 수익률: 풀별 DeFi Score와 14일 전망`,
    prpDescription: (name, n, chains, tvl, apy, date) => `${name}: ${chains}개 체인의 평가 풀 ${n}개, TVL ${tvl}, 중앙값 APY ${apy}. 풀별 DeFi Score와 14일 전망 범위. 데이터 기준일 ${date}.`,
    prpSummary: (name, n, chains, tvl, date) => `${date} 기준, DeFi Garden은 ${chains}개 체인의 ${name} 풀 ${n}개를 평가하며 총 TVL은 ${tvl}입니다.`,
    prpSummaryApy: (apy) => `이 풀들의 APY 중앙값은 ${apy}입니다.`,
    prpSummaryForecast: (fc) => `14일 중앙 전망의 중앙값은 ${fc}입니다.`,
    prpTypesLine: (list) => `포함된 풀 유형: ${list}.`,
    prpBreadcrumbProtocols: '프로토콜',
    prpStatPools: '평가된 풀',
    prpStatChains: '체인',
    prpStatTvl: '총 TVL',
    prpStatMedApy: 'APY 중앙값',
    prpStatMedForecast: '14일 전망 중앙값',
    prpRatingHeading: '등급 분포',
    prpRatingLead: (name, n) => `평가된 ${name} 풀 ${n}개가 DeFi Garden 점수 등급에 어떻게 분포하는지 보여줍니다.`,
    prpRatingNote: '등급(AAA, AA, A, BBB, HIGH RISK)은 DeFi Garden 자체 모델의 산출물이며, 등록된 신용평가기관의 신용등급이 아닙니다. 이 분포는 모델이 본 수익 품질을 나타낼 뿐, 프로토콜의 보안 이력을 설명하지 않습니다.',
    prpMethodologyLink: 'DeFi Score와 전망의 원리 →',
    prpPoolsHeading: '평가된 풀',
    prpPoolsCap: (shown, total) => `TVL 기준 상위 ${shown}개(전체 ${total}개)를 표시합니다.`,
    prpPoolsAll: '앱에서 전체 보기 →',
    prpColPool: '풀',
    prpColChain: '체인',
    prpColType: '유형',
    prpColApy: '현재 APY',
    prpColRange: '14일 범위',
    prpColCentral: '14일 중앙값',
    prpColScore: 'DeFi Score',
    prpColTiers: '지표 단계',
    prpColTvl: 'TVL',
    prpColCount: '풀 수',
    prpColMedApy: 'APY 중앙값',
    prpTiersLegend: '지표 단계 순서: 수익 안정성, 지속 가능성, 자본 유지력, 출금 유동성. 높=높음, 중=보통, 낮=낮음.',
    prpTierLetterHigh: '높',
    prpTierLetterMedium: '중',
    prpTierLetterLow: '낮',
    prpByChain: '체인별',
    prpByType: '풀 유형별',
    prpAccessLead: (name) => `${name}은(는) DeFi Garden의 허가형 프로젝트 목록에 있습니다. 아래 풀은 모든 사용자가 이용할 수 있는 선택지가 아니라 정보 제공용입니다.`,
    prpDisclaimer: '수치는 DefiLlama 풀 데이터이며, 점수와 전망은 DeFi Garden이 계산한 것으로 틀릴 수 있습니다.',
    prpDataNote: (date) => `데이터 기준일 ${date}. 출처: DefiLlama. TVL 하한 미만이거나 APY 상한을 넘는 풀은 제외됩니다.`,
    prpLinkFromPool: (name) => `프로토콜: ${name} →`,
    prpHubTitle: 'DeFi 프로토콜: DeFi Score와 수익률 | DeFi Garden',
    prpHubH1: 'DeFi Score와 수익률로 본 DeFi 프로토콜',
    prpHubDescription: (n) => `DefiLlama 데이터 기반 DeFi 프로토콜 ${n}개의 DeFi Score 분포, APY 중앙값, 14일 전망. 교육 목적이며 투자 조언이 아닙니다.`,
    prpHubIntro: (n, minPools, minTvl) => `평가된 풀이 ${minPools}개 이상이고 총 TVL이 ${minTvl} 이상인 프로토콜 ${n}개를 TVL 순으로 보여줍니다. 두 기준을 모두 충족한 프로토콜만 페이지가 있습니다.`,
    prpColProtocol: '프로토콜',
    prpColMix: '등급 구성',
    prpColAccess: '접근',
    prpAccessPermissioned: '허가형',
    prpAccessOpen: '—',
    prpHubLinkFromPools: '프로토콜 보기 →'
  }
};
