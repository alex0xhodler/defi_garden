'use strict';

/**
 * i18n/index.js — Node-only translation lookup for the STATIC SEO generators
 * (generate-token-pages.js / generate-chain-pages.js / generate-pool-score-pages.js).
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT A CHANGE TO translations.js
 * translations.js is also shipped to browsers (translations.min.js). The
 * Portuguese / Spanish static-page dictionaries and the generator-only EN/KO
 * strings must add ZERO bytes to that bundle, so translations.js is left
 * untouched and this module (Node-only, never referenced from home.html /
 * plan.html) layers on top of it:
 *
 *   en / ko   translations.js (the shared catalog)  +  i18n/static-en-ko.js
 *             (generator-only keys the browser never needs)
 *   pt / es   i18n/pt.js / i18n/es.js  (flat { key: string | function })
 *
 * LOOKUP (identical semantics to translations.js's createTranslationFunction)
 *   1. the language's own entry, if truthy
 *   2. else the EN entry for that key (per key, so a half-translated
 *      dictionary degrades to English rather than rendering a raw key)
 *   3. else the key itself
 * Function-valued entries receive the call's params; numeric params are pinned
 * en-US by formatCount (CLAUDE.md number-formatting rule — translations never
 * localise digits or separators).
 *
 * DOTTED KEYS
 * The generators also need a few strings that live in translations.js's nested
 * namespaces (`landing.navSearch`, `planner.ladderClaude`). They are addressed
 * as 'ns.key'. en/ko resolve them from the nested catalog (a literal flat key
 * of the same spelling wins, as 'yieldCard.fundedSuffix' does today); pt/es
 * dictionaries simply carry them as flat 'ns.key' entries.
 */

const { translations, formatCount } = require('../translations.js');
const { normalizeLang } = require('../languages.js');
const staticEnKo = require('./static-en-ko.js');

const DICTIONARIES = {};

function loadOwn(code) {
  if (code === 'en' || code === 'ko') return translations[code];
  if (!DICTIONARIES[code]) DICTIONARIES[code] = require('./' + code + '.js');
  return DICTIONARIES[code];
}

function loadExtra(code) {
  return staticEnKo[code] || null;
}

/** Raw entry for `key` in language `code`'s own dictionary, or undefined. */
function ownEntry(code, key) {
  const own = loadOwn(code);
  if (own[key]) return own[key];
  const extra = loadExtra(code);
  if (extra && extra[key]) return extra[key];
  if (code === 'en' || code === 'ko') {
    const dot = key.indexOf('.');
    if (dot > 0) {
      const ns = own[key.slice(0, dot)];
      if (ns && typeof ns === 'object' && ns[key.slice(dot + 1)]) return ns[key.slice(dot + 1)];
    }
  }
  return undefined;
}

let tracer = null;
/** Test/inventory hook: fn(languageCode, key) is called for every t() lookup. */
function setLookupTracer(fn) { tracer = typeof fn === 'function' ? fn : null; }

function createTranslationFunction(language) {
  const code = normalizeLang(language);
  return function t(key, ...params) {
    if (tracer) tracer(code, key);
    const mappedParams = params.map(formatCount);
    let entry = ownEntry(code, key);
    if (entry === undefined && code !== 'en') entry = ownEntry('en', key);
    if (entry === undefined) return key;
    return typeof entry === 'function' ? entry(...mappedParams) : entry;
  };
}

/** Every key that has an entry for `code` (en/ko: catalog + static extras,
 *  flat keys only; pt/es: the dictionary). Used by the inventory script/tests. */
function dictionaryKeys(code) {
  const c = normalizeLang(code);
  const keys = new Set(Object.keys(loadOwn(c)));
  const extra = loadExtra(c);
  if (extra) Object.keys(extra).forEach(k => keys.add(k));
  return keys;
}

module.exports = {
  createTranslationFunction, setLookupTracer, dictionaryKeys, ownEntry,
  translations, formatCount
};
