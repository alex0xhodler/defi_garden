'use strict';

/**
 * languages.js — the ONE ordered list of languages the STATIC SEO estate
 * (tokens/, chains/, pools/ pages + their hubs + sitemaps) is generated in.
 *
 * Node-only (CommonJS, required by the generators / sitemap / indexnow
 * scripts). It is NEVER loaded in a browser and is deliberately not referenced
 * from home.html / plan.html / translations.js: the interactive app stays
 * EN/KO and its browser bundle must not grow because the static estate gained
 * languages (test_i18n_pt_es_static.js enforces both).
 *
 * Fields
 *   code        stable id; also the dictionary key and the on-disk dir name
 *   pathPrefix  URL/dir prefix ('' for the default language, else '/<code>')
 *   htmlLang    value of <html lang>
 *   hreflang    value of <link rel="alternate" hreflang>
 *   ogLocale    og:locale value (not emitted by the generators today; kept so
 *               the mapping lives in one place if/when they start to)
 *   label       the language's own name (used as the switcher link's title)
 *   short       the compact switcher label
 *   scope       'all'  - every page the EN estate generates (thin, noindexed
 *                        token pages included)
 *                'head' - only pages that are indexable: token pages with
 *                        qualifyingCount >= NOINDEX_POOL_THRESHOLD; chain,
 *                        pool and hub pages exist for every EN page. A 'head'
 *                        language never gets a noindexed thin page and never
 *                        gets a Markdown twin.
 */
const LANGUAGES = Object.freeze([
  { code: 'en', pathPrefix: '',    htmlLang: 'en',    hreflang: 'en', ogLocale: 'en_US', label: 'English',   short: 'EN', scope: 'all'  },
  { code: 'ko', pathPrefix: '/ko', htmlLang: 'ko',    hreflang: 'ko', ogLocale: 'ko_KR', label: '한국어',     short: 'KO', scope: 'all'  },
  { code: 'pt', pathPrefix: '/pt', htmlLang: 'pt-BR', hreflang: 'pt', ogLocale: 'pt_BR', label: 'Português', short: 'PT', scope: 'head' },
  { code: 'es', pathPrefix: '/es', htmlLang: 'es',    hreflang: 'es', ogLocale: 'es_ES', label: 'Español',   short: 'ES', scope: 'head' }
].map(l => Object.freeze(l)));

const DEFAULT_LANG = 'en';
const BY_CODE = new Map(LANGUAGES.map(l => [l.code, l]));

const LANG_CODES = Object.freeze(LANGUAGES.map(l => l.code));
/** Languages generated for every page the EN estate generates. */
const FULL_SCOPE_CODES = Object.freeze(LANGUAGES.filter(l => l.scope === 'all').map(l => l.code));
/** Languages generated only for indexable pages. */
const HEAD_SCOPE_CODES = Object.freeze(LANGUAGES.filter(l => l.scope === 'head').map(l => l.code));

/** The language record for `code`; anything unknown resolves to the default
 *  (EN) — the same normalisation the generators used to spell as
 *  `(lang === 'ko') ? 'ko' : 'en'`. */
function getLanguage(code) {
  return BY_CODE.get(code) || BY_CODE.get(DEFAULT_LANG);
}

/** Normalised language code (unknown / undefined -> 'en'). */
function normalizeLang(code) {
  return getLanguage(code).code;
}

function isHeadScope(code) {
  return getLanguage(code).scope === 'head';
}

/** '/ko' + '/tokens/usdc' -> '/ko/tokens/usdc'; EN returns the path untouched. */
function langPath(code, neutralPath) {
  return getLanguage(code).pathPrefix + (neutralPath || '');
}

/** Absolute URL of the `code` version of a language-neutral page path
 *  (e.g. langUrl(SITE_URL, 'pt', '/chains/ethereum')). */
function langUrl(siteUrl, code, neutralPath) {
  return String(siteUrl).replace(/\/$/, '') + langPath(code, neutralPath);
}

/** On-disk directory prefix ('' for EN, 'ko' / 'pt' / 'es' otherwise). */
function langDir(code) {
  return getLanguage(code).pathPrefix.replace(/^\//, '');
}

/** `codes` filtered to known languages, de-duplicated, in config order. */
function orderCodes(codes) {
  const want = new Set(codes || []);
  return LANGUAGES.filter(l => want.has(l.code)).map(l => l.code);
}

module.exports = {
  LANGUAGES, LANG_CODES, FULL_SCOPE_CODES, HEAD_SCOPE_CODES, DEFAULT_LANG,
  getLanguage, normalizeLang, isHeadScope, langPath, langUrl, langDir, orderCodes
};
