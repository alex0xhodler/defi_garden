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
    tcpPoolTypeLabel: (type) => type
  },
  ko: {
    tcpMonthYear: (monthShortEn, month, year) => `${year}년 ${month}월`,
    tcpTopScoredHeading: (subject) => `${subject} 리스크 평가 최고 등급 풀 (DeFi Score)`,
    tcpTopScoredSub: `수익 안정성, 수수료 지속가능성, 자금 고착도, 유동성 깊이 기준 상위 5개 풀입니다. 누구나 접근 가능한 공개 풀만 포함됩니다.`,
    // Pre-existing: the tooltip was hard-coded English on every language
    // variant, KO included. Kept byte-identical here (not a regression).
    tcpRestrictedAccessTitle: 'Restricted access (KYC/accredited)',
    tcpLanguageLabel: '언어',
    tcpPoolTypeLabel: (type) => type
  }
};
